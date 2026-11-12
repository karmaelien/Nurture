const { z } = require('zod');

const RELATIONSHIPS = ['parent','child','friend','spouse','sibling','grandparent','other']; 

const optionalText = (schema) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable().optional());

const isBirthDate = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime())
    && d.toISOString().slice(0, 10) === s
    && s >= '1900-01-01'
    && s <= new Date().toISOString().slice(0, 10);
};

exports.addSchema = z.object({
  name: z.string().trim().min(1).max(80),
  relationship: z.enum(RELATIONSHIPS).nullable(),
  preferredName: optionalText(z.string().trim().min(1).max(80)),
  dateOfBirth: optionalText(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isBirthDate)),
  notes: optionalText(z.string().trim().max(500)),
});

exports.relationshipSchema = z.object({
  relationship: z.enum(RELATIONSHIPS).nullable(),
});