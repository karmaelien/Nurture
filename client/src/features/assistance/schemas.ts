import { z } from 'zod'

const cents = z.number().int().min(0).max(100_000_000)
export const assistanceInputSchema = z
  .strictObject({
    requestId: z.uuid(),
    medicationId: z.string().min(1).max(120),
    reason: z.enum(['price_increase', 'not_covered']),
    previousCostCents: cents.nullable(),
    currentCostCents: cents.nullable(),
    notes: z.string().trim().max(500),
  })
  .superRefine((value, ctx) => {
    if (
      value.reason === 'price_increase' &&
      (value.previousCostCents === null ||
        value.currentCostCents === null ||
        value.currentCostCents <= value.previousCostCents)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Enter both costs. The current cost must be greater than the previous cost.',
      })
    if (value.reason === 'not_covered' && (value.previousCostCents !== null || value.currentCostCents !== null))
      ctx.addIssue({ code: 'custom', message: 'Coverage reports must not include a price change.' })
  })
export const assistanceQuerySchema = z.strictObject({
  recipientId: z.string().min(1).max(120).optional(),
  status: z.enum(['active', 'dismissed', 'all']).default('active'),
  cursor: z
    .string()
    .max(180)
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f-]{36}$/i)
    .refine(
      (value) =>
        Number.isFinite(Date.parse(value.split('|')[0])) &&
        new Date(value.split('|')[0]).toISOString() === value.split('|')[0] &&
        z.uuid().safeParse(value.split('|')[1]).success,
    )
    .optional(),
})
export const assistanceNotificationSchema = z.strictObject({
  dismissed: z.boolean(),
  version: z.number().int().positive(),
})
export const reasonLabel = { price_increase: 'Price increase', not_covered: 'Not covered by insurance' } as const
export function parseCost(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null
  const amount = Math.round(Number(value) * 100)
  return Number.isSafeInteger(amount) && amount <= 100_000_000 ? amount : null
}
