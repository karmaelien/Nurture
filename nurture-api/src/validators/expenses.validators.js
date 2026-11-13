const { z } = require('zod');

const category = z.enum(['medication', 'appointment', 'insurance', 'utilities', 'other']);
const createSchema = z.object({
  recipientId: z.string().min(1),
  description: z.string().trim().min(1).max(200),
  category,
  amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal('USD'),
  incurredOn: z.iso.date().refine(date => date <= new Date().toISOString().slice(0, 10), 'Expense date cannot be in the future (UTC).'),
}).strict();
const updateSchema = createSchema.partial().refine(body => Object.keys(body).length > 0);
const querySchema = z.object({
  fromDate: z.iso.date(),
  toDate: z.iso.date(),
  recipientId: z.string().min(1).optional(),
  category: category.optional(),
}).strict().refine(query => query.fromDate < query.toDate);

module.exports = { createSchema, updateSchema, querySchema };
