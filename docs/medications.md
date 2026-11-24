# Medications

The page at `/app/medications` shows medications for the selected family.
It starts with all care profiles selected; the Care profile dropdown filters the list.
Each entry shows the medication name, person, dosage, schedule and course dates with their time zone,
and the assigned caregiver. Loading, retry, and empty states are included.

`GET /api/circles/:circleId/medications` currently has a browser mock only. It checks
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
other data. This is still mock storage, not PostgreSQL.

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
These operations still use the existing browser mock database.

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
returns `{ medicationOccurrences }`, sorted oldest first. `before` is required;
`recipientId` is optional. The endpoint verifies current family membership, updates
old pending metadata from the current definition, and removes pending records whose
times were removed by a schedule edit. Taken history is preserved. Missing instances
are generated from each medication's start date through the cutoff even when those
days were never viewed. Each scheduled time is a separate dose: two untaken times
produce two overdue rows, and each dose list shows a red overdue-dose count.

History generation runs in bounded date windows and records coverage per medication
version in the same mock database. Repeated polling reuses that coverage and the
stable dose IDs, preserving taken statuses without duplicating rows. Schedule edits
invalidate coverage so the pending history follows the updated definition.

The overdue query refetches every minute, allowing any pending dose to become
overdue when its grace period expires. Its cutoff is the next local midnight,
capped by the endpoint at the current time, so future doses are excluded.
A failed request shows a retry
action. The regular date-range endpoint still materializes requested doses; background
generation while the application is closed remains part of backend integration;
reopening the application catches up the missed schedule instances.

`GET /api/circles/:circleId/medication-occurrences` generates doses from saved
definitions for the requested UTC `[from, to)` window, up to 366 days per request.
Generation uses the medication's own time zone, selected weekdays, inclusive start,
and inclusive course ending. Today on both pages means the viewer's local calendar
day; dose times are displayed in the viewer's local time zone. The schedule cards
continue to show their original time zone and clock times.

Dose IDs are stable per medication and instant. Repeated loads reuse the saved
record and its status rather than adding duplicates. Editing a schedule refreshes
pending metadata and removes obsolete pending occurrences within the requested
window. Taken records retain their original name, dosage, person, and time as history.
Deleting the medication still removes its occurrences, as stated in the confirmation.

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
Undoing a taken occurrence whose schedule time was removed returns `409 schedule_conflict`;
its taken record is retained rather than becoming pending and disappearing on reload.

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
the same browser origin. Real multi-device storage still needs backend transactions
and conditional version checks when medication endpoints are implemented.

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

The real backend and reminder delivery while the app is closed remain to be
implemented. Doses are currently materialized by mock API reads; these panels do
not send browser notifications, emails, or background notifications.
