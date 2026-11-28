# Medications

The page at `/app/medications` shows medications for the selected family.

## Shared Page Design

Medications is the visual reference for the collection pages. PageHeader supplies
the title, description, and care-circle selector; FeatureToolbar keeps grouped
labeled filters on the left and primary add/upload actions on the right. Tasks and
Documents retain their search/dropdown filter organization. Filters use the shared
Field controls, and collection content sits in padded bordered panels with capped
scrolling lists. The medication profile filter and Add medication button now share
one toolbar instead of stacking separate rows with an empty area at the top.

Appointments shares the Everyone/single-person dropdown while retaining family-wide warning counts;
Expenses retains period/category filtering and spending totals; Documents retains
its list/preview layout and permission controls. Their layouts use the same header,
toolbar, card spacing, and primary/outline/danger action styles. Home and Family
use the shared headers and card treatment without changing their navigation or data.

Expenses and Documents use FormDialog for add/upload, edit, and delete flows,
matching the existing care editors. Close, Cancel, Escape, and clicking outside
dismiss an idle popup; pending saves block dismissal. Failed saves stay open with
their errors inside the popup. Document form snapshots still retain their original
version and sharing choices. These are presentation changes, not storage/API changes.

Headers use compact spacing above the controls. Overview uses its page name and
current date; Add a Person is available on Family rather than duplicated on Home.

## Medication Name Filter

The Medication dropdown has a case-insensitive name search, an All medications
option, and profile names to distinguish matching medication names. Selecting a
medication filters Medication List, the date-selected Medication Schedule (including
its taken count), and the calendar. Profile and medication filters combine.
Typing narrows dropdown choices; selecting one applies the filter. Escape, clicking
outside, or moving focus away closes the dropdown. Choosing All medications restores
the full view. Calendar popups close when the name selection changes. Adding or
restarting a medication preserves the name and person filters after a successful
save and shows a notice. Clear filters resets the person, medication, and dose date. Attention Needed retains its existing profile-wide warning
scope; Home's cross-feature attention summary is unaffected by this panel filter.

## Medication Content

Warnings, status badges, and calendar blocks share semantic colors from
`components/ui/statusStyles.ts`, with the compact spacing used by Expenses.
Overdue/missed states use red, due-soon reminders use amber, completed/taken states
use green, and ordinary content uses neutral surfaces. Home's attention counts are
compact count buttons using the shared AttentionNeeded component. All care calendars use
the same block colors and completed strikethrough treatment. Routine completion
and edit actions use green outlines that fill on hover; Delete actions use red
outlines that fill on hover. Add/Save remain primary filled actions, and Close,
Cancel, navigation, and retry controls remain neutral. No warning scope, status
rules, storage, or mutation behavior changes with this style update.

The Care profile dropdown defaults to Everyone on a new session and filters the list.
Each entry shows the medication name, person, dosage, schedule and course dates with their time zone,
and the assigned caregiver. Loading, retry, and empty states are included.

On the Medications page, Attention Needed spans the full width above Medication
Schedule and Medication List. Those two panels have matching heights on desktop
and scroll internally; they stack with capped lists on smaller screens. A full-width
Calendar sits directly below them. Home retains its existing compact medication panel.
The calendar offers Daily, Weekly, and Monthly views, Previous/Next navigation,
and Today. It follows the Showing profile filter while keeping its viewed period.
It queries saved/generated dose occurrences for the visible period using local
calendar boundaries, including daylight-saving changes, and preserves schedule
revision, stop, and restart history through the existing occurrence API.
Monthly cells show up to three compact doses and a more button; day/week views
use hourly rows with doses beside one another. The calendar area scrolls within
a capped height. Taken doses use strikethrough; missed doses have a red outline.
Clicking a month date (or its cell background), or a day/week date heading, opens a
date-scoped medication popup with that day's doses and their existing status controls.
It follows the profile filter and shows an empty state when no medications are scheduled.
Calendar popups offer Add medication, opening the shared editor with the clicked
date as the Start date and the selected profile prefilled. Active doses also offer
Edit medication, which opens the latest medication definition and changes its
schedule rather than a single occurrence. Historical doses do not restore old
definitions, and stopped medications cannot be edited from the calendar.
The dose popup closes before the editor opens. Existing save validation, version
checks, and query refreshes apply. Permanent deletion is also available from calendar dose details and the calendar editor, through the same confirmation that explains removal of the medication and all dose history.
Clicking a dose opens its existing dose controls. Monthly overflow opens that day's
doses; day/week overflow opens only the selected hour's doses.
Mark taken/pending refreshes the calendar, schedule, attention panel, and Home.
CalendarDetailsDialog supplies the same date/person context, Add placement, capped scrolling body, and Close controls as Appointments and Tasks.
Close, Escape, and clicking outside dismiss the popup. Refetches close the popup
if its doses disappear or the calendar request fails, including loss of access. A successful retry does not reopen the old selection.

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

