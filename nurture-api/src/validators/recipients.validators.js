const { z } = require('zod');

const RELATIONSHIPS = ['parent','child','friend','spouse','sibling','grandparent','other']; 

const optionalText = (schema) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable().optional());

const isCalendarDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const isBirthDate = z.string().trim().superRefine((s, ctx) => {
  if (!isCalendarDate(s)) {
    ctx.addIssue({ code: 'custom', message: 'Enter a full date of birth, or leave it blank.' });
  } else if (s > new Date().toISOString().slice(0, 10)) {
    ctx.addIssue({ code: 'custom', message: "Date of birth can't be in the future." });
  } else if (s < '1900-01-01') {
    ctx.addIssue({ code: 'custom', message: 'Enter a date of birth after 1900.' });
  }
});

exports.addSchema = z.object({
  name: z.string().trim().min(1).max(80),
  relationship: z.enum(RELATIONSHIPS).nullable(),
  preferredName: optionalText(z.string().trim().min(1).max(80)),
  dateOfBirth: optionalText(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isBirthDate)),
  notes: optionalText(z.string().trim().max(500)),
});

exports.updateSchema = z.object({
  name: z.string().trim().min(1, 'Enter their name.').max(80, 'Keep this to 80 characters or fewer.').optional(),
  preferredName: optionalText(z.string().trim().min(1).max(80)).optional(),
  dateOfBirth: optionalText(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isBirthDate)).optional(),
  notes: optionalText(z.string().trim().max(500, 'Keep notes to 500 characters or fewer.')).optional(),
  version: z.number().int().positive()
});

exports.relationshipSchema = z.object({
  relationship: z.enum(RELATIONSHIPS).nullable(),
});