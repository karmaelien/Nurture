# Tasks

The initial Tasks page at `/app/tasks` lists the selected family's saved tasks.
The shared header links to it from every page using AppLayout. Care-profile and
status filters apply to the list; pending tasks appear before completed tasks,
with dated tasks ordered by due time and undated tasks afterward. Pending tasks
past their due time show Overdue. The display updates each minute.

Search tasks matches task titles, ignoring case and surrounding whitespace. The
Caregiver filter supports all caregivers, a named family member (with You beside
the signed-in member), or Unassigned. Search and assignment combine with the
care-profile and status filters and apply to both the main list and calendar,
including calendar popups. Clear filters resets all four controls. Filtering is
local to the returned list/visible calendar range and does not change saved tasks
or require a request for each keystroke. Changing filters closes a calendar popup
so its actions cannot target a task hidden by the new selection.

Attention Needed remains based on the selected care profile's pending deadlines;
title, caregiver, and status filters do not hide those reminders. Repeating Tasks
management also keeps its existing profile-only scope so stopping a schedule
remains available when individual occurrences do not match the list filters.
Creating a task clears search and assignment filters along with the existing
profile/status reset so the new pending task is visible. Editing preserves filters.

Add task opens a dialog with a title, care profile, optional caregiver, optional
due date, and optional typed 12-hour time with an AM/PM dropdown. No date means no
deadline; a date without a time means 11:59 PM in the viewer's local time zone.
Invalid calendar dates and nonexistent local times are rejected. Cancel, Close,
Escape, and clicking outside dismiss it without saving. Dismissal and repeated
submissions are blocked while saving. After creation the list shows all profiles'
To do tasks so the new task is visible.

`POST /api/circles/:circleId/tasks` accepts `{ recipientId, title, dueAt,
assignedCaregiverId }` and returns `201 { task }`. Titles are trimmed and limited
to 200 characters. New tasks have status `pending` and `completedAt: null`. The
mock checks current family membership and profile/caregiver assignments before
writing to the existing browser database. A failed persistence check returns 503.
Successful creation refreshes all task queries, including Home's task panel.
Home includes undated tasks alongside its date-bounded list. The API persists due
times as UTC and displays them in local time.

Each task has Mark Completed / Mark To Do controls shared by Tasks and Home.
Completion records the save time; undo clears it. Completed tasks stay visible
below pending tasks when the status filter includes them. Home counts only pending
tasks and retains today's completed tasks in its date-bounded panel for undo.
Both lists have capped scrolling areas.

Home's Tasks panel also has Add Task, using the same editor, repeat controls, and
save/cancel behavior as Tasks. Creation prefills the selected care profile; after
saving, Home shows all profiles so a task assigned to another profile is not hidden
by the old selection. Its list and outstanding count include pending undated tasks,
overdue tasks, and dated tasks within its existing next-seven-days window. Today's
completed undated tasks remain visible for undo; earlier completions stay on Tasks.
Undated tasks appear after dated pending tasks and do not create calendar entries
or deadline reminders. A task dated beyond Home's window is saved and accessible
on Tasks. Add Task remains available when the list is empty or fails to load, but
is disabled until family details load successfully or if there are no care profiles.

## Calendar

Tasks has a full-width calendar below its list, using the appointment/medication
calendar styling. Daily and Weekly views use hourly rows; Monthly uses fixed-height
day cells. The calendar has its own capped scrolling area. Today and Previous/Next
navigate the visible period, and month navigation restores the preferred day after
shorter months. Local date boundaries keep deadlines on the correct dates across DST.

The calendar shares the list's care-profile/status filters and task API, and requests
its visible date range so later recurring occurrences are generated on demand.
It places tasks at their due date/time; tasks have deadlines, not invented durations.
Undated tasks remain available in the main list. Completed blocks use strikethrough;
pending tasks past their deadline have a red overdue outline. Month cells show up
to three tasks with a more button. Hourly rows place up to three tasks side by side;
their overflow opens only that hour's tasks.

Click a month date/cell or a day/week heading for that day's filtered task list,
including empty dates. Individual blocks open Task Details. Popups use the same
completion, Edit task, and Delete task controls as Tasks/Home. Add task prefills
the clicked due date and current profile; leaving time blank means end of that day.
The popup closes before an editor or delete confirmation opens, avoiding stacked
dialogs. Close, Escape, and click-away dismiss the popup. Profile/status changes,
failed refreshes, or removal of a selected individual task hide stale controls.
All task writes refresh both calendar and lists. Existing version checks, write
locking, and persistence failures apply to calendar actions as well.