New medications begin tracking at their creation instant. A past Start date describes
the course but does not create missed doses before the medication was added, including
earlier times on the same day. PostgreSQL sets `effective_from` from its own clock during
INSERT; the mock stores the equivalent private `effectiveFrom` timestamp. Both regular
date queries and missed-dose backfill respect this boundary. Archived revisions preserve
it through later edits, so neither an edit nor a restart invents pre-creation history.
A newly added course that already ended generates no doses. Existing legacy records
without a known boundary retain their stored history; this change does not guess their
creation date or erase doses already recorded.

Definitions now live in the existing localStorage-backed mock database and survive
refresh. Older demo sessions receive the sample definitions without resetting their
other data. This is the default mock storage; enabling the backend uses PostgreSQL instead.

## Edit, stop, and delete permanently

Active entries have Edit medication, Stop medication, and Delete permanently actions. Stopped entries
remain visible with their stop timestamp and the permanent deletion action. Editing reuses the
same dialog, prefilled with all saved fields, including AM/PM times, selected days,
course ending, time zone, and caregiver. Close, Escape, Cancel, and click-away
dismiss it without saving. The delete action opens a confirmation with Keep medication
and Delete medication. A failed save or deletion leaves the dialog open with an error.

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

### Stopping and deletion policy

**Stop medication** is the normal way to end a course. Its confirmation explains that
past pending (missed) and taken doses are kept. `POST /api/circles/:circleId/medications/:medicationId/stop`
accepts `{ version }` and returns `{ medication }` with a server-owned `stoppedAt` timestamp
and an incremented version. Stale stops, edits, and delete confirmations return `409 edit_conflict`.
A repeat stop with the current version leaves the original stop timestamp and version unchanged.
Stopped courses cannot be edited or resumed in place. **Restart medication** opens
a new-course form with the previous name, dosage, days, dose times, time zone,
caregiver, and reminder settings prefilled. The user must choose a new start date
and, for a fixed-date course, a new end date. Duration-based courses keep their
number of days. Nothing is saved until Start new course is confirmed; Cancel,
Escape, Close, and click-away dismiss it. It uses the existing medication creation
endpoint, assigning a new medication ID and leaving the stopped course and its
doses untouched. Only the new course's selected dates generate new doses.

Stopping removes pending doses scheduled at or after that exact instant, including doses
that were already materialized, and prevents future generation. Past doses remain viewable
and their completion can still be corrected. Never-viewed past doses are generated on demand
using the existing historical schedule. Existing taken records are kept even when recorded
early for a future scheduled time; undoing those future records returns `409 schedule_conflict`.
Reminders are suppressed for stopped medications; past missed doses remain in missed lists.
Stopping does not reset history coverage or remove archived schedule revisions.
Stopped cards show a date range ending on the stop date in the medication's time zone,
or the planned end date if earlier. A course stopped before its start is shown as
Not started with the stop date; it does not show an inverted range or ongoing status.

**Delete permanently** is a separate, confirmed action for removing an entry and its history.
It permanently removes its definition, all pending doses, all
taken dose history, and its archived definition revisions. The confirmation dialog
states that taken history is included. The browser mock removes these records and
its coverage entry; PostgreSQL foreign-key cascades remove the occurrences and
revisions. Schedule edits preserve past doses, while deletion removes them.

## Shared Home and Medications controls

