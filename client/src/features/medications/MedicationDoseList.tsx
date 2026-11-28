import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { careApi } from '../../api/care.ts'
import { ApiError, errorMessage } from '../../api/client.ts'
import type { MedicationOccurrence } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { formatTime } from '../home/dashboard.ts'
import { useMinute } from '../profiles/time.ts'
import { isDoseOverdue, isDoseReminderActive, overdueDoseLabel } from './medication-schedule.ts'

import { StatusBadge } from '../../components/ui/StatusBadge.tsx'

function Dose({
  circleId,
  dose,
  person,
  now,
  showDate,
  onEdit,
  onDelete,
}: {
  circleId: string
  dose: MedicationOccurrence
  person: string
  now: number
  showDate: boolean
  onEdit?: () => void
  onDelete?: () => void
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
      await careApi.updateMedicationDose(circleId, dose.id, taken ? 'pending' : 'completed', dose.version)
      // Every date/person-filtered view, including Home's count, reads the same saved status.
      await cache.invalidateQueries({ queryKey: ['care', user.id, circleId, 'medication-occurrences'] })
    } catch (cause) {
      setError(errorMessage(cause))
      if (cause instanceof ApiError && [404, 409].includes(cause.status))
        await cache.invalidateQueries({ queryKey: ['care', user.id, circleId, 'medication-occurrences'] })
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
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted">
          {dose.name} · {dose.dosage}
        </p>
        <StatusBadge tone={taken ? 'positive' : overdue ? 'danger' : reminder ? 'warning' : 'neutral'}>
          {taken
            ? 'Taken'
            : overdue
              ? overdueDoseLabel(dose.scheduledAt, now)
              : reminder
                ? minutesUntil > 0
                  ? `Due in ${minutesUntil} min`
                  : 'Due now'
                : 'Pending'}
        </StatusBadge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          loading={busy}
          onClick={() => void changeStatus()}
          aria-label={`${action}: ${dose.name}, ${person}, ${formatTime(dose.scheduledAt)}`}
        >
          {action}
        </Button>
        {onEdit && (
          <Button variant="outline" onClick={onEdit}>
            Edit medication
          </Button>
        )}
        {onDelete && (
          <Button variant="danger" onClick={onDelete}>
            Delete medication
          </Button>
        )}
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
  totalOverdueCount,
  overdueCountIsPartial = false,
  scrollable = true,
  onEdit,
  onDelete,
  editableMedicationIds,
  deletableMedicationIds,
}: {
  circleId: string
  doses: MedicationOccurrence[]
  personName: (id: string) => string
  showDate?: boolean
  totalOverdueCount?: number
  overdueCountIsPartial?: boolean
  scrollable?: boolean
  onEdit?: (medicationId: string) => void
  onDelete?: (medicationId: string) => void
  deletableMedicationIds?: string[]
  editableMedicationIds?: string[]
}) {
  const now = useMinute().getTime()
  const priority = (dose: MedicationOccurrence) => (dose.status === 'completed' ? 2 : isDoseOverdue(dose, now) ? 0 : 1)
  const orderedDoses = [...doses].sort(
    (a, b) => priority(a) - priority(b) || Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
  )
  const overdueCount = totalOverdueCount ?? doses.filter((dose) => isDoseOverdue(dose, now)).length
  return (
    <>
      {overdueCount > 0 && (
        <p role="status" className="mb-3 font-semibold text-danger">
          {overdueCountIsPartial ? 'At least ' : ''}
          {overdueCount} missed {overdueCount === 1 ? 'dose' : 'doses'}
        </p>
      )}
      <ul className={scrollable ? 'max-h-64 divide-y divide-line overflow-y-auto pr-2' : 'divide-y divide-line'}>
        {orderedDoses.map((dose) => (
          <Dose
            key={dose.id}
            circleId={circleId}
            dose={dose}
            person={personName(dose.recipientId)}
            now={now}
            showDate={showDate}
            onDelete={
              onDelete && deletableMedicationIds?.includes(dose.medicationId)
                ? () => onDelete(dose.medicationId)
                : undefined
            }
            onEdit={
              onEdit && editableMedicationIds?.includes(dose.medicationId) ? () => onEdit(dose.medicationId) : undefined
            }
          />
        ))}
      </ul>
    </>
  )
}
