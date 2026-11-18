# Nurture API contract

This is the contract between the client and the server. Until the backend is ready, the client will run a mock of this API in the browser, so both sides build against this document. If you change the API, update this document in the same pull request, along with the client's mock and types.

## Data model

Caregivers and the people they care for are many-to-many, joined through **care circles**. A circle is the unit of sharing. Documents may additionally restrict access to selected members.

```
User ──< Membership >── Circle ──< Recipient
           role                      │
                                     └──< CareRelationship >── User
```

| Entity | What it is | Key fields |
| --- | --- | --- |
| **User** | Someone with a login: a caregiver. | `id`, `name`, `email` (unique), `phone`, `timeZone`, password hash |
| **Circle** | A group that shares care, such as "Alvarez family". | `id`, `name`, `createdAt` |
| **Membership** | Joins a user to a circle. A user can be in many circles, and a circle has many users. | `circleId`, `userId`, `role` (`owner` or `member`), `joinedAt`. Unique on (`circleId`, `userId`). |
| **Recipient** | A person being cared for. Belongs to exactly one circle; a circle can have several (for example, two grandparents). Not a user, because many recipients never log in. | `id`, `circleId`, `name`, `preferredName`, `dateOfBirth`, `notes`, `createdAt` |
| **CareRelationship** | Optional label for how one caregiver relates to one recipient: Daniel is Rose's child and Frank's child-in-law. For display only; it never grants access. | `userId`, `recipientId`, `relationship`. Unique on (`userId`, `recipientId`). |

Rules:

- **Access comes from membership.** A member of a circle can read and write its care data, except documents, which use the document permissions below. A non-member can't tell the circle exists (requests return 404, not 403).
- **Owners** can also rename the circle and, later, manage members. Every circle has at least one owner. The user who creates a circle is its owner.
- **Where care data lives:** medications, appointments, tasks, expenses, and documents belong to a recipient. Messages and budgets belong to the circle.
- **Not in scope yet:** invites, removing members, leaving or deleting a circle, finer-grained roles (such as view-only), and linking a recipient to their own user account. The model leaves room for each without restructuring.

## Conventions

- JSON in and out, except document uploads (multipart) and file retrieval (binary). Every path starts with `/api`.
- Auth uses a bearer token: `Authorization: Bearer <token>`. Login and registration return the token. A user can have several tokens at once, one per device, and logging out ends only the current one.
- Emails are trimmed and lowercased before they are stored or compared.
- IDs are opaque strings. Timestamps are ISO 8601 strings in UTC.
- Every error uses this shape. The client shows `message` to the user directly, so write it as plain, specific text that says how to fix the problem:

```json
{ "error": { "code": "email_taken", "message": "That email already has an account. Log in instead, or use a different email." } }
```

## Types