Both pages render `MedicationPanel`, including Add medication,
date-selected Medication Schedule/history, and the medication list with Edit, Stop, Restart, and
Delete permanently actions. They use the same editor and confirmations, including
click-away dismissal. Both pages use the shared Care profile selector with an Everyone option and preserve
the selected profile after adding or restarting a medication. Home's selection still
controls its other dashboard sections without adding a duplicate selector. The dose count within Medication Schedule follows the selected date. Home no longer
shows a separate top-level today’s-dose metric card.
Changes invalidate the same cached family data and appear on either page.
The selected profile and schedule date persist when navigating between these pages.
This in-memory selection is scoped to the signed-in user and family; another family
starts with Everyone and today's date. Today clears the saved date so both pages
follow the current day across midnight. Home shows a caregiver-loading failure only
once, using its shared retry action.

Detailed Attention Needed dose/reminder controls appear on Medications. Home uses
one combined Attention Needed summary for missed doses, overdue tasks, and overdue
appointments. Each count opens a capped popup with item controls and a link to its page. It does not show a second medication-only
attention panel. Due-soon medication reminders remain available on Medications;
Home's summary counts missed doses only and follows its Showing filter.

Medication Schedule accepts past, present, and future calendar dates on both pages.
Future selections show the planned doses and survive navigation between pages;
Today restores the current day. Medication dialog headings use title case.

Attention Needed shows count buttons, missed first and reminders second. Each opens the shared capped scrolling popup, including loading and paging controls. Close, Escape, and clicking outside dismiss it; there is no inline detail list or View/Hide toggle.
Dose lists and the medication list also have capped heights and internal scrolling.
Home places Medications directly below Expenses in the right column, while Tasks and Appointments stack in the left column. Both columns flow independently, and the medication lists retain capped internal scrolling.

The medication UI uses **Missed** consistently. Existing API paths and field names
containing `overdue` remain unchanged.

## Scheduled doses

Dose lists show missed doses first, then other untaken doses, then taken doses.
Within each group, doses are ordered by scheduled time, earliest first. The shared
list applies this order on both Home and Medications and updates as statuses change.

Each medication has **Missed after (minutes)** in its form, defaulting to 30 minutes
and allowing 0–1440. Pending displayed doses get a red Missed badge at the scheduled
instant plus this delay. Taken doses never show missed. The badge updates each minute
on both pages and is derived from the current time rather than saved as another status.

Mark taken records `takenAt` at the time of the status write and displays it in the
viewer's local time zone. Repeating the same taken write preserves its first timestamp;
Mark pending clears it. Older taken records without a timestamp stay Taken without
inventing a recorded time. The timestamp indicates when the dose was marked taken.

Home and Medications share the Medication Schedule section and use the
same occurrence endpoint and shared list component. Both support Mark taken and
Mark pending. Home's completion count and all person-filtered dose queries refresh
after a successful write; a failed write leaves the previous status visible with
an error. The count and list follow the selected care profile.

### Missed doses

Medications groups missed doses and reminders in **Attention Needed**
for all pending doses that have passed
their grace period, including today's doses and doses from earlier days. Each row shows
the full scheduled date and time, plus a red tag such as Missed yesterday
or Missed 2 days ago. These labels count local calendar days. This section follows Home's Showing filter or
Medications' Showing filter. Today's missed doses also remain in today's
list and count once in today's totals; earlier doses do not affect those totals.
Marking an old dose taken removes it from the missed section and retains its taken
record and timestamp in storage. Old pending records have no arbitrary age cutoff.

`GET /api/circles/:circleId/medication-occurrences/overdue?before=...&recipientId=...`
returns `{ medicationOccurrences, totalOverdueCount, nextCursor, historyPending }`,
sorted oldest first, with up to 100 rows per page. `before` is required;
`recipientId` and `cursor` are optional. The endpoint verifies current family membership, updates
old pending metadata from the current definition, and removes pending records whose
times were removed by a schedule edit. Taken history is preserved. Missing instances
are generated only within the medication's tracked effective intervals, starting no
earlier than its creation time for new records, through the cutoff (or its
stop instant, whichever comes first), even when those
days were never viewed. Each scheduled time is a separate dose: two untaken times
produce two missed rows, and each dose list shows a red missed-dose count.

