const OpenAI = require('openai');

// Ingestion uses this model and dimensionality; teammates must match them for future retrieval.
const MODEL = 'text-embedding-3-small';
const DIMENSIONS = 1536;
const PROCESSING_TIMEOUT_MS = 60_000;
const LEASE_MS = 120_000;

class ProcessingError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function validateVectors(vectors, count) {
  if (!Array.isArray(vectors) || vectors.length !== count || vectors.some(vector =>
    !Array.isArray(vector) || vector.length !== DIMENSIONS ||
    vector.some(value => !Number.isFinite(value)) || !vector.some(value => value !== 0))) {
    throw new ProcessingError('embedding_unavailable');
  }
  return vectors;
}

function createEmbeddings({ client } = {}) {
  return {
    async embed(texts, { signal } = {}) {
      if (!client) {
        if (!process.env.OPENAI_API_KEY) throw new ProcessingError('embedding_not_configured');
        client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 0 });
      }
      try {
        const response = await client.embeddings.create({
          model: MODEL, dimensions: DIMENSIONS, input: texts, encoding_format: 'float',
        }, { signal });
        // Check indices instead of assuming the provider returns inputs in order.
        const ordered = [...response.data].sort((a, b) => a.index - b.index);
        if (ordered.some((item, index) => item.index !== index)) throw new Error('Invalid embedding indices');
        return validateVectors(ordered.map(item => item.embedding), texts.length);
      } catch {
        // Never expose upstream response bodies, credentials, or document text.
        throw new ProcessingError(signal?.aborted ? 'processing_timeout' : 'embedding_unavailable');
      }
    },
  };
}

module.exports = { createEmbeddings, validateVectors, ProcessingError, MODEL, DIMENSIONS, PROCESSING_TIMEOUT_MS, LEASE_MS };
