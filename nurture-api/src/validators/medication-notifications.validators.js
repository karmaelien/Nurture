const { z } = require('zod');
const { httpError } = require('../utils/httpErrors');

const endpoint = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      // These become outbound request targets; arbitrary and internal URLs are not accepted.
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.port &&
        (['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(
          url.hostname,
        ) ||
          url.hostname.endsWith('.notify.windows.com'))
      );
    } catch {
      return false;
    }
  }, 'Unsupported browser push service.');

const subscriptionSchema = z.strictObject({
  endpoint,
  expirationTime: z.number().positive().nullable(),
  keys: z.strictObject({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .refine((value) => Buffer.from(value, 'base64url').length === 65),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .refine((value) => Buffer.from(value, 'base64url').length === 16),
  }),
});
const endpointSchema = z.strictObject({ endpoint });
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw httpError(400, 'validation_error', 'Invalid notification subscription.');
  return result.data;
}

module.exports = { subscriptionSchema, endpointSchema, parse };