```ts
type User = {
  id: string
  name: string
  email: string
  // Visible to everyone who shares a circle with this user, so the family can reach them.
  phone: string | null // as entered, trimmed: 7-20 characters of digits, spaces, and + - ( )
  timeZone: string | null // IANA name, such as "America/New_York". Null until the user sets it.
}

type Role = 'owner' | 'member'

// How the signed-in user relates to a recipient ("Rose is my grandparent").
type Relationship = 'parent' | 'grandparent' | 'spouse' | 'sibling' | 'child' | 'friend' | 'other'

type Recipient = {
  id: string
  name: string
  preferredName: string | null // what the family calls them, such as "Grandma Rose"; 1-80 characters
  dateOfBirth: string | null // YYYY-MM-DD calendar date, from 1900-01-01 up to today
  notes: string | null // up to 500 characters of free text for the family; not a medical record
  // The signed-in user's own label for this recipient, if they set one.
  relationship: Relationship | null
}

// What the signed-in user sees for each of their circles.
type CircleSummary = {
  id: string
  name: string
  role: Role // the signed-in user's role in this circle
  recipients: Recipient[]
}

type Member = {
  user: User
  role: Role
  joinedAt: string
  // This member's labels for the circle's recipients, keyed by recipient id. Missing means no label.
  relationships: Record<string, Relationship>
}

type CircleDetail = CircleSummary & { members: Member[] }

type Session = { user: User; circles: CircleSummary[] }


type Appointment = {
  id: string
  recipientId: string
  title: string
  startsAt: string // UTC timestamp
  location: string | null
  assignedCaregiverId: string | null // null means unassigned
}

type MedicationOccurrence = {
  id: string // unique to this occurrence
  medicationId: string
  recipientId: string
  name: string
  dosage: string // display text supplied by the care-management feature
  scheduledAt: string // UTC timestamp
  status: 'pending' | 'completed'
}

type CareTask = {
  id: string
  recipientId: string
  title: string
  dueAt: string | null // UTC timestamp, or no due date
  assignedCaregiverId: string | null
  status: 'pending' | 'completed'
  completedAt: string | null // non-null exactly when status is completed
}

type ExpenseCategory =
  | 'medication' | 'appointment' | 'insurance' | 'utilities' | 'other'

type Expense = {
  id: string
  recipientId: string
  description: string
  category: ExpenseCategory
  amountCents: number // positive integer; sum integer cents, not floating-point dollars
  currency: 'USD' // initial mock supports USD only
  incurredOn: string // YYYY-MM-DD calendar date, not a UTC timestamp
}

type CreateExpenseRequest = Omit<Expense, 'id'>

// At least one field is required. Omitted fields keep their existing values.
type UpdateExpenseRequest = Partial<CreateExpenseRequest>

type DocumentCategory = 'medical' | 'insurance' | 'financial' | 'personal' | 'other'

type DocumentSharing =
  | { mode: 'circle'; memberIds: [] }
  | { mode: 'selected'; memberIds: string[] }

type CareDocument = {
  id: string
  recipientId: string
  title: string
  category: DocumentCategory
  fileName: string // original filename, for display only
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png'
  sizeBytes: number
  uploadedBy: string | null // null if the uploader's account was deleted
  uploadedAt: string
  sharing: DocumentSharing
  canManage: boolean // computed for the signed-in user; never accepted as input
}

type CreateDocumentRequest = {
  recipientId: string
  title: string // trimmed, 1-200 characters
  category: DocumentCategory
  sharing: DocumentSharing
}

// At least one field; a supplied sharing object replaces the entire sharing rule.
type UpdateDocumentRequest = Partial<Pick<CreateDocumentRequest, 'title' | 'category' | 'sharing'>>
```

A new user has `circles: []`. The client sends them through setup: their own profile (`PATCH /api/users/me`), then their first circle and recipient (`POST /api/circles`).

`RecipientInput` is the body for creating a recipient. Optional text fields are trimmed, and an empty string is stored as `null`.

```ts
type RecipientInput = {
  name: string // 1-80 characters
  preferredName: string | null
  dateOfBirth: string | null
  notes: string | null
  relationship: Relationship | null // saved as the signed-in user's own label
}
```

## Endpoints

### Auth

#### `POST /api/auth/register`

Body: `{ name, email, password }`. `name` is 1-80 characters and `password` is 8-128 characters.

| Status | Body |
| --- | --- |
| 201 | `Session & { token }`. `circles` is always `[]`, and `phone` and `timeZone` are `null`. |
| 400 | `validation_error` |
| 409 | `email_taken` |

#### `POST /api/auth/login`

Body: `{ email, password }`

| Status | Body |
| --- | --- |
| 200 | `Session & { token }` |
| 400 | `validation_error` |
| 401 | `invalid_credentials` (use the same error for an unknown email and a wrong password) |

#### `GET /api/auth/me`

Requires auth.

| Status | Body |
| --- | --- |
| 200 | `Session` |
| 401 | `unauthorized`. The client clears its token and sends the user to log in. |

#### `POST /api/auth/logout`

Requires auth. Ends the current token only. Returns **204** with no body. It's fine to return 204 for an already-invalid token.

### Users

#### `PATCH /api/users/me`

Requires auth. Updates the signed-in user's own profile. Send only the fields to change: `name` (1-80 characters), `phone` (or `null` to clear it), and `timeZone` (an IANA time zone name, or `null`).

| Status | Body |
| --- | --- |
| 200 | `{ user: User }` |
| 400 | `validation_error` |
| 401 | `unauthorized` |

### Circles

