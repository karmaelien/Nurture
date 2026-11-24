import { expect, it } from 'vitest'
import type { Medication } from '../../api/types.ts'
import {
  doseInstant,
  generateMedicationDoses,
  materializeMedicationHistory,
  reconcileMedicationDoses,
} from './medication-occurrences.ts'
import { doseReminderWindow, isDoseOverdue, isDoseReminderActive } from './medication-schedule.ts'

const medication: Medication = {
  id: 'test',
  version: 1,
  recipientId: 'person',
  name: 'Sample',
  dosage: '1 tablet',
  assignedCaregiverId: null,
  schedule: {
    times: ['08:00'],
    timeZone: 'America/New_York',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startsOn: '2026-03-07',
    end: { kind: 'afterDays', days: 3 },
  },
}

it('keeps daily clock times across DST and includes the final course day', () => {
  const doses = generateMedicationDoses(medication, '2026-03-06T00:00:00Z', '2026-03-11T00:00:00Z')
  expect(doses.map((dose) => dose.scheduledAt)).toEqual([
    '2026-03-07T13:00:00.000Z',
    '2026-03-08T12:00:00.000Z',
    '2026-03-09T12:00:00.000Z',
  ])
})

it('uses local weekdays even when the dose falls on the previous UTC day', () => {
  const weekly: Medication = {
    ...medication,
    schedule: {
      ...medication.schedule,
      times: ['00:30'],
      timeZone: 'Asia/Tokyo',
      daysOfWeek: [1],
      startsOn: '2026-12-01',
      end: { kind: 'onDate', date: '2026-12-07' },
    },
  }
  expect(
    generateMedicationDoses(weekly, '2026-12-06T00:00:00Z', '2026-12-07T00:00:00Z').map((dose) => dose.scheduledAt),
  ).toEqual(['2026-12-06T15:30:00.000Z'])
})

it('resolves repeated and skipped hours without creating duplicate doses', () => {
  expect(doseInstant('2026-11-01', '01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z')
  expect(doseInstant('2026-03-08', '02:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z')
  const schedule = { ...medication.schedule, times: ['02:30', '03:30'] }
  const doses = generateMedicationDoses({ ...medication, schedule }, '2026-03-08T00:00:00Z', '2026-03-09T00:00:00Z')
  expect(doses).toHaveLength(1)
})

it('uses inclusive/exclusive query bounds and stable IDs', () => {
  const from = '2026-03-07T13:00:00Z'
  const to = '2026-03-08T12:00:00Z'
  const doses = generateMedicationDoses(medication, from, to)
  expect(doses).toHaveLength(1)
  expect(generateMedicationDoses(medication, from, to)).toEqual(doses)
})

it('flags only pending doses at the configured late threshold', () => {
  const dose = generateMedicationDoses(medication, '2026-03-07T00:00:00Z', '2026-03-08T00:00:00Z')[0]
  const scheduled = Date.parse(dose.scheduledAt)
  expect(isDoseOverdue(dose, scheduled + 30 * 60_000 - 1)).toBe(false)
  expect(isDoseOverdue(dose, scheduled + 30 * 60_000)).toBe(true)
  expect(isDoseOverdue({ ...dose, overdueAfterMinutes: 60 }, scheduled + 30 * 60_000)).toBe(false)
  expect(isDoseOverdue({ ...dose, status: 'completed' }, scheduled + 120 * 60_000)).toBe(false)
})

it('activates reminders at the lead boundary and clears them when taken or overdue', () => {
  const dose = {
    ...generateMedicationDoses(medication, '2026-03-07T00:00:00Z', '2026-03-08T00:00:00Z')[0],
    reminderBeforeMinutes: 15,
  }
  const scheduled = Date.parse(dose.scheduledAt)
  expect(isDoseReminderActive(dose, scheduled - 15 * 60_000 - 1)).toBe(false)
  expect(isDoseReminderActive(dose, scheduled - 15 * 60_000)).toBe(true)
  expect(isDoseReminderActive(dose, scheduled + 29 * 60_000)).toBe(true)
  expect(isDoseReminderActive(dose, scheduled + 30 * 60_000)).toBe(false)
  expect(isDoseReminderActive({ ...dose, status: 'completed' }, scheduled)).toBe(false)
  expect(isDoseReminderActive({ ...dose, reminderBeforeMinutes: null }, scheduled)).toBe(false)
  expect(isDoseReminderActive({ ...dose, reminderBeforeMinutes: 0 }, scheduled - 1)).toBe(false)
  expect(isDoseReminderActive({ ...dose, reminderBeforeMinutes: 0 }, scheduled)).toBe(true)
})

it('loads a next-day dose before midnight and includes the maximum reminder lead', () => {
  const upcoming: Medication = {
    ...medication,
    schedule: {
      ...medication.schedule,
      times: ['00:05'],
      timeZone: 'UTC',
      startsOn: '2026-12-02',
      end: { kind: 'afterDays', days: 1 },
      reminderBeforeMinutes: 15,
    },
  }
  const now = Date.parse('2026-12-01T23:50:00Z')
  const window = doseReminderWindow(now)
  const doses = generateMedicationDoses(upcoming, window.from, window.to)
  expect(doses).toHaveLength(1)
  expect(isDoseReminderActive(doses[0], now)).toBe(true)
  const midnight = Date.parse('2026-12-01T00:00:00Z')
  expect(Date.parse(doseReminderWindow(midnight).to)).toBeGreaterThan(midnight + 24 * 60 * 60_000)
})

it('retains taken history, updates pending metadata, and prunes obsolete pending times', () => {
  const from = '2026-03-07T00:00:00Z',
    to = '2026-03-10T00:00:00Z'
  const stored = generateMedicationDoses(medication, from, to)
  stored[0].status = 'completed'
  const renamed = { ...medication, name: 'Updated sample' }
  const refreshed = reconcileMedicationDoses(stored, [renamed], from, to)
  expect(refreshed[0]).toMatchObject({ status: 'completed', name: 'Sample' })
  expect(refreshed[1]).toMatchObject({ status: 'pending', name: 'Updated sample' })
  const shifted = { ...renamed, schedule: { ...renamed.schedule, times: ['09:00'] } }
  const changed = reconcileMedicationDoses(refreshed, [shifted], from, to)
  expect(changed.filter((dose) => dose.status === 'completed')).toHaveLength(1)
  expect(changed.filter((dose) => dose.status === 'pending')).toHaveLength(3)
  expect(new Set(changed.map((dose) => dose.id)).size).toBe(changed.length)
})

it('fills unvisited history across yearly windows without duplicating or resetting taken doses', () => {
  const weekly: Medication = {
    ...medication,
    schedule: {
      ...medication.schedule,
      daysOfWeek: [1],
      startsOn: '2025-01-01',
      end: { kind: 'onDate', date: '2026-01-05' },
    },
  }
  const first = materializeMedicationHistory([], weekly, '2026-01-06T00:00:00Z')
  expect(first.doses).toHaveLength(53)
  first.doses[0].status = 'completed'
  const second = materializeMedicationHistory(first.doses, weekly, '2026-01-06T00:00:00Z', first.coverage)
  expect(second.doses).toHaveLength(53)
  expect(second.doses[0].status).toBe('completed')
  expect(new Set(second.doses.map((dose) => dose.id)).size).toBe(53)
})