## Repeating Tasks

Add task supports Does not repeat, Daily, and Weekly. Daily accepts an interval in
days; Weekly accepts an interval in weeks and selected Sunday–Saturday checkboxes
with Select all. Repeating tasks require a due date. That date anchors the schedule;
weekly occurrences follow the selected weekdays on or after it. Blank time means
11:59 PM. Before weekdays are explicitly selected, the weekly default follows the
chosen due date; later date changes preserve manually selected weekdays.
Schedules retain the browser's time zone at creation, preserving wall-clock
times across DST; spring-forward gaps shift forward and repeated times use the first
instant. The list displays the schedule and a readable time-zone name.

Repeat ends can be No end date, an inclusive last date, or a number of occurrences
(1–36500). Counts refer to the original schedule from its anchor date. Occurrences
before creation are never invented; an already-ended course is rejected. Select a
future anchor if the full requested count should remain. Existing one-off tasks and
their saved data remain unchanged.

Each occurrence is a separate versioned task with its own due time, completion
timestamp, and stable series/date ID. Editing or completing one does not change
other occurrences. Deleting one stores an exception so future reads cannot recreate
it. Changing an occurrence's date/profile or removing its due date is preserved when
the schedule is read again; the original slot is not duplicated.

Stop repeating is available in an occurrence's editor and in the collapsed Repeating
Tasks section below the list. The section follows the profile filter but remains
available regardless of status or whether any occurrence is visible. Confirmation
removes future pending tasks and prevents further generation, keeping past tasks,
undated tasks, and completed occurrences. Removed edited occurrences also receive
exceptions so their original slots cannot reappear. Stopping checks the saved series
version; Close, Escape, Keep repeating, and click-away cancel, and dismissal is
blocked while saving. To change the repeat pattern, stop it and add a new schedule.

The mock stores series and deletion exceptions in the same browser database as tasks.
Reads generate at most 366 calendar dates per series per request. Ordinary list/Home
queries fill history and the next month (or their explicit due-before boundary),
while calendar queries generate only their selected ranges. Progress is persisted;
partial history retries automatically in bounded batches and shows a loading message
and an “At least” count on Home. All generation, task writes, deletion exceptions,
and series stops share the existing Web Lock. Read generation does not change the
cross-tab user-write marker, preventing refresh loops. Browser storage failures
return 503. The frontend continues to use this browser database; the staged PostgreSQL
implementation is described below.

`POST /api/circles/:circleId/tasks` optionally accepts `recurrence: { unit: 'days' |
'weeks', interval, daysOfWeek, timeZone, end }`. End is `{ kind: 'never' }`,
`{ kind: 'onDate', date }`, or `{ kind: 'afterOccurrences', count }`. The response
contains the first remaining occurrence. Details PATCH still edits one occurrence
and does not accept a recurrence definition. `GET .../tasks` adds `historyPending`
and profile-filtered `series` summaries to its response. Occurrence responses carry
`seriesId`, `seriesVersion`, `seriesStoppedAt`, `seriesTitle`, and `seriesDescription`.

`POST /api/circles/:circleId/task-series/:seriesId/stop` accepts `{ version }` and
returns 204. It checks authentication and current family membership, rejects a stale
series version with 409, and is idempotent with the already-stopped current version.

## Task Reminders

Home and Tasks share an Attention Needed panel for pending tasks past their deadline
or due within the next hour (inclusive). A task due exactly now is Due soon; after
its deadline it is Overdue. Completed tasks and tasks without deadlines do not alert.
The panel follows each page's care-profile selection, independently of the Tasks
status filter, so selecting Completed cannot hide pending deadlines. It uses the
existing authenticated task API and saved occurrence records, including separate
occurrences of repeating tasks; it does not create reminder copies of tasks.

The panel shows overdue and due-soon counts. View task reminders expands a capped
scrolling list, ordered overdue first, then due soon. Hide task reminders collapses
it. The shared rows support completion, edit, and delete with the same confirmations,
click-away behavior, version checks, and persistence as the main lists. Completing,
deleting, or moving a deadline out of the window removes it from attention after
the successful save; marking it To Do makes it eligible again. Main list rows also
show Due soon during the one-hour window. When no tasks need attention the panel
is hidden. Partial repeating-task history is labeled At least while loading.

Time-dependent labels update each minute; requests refresh each minute and on window
focus. A failed reminder request hides its cached details and provides Retry task
reminders, including for 502 errors. These reminders appear while the website is
open; browser push, email, and background delivery are not implemented for tasks.

## Individual Task Changes

