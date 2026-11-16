# Appointments

## Current scope

The appointments page is a frontend preview with local appointment completion at `/app/appointments`, behind the existing session guard. Log in using the instructions in the [client README](../client/README.md). Opening a protected route while logged out redirects to `/login`. Successful login always goes to Home (`/app`), including when the login URL contains an old `next` parameter; the originally requested page is not preserved.

From the home dashboard, open Appointments in the top navigation between Care and Expenses, or click the appointments panel's heading/icon area. Both links navigate to `/app/appointments`. The appointments page scrolls to the top on entry, regardless of the dashboard's previous scroll position.

`client/src/layouts/AppLayout.tsx` owns the shared top bar for `/app` and `/app/appointments`, including the logo, navigation, and logout. The active page is highlighted. Care and Expenses navigate to their dashboard sections. React Router's scroll restoration handles new-page scrolling, history positions, and section anchors.

The home appointments card scrolls internally after a maximum list height of 26rem. List cards show their information and completion action directly, without opening an additional per-appointment popup. Completed entries remain visible at the bottom, with a completed checkmark and a Mark as to do action, while the upcoming metric excludes them. All appointment lists use this ordering, chronological within scheduled/completed groups. Compact calendar blocks retain strikethrough for completion and open details when clicked. The dashboard still uses its existing API/mock dataset, separate from the appointment page's preview; completion state is local to the dashboard and is not shared between pages or saved across reloads. Dashboard records currently lack end times, so their cards show only the start time.

The page currently uses local dummy data, not the appointment API or MSW appointment responses. It has 12 Alvarez family care profiles and 32 appointments, including three today. Dates are generated relative to the page's initial load, in the browser's local timezone. Refreshing regenerates the preview and resets profile selection and completion changes. These appointments are not saved to localStorage.

## Display and selection rules

- Appointment list entries share one layout: title, care profile, a single date with the time range, then location (map pin) and caregiver (group icon) side by side. Location text opens a Google Maps search in a new tab; missing locations remain plain text. Mark completed / Mark as to do actions appear directly on the cards. Appointments crossing midnight show both dates. Records without an end time show just the start time. Rescheduling is not implemented yet.

- All care profiles start selected. Profiles supplied later are also selected unless explicitly excluded.
- The two top metrics count all supplied care profiles and all their upcoming appointments. Selection does not filter these metrics.
- **Upcoming** means a scheduled appointment whose start is between now and exactly seven 24-hour periods from now, inclusive. Invalid time ranges are excluded. The page refreshes its current time every minute.
- Search only filters the dropdown's choices. Select all, Select with upcoming appointments, and Clear selection apply across all supplied profiles, regardless of the search text.
- The selected-profile list shows each person's upcoming count. Remove unselects that profile. The selection summary, upcoming list, and calendar follow the selected profiles.
- Clicking a profile's upcoming count opens that person's appointments in the same seven-day window without changing the selection. Completion acts directly on each card, updates the count, and moves the card below scheduled entries. A zero upcoming count can still open completed entries; an empty message appears only if no entries remain in the window. The list popup supports Close, Escape, and clicking outside.
- The care-profile and upcoming panels have fixed heights and scroll internally. They do not expand into popups.
- The notice below the top metrics always appears. It counts scheduled appointments starting on today's local date across all profiles, including appointments earlier today. It is independent of profile selection and excludes completed and cancelled appointments.
- Clicking the notice opens today's appointments sorted by start time. The popup includes the profile, start/end times, and location, or an empty message. Close, Escape, and clicking outside dismiss it.
- All appointment details show the assigned caregiver's name, or “Unassigned” when no caregiver is supplied. The preview assigns Maya Alvarez to today's Rose and Frank appointments and Rose's annual checkup; assignment editing is not implemented.
- Scheduled appointments have a Mark completed action on list cards and in compact calendar appointment details. Completion removes the appointment from scheduled counts and today's scheduled notice, while keeping it visible below scheduled entries in the upcoming, profile, today, and calendar-day lists. Existing date/profile filters still apply. The calendar retains the event with its title crossed out in Monthly, Weekly, and Daily views.
- Completed appointments have a Mark as to do action. It restores scheduled status and removes the calendar strikethrough; the existing date and profile filters determine which lists/counts include it again. This also works for appointments initially supplied as completed. Completion changes are local to this mounted page, with no API write yet.

## Calendar

- Monthly is the initial view; Daily and Weekly use a 24-hour timeline. Navigation moves one day, week, or month according to the view. Weeks start on Sunday.
- Calendar dates follow the selected period, not the upcoming list's seven-day limit. All supplied appointment statuses are displayed; cancelled entries are labelled.
- Monthly cells show up to three appointment chips. The remaining count opens the full day's list with direct completion/to-do actions. Clicking a compact chip opens its details, with completion/to-do actions, Close, Escape, and outside-click dismissal.
- Daily and Weekly blocks are positioned by start time and sized by duration. Overlapping intervals share columns; an appointment ending exactly when another starts does not overlap. Connected overlap groups use equal column widths, reusing columns as appointments finish.
- Overnight appointments appear on each affected day, clipped at local midnight. An appointment ending at midnight does not occupy the following day.
- Calendar detail/day popups close with Close, Escape, or clicking outside. All appointment popups use the same backdrop-click handler; clicking inside the popup's padding leaves it open.

