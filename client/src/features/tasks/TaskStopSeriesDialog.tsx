import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import type { TaskSeriesSummary } from '../../api/types.ts'
import { careApi } from '../../api/care.ts'
import { ApiError, errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { closeOnBackdropClick } from '../appointments/dialog.ts'
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
  const heading = useId()
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
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
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      onClose={onClose}
      onCancel={(event) => {
        if (saving.current) event.preventDefault()
      }}
      onClick={(event) => {
        if (!saving.current) closeOnBackdropClick(event)
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-panel border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id={heading} className="font-display text-h2 font-semibold">
          Stop repeating?
        </h2>
        <Button variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>
          Close
        </Button>
      </div>
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
          Keep repeating
        </Button>
      </div>
    </dialog>
  )
}
