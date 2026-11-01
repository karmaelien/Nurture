const { z } = require('zod');

const ASSIGNABLE = ['admin', 'member', 'dependent', 'viewer']; // never 'owner'

exports.addSchema = z.object({
  email: z.email(),
  role: z.enum(ASSIGNABLE),
  displayName: z.string().trim().min(1).max(100).optional(),
});

exports.roleSchema = z.object({ role: z.enum(ASSIGNABLE) });