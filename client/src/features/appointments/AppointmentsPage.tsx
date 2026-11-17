import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button.tsx'
import { TextField } from '../../components/ui/Field.tsx'
import { AppointmentCalendar } from './AppointmentCalendar.tsx'
import { AppointmentListItem } from './AppointmentListItem.tsx'
import { OverdueAppointmentsWarning } from './OverdueAppointmentsWarning.tsx'
import { isAppointmentOverdue } from './appointment-overdue.ts'
import { appointmentKey, useAppointmentCompletion } from './appointment-completion.ts'
import { compareAppointmentListOrder } from './appointment-order.ts'
import { appointmentUpcomingEnd } from './appointment-window.ts'
import { closeOnBackdropClick } from './dialog.ts'
import { hasValidAppointmentTime } from './calendar-layout.ts'

export type CareProfile = { id: string; circleId: string; name: string; circleName: string }
export type AppointmentSummary = {
  id: string
  circleId: string
  recipientId: string
  title: string
  startsAt: string
  endsAt?: string
  location?: string
  // Display data for the assigned user; resolve the API's caregiver ID against circle members when connected.
  assignedCaregiver?: { id: string; name: string } | null
  status: 'scheduled' | 'completed' | 'cancelled'
}

// Profile IDs are scoped to a circle; use both values for selection identity.
const profileKey = (profile: CareProfile) => JSON.stringify([profile.circleId, profile.id])

