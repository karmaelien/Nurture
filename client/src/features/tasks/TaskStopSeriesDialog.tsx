import { FormDialog } from '../../components/ui/FormDialog.tsx'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { TaskSeriesSummary } from '../../api/types.ts'
import { careApi } from '../../api/care.ts'
import { ApiError, errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useRequiredSession } from '../auth/session.ts'

export function TaskStopSeriesDialog({
  circleId,
  series,
  onClose,
}: {
  circleId: string
  series: TaskSeriesSummary
  onClose: () => void
}) {
  const { user } = useRequiredSession()
  const cache = useQueryClient()
  const dialog = useRef<HTMLDialogElement>(null)
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  async function stop() {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(undefined)
    const refresh = () => cache.invalidateQueries({ queryKey: ['care', user.id, circleId, 'tasks'] })
    try {
      await careApi.stopTaskSeries(circleId, series.id, series.version)
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
    <FormDialog title="Stop repeating?" dialogRef={dialog} busy={busy} isBusy={() => saving.current} onClose={onClose}>
      <p>
        Stop repeating “{series.title}”? Future pending occurrences are removed. Past tasks, undated tasks, and
        completed occurrences stay saved.
      </p>
      {error && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div className="mt-5 flex gap-2">
        <Button loading={busy} onClick={() => void stop()}>
          Confirm stop
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>
          Cancel
        </Button>
      </div>
    </FormDialog>
  )
}
