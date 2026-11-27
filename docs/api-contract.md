# Nurture API contract

This is the contract between the client and the server. Until the backend is ready, the client will run a mock of this API in the browser, so both sides build against this document. If you change the API, update this document in the same pull request, along with the client's mock and types.

## Data model

Caregivers and the people they care for are many-to-many, joined through **care circles**. A circle is the unit of sharing. Documents may additionally restrict access to selected members.

```
User ──< Membership >── Circle ──< Recipient
           role                      │
                                     └──< CareRelationship >── User
```

| Entity               | What it is                                                                                                                                                            | Key fields                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **User**             | Someone with a login: a caregiver.                                                                                                                                    | `id`, `name`, `email` (unique), `phone`, `timeZone`, password hash                                |
| **Circle**           | A group that shares care, such as "Alvarez family".                                                                                                                   | `id`, `name`, `createdAt`                                                                         |
| **Membership**       | Joins a user to a circle. A user can be in many circles, and a circle has many users.                                                                                 | `circleId`, `userId`, `role` (`owner` or `member`), `joinedAt`. Unique on (`circleId`, `userId`). |
| **Recipient**        | A person being cared for. Belongs to exactly one circle; a circle can have several (for example, two grandparents). Not a user, because many recipients never log in. | `id`, `circleId`, `name`, `preferredName`, `dateOfBirth`, `notes`, `createdAt`                    |
| **CareRelationship** | Optional label for how one caregiver relates to one recipient: Daniel is Rose's child and Frank's child-in-law. For display only; it never grants access.             | `userId`, `recipientId`, `relationship`. Unique on (`userId`, `recipientId`).                     |

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
{
  "error": {
    "code": "email_taken",
    "message": "That email already has an account. Log in instead, or use a different email."
  }
}
```

## Types

```ts
type User = {
  id: string;
  name: string;
  email: string;
  // Visible to everyone who shares a circle with this user, so the family can reach them.
  phone: string | null; // as entered, trimmed: 7-20 characters of digits, spaces, and + - ( )
  timeZone: string | null; // IANA name, such as "America/New_York". Null until the user sets it.
};

type Role = "owner" | "member";

// How the signed-in user relates to a recipient ("Rose is my grandparent").
type Relationship =
  | "parent"
  | "grandparent"
  | "spouse"
  | "sibling"
  | "child"
  | "friend"
  | "other";

type Recipient = {
  id: string;
  name: string;
  preferredName: string | null; // what the family calls them, such as "Grandma Rose"; 1-80 characters
  dateOfBirth: string | null; // YYYY-MM-DD calendar date, from 1900-01-01 up to today
  notes: string | null; // up to 500 characters of free text for the family; not a medical record
  // The signed-in user's own label for this recipient, if they set one.
  relationship: Relationship | null;
  // Starts at 1 and goes up by one each time the details above change (not the relationship).
  // Edits send it back so the server can refuse a save based on an out-of-date copy.
  version: number;
};

// What the signed-in user sees for each of their circles.
type CircleSummary = {
  id: string;
  name: string;
  role: Role; // the signed-in user's role in this circle
  recipients: Recipient[];
};

type Member = {
  user: User;
  role: Role;
  joinedAt: string;
  // This member's labels for the circle's recipients, keyed by recipient id. Missing means no label.
  relationships: Record<string, Relationship>;
};

type CircleDetail = CircleSummary & { members: Member[] };

type Session = { user: User; circles: CircleSummary[] };

type Appointment = {
  id: string;
  recipientId: string;
  title: string;
  startsAt: string; // UTC timestamp
  endsAt?: string; // UTC timestamp, when supplied; must be later than startsAt
  status?: "scheduled" | "completed"; // missing means scheduled
  location: string | null;
  assignedCaregiverId: string | null; // null means unassigned
};

type MedicationOccurrence = {
  id: string; // unique to this occurrence
  version: number; // required when changing status; stale versions return 409
  medicationId: string;
  medicationStoppedAt?: string | null; // range response metadata; suppresses reminders
  recipientId: string;
  name: string;
  dosage: string; // display text supplied by the care-management feature
  scheduledAt: string; // UTC timestamp
  status: "pending" | "completed";
  takenAt?: string | null; // time marked taken; null after undo; absent on older records
  overdueAfterMinutes?: number; // pending-dose display grace period; defaults to 30
  reminderBeforeMinutes?: number | null; // 0–1440 minutes before; null/omitted disables
};

type CareTask = {
  id: string;
  recipientId: string;
  title: string;
  dueAt: string | null; // UTC timestamp, or no due date
  assignedCaregiverId: string | null;
  status: "pending" | "completed";
  completedAt: string | null; // non-null exactly when status is completed
};

type ExpenseCategory =
  "medication" | "appointment" | "insurance" | "utilities" | "other";

type Expense = {
  id: string;
  recipientId: string;
  description: string;
  category: ExpenseCategory;
  amountCents: number; // positive integer; sum integer cents, not floating-point dollars
  currency: "USD"; // initial mock supports USD only
  incurredOn: string; // YYYY-MM-DD calendar date, not a UTC timestamp
};

type CreateExpenseRequest = Omit<Expense, "id">;

// At least one field is required. Omitted fields keep their existing values.
type UpdateExpenseRequest = Partial<CreateExpenseRequest>

type DocumentCategory = 'medical' | 'insurance' | 'financial' | 'personal' | 'other'

type DocumentSharing =
  | { mode: 'circle'; memberIds: [] }
  | { mode: 'selected'; memberIds: string[] }

type DocumentProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed'
type DocumentProcessingError =
  | 'invalid_pdf' | 'no_extractable_text' | 'document_too_large'
  | 'embedding_not_configured' | 'embedding_unavailable' | 'processing_timeout'
  | 'processing_interrupted' | 'processing_failed'
// JSON metadata returned by the API. The actual file is stored separately from
// these response fields in care_documents.file_bytes (PostgreSQL BYTEA).
// File bytes are returned only by GET /documents/:documentId/file under the circle path.
type CareDocument = {
  processingStatus: DocumentProcessingStatus
  processingError: DocumentProcessingError | null
  version: number // required on edits; increments after every successful update
  id: string
  recipientId: string
  title: string
  category: DocumentCategory
  fileName: string // original filename, for display only
  mimeType: 'application/pdf'
  sizeBytes: number
  uploadedBy: string | null // null if the uploader's account was deleted
  uploadedAt: string
  sharing: DocumentSharing
  canManage: boolean // computed for the signed-in user; never accepted as input
}

// Metadata part of the multipart upload, JSON-encoded in the `metadata` field.
// The separate `file` part contains raw bytes saved to file_bytes in the same transaction.
type CreateDocumentRequest = {
  recipientId: string
  title: string // trimmed, 1-200 characters
  category: DocumentCategory
  sharing: DocumentSharing
}

