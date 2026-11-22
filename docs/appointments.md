# Appointments

## Open the feature

From Home, choose **Appointments** in the top navigation or click the appointments card heading. Both open `/app/appointments` for the selected family. The top navigation is shared between Home and Appointments. Opening a protected page while signed out takes you to login, and successful login starts at Home.

Home and Appointments read the same records for the selected family. In demo mode, the browser mock saves changes in localStorage, so they survive a refresh in that browser.

## Display and selection rules

| Where | Who appears |
| --- | --- |
| **Appointments → Today banner** | Everyone in the selected family. It always appears and counts scheduled visits starting today in local time, including earlier today. Open it to see today's visits, including any completed ones. |
| **Appointments → Overdue banner** | Everyone in the selected family. The red banner appears only when at least one scheduled visit has reached its recorded end time. It stays visible if you deselect the person's profile below. Open it to see overdue visits for the whole family. |
| **Appointments → Upcoming appointments list** | Only selected care profiles. The filter applies to both overdue and upcoming rows. For example, if Rose has an overdue visit and only Frank is selected, Rose's visit disappears from this list and still counts in the red banner. |
| **Appointments → Calendar** | Only selected care profiles, within the visible calendar period. |
| **Home → Appointments list and Overdue banner** | Both follow Home's **Showing** selection. Home starts on **Everyone** in the selected family. |

On Appointments, all profiles start selected. Search narrows the dropdown choices. **Select all**, **Select with upcoming appointments**, and **Clear selection** apply to all profiles regardless of the search text. **Remove** deselects that profile. The two top metrics cover everyone in the selected family. The selection summary and each profile's count cover the applicable profiles.

Home and Appointments use the same upcoming window, from now through exactly seven 24-hour periods from now, including both endpoints. Upcoming counts include scheduled visits in that window. Overdue visits appear first in the main appointment lists with a red **Overdue** badge. Completed visits in the window remain visible at the bottom with a checkmark. Each group is sorted by start time. Clicking a profile's upcoming count opens that person's seven-day list, which can still contain completed visits when the count is zero.

The two panels on Appointments scroll internally. The Home appointment list also scrolls. Appointment cards show the title, care profile, date and time, location, and caregiver. A location opens a Google Maps search in a new tab. An unassigned caregiver is labelled **Unassigned**. For visits crossing midnight, both dates are shown.

## Create, edit, and complete a visit

- Use **Add appointment** on Appointments. Choose a care profile, enter a title, and set the start and end times. Location and caregiver are optional.
- Choose the date separately, type a time such as `9:30`, and use the AM/PM dropdown. Leave the end date blank for a same-day visit. The end must be after the start. An older record without an end time needs one when you save an edit.
- Use **Edit appointment** on Home or Appointments to change a visit or reschedule it. The same editor handles both pages. **Delete appointment** asks for confirmation.
- Use **Mark completed** on a card or in calendar details. The visit drops out of scheduled counts and overdue warnings. **Mark as to do** restores its scheduled status, so the existing date and profile filters apply again.
- Save, delete, and completion actions refresh appointment data for both pages. The editor blocks a second submission while a write is in progress. Completion uses the saved record returned by subsequent queries.

## Calendar

- Monthly is the initial view. Daily and Weekly use a 24-hour timeline and weeks start on Sunday. Month navigation preserves the preferred day through shorter months. For example, January 31 through February to March lands on March 31.
- Monthly cells show up to three appointment chips. The remaining count opens the full day's list. Clicking a compact chip opens details. Close, Escape, and clicking outside dismiss appointment dialogs.
- Daily and Weekly position appointments by time and show overlapping blocks side by side. Overnight visits are clipped at midnight. A visit that ends exactly at midnight does not appear the following day.
- A record without an end time displays only its start time and gets a short calendar block limited to its start date. These records do not trigger overdue warnings.
- The timeline draws each wall-clock hour once. During the fall daylight-saving change, visits in the repeated hour share columns if they occupy the same space on the grid. Overdue calendar entries show a red triangle, and completed entries have crossed-out titles.

## Code and data

| File | Responsibility |
| --- | --- |
| `client/src/features/appointments/AppointmentsRoute.tsx` | Loads the selected family and its saved appointments and opens the editor |
| `client/src/features/appointments/AppointmentsPage.tsx` | Profile selection, totals, banners, and lists |
| `client/src/features/appointments/AppointmentCalendar.tsx` and `calendar-layout.ts` | Calendar views, dialogs, clipping, and overlapping blocks |
| `client/src/features/appointments/AppointmentEditor.tsx` | Shared editor, validation, writes, and deletion confirmation |
| `client/src/features/appointments/AppointmentListItem.tsx` and `OverdueAppointmentsWarning.tsx` | Shared cards and overdue warning |
| `client/src/features/appointments/appointment-window.ts` and `appointment-overdue.ts` | Shared date-window boundary and overdue rule |
| `client/src/features/home/useHomeAppointments.ts` and `HomeAppointmentsPanel.tsx` | Home's appointment query, count, person filter, and list |
| `client/src/mocks/appointmentHandlers.ts` | Demo create, edit, status update, and delete requests |

The API returns ISO timestamps, which the UI displays in local time. Older records may omit the end time or status. A missing status is displayed as scheduled. The browser mock serves demo requests on the frontend origin. An unhandled 404 includes the request method and API path to help spot a routing issue.

### PostgreSQL integration

The standalone backend router implements appointment listing, creation, editing, completion, and deletion. It checks family membership and verifies that the appointment exists in that family before validating an update. The migration adds the table to the project's PostgreSQL database and requires PostgreSQL 15 or later. The router is currently unmounted. See the [API contract](api-contract.md) for the request and response shapes.

To run the backend integration test, install the dependencies in `nurture-api`, set `APPOINTMENT_TEST_DATABASE_URL` to a local database named `nurture_appointments_test`, and run `node --test tests/appointments/appointments.integration.test.cjs` from `nurture-api`. The test uses an isolated schema and removes it afterward.

## Verification

From `client/`, run:

```sh
npm run typecheck
npm run lint
npm test -- src/features/appointments src/features/home
```

Run the calendar tests with `TZ=America/New_York` to cover the repeated-hour regression. In PowerShell, set `$env:TZ = 'America/New_York'` before running the tests.

Manual checks:

1. In demo mode, create an overdue visit for Rose and a future visit for Frank. On Appointments, select only Frank. Verify that the right-hand list shows Frank's visits and the red banner still opens Rose's overdue visit. On Home, set **Showing** to Frank and confirm the Home list and banner both follow that selection.
2. Add a visit with a caregiver and location. Edit it from Home, check the time on the calendar, mark it complete, and refresh. Restore it with **Mark as to do**, then delete it and confirm it disappears from both pages.
3. Check a busy day in Monthly, Daily, and Weekly views. Open the monthly overflow, test an overnight visit, and dismiss dialogs with Escape and an outside click. Check keyboard navigation and the date, time, and AM/PM controls on a narrow screen.
