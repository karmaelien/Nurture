# Documents

`/app/documents` uses layout C: a list beside file preview, metadata and sharing details.
The panels stack on smaller screens. Circle selection follows the Dashboard and Expenses
URL parameter. Shared navigation lives in `AppHeader`, rendered once by `AppLayout`.

Uploads accept text PDFs only, up to 10 MiB. The page supports title/filename filters,
preview/download, metadata/sharing edits, deletion, processing status and retry.
Uploaders and current owners manage documents; other authorized members have read-only
access. Metadata edits use optimistic version checks to prevent stale permission changes.

## Storage and processing

PostgreSQL stores original bytes in `care_documents.file_bytes` (`BYTEA`). The
`document_chunks` table stores extracted text, page number, chunk order, model name and
`vector(1536)` embedding. Document/recipient/circle deletion cascades to chunks.
No filesystem storage or separate vector database is needed.

The upload request saves the original and metadata in a transaction, then calls the
indexing service directly. There is no worker or queue. External API calls happen outside
database transactions. The document remains viewable/downloadable if processing fails.

- Extraction: `pdf-parse`, one page at a time, retaining page numbers. No OCR.
- Chunking: `@langchain/textsplitters`, 1,800 characters with 200-character overlap,
  within each page (never mixing citation pages).
- Embeddings: OpenAI `text-embedding-3-small`, explicitly 1,536 dimensions, batches of 16.
- Limits: 100 pages, 200,000 extracted characters, 200 chunks, 60-second processing
  deadline; provider calls time out at 20 seconds with no hidden SDK retries.
- Status: `pending`, `processing`, `ready`, `failed`, plus a safe error code.
- Chunks publish atomically. Retries replace chunks instead of appending duplicates.
  Ready documents return unchanged without another embedding call.
- A database claim rejects overlapping attempts. After two minutes an abandoned claim
  becomes retryable; attempt tokens stop older work from overwriting a newer attempt.
- Title/category/sharing edits never re-embed or change processing status. Processing
  does not increment the metadata-edit version.

Malformed/encrypted PDFs or PDFs without selectable text are saved but marked failed.
Blank and image-only pages in otherwise text-based PDFs are skipped. A PDF signature
check is not a full parser or malware scan; actual parsing happens during indexing.

## Setup

1. Use Node.js 24 and PostgreSQL 16+ with `citext` and `vector` installed. On Azure
   Database for PostgreSQL Flexible Server, allowlist `vector` in `azure.extensions`
   before applying the migration. See [Azure pgvector setup](https://learn.microsoft.com/en-us/azure/postgresql/extensions/how-to-use-pgvector).
2. Run `npm ci` in `nurture-api` and configure `.env` using `.env.example`. Set
   `OPENAI_API_KEY` on the backend only; never put it in a `VITE_` variable. Extracted
   document text is sent to OpenAI for embeddings. Use sample documents for testing.
3. Apply migrations with `npm run migrate:up`. As requested, the existing documents
   migration contains the new schema. If it already ran on your database, editing the
   file does not upgrade that database: arrange a schema update or rebuild disposable
   development data before using this code. Do not reset shared data blindly.
4. Run `npm run dev`. The document router is mounted in `src/app.js` behind `authenticate`.
   No second process is needed.
5. For local frontend integration, set `VITE_USE_MOCKS=false` in `client/.env.local`
   and restart Vite. The default frontend still uses browser mocks; switching this flag
   also requires the other pages' real APIs to be available.

Missing API credentials do not prevent uploads or previews, but indexing reports
`embedding_not_configured`. Configure the key, then
use **Retry processing**. Set the hosting/proxy request timeout above the processing
budget. If a response times out, refresh the document list before uploading again.
Long PDF parsing can still use API CPU; moving this service into a worker is a future
scaling option. No deployed database or hosting settings were changed by this task.

See [RAG handoff](rag-handoff.md) for the stored chunk schema and retrieval requirements for teammates.

## Browser mocks

Mock metadata and files live in memory and reset on reload. Processing is simulated as
ready; no embeddings are generated. The page
labels this demo behavior. No mock request calls OpenAI. Original file previews still
use temporary object URLs; preview caching behavior is unchanged.

## Verification

```sh
npm test --prefix client -- src/features/documents
npm run build --prefix client
npm run lint --prefix client
bash nurture-api/tests/documents/run-local.sh
```

The document runner creates a temporary PostgreSQL database on port 55440, applies the
migrations and deletes it on exit. It never touches your persistent database. Put the
PostgreSQL 16+ tools with pgvector on PATH first; for Postgres.app on this Mac:

```sh
PATH="/Applications/Postgres.app/Contents/Versions/16/bin:$PATH" bash nurture-api/tests/documents/run-local.sh
```

Tests use real PDF extraction and PostgreSQL vector storage with controlled embedding
vectors. They do not call OpenAI or incur charges. They cover page metadata, permissions,
stale edits, failed processing, retries, overlapping attempts, deletion during indexing,
limits and frontend status/retry behavior. The shared Vitest suite additionally checks
the mounted router with real session authentication.
