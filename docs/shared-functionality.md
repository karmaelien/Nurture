# Shared Functionality

This checklist defines the frontend behavior and presentation shared between routes
and between a page's list, warnings, and calendar popups. Integration checks use the
application routes and mock API; browser checks use the running desktop website.

## Collection Controls

| Function | Surfaces compared | Shared behavior and presentation | Evidence |
| --- | --- | --- | --- |
| Navigation | Home, Tasks, Appointments, Medications, Expenses, Documents, Family/profile routes | AppHeader supplies the same tabs, active state, account controls, and family-preserving links. ScrollRestoration handles page navigation. | `home/dashboard.test.tsx`, `profiles/profile-pages.test.tsx`; shared AppHeader/AppLayout |
| Family selection | The six collection pages | Switching families discards open editors and local notices. Returning restores that family's saved person selection without reopening the editor. | `care/filter-parity.test.tsx` |
| Person selection | The six collection pages | Care profile offers Everyone or one person. Selection follows navigation, is isolated by account/family, and filters actual records. | `care/filter-parity.test.tsx`, `care/selection.test.tsx` |
| Clear filters | The six collection pages | Restores Everyone and the current page's extra filters to defaults. Also resets the shared medication schedule date and medication-name selection. | `care/filter-parity.test.tsx`; each toolbar's reset handler |
| Filter layout | The six collection pages | Shared labeled field controls and compact field widths; Clear filters and Add/Upload align with the input bottoms. | Desktop browser measurements: all six toolbars aligned; person controls 192 × 48px with matching font, border, color, and radius |
| Read loading/error/retry | Collection lists, Home panels, medication schedule, document preview, task/medication calendar requests | QueryFeedback keeps feedback inside the relevant workspace and uses the same Try again action. Existing filters remain usable. | `care/filter-parity.test.tsx`, feature-page and calendar tests; shared QueryFeedback |
| Warning summaries | Home, Tasks, Appointments, Medications | AttentionNeeded supplies compact count buttons, state/error handling, capped detail popups, and the same semantic colors. Urgent categories precede reminders/today categories. | `home/HomeAttention.test.tsx`, task/medication/appointment tests; shared AttentionNeeded |

## Record Actions

| Function | Surfaces compared | Shared behavior and presentation | Evidence |
| --- | --- | --- | --- |
| Create task, appointment, medication, expense | Home and the corresponding feature page | The same editor/form handles prefill, validation, submit, errors, and saved records. Save preserves filters. | `home/home-panels.test.tsx`, `home/home-tasks.test.tsx`, feature tests; browser comparison of all four dialog pairs found matching fields, dimensions, and action styles |
| Edit/delete appointments | Home, Appointments, warnings, calendar details | AppointmentListItem supplies the same actions, date range, map link, caregiver, and overdue/completed treatment. AppointmentEditor handles edits and deletion confirmation. | `home/dashboard.test.tsx`, `care/calendar-parity.test.tsx`, appointment tests |
| Complete/restore appointments | Home, Appointments, both warning popups, calendar item/day popups | One shared per-appointment write guard prevents duplicates across views. Status action shows loading, edit/delete are disabled during the write, and failures appear beside the affected item, including inside a popup. | Six surface cases in `care/shared-actions.test.tsx` |
| Task rows and status | Home, Tasks, warnings, calendar details | TaskListItem supplies the same title typography, status badge, actions, completed timestamp, pending/error handling, and completion/undo write. | `care/shared-actions.test.tsx`, `home/home-tasks.test.tsx`, `tasks/TasksPage.test.tsx` |
| Task edit/delete | Home, Tasks, calendar/warning details | TaskEditor/TaskDeleteDialog supply the same validation, version checks, confirmation, busy dismissal guard, errors, and cache updates. | `tasks/TasksPage.test.tsx`, `tasks/TaskCalendar.test.tsx` |
| Task recurrence | Home and Tasks creation/editing | TaskEditor/TaskRepeatFields supply the same schedule, end rules, occurrence editing, and stop-repeating behavior. Schedule management remains on Tasks. | Task recurrence/editor tests; shared editor/fields |
| Medication edit, stop, restart, delete | Home and Medications; edit/delete also in calendar details | MedicationPanel/MedicationEditor share fields and action styles. Restart creates a new course. Stop retains history; permanent deletion uses the same history-removal confirmation. | Parameterized Home/Medications cases in `medications/MedicationsPage.test.tsx`, medication/calendar parity tests |
| Medication scheduling | Home and Medications | The shared editor supplies selected weekdays, dose times, time zone, start/end range, grace period, and reminder settings. Existing history rules do not depend on the entry page. | `medications/MedicationsPage.test.tsx`; shared MedicationEditor |
| Dose taken/pending, timestamps, missed doses | Home, Medications schedule/warnings, calendar details | MedicationDoseList supplies the same item/status/action styles and writes. Missed, pending, then taken ordering, taken timestamps, independent missed occurrences, and date-scoped totals use the same implementation. | Medication page/calendar tests and shared MedicationDoseList |
| Notification controls | Home and Medications | The same control observes subscription state across navigation, enables/disables, displays failures, and hides when unsupported. | `care/notification-parity.test.tsx` with mocked browser notification services; underlying notification service tests |
| Expense creation and totals | Home and Expenses | Shared ExpenseForm, create mutation, recipient selection, money formatting, and month-to-date query boundaries. | `home/home-panels.test.tsx`, `home/dashboard.test.tsx`, `expenses/ExpensesPage.test.tsx` |