History generation has a total budget of 31 calendar days per request, divided among
the selected medication definitions. It records actual completed coverage per medication
version in the same database. `historyPending` remains true until the requested history
has been covered. Historical pending snapshots remain visible under their original
definition. Repeated polling reuses that coverage and the
stable dose IDs, preserving taken statuses without duplicating rows. Schedule edits
preserve coverage; edits do not restart the scan from the course start.

The missed query refetches every second while history is still loading, then every minute,
allowing any pending dose to become
missed when its grace period expires. Its cutoff is the next local midnight,
capped by the endpoint at the current time, so future doses are excluded.
A failed request shows a retry
action. The regular date-range endpoint still materializes requested doses; background
generation while the application is closed remains part of backend integration;
reopening the application catches up the missed schedule instances.

Both pages display **Loading older missed doses…** while backfill continues and
prefix the currently known missed count with **At least**. Once complete, the count
covers all missed rows, including rows beyond the displayed page. **Show more missed
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
schedule, and never generates a date before tracking began. Changing dose times, weekdays, timezone, or course dates cannot invent new
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

Both pages combine today's doses, history, and upcoming doses in **Medication Schedule**, defaulting
to today. Choose any valid calendar date with **Dose date**, or use **Today** to return
to the current day. The default and Today button follow the new day at midnight;
an explicitly selected date stays selected. The page's Care profile filter applies.
The section shows a taken/total count for the selected date.
Each row shows the scheduled local date and time, medication and dosage, and
Taken, Pending, or the appropriate missed status. Taken doses include their
recorded timestamp when available. Mark taken and Mark pending use the same saved
occurrences as Home, today's doses, reminders, and missed doses, refreshing all
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

Medications shows missed-dose and reminder counts in **Attention Needed**, missed first. Each opens its own category in the shared scrolling popup. Home shows missed doses in its combined summary. This panel is hidden when neither needs attention, and each
failed request has its own retry action. Reminders begin at the selected lead
time. Rows show Due in N min or Due now and support Mark
taken. A reminder clears when taken or when the dose becomes missed, at which
point the existing missed displays apply. Both pages follow their selected care
profile. Reminders include doses scheduled after midnight and prior-day doses
still within their grace period, without changing today's dose totals.

The display updates every minute while the app is open. A stable UTC date range
covers the maximum 24-hour lead and grace periods across midnight and daylight
saving changes. Dose writes refresh the shared occurrence queries on both pages.

Failed attention queries hide their cached dose rows and counts. An access failure
from either attention request hides both lists until access is restored, on both Home
and Medications. Retry reloads current data instead of exposing stale controls.

### Closed-app notifications

The staged real backend supports browser Web Push while the website tab is closed.
An Enable notifications button appears on Home and Medications when the server is
configured and the browser supports push. Permission is requested only on that click.
Each browser subscribes separately; Disable notifications and logout unsubscribe it.
The demo has no background server and continues to show in-app reminders only.

To enable on the real backend:

1. Apply migrations, including `1795737600000_medication-push.sql`.
2. Generate a VAPID key pair with `npx web-push generate-vapid-keys` from `nurture-api`.
3. Configure `ENABLE_MEDICATIONS_API=true`, `ENABLE_MEDICATION_PUSH=true`,
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a `mailto:` contact).
   Keep the private key on the server. Restart the server and use the real frontend
   (`VITE_USE_MOCKS=false`) over HTTPS or localhost.
4. Click Enable notifications and grant browser permission.

The running API checks active courses every minute using the existing schedule/revision
generator. Every opted-in current member of that family receives reminders at the configured
lead time, plus a missed-dose alert after the grace period. Taken or stopped courses do not
send alerts. Missed alerts have a five-minute catch-up window so a restart does not flood
users with old history. Browser/OS background delivery must be allowed; this is not a guarantee
of exact-time delivery. No emails are sent.

