# Tasks

The initial Tasks page at `/app/tasks` lists the selected family's saved tasks. The
shared header links to it from every page using AppLayout. Care-profile and status
filters apply to the list; pending tasks appear before completed tasks, with dated tasks
ordered by due time and undated tasks afterward. Pending tasks past their due time show
Overdue. The display updates each minute. The main list includes tasks due before local
midnight seven days ahead, plus undated tasks and earlier deadlines. The calendar has
its own visible range; browsing future months does not add those occurrences to the
current list.

Its header, grouped search/dropdown toolbar, right-aligned Add task action, and workspace cards follow the [shared page design](medications.md#shared-page-design).

Search tasks matches task titles, ignoring case and surrounding whitespace. The
Caregiver filter supports all caregivers, a named family member (with You beside
the signed-in member), or Unassigned. Search and assignment combine with the
care-profile and status filters and apply to both the main list and calendar,
including calendar popups. Clear filters resets all four controls. Filtering is
local to the returned list/visible calendar range and does not change saved tasks
or require a request for each keystroke. Changing filters closes a calendar popup
so its actions cannot target a task hidden by the new selection.

Attention Needed remains based on the selected care profile's pending deadlines; title,
caregiver, and status filters do not hide those reminders. Repeating Tasks management
also keeps its existing profile-only scope so stopping a schedule remains available when
individual occurrences do not match the list filters. Creating a task clears search and
assignment filters along with the existing profile/status reset. Tasks beyond the main
list date limit are available through the calendar. Editing preserves filters.

Add task opens a dialog with a title, care profile, optional caregiver, optional
due date, and optional typed 12-hour time with an AM/PM dropdown. No date means no
deadline; a date without a time means 11:59 PM in the viewer's local time zone.
Invalid calendar dates, year zero, and nonexistent local times are rejected consistently by the form, browser API, and backend. Cancel, Close,
Escape, and clicking outside dismiss it without saving. Dismissal and repeated
submissions are blocked while saving. After creation the list shows all profiles'
To Do tasks; later deadlines are available in their calendar period.

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
below pending tasks when the status filter includes them. Home retains today's completed tasks in its date-bounded panel for undo.
Both lists have capped scrolling areas.

Home's Tasks panel also has Add Task, using the same editor, repeat controls, and
save/cancel behavior as Tasks. Creation prefills the selected care profile; after
saving, Home shows all profiles so a task assigned to another profile is not hidden
by the old selection. Its list includes pending undated tasks,
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
queries fill history through their explicit due-before boundary,
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
`seriesId`, `seriesVersion`, `seriesStoppedAt`, `seriesTitle`, and `seriesDescription`. Moving an individual occurrence to another care profile preserves this metadata on filtered reads. Only that occurrence moves; the original schedule and its management scope stay with the original profile. Reading the moved occurrence does not generate tasks for the original profile.

`POST /api/circles/:circleId/task-series/:seriesId/stop` accepts `{ version }` and
returns 204. It checks authentication and current family membership, rejects a stale
series version with 409, and is idempotent with the already-stopped current version.

## Task Reminders

The Tasks page has an Attention Needed panel for pending tasks past their deadline
or due within the next hour (inclusive). A task due exactly now is Due soon; after
its deadline it is Overdue. Completed tasks and tasks without deadlines do not alert.
The panel follows each page's care-profile selection, independently of the Tasks
status filter, so selecting Completed cannot hide pending deadlines. It uses the
existing authenticated task API and saved occurrence records, including separate
occurrences of repeating tasks; it does not create reminder copies of tasks.

The panel shows compact count buttons, overdue first and due soon second. Each opens the shared capped, scrolling popup; Close, Escape, and clicking outside dismiss it. The shared rows support completion, edit, and delete with the same confirmations,
click-away behavior, version checks, and persistence as the main lists. Completing,
deleting, or moving a deadline out of the window removes it from attention after
the successful save; marking it To Do makes it eligible again. Main list rows also
show Due soon during the one-hour window. When no tasks need attention the panel
is hidden. Partial repeating-task history is labeled At least while loading.

Time-dependent labels update each minute; requests refresh each minute and on window
focus. Attention uses a stable daily query range covering the following midnight plus
one hour, then applies the exact one-hour cutoff locally. Minute ticks reuse the
existing data and open popup during background refresh. A new day or profile shows
loading without exposing the previous profile’s rows; errors hide cached details. A
failed reminder request hides its cached details and provides Retry task reminders,
including for 502 errors. These reminders appear while the website is open; browser
push, email, and background delivery are not implemented for tasks.

Home has a single summary: the full-width Attention Needed section. The former
Outstanding Tasks, Today’s Doses Completed, and Upcoming Appointments metric cards
are removed. Attention Needed shows counts for overdue tasks,
overdue appointments, and missed medication doses. It follows Home's Showing
filter. Each count opens its category in the same shared popup used by feature pages, with a link to open that feature page in the selected family. It excludes
due-soon tasks and medication reminders, completed items, and undated tasks. Missed
doses count individual occurrences (including multiple missed takes of one medication)
and use the API's total across pages. Unfinished history is labeled At least;
unavailable counts show an error and Retry rather than zero. An access failure hides
all cached summary counts. The section disappears when all three feeds finish with
zero overdue items. Home no longer duplicates the individual task, appointment, or
medication attention panels. Its ordinary lists and their existing controls remain.

## Individual Task Changes

Delete task is available on Tasks and Home. Its red-outline action opens a shared
confirmation naming the task; deletion is permanent, including the completion record
for a completed task. Keep task, Close, Escape, or clicking outside cancels without
saving. While deleting, repeat clicks and dismissal are blocked. The confirmation
keeps the version from when it opened, so another caregiver's edit or completion
causes 409 instead of deleting the changed task. Failed saves leave the task stored
and the confirmation retryable. Successful deletion refreshes every task list and
Home's attention summary and survives page refresh.

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
membership locked until commit. Task writes lock their parent series (if any) before the
occurrence, compare the submitted version, and then save/delete. Concurrent stale edits
return 409, and repeated status saves at the current version preserve timestamps.
Generation and stop operations lock the same series, preventing duplicate occurrences
and regeneration after a stop. Reads generate bounded batches (366 dates per series),
persist progress, and preserve individually edited and deleted slots. Ordinary reads do
not lock every schedule. They check generation progress without a lock and only acquire
a parent lock for an unfinished schedule, rechecking its progress after locking. Busy
parents are skipped with `FOR UPDATE SKIP LOCKED`; the response sets `historyPending` so
existing polling retries missing history. Completed ranges remain readable while their
parent is locked. Profile-filtered requests inspect only that profile’s schedules. Other
schedules continue generating while one is busy. Inserts, progress updates, and parent
locking remain transactional, and writes retain their version checks and
parent-before-occurrence order. Database failures roll back the whole request and use
the shared backend error handler.

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
