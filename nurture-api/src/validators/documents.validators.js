const { z } = require('zod');
const { httpError } = require('../utils/httpErrors');
const id = z.string().regex(/^[1-9]\d*$/).refine(value => Number(value) <= 2147483647);
const category = z.enum(['medical', 'insurance', 'financial', 'personal', 'other']);
const sharing = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('circle'), memberIds: z.tuple([]) }).strict(),
  z.object({ mode: z.literal('selected'), memberIds: z.array(id).max(1000).refine(ids => new Set(ids).size === ids.length) }).strict(),
]);
const fields = { title: z.string().trim().min(1).max(200), category, sharing };
const createSchema = z.object({ recipientId: id, ...fields }).strict();
const updateSchema = z.object(fields).partial().strict().refine(value => Object.keys(value).length > 0);
const querySchema = z.object({ recipientId: id.optional(), category: category.optional(), search: z.string().trim().max(200).optional() }).strict();
const fileQuerySchema = z.object({ disposition: z.enum(['inline', 'attachment']).default('attachment') }).strict();
const parse = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) throw httpError(400, 'validation_error', 'Provide valid document fields.');
  return result.data;
};
// Content signatures reject renamed files; this is not a malware scanner or full parser.
function validateFile(file) {
  if (!file || !file.size) throw httpError(400, 'validation_error', 'Choose a non-empty file.');
  const bytes = file.buffer;
  const matches = {
    'application/pdf': bytes.subarray(0, 5).toString() === '%PDF-',
    'image/png': bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  };
  if (!matches[file.mimetype]) throw httpError(415, 'unsupported_file_type', 'Choose a PDF, JPEG, or PNG with matching file contents.');
}
function safeName(name) {
  return name.split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f"<>]/g, '_').slice(0, 200) || 'document';
}
module.exports = { createSchema, updateSchema, querySchema, fileQuerySchema, parse, validateFile, safeName };
