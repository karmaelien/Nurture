import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { circlesApi } from '../../api/circles.ts'
import { errorMessage } from '../../api/client.ts'
import type { CircleSummary, CareTask } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { SelectField } from '../../components/ui/Field.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { useTasks } from '../care/queries.ts'
import { CircleSelection } from '../circles/CircleSelection.tsx'
import { useCircleSelection } from '../circles/selection.ts'
import { formatDate, formatTime } from '../home/dashboard.ts'
import { useMinute } from '../profiles/time.ts'
import { TaskEditor } from './TaskEditor.tsx'

function TaskList({ circle }: { circle: CircleSummary }) {
  const { user } = useRequiredSession()
  const [recipientId, setRecipientId] = useState('')
  const [status, setStatus] = useState<CareTask['status'] | ''>('')
  const [adding, setAdding] = useState(false)
  const now = useMinute().getTime()
  const tasks = useTasks(circle.id, { recipientId: recipientId || undefined, status: status || undefined })
  const detail = useQuery({
    queryKey: ['circle', user.id, circle.id],
    queryFn: () => circlesApi.detail(circle.id),
    retry: false,
  })
  const sorted = [...(tasks.data ?? [])].sort(
    (a, b) =>
      Number(a.status === 'completed') - Number(b.status === 'completed') ||
      (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) ||
      a.title.localeCompare(b.title),
  )
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <SelectField label="Care profile" value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>
          <option value="">All care profiles</option>
          {circle.recipients.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="">All tasks</option>
          <option value="pending">To do</option>
          <option value="completed">Completed</option>
        </SelectField>
        <Button
          className="sm:ml-auto"
          disabled={!detail.data || !circle.recipients.length}
          onClick={() => setAdding(true)}
        >
          Add task
        </Button>
      </div>
      {adding && detail.data && (
        <TaskEditor
          circle={detail.data.circle}
          recipientId={recipientId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setRecipientId('')
            setStatus('pending')
          }}
        />
      )}
      {detail.isError && (
        <div className="mb-5">
          <Alert tone="danger">
            Caregiver names could not load.{' '}
            <Button variant="secondary" onClick={() => void detail.refetch()}>
              Retry caregiver names
            </Button>
          </Alert>
        </div>
      )}
      <section aria-label="Task list" className="rounded-panel border border-line bg-surface p-5 sm:p-6">
        {tasks.isPending ? (
          <p role="status">Loading tasks…</p>
        ) : tasks.isError ? (
          <Alert tone="danger">
            {errorMessage(tasks.error)}{' '}
            <Button variant="secondary" onClick={() => void tasks.refetch()}>
              Retry tasks
            </Button>
          </Alert>
        ) : !sorted.length ? (
          <p className="text-muted">No tasks for the selected filters.</p>
        ) : (
          <ul className="divide-y divide-line">
            {sorted.map((task) => {
              const overdue = task.status === 'pending' && task.dueAt !== null && Date.parse(task.dueAt) < now
              const caregiver =
                task.assignedCaregiverId === null
                  ? 'Unassigned'
                  : (detail.data?.circle.members.find((member) => member.user.id === task.assignedCaregiverId)?.user
                      .name ?? (detail.isPending ? 'Loading caregiver…' : 'Caregiver unavailable'))
              return (
                <li key={task.id} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-h3 font-semibold">{task.title}</h2>
                    <span
                      className={`rounded-control border px-3 py-1 text-small ${overdue ? 'border-danger text-danger' : 'border-line text-muted'}`}
                    >
                      {overdue ? 'Overdue' : task.status === 'completed' ? 'Completed' : 'To do'}
                    </span>
                  </div>
                  <p className="mt-2">
                    {circle.recipients.find((person) => person.id === task.recipientId)?.name ??
                      'Care profile unavailable'}{' '}
                    · Caregiver: {caregiver}
                  </p>
                  <p className="mt-2 text-muted">
                    {task.dueAt ? `${formatDate(task.dueAt)} · ${formatTime(task.dueAt)}` : 'No due date'}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

export function TasksPage() {
  const { circles } = useRequiredSession()
  const { circle, selectCircle } = useCircleSelection(circles)
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-h1 font-bold">Tasks</h1>
          <p className="mt-2 text-muted">Care tasks and caregiver assignments for your family.</p>
        </div>
        <CircleSelection circles={circles} circle={circle} onChange={selectCircle} />
      </div>
      {circle ? (
        <TaskList key={circle.id} circle={circle} />
      ) : (
        <p className="text-muted">Choose an available care circle to view its tasks.</p>
      )}
    </main>
  )
}
