# Medications

The page at `/app/medications` shows medications for the selected family.
It starts with all care profiles selected; the Care profile dropdown filters the list.
Each entry shows the medication name, person, dosage, schedule and course dates with their time zone,
and the assigned caregiver. Loading, retry, and empty states are included.

`GET /api/circles/:circleId/medications` has a browser mock and a staged PostgreSQL backend. The mock checks
family membership before returning sample medications for Rose and Frank. Other
families start empty. The shared types are in `client/src/api/types.ts`; schedule
times are `HH:mm` clock times in the schedule's IANA time zone. These definitions
are separate from individual dose occurrences shown on Home.

**Add medication** opens a dialog with a care profile, medication name, dosage,
one or more dose times, time zone, and optional caregiver. Times use typed input
and AM/PM dropdowns, and duplicate times are rejected. Cancel, Close, Escape, and
clicking outside dismiss the dialog; dismissal is blocked during a save.

## Scheduling

- **Days:** seven always-visible day checkboxes with a Select all checkbox.
  All days start selected. Choose one day for a weekly schedule, several for
  selected days, or all seven for daily doses. Select all also clears the selection
  when every day is already selected.
- **Doses per day:** a number from 1 to 24. Setting it to 2 shows two time fields;
  setting it to 4 shows four. Enter each time directly with its AM/PM selection.
  Changing the count preserves the time fields that remain.
- **Start date:** inclusive, interpreted in the schedule's time zone.
- **Ends:** no end date, after a specified number of calendar days, or on an inclusive date.
  For example, a three-day course starting March 7 ends March 9, even over a daylight-saving
  change. A weekly course lasting ten days covers ten calendar days, not ten doses.

The stored schedule contains `times`, `timeZone`, `daysOfWeek` (Sunday = 0 through
Saturday = 6), `startsOn`, and `end`. The end is `{ kind: 'never' }`,
`{ kind: 'afterDays', days }`, or `{ kind: 'onDate', date }`. The list displays
the actual repeat days, clock times, start date, and course ending.

Validation rejects empty weekday selections, duplicate times, impossible dates,
end dates before the start, non-positive durations, and courses that contain none
of the selected weekdays. Existing daily-only definitions are upgraded to all seven
weekdays with no end date, preserving the original times and time zone.

`POST /api/circles/:circleId/medications` validates the same fields as the form,
checks current family membership and the profile/caregiver assignments, and returns
`201 { medication }`. Names and dosages are trimmed and limited to 120 characters;
the schedule accepts 1–24 unique times and a valid IANA time zone. A second submit
is blocked while saving. The medication list refreshes after success.

Definitions now live in the existing localStorage-backed mock database and survive
refresh. Older demo sessions receive the sample definitions without resetting their
other data. This is the default mock storage; enabling the backend uses PostgreSQL instead.

## Edit and delete

Each entry has Edit medication and Delete medication actions. Editing reuses the
same dialog, prefilled with all saved fields, including AM/PM times, selected days,
course ending, time zone, and caregiver. Close, Escape, Cancel, and click-away
dismiss it without saving. The delete action opens a confirmation with Keep medication
and Confirm delete. A failed save or deletion leaves the dialog open with an error.

`PATCH /api/circles/:circleId/medications/:medicationId` accepts the full definition
plus its `version`. Existing medications begin at version 1; each edit increments it.
A stale version returns `409 edit_conflict`, preserving the newer definition. The
editor refreshes the list and asks the user to close and reopen to review it.
Missing or out-of-family medication IDs return 404, and profile/caregiver assignments
are checked against the current family before any write.

`DELETE` at the same path requires `{ version }` and removes the definition and its stored dose occurrences.
An outdated confirmation returns `409 edit_conflict` without deleting the newer definition.
The confirmation states this explicitly. Repeated deletion returns 404. Successful
writes refresh the family's care queries, so deleted mock doses disappear from Home.
These operations use the existing browser mock database by default, or PostgreSQL when enabled.

### Deletion policy

Deleting a medication permanently removes its definition, all pending doses, all
taken dose history, and its archived definition revisions. The confirmation dialog
states that taken history is included. The browser mock removes these records and
its coverage entry; PostgreSQL foreign-key cascades remove the occurrences and
revisions. Schedule edits preserve past doses, while deletion removes them.

## Scheduled doses

