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

Dose completion, recurring schedule generation, reminders, and
the real backend are still to come. This page does not infer a medication's full
schedule from historical doses or generate new occurrences.
