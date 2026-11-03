const { z } = require('zod');

exports.createSchema = z.object({
  name: z.string().trim().min(1).max(128),
  recipient: z.object({
    name: z.string().trim().min(1).max(128),
    relationship: z.enum(['parent','grandparent','sibling','friend','spouse','child','other'])
  }),
  budget: z.int().min(0).optional(), // whole cents, e.g. 50000 = $500.00
});