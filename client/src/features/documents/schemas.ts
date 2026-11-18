import { z } from 'zod'
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const documentCategories = {
  medical: 'Medical',
  insurance: 'Insurance',
  financial: 'Financial',
  personal: 'Personal',
  other: 'Other',
}
export const documentSharingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('circle'), memberIds: z.tuple([]) }).strict(),
  z
    .object({
      mode: z.literal('selected'),
      memberIds: z.array(z.string().min(1)).refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
])
export const createDocumentSchema = z
  .object({
    recipientId: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    category: z.enum(['medical', 'insurance', 'financial', 'personal', 'other']),
    sharing: documentSharingSchema,
  })
  .strict()
export const updateDocumentSchema = createDocumentSchema
  .omit({ recipientId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0)
export function documentFileError(file: File) {
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return 'Choose a PDF, JPEG, or PNG file.'
  if (!file.size) return 'Choose a file that is not empty.'
  if (file.size > MAX_DOCUMENT_BYTES) return 'Choose a file no larger than 10 MiB.'
  return null
}
