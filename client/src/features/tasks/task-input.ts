import { z } from 'zod'

export const taskDetailsSchema = z.strictObject({
  recipientId: z.string().min(1, 'Choose a care profile.'),
  title: z.string().trim().min(1, 'Enter a task title.').max(200),
  dueAt: z.iso
    .datetime()
    .refine((value) => value.slice(0, 4) !== '0000', 'Enter a valid due date.')
    .nullable(),
  assignedCaregiverId: z.string().min(1).nullable(),
})

const calendarDate = z.iso.date().refine((value) => value >= '0001-01-01')
export const taskRecurrenceSchema = z
  .strictObject({
    unit: z.enum(['days', 'weeks']),
    interval: z.number().int().min(1).max(365),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .refine((days) => new Set(days).size === days.length),
    timeZone: z.string().refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone })
        return true
      } catch {
        return false
      }
    }, 'Choose a valid time zone.'),
    end: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('never') }),
      z.strictObject({ kind: z.literal('onDate'), date: calendarDate }),
      z.strictObject({ kind: z.literal('afterOccurrences'), count: z.number().int().min(1).max(36500) }),
    ]),
  })
  .refine((rule) => rule.unit !== 'weeks' || rule.daysOfWeek.length > 0, 'Select at least one repeat day.')
export const taskInputSchema = taskDetailsSchema
  .extend({ recurrence: taskRecurrenceSchema.optional() })
  .refine((input) => !input.recurrence || input.dueAt !== null, 'Repeating tasks require a due date.')

export const taskStatusSchema = z.strictObject({
  status: z.enum(['pending', 'completed']),
  version: z.number().int().positive().max(2147483646),
})

export const taskUpdateSchema = taskDetailsSchema.extend({ version: taskStatusSchema.shape.version })

/** Dates and typed 12-hour times belong to the viewer's local zone. A date alone
 * means end of day; reject normalized calendar dates and nonexistent DST times.
 */
export function taskDueAt(date: string, time: string, period: string): string | null {
  if (!date && !time) return null
  if (date.startsWith('0000-')) throw new Error('Enter a valid due date.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a due date before entering a time.')
  let clock = '23:59'
  if (time) {
    const match = /^(\d{1,2})(?::([0-5]\d))?$/.exec(time.trim())
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || !['AM', 'PM'].includes(period))
      throw new Error('Enter a due time from 1:00 to 12:59 and choose AM or PM.')
    clock = `${String((Number(match[1]) % 12) + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${match[2] ?? '00'}`
  }
  const local = `${date}T${clock}`
  const parsed = new Date(local)
  if (!Number.isFinite(parsed.getTime())) throw new Error('Enter a valid due date.')
  const normalized = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  if (normalized !== local) throw new Error('This local date or time does not exist. Choose another due time.')
  return parsed.toISOString()
}
