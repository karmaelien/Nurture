const { z } = require('zod');

exports.createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  budget: z.int().min(0).optional(), // whole cents, e.g. 50000 = $500.00
});