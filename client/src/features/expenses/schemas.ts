import { z } from 'zod'

export const expenseCategorySchema = z.enum(['medication', 'appointment', 'insurance', 'utilities', 'other'])

export const createExpenseSchema = z
  .object({
    recipientId: z.string().min(1),
    description: z.string().trim().min(1).max(200),
    category: expenseCategorySchema,
    amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.literal('USD'),
    incurredOn: z.iso
      .date()
      .refine((date) => date <= new Date().toISOString().slice(0, 10), 'Expense date cannot be in the future (UTC).'),
  })
  .strict()

export const updateExpenseSchema = createExpenseSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update.')
