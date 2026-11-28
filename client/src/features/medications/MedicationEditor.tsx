import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { careApi } from '../../api/care.ts'
import { ApiError, errorMessage } from '../../api/client.ts'
import type { CircleDetail, Medication } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { SelectField, TextField } from '../../components/ui/Field.tsx'
import { closeOnBackdropClick } from '../appointments/dialog.ts'
import { useRequiredSession } from '../auth/session.ts'
import { TimeZoneSelect } from '../profiles/TimeZoneSelect.tsx'
import { deviceTimeZone } from '../profiles/schemas.ts'
import { medicationClockTime, medicationInputSchema } from './medication-input.ts'
import {
  dateInZone,
  defaultOverdueMinutes,
  defaultReminderMinutes,
  everyDay,
  medicationTimeZoneLabel,
  weekdays,
} from './medication-schedule.ts'

function initialTime(time?: string) {
  if (!time) return ''
  return `${Number(time.slice(0, 2)) % 12 || 12}:${time.slice(3)}`
}

export function MedicationEditor({
  circle,
  recipientId,
  medication,
  deleting = false,
  stopping = false,
  restarting = false,
  initialStartsOn,
  allowDelete = true,
  onClose,
  onSaved,
}: {
  circle: CircleDetail
  recipientId: string
  medication?: Medication
  deleting?: boolean
  stopping?: boolean
  restarting?: boolean
  initialStartsOn?: string
  allowDelete?: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const { user } = useRequiredSession()
  const cache = useQueryClient()
  const dialog = useRef<HTMLDialogElement>(null)
  const saving = useRef(false)
  const nextTime = useRef(medication?.schedule.times.length ?? 1)
  const [times, setTimes] = useState(() =>
    Array.from({ length: medication?.schedule.times.length ?? 1 }, (_, index) => index),
  )
  const [doseCount, setDoseCount] = useState(String(medication?.schedule.times.length ?? 1))
  const [selectedDays, setSelectedDays] = useState<number[]>([...(medication?.schedule.daysOfWeek ?? everyDay)])
  const [ending, setEnding] = useState<string>(medication?.schedule.end.kind ?? 'never')
  const [confirmDelete, setConfirmDelete] = useState(deleting)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const heading = useId()
  const zone = medication?.schedule.timeZone ?? user.timeZone ?? deviceTimeZone()
  const [today] = useState(() => dateInZone(new Date(), zone))
  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    const values = new FormData(event.currentTarget)
    const field = (name: string) => String(values.get(name) ?? '').trim()
    const count = Number(field('doseCount'))
    if (!Number.isInteger(count) || count < 1 || count > 24 || count !== times.length) {
      setError('Enter a whole number of doses from 1 to 24.')
      return
    }
    const periods = values.getAll('period').map(String)
    const doseTimes = values.getAll('time').map((time, index) => medicationClockTime(String(time), periods[index]))
    if (doseTimes.some((time) => time === null)) {
      setError('Enter each dose time as 1:00 to 12:59 and choose AM or PM.')
      return
    }
    const parsed = medicationInputSchema.safeParse({
      recipientId: field('recipientId'),
      name: field('name'),
      dosage: field('dosage'),
      schedule: {
        times: doseTimes,
        timeZone: field('timeZone'),
        daysOfWeek: values.getAll('weekdays').map(Number),
        startsOn: field('startsOn'),
        overdueAfterMinutes: Number(field('overdueAfterMinutes')),
        reminderBeforeMinutes: field('reminderBeforeMinutes') === '' ? null : Number(field('reminderBeforeMinutes')),
        end:
          ending === 'never'
            ? { kind: 'never' }
            : ending === 'afterDays'
              ? { kind: 'afterDays', days: Number(field('days')) }
              : { kind: 'onDate', date: field('endsOn') },
      },
      assignedCaregiverId: field('assignedCaregiverId') || null,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    await perform(() =>
      medication && !restarting
        ? careApi.updateMedication(circle.id, medication.id, { ...parsed.data, version: medication.version })
        : careApi.createMedication(circle.id, parsed.data),
    )
  }

  // One guard covers saves and confirmed deletion, including batched double clicks.
  async function perform(action: () => Promise<unknown>) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(undefined)
    try {
      await action()
      await cache.invalidateQueries({ queryKey: ['care', user.id, circle.id] })
      onSaved?.()
      dialog.current?.close()
    } catch (cause) {
      if (cause instanceof ApiError && [404, 409].includes(cause.status)) {
        await cache.invalidateQueries({ queryKey: ['care', user.id, circle.id] })
      }
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
          {restarting
            ? 'Restart Medication'
            : stopping
              ? 'Stop Medication'
              : confirmDelete
                ? 'Delete Permanently'
                : medication
                  ? 'Edit Medication'
                  : 'Add Medication'}
        </h2>
        <Button variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>
          Close
        </Button>
      </div>
      {stopping && medication && (
        <div className="grid gap-4">
          <p>
            Stop {medication.name}? Past taken and missed doses stay in your history. Future pending doses and reminders
            stop.
          </p>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button
              loading={busy}
              onClick={() => void perform(() => careApi.stopMedication(circle.id, medication.id, medication.version))}
            >
              Confirm stop
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>
              Keep medication
            </Button>
          </div>
        </div>
      )}
      {!stopping && confirmDelete && medication && (
        <div className="grid gap-4">
          <p>
            Delete {medication.name}? This permanently removes the medication and all its doses, including taken dose
            history.
          </p>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              loading={busy}
              onClick={() => void perform(() => careApi.deleteMedication(circle.id, medication.id, medication.version))}
            >
              Confirm delete
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (deleting) dialog.current?.close()
                else {
                  setError(undefined)
                  setConfirmDelete(false)
                }
              }}
            >
              Keep medication
            </Button>
          </div>
        </div>
      )}
      <form onSubmit={save} hidden={confirmDelete || stopping}>
        {restarting && (
          <p className="mb-4 text-small text-muted">
            Choose the start date for the new course and review its schedule. The stopped course keeps its dose history.
          </p>
        )}
        {medication && !restarting && (
          <p className="mb-4 text-small text-muted">
            Changes apply from now on. Past doses keep their original details and status.
          </p>
        )}
        {error && (
          <div className="mb-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <fieldset disabled={busy} className="grid gap-4">
          <SelectField
            label="Care profile"
            name="recipientId"
            defaultValue={medication?.recipientId || recipientId || circle.recipients[0]?.id}
            required
          >
            {circle.recipients.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </SelectField>
          <TextField label="Medication name" name="name" defaultValue={medication?.name} maxLength={120} required />
          <TextField
            label="Dosage"
            name="dosage"
            defaultValue={medication?.dosage}
            maxLength={120}
            placeholder="e.g. 1 tablet"
            required
          />
          <fieldset className="grid gap-3">
            <legend className="mb-2 font-semibold">Days</legend>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedDays.length === 7}
                ref={(element) => {
                  if (element) element.indeterminate = selectedDays.length > 0 && selectedDays.length < 7
                }}
                onChange={(event) => setSelectedDays(event.target.checked ? [...everyDay] : [])}
              />
              Select all
            </label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {weekdays.map((day, index) => (
                <label key={day} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={index}
                    checked={selectedDays.includes(index)}
                    onChange={(event) =>
                      setSelectedDays((previous) =>
                        event.target.checked ? [...previous, index] : previous.filter((value) => value !== index),
                      )
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
          <TextField
            label="Doses per day"
            name="doseCount"
            type="number"
            min={1}
            max={24}
            step={1}
            required
            value={doseCount}
            hint="On each scheduled day. Choose a time for each dose below."
            onChange={(event) => {
              const value = event.target.value
              setDoseCount(value)
              const count = Number(value)
              if (!Number.isInteger(count) || count < 1 || count > 24) return
              const next = times.slice(0, count)
              while (next.length < count) next.push(nextTime.current++)
              setTimes(next)
            }}
          />
          <fieldset className="grid gap-3">
            <legend className="mb-2 font-semibold">Dose times</legend>
            {times.map((id, index) => (
              <div key={id} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-start gap-2">
                <TextField
                  label={`Dose time ${index + 1}`}
                  name="time"
                  defaultValue={initialTime(medication?.schedule.times[id])}
                  placeholder="9:30"
                  required
                />
                <SelectField
                  label="AM/PM"
                  aria-label={`Dose ${index + 1} AM/PM`}
                  name="period"
                  defaultValue={Number(medication?.schedule.times[id]?.slice(0, 2) ?? 0) >= 12 ? 'PM' : 'AM'}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </SelectField>
              </div>
            ))}
          </fieldset>
          <TimeZoneSelect
            uniqueLabels
            labelForZone={medicationTimeZoneLabel}
            initialZone={zone}
            name="timeZone"
            defaultValue={zone}
            hint="Dose times and course dates follow this time zone."
          />
          <TextField
            label="Remind before (minutes)"
            name="reminderBeforeMinutes"
            type="number"
            min={0}
            max={1440}
            step={1}
            defaultValue={medication ? (medication.schedule.reminderBeforeMinutes ?? '') : defaultReminderMinutes}
            hint="Leave blank to turn reminders off. Use 0 to remind at the dose time."
            optional
          />
          <TextField
            label="Missed after (minutes)"
            name="overdueAfterMinutes"
            type="number"
            min={0}
            max={1440}
            step={1}
            defaultValue={medication?.schedule.overdueAfterMinutes ?? defaultOverdueMinutes}
            hint="A pending dose is flagged missed this many minutes after its scheduled time."
            required
          />
          <TextField
            label="Start date"
            name="startsOn"
            type="date"
            defaultValue={restarting ? '' : (medication?.schedule.startsOn ?? initialStartsOn ?? today)}
            required
          />
          <SelectField label="Ends" value={ending} onChange={(event) => setEnding(event.target.value)}>
            <option value="never">No end date</option>
            <option value="afterDays">After a number of days</option>
            <option value="onDate">On a date</option>
          </SelectField>
          {ending === 'afterDays' && (
            <TextField
              label="Number of days"
              name="days"
              defaultValue={medication?.schedule.end.kind === 'afterDays' ? medication.schedule.end.days : ''}
              type="number"
              min={1}
              max={36500}
              step={1}
              hint="Calendar days, including the start date."
              required
            />
          )}
          {ending === 'onDate' && (
            <TextField
              label="End date"
              name="endsOn"
              defaultValue={
                !restarting && medication?.schedule.end.kind === 'onDate' ? medication.schedule.end.date : ''
              }
              type="date"
              hint="Includes this date."
              required
            />
          )}
          <SelectField
            label="Caregiver"
            name="assignedCaregiverId"
            defaultValue={medication?.assignedCaregiverId ?? ''}
            optional
          >
            <option value="">Unassigned</option>
            {medication?.assignedCaregiverId &&
              !circle.members.some((member) => member.user.id === medication.assignedCaregiverId) && (
                <option value={medication.assignedCaregiverId}>Current caregiver (unavailable)</option>
              )}
            {circle.members.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.name}
              </option>
            ))}
          </SelectField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy}>
              {restarting ? 'Start new course' : 'Save medication'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            {medication && !restarting && allowDelete && (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  setError(undefined)
                  setConfirmDelete(true)
                }}
              >
                Delete permanently
              </Button>
            )}
          </div>
        </fieldset>
      </form>
    </dialog>
  )
}