Delete task is available on Tasks and Home. Its red-outline action opens a shared
confirmation naming the task; deletion is permanent, including the completion record
for a completed task. Keep task, Close, Escape, or clicking outside cancels without
saving. While deleting, repeat clicks and dismissal are blocked. The confirmation
keeps the version from when it opened, so another caregiver's edit or completion
causes 409 instead of deleting the changed task. Failed saves leave the task stored
and the confirmation retryable. Successful deletion refreshes every task list and
Home's outstanding count and survives page refresh.

`DELETE /api/circles/:circleId/tasks/:taskId` accepts `{ version }` and returns 204.
It checks the session, current family membership, task ownership, and version under
the same browser database lock as task edits and status writes. Invalid version
input returns 400, missing session 401, unavailable task/family 404, stale version
409, and failed browser persistence 503. The staged backend implements the same
deletion contract using a PostgreSQL transaction.

Edit task is available in both Tasks and Home and opens the shared Add/Edit form.
It prefills the title, care profile, caregiver, and due date/time. Saving details
preserves completion status and its timestamp. An unchanged due date/time retains
its exact stored instant, including seconds and repeated daylight-saving hours.
Clear both due fields to remove a deadline; select Unassigned to remove the caregiver.
Editing preserves current page filters, so moving a task to another profile or outside
Home's date range can remove it from that list. The task remains saved on Tasks.
Close, Cancel, Escape, and click-away discard the draft; dismissal and duplicate
submissions are blocked while saving. Failed saves keep the draft visible. A stale
version refreshes the lists but keeps the editor's original version: close and reopen
to review the latest task rather than silently overwriting another caregiver's change.

`PATCH /api/circles/:circleId/tasks/:taskId` accepts `{ status, version }` or the complete
`{ recipientId, title, dueAt, assignedCaregiverId, version }` details and returns
`{ task }`. New tasks start at version 1; legacy browser tasks receive version 1
without resetting their data. Changed details or status increment the version. Repeating
the current status with the current version leaves its timestamp and version intact.
The mock checks current membership and task ownership on every request. A stale
version returns 409, including when another user completed and then reopened the
task. The UI refreshes on 404/409 and displays the error. Failed persistence returns
503 without displaying an unsaved completion. Repeated clicks are blocked while saving.

All mock handlers share a browser Web Lock around their database operations so
simultaneous tabs cannot overwrite the shared database snapshot. Unsupported
browsers return 503. Task queries refresh after successful mutations, on window
focus, and every minute. This mock uses browser storage; it does not synchronize
different devices or provide real multi-user server persistence.

## Staged PostgreSQL Backend

The task controller, model, validators, and router in `nurture-api` implement the same
list/create/edit/status/delete/stop-series contract as the browser mock, including
`includeUndated` and recurring-task metadata. The migration
`1795824000000_create-tasks.sql` creates `tasks`, `task_series`, and
`task_occurrence_exceptions` in the application's existing PostgreSQL database.
No new production database is created. Only schedule/date exceptions remain after
deleting an occurrence; its details and completion record are removed.

Routes mount after authentication only when `ENABLE_TASKS_API=true` is set before
starting the server. This flag has not been enabled, and frontend mock routing has
not changed. Activation requires running the existing migration command against
the configured application database and connecting the frontend/authentication/family
endpoints to the real API together. Browser mock data is not automatically imported.
Do not enable the flag alone and expect the mock frontend to use PostgreSQL.

Each request checks current family membership inside a transaction and keeps that
membership locked until commit. Task writes lock their parent series (if any) before
the occurrence, compare the submitted version, and then save/delete. Concurrent stale
edits return 409, and repeated status saves at the current version preserve timestamps.
Generation and stop operations lock the same series, preventing duplicate occurrences
and regeneration after a stop. Reads generate bounded batches (366 dates per series),
persist progress, and preserve individually edited and deleted slots. List generation
locks series in a consistent order; it does not take an exclusive lock on the family row.
Database failures roll back the whole request and use the shared backend error handler.

Run `npm run test:tasks` from `nurture-api` after repository dependencies are installed.
Unit tests cover schedule parity with the frontend, DST, history bounds, and strict
validation. To include integration tests, set `TASK_TEST_DATABASE_URL` to a separate
local test database whose name contains `test` and differs from `DATABASE_URL`.
The integration suite uses and removes an isolated schema, applies all migrations,
and checks real concurrent reads/writes, access revocation, rollback, occurrence
exceptions, stopping schedules, and the task migration's down operation. It never
runs against the application's configured database.

Task background push/email delivery remains a separate step; current task reminders
are in-page only.
