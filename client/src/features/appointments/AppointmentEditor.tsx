import { FormDialog } from '../../components/ui/FormDialog.tsx'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { careApi } from '../../api/care.ts'
import { errorMessage } from '../../api/client.ts'
import type { Appointment } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { SelectField, TextField } from '../../components/ui/Field.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { appointmentInputSchema } from './appointment-input.ts'

type Person = { id: string; name: string }

function localDateTime(timestamp?: string) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function AppointmentTimeField({ kind, timestamp }: { kind: 'Start' | 'End'; timestamp?: string }) {
  const date = timestamp ? new Date(timestamp) : null
  const hour = date?.getHours() ?? 0
  const time = date ? `${hour % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}` : ''
  const prefix = kind.toLowerCase()
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-start gap-2">
      <TextField label={`${kind} time`} name={`${prefix}Time`} placeholder="9:30" defaultValue={time} required />
      <SelectField
        label="AM/PM"
        aria-label={`${kind} AM/PM`}
        name={`${prefix}Period`}
        defaultValue={hour < 12 ? 'AM' : 'PM'}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </SelectField>
    </div>
  )
}

function parseTime(value: string, period: string) {
  const match = /^(\d{1,2})(?::([0-5]\d))?$/.exec(value)
  if (!match) return null
  const [, hours, minutes] = match
  const hour = Number(hours)
  if (hour < 1 || hour > 12 || (period !== 'AM' && period !== 'PM')) return null
  const hour24 = (hour % 12) + (period === 'PM' ? 12 : 0)
  return `${String(hour24).padStart(2, '0')}:${minutes ?? '00'}`
}

export function AppointmentEditor({
  circleId,
  appointment,
  initialDate,
  initialRecipientId,
  deleting = false,
  profiles,
  caregivers,
  onClose,
  onSaved,
}: {
  circleId: string
  appointment?: Appointment
  initialDate?: string
  initialRecipientId?: string
  deleting?: boolean
  profiles: Person[]
  caregivers: Person[]
  onClose: () => void
  onSaved?: (action: 'saved' | 'deleted') => void
}) {
  const { user } = useRequiredSession()
  const queryClient = useQueryClient()
  const refreshAppointments = () =>
    queryClient.invalidateQueries({ queryKey: ['care', user.id, circleId, 'appointments'] })
  const dialog = useRef<HTMLDialogElement>(null)
  // Claim the write immediately, including submits batched before React disables the button.
  const saving = useRef(false)
  const [confirmDelete, setConfirmDelete] = useState(deleting)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit(action: () => Promise<void>) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(undefined)
    try {
      await action()
      onSaved?.(confirmDelete ? 'deleted' : 'saved')
      dialog.current?.close()
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const field = (name: string) => String(values.get(name) ?? '').trim()
    const startTime = parseTime(field('startTime'), field('startPeriod'))
    const endTime = parseTime(field('endTime'), field('endPeriod'))
    if (!startTime || !endTime) {
      setError('Enter times like 9:30 and choose AM or PM.')
      return
    }
    const startDate = field('startDate')
    const startLocal = `${startDate}T${startTime}`
    const endLocal = `${field('endDate') || startDate}T${endTime}`
    const start = new Date(startLocal)
    const end = new Date(endLocal)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      setError('Enter a valid start and end time.')
      return
    }
    // Reject wall-clock times skipped by daylight saving before saving UTC.
    if (localDateTime(start.toISOString()) !== startLocal || localDateTime(end.toISOString()) !== endLocal) {
      setError('Choose a start and end time that exist in your local time zone.')
      return
    }
    const parsed = appointmentInputSchema.safeParse({
      recipientId: field('recipientId'),
      title: field('title'),
      startsAt:
        appointment && startLocal === localDateTime(appointment.startsAt) ? appointment.startsAt : start.toISOString(),
      endsAt:
        appointment?.endsAt && endLocal === localDateTime(appointment.endsAt) ? appointment.endsAt : end.toISOString(),
      location: field('location') || null,
      assignedCaregiverId: field('assignedCaregiverId') || null,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    void submit(async () => {
      if (appointment) await careApi.updateAppointment(circleId, appointment.id, parsed.data)
      else await careApi.createAppointment(circleId, parsed.data)
      await refreshAppointments()
    })
  }

  const startDate = appointment ? localDateTime(appointment.startsAt).slice(0, 10) : (initialDate ?? '')
  const endDate = localDateTime(appointment?.endsAt).slice(0, 10)

  return (
    <FormDialog
      title={confirmDelete ? 'Delete appointment?' : appointment ? 'Edit appointment' : 'Add appointment'}
      dialogRef={dialog}
      busy={busy}
      isBusy={() => saving.current}
      onClose={onClose}
    >
      {error && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {confirmDelete && <p className="mt-2 text-muted">Delete {appointment?.title} from the calendar and dashboard?</p>}
      <form onSubmit={save} hidden={confirmDelete} className={confirmDelete ? 'hidden' : 'mt-5 grid gap-4'}>
        <SelectField
          label="Care profile"
          name="recipientId"
          defaultValue={appointment?.recipientId ?? initialRecipientId ?? profiles[0]?.id}
          required
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Title" name="title" defaultValue={appointment?.title} maxLength={120} required />
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <TextField label="Start date" name="startDate" type="date" defaultValue={startDate} required />
          <AppointmentTimeField kind="Start" timestamp={appointment?.startsAt} />
          <TextField
            label="End date"
            name="endDate"
            type="date"
            defaultValue={endDate === startDate ? '' : endDate}
            hint="Leave blank to use the start date."
            optional
          />
          <AppointmentTimeField kind="End" timestamp={appointment?.endsAt} />
        </div>
        <TextField
          label="Location"
          name="location"
          defaultValue={appointment?.location ?? ''}
          maxLength={240}
          optional
        />
        <SelectField
          label="Caregiver"
          name="assignedCaregiverId"
          defaultValue={appointment?.assignedCaregiverId ?? ''}
          optional
        >
          <option value="">Unassigned</option>
          {appointment?.assignedCaregiverId &&
            !caregivers.some((person) => person.id === appointment.assignedCaregiverId) && (
              <option value={appointment.assignedCaregiverId}>Current caregiver</option>
            )}
          {caregivers.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy}>
            Save appointment
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>
            Cancel
          </Button>
          {appointment && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setError(undefined)
                setConfirmDelete(true)
              }}
            >
              Delete appointment
            </Button>
          )}
        </div>
      </form>
      {confirmDelete && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="danger"
            loading={busy}
            onClick={() =>
              void submit(async () => {
                if (!appointment) return
                await careApi.deleteAppointment(circleId, appointment.id)
                await refreshAppointments()
              })
            }
          >
            Delete appointment
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setError(undefined)
              if (deleting) dialog.current?.close()
              else setConfirmDelete(false)
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </FormDialog>
  )
}
