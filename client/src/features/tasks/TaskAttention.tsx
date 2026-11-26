import { useId, useState } from 'react'
import type { CareTask, CircleSummary } from '../../api/types.ts'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useTasks } from '../care/queries.ts'
import { TaskListItem } from './TaskListItem.tsx'
import { compareTasks } from './task-order.ts'
import { taskAttention, taskReminderMinutes } from './task-attention.ts'

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
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const query = useTasks(circle.id, {
    recipientId: recipientId || undefined,
    status: 'pending',
    // The API upper boundary is exclusive; include the exact one-hour deadline.
    dueBefore: new Date(now + taskReminderMinutes * 60_000 + 1).toISOString(),
  })
  // Never display cached task details after a failed permission/data refresh.
  const tasks = query.isError ? [] : (query.data ?? []).filter((task) => taskAttention(task, now)).sort(compareTasks)
  const overdue = tasks.filter((task) => taskAttention(task, now) === 'overdue').length
  const soon = tasks.length - overdue
  if (!tasks.length && !query.historyPending && !query.isError) return null
  return (
    <section aria-label="Task Attention Needed" className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-h3 font-semibold">Attention Needed</h2>
      {query.isError ? (
        <div className="mt-3">
          <Alert tone="danger">
            {errorMessage(query.error)}{' '}
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Retry task reminders
            </Button>
          </Alert>
        </div>
      ) : (
        <>
          <p className="mt-2" role="status">
            {query.historyPending ? 'At least ' : ''}
            <span className={overdue ? 'text-danger' : undefined}>
              {overdue} overdue {overdue === 1 ? 'task' : 'tasks'}
            </span>
            {' · '}
            {soon} due within 1 hour
          </p>
          {query.historyPending && <p className="mt-2 text-small text-muted">Loading older repeating tasks…</p>}
          {tasks.length > 0 && (
            <Button
              className="mt-3"
              variant="outline"
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Hide task reminders' : 'View task reminders'}
            </Button>
          )}
          <div id={contentId}>
            {expanded && (
              <ul className="mt-4 max-h-64 divide-y divide-line overflow-y-auto pr-2">
                {tasks.map((task) => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    circleId={circle.id}
                    person={
                      circle.recipients.find((person) => person.id === task.recipientId)?.name ??
                      'Care profile unavailable'
                    }
                    caregiver={caregiverName(task.assignedCaregiverId)}
                    now={now}
                    compact
                    onEdit={onEdit ? () => onEdit(task) : undefined}
                    onDelete={() => onDelete(task)}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}
