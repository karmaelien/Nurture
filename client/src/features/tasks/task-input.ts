import { z } from 'zod'

export const taskInputSchema = z.strictObject({
  recipientId: z.string().min(1, 'Choose a care profile.'),
  title: z.string().trim().min(1, 'Enter a task title.').max(200),
  dueAt: z.iso.datetime().nullable(),
  assignedCaregiverId: z.string().min(1).nullable(),
})

/** Dates and typed 12-hour times belong to the viewer's local zone. A date alone
 * means end of day; reject normalized calendar dates and nonexistent DST times.
 */
export function taskDueAt(date: string, time: string, period: string): string | null {
  if (!date && !time) return null
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
