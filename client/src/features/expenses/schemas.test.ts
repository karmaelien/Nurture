import { afterEach, expect, it, vi } from 'vitest'
import { createExpenseSchema, updateExpenseSchema } from './schemas.ts'

afterEach(() => vi.useRealTimers())
it('accepts today and past dates but rejects future dates for creates and updates', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-12T23:59:00Z'))
  const body = {
    recipientId: 'rose',
    description: 'Pharmacy',
    category: 'medication',
    amountCents: 100,
    currency: 'USD',
    incurredOn: '2026-11-12',
  }
  expect(createExpenseSchema.safeParse(body).success).toBe(true)
  expect(createExpenseSchema.safeParse({ ...body, incurredOn: '2026-11-11' }).success).toBe(true)
  expect(createExpenseSchema.safeParse({ ...body, incurredOn: '2026-11-13' }).success).toBe(false)
  expect(updateExpenseSchema.safeParse({ incurredOn: '2026-11-13' }).success).toBe(false)
  expect(updateExpenseSchema.safeParse({ amountCents: 200 }).success).toBe(true)
  vi.setSystemTime(new Date('2026-11-13T00:00:00Z'))
  expect(updateExpenseSchema.safeParse({ incurredOn: '2026-11-13' }).success).toBe(true)
})
