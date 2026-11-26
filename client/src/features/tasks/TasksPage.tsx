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
import { useMinute } from '../profiles/time.ts'
import { TaskListItem } from './TaskListItem.tsx'
import { compareTasks } from './task-order.ts'
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
  const sorted = [...(tasks.data ?? [])].sort(compareTasks)
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
          <option value="pending">To Do</option>
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
          <ul className="max-h-96 divide-y divide-line overflow-y-auto pr-2">
            {sorted.map((task) => {
              const caregiver =
                task.assignedCaregiverId === null
                  ? 'Unassigned'
                  : (detail.data?.circle.members.find((member) => member.user.id === task.assignedCaregiverId)?.user
                      .name ?? (detail.isPending ? 'Loading caregiver…' : 'Caregiver unavailable'))
              return (
                <TaskListItem
                  key={task.id}
                  task={task}
                  circleId={circle.id}
                  person={
                    circle.recipients.find((person) => person.id === task.recipientId)?.name ??
                    'Care profile unavailable'
                  }
                  caregiver={caregiver}
                  now={now}
                />
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
