import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button.tsx'
import { TextField } from '../../components/ui/Field.tsx'
import { AppointmentCalendar } from './AppointmentCalendar.tsx'
import { AppointmentDetails } from './AppointmentDetails.tsx'
import { closeOnBackdropClick } from './dialog.ts'
import { hasValidAppointmentTime } from './calendar-layout.ts'

export type CareProfile = { id: string; circleId: string; name: string; circleName: string }
export type AppointmentSummary = {
  id: string
  circleId: string
  recipientId: string
  title: string
  startsAt: string
  endsAt: string
  location?: string
  // Display data for the assigned user; resolve the API's caregiver ID against circle members when connected.
  assignedCaregiver?: { id: string; name: string } | null
  status: 'scheduled' | 'completed' | 'cancelled'
}

// Profile IDs are scoped to a circle; use both values for selection identity.
const profileKey = (profile: CareProfile) => JSON.stringify([profile.circleId, profile.id])
const appointmentKey = (appointment: AppointmentSummary) =>
  JSON.stringify([appointment.circleId, appointment.recipientId, appointment.id])

// Temporary preview data until care profiles are connected.
const dummyCareProfiles: CareProfile[] = [
  { id: 'demo-rose', circleId: 'demo-alvarez', name: 'Rose Alvarez', circleName: 'Alvarez family' },
  { id: 'demo-frank', circleId: 'demo-alvarez', name: 'Frank Alvarez', circleName: 'Alvarez family' },
  { id: 'demo-elena', circleId: 'demo-alvarez', name: 'Elena Alvarez', circleName: 'Alvarez family' },
  { id: 'demo-robert', circleId: 'demo-alvarez', name: 'Robert Alvarez', circleName: 'Alvarez family' },
  { id: 'demo-grace', circleId: 'demo-alvarez', name: 'Grace Alvarez', circleName: 'Alvarez family' },
  { id: 'demo-henry', circleId: 'demo-alvarez', name: 'Henry Alvarez', circleName: 'Alvarez family' },
  { id: 'demo-linda', circleId: 'demo-alvarez', name: 'Linda Alvarez', circleName: 'Alvarez family' },
  { id: 'demo-james', circleId: 'demo-alvarez', name: 'James Alvarez', circleName: 'Alvarez family' },
  { id: 'demo-anita', circleId: 'demo-alvarez', name: 'Anita Alvarez', circleName: 'Alvarez family' },
  { id: 'demo-meera', circleId: 'demo-alvarez', name: 'Meera Alvarez', circleName: 'Alvarez family' },
  { id: 'demo-margaret', circleId: 'demo-alvarez', name: 'Margaret Alvarez', circleName: 'Alvarez family' },
  { id: 'demo-george', circleId: 'demo-alvarez', name: 'George Alvarez', circleName: 'Alvarez family' },
]

