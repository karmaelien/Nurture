import type { Medication, MedicationOccurrence } from '../../api/types.ts'
import { dateInZone, defaultOverdueMinutes, scheduleEndDate } from './medication-schedule.ts'

const day = 86_400_000
export const maxDoseRange = 366 * day
export const historyBatchRange = 31 * day
const formatters = new Map<string, Intl.DateTimeFormat>()
export type MedicationRevision = { definition: Medication; from: string | null; to: string }
export type MedicationRevisions = Record<string, MedicationRevision[]>

export function medicationSegments(medication: Medication, revisions: MedicationRevision[] = []) {
  return [
    ...revisions,
    { definition: medication, from: revisions.at(-1)?.to ?? medication.effectiveFrom ?? null, to: null },
  ]
}

/** Generate each part of history using the definition that was effective at that time. */
export function generateEffectiveDoses(
  medication: Medication,
  from: string,
  to: string,
  revisions: MedicationRevision[] = [],
) {
  return medicationSegments(medication, revisions).flatMap((segment) => {
    const lower = Math.max(Date.parse(from), segment.from ? Date.parse(segment.from) : -Infinity)
    const upper = Math.min(
      Date.parse(to),
      segment.to ? Date.parse(segment.to) : Infinity,
      medication.stoppedAt ? Date.parse(medication.stoppedAt) : Infinity,
    )
    return upper > lower
      ? generateMedicationDoses(segment.definition, new Date(lower).toISOString(), new Date(upper).toISOString())
      : []
  })
}

export function medicationHistoryBounds(medication: Medication, before: string, revisions: MedicationRevision[] = []) {
  const segments = medicationSegments(medication, revisions)
  const lower = Math.min(
    ...segments.map((segment) =>
      Math.max(
        Date.parse('0001-01-01T00:00:00Z'),
        Date.parse(`${segment.definition.schedule.startsOn}T00:00:00Z`) - 36 * 3_600_000,
        segment.from ? Date.parse(segment.from) : -Infinity,
      ),
    ),
  )
  const finish = Math.min(
    Date.parse(before),
    medication.stoppedAt ? Date.parse(medication.stoppedAt) : Infinity,
    Math.max(
      ...segments.map((segment) => {
        const end = scheduleEndDate(segment.definition.schedule)
        return Math.min(
          end ? Date.parse(`${end}T00:00:00Z`) + 36 * 3_600_000 : Infinity,
          segment.to ? Date.parse(segment.to) : Infinity,
        )
      }),
    ),
  )
  return { lower, finish }
}

function localMinute(instant: number, timeZone: string) {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      era: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, formatter)
  }
  const parts = formatter.formatToParts(instant)
  const part = (type: string) => parts.find((value) => value.type === type)!.value
  return `${String(part('era') === 'BC' ? 1 - Number(part('year')) : Number(part('year'))).padStart(4, '0')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

/** Resolve a wall-clock minute using the offsets around that date, including DST transitions.
 * A spring-forward time moves forward by the gap; a repeated fall-back time uses its first occurrence.
 * One selected clock time creates at most one dose on a calendar day.
 */
export function doseInstant(date: string, time: string, timeZone: string) {
  const local = `${date}T${time}`
  const naive = Date.parse(`${local}:00Z`)
  const offsets = new Set(
    [-36, 0, 36].map((hours) => {
      const instant = naive + hours * 3_600_000
      return Date.parse(`${localMinute(instant, timeZone)}:00Z`) - instant
    }),
  )
  const candidates = [...offsets].map((offset) => naive - offset)
  const matches = candidates.filter((instant) => localMinute(instant, timeZone) === local)
  const resolved = matches.length ? matches : candidates.filter((instant) => localMinute(instant, timeZone) > local)
  return resolved.length ? new Date(Math.min(...resolved)).toISOString() : null
}

export function generateMedicationDoses(medication: Medication, from: string, to: string): MedicationOccurrence[] {
  const lower = Date.parse(from)
  const upper = Date.parse(to)
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower || upper - lower > maxDoseRange) return []
  const { schedule } = medication
  const first = dateInZone(new Date(lower), schedule.timeZone)
  const last = dateInZone(new Date(upper - 1), schedule.timeZone)
  const end = scheduleEndDate(schedule)
  const start = first > schedule.startsOn ? first : schedule.startsOn
  const finish = end && end < last ? end : last
  const result = new Map<string, MedicationOccurrence>()
  const finishInstant = Date.parse(`${finish}T00:00:00Z`)
  for (
    const date = new Date(`${start}T00:00:00Z`);
    date.getTime() <= finishInstant;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    if (!schedule.daysOfWeek.includes(date.getUTCDay())) continue
    const calendarDate = date.toISOString().slice(0, 10)
    for (const time of schedule.times) {
      const scheduledAt = doseInstant(calendarDate, time, schedule.timeZone)
      if (!scheduledAt || Date.parse(scheduledAt) < lower || Date.parse(scheduledAt) >= upper) continue
      const id = `dose_${medication.id}_${medication.recipientId}_v${medication.version}_${Date.parse(scheduledAt)}`
      result.set(id, {
        id,
        version: 1,
        definitionVersion: medication.version,
        medicationId: medication.id,
        recipientId: medication.recipientId,
        name: medication.name,
        dosage: medication.dosage,
        scheduledAt,
        status: 'pending',
        overdueAfterMinutes: schedule.overdueAfterMinutes ?? defaultOverdueMinutes,
        reminderBeforeMinutes: schedule.reminderBeforeMinutes ?? null,
      })
    }
  }
  return [...result.values()]
}

/** Reconcile only the requested family's range. Retain completed records as history;
 * refresh pending metadata and remove pending doses no longer in the edited schedule.
 */
export function reconcileMedicationDoses(
  stored: MedicationOccurrence[],
  medications: Medication[],
  from: string,
  to: string,
  revisions: MedicationRevisions = {},
) {
  const key = (dose: MedicationOccurrence) => `${dose.medicationId}:${dose.recipientId}:${Date.parse(dose.scheduledAt)}`
  const generated = medications.flatMap((medication) =>
    generateEffectiveDoses(medication, from, to, revisions[medication.id]),
  )
  const frozenBefore = new Map(
    medications.map((medication) => [
      medication.id,
      Date.parse(medication.stoppedAt ?? revisions[medication.id]?.at(-1)?.to ?? ''),
    ]),
  )
  const expected = new Set(generated.map(key))
  const medicationIds = new Set(medications.map((medication) => medication.id))
  const result = stored.filter(
    (dose) =>
      dose.status === 'completed' ||
      Date.parse(dose.scheduledAt) < frozenBefore.get(dose.medicationId)! ||
      !medicationIds.has(dose.medicationId) ||
      Date.parse(dose.scheduledAt) < Date.parse(from) ||
      Date.parse(dose.scheduledAt) >= Date.parse(to) ||
      expected.has(key(dose)),
  )
  const existing = new Map(result.map((dose) => [key(dose), dose]))
  for (const dose of generated) {
    const record = existing.get(key(dose))
    if (!record) result.push(dose)
    else if (record.status === 'pending' && !(Date.parse(record.scheduledAt) < frozenBefore.get(record.medicationId)!))
      refreshPendingDose(record, dose)
  }
  return result
}

/** Metadata changes invalidate old dose actions; identical reads keep the same version. */
export function refreshPendingDose(record: MedicationOccurrence, expected: MedicationOccurrence) {
  const fields = ['recipientId', 'name', 'dosage', 'overdueAfterMinutes', 'reminderBeforeMinutes'] as const
  const changed = fields.some((field) => record[field] !== expected[field])
  Object.assign(record, expected, { id: record.id, version: record.version + (changed ? 1 : 0) })
}

/** Retire obsolete materialized future rows at edit time, before they can age into history. */
export function synchronizeFutureDoses(stored: MedicationOccurrence[], medication: Medication, effectiveAt: string) {
  return stored.filter((dose) => {
    if (
      dose.medicationId !== medication.id ||
      dose.status === 'completed' ||
      Date.parse(dose.scheduledAt) < Date.parse(effectiveAt)
    )
      return true
    const expected = generateEffectiveDoses(
      medication,
      dose.scheduledAt,
      new Date(Date.parse(dose.scheduledAt) + 1).toISOString(),
    )[0]
    if (!expected || expected.recipientId !== dose.recipientId) return false
    refreshPendingDose(dose, expected)
    return true
  })
}

/** Fill unvisited course dates in bounded windows; stable IDs preserve taken records.
 * Coverage avoids regenerating the same history on each one-minute refresh.
 */
export function materializeMedicationHistory(
  stored: MedicationOccurrence[],
  medication: Medication,
  before: string,
  coverage?: { version: number; through: string },
  budget = historyBatchRange,
  revisions: MedicationRevision[] = [],
) {
  const cutoff = Date.parse(before)
  const { lower, finish } = medicationHistoryBounds(medication, before, revisions)
  let cursor = coverage ? Math.max(lower, Date.parse(coverage.through)) : lower
  const initial = cursor
  let doses = stored
  while (cursor < finish && cursor - initial < budget) {
    const upper = Math.min(finish, cursor + maxDoseRange, initial + budget)
    doses = reconcileMedicationDoses(
      doses,
      [medication],
      new Date(cursor).toISOString(),
      new Date(upper).toISOString(),
      { [medication.id]: revisions },
    )
    cursor = upper
  }
  const pending = cursor < finish
  const through = pending
    ? new Date(cursor).toISOString()
    : coverage && Date.parse(coverage.through) > cutoff
      ? coverage.through
      : before
  return { doses, coverage: { version: medication.version, through }, pending, consumed: Math.max(0, cursor - initial) }
}
