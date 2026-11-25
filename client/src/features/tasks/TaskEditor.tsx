import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { careApi } from '../../api/care.ts'
import { errorMessage } from '../../api/client.ts'
import type { CircleDetail } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { SelectField, TextField } from '../../components/ui/Field.tsx'
import { closeOnBackdropClick } from '../appointments/dialog.ts'
import { useRequiredSession } from '../auth/session.ts'
import { taskDueAt, taskInputSchema } from './task-input.ts'

export function TaskEditor({
  circle,
  recipientId,
  onClose,
  onSaved,
}: {
  circle: CircleDetail
  recipientId: string
  onClose: () => void
  onSaved: () => void
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    const form = new FormData(event.currentTarget)
    const field = (name: string) => String(form.get(name) ?? '').trim()
    let dueAt: string | null
    try {
      dueAt = taskDueAt(field('dueDate'), field('dueTime'), field('period'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check the due date and time.')
      return
    }
    const parsed = taskInputSchema.safeParse({
      recipientId: field('recipientId'),
      title: field('title'),
      dueAt,
      assignedCaregiverId: field('caregiver') || null,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    saving.current = true
    setBusy(true)
    setError(undefined)
    try {
      await careApi.createTask(circle.id, parsed.data)
      // Home and all profile/status-filtered task lists read the same saved records.
      await cache.invalidateQueries({ queryKey: ['care', user.id, circle.id, 'tasks'] })
      onSaved()
      dialog.current?.close()
    } catch (cause) {
      setError(errorMessage(cause))
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
          Add task
        </h2>
        <Button variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>
          Close
        </Button>
      </div>
      <form onSubmit={save}>
        {error && (
          <div className="mb-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <fieldset disabled={busy} className="grid gap-4">
          <TextField label="Task title" name="title" maxLength={200} required />
          <SelectField
            label="Care profile"
            name="recipientId"
            defaultValue={recipientId || circle.recipients[0]?.id}
            required
          >
            {circle.recipients.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Caregiver" name="caregiver" defaultValue="" optional>
            <option value="">Unassigned</option>
            {circle.members.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.name}
              </option>
            ))}
          </SelectField>
          <TextField label="Due date" name="dueDate" type="date" optional hint="Leave blank for no due date." />
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-start gap-2">
            <TextField label="Due time" name="dueTime" placeholder="9:30" optional hint="Leave blank for end of day." />
            <SelectField label="AM/PM" name="period" defaultValue="AM">
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </SelectField>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy}>
              Save task
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
          </div>
        </fieldset>
      </form>
    </dialog>
  )
}