## Code and data

Home dashboard appointment responsibilities are separated in `client/src/features/home/`: `useHomeAppointments.ts` owns fetching, display-data conversion, local completion state, ordering, and the upcoming count; `HomeAppointmentsPanel.tsx` renders the scrollable panel using the shared `AppointmentListItem`. `DashboardPanel.tsx` supplies the existing shared panel frame and loading/error/empty states. `HomePage.tsx` calls the hook once so its summary count and panel use the same state.

| File in `client/src/features/appointments/` | Responsibility |
| --- | --- |
| `AppointmentsPage.tsx` | Preview data, profile selection/search, overall metrics, today notice, upcoming lists and completion |
| `AppointmentCalendar.tsx` | Calendar views, navigation, day overflow and calendar dialogs |
| `AppointmentDetails.tsx` | Compact calendar appointment details and completion action |
| `AppointmentStatus.tsx` | Shared status badges for appointment lists |
| `AppointmentListItem.tsx` | Shared list layout, date/time range, Maps link, caregiver and direct completion action |
| `appointment-order.ts` | Shared scheduled-first, completed-last list ordering |
| `calendar-layout.ts` | Time-range validation, daily clipping and overlap column assignment |
| `dialog.ts` | Shared backdrop-click dismissal for all appointment dialogs |

`CareProfile` and `AppointmentSummary` are currently defined in `AppointmentsPage.tsx`. Profile identity uses both `circleId` and profile `id`; appointment identity also includes the appointment `id`.

The UI appointment shape requires `id`, `circleId`, `recipientId`, `title`, `startsAt`, `endsAt`, and `status` (`scheduled`, `completed`, or `cancelled`), plus optional `location` and `assignedCaregiver` (`{ id, name }` or `null`). Missing/null caregiver data displays as “Unassigned”. Timestamps are ISO strings, displayed in local time. `endsAt` must be strictly later than `startsAt`.

### Backend integration still needed

The current [API contract](api-contract.md) appointment shape does not include `endsAt`, `status`, or `circleId`; it has nullable `location` and `assignedCaregiverId`. The frontend preview is not yet an implementation of that response shape. Agree on the end-time/status contract and map the circle context and nullable location before connecting it.

Resolve `assignedCaregiverId` against the circle's member users to supply the display object's ID and name. Dummy caregiver names currently do not come from an account lookup.

The calendar needs records overlapping its displayed period. The current contract describes filtering by `startsAt`; that alone can omit an overnight appointment starting before the requested period. Resolve the query behavior during integration.

The single-family preview is dummy data, not access enforcement. Load only the caregiver's authorized family data when connecting profiles and appointments. Appointment creation, editing, deletion, caregiver assignment, recurrence, persisted selection, and reminder delivery are not implemented here.

## Verification

From `client/`:

```sh
npm run typecheck
npm run lint
npm test -- src/features/appointments
```

The current 17 appointment tests cover direct completion from today/upcoming/profile lists and calendar details, restoration across views, Maps links and missing locations, avoiding extra list-card popups, initially completed appointments with date filters preserved, backdrop dismissal, monthly overflow, selected-profile calendar filtering, year/week/day navigation, leap day, duration/overlap rendering, invalid intervals, column reuse, touching intervals, and overnight clipping. They use a jsdom shim for native dialog methods and simulate backdrop coordinates; native Escape, actual browser backdrop targeting, and browser focus behavior need browser checks.

If Windows test startup fails because the default temporary directory denies access, run the tests with a writable temporary directory in PowerShell:

```powershell
$calendarTestTemp = Join-Path (Get-Location).Path 'node_modules\.tmp\calendar-tests'
New-Item -ItemType Directory -Path $calendarTestTemp -Force | Out-Null
$env:TEMP = $calendarTestTemp
$env:TMP = $calendarTestTemp
npm test -- src/features/appointments
```

Manual checks:

1. Open `/app/appointments`; confirm all profiles are selected and the notice reports three appointments today.
2. Search for a profile, change the selection, and remove one from the selected list. Confirm the calendar/upcoming list change while the top metrics and today notice stay unchanged.
3. Open today's list and a profile's list. Check the Maps links and direct completion actions; dismiss the lists with Close, Escape, and a click outside. Confirm that clicking a card title does not open another popup.
4. Switch calendar views, navigate periods, and open a busy day's overflow. In Daily/Weekly, check duration heights and overlapping blocks; today's Elena and Rose appointments overlap from 4–4:30 PM.
5. With supplied test data containing no scheduled appointments today, confirm the notice and popup both show the empty message. Also check narrow screens and keyboard navigation.