function createDummyAppointments(baseTime: number): AppointmentSummary[] {
  return [
    {
      id: 'demo-rose-today',
      assignedCaregiver: { id: 'demo-maya', name: 'Maya Alvarez' },
      recipientId: 'demo-rose',
      title: 'Follow-up appointment',
      daysAhead: 0,
      hour: 16,
      location: 'Family clinic',
    },
    {
      id: 'demo-frank-today',
      assignedCaregiver: { id: 'demo-maya', name: 'Maya Alvarez' },
      recipientId: 'demo-frank',
      title: 'Blood pressure review',
      daysAhead: 0,
      hour: 11,
      durationMinutes: 30,
      location: 'Family clinic',
    },
    {
      id: 'demo-elena-today',
      recipientId: 'demo-elena',
      title: 'Physical therapy',
      daysAhead: 0,
      hour: 15,
      durationMinutes: 90,
      location: 'Rehabilitation center',
    },
    {
      id: 'demo-rose-checkup',
      assignedCaregiver: { id: 'demo-maya', name: 'Maya Alvarez' },
      durationMinutes: 90,
      recipientId: 'demo-rose',
      title: 'Annual checkup',
      daysAhead: 1,
      hour: 10,
      location: 'Family clinic',
    },
    {
      id: 'demo-rose-therapy',
      durationMinutes: 45,
      recipientId: 'demo-rose',
      title: 'Physical therapy',
      daysAhead: 4,
      hour: 14,
      location: 'Rehabilitation center',
    },
    {
      id: 'demo-frank-dentist',
      recipientId: 'demo-frank',
      title: 'Dental cleaning',
      daysAhead: 12,
      hour: 11,
      location: 'Dental clinic',
    },
    {
      id: 'demo-frank-eye-exam',
      recipientId: 'demo-frank',
      title: 'Eye exam',
      daysAhead: 18,
      hour: 9,
      location: 'Eye care center',
    },
    {
      id: 'demo-elena-checkup',
      recipientId: 'demo-elena',
      title: 'Routine checkup',
      daysAhead: 2,
      hour: 9,
      location: 'Family clinic',
    },
    {
      id: 'demo-robert-hearing',
      recipientId: 'demo-robert',
      title: 'Hearing assessment',
      daysAhead: 9,
      hour: 11,
      location: 'Audiology clinic',
    },
    {
      id: 'demo-grace-dentist',
      recipientId: 'demo-grace',
      title: 'Dental checkup',
      daysAhead: 3,
      hour: 10,
      location: 'Dental clinic',
    },
    {
      id: 'demo-henry-therapy',
      recipientId: 'demo-henry',
      title: 'Physical therapy',
      daysAhead: 5,
      hour: 14,
      location: 'Rehabilitation center',
    },
    {
      id: 'demo-linda-eye-exam',
      recipientId: 'demo-linda',
      title: 'Eye exam',
      daysAhead: 10,
      hour: 9,
      location: 'Eye care center',
    },
    {
      id: 'demo-james-checkup',
      recipientId: 'demo-james',
      title: 'Annual checkup',
      daysAhead: 1,
      hour: 13,
      location: 'Family clinic',
    },
    {
      id: 'demo-anita-specialist',
      recipientId: 'demo-anita',
      title: 'Specialist follow-up',
      daysAhead: 6,
      hour: 15,
      location: 'Medical center',
    },
    {
      id: 'demo-meera-dentist',
      recipientId: 'demo-meera',
      title: 'Dental cleaning',
      daysAhead: 15,
      hour: 10,
      location: 'Dental clinic',
    },
    {
      id: 'demo-margaret-checkup',
      recipientId: 'demo-margaret',
      title: 'Routine checkup',
      daysAhead: 4,
      hour: 11,
      location: 'Family clinic',
    },
    {
      id: 'demo-george-hearing',
      recipientId: 'demo-george',
      title: 'Hearing assessment',
      daysAhead: 21,
      hour: 14,
      location: 'Audiology clinic',
    },
    {
      id: 'demo-rose-followup',
      recipientId: 'demo-rose',
      title: 'Follow-up visit',
      daysAhead: 2,
      hour: 15,
      location: 'Family clinic',
    },
    {
      id: 'demo-frank-checkup',
      recipientId: 'demo-frank',
      title: 'Routine checkup',
      daysAhead: 3,
      hour: 9,
      location: 'Family clinic',
    },
    {
      id: 'demo-elena-therapy',
      durationMinutes: 90,
      recipientId: 'demo-elena',
      title: 'Physical therapy',
      daysAhead: 2,
      hour: 14,
      location: 'Rehabilitation center',
    },
    {
      id: 'demo-robert-dentist',
      recipientId: 'demo-robert',
      title: 'Dental checkup',
      daysAhead: 5,
      hour: 10,
      location: 'Dental clinic',
    },
    {
      id: 'demo-grace-eye-exam',
      recipientId: 'demo-grace',
      title: 'Eye exam',
      daysAhead: 6,
      hour: 11,
      location: 'Eye care center',
    },
    {
      id: 'demo-henry-followup',
      recipientId: 'demo-henry',
      title: 'Therapy follow-up',
      daysAhead: 6,
      hour: 15,
      location: 'Rehabilitation center',
    },
    {
      id: 'demo-linda-checkup',
      recipientId: 'demo-linda',
      title: 'Routine checkup',
      daysAhead: 1,
      hour: 16,
      location: 'Family clinic',
    },
    {
      id: 'demo-james-dentist',
      recipientId: 'demo-james',
      title: 'Dental cleaning',
      daysAhead: 8,
      hour: 9,
      location: 'Dental clinic',
    },
    {
      id: 'demo-anita-eye-exam',
      recipientId: 'demo-anita',
      title: 'Eye exam',
      daysAhead: 11,
      hour: 14,
      location: 'Eye care center',
    },
    {
      id: 'demo-meera-checkup',
      recipientId: 'demo-meera',
      title: 'Annual checkup',
      daysAhead: 4,
      hour: 9,
      location: 'Family clinic',
    },
    {
      id: 'demo-margaret-dentist',
      recipientId: 'demo-margaret',
      title: 'Dental checkup',
      daysAhead: 13,
      hour: 10,
      location: 'Dental clinic',
    },
    {
      id: 'demo-george-checkup',
      recipientId: 'demo-george',
      title: 'Routine checkup',
      daysAhead: 16,
      hour: 11,
      location: 'Family clinic',
    },
    {
      id: 'demo-rose-eye-exam',
      recipientId: 'demo-rose',
      title: 'Eye exam',
      daysAhead: 20,
      hour: 13,
      location: 'Eye care center',
    },
    {
      id: 'demo-elena-followup',
      recipientId: 'demo-elena',
      title: 'Follow-up visit',
      daysAhead: 23,
      hour: 10,
      location: 'Medical center',
    },
    {
      id: 'demo-henry-dentist',
      recipientId: 'demo-henry',
      title: 'Dental cleaning',
      daysAhead: 27,
      hour: 14,
      location: 'Dental clinic',
    },
  ].map(({ daysAhead, hour, durationMinutes = 60, ...appointment }) => {
    const date = new Date(baseTime)
    date.setDate(date.getDate() + daysAhead)
    date.setHours(hour, 0, 0, 0)
    const profile = dummyCareProfiles.find((item) => item.id === appointment.recipientId)!
    return {
      ...appointment,
      circleId: profile.circleId,
      startsAt: date.toISOString(),
      endsAt: new Date(date.getTime() + durationMinutes * 60_000).toISOString(),
      status: 'scheduled',
    }
  })
}

