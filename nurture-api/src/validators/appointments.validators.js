const { z } = require('zod');

const validId = value => /^[1-9]\d*$/.test(String(value)) && Number(value) <= 2147483647;
const id = z.string().refine(validId, 'Invalid ID.');
const timestamp = z.iso.datetime().refine(value => Number(value.slice(0, 4)) > 0, 'Use a valid UTC date.');

const querySchema = z.strictObject({ from: timestamp, to: timestamp, recipientId: z.string().optional() })
  .refine(({ from, to }) => Date.parse(from) < Date.parse(to), 'End of the range must be after its start.');

const detailsSchema = z.strictObject({
  recipientId: id,
  title: z.string().trim().min(1).max(120),
  startsAt: timestamp,
  endsAt: timestamp,
  location: z.string().trim().max(240).nullable(),
  assignedCaregiverId: id.nullable(),
}).refine(({ startsAt, endsAt }) => Date.parse(endsAt) > Date.parse(startsAt), 'End time must be after start time.');

const statusSchema = z.strictObject({ status: z.enum(['scheduled', 'completed']) });

module.exports = { validId, querySchema, detailsSchema, statusSchema };