## Dialogs And Calendars

| Function | Surfaces compared | Shared behavior and presentation | Evidence |
| --- | --- | --- | --- |
| Form/confirmation dismissal | Care editors and expense/document dialogs | FormDialog supplies Close, Escape, click-away, focus return, dimensions, and pending-write dismissal protection. Idle Cancel retains its contextual editor/confirmation behavior. | Editor, deletion, and document/expense tests; shared FormDialog |
| Duplicate submission/deletion | Shared editors and expense/document confirmations | Synchronous guards claim a write before React disables controls; failures keep the dialog and draft available. | Task/medication/appointment tests, `care/deletion-parity.test.tsx` |
| Calendar navigation | Appointments, Medications, Tasks | CalendarToolbar supplies Daily/Weekly/Monthly, Today, date picker, previous/next, and consistent view/action styling. Local calendar boundaries and preferred month-day navigation apply to all three. | `care/calendar-parity.test.tsx`, individual calendar tests |
| Date/item/overflow popups | All three calendars | CalendarDetailsDialog supplies date/person context, Add placement, bounded content, and dismissal. Add prefills the chosen date/person; editing closes details before opening the editor. | Calendar parity tests; desktop browser comparison of the three popups |
| Calendar status and refresh | All three calendars | Compact completed/taken blocks use strikethrough and urgent blocks use the shared danger treatment. A failed read/filter change closes details; retry/restoring filters does not resurrect an old popup. | Individual calendar tests, `care/shared-actions.test.tsx` |

## Other Reused Forms

Setup and My profile use ProfileFields, profileSchema, and useUpdateProfile for the
same name/phone/time-zone fields and saved user record. Setup advances after saving;
My profile stays on its page with saved feedback. Setup and Add person use the same
AddRecipientForm/RecipientFields and mutation. Recipient editing also uses
RecipientFields; relationship-only changes stay a separate operation. These paths
are exercised in `setup/setup-flow.test.tsx` and `profiles/profile-pages.test.tsx`.

Documents has one feature page, so its upload/edit/sharing/preview workflows are
not separate Home implementations. Its shared person filter, fields, dialogs,
read feedback, action variants, and destructive-write guards follow the contracts
above. A workspace save notice survives an edited title leaving the active search.

## Data Scope And Explicit Variations

- The Appointments page's top today/overdue counts cover everyone in the selected
  family, as requested. Its list and calendar follow Care profile. Home's attention
  summary follows Home's selected person.
- Home shows its overview windows; calendars show the viewed date range. Home
  retains today's task completions for undo. A calendar cannot display an undated
  task; the task lists can.
- Item-specific filters retain their requested behavior: Tasks/Documents use text
  search; Medications has a searchable medication-name selection; Expenses has
  period/category filters. These are additional filters, not alternative person
  selectors.
- Appointments have duration and overlapping intervals. Tasks and doses are points
  on the hourly calendar. The common navigation and popup controls are shared;
  those domain-specific event representations remain distinct.
- Expense editing/deletion and document workflows live on their feature pages.
  Home's expense card is a summary with the shared creation form, not another
  expense-record list.