Membership, medication, and dose state are checked under database locks before each send.
The notification router delegates to `medication-notifications.controller.js`,
`medication-notifications.validators.js`, and `medication-notification.model.js`.
The push service uses that same model for delivery locks and queries; it handles timing
and provider calls rather than embedding SQL in routes or scheduling code.
Delivery records prevent competing server workers from sending the same dose/event to the
same subscription. Failed sends roll back their delivery claim for retry; expired endpoints
are removed. A crash after the push provider accepts a message but before the database
commits can retry that message; a stable notification tag replaces the displayed duplicate.
Delivery logs expire after seven days and are separate from dose history.
Lock-screen text omits names, dosages, and care profiles. Clicking the notification opens
Medications; the normal login and permission checks still apply.

The browser worker and permission/subscription flows have automated tests. Actual delivery
through a push provider still requires deployment keys and permission on a real browser.

## PostgreSQL backend

The medication backend is implemented in `nurture-api` and disabled by default.
It uses the project's existing database and authentication, with no separate medication
database. Frontend request/response shapes are the same as the browser mock; PostgreSQL
definition/profile/caregiver IDs are numeric strings and occurrence IDs are stable dose IDs.

| File | Responsibility |
| --- | --- |
| `nurture-api/src/db/migrations/1795478400000_create-medications.sql` | Definitions, dose history, versions, indexes, and family-scoped foreign keys |
| `nurture-api/src/db/migrations/1795651200000_stop-medications.sql` | Nullable stop timestamp; existing courses stay active |
| `nurture-api/src/db/migrations/1795564800000_medication-revisions.sql` | Effective-time definition snapshots for prospective edits |
| `nurture-api/src/models/medication.model.js` | Transactions, CRUD, reconciliation, missed backfill, and conditional writes |
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
Generation and writes share the medication lock, so an missed read cannot restore
an outdated pending status over another caregiver's completion. Failed medication
operations roll back their transaction; earlier successfully generated batches remain
saved. Counts/lists combine the per-medication results rather than holding a single
exclusive family lock for a globally simultaneous snapshot.

Generation refreshes only future pending metadata and increments its version only
when it changes. Past pending and completed records retain their original details.
The update transaction archives the previous definition and retires obsolete future
rows. Missed reads fill missing history using the archived effective intervals and
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
is separate work. Closed-app notifications use the optional push service described above.
Medication definitions, date-filtered doses, and missed queries refresh on returning
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
history preservation, never-viewed missed doses, course edits, stopping, and permanent deletion cascades.


## Shared Calendar Controls

Appointments, Medications, and Tasks use `CalendarToolbar` for Daily/Weekly/Monthly,
Today, Previous/Next, and a Calendar date picker. Date changes preserve the chosen
view and reset open details. Month navigation preserves the preferred day through
shorter months. All three have capped scrolling, clickable dates (including empty
dates), item details, overflow details, status changes and undo, and Add/Edit/Delete
through their existing editors and confirmations. Calendar Add prefills the selected
date; a single selected profile is preserved. Details close before an editor or
confirmation opens. Close, Escape, and click-away dismiss dialogs, with dismissal
blocked during writes. Filters and failed access refreshes hide stale controls.

Appointment blocks retain their real start/end durations and overlap layout.
Medication doses and task deadlines are points in time, so they use hourly slots.
Medication edits affect its schedule; permanent deletion explicitly confirms removal
of the medication and all dose history. Task edits/deletes affect one occurrence,
with stopping repeats retained as a separate schedule action.


The missed-dose count inside Medication Schedule is scoped to its selected date
and medication/profile filters. It reads “N missed doses today” for the current
local date, or “N missed doses on [date]” for a historical date. Attention Needed
continues to count missed doses across dates within its profile scope, so its
total can be larger than the selected day's count. Home uses the same labels.


## Home Card Headers and Actions

Home's Tasks, Appointments, Expenses, and Medications cards use the shared
`PanelHeader`: a matching-size icon immediately before the linked title on the
left, and the same primary Add button at the top right. Titles open their feature
page for the selected family. Filters such as Medication appear below the header.
Tasks no longer places Add below its list, and Expenses uses its title for navigation
rather than a separate View all button. Each Add action opens the existing feature
form directly on Home, prefilling the selected care profile. The existing save,
validation, click-away, and query-refresh behavior is shared with feature pages.
Appointment rows also expose their existing confirmed deletion action on Home.
