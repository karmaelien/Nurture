import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { circlesApi } from '../../api/circles.ts'
import { errorMessage } from '../../api/client.ts'
import type { CircleSummary, CareTask, TaskSeriesSummary } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { SelectField, TextField } from '../../components/ui/Field.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { useTasks } from '../care/queries.ts'
import { CircleSelection } from '../circles/CircleSelection.tsx'
import { useCircleSelection } from '../circles/selection.ts'
import { useMinute } from '../profiles/time.ts'
import { TaskListItem } from './TaskListItem.tsx'
import { compareTasks } from './task-order.ts'
import { TaskEditor } from './TaskEditor.tsx'
import { TaskDeleteDialog } from './TaskDeleteDialog.tsx'
import { TaskCalendar } from './TaskCalendar.tsx'
import { TaskStopSeriesDialog } from './TaskStopSeriesDialog.tsx'
import { TaskAttention } from './TaskAttention.tsx'
import { dashboardWindow } from '../home/dashboard.ts'
import { matchesTask } from './task-filter.ts'
import { FeatureToolbar } from '../../components/ui/FeatureToolbar.tsx'
import { PageHeader } from '../../components/ui/PageHeader.tsx'

function TaskList({ circle }: { circle: CircleSummary }) {
  const { user } = useRequiredSession()
  const [recipientId, setRecipientId] = useState('')
  const [status, setStatus] = useState<CareTask['status'] | ''>('')
  const [search, setSearch] = useState('')
  const [caregiver, setCaregiver] = useState('')
  const [adding, setAdding] = useState(false)
  const [addDate, setAddDate] = useState<string>()
  const [editing, setEditing] = useState<CareTask | null>(null)
  const [deleting, setDeleting] = useState<CareTask | null>(null)
  const [stopping, setStopping] = useState<TaskSeriesSummary | null>(null)
  const now = useMinute().getTime()
  // Bound the list independently of calendar browsing and previously generated occurrences.
  const dueBefore = dashboardWindow(new Date(now)).to
  const tasks = useTasks(circle.id, {
    recipientId: recipientId || undefined,
    status: status || undefined,
    dueBefore,
    includeUndated: true,
  })
  const detail = useQuery({
    queryKey: ['circle', user.id, circle.id],
    queryFn: () => circlesApi.detail(circle.id),
    retry: false,
  })
  const sorted = (tasks.data ?? [])
    .filter(
      (task) => (!task.dueAt || Date.parse(task.dueAt) < Date.parse(dueBefore)) && matchesTask(task, search, caregiver),
    )
    .sort(compareTasks)
  const caregiverName = (id: string | null) =>
    id === null
      ? 'Unassigned'
      : (detail.data?.circle.members.find((member) => member.user.id === id)?.user.name ??
        (detail.isPending ? 'Loading caregiver…' : 'Caregiver unavailable'))
  return (
    <section className="min-w-0 rounded-panel border border-line bg-surface p-5 sm:p-6">
      {stopping && <TaskStopSeriesDialog circleId={circle.id} series={stopping} onClose={() => setStopping(null)} />}
      {deleting && <TaskDeleteDialog task={deleting} circleId={circle.id} onClose={() => setDeleting(null)} />}
      <FeatureToolbar
        actions={
          <Button
            disabled={!detail.data || detail.isError || !circle.recipients.length}
            onClick={() => {
              setAddDate(undefined)
              setAdding(true)
            }}
          >
            Add task
          </Button>
        }
      >
        <div className="w-48">
          <TextField
            label="Search tasks"
            type="search"
            placeholder="Task title"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <SelectField label="Care profile" value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>
          <option value="">All care profiles</option>
          {circle.recipients.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Caregiver" value={caregiver} onChange={(event) => setCaregiver(event.target.value)}>
          <option value="">All caregivers</option>
          <option value="unassigned">Unassigned</option>
          {detail.data &&
            !detail.isError &&
            detail.data.circle.members.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.name}
                {member.user.id === user.id ? ' (You)' : ''}
              </option>
            ))}
          {caregiver &&
            caregiver !== 'unassigned' &&
            (detail.isError || !detail.data?.circle.members.some((member) => member.user.id === caregiver)) && (
              <option value={caregiver}>Selected caregiver</option>
            )}
        </SelectField>
        <SelectField label="Status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="">All tasks</option>
          <option value="pending">To Do</option>
          <option value="completed">Completed</option>
        </SelectField>
        {(search || caregiver || recipientId || status) && (
          <Button
            variant="secondary"
            onClick={() => {
              setSearch('')
              setCaregiver('')
              setRecipientId('')
              setStatus('')
            }}
          >
            Clear filters
          </Button>
        )}
      </FeatureToolbar>
      {(adding || editing) && detail.data && !detail.isError && (
        <TaskEditor
          circle={detail.data.circle}
          recipientId={recipientId}
          task={editing ?? undefined}
          initialDueDate={editing ? undefined : addDate}
          onClose={() => {
            setAdding(false)
            setEditing(null)
            setAddDate(undefined)
          }}
          onSaved={() => {
            if (!editing) {
              setRecipientId('')
              setStatus('pending')
              setSearch('')
              setCaregiver('')
            }
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
      <div className="grid gap-5">
        <TaskAttention
          circle={circle}
          recipientId={recipientId}
          now={now}
          caregiverName={caregiverName}
          onEdit={detail.data && !detail.isError ? setEditing : undefined}
          onDelete={setDeleting}
        />
        <section aria-label="Task list" className="rounded-panel border border-line bg-surface p-5 sm:p-6">
          <p className="mb-3 text-small text-muted">
            Tasks due before {new Date(dueBefore).toLocaleDateString(undefined, { dateStyle: 'medium' })}, plus undated
            tasks. Browse the calendar for later dates.
          </p>
          {tasks.historyPending && (
            <p role="status" className="mb-3 text-muted">
              Loading older repeating tasks…
            </p>
          )}
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
            !tasks.historyPending && <p className="text-muted">No tasks for the selected filters.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto pr-2">
              {sorted.map((task) => {
                return (
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
                    onEdit={detail.data && !detail.isError ? () => setEditing(task) : undefined}
                    onDelete={() => setDeleting(task)}
                  />
                )
              })}
            </ul>
          )}
        </section>
      </div>
      {!tasks.isError && tasks.series.length > 0 && (
        <details className="mt-5 rounded-panel border border-line bg-surface p-5 sm:p-6">
          <summary className="cursor-pointer font-display text-h3 font-semibold">Repeating Tasks</summary>
          <ul className="mt-4 max-h-64 divide-y divide-line overflow-y-auto pr-2">
            {tasks.series.map((series) => (
              <li key={series.id} className="py-4 first:pt-0 last:pb-0">
                <p className="font-semibold">{series.title}</p>
                <p className="mt-1 text-muted">
                  {circle.recipients.find((person) => person.id === series.recipientId)?.name} · {series.description}
                </p>
                {series.stoppedAt ? (
                  <p className="mt-2 text-small text-muted">Repeating stopped</p>
                ) : (
                  <Button
                    className="mt-3"
                    variant="outline"
                    onClick={() => setStopping(series)}
                    aria-label={`Stop repeating: ${series.title}`}
                  >
                    Stop repeating
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      <TaskCalendar
        circle={circle}
        recipientId={recipientId}
        status={status}
        search={search}
        caregiver={caregiver}
        now={now}
        caregiverName={caregiverName}
        onAdd={
          detail.data && !detail.isError && circle.recipients.length
            ? (date) => {
                setAddDate(date)
                setAdding(true)
              }
            : undefined
        }
        onEdit={detail.data && !detail.isError ? (task) => setEditing(task) : undefined}
        onDelete={setDeleting}
      />
    </section>
  )
}

export function TasksPage() {
  const { circles } = useRequiredSession()
  const { circle, selectCircle } = useCircleSelection(circles)
  return (
    <main className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
      <PageHeader
        title="Tasks"
        description="Care tasks and caregiver assignments for your family."
        aside={<CircleSelection circles={circles} circle={circle} onChange={selectCircle} />}
      />
      {circle ? (
        <TaskList key={circle.id} circle={circle} />
      ) : (
        <p className="text-muted">Choose an available care circle to view its tasks.</p>
      )}
    </main>
  )
}
