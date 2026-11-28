import { AttentionNeeded } from '../../components/ui/AttentionNeeded.tsx'
import { TaskListItem } from '../tasks/TaskListItem.tsx'
import { MedicationDoseList } from '../medications/MedicationDoseList.tsx'
import { OverdueDoseControls } from '../medications/OverdueDoseControls.tsx'
import { AppointmentListItem } from '../appointments/AppointmentListItem.tsx'
import { AppointmentEditor } from '../appointments/AppointmentEditor.tsx'
import { compareAppointmentListOrder } from '../appointments/appointment-order.ts'
import { compareTasks } from '../tasks/task-order.ts'
import { useState } from 'react'
import { Link } from 'react-router'
import { ApiError, errorMessage } from '../../api/client.ts'
import type { Appointment, CareTask, CircleSummary, User } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useAppointments, useOverdueMedicationDoses, type useTasks } from '../care/queries.ts'
import { useAppointmentCompletion } from '../appointments/appointment-completion.ts'
import { isAppointmentOverdue } from '../appointments/appointment-overdue.ts'
import { appointmentCalendarRange, toAppointmentSummary } from '../appointments/appointment-record.ts'
import { circleLink } from '../circles/selection.ts'
import { isDoseOverdue } from '../medications/medication-schedule.ts'
import { taskAttention } from '../tasks/task-attention.ts'
import { dashboardWindow } from './dashboard.ts'

/** Home shares the count-button popups and item actions used on the feature pages. */
export function HomeAttention({
  circle,
  recipientId,
  now,
  tasks,
  caregiverName,
  caregivers,
  onTaskEdit,
  onTaskDelete,
}: {
  circle: CircleSummary
  recipientId: string
  now: number
  tasks: ReturnType<typeof useTasks>
  caregiverName: (id: string | null) => string
  caregivers: User[]
  onTaskEdit?: (task: CareTask) => void
  onTaskDelete: (task: CareTask) => void
}) {
  const appointments = useAppointments(
    circle.id,
    recipientId ? { ...appointmentCalendarRange, recipientId } : appointmentCalendarRange,
  )
  const doses = useOverdueMedicationDoses(
    circle.id,
    dashboardWindow(new Date(now)).tomorrowStart,
    recipientId || undefined,
  )
  const { applyCompletion, setCompletion } = useAppointmentCompletion()
  const [editing, setEditing] = useState<Appointment | null>(null)
  const lateTasks = tasks.isError
    ? []
    : (tasks.data ?? []).filter((task) => taskAttention(task, now) === 'overdue').sort(compareTasks)
  const lateAppointments = appointments.isError
    ? []
    : (appointments.data ?? [])
        .map((record) => applyCompletion(toAppointmentSummary(record, circle.id, caregiverName)))
        .filter((appointment) => isAppointmentOverdue(appointment, now))
        .sort(compareAppointmentListOrder)

  const rows = [
    {
      label: 'overdue tasks',
      single: 'overdue task',
      path: '/app/tasks',
      query: tasks,
      partial: tasks.historyPending,
      count: tasks.data?.filter((task) => taskAttention(task, now) === 'overdue').length ?? 0,
    },
    {
      label: 'overdue appointments',
      single: 'overdue appointment',
      path: '/app/appointments',
      query: appointments,
      partial: false,
      count:
        appointments.data?.filter((record) =>
          isAppointmentOverdue(applyCompletion(toAppointmentSummary(record, circle.id, () => '')), now),
        ).length ?? 0,
    },
    {
      label: 'missed doses',
      single: 'missed dose',
      path: '/app/medications',
      query: doses,
      partial: doses.historyPending || (doses.totalOverdueCount === undefined && doses.hasNextPage),
      count: doses.totalOverdueCount ?? doses.data?.filter((dose) => isDoseOverdue(dose, now)).length ?? 0,
    },
  ]
  const accessLost = rows.some(
    ({ query }) => query.error instanceof ApiError && [401, 403, 404].includes(query.error.status),
  )
  const editor = editing && (
    <AppointmentEditor
      circleId={circle.id}
      appointment={editing}
      profiles={circle.recipients}
      caregivers={caregivers}
      onClose={() => setEditing(null)}
    />
  )
  if (rows.every((row) => !row.query.isPending && !row.query.isError && !row.partial && row.count === 0)) return editor
  return (
    <>
      <AttentionNeeded
        scope={JSON.stringify([circle.id, recipientId])}
        className="mb-5"
        items={
          accessLost
            ? []
            : rows.map((row) => ({
                id: row.path,
                label: row.count === 1 ? row.single : row.label,
                count: row.count,
                title:
                  row.path === '/app/tasks'
                    ? 'Overdue tasks'
                    : row.path === '/app/appointments'
                      ? 'Overdue appointments'
                      : 'Missed doses',
                tone: 'danger' as const,
                partial: row.partial,
                loading: row.query.isPending,
                error: row.query.isError ? errorMessage(row.query.error) : undefined,
                retry: () => void row.query.refetch(),
                retryLabel: `Retry ${row.label}`,
                content: (close) => (
                  <>
                    {row.path === '/app/tasks' ? (
                      <>
                        {tasks.historyPending && (
                          <p role="status" className="mb-3 text-muted">
                            Loading older repeating tasks…
                          </p>
                        )}
                        {!lateTasks.length ? (
                          <p>No overdue tasks.</p>
                        ) : (
                          <ul className="divide-y divide-line">
                            {lateTasks.map((task) => (
                              <TaskListItem
                                key={task.id}
                                task={task}
                                circleId={circle.id}
                                now={now}
                                compact
                                person={personName(task.recipientId)}
                                caregiver={caregiverName(task.assignedCaregiverId)}
                                onEdit={
                                  onTaskEdit
                                    ? () => {
                                        close()
                                        onTaskEdit(task)
                                      }
                                    : undefined
                                }
                                onDelete={() => {
                                  close()
                                  onTaskDelete(task)
                                }}
                              />
                            ))}
                          </ul>
                        )}
                      </>
                    ) : row.path === '/app/appointments' ? (
                      <>
                        {!lateAppointments.length ? (
                          <p>No overdue appointments.</p>
                        ) : (
                          <ul className="divide-y divide-line">
                            {lateAppointments.map((appointment) => (
                              <li key={appointment.id} className="py-4 first:pt-0 last:pb-0">
                                <AppointmentListItem
                                  appointment={appointment}
                                  profileName={personName(appointment.recipientId)}
                                  overdue
                                  onComplete={() => setCompletion(appointment, 'completed')}
                                  onEdit={() => {
                                    const record = appointments.data?.find((record) => record.id === appointment.id)
                                    if (record) {
                                      close()
                                      setEditing(record)
                                    }
                                  }}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <>
                        {doses.data?.length ? (
                          <MedicationDoseList
                            circleId={circle.id}
                            doses={doses.data}
                            showDate
                            scrollable={false}
                            totalOverdueCount={doses.totalOverdueCount}
                            overdueCountIsPartial={doses.historyPending}
                            personName={personName}
                          />
                        ) : (
                          <p>No missed doses loaded.</p>
                        )}
                        <OverdueDoseControls
                          historyPending={doses.historyPending}
                          hasNextPage={doses.hasNextPage}
                          busy={doses.isFetchingNextPage}
                          onMore={() => void doses.fetchNextPage()}
                        />
                      </>
                    )}
                    <Link className="link mt-4 inline-block" to={circleLink(row.path, circle.id)}>
                      Open{' '}
                      {row.path === '/app/tasks'
                        ? 'Tasks'
                        : row.path === '/app/appointments'
                          ? 'Appointments'
                          : 'Medications'}
                    </Link>
                  </>
                ),
              }))
        }
      >
        {accessLost && (
          <div className="mt-3">
            <Alert tone="danger">
              Care summary unavailable. Refresh to check your access.{' '}
              <Button
                variant="secondary"
                onClick={() => {
                  for (const row of rows) void row.query.refetch()
                }}
              >
                Retry care summary
              </Button>
            </Alert>
          </div>
        )}
      </AttentionNeeded>
      {editor}
    </>
  )
  function personName(id: string) {
    return circle.recipients.find((person) => person.id === id)?.name ?? 'Care profile unavailable'
  }
}
