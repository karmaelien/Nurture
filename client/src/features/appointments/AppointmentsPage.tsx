import { QueryFeedback, type QueryState } from '../../components/ui/QueryFeedback.tsx'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button.tsx'
import { CareProfileSelection } from '../care/CareProfileSelection.tsx'
import { Alert } from '../../components/ui/Alert.tsx'
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

export function AppointmentsPage({
  careProfiles,
  appointments: providedAppointments,
  onAdd,
  onEdit,
  onDelete,
  headerAside,
  recipientId,
  onRecipientChange,
  onClear,
  notice,
  query,
  caregiverError,
}: {
  careProfiles: CareProfile[]
  appointments: AppointmentSummary[]
  headerAside?: ReactNode
  recipientId?: string
  onRecipientChange?: (id: string) => void
  onClear?: () => void
  notice?: string
  query?: QueryState
  caregiverError?: ReactNode
  onAdd?: (date?: string, recipientId?: string) => void
  onEdit?: (appointment: AppointmentSummary) => void
  onDelete?: (appointment: AppointmentSummary) => void
}) {
  const [localRecipient, setLocalRecipient] = useState('')
  const selectedRecipient = recipientId ?? localRecipient
  const setRecipient = onRecipientChange ?? setLocalRecipient
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
  const visibleProfiles = careProfiles.filter((item) => !selectedRecipient || item.id === selectedRecipient)
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
          onClear={onClear ?? (() => setRecipient(''))}
          actions={
            onAdd && (
              <Button disabled={!careProfiles.length} onClick={() => onAdd(undefined, selectedRecipient || undefined)}>
                Add appointment
              </Button>
            )
          }
        >
          <CareProfileSelection profiles={careProfiles} value={selectedRecipient} onChange={setRecipient} />
        </FeatureToolbar>
        {notice && <Alert tone="success">{notice}</Alert>}
        {caregiverError}
        {query && (query.isPending || query.isError) ? (
          <QueryFeedback query={query} loading="Loading appointments…" />
        ) : (
          <>
            <AppointmentAttention
              today={appointmentsToday}
              overdue={overdueAppointments}
              profiles={careProfiles}
              onComplete={completeAppointment}
              onMarkTodo={markAppointmentTodo}
              onEdit={onEdit}
              onDelete={onDelete}
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
                              onDelete={onDelete && (() => onDelete(appointment))}
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
              onAdd={
                onAdd
                  ? (date) => onAdd(date, visibleProfiles.length === 1 ? visibleProfiles[0].id : undefined)
                  : undefined
              }
              onDelete={onDelete}
            />
          </>
        )}
      </section>
    </main>
  )
}