Each medication has **Overdue after (minutes)** in its form, defaulting to 30 minutes
and allowing 0–1440. Pending displayed doses get a red Overdue badge at the scheduled
instant plus this delay. Taken doses never show overdue. The badge updates each minute
on both pages and is derived from the current time rather than saved as another status.

Mark taken records `takenAt` at the time of the status write and displays it in the
viewer's local time zone. Repeating the same taken write preserves its first timestamp;
Mark pending clears it. Older taken records without a timestamp stay Taken without
inventing a recorded time. The timestamp indicates when the dose was marked taken.

Home's Today’s medications panel and Medications' Doses section use the
same occurrence endpoint and shared list component. Both support Mark taken and
Mark pending. Home's completion count and all person-filtered dose queries refresh
after a successful write; a failed write leaves the previous status visible with
an error. The count and list follow the selected care profile.

### Overdue doses

Home shows **Overdue doses** and Medications includes them in **Attention needed**
for all pending doses that have passed
their grace period, including today's doses and doses from earlier days. Each row shows
the full scheduled date and time, plus a red tag such as Overdue from yesterday
or Overdue from 2 days ago. These labels count local calendar days. This section follows Home's Showing filter or
Medications' Care profile filter. Today's overdue doses also remain in today's
list and count once in today's totals; earlier doses do not affect those totals.
Marking an old dose taken removes it from the overdue section and retains its taken
record and timestamp in storage. Old pending records have no arbitrary age cutoff.

`GET /api/circles/:circleId/medication-occurrences/overdue?before=...&recipientId=...`
returns `{ medicationOccurrences, totalOverdueCount, nextCursor, historyPending }`,
sorted oldest first, with up to 100 rows per page. `before` is required;
`recipientId` and `cursor` are optional. The endpoint verifies current family membership, updates
old pending metadata from the current definition, and removes pending records whose
times were removed by a schedule edit. Taken history is preserved. Missing instances
are generated from each medication's start date through the cutoff even when those
days were never viewed. Each scheduled time is a separate dose: two untaken times
produce two overdue rows, and each dose list shows a red overdue-dose count.

History generation has a total budget of 31 calendar days per request, divided among
the selected medication definitions. It records actual completed coverage per medication
version in the same database. `historyPending` remains true until the requested history
has been covered. Historical pending snapshots remain visible under their original
definition. Repeated polling reuses that coverage and the
stable dose IDs, preserving taken statuses without duplicating rows. Schedule edits
preserve coverage; edits do not restart the scan from the course start.

The overdue query refetches every second while history is still loading, then every minute,
allowing any pending dose to become
overdue when its grace period expires. Its cutoff is the next local midnight,
capped by the endpoint at the current time, so future doses are excluded.
A failed request shows a retry
action. The regular date-range endpoint still materializes requested doses; background
generation while the application is closed remains part of backend integration;
reopening the application catches up the missed schedule instances.

Both pages display **Loading older overdue doses…** while backfill continues and
prefix the currently known overdue count with **At least**. Once complete, the count
covers all overdue rows, including rows beyond the displayed page. **Show more overdue
doses** loads another 100 rows without discarding earlier rows. No arbitrary date cutoff
is introduced, and requests release the database lock between history batches.

`GET /api/circles/:circleId/medication-occurrences` generates doses from saved
definitions for the requested UTC `[from, to)` window, up to 366 days per request.
Generation uses the medication's own time zone, selected weekdays, inclusive start,
and inclusive course ending. Today on both pages means the viewer's local calendar
day; dose times are displayed in the viewer's local time zone. The schedule cards
continue to show their original time zone and clock times.

Dose identity includes the medication, care profile, and scheduled instant. Repeated loads reuse the saved
record and its status rather than adding duplicates. Every edit has an effective UTC
timestamp. Past doses keep their original name, dosage, person, time, grace period,
and taken/pending status. Only future untaken doses follow the new definition.
Previously materialized obsolete future rows are retired immediately at edit time,
so they cannot later age into historical missed doses. Taken records are retained.
Deleting the medication still removes its occurrences, as stated in the confirmation.
Newly created occurrence IDs also include the definition version. Removing and later
restoring a time creates a different ID, so an old tab cannot submit an action against
a newly created dose just because both began at status version 1. Moving a medication
to another profile creates that person's future doses, while past doses remain with
the original person. Existing retained record IDs are preserved.