export function AppointmentsPage({
  careProfiles,
  appointments: providedAppointments,
  onAdd,
  onEdit,
}: {
  careProfiles: CareProfile[]
  appointments: AppointmentSummary[]
  onAdd?: () => void
  onEdit?: (appointment: AppointmentSummary) => void
}) {
  // Newly loaded profiles are selected automatically until explicitly unchecked.
  const [excludedProfiles, setExcludedProfiles] = useState<string[]>([])
  const [profileSearch, setProfileSearch] = useState('')
  const selectionId = useId()
  const profileDropdown = useRef<HTMLDetailsElement>(null)
  const todayDialog = useRef<HTMLDialogElement>(null)
  const todayHeadingId = useId()
  const profileAppointmentsDialog = useRef<HTMLDialogElement>(null)
  const profileAppointmentsHeadingId = useId()
  const [openProfileKey, setOpenProfileKey] = useState<string | null>(null)
  const openProfile = careProfiles.find((profile) => profileKey(profile) === openProfileKey)
  useEffect(() => {
    if (openProfile && !profileAppointmentsDialog.current?.open) profileAppointmentsDialog.current?.showModal()
    else if (!openProfile && profileAppointmentsDialog.current?.open) profileAppointmentsDialog.current.close()
  }, [openProfile])
  const [now, setNow] = useState(Date.now)
  const { applyCompletion, setCompletion } = useAppointmentCompletion()
  const appointments = providedAppointments.map(applyCompletion)
  function completeAppointment(appointment: AppointmentSummary) {
    if (appointment.status !== 'scheduled') return
    setCompletion(appointment, 'completed')
  }
  function markAppointmentTodo(appointment: AppointmentSummary) {
    if (appointment.status !== 'completed') return
    // Restore scheduled status so the existing date and profile filters decide where it reappears.
    setCompletion(appointment, 'scheduled')
  }
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    function closeOutside(event: Event) {
      const dropdown = profileDropdown.current
      if (dropdown?.open && event.target instanceof Node && !dropdown.contains(event.target)) dropdown.open = false
    }
    function closeOnEscape(event: KeyboardEvent) {
      const dropdown = profileDropdown.current
      if (event.key === 'Escape' && dropdown?.open) {
        dropdown.open = false
        dropdown.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])
  // Upcoming includes both endpoints and measures seven elapsed 24-hour periods from now.
  const upcomingBefore = appointmentUpcomingEnd(now)
  const today = new Date(now).toDateString()
  // Keep completed entries in today's list; only scheduled entries count toward its notice.
  const appointmentsToday = appointments
    .filter(
      (appointment) =>
        appointment.status !== 'cancelled' &&
        hasValidAppointmentTime(appointment) &&
        new Date(appointment.startsAt).toDateString() === today &&
        careProfiles.some((item) => item.id === appointment.recipientId && item.circleId === appointment.circleId),
    )
    .sort(compareAppointmentListOrder)
  const scheduledTodayCount = appointmentsToday.filter((appointment) => appointment.status === 'scheduled').length
  const overdueAppointments = appointments
    .filter(
      (appointment) =>
        isAppointmentOverdue(appointment, now) &&
        careProfiles.some(
          (profile) => profile.id === appointment.recipientId && profile.circleId === appointment.circleId,
        ),
    )
    .sort(compareAppointmentListOrder)
  const visibleProfiles = careProfiles.filter((item) => !excludedProfiles.includes(profileKey(item)))
  // Search changes the dropdown choices only, leaving the selected profiles intact.
  const matchingProfiles = careProfiles.filter((item) =>
    `${item.name} ${item.circleName}`.toLocaleLowerCase().includes(profileSearch.trim().toLocaleLowerCase()),
  )
  // Keep the overall totals separate from the selection-filtered list below.
  const appointmentsInWindow = appointments
    .filter(
      (appointment) =>
        appointment.status !== 'cancelled' &&
        hasValidAppointmentTime(appointment) &&
        Date.parse(appointment.startsAt) >= now &&
        Date.parse(appointment.startsAt) < upcomingBefore &&
        careProfiles.some((item) => item.id === appointment.recipientId && item.circleId === appointment.circleId),
    )
    .sort(compareAppointmentListOrder)
  const allUpcoming = appointmentsInWindow.filter((appointment) => appointment.status === 'scheduled')
  const upcoming = allUpcoming.filter((appointment) =>
    visibleProfiles.some((item) => item.id === appointment.recipientId && item.circleId === appointment.circleId),
  )
  const visibleAppointments = [...overdueAppointments, ...appointmentsInWindow].filter((appointment) =>
    visibleProfiles.some((item) => item.id === appointment.recipientId && item.circleId === appointment.circleId),
  )
  // Reuse the same seven-day window as the clicked count; opening it does not change profile selection.
  const profileAppointments = appointmentsInWindow.filter(
    (appointment) => appointment.recipientId === openProfile?.id && appointment.circleId === openProfile?.circleId,
  )

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-h1 font-bold">Appointments</h1>
        {onAdd && (
          <Button disabled={!careProfiles.length} onClick={onAdd}>
            Add appointment
          </Button>
        )}
      </div>
      <p className="mt-2 text-muted">An overview of upcoming appointments for the people in your care.</p>
      <dl className="mt-8 grid gap-4 sm:grid-cols-2" aria-live="polite">
        <div className="rounded-panel bg-wash p-5">
          <dt className="text-muted">Total care profiles</dt>
          <dd className="mt-2 font-display text-h1 font-bold">{careProfiles.length}</dd>
        </div>
        <div className="rounded-panel bg-wash p-5">
          <dt className="text-muted">Total upcoming appointments</dt>
          <dd className="mt-2 font-display text-h1 font-bold">{allUpcoming.length}</dd>
        </div>
      </dl>

      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => todayDialog.current?.showModal()}
        className="mt-4 w-full cursor-pointer rounded-control border border-amber-300 bg-amber-50 p-4 text-left text-amber-950 hover:bg-amber-100"
      >
        <span>
          {scheduledTodayCount === 0
            ? 'No scheduled appointments today.'
            : `You have ${scheduledTodayCount} scheduled ${scheduledTodayCount === 1 ? 'appointment' : 'appointments'} today across all care profiles.`}
        </span>
      </button>

      <div className={overdueAppointments.length ? 'mt-4' : undefined}>
        <OverdueAppointmentsWarning
          appointments={overdueAppointments}
          profileName={(appointment) =>
            careProfiles.find(
              (profile) => profile.id === appointment.recipientId && profile.circleId === appointment.circleId,
            )!.name
          }
          onComplete={completeAppointment}
          onEdit={onEdit}
        />
      </div>

      <dialog
        ref={todayDialog}
        aria-labelledby={todayHeadingId}
        onClick={closeOnBackdropClick}
        className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-panel border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/40"
      >
        <h2 id={todayHeadingId} className="font-display text-h2 font-bold">
          Today’s appointments
        </h2>
        <p className="mt-2 text-muted">Across all care profiles · Times shown in your local timezone.</p>
        {appointmentsToday.length === 0 ? (
          <p className="mt-5 text-muted">No scheduled appointments today.</p>
        ) : (
          <ul className="mt-5 divide-y divide-line">
            {appointmentsToday.map((appointment) => {
              const profile = careProfiles.find(
                (item) => item.id === appointment.recipientId && item.circleId === appointment.circleId,
              )!
              return (
                <li
                  key={JSON.stringify([appointment.circleId, appointment.recipientId, appointment.id])}
                  className="py-4 break-words first:pt-0"
                >
                  <AppointmentListItem
                    appointment={appointment}
                    profileName={profile.name}
                    onComplete={() => completeAppointment(appointment)}
                    onMarkTodo={() => markAppointmentTodo(appointment)}
                    onEdit={onEdit && (() => onEdit(appointment))}
                  />
                </li>
              )
            })}
          </ul>
        )}
        <Button variant="secondary" className="mt-6" onClick={() => todayDialog.current?.close()}>
          Close
        </Button>
      </dialog>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <section
          className="flex h-[34rem] min-w-0 flex-col rounded-panel border border-line bg-surface p-5 sm:p-6"
          aria-labelledby="care-profiles-heading"
        >
          <h2 id="care-profiles-heading" className="font-display text-h2 font-bold">
            Care profiles
          </h2>
          <p className="mt-2 text-muted">Choose the profiles whose appointments you want to see.</p>
          <details ref={profileDropdown} className="relative mt-5">
            <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-control border border-line-strong px-4 py-3 font-semibold">
              Select care profiles
              <span aria-hidden="true">▾</span>
            </summary>
            <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-[30rem] overflow-y-auto rounded-control border border-line-strong bg-surface p-4 shadow-lg">
              <TextField
                label="Search care profiles"
                type="search"
                value={profileSearch}
                onChange={(event) => setProfileSearch(event.target.value)}
              />
              <fieldset>
                <legend className="sr-only">Care profiles to show</legend>
                {careProfiles.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button variant="secondary" onClick={() => setExcludedProfiles([])}>
                      Select all
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-auto min-h-11 whitespace-normal py-2"
                      onClick={() =>
                        setExcludedProfiles(
                          careProfiles
                            .filter(
                              (item) =>
                                !allUpcoming.some(
                                  (appointment) =>
                                    appointment.recipientId === item.id && appointment.circleId === item.circleId,
                                ),
                            )
                            .map(profileKey),
                        )
                      }
                    >
                      Select with upcoming appointments
                    </Button>
                    <Button variant="secondary" onClick={() => setExcludedProfiles(careProfiles.map(profileKey))}>
                      Clear selection
                    </Button>
                  </div>
                )}
                <ul className="mt-4 max-h-60 divide-y divide-line overflow-y-auto">
                  {matchingProfiles.map((item, index) => {
                    const key = profileKey(item)
                    return (
                      <li key={key} className="py-3">
                        <label htmlFor={`${selectionId}-${index}`} className="flex cursor-pointer items-start gap-3">
                          <input
                            id={`${selectionId}-${index}`}
                            type="checkbox"
                            checked={!excludedProfiles.includes(key)}
                            className="mt-1 size-5 shrink-0 cursor-pointer accent-primary"
                            onChange={() =>
                              setExcludedProfiles((current) =>
                                current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
                              )
                            }
                          />
                          <span>
                            <span className="block font-semibold">{item.name}</span>
                            <span className="block text-muted">{item.circleName}</span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
                {matchingProfiles.length === 0 && (
                  <p className="mt-4 text-muted">
                    {careProfiles.length === 0 ? 'No care profiles available.' : 'No matching care profiles.'}
                  </p>
                )}
              </fieldset>
            </div>
          </details>
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
            <ul className="divide-y divide-line" aria-label="Selected care profiles">
              {visibleProfiles.map((item) => {
                const key = profileKey(item)
                const count = allUpcoming.filter(
                  (appointment) => appointment.recipientId === item.id && appointment.circleId === item.circleId,
                ).length
                return (
                  <li key={key} className="py-5 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-h3 font-semibold">{item.name}</h3>
                        <p className="mt-1 text-muted">{item.circleName}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Unselect ${item.name} in ${item.circleName}`}
                        onClick={() => setExcludedProfiles((current) => [...current, key])}
                      >
                        Remove
                      </Button>
                    </div>
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-label={`View upcoming appointments for ${item.name}`}
                      className="mt-4 cursor-pointer rounded-control text-left text-muted hover:text-primary hover:underline"
                      onClick={() => setOpenProfileKey(key)}
                    >
                      {count === 0
                        ? 'No upcoming appointments.'
                        : `${count} upcoming appointment${count === 1 ? '' : 's'}.`}
                    </button>
                  </li>
                )
              })}
            </ul>
            {visibleProfiles.length === 0 && (
              <p className="text-muted">No profiles selected. Choose profiles from the dropdown.</p>
            )}
          </div>
          <p className="mt-5 border-t border-line pt-4 font-semibold" role="status">
            {visibleProfiles.length} profile{visibleProfiles.length === 1 ? '' : 's'} selected · {upcoming.length}{' '}
            upcoming appointment{upcoming.length === 1 ? '' : 's'}
          </p>
        </section>

        <section
          className="flex h-[34rem] min-w-0 flex-col rounded-panel border border-line bg-surface p-5 sm:p-6"
          aria-labelledby="upcoming-appointments-heading"
        >
          <h2 id="upcoming-appointments-heading" className="font-display text-h2 font-bold">
            Upcoming appointments
          </h2>
          <p className="mt-2 text-muted">Within the next 7 days.</p>
          <p className="mt-2 text-muted">
            {visibleProfiles.length === 0
              ? 'No care profiles selected'
              : visibleProfiles.length === careProfiles.length
                ? 'Across all care profiles'
                : visibleProfiles.length === 1
                  ? `For ${visibleProfiles[0].name}`
                  : `Across ${visibleProfiles.length} selected care profiles`}{' '}
            · Times shown in your local timezone.
          </p>
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
            {visibleAppointments.length === 0 ? (
              <p className="text-muted">
                {visibleProfiles.length === 0 && careProfiles.length > 0
                  ? 'Select a care profile to view upcoming appointments.'
                  : 'No upcoming appointments.'}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {visibleAppointments.map((appointment) => {
                  const person = visibleProfiles.find(
                    (item) => item.id === appointment.recipientId && item.circleId === appointment.circleId,
                  )!
                  return (
                    <li
                      key={JSON.stringify([appointment.circleId, appointment.recipientId, appointment.id])}
                      className="py-5 break-words first:pt-0 last:pb-0"
                    >
                      <AppointmentListItem
                        appointment={appointment}
                        profileName={person.name}
                        overdue={isAppointmentOverdue(appointment, now)}
                        onComplete={() => completeAppointment(appointment)}
                        onMarkTodo={() => markAppointmentTodo(appointment)}
                        onEdit={onEdit && (() => onEdit(appointment))}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <AppointmentCalendar
        profiles={visibleProfiles}
        appointments={appointments}
        now={now}
        onComplete={completeAppointment}
        onMarkTodo={markAppointmentTodo}
        onEdit={onEdit}
      />
      <dialog
        ref={profileAppointmentsDialog}
        aria-labelledby={profileAppointmentsHeadingId}
        onClose={() => setOpenProfileKey(null)}
        onClick={closeOnBackdropClick}
        className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-panel border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/40"
      >
        <h2 id={profileAppointmentsHeadingId} className="font-display text-h2 font-bold">
          Upcoming appointments for {openProfile?.name}
        </h2>
        <p className="mt-2 text-muted">Within the next 7 days · Times shown in your local timezone.</p>
        {profileAppointments.length === 0 ? (
          <p className="mt-5 text-muted">No upcoming appointments.</p>
        ) : (
          <ul className="mt-5 divide-y divide-line">
            {profileAppointments.map((appointment) => (
              <li key={appointmentKey(appointment)} className="py-4 break-words first:pt-0">
                <AppointmentListItem
                  appointment={appointment}
                  profileName={openProfile!.name}
                  onComplete={() => completeAppointment(appointment)}
                  onMarkTodo={() => markAppointmentTodo(appointment)}
                  onEdit={onEdit && (() => onEdit(appointment))}
                />
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" className="mt-6" onClick={() => profileAppointmentsDialog.current?.close()}>
          Close
        </Button>
      </dialog>
    </main>
  )
}
