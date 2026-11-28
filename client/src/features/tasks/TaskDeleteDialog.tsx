import { FormDialog } from '../../components/ui/FormDialog.tsx'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { careApi } from '../../api/care.ts'
import { ApiError, errorMessage } from '../../api/client.ts'
import type { CareTask } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useRequiredSession } from '../auth/session.ts'

export function TaskDeleteDialog({
  task,
  circleId,
  onClose,
}: {
  task: CareTask
  circleId: string
  onClose: () => void
}) {
  const { user } = useRequiredSession()
  const cache = useQueryClient()
  const dialog = useRef<HTMLDialogElement>(null)
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const heading = useId()

  async function remove() {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(undefined)
    const refresh = () => cache.invalidateQueries({ queryKey: ['care', user.id, circleId, 'tasks'] })
    try {
      // Use the version shown when confirmation opened; a refreshed row must not authorize a stale delete.
      await careApi.deleteTask(circleId, task.id, task.version)
      await refresh()
      dialog.current?.close()
    } catch (cause) {
      setError(errorMessage(cause))
      if (cause instanceof ApiError && [404, 409].includes(cause.status)) await refresh()
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  return (
    <FormDialog
      title="Delete task?"
      dialogRef={dialog}
      busy={busy}
      isBusy={() => saving.current}
      onClose={onClose}
      descriptionId={`${heading}-description`}
    >
      <p id={`${heading}-description`}>
        Delete “{task.title}”? This permanently removes the task
        {task.status === 'completed' ? ' and its completion record' : ''}.
      </p>
      {task.seriesId && (
        <p className="mt-3 text-small text-muted">Only this occurrence is deleted. Other repeating tasks remain.</p>
      )}
      {error && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="danger" loading={busy} onClick={() => void remove()}>
          Delete task
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>
          Cancel
        </Button>
      </div>
    </FormDialog>
  )
}