Every endpoint below requires auth and returns `401 unauthorized` without it. Any endpoint with a `:circleId` returns `404 not_found` if the circle doesn't exist or the user isn't a member.

#### `POST /api/circles`

Creates a circle with its first recipient, and makes the signed-in user its owner. This is step 2 of registration, and also how an existing user starts another circle.

Body:

```ts
{
  name: string // 1-80 characters, for example "Alvarez family"
  recipient: RecipientInput
}
```

| Status | Body |
| --- | --- |
| 201 | `{ circle: CircleSummary }` |
| 400 | `validation_error` |

#### `GET /api/circles/:circleId`

| Status | Body |
| --- | --- |
| 200 | `{ circle: CircleDetail }` |
| 404 | `not_found` |

#### `PATCH /api/circles/:circleId`

Owner only. Body: `{ name }`, 1-80 characters.

| Status | Body |
| --- | --- |
| 200 | `{ circle: CircleSummary }` |
| 400 | `validation_error` |
| 403 | `owner_only` |
| 404 | `not_found` |

### Recipients

#### `POST /api/circles/:circleId/recipients`

Any member can add someone the circle cares for.

Body: `RecipientInput`. The relationship is saved as the signed-in user's own label.

| Status | Body |
| --- | --- |
| 201 | `{ recipient: Recipient }` |
| 400 | `validation_error` |
| 404 | `not_found` |

#### `PUT /api/circles/:circleId/recipients/:recipientId/relationship`

Sets or clears the signed-in user's own label for a recipient. Each member manages only their own labels.

Body: `{ relationship }`, a `Relationship` or `null`.