export function AppointmentsPage({
  careProfiles = dummyCareProfiles,
  appointments: providedAppointments,
}: {
  careProfiles?: CareProfile[]
  appointments?: AppointmentSummary[]
}) {
  // Newly loaded profiles are selected automatically until explicitly unchecked.
  const [excludedProfiles, setExcludedProfiles] = useState<string[]>([])
  const [profileSearch, setProfileSearch] = useState('')
  const selectionId = useId()
  const profileDropdown = useRef<HTMLDetailsElement>(null)
  const todayDialog = useRef<HTMLDialogElement>(null)
  const todayHeadingId = useId()
  const appointmentDialog = useRef<HTMLDialogElement>(null)
  const appointmentHeadingId = useId()
  const [now, setNow] = useState(Date.now)
  // Generate preview dates once per mount so minute updates do not move the appointments.
  const [dummyAppointments] = useState(() => createDummyAppointments(now))
  // Local completion overrides keep all views consistent until a write endpoint is connected.
  const [completionStatus, setCompletionStatus] = useState<Record<string, 'scheduled' | 'completed'>>({})
  const appointments = (providedAppointments ?? dummyAppointments).map((appointment) =>
    appointment.status !== 'cancelled' && completionStatus[appointmentKey(appointment)]
      ? { ...appointment, status: completionStatus[appointmentKey(appointment)] }
      : appointment,
  )
  const [selectedAppointmentKey, setSelectedAppointmentKey] = useState<string | null>(null)
  const selectedAppointment = appointments.find((appointment) => appointmentKey(appointment) === selectedAppointmentKey)
  function completeAppointment(appointment: AppointmentSummary) {
    if (appointment.status !== 'scheduled') return
    const key = appointmentKey(appointment)
    setCompletionStatus((current) => ({ ...current, [key]: 'completed' }))
  }
  function markAppointmentTodo(appointment: AppointmentSummary) {
    if (appointment.status !== 'completed') return
    const key = appointmentKey(appointment)
    // Restore scheduled status so the existing date and profile filters decide where it reappears.
    setCompletionStatus((current) => ({ ...current, [key]: 'scheduled' }))
  }
  const selectedProfile = careProfiles.find(
    (profile) => profile.id === selectedAppointment?.recipientId && profile.circleId === selectedAppointment?.circleId,
  )
  useEffect(() => {
    if (selectedAppointment && selectedProfile && !appointmentDialog.current?.open)
      appointmentDialog.current?.showModal()
  }, [selectedAppointment, selectedProfile])
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
  const upcomingThrough = now + 7 * 24 * 60 * 60 * 1000
  const today = new Date(now).toDateString()
  // Today's notice ignores selection and includes earlier scheduled starts on the same local date.
  const appointmentsToday = appointments
    .filter(
      (appointment) =>
        appointment.status === 'scheduled' &&
        hasValidAppointmentTime(appointment) &&
        new Date(appointment.startsAt).toDateString() === today &&
        careProfiles.some((item) => item.id === appointment.recipientId && item.circleId === appointment.circleId),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const visibleProfiles = careProfiles.filter((item) => !excludedProfiles.includes(profileKey(item)))
  // Search changes the dropdown choices only, leaving the selected profiles intact.
  const matchingProfiles = careProfiles.filter((item) =>
    `${item.name} ${item.circleName}`.toLocaleLowerCase().includes(profileSearch.trim().toLocaleLowerCase()),
  )
  // Keep the overall totals separate from the selection-filtered list below.
  const allUpcoming = appointments
    .filter(
      (appointment) =>
        appointment.status === 'scheduled' &&
        hasValidAppointmentTime(appointment) &&
        Date.parse(appointment.startsAt) >= now &&
        Date.parse(appointment.startsAt) <= upcomingThrough &&
        careProfiles.some((item) => item.id === appointment.recipientId && item.circleId === appointment.circleId),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const upcoming = allUpcoming.filter((appointment) =>
    visibleProfiles.some((item) => item.id === appointment.recipientId && item.circleId === appointment.circleId),
  )
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <h1 className="font-display text-h1 font-bold">Appointments</h1>
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
          {appointmentsToday.length === 0
            ? 'No scheduled appointments today.'
            : `You have ${appointmentsToday.length} scheduled ${appointmentsToday.length === 1 ? 'appointment' : 'appointments'} today across all care profiles.`}
        </span>
      </button>

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
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    className="w-full cursor-pointer rounded-control text-left hover:bg-wash"
                    onClick={() => {
                      // Keep today's list open beneath the details so closing returns to the same list position.
                      setSelectedAppointmentKey(appointmentKey(appointment))
                    }}
                  >
                    <span className="block font-display text-h3 font-semibold">{appointment.title}</span>
                    <span className="mt-1 block">{profile.name}</span>
                    <span className="mt-2 block text-muted">
                      <time dateTime={appointment.startsAt}>{formatTime(appointment.startsAt)}</time> –{' '}
                      <time dateTime={appointment.endsAt}>{formatTime(appointment.endsAt)}</time>
                    </span>
                    <span className="mt-1 block text-muted">{appointment.location || 'Location not provided'}</span>
                  </button>
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
                    <p className="mt-4 text-muted">
                      {count === 0
                        ? 'No upcoming appointments.'
                        : `${count} upcoming appointment${count === 1 ? '' : 's'}.`}
                    </p>
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
            {upcoming.length === 0 ? (
              <p className="text-muted">
                {visibleProfiles.length === 0 && careProfiles.length > 0
                  ? 'Select a care profile to view upcoming appointments.'
                  : 'No upcoming appointments.'}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((appointment) => {
                  const person = visibleProfiles.find(
                    (item) => item.id === appointment.recipientId && item.circleId === appointment.circleId,
                  )!
                  return (
                    <li
                      key={JSON.stringify([appointment.circleId, appointment.recipientId, appointment.id])}
                      className="py-5 break-words first:pt-0 last:pb-0"
                    >
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        className="w-full cursor-pointer rounded-control text-left hover:bg-wash"
                        onClick={() => setSelectedAppointmentKey(appointmentKey(appointment))}
                      >
                        <span className="block font-display text-h3 font-semibold">{appointment.title}</span>
                        <span className="mt-1 block">
                          {person.name} · {person.circleName}
                        </span>
                        <span className="mt-2 block text-muted">
                          <time dateTime={appointment.startsAt}>{formatTime(appointment.startsAt)}</time> –{' '}
                          <time dateTime={appointment.endsAt}>{formatTime(appointment.endsAt)}</time>
                        </span>
                        {appointment.location && <span className="mt-1 block text-muted">{appointment.location}</span>}
                      </button>
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
      />
      <dialog
        ref={appointmentDialog}
        aria-labelledby={appointmentHeadingId}
        onClose={() => setSelectedAppointmentKey(null)}
        onClick={closeOnBackdropClick}
        className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-panel border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/40"
      >
        {selectedAppointment && selectedProfile && (
          <AppointmentDetails
            appointment={selectedAppointment}
            profile={selectedProfile}
            headingId={appointmentHeadingId}
            onComplete={completeAppointment}
            onMarkTodo={markAppointmentTodo}
          />
        )}
        <Button variant="secondary" className="mt-6" onClick={() => appointmentDialog.current?.close()}>
          Close
        </Button>
      </dialog>
    </main>
  )
}
