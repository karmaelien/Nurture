# Documents

`/app/documents` implements layout C: an accessible document list beside file preview,
metadata, and sharing details. The panels stack on smaller screens. Circle selection
uses the same URL parameter as Dashboard and Expenses. Shared navigation lives in
`client/src/layouts/AppHeader.tsx`, used by Dashboard, Expenses, Documents, and the
Appointments route wrapper. The existing appointment preview component remains independent.

The page supports title/filename search, recipient/category filters, PDF/JPEG/PNG uploads
in the shared filter/add toolbar. Upload, edit, and delete use centered popups with
Close/Escape/click-away dismissal while idle and dismissal blocked during a save.
The list remains beside the preview/details panel and has capped scrolling. Shared
page headers, controls, and cards follow the [page design](medications.md#shared-page-design).

Uploads remain limited to PDF/JPEG/PNG files up to 10 MiB. File viewing/downloading,
metadata and sharing edits, and confirmed deletion retain their existing behavior.
Only uploaders and current owners receive editing controls; other authorized members
receive read-only controls. Sharing may include everyone or selected circle members.
The uploader and owners always have access. Restricted documents are omitted from lists
for other members, and the mock independently checks authorization on file and mutation requests.

The frontend uses `api/documents.ts`, React Query, and MSW handlers matching the new
contract. Multipart uploads and authenticated binary downloads use the common request
helper. Browser object URLs are revoked when the preview changes or unmounts. PDF
preview availability depends on the browser; open/download links remain available.

## Current limits

- Mock metadata and bytes live in memory and reset on page reload. A visible demo notice
  asks users to use sample files. This is not secure persistent storage.
- Demo PDFs contain synthetic text, not real medical records.
- The frontend filters the accessible list locally; the mock also accepts API query filters.
- File checks in the browser/mock are basic MIME/size/signature checks. Production must
  independently validate files, enforce permissions, and store bytes privately.
- The backend module is implemented separately from the shared server. The frontend
  still uses mocks until the integration steps below are completed.
- Parsing, extracted tasks, content search, and AI summaries are deferred.

## Verification

Run `npm test --prefix client -- --maxWorkers=1`, `npm run build`, and `npm run lint`.
Document tests cover list/file visibility, reader management denial, current membership,
sharing changes, deletion, validation, UI filters, shared navigation, and upload-form errors.
A browser check verifies actual multipart upload with mock storage and responsive layout.

## Backend

`nurture-api/src/routes/documents.routes.js` stores metadata and the actual file in
PostgreSQL. `care_documents.file_bytes` is a non-null `BYTEA` column with a constraint
requiring its byte length to match `size_bytes` (maximum 10 MiB). Files are stored as
binary bytes, not base64. Metadata/list queries do not select the binary column;
only an authorized file request loads it.

Upload saves metadata, bytes, and sharing grants in one transaction. Deletion removes
all three together. Circle/recipient deletion also cascades the entire document and
its grants, so there are no filesystem objects to clean up. A failed transaction
leaves the database unchanged.

Every operation checks current circle membership. Uploaders and current owners manage
documents; selected members or all members can read according to the sharing setting.
Foreign keys remove explicit grants when a member leaves. Rejoining does not restore
those grants. The server checks file size and MIME signatures; signature checks are
not malware scanning or full document parsing.

### Isolated verification

From the repository root:

```sh
bash nurture-api/tests/documents/run-local.sh
```

Requires PostgreSQL tools on PATH and backend dependencies installed. This starts a fresh
temporary database on port 55440, applies the SQL migrations, exercises the router and
binary database storage, and removes the database on exit. It does not touch your
persistent development database. Override `DOCUMENT_TEST_PORT` if necessary.
Tests supply identity through test-only middleware; production uses `authenticate`.

### Shared server integration

1. Run `npm ci` and `npm run migrate:up` from `nurture-api` against the intended PostgreSQL
   database. The document migration is new and has not been applied to your persistent
   database by this task. If you previously applied its earlier local-file version
   yourself, it needs an explicit data migration before this version can be used;
   rerunning `migrate:up` will not modify an already applied migration.
2. Use the existing `DATABASE_URL` configuration for local or Azure Database for
   PostgreSQL, including the project's TLS settings. No `DOCUMENT_STORAGE_DIR`, Blob
   container, or storage credentials are needed.
3. Mount this router in `src/app.js`, before the final 404 handler:

   ```js
   app.use('/api/circles/:circleId/documents',
     require('./middleware/authenticate'),
     require('./routes/documents.routes')());
   ```

4. Verify with real authenticated accounts before disabling frontend mocks. Confirm
   upload/download, selected-member access, owner management, and member removal.

The frontend API and permissions are unchanged. The frontend currently still uses mocks.
Database backups now include the file contents. This simple approach suits the class
project; files contribute to database size, and uploads/downloads are buffered in memory
with a 10 MiB per-file limit.
