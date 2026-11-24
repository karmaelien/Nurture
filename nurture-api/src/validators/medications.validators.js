const { z } = require('zod');
const { validId } = require('./appointments.validators');
const { maxDoseRange, scheduleEndDate } = require('../services/medication-schedule');
const id = z.string().refine(validId, 'Invalid ID.');
const version = z.number().int().positive().max(2147483646);
const date = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Enter a valid calendar date.');
const timestamp = z.iso.datetime().refine((value) => value.slice(0, 4) !== '0000', 'Use a valid UTC date.');
const schedule = z
  .strictObject({
    times: z
      .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
      .min(1)
      .max(24)
      .refine((values) => new Set(values).size === values.length, 'Each dose time must be different.')
      .transform((values) => [...values].sort()),
    timeZone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Choose a valid time zone.'),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((values) => new Set(values).size === values.length)
      .transform((values) => [...values].sort((a, b) => a - b)),
    startsOn: date,
    overdueAfterMinutes: z.number().int().min(0).max(1440).default(30),
    reminderBeforeMinutes: z.number().int().min(0).max(1440).nullable().default(null),
    end: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('never') }),
      z.strictObject({ kind: z.literal('afterDays'), days: z.number().int().min(1).max(36500) }),
      z.strictObject({ kind: z.literal('onDate'), date }),
    ]),
  })
  .superRefine((value, ctx) => {
    const end = scheduleEndDate(value);
    if (end && (end.length !== 10 || end < value.startsOn)) {
      ctx.addIssue({
        code: 'custom',
        message: 'The end date must be valid and on or after the start date.',
        path: ['end'],
      });
    } else if (end && value.daysOfWeek.length) {
      const first = new Date(`${value.startsOn}T00:00:00Z`);
      if (!Number.isFinite(first.getTime())) return;
      first.setUTCDate(
        first.getUTCDate() + Math.min(...value.daysOfWeek.map((day) => (day - first.getUTCDay() + 7) % 7)),
      );
      if (first.toISOString().slice(0, 10) > end)
        ctx.addIssue({
          code: 'custom',
          message: 'The course must include at least one selected weekday.',
          path: ['end'],
        });
    }
  });
const detailsSchema = z.strictObject({
  recipientId: id,
  name: z.string().trim().min(1).max(120),
  dosage: z.string().trim().min(1).max(120),
  schedule,
  assignedCaregiverId: id.nullable(),
});
const updateSchema = detailsSchema.extend({ version });
const versionSchema = z.strictObject({ version });
const doseStatusSchema = versionSchema.extend({ status: z.enum(['pending', 'completed']) });
const rangeSchema = z
  .strictObject({
    from: timestamp,
    to: timestamp,
    recipientId: id.optional(),
    status: z.enum(['pending', 'completed']).optional(),
  })
  .refine(
    (value) =>
      Date.parse(value.to) > Date.parse(value.from) &&
      Date.parse(value.to) - Date.parse(value.from) <= maxDoseRange,
    'Choose a date range of up to 366 days.',
  );
const overdueSchema = z.strictObject({ before: timestamp, recipientId: id.optional() });
const listSchema = z.strictObject({});
module.exports = {
  validId,
  detailsSchema,
  updateSchema,
  versionSchema,
  doseStatusSchema,
  rangeSchema,
  overdueSchema,
  listSchema,
};
