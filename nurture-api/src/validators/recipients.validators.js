const { z } = require('zod');

const RELATIONSHIPS = ['parent','child','friend','spouse','sibling','grandparent','other']; 

exports.addSchema = z.object({
  name: z.string().trim().min(1).max(80),
  relationship: z.enum(RELATIONSHIPS).nullable()
});

exports.relationshipSchema = z.object({
  relationship: z.enum(RELATIONSHIPS).nullable(),
});