# Tasks

The initial Tasks page at `/app/tasks` lists the selected family's saved tasks.
The shared header links to it from every page using AppLayout. Care-profile and
status filters apply to the list; pending tasks appear before completed tasks,
with dated tasks ordered by due time and undated tasks afterward. Pending tasks
past their due time show Overdue. The display updates each minute.

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
Home's existing date-bounded list excludes undated tasks; those remain accessible
on Tasks. The API persists due times as UTC and displays them in local time.

Each task has Mark Completed / Mark To Do controls shared by Tasks and Home.
Completion records the save time; undo clears it. Completed tasks stay visible
below pending tasks when the status filter includes them. Home counts only pending
tasks and retains today's completed tasks in its date-bounded panel for undo.
Both lists have capped scrolling areas.

`PATCH /api/circles/:circleId/tasks/:taskId` accepts `{ status, version }` and returns
`{ task }`. New tasks start at version 1; legacy browser tasks receive version 1
without resetting their data. A changed status increments the version. Repeating
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

This increment implements listing, creation, and completion in the browser mock. Editing,
deletion, recurrence, reminders, and a real PostgreSQL task API
remain separate steps. The existing empty backend task controller is not wired up
by this change.
