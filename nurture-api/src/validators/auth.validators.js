const { z } = require('zod');

const email = z.string().trim().toLowerCase().pipe(z.email());

// Accepts any IANA name the runtime understands, including "UTC", which Intl.supportedValuesOf leaves out.
const isTimeZone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const optionalText = (schema) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable().optional());

exports.profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  phone: optionalText(z.string().trim().regex(/^[0-9 +()-]{7,20}$/)),
  timeZone: optionalText(z.string().trim().refine(isTimeZone)),
}).refine((body) => Object.keys(body).length > 0);

exports.registerSchema = z.object({
  email: email,
  name: z.string().trim().min(1).max(80),
  password: z.string().min(12).max(128),
});

exports.loginSchema = z.object({
  email: email,
  password: z.string().min(1),
});