import type { CareTask, CircleSummary } from '../../api/types.ts'
import { errorMessage } from '../../api/client.ts'
import { useTasks } from '../care/queries.ts'
import { TaskListItem } from './TaskListItem.tsx'
import { compareTasks } from './task-order.ts'
import { taskAttention, taskReminderMinutes } from './task-attention.ts'
import { AttentionNeeded } from '../../components/ui/AttentionNeeded.tsx'

/** Shared in-page reminders. Status filtering must not conceal pending deadlines. */
export function TaskAttention({
  circle,
  recipientId,
  now,
  caregiverName,
  onEdit,
  onDelete,
}: {
  circle: CircleSummary
  recipientId: string
  now: number
  caregiverName: (id: string | null) => string
  onEdit?: (task: CareTask) => void
  onDelete: (task: CareTask) => void
}) {
  // Fetch a stable daily window; exact reminder eligibility still updates each minute below.
  // Include the next hour after midnight so near-midnight reminders remain available.
  const through = new Date(now)
  through.setHours(24, taskReminderMinutes, 0, 1)
  const query = useTasks(circle.id, {
    recipientId: recipientId || undefined,
    status: 'pending',
    dueBefore: through.toISOString(),
  })
  // Never display cached task details after a failed permission/data refresh.
  const tasks = query.isError ? [] : (query.data ?? []).filter((task) => taskAttention(task, now)).sort(compareTasks)
  const overdue = tasks.filter((task) => taskAttention(task, now) === 'overdue').length
  const soon = tasks.length - overdue
  if (!tasks.length && !query.isPending && !query.historyPending && !query.isError) return null
  return (
    <AttentionNeeded
      label="Task Attention Needed"
      scope={JSON.stringify([circle.id, recipientId])}
      items={[
        {
          id: 'overdue',
          label: overdue === 1 ? 'overdue task' : 'overdue tasks',
          count: overdue,
          title: 'Overdue tasks',
          tone: 'danger',
          partial: query.historyPending,
          loading: query.isPending,
          error: query.isError ? errorMessage(query.error) : undefined,
          retry: () => void query.refetch(),
          retryLabel: 'Retry task reminders',
          content: (close) => renderTasks('overdue', close),
        },
        {
          id: 'soon',
          label: 'tasks due within 1 hour',
          count: soon,
          title: 'Tasks due within 1 hour',
          tone: 'warning',
          loading: query.isPending,
          content: (close) => renderTasks('soon', close),
        },
      ]}
    />
  )

  function renderTasks(kind: 'overdue' | 'soon', close: () => void) {
    const matches = tasks.filter((task) => taskAttention(task, now) === kind)
    return (
      <>
        {query.historyPending && (
          <p role="status" className="mb-3 text-muted">
            Loading older repeating tasks…
          </p>
        )}
        {!matches.length ? (
          <p className="text-muted">No {kind === 'overdue' ? 'overdue tasks' : 'tasks due within 1 hour'}.</p>
        ) : (
          <ul className="divide-y divide-line">
            {matches.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                circleId={circle.id}
                person={
                  circle.recipients.find((person) => person.id === task.recipientId)?.name ?? 'Care profile unavailable'
                }
                caregiver={caregiverName(task.assignedCaregiverId)}
                now={now}
                onEdit={
                  onEdit
                    ? () => {
                        close()
                        onEdit(task)
                      }
                    : undefined
                }
                onDelete={() => {
                  close()
                  onDelete(task)
                }}
              />
            ))}
          </ul>
        )}
      </>
    )
  }
}
