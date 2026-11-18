# Documents frontend

`/app/documents` implements layout C: an accessible document list beside file preview,
metadata, and sharing details. The panels stack on smaller screens. Circle selection
uses the same URL parameter as Dashboard and Expenses. Shared navigation lives in
`client/src/layouts/AppHeader.tsx`, used by Dashboard, Expenses, Documents, and the
Appointments route wrapper. The existing appointment preview component remains independent.

The page supports title/filename search, recipient/category filters, PDF/JPEG/PNG uploads
(up to 10 MiB), file viewing/downloading, metadata and sharing edits, and confirmed deletion.
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
- Member-removal cleanup of explicit grants must be implemented with real membership
  operations. Current membership is checked on every mock request.
- The real document backend, durable file storage, and storage failure recovery are not
  implemented. Turning mocks off requires that backend before the page can work.
- Parsing, extracted tasks, content search, and AI summaries are deferred.

## Verification

Run `npm test --prefix client -- --maxWorkers=1`, `npm run build`, and `npm run lint`.
Document tests cover list/file visibility, reader management denial, current membership,
sharing changes, deletion, validation, UI filters, shared navigation, and upload-form errors.
A browser check verifies actual multipart upload with mock storage and responsive layout.