// At least one field; a supplied sharing object replaces the entire sharing rule.
type UpdateDocumentRequest = { version: number } & Partial<Pick<CreateDocumentRequest, 'title' | 'category' | 'sharing'>>
```

A new user has `circles: []`. The client sends them through setup: their own profile (`PATCH /api/users/me`), then their first circle and recipient (`POST /api/circles`).

`RecipientInput` is the body for creating a recipient. Optional text fields are trimmed, and an empty string is stored as `null`.

```ts
type RecipientInput = {
  name: string; // 1-80 characters
  preferredName: string | null;
  dateOfBirth: string | null;
  notes: string | null;
  relationship: Relationship | null; // saved as the signed-in user's own label
};
```

## Endpoints

### Auth

#### `POST /api/auth/register`

Body: `{ name, email, password }`. `name` is 1-80 characters and `password` is 8-128 characters.

| Status | Body                                                                                    |
| ------ | --------------------------------------------------------------------------------------- |
| 201    | `Session & { token }`. `circles` is always `[]`, and `phone` and `timeZone` are `null`. |
| 400    | `validation_error`                                                                      |
| 409    | `email_taken`                                                                           |

#### `POST /api/auth/login`

Body: `{ email, password }`

| Status | Body                                                                                 |
| ------ | ------------------------------------------------------------------------------------ |
| 200    | `Session & { token }`                                                                |
| 400    | `validation_error`                                                                   |
| 401    | `invalid_credentials` (use the same error for an unknown email and a wrong password) |

#### `GET /api/auth/me`

Requires auth.

| Status | Body                                                                      |
| ------ | ------------------------------------------------------------------------- |
| 200    | `Session`                                                                 |
| 401    | `unauthorized`. The client clears its token and sends the user to log in. |

#### `POST /api/auth/logout`

Requires auth. Ends the current token only. Returns **204** with no body. It's fine to return 204 for an already-invalid token.

### Users

#### `PATCH /api/users/me`

Requires auth. Updates the signed-in user's own profile. Send only the fields to change: `name` (1-80 characters), `phone` (or `null` to clear it), and `timeZone` (an IANA time zone name, or `null`).

| Status | Body               |
| ------ | ------------------ |
| 200    | `{ user: User }`   |
| 400    | `validation_error` |
| 401    | `unauthorized`     |

### Circles

Every endpoint below requires auth and returns `401 unauthorized` without it. Any endpoint with a `:circleId` returns `404 not_found` if the circle doesn't exist or the user isn't a member.

#### `POST /api/circles`

Creates a circle with its first recipient, and makes the signed-in user its owner. This is step 2 of registration, and also how an existing user starts another circle.

Body:

```ts
{
  name: string; // 1-80 characters, for example "Alvarez family"
  recipient: RecipientInput;
}
```

| Status | Body                        |
| ------ | --------------------------- |
| 201    | `{ circle: CircleSummary }` |
| 400    | `validation_error`          |

#### `GET /api/circles/:circleId`

| Status | Body                       |
| ------ | -------------------------- |
| 200    | `{ circle: CircleDetail }` |
| 404    | `not_found`                |

#### `PATCH /api/circles/:circleId`

Owner only. Body: `{ name }`, 1-80 characters.

| Status | Body                        |
| ------ | --------------------------- |
| 200    | `{ circle: CircleSummary }` |
| 400    | `validation_error`          |
| 403    | `owner_only`                |
| 404    | `not_found`                 |

### Recipients

#### `POST /api/circles/:circleId/recipients`

Any member can add someone the circle cares for.

Body: `RecipientInput`. The relationship is saved as the signed-in user's own label.

| Status | Body                       |
| ------ | -------------------------- |
| 201    | `{ recipient: Recipient }` |
| 400    | `validation_error`         |
| 404    | `not_found`                |

#### `PUT /api/circles/:circleId/recipients/:recipientId/relationship`

Sets or clears the signed-in user's own label for a recipient. Each member manages only their own labels.

Body: `{ relationship }`, a `Relationship` or `null`.

| Status | Body                                                       |
| ------ | ---------------------------------------------------------- |
| 200    | `{ recipient: Recipient }`                                 |
| 400    | `validation_error`                                         |
| 404    | `not_found` (also when the recipient isn't in this circle) |

#### `PATCH /api/circles/:circleId/recipients/:recipientId`

Any member can edit the details of someone the circle cares for. Send only the fields to change: `name`, `preferredName`, `dateOfBirth`, and `notes`, with the same rules as `RecipientInput`. `null` or an empty string clears an optional field. The relationship isn't part of this body; each member changes their own label with `PUT .../relationship`.

The body must also include `version`: the `Recipient.version` the edit is based on. The server saves only if it still matches, and then increments it. Otherwise another member saved first, and the server changes nothing and returns `409` with the current details, so the client can show what changed instead of silently overwriting it. Check and write in one statement, such as `UPDATE ... WHERE id = $1 AND version = $2`, so two saves at the same moment can't both succeed.

| Status | Body                                                                                          |
| ------ | --------------------------------------------------------------------------------------------- |
| 200    | `{ recipient: Recipient }`                                                                    |
| 400    | `validation_error` (also when `version` is missing)                                           |
| 404    | `not_found` (also when the recipient isn't in this circle)                                    |
| 409    | `edit_conflict`, plus `recipient: Recipient` with the current details: `{ error, recipient }` |

### Medication notification subscriptions (real backend)

Mounted at `/api/medication-notifications` when `ENABLE_MEDICATIONS_API=true`.
Every endpoint requires authentication. There is no mock background push service.

| Method/path | Body | Success |
| --- | --- | --- |
| `GET /config` | None | `{ enabled, publicKey }`; private VAPID keys are never returned |
| `POST /subscription/status` | `{ endpoint }` | `{ enabled }` for the signed-in user's subscription |
| `POST /subscription` | Browser `PushSubscription.toJSON()` | `204`; saves or transfers this browser endpoint to the signed-in user |
| `DELETE /subscription` | `{ endpoint }` | `204`; removes only the signed-in user's matching endpoint |

Subscriptions require supported HTTPS browser push endpoints, a 65-byte P-256 key,
a 16-byte authentication secret, and a nullable expiration timestamp. Invalid input
returns 400. Creation returns 503 when push is not configured. Opt-in is per browser
and covers the user's current families; membership and pending dose state are checked
again at delivery. See [notification setup and delivery behavior](medications.md#closed-app-notifications).

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

The frontend uses the browser mock for these appointment endpoints. The PostgreSQL router implements the same operations as a standalone router and is not mounted yet.

Query: `{ from, to, recipientId? }`. `from` and `to` are required timestamps filtering
`startsAt` with an inclusive lower bound and an exclusive upper bound. Returns non-cancelled appointments, sorted by `startsAt` ascending.

| Status | Body                              |
| ------ | --------------------------------- |
| 200    | `{ appointments: Appointment[] }` |
| 400    | `validation_error`                |
| 404    | `not_found`                       |

#### `POST /api/circles/:circleId/appointments`

Body: `{ recipientId, title, startsAt, endsAt, location, assignedCaregiverId }`. The end must be later than the start. Location and caregiver may be null. The recipient and any assigned caregiver must belong to the circle. Returns `201` with `{ appointment: Appointment }` and initial status `scheduled`.

#### `PATCH /api/circles/:circleId/appointments/:appointmentId`

Accepts either the same fields as creation (preserving completion status) or `{ status: 'scheduled' | 'completed' }`. Returns `200` with `{ appointment: Appointment }`. An appointment unavailable in the requested care circle returns `404`.

#### `DELETE /api/circles/:circleId/appointments/:appointmentId`

Removes the appointment and returns `204`. Appointment writes require circle membership and return `400` for invalid input or `404` for unavailable records.

#### Medication definitions

The medication page currently implements `GET` and `POST /api/circles/:circleId/medications`,
and `PATCH`/`DELETE /api/circles/:circleId/medications/:medicationId`. Browser mocks are
the default. The PostgreSQL router implements the same contract and is mounted behind
authentication when `ENABLE_MEDICATIONS_API=true`. The definition, schedule, version-checking,
validation, migration, and activation instructions are documented in [Medications](medications.md).

Creation initializes a private `effective_from` timestamp from the database clock
(the mock stores the equivalent boundary). A backdated Start date never creates
doses before the medication was added, including earlier times on its creation day.
Range reads and overdue backfill both enforce the boundary, and subsequent revisions
preserve it. Legacy records with no known boundary keep their existing history.

#### `GET /api/circles/:circleId/medication-occurrences`

Query: `{ from, to, status?, recipientId? }`. `from` and `to` are required timestamps
filtering `scheduledAt`. `status` is `pending` or `completed`; omit for both.
Returns individual scheduled doses, sorted by `scheduledAt` ascending. Medication
and recurring schedule definitions are separate resources, implemented by both the mock and staged PostgreSQL API.

Both implementations generate occurrences from saved medication schedules, preserving existing status
and taken history. The requested window can span at most 366 days. See [Medications](medications.md)
for time-zone, daylight-saving, and schedule-edit behavior.

| Status | Body                                                |
| ------ | --------------------------------------------------- |
| 200    | `{ medicationOccurrences: MedicationOccurrence[] }` |
| 400    | `validation_error`                                  |
| 404    | `not_found`                                         |

#### `GET /api/circles/:circleId/medication-occurrences/overdue`

Query: `{ before, recipientId?, cursor? }`. Returns
`{ medicationOccurrences, totalOverdueCount, nextCursor, historyPending }` with pending
doses scheduled strictly before the cutoff and past their individual overdue delay.
The UI uses next local midnight as the cutoff; the server caps it at the current time.
Today's overdue doses are included along with earlier days, without counting earlier doses in today's totals.
Current family membership is required; results follow the care-profile filter and sort
oldest first. Missing schedule instances are generated from tracked effective intervals,
never before creation for new medications, with one
record per dose time. Taken records are preserved and no age cutoff is applied. See [Medications](medications.md)
for reconciliation and materialization behavior.

Each response includes up to 100 rows. Pass its non-null `nextCursor` to load the
next page with the same cutoff/profile. `totalOverdueCount` counts all currently
materialized, current-definition overdue rows, not only the page. `historyPending`
marks incomplete backfill, so this count is a lower bound until it is false.
Generation advances at most 31 calendar days in total per request, shared among
selected definitions. The client continues it in short requests and indicates that
older doses are loading; the family lock is released between requests. There is
no age cutoff. Edits preserve coverage and use effective-time definition snapshots
for previously unviewed dates. Past pending and taken doses retain their original
details; only future untaken doses follow the new schedule. Obsolete materialized
future doses are retired during the edit transaction, before they can become past history.

#### `PATCH /api/circles/:circleId/medication-occurrences/:occurrenceId`

Body: `{ status: 'pending' | 'completed', version: number }`. Returns `200 { medicationOccurrence }`.
The interface labels completed doses Taken. Requires current family membership; missing
or inaccessible occurrences return 404 and invalid bodies return 400. Status updates refresh
Home and Medications and are saved in the browser mock database or PostgreSQL when enabled.
Stale dose versions return `409 edit_conflict`. A successful status transition increments
the dose version; repeating its current status with the current version preserves its
taken timestamp and version. Historical taken doses can be marked pending while
preserving their original details. Undoing a future taken occurrence whose time was
removed from the schedule returns `409 schedule_conflict` and preserves that record.
`POST /api/circles/:circleId/medications/:medicationId/stop` accepts `{ version: number }`
and returns `200 { medication }`, including `stoppedAt` (UTC) and an incremented version.
It preserves past pending/taken doses and archived definitions, removes future pending doses,
suppresses reminders, and prevents any dose generation at or after the stop instant.
Unviewed past history still backfills. Existing future taken records remain; undoing one
returns `409 schedule_conflict`. Past missed doses remain overdue and can be marked taken.
Stopped medications remain listed; edits return `409 edit_conflict`. The Restart medication
action prefills a new course and submits it through `POST /medications` after the user
chooses new course dates. The new ID leaves stopped history and the intervening dates unchanged.
Repeating stop with its current version keeps the original timestamp/version. Stale stop
requests return `409 edit_conflict`. Range occurrence responses include `medicationStoppedAt`
for stopped medications so reminder displays can suppress them without changing saved dose details.

Permanent medication deletion requires a JSON `{ version: number }` body and rejects stale
confirmation versions with `409 edit_conflict`. It permanently deletes pending doses,
taken dose history, and archived medication definitions along with the medication.
The delete confirmation explicitly includes taken history. Failed browser persistence returns
`503 storage_unavailable`; a save must not be reported as successful.

PostgreSQL generation and writes lock the individual medication, not its family row.
Definition listings take no exclusive row lock. Collection reads generate and commit
one medication at a time, rechecking current family membership between transactions
and before returning their combined result. Status changes lock the medication before
the occurrence; version checks still reject stale actions.

#### `GET /api/circles/:circleId/tasks`

Query: `{ dueFrom?, dueBefore?, completedFrom?, completedBefore?, status?, recipientId? }`.
Date bounds are timestamps filtering `dueAt` or `completedAt`; omitted bounds are
unbounded. `status` is `pending` or `completed`; omit for both. Filters combine with AND.

Due-date filters exclude undated tasks. Completion-date filters exclude incomplete
tasks and cannot be combined with `status=pending`. Results sort by `dueAt` ascending,
undated tasks last. Overdue means pending with a non-null `dueAt` before the current time.

| Status | Body                    |
| ------ | ----------------------- |
| 200    | `{ tasks: CareTask[] }` |
| 400    | `validation_error`      |
| 404    | `not_found`             |

#### `GET /api/circles/:circleId/expenses`

Query: `{ fromDate, toDate, recipientId?, category? }`. `fromDate` and `toDate` are required
calendar dates filtering `incurredOn`. `category` is an `ExpenseCategory`; omit for all
categories. Filters combine with AND. Results sort by `incurredOn` descending.
The client calculates totals and category summaries from integer `amountCents` values.
The existing date bounds support one-, six-, and twelve-month views without separate endpoints.

| Status | Body                      |
| ------ | ------------------------- |
| 200    | `{ expenses: Expense[] }` |
| 400    | `validation_error`        |
| 404    | `not_found`               |

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

| Status | Body                   |
| ------ | ---------------------- |
| 201    | `{ expense: Expense }` |
| 400    | `validation_error`     |
| 404    | `not_found`            |

#### `PATCH /api/circles/:circleId/expenses/:expenseId`

Body: `UpdateExpenseRequest`. Requires at least one field. Updates only supplied
fields and returns the full saved expense. A changed recipient must remain in the
same circle; the expense ID cannot change.

| Status | Body                   |
| ------ | ---------------------- |
| 200    | `{ expense: Expense }` |
| 400    | `validation_error`     |
| 404    | `not_found`            |

#### `DELETE /api/circles/:circleId/expenses/:expenseId`

No body. Deletes the expense. A missing or already-deleted expense returns `404`.

| Status | Body |
| --- | --- |
| 204 | No body |
| 404 | `not_found` |

### Documents

The backend router is mounted in the shared server behind session authentication.
Documents belong to one recipient and its circle. Uploads accept one non-empty text PDF,
up to 10 MiB (10,485,760 bytes). Images and OCR are not supported. AI answer generation
is a separate feature; these endpoints prepare and store chunks for a teammate’s RAG implementation.
The browser mock simulates processing without calling OpenAI.

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
Downloaded copies cannot be revoked. Future retrieval must check current document permissions before returning any chunks;
permission changes require no re-embedding.

Metadata and file bytes are stored together in PostgreSQL. The backend stores the raw
binary file in `care_documents.file_bytes` (`BYTEA`, not base64), with its byte length
constrained to match `size_bytes`. This uses the same PostgreSQL connection locally
and on Azure Database for PostgreSQL; no filesystem directory or Blob Storage is required.
Metadata/list queries exclude `file_bytes`; authorized file retrieval and processing load it.
Do not include file bytes in JSON metadata/list responses or expose public file URLs.
Chunks are stored in `document_chunks` with page numbers and `vector(1536)` embeddings
from OpenAI `text-embedding-3-small`. Deleting a document, recipient, or circle cascades
its chunks along with the original bytes and sharing grants. Document text is sent to
OpenAI for embeddings by the backend; credentials are never sent to the browser.
Validate actual file contents as well as the claimed file type and sanitize filenames.
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
The server generates the ID, uploader, upload time, and file metadata. Metadata, bytes,
and sharing grants commit together first. Then the request awaits PDF extraction,
chunking and embeddings outside that transaction; there is no background worker.
Return `201` with the saved document whether indexing succeeds (`ready`) or fails
(`failed` with a safe `processingError`). Indexing failure never rolls back the original.
A database failure before saving rolls back the upload. An interrupted response does
not mean the upload failed: refresh the list before uploading again.

Processing limits: 100 pages, 200,000 extracted characters, 200 chunks. Text is split
per page into up to 1,800 characters with 200-character overlap, and embeddings are
requested in batches of 16. Processing has a 60-second deadline; requests may be limited
further by hosting timeouts. Malformed/password-protected PDFs fail `invalid_pdf`;
PDFs with no text fail `no_extractable_text`. Blank/image-only pages in mixed PDFs are
not indexed. All chunks publish atomically only after processing succeeds.

| Status | Body |
| --- | --- |
| 201 | `{ document: CareDocument }` |
| 400 | `validation_error` |
| 404 | `not_found` |
| 413 | `file_too_large` |
| 415 | `unsupported_file_type` |
| 500 | `internal_error` (database operation failed) |

#### `GET /api/circles/:circleId/documents/:documentId`

| Status | Body |
| --- | --- |
| 200 | `{ document: CareDocument }` |
| 404 | `not_found` |

#### `GET /api/circles/:circleId/documents/:documentId/file`

Query: `{ disposition? }`, `inline` or `attachment` (default). Recheck access on every
request, read `file_bytes` from PostgreSQL after authorization, and return the bytes
through the authenticated API. The initial implementation buffers the file (up to 10 MiB).
Return the validated
`Content-Type`, safe `Content-Disposition`, `Cache-Control: private, no-store`, and
`X-Content-Type-Options: nosniff`. The frontend fetches with its bearer token, then uses
a temporary browser object URL for viewing/downloading and revokes it afterward.

| Status | Body |
| --- | --- |
| 200 | Binary file |
| 400 | `validation_error` |
| 404 | `not_found` |
| 500 | `internal_error` (database operation failed) |

#### `PATCH /api/circles/:circleId/documents/:documentId`

Uploader or circle owner only. Body: `UpdateDocumentRequest`. Changes supplied metadata
only; recipient and file bytes cannot be replaced. Include the `version` captured when
editing began and at least one changed field. The server checks the version while
locking the document in the transaction. A stale version returns `409 document_conflict`
without changing metadata or sharing. Successful metadata edits increment the version.
Title/category/sharing edits do not regenerate embeddings. Processing does not change
the metadata version.
Cancel editing, refresh, and reopen the form after a conflict; do not silently retry with
a newer version. Failed validation leaves the record
and sharing unchanged. Revoking sharing takes effect on subsequent API requests.

| Status | Body |
| --- | --- |
| 200 | `{ document: CareDocument }` |
| 400 | `validation_error` |
| 403 | `document_manager_only` |
| 404 | `not_found` |
| 409 | `document_conflict` |

#### `DELETE /api/circles/:circleId/documents/:documentId`

Uploader or circle owner only. Deletes the document and its stored file. Return success
only after metadata, bytes, chunks, and sharing grants are deleted in one transaction. Failed
deletion rolls back and can be retried. A missing or already-deleted document returns `404`.

| Status | Body |
| --- | --- |
| 204 | No body |
| 403 | `document_manager_only` |
| 404 | `not_found` |
| 500 | `internal_error` (database operation failed) |

#### `POST /api/circles/:circleId/documents/:documentId/process`

No body. Uploader or circle owner only. Processes a pending/failed document synchronously.
A ready document returns unchanged, without another embedding call. An active attempt
returns `409 document_processing`. After two minutes an interrupted attempt is shown
as failed with `processing_interrupted` and may be retried. Attempt tokens prevent an
old attempt from overwriting a newer retry. No automatic retry runs after a server restart.

| Status | Body |
| --- | --- |
| 200 | `{ document: CareDocument }` (inspect processing status) |
| 403 | `document_manager_only` |
| 404 | `not_found` |
| 409 | `document_processing` |
| 500 | `internal_error` |

## Planned next

These aren't part of this contract yet, but the model is built for them:

- **Invites:** an owner invites someone by email; accepting creates a `member` membership.
- **Tasks:** create/update/delete operations and recurring task schedules.
- **Medication activation and push delivery:** migrate and enable the PostgreSQL medication API and optional Web Push service when the real app endpoints are ready. Configure VAPID keys and verify provider delivery in a permitted browser; see [medications](medications.md#closed-app-notifications).
- **Other care-data mutations and schedules:** create/update/delete operations for appointments, medication occurrences, and tasks, plus medication definitions and recurring schedules.
- **Document assistance:** source-linked AI answers/summaries and extracted care actions with user review. Text extraction and vector storage are implemented; retrieval and answer generation are left to teammates.
- **Other resources:** messages, budgets, and patient-assistance notifications. Document lists are only needed on the dashboard if a recent-documents section is added.
- **Document processing:** parsing and extraction with user review, content search, and source-linked AI summaries.

## Connecting the real backend

1. In `client/.env.local`, set `VITE_USE_MOCKS=false`.
2. Leave `VITE_API_URL` empty for local development: the Vite dev server proxies `/api` to the Express server on port 3000. In production, set it to the backend origin, for example `https://api.nurture.app`, or leave it empty if the backend is served from the same origin.
3. If the backend is on a different origin, allow the client origin in CORS, including the `Authorization` header.
