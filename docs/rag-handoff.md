# RAG handoff

This feature stops at storing chunks and embeddings. No semantic-search endpoint,
question embedding, retrieval service, or answer generation is included.

Your teammate can build retrieval over `document_chunks` using:

| Column | Purpose |
| --- | --- |
| `document_id` | Join to the parent document and its current permissions |
| `content` | Extracted passage text |
| `embedding` | 1,536-dimensional vector |
| `embedding_model` | `text-embedding-3-small`; question embeddings must match |
| `page_number` | 1-based PDF page for citations |
| `chunk_index` | 0-based passage order within the document |

Only retrieve chunks whose parent document has `processing_status = 'ready'`.
Future retrieval must enforce current circle membership and document sharing before
returning passages, and must not trust a client-supplied user ID. The existing document
model illustrates the permission rules. Keep that check dynamic so sharing changes do
not require re-embedding. Metadata edits preserve chunks; deletion cascades to them.

See [Documents](documents.md) for ingestion behavior, setup, processing limits and verification.
