const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractPdf, chunkPages } = require('../../src/services/document-indexing');
const { createEmbeddings, DIMENSIONS, MODEL } = require('../../src/services/document-embeddings');
const pdfFixture = require('./pdf-fixture.cjs');

test('real PDF extraction preserves pages and chunking preserves citations and overlap', async () => {
  const pages = await extractPdf(pdfFixture(['Follow-up appointment in two weeks.', 'Bring your insurance card.']));
  assert.equal(pages.length, 2);
  assert.equal(pages[0].pageNumber, 1);
  assert.match(pages[0].text, /two weeks/);
  assert.match(pages[1].text, /insurance/);
  const chunks = await chunkPages([{ pageNumber: 7, text: 'a'.repeat(3500) }]);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every(chunk => chunk.pageNumber === 7 && chunk.text.length <= 1800));
  assert.deepEqual(chunks.map(chunk => chunk.chunkIndex), [0, 1, 2]);
  assert.ok(chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) > 3500);
});

test('blank, malformed, over-limit and aborted PDFs fail explicitly', async () => {
  await assert.rejects(extractPdf(pdfFixture([''])), { code: 'no_extractable_text' });
  await assert.rejects(extractPdf(Buffer.from('%PDF-invalid')), { code: 'invalid_pdf' });
  await assert.rejects(extractPdf(pdfFixture(Array(101).fill('Page'))), { code: 'document_too_large' });
  await assert.rejects(extractPdf(pdfFixture(), { signal: AbortSignal.abort() }), { code: 'processing_timeout' });
  await assert.rejects(chunkPages([{ pageNumber: 1, text: 'a'.repeat(400000) }]), { code: 'document_too_large' });
});

test('OpenAI adapter pins the model and dimensions, restores order, and validates vectors', async () => {
  let args;
  const vector = Array(DIMENSIONS).fill(0); vector[0] = 1;
  const adapter = createEmbeddings({ client: { embeddings: { async create(input, options) {
    args = { input, options };
    return { data: [{ index: 1, embedding: vector }, { index: 0, embedding: vector }] };
  } } } });
  const signal = AbortSignal.timeout(1000);
  assert.equal((await adapter.embed(['one', 'two'], { signal })).length, 2);
  assert.equal(args.input.model, MODEL);
  assert.equal(args.input.dimensions, DIMENSIONS);
  assert.equal(args.options.signal, signal);
  const bad = createEmbeddings({ client: { embeddings: { async create() { return { data: [{ index: 0, embedding: [1, 2] }] }; } } } });
  await assert.rejects(bad.embed(['one']), { code: 'embedding_unavailable' });
  const unavailable = createEmbeddings({ client: { embeddings: { async create() { throw new Error('secret upstream data'); } } } });
  await assert.rejects(unavailable.embed(['one']), error => error.code === 'embedding_unavailable' && !error.message.includes('secret'));
});

test('missing OpenAI configuration produces a safe processing error without a request', async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(createEmbeddings().embed(['Sample text']), { code: 'embedding_not_configured' });
  } finally {
    if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
  }
});
