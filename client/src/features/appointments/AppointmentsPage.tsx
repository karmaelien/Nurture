import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button.tsx'
import { TextField } from '../../components/ui/Field.tsx'
import { AppointmentCalendar } from './AppointmentCalendar.tsx'
import { AppointmentListItem } from './AppointmentListItem.tsx'
import { AppointmentAttention } from './AppointmentAttention.tsx'
import { isAppointmentOverdue } from './appointment-overdue.ts'
import { useAppointmentCompletion } from './appointment-completion.ts'
import { compareAppointmentListOrder } from './appointment-order.ts'
import { appointmentUpcomingEnd } from './appointment-window.ts'
import { hasValidAppointmentTime } from './calendar-layout.ts'

import { FeatureToolbar } from '../../components/ui/FeatureToolbar.tsx'
import { PageHeader } from '../../components/ui/PageHeader.tsx'

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
  headerAside,
}: {
  careProfiles: CareProfile[]
  appointments: AppointmentSummary[]
  headerAside?: ReactNode
  onAdd?: () => void
  onEdit?: (appointment: AppointmentSummary) => void
}) {
  // Newly loaded profiles are selected automatically until explicitly unchecked.
  const [excludedProfiles, setExcludedProfiles] = useState<string[]>([])
  const [profileSearch, setProfileSearch] = useState('')
  const selectionId = useId()
  const profileDropdown = useRef<HTMLDetailsElement>(null)
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
  // Build the upcoming window before applying the selected care profiles.
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

  return (
    <main className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
      <PageHeader
        title="Appointments"
        description="An overview of upcoming appointments for the people in your care."
        aside={headerAside}
      />
      <section className="min-w-0 rounded-panel border border-line bg-surface p-5 sm:p-6">
        <FeatureToolbar
          actions={
            onAdd && (
              <Button disabled={!careProfiles.length} onClick={onAdd}>
                Add appointment
              </Button>
            )
          }
        >
          <div className="w-72 max-w-full">
            <p className="mb-1.5 text-small font-semibold">Care profiles</p>
            <details ref={profileDropdown} className="relative">
              <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-control border border-field h-12 bg-surface px-3.5 text-body font-normal">
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
          </div>
        </FeatureToolbar>
        <AppointmentAttention
          today={appointmentsToday}
          overdue={overdueAppointments}
          profiles={careProfiles}
          onComplete={completeAppointment}
          onMarkTodo={markAppointmentTodo}
          onEdit={onEdit}
        />

        <div className="mt-4">
          <section
            className="flex max-h-[38rem] min-w-0 flex-col rounded-panel border border-line bg-surface p-5 sm:p-6"
            aria-labelledby="upcoming-appointments-heading"
          >
            <h2 id="upcoming-appointments-heading" className="font-display text-h3 font-semibold">
              Upcoming appointments
            </h2>
            <p role="status" className="mt-2 text-small text-muted">
              {visibleProfiles.length} {visibleProfiles.length === 1 ? 'profile' : 'profiles'} selected ·{' '}
              {upcoming.length} upcoming {upcoming.length === 1 ? 'appointment' : 'appointments'} · Next 7 days
            </p>
            <p className="mt-1 text-small text-muted">
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
      </section>
    </main>
  )
}
