import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { careApi } from '../../api/care.ts'
import { errorMessage } from '../../api/client.ts'
import type { MedicationOccurrence } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { formatTime } from '../home/dashboard.ts'
import { useMinute } from '../profiles/time.ts'
import { isDoseOverdue, isDoseReminderActive, overdueDoseLabel } from './medication-schedule.ts'

function Dose({
  circleId,
  dose,
  person,
  now,
  showDate,
}: {
  circleId: string
  dose: MedicationOccurrence
  person: string
  now: number
  showDate: boolean
}) {
  const { user } = useRequiredSession()
  const cache = useQueryClient()
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const taken = dose.status === 'completed'
  const overdue = isDoseOverdue(dose, now)
  const reminder = isDoseReminderActive(dose, now)
  const minutesUntil = Math.ceil((Date.parse(dose.scheduledAt) - now) / 60_000)
  const action = taken ? 'Mark pending' : 'Mark taken'
  async function changeStatus() {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(undefined)
    try {
      await careApi.updateMedicationDose(circleId, dose.id, taken ? 'pending' : 'completed')
      // Every date/person-filtered view, including Home's count, reads the same saved status.
      await cache.invalidateQueries({ queryKey: ['care', user.id, circleId, 'medication-occurrences'] })
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <p className="font-semibold">
        {showDate && <>{new Date(dose.scheduledAt).toLocaleDateString(undefined, { dateStyle: 'medium' })} · </>}
        {formatTime(dose.scheduledAt)} · {person}
      </p>
      <p className="text-muted">
        {dose.name} · {dose.dosage}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex h-11 items-center rounded-control border px-4 text-[15px] ${taken ? 'border-primary text-primary' : overdue ? 'border-danger text-danger' : reminder ? 'border-warning text-warning' : 'border-line text-muted'}`}
        >
          {taken
            ? 'Taken'
            : overdue
              ? overdueDoseLabel(dose.scheduledAt, now)
              : reminder
                ? minutesUntil > 0
                  ? `Due in ${minutesUntil} min`
                  : 'Due now'
                : 'Pending'}
        </span>
        <Button
          variant="outline"
          loading={busy}
          onClick={() => void changeStatus()}
          aria-label={`${action}: ${dose.name}, ${person}, ${formatTime(dose.scheduledAt)}`}
        >
          {action}
        </Button>
      </div>
      {taken && dose.takenAt && (
        <p className="mt-2 text-small text-muted">
          Taken on {new Date(dose.takenAt).toLocaleDateString(undefined, { dateStyle: 'medium' })} at{' '}
          {new Date(dose.takenAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}
        </p>
      )}
      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </li>
  )
}

export function MedicationDoseList({
  circleId,
  doses,
  personName,
  showDate = false,
}: {
  circleId: string
  doses: MedicationOccurrence[]
  personName: (id: string) => string
  showDate?: boolean
}) {
  const now = useMinute().getTime()
  const overdueCount = doses.filter((dose) => isDoseOverdue(dose, now)).length
  return (
    <>
      {overdueCount > 0 && (
        <p role="status" className="mb-3 font-semibold text-danger">
          {overdueCount} overdue {overdueCount === 1 ? 'dose' : 'doses'}
        </p>
      )}
      <ul className="max-h-96 divide-y divide-line overflow-y-auto pr-2">
        {doses.map((dose) => (
          <Dose
            key={dose.id}
            circleId={circleId}
            dose={dose}
            person={personName(dose.recipientId)}
            now={now}
            showDate={showDate}
          />
        ))}
      </ul>
    </>
  )
}