Each previous definition is archived with its effective interval. If a past date was
never viewed, backfill uses the definition that governed that date, not today's edited
schedule. Changing dose times, weekdays, timezone, or course dates cannot invent new
missed doses before the edit. Name, dosage, caregiver, reminder, and grace-period edits
also leave past dose snapshots and completed backfill coverage unchanged.

During spring daylight saving, a nonexistent clock time moves forward by the gap
(for example, 2:30 AM becomes 3:30 AM). A repeated fall-back clock time produces one
dose at its first occurrence. Times that resolve to the same instant are deduplicated.

`PATCH /api/circles/:circleId/medication-occurrences/:occurrenceId` accepts exactly
`{ status: 'pending' | 'completed', version }` and returns `{ medicationOccurrence }`. The UI
calls completed doses Taken. Every write checks current family membership and the
record's recipient. Obsolete pending doses and missing records return 404. Status
is persisted in the existing mock database and survives a fresh page load.

Each occurrence has a version, beginning at 1 (older saved occurrences are upgraded).
Status transitions and changed pending metadata advance that version. Stale actions
return `409 edit_conflict` rather than overwriting a newer taken/pending decision,
including when the status changed away and back. Repeating the current status with
the current version preserves its version and taken timestamp. The list refreshes
after a conflict or missing-dose response so the caregiver can review current data.
Historical taken doses can be marked pending without losing their original schedule
or details. Undoing a future taken occurrence whose time was removed still returns
`409 schedule_conflict`; it is retained rather than disappearing on reload.

### Multiple tabs and save failures

All mock database handlers use the same origin-wide Web Lock around reading,
checking permissions/versions, and writing. This includes authentication, family,
appointment and expense writes, plus reads that generate dose records, because
they share one stored database. Artificial network delays happen before acquiring
the lock. Browsers without Web Locks return an explicit storage-unavailable error
rather than using an unsafe cross-tab fallback.

Successful user writes update a change marker. Other tabs listen for that marker
and refresh their cached data; focus and visibility changes also refresh the data.
Read-only dose generation leaves the marker unchanged, avoiding refresh loops
between tabs. An open medication editor retains the version it was opened with,
so refreshing its background list does not silently make an old form current.

Failed browser writes return `503 storage_unavailable`, leaving the last saved
database intact and showing a retryable error in the existing form or dose row.
These protections apply to the browser mock, whose data is shared only within
the same browser origin. The staged backend provides PostgreSQL transactions and
conditional version checks for multi-device storage; activate it as described below.

### Doses and history

Medications combines today's doses and history in one **Doses** section, defaulting
to today. Choose a date up to today with **Dose date**, or use **Today** to return
to the current day. The default and Today button follow the new day at midnight;
an explicitly selected date stays selected. The page's Care profile filter applies.
The section shows a taken/total count for the selected date.
Each row shows the scheduled local date and time, medication and dosage, and
Taken, Pending, or the appropriate overdue status. Taken doses include their
recorded timestamp when available. Mark taken and Mark pending use the same saved
occurrences as Home, today's doses, reminders, and overdue doses, refreshing all
views after a successful write.

The selected date is bounded by the viewer's local midnights, including daylight
saving transitions. History loads one day at a time using the existing occurrence
endpoint, generating missing scheduled instances and retaining saved taken records.
Loading, empty, and retry states appear within the section. Deleted medications
and their occurrences remain deleted; this does not introduce a separate archive.

### In-app reminders

Add/Edit medication includes **Remind before (minutes)**, from 0 to 1440 minutes.
New forms default to 15 minutes. Leave the field blank to disable reminders;
existing definitions without this setting remain disabled. Use 0 for a reminder
at the scheduled dose time. The schedule and generated occurrences store this as
nullable `reminderBeforeMinutes`.

Home shows a **Dose reminders** panel; Medications combines reminders and overdue
doses in **Attention needed**, with overdue doses first and reminders below in one
scrollable list. This panel is hidden when neither needs attention, and each
failed request has its own retry action. Reminders begin at the selected lead
time. Rows show Due in N min or Due now and support Mark
taken. A reminder clears when taken or when the dose becomes overdue, at which
point the existing overdue displays apply. Both pages follow their selected care
profile. Reminders include doses scheduled after midnight and prior-day doses
still within their grace period, without changing today's dose totals.

