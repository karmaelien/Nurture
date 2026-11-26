import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { careApi } from '../../api/care.ts'
import { ApiError, errorMessage } from '../../api/client.ts'
import type { CareTask } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { formatDate, formatTime } from '../home/dashboard.ts'

export function TaskListItem({
  task,
  circleId,
  person,
  caregiver,
  now,
  compact = false,
}: {
  task: CareTask
  circleId: string
  person: string
  caregiver: string
  now: number
  compact?: boolean
}) {
  const { user } = useRequiredSession()
  const cache = useQueryClient()
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const completed = task.status === 'completed'
  const overdue = !completed && task.dueAt !== null && Date.parse(task.dueAt) < now
  const action = completed ? 'Mark To Do' : 'Mark Completed'
  const refresh = () => cache.invalidateQueries({ queryKey: ['care', user.id, circleId, 'tasks'] })
  async function changeStatus() {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(undefined)
    try {
      await careApi.updateTaskStatus(circleId, task.id, completed ? 'pending' : 'completed', task.version)
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
      if (cause instanceof ApiError && [404, 409].includes(cause.status)) await refresh()
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  return (
    <li className={`${compact ? 'py-4' : 'py-5'} first:pt-0 last:pb-0`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={compact ? 'font-semibold' : 'font-display text-h3 font-semibold'}>{task.title}</h2>
        <span
          className={`rounded-control border px-3 py-1 text-small ${overdue ? 'border-danger text-danger' : completed ? 'border-primary text-primary' : 'border-line text-muted'}`}
        >
          {overdue ? 'Overdue' : completed ? 'Completed' : 'To Do'}
        </span>
      </div>
      <p className="mt-2">
        {person} · Caregiver: {caregiver}
      </p>
      <p className="mt-2 text-muted">
        {task.dueAt ? `${formatDate(task.dueAt)} · ${formatTime(task.dueAt)}` : 'No due date'}
      </p>
      {completed && task.completedAt && (
        <p className="mt-2 text-small text-muted">
          Completed on {new Date(task.completedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })} at{' '}
          {new Date(task.completedAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}
        </p>
      )}
      <Button
        className="mt-3"
        variant="outline"
        size="sm"
        loading={busy}
        onClick={() => void changeStatus()}
        aria-label={`${action}: ${task.title}`}
      >
        {action}
      </Button>
      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </li>
  )
}
