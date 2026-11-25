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

This increment implements listing and basic creation in the browser mock. Editing,
deletion, completion actions, recurrence, reminders, and a real PostgreSQL task API
remain separate steps. The existing empty backend task controller is not wired up
by this change.
