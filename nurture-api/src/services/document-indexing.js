const { PDFParse } = require('pdf-parse');
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { createEmbeddings, validateVectors, ProcessingError, PROCESSING_TIMEOUT_MS } = require('./document-embeddings');

const MAX_PAGES = 100;
const MAX_CHARACTERS = 200_000;
const MAX_CHUNKS = 200;
const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 200;

async function extractPdf(bytes, { signal } = {}) {
  const parser = new PDFParse({ data: new Uint8Array(bytes), isEvalSupported: false });
  const abort = () => { void parser.destroy().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    const info = await parser.getInfo();
    if (info.total > MAX_PAGES) throw new ProcessingError('document_too_large');
    const pages = [];
    let characters = 0;
    // Extract a page at a time so page numbers stay attached to every chunk.
    for (let pageNumber = 1; pageNumber <= info.total; pageNumber++) {
      signal?.throwIfAborted();
      const result = await parser.getText({ partial: [pageNumber] });
      const text = (result.pages[0]?.text ?? '').replace(/\u0000/g, '').trim();
      characters += text.length;
      if (characters > MAX_CHARACTERS) throw new ProcessingError('document_too_large');
      if (text) pages.push({ pageNumber, text });
    }
    if (!pages.length) throw new ProcessingError('no_extractable_text');
    return pages;
  } catch (error) {
    if (signal?.aborted) throw new ProcessingError('processing_timeout');
    if (error instanceof ProcessingError) throw error;
    throw new ProcessingError('invalid_pdf');
  } finally {
    signal?.removeEventListener('abort', abort);
    await parser.destroy().catch(() => {});
  }
}

async function chunkPages(pages) {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP });
  const chunks = [];
  for (const page of pages) {
    for (const text of await splitter.splitText(page.text)) {
      if (text.trim()) chunks.push({ chunkIndex: chunks.length, pageNumber: page.pageNumber, text });
      if (chunks.length > MAX_CHUNKS) throw new ProcessingError('document_too_large');
    }
  }
  if (!chunks.length) throw new ProcessingError('no_extractable_text');
  return chunks;
}

const publicFailures = new Set(['invalid_pdf', 'no_extractable_text', 'document_too_large',
  'embedding_not_configured', 'embedding_unavailable', 'processing_timeout']);

module.exports = function createDocumentIndexing(model, { embeddings = createEmbeddings(), extract = extractPdf } = {}) {
  return {
    async process(circleId, user, documentId) {
      const claim = await model.withCircle(circleId, user, scope => scope.claimProcessing(documentId));
      if (claim.document) return claim.document; // Already ready: no duplicate work or charges.
      const signal = AbortSignal.timeout(PROCESSING_TIMEOUT_MS);
      try {
        const pages = await extract(claim.bytes, { signal });
        signal.throwIfAborted();
        const chunks = await chunkPages(pages);
        for (let start = 0; start < chunks.length; start += 16) {
          signal.throwIfAborted();
          const batch = chunks.slice(start, start + 16);
          const vectors = validateVectors(await embeddings.embed(batch.map(chunk => chunk.text), { signal }), batch.length);
          batch.forEach((chunk, index) => { chunk.embedding = vectors[index]; });
        }
        signal.throwIfAborted();
        // Recheck management permission; never hold a transaction over external calls.
        return await model.withCircle(circleId, user, scope => scope.publishChunks(documentId, claim.token, chunks));
      } catch (error) {
        const code = signal.aborted ? 'processing_timeout' : publicFailures.has(error.code) ? error.code : 'processing_failed';
        await model.failProcessing(documentId, claim.token, code);
        if (error.status) throw error; // Deletion/revocation/superseded processing is not a successful upload.
        return model.withCircle(circleId, user, async scope => scope.wire(await scope.find(documentId)));
      }
    },

  };
};
module.exports.extractPdf = extractPdf;
module.exports.chunkPages = chunkPages;
module.exports.MAX_PAGES = MAX_PAGES;