| Status | Body |
| --- | --- |
| 200 | `{ recipient: Recipient }` |
| 400 | `validation_error` |
| 404 | `not_found` (also when the recipient isn't in this circle) |

### Care resources

These read-only endpoints are specified for the initial dashboard; implementation is pending.
The dashboard uses the existing session and circle endpoints for user, recipient, and member names.

All endpoints require auth and circle membership (`401 unauthorized` / `404 not_found`).
Optional `recipientId` filters to one recipient in the circle; a missing or out-of-circle
recipient returns `404 not_found`. Omit it to include all recipients. Check access before
validating filters.

Date bounds are inclusive at the start and exclusive at the end. Timestamp filters use
UTC ISO 8601 strings ending in `Z`; date filters use `YYYY-MM-DD`. When both bounds are
provided, the start must precede the end. Invalid or unsupported filters return
`400 validation_error`. The client converts local calendar boundaries to UTC.

Lists return all matching records for the initial mock, without pagination. Empty lists
return `[]`. Equal sort values are ordered by ID ascending. Recipient and assigned
caregiver IDs refer to the selected circle's recipients and member user IDs.

#### `GET /api/circles/:circleId/appointments`

Query: `{ from, to, recipientId? }`. `from` and `to` are required timestamps filtering
`startsAt`. Returns non-cancelled appointments, sorted by `startsAt` ascending.

| Status | Body |
| --- | --- |
| 200 | `{ appointments: Appointment[] }` |
| 400 | `validation_error` |
| 404 | `not_found` |

#### `GET /api/circles/:circleId/medication-occurrences`

Query: `{ from, to, status?, recipientId? }`. `from` and `to` are required timestamps
filtering `scheduledAt`. `status` is `pending` or `completed`; omit for both.
Returns individual scheduled doses, sorted by `scheduledAt` ascending. Medication
and recurring schedule definitions are separate, future resources.

| Status | Body |
| --- | --- |
| 200 | `{ medicationOccurrences: MedicationOccurrence[] }` |
| 400 | `validation_error` |
| 404 | `not_found` |

#### `GET /api/circles/:circleId/tasks`

Query: `{ dueFrom?, dueBefore?, completedFrom?, completedBefore?, status?, recipientId? }`.
Date bounds are timestamps filtering `dueAt` or `completedAt`; omitted bounds are
unbounded. `status` is `pending` or `completed`; omit for both. Filters combine with AND.

Due-date filters exclude undated tasks. Completion-date filters exclude incomplete
tasks and cannot be combined with `status=pending`. Results sort by `dueAt` ascending,
undated tasks last. Overdue means pending with a non-null `dueAt` before the current time.

| Status | Body |
| --- | --- |
| 200 | `{ tasks: CareTask[] }` |
| 400 | `validation_error` |
| 404 | `not_found` |

#### `GET /api/circles/:circleId/expenses`

Query: `{ fromDate, toDate, recipientId?, category? }`. `fromDate` and `toDate` are required
calendar dates filtering `incurredOn`. `category` is an `ExpenseCategory`; omit for all
categories. Filters combine with AND. Results sort by `incurredOn` descending.
The client calculates totals and category summaries from integer `amountCents` values.
The existing date bounds support one-, six-, and twelve-month views without separate endpoints.

| Status | Body |
| --- | --- |
| 200 | `{ expenses: Expense[] }` |
| 400 | `validation_error` |
| 404 | `not_found` |

### Expense mutations

These endpoints and the expense list's category filter are implemented in the browser mock; server implementation is pending.
Any circle member can create, edit, or delete its expenses. All endpoints require auth
(`401 unauthorized`). A missing/inaccessible circle, an expense outside that circle,
or a supplied recipient outside that circle returns `404 not_found`. Check circle
access and, for edits/deletes, expense ownership before validating the body.

Body validation: `description` is trimmed and must be 1-200 characters; `amountCents`
is a positive safe integer; `category` is an `ExpenseCategory`; `currency` must be
`USD`; `incurredOn` is a valid `YYYY-MM-DD` date no later than today in UTC. Both client and server use UTC for this cutoff; future dates return `400 validation_error` on create or update. `recipientId` must be a non-empty
string identifying a recipient in the circle. Null values and unknown fields
(including a client-supplied `id`) return `400 validation_error`. Validation failures
leave saved data unchanged.

#### `POST /api/circles/:circleId/expenses`

Body: `CreateExpenseRequest`. All fields are required. The server generates the ID.

| Status | Body |
| --- | --- |
| 201 | `{ expense: Expense }` |
| 400 | `validation_error` |
| 404 | `not_found` |

#### `PATCH /api/circles/:circleId/expenses/:expenseId`

Body: `UpdateExpenseRequest`. Requires at least one field. Updates only supplied
fields and returns the full saved expense. A changed recipient must remain in the
same circle; the expense ID cannot change.

| Status | Body |
| --- | --- |
| 200 | `{ expense: Expense }` |
| 400 | `validation_error` |
| 404 | `not_found` |

#### `DELETE /api/circles/:circleId/expenses/:expenseId`

No body. Deletes the expense. A missing or already-deleted expense returns `404`.

| Status | Body |
| --- | --- |
| 204 | No body |
| 404 | `not_found` |

### Documents

Contract for the initial document feature; browser mock and server implementation are pending.
Documents belong to one recipient and its circle. The initial file types are PDF, JPEG,
and PNG, with one non-empty file per upload and a maximum of 10 MiB (10,485,760 bytes).
Parsing, content search, and AI summaries are deferred.

All endpoints require auth (`401 unauthorized`). A missing/inaccessible circle,
document, or recipient returns `404 not_found`. Check circle membership and document
access before validating request fields. Never expose restricted document metadata,
counts, search results, or file bytes to unauthorized users.

| User (must currently belong to the circle) | List/view/download | Edit metadata/sharing or delete |
| --- | --- | --- |
| Uploader or circle owner | Yes | Yes |
| Other member, sharing mode `circle` | Yes | No |
| Selected member, sharing mode `selected` | Yes | No |
| Unselected member, sharing mode `selected` | No | No |

Any member can upload for a recipient in the circle. Ownership of the recipient does
not grant additional permissions. The uploader and current circle owners always have
access; the UI must state **“You and circle owners always have access.”**
`canManage` reflects these rules, but the backend must enforce them independently.
An authorized reader attempting to manage a document receives `403 document_manager_only`.

Sharing is explicit on upload; do not silently default an omitted rule to circle-wide
access. `selected` allows an empty list (uploader and owners only). Member IDs must be
unique and identify current members of this circle; unknown/out-of-circle IDs return
`404 not_found`. `circle` requires an empty member list and includes future members.
Uploader/owner IDs need not be selected to retain access.

Removing a member immediately blocks subsequent document requests and removes their
explicit sharing grants, so rejoining does not restore a previous selected-member grant.
Removal does not delete documents they uploaded; circle owners can still manage them.
Downloaded copies cannot be revoked. Future extraction/search must use the same access rules.

Metadata is stored in PostgreSQL; file bytes stay in private storage. Do not return
storage paths or permanent public URLs. Validate actual file contents as well as the
claimed file type, sanitize filenames, and generate storage keys on the server.
Unknown metadata fields and invalid/null required fields return `400 validation_error`.

#### `GET /api/circles/:circleId/documents`

Query: `{ recipientId?, category?, search? }`. Search is a trimmed, case-insensitive
substring match on title or filename (maximum 200 characters; empty means no search).
Filters combine with AND. Only accessible documents are returned, sorted by `uploadedAt`
descending, then ID ascending. No pagination in the initial version.

| Status | Body |
| --- | --- |
| 200 | `{ documents: CareDocument[] }` |
| 400 | `validation_error` |
| 404 | `not_found` |

#### `POST /api/circles/:circleId/documents`

Multipart body: `file` (one binary file) and `metadata` (JSON-encoded `CreateDocumentRequest`).
The server generates the ID, uploader, upload time, and file metadata. Return success
only after both metadata and file storage succeed; clean up partial uploads on failure.

| Status | Body |
| --- | --- |
| 201 | `{ document: CareDocument }` |
| 400 | `validation_error` |
| 404 | `not_found` |
| 413 | `file_too_large` |
| 415 | `unsupported_file_type` |
| 503 | `storage_unavailable` |

#### `GET /api/circles/:circleId/documents/:documentId`

| Status | Body |
| --- | --- |
| 200 | `{ document: CareDocument }` |
| 404 | `not_found` |

#### `GET /api/circles/:circleId/documents/:documentId/file`

Query: `{ disposition? }`, `inline` or `attachment` (default). Recheck access on every
request and stream the file through the authenticated API. Return the validated
`Content-Type`, safe `Content-Disposition`, `Cache-Control: private, no-store`, and
`X-Content-Type-Options: nosniff`. The frontend fetches with its bearer token, then uses
a temporary browser object URL for viewing/downloading and revokes it afterward.

| Status | Body |
| --- | --- |
| 200 | Binary file |
| 400 | `validation_error` |
| 404 | `not_found` (also when stored bytes are missing) |
| 503 | `storage_unavailable` |

#### `PATCH /api/circles/:circleId/documents/:documentId`

Uploader or circle owner only. Body: `UpdateDocumentRequest`. Changes supplied metadata
only; recipient and file bytes cannot be replaced. Failed validation leaves the record
and sharing unchanged. Revoking sharing takes effect on subsequent API requests.

| Status | Body |
| --- | --- |
| 200 | `{ document: CareDocument }` |
| 400 | `validation_error` |
| 403 | `document_manager_only` |
| 404 | `not_found` |

#### `DELETE /api/circles/:circleId/documents/:documentId`

Uploader or circle owner only. Deletes the document and its stored file. Return success
only after deletion completes; failed storage deletion must remain retryable. A missing
or already-deleted document returns `404`.

| Status | Body |
| --- | --- |
| 204 | No body |
| 403 | `document_manager_only` |
| 404 | `not_found` |
| 503 | `storage_unavailable` |

## Planned next

These aren't part of this contract yet, but the model is built for them:

- **Invites:** an owner invites someone by email; accepting creates a `member` membership.
- **Other care-data mutations and schedules:** create/update/delete operations for appointments, medication occurrences, and tasks, plus medication definitions and recurring schedules.
- **Document processing:** parsing and extraction with user review, content search, and source-linked AI summaries.
- **Other resources:** messages, budgets, and patient-assistance notifications. Document lists are only needed on the dashboard if a recent-documents section is added.

## Connecting the real backend

1. In `client/.env.local`, set `VITE_USE_MOCKS=false`.
2. Leave `VITE_API_URL` empty for local development: the Vite dev server proxies `/api` to the Express server on port 3000. In production, set it to the backend origin, for example `https://api.nurture.app`, or leave it empty if the backend is served from the same origin.
3. If the backend is on a different origin, allow the client origin in CORS, including the `Authorization` header.
