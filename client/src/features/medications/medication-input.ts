import { z } from 'zod'
import { isValidTimeZone } from '../profiles/schemas.ts'
import { scheduleEndDate } from './medication-schedule.ts'

const calendarDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Enter a valid calendar date.')

// Validate the definition here and in the mock; individual doses are a separate resource.
export const medicationInputSchema = z.strictObject({
  recipientId: z.string().min(1, 'Choose a care profile.'),
  name: z.string().trim().min(1, 'Enter a medication name.').max(120),
  dosage: z.string().trim().min(1, 'Enter the dosage.').max(120),
  schedule: z
    .strictObject({
      times: z
        .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid dose time.'))
        .min(1, 'Add at least one dose time.')
        .max(24)
        .refine((times) => new Set(times).size === times.length, 'Each dose time must be different.')
        .transform((times) => [...times].sort()),
      timeZone: z.string().refine(isValidTimeZone, 'Choose a valid time zone.'),
      daysOfWeek: z
        .array(z.number().int().min(0).max(6))
        .min(1, 'Choose at least one weekday.')
        .max(7)
        .refine((days) => new Set(days).size === days.length, 'Choose each weekday only once.')
        .transform((days) => [...days].sort((a, b) => a - b)),
      startsOn: calendarDate,
      end: z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('never') }),
        z.strictObject({
          kind: z.literal('afterDays'),
          days: z.number().int().min(1, 'Enter at least one day.').max(36500),
        }),
        z.strictObject({ kind: z.literal('onDate'), date: calendarDate }),
      ]),
    })
    .superRefine((schedule, context) => {
      const end = scheduleEndDate(schedule)
      if (end && end < schedule.startsOn) {
        context.addIssue({ code: 'custom', message: 'The end date must be on or after the start date.', path: ['end'] })
      } else if (end && schedule.daysOfWeek.length) {
        const start = new Date(`${schedule.startsOn}T00:00:00Z`)
        if (!Number.isFinite(start.getTime())) return
        const firstOffset = Math.min(...schedule.daysOfWeek.map((day) => (day - start.getUTCDay() + 7) % 7))
        start.setUTCDate(start.getUTCDate() + firstOffset)
        if (start.toISOString().slice(0, 10) > end)
          context.addIssue({
            code: 'custom',
            message: 'The course must include at least one selected weekday.',
            path: ['end'],
          })
      }
    }),
  assignedCaregiverId: z.string().min(1).nullable(),
})

export const medicationUpdateSchema = medicationInputSchema.extend({ version: z.number().int().positive() })

export function medicationClockTime(value: string, period: string) {
  const match = /^(\d{1,2})(?::([0-5]\d))?$/.exec(value.trim())
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || !['AM', 'PM'].includes(period)) return null
  return `${String((Number(match[1]) % 12) + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${match[2] ?? '00'}`
}
