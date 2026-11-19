const { z } = require('zod');
const { addSchema } = require('./recipients.validators');

exports.createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  budget: z.number().int().min(0).optional(),
  recipient: addSchema
});

exports.updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  budget: z.number().int().min(0).optional()
})