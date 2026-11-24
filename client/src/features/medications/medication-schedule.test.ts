import { expect, it } from 'vitest'
import { medicationInputSchema } from './medication-input.ts'
import { dateInZone, everyDay, overdueDoseLabel, scheduleEndDate } from './medication-schedule.ts'
import type { MedicationInput } from '../../api/types.ts'

const medication: MedicationInput = {
  name: 'Sample',
  recipientId: 'r_rose',
  dosage: '1 tablet',
  assignedCaregiverId: null,
  schedule: {
    times: ['08:00'],
    timeZone: 'America/New_York',
    daysOfWeek: everyDay,
    startsOn: '2026-03-07',
    end: { kind: 'never' },
  },
}

it('labels older overdue doses by local calendar day', () => {
  const late = new Date(2026, 2, 8, 23, 59).toISOString()
  expect(overdueDoseLabel(late, new Date(2026, 2, 9, 0, 1).getTime())).toBe('Overdue from yesterday')
  expect(overdueDoseLabel(late, new Date(2026, 2, 10, 0, 1).getTime())).toBe('Overdue from 2 days ago')
  expect(overdueDoseLabel(late, new Date(2026, 2, 8, 23, 59).getTime())).toBe('Overdue')
})

it('counts inclusive course days across daylight saving and leap days', () => {
  expect(scheduleEndDate({ ...medication.schedule, end: { kind: 'afterDays', days: 3 } })).toBe('2026-03-09')
  expect(scheduleEndDate({ ...medication.schedule, startsOn: '2028-02-28', end: { kind: 'afterDays', days: 3 } })).toBe(
    '2028-03-01',
  )
  expect(scheduleEndDate({ ...medication.schedule, end: { kind: 'afterDays', days: 1 } })).toBe('2026-03-07')
})

it('rejects impossible dates, reversed courses, and courses with no scheduled weekday', () => {
  for (const schedule of [
    { ...medication.schedule, startsOn: '2026-02-30' },
    { ...medication.schedule, end: { kind: 'onDate', date: '2026-03-06' } },
    { ...medication.schedule, daysOfWeek: [], end: { kind: 'afterDays', days: 2 } },
    { ...medication.schedule, daysOfWeek: [1], end: { kind: 'afterDays', days: 1 } },
    { ...medication.schedule, end: { kind: 'afterDays', days: 0 } },
  ])
    expect(medicationInputSchema.safeParse({ ...medication, schedule }).success).toBe(false)
})

it('uses the course time zone to find the current calendar date', () => {
  expect(dateInZone(new Date('2026-12-01T02:00:00Z'), 'America/New_York')).toBe('2026-11-30')
  expect(dateInZone(new Date('2026-12-01T02:00:00Z'), 'Asia/Tokyo')).toBe('2026-12-01')
})