The display updates every minute while the app is open. A stable UTC date range
covers the maximum 24-hour lead and grace periods across midnight and daylight
saving changes. Dose writes refresh the shared occurrence queries on both pages.

Reminder delivery while the app is closed remains to be implemented. Doses are
materialized by API reads (mock by default, PostgreSQL when enabled); these panels do
not send browser notifications, emails, or background notifications.

## PostgreSQL backend

The medication backend is implemented in `nurture-api` and disabled by default.
It uses the project's existing database and authentication, with no separate medication
database. Frontend request/response shapes are the same as the browser mock; PostgreSQL
definition/profile/caregiver IDs are numeric strings and occurrence IDs are stable dose IDs.

| File | Responsibility |
| --- | --- |
| `nurture-api/src/db/migrations/1795478400000_create-medications.sql` | Definitions, dose history, versions, indexes, and family-scoped foreign keys |
| `nurture-api/src/db/migrations/1795564800000_medication-revisions.sql` | Effective-time definition snapshots for prospective edits |
| `nurture-api/src/models/medication.model.js` | Transactions, CRUD, reconciliation, overdue backfill, and conditional writes |
| `nurture-api/src/routes/medications.routes.js` | Definition and occurrence endpoints mounted under a family |
| `nurture-api/src/validators/medications.validators.js` | Schedule, date range, ID, version, and body validation |
| `nurture-api/src/services/medication-schedule.js` | Server-side timezone/DST-aware dose generation |

Every transaction checks current membership and holds a shared lock on only the
requesting member's membership row through commit. Plain definition listings take
no exclusive row locks. Writes and dose generation lock only their medication row;
dose status updates acquire the medication before the individual dose to keep a
consistent lock order. Family-wide dose reads commit each medication's generation
separately, releasing that lock before moving to the next medication. Unrelated
medications and ordinary family/profile operations do not wait for the whole batch.
Access is rechecked for each medication and before returning the collected result.
Definition edits/deletes and dose updates check versions; status writes also use a
conditional SQL update. Unique
`(medication_id, recipient_id, scheduled_at)` keys and upserts prevent duplicate generated doses.
Generation and writes share the medication lock, so an overdue read cannot restore
an outdated pending status over another caregiver's completion. Failed medication
operations roll back their transaction; earlier successfully generated batches remain
saved. Counts/lists combine the per-medication results rather than holding a single
exclusive family lock for a globally simultaneous snapshot.

Generation refreshes only future pending metadata and increments its version only
when it changes. Past pending and completed records retain their original details.
The update transaction archives the previous definition and retires obsolete future
rows. Overdue reads fill missing history using the archived effective intervals and
continue from existing coverage after edits. Shortened courses and moved start dates
do not erase past missed doses. Deleting a medication cascades to its occurrences and
definition snapshots. Assigned
caregivers and care profiles must belong to the same family.

To enable when the real API is ready:

1. Configure the existing `nurture-api` PostgreSQL connection and run `npm run migrate:up`
   from `nurture-api` (PostgreSQL 15 or later, matching the appointment migrations).
2. Set `ENABLE_MEDICATIONS_API=true` in the backend environment and restart it. This
   mounts the router behind the existing authentication middleware in `circles.routes.js`.
3. Set `VITE_USE_MOCKS=false` for the client when the rest of the real authentication,
   family, and dashboard endpoints are ready, then restart/rebuild the client. The
   medication feature itself needs no alternative client implementation.

No mock data is copied into PostgreSQL. Browser Web Locks and storage events are demo
protections; real database transactions provide write safety. Cross-device live push
and closed-app notification delivery are separate work, not part of this router.
Medication definitions, date-filtered doses, and overdue queries refresh on returning
to the app and every minute in both real and mock modes. Real-API refresh does not
depend on the mock storage listener.

### Backend verification

From `nurture-api`, run `npm run test:medications`. Scheduler, validation, and router
authorization tests run without a database. For PostgreSQL integration, set
`MEDICATION_TEST_DATABASE_URL` (or `TEST_DATABASE_URL`) to a separate local database
whose name contains `test`. The test rejects the application `DATABASE_URL`, uses its
own generated schema, and removes only that schema afterward. With no test connection
configured, the integration case is explicitly skipped.

The integration test covers migration up/down, CRUD, foreign-family access, caregiver
removal, version conflicts between concurrent caregivers, idempotent dose writes,
history preservation, never-viewed overdue doses, course edits, and deletion cascades.
