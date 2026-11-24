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

`DELETE` at the same path removes the definition and its stored dose occurrences.
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

Home's Today’s medications panel and Medications' Today’s doses section use the
same occurrence endpoint and shared list component. Both support Mark taken and
Mark pending. Home's completion count and all person-filtered dose queries refresh
after a successful write; a failed write leaves the previous status visible with
an error. The count and list follow the selected care profile.

### Previous days

Both pages also show **Overdue from previous days** when pending doses from
before the viewer's local midnight have passed their grace period. Each row shows
the full scheduled date and time, plus a red tag such as Overdue from yesterday
or Overdue from 2 days ago. These labels count local calendar days. This section follows Home's Showing filter or
Medications' Care profile filter, and it is separate from today's list and totals.
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

The previous-day query refetches every minute, allowing a late-night dose to become
overdue after midnight when its grace period expires. A failed request shows a retry
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
`{ status: 'pending' | 'completed' }` and returns `{ medicationOccurrence }`. The UI
calls completed doses Taken. Every write checks current family membership and the
record's recipient. Obsolete pending doses and missing records return 404. Status
is persisted in the existing mock database and survives a fresh page load.

Reminders and the real backend remain to be implemented. Doses are currently
materialized by mock API reads; this is not a background notification service.
