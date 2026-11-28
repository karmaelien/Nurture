const { z } = require('zod');
const { validId } = require('./appointments.validators');
const id = z.string().refine(validId, 'Invalid ID.');
const timestamp = z.iso
  .datetime()
  .refine((value) => value.slice(0, 4) !== '0000', 'Use a valid UTC date.');
const version = z.number().int().positive().max(2147483646);
const recurrence = z
  .strictObject({
    unit: z.enum(['days', 'weeks']),
    interval: z.number().int().min(1).max(365),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .refine((days) => new Set(days).size === days.length),
    timeZone: z.string().refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, 'Choose a valid time zone.'),
    end: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('never') }),
      z.strictObject({
        kind: z.literal('onDate'),
        date: z.iso.date().refine((value) => value >= '0001-01-01'),
      }),
      z.strictObject({
        kind: z.literal('afterOccurrences'),
        count: z.number().int().min(1).max(36500),
      }),
    ]),
  })
  .refine(
    (rule) => rule.unit !== 'weeks' || rule.daysOfWeek.length > 0,
    'Select at least one repeat day.',
  );
const detailsSchema = z.strictObject({
  recipientId: id,
  title: z.string().trim().min(1).max(200),
  dueAt: timestamp.nullable(),
  assignedCaregiverId: id.nullable(),
});
const createSchema = detailsSchema
  .extend({ recurrence: recurrence.optional() })
  .refine(
    (body) => !body.recurrence || body.dueAt !== null,
    'Repeating tasks require a due date.',
  );
const versionSchema = z.strictObject({ version });
const updateSchema = z.union([
  detailsSchema.extend({ version }),
  versionSchema.extend({ status: z.enum(['pending', 'completed']) }),
]);
const listSchema = z
  .strictObject({
    dueFrom: timestamp.optional(),
    dueBefore: timestamp.optional(),
    completedFrom: timestamp.optional(),
    completedBefore: timestamp.optional(),
    recipientId: id.optional(),
    status: z.enum(['pending', 'completed']).optional(),
    includeUndated: z.enum(['true', 'false']).optional(),
  })
  .refine(
    (value) =>
      (!value.dueFrom ||
        !value.dueBefore ||
        Date.parse(value.dueFrom) < Date.parse(value.dueBefore)) &&
      (!value.completedFrom ||
        !value.completedBefore ||
        Date.parse(value.completedFrom) < Date.parse(value.completedBefore)) &&
      !(
        value.status === 'pending' &&
        (value.completedFrom || value.completedBefore)
      ),
    'Check the date range and filters.',
  );
module.exports = {
  validId,
  createSchema,
  updateSchema,
  versionSchema,
  listSchema,
};
