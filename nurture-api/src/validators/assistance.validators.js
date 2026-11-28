const { z } = require('zod');
const validId = (value) =>
  /^[1-9]\d*$/.test(String(value)) && Number(value) <= 2147483647;
const cents = z.number().int().min(0).max(100000000);
const createSchema = z
  .strictObject({
    requestId: z.uuid(),
    medicationId: z.string().refine(validId, 'Choose a medication.'),
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
        message:
          'Enter both costs. The current cost must be greater than the previous cost.',
      });
    if (
      value.reason === 'not_covered' &&
      (value.previousCostCents !== null || value.currentCostCents !== null)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Coverage reports must not include a price change.',
      });
  });
const cursor = z
  .string()
  .max(180)
  .refine((value) => {
    const [at, id, extra] = value.split('|');
    return (
      !extra &&
      z.iso.datetime({ precision: 3 }).safeParse(at).success &&
      z.uuid().safeParse(id).success
    );
  }, 'Provide a valid report cursor.')
  .optional();
const querySchema = z.strictObject({
  recipientId: z.string().refine(validId).optional(),
  status: z.enum(['active', 'dismissed', 'all']).default('active'),
  cursor,
});
const notificationSchema = z.strictObject({
  dismissed: z.boolean(),
  version: z.number().int().positive().max(2147483647),
});
module.exports = { validId, createSchema, querySchema, notificationSchema };
