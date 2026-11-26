import { HttpResponse } from 'msw'
import { http } from './http.ts'
import { z } from 'zod'
import type { CareDocument } from '../api/types.ts'
import { createDocumentSchema, documentFileError, updateDocumentSchema } from '../features/documents/schemas.ts'
import { readDb } from './db.ts'
import { bearerToken, error, unauthorized } from './responses.ts'

type Stored = { circleId: string; document: CareDocument; bytes: Uint8Array }
const records = new Map<string, Stored>()
let seeded = false
export function resetMockDocuments() {
  records.clear()
  seeded = false
}
// Files live in memory only; this is a browser demo, not persistent/private storage.
function samplePdf(title: string) {
  const stream = `BT /F1 16 Tf 40 750 Td (${title}) Tj 0 -35 Td (Nurture sample document - demonstration only.) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(pdf)
}
function seed() {
  if (seeded) return
  seeded = true
  const examples = [
    { title: 'November visit summary', recipientId: 'r_rose', category: 'medical' as const, selected: true },
    { title: 'Insurance coverage', recipientId: 'r_rose', category: 'insurance' as const, selected: false },
    { title: 'Physical therapy invoice', recipientId: 'r_frank', category: 'financial' as const, selected: true },
    { title: 'Medication instructions', recipientId: 'r_frank', category: 'medical' as const, selected: false },
  ]
  examples.forEach((item, index) => {
    const id = `doc_demo_${index}`
    const bytes = samplePdf(item.title)
    records.set(id, {
      circleId: 'c_demo',
      bytes,
      document: {
        id,
        recipientId: item.recipientId,
        title: item.title,
        category: item.category,
        fileName: `${item.title.toLowerCase().replaceAll(' ', '-')}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        uploadedBy: 'u_demo',
        version: 1,
        uploadedAt: new Date(Date.now() - index * 86400000).toISOString(),
        sharing: item.selected
          ? { mode: 'selected', memberIds: index === 0 ? ['u_daniel'] : [] }
          : { mode: 'circle', memberIds: [] },
        canManage: true,
      },
    })
  })
}
const missing = () => error(404, 'not_found', 'This document, recipient, or circle is unavailable.')
function access(request: Request, circleId: string) {
  const db = readDb()
  const token = bearerToken(request)
  const userId = token ? db.sessions[token] : undefined
  if (!userId || !db.users.some((u) => u.id === userId)) return { failure: unauthorized() }
  const circle = db.circles.find((c) => c.id === circleId && c.members.some((m) => m.user.id === userId))
  if (!circle) return { failure: missing() }
  seed()
  const owner = circle.members.some((m) => m.user.id === userId && m.role === 'owner')
  const canManage = (d: CareDocument) => owner || d.uploadedBy === userId
  const canRead = (d: CareDocument) =>
    canManage(d) || d.sharing.mode === 'circle' || d.sharing.memberIds.includes(userId)
  return { circle, userId, canManage, canRead }
}
async function handle(request: Request, circleId: string, id?: string, file = false) {
  const context = access(request, circleId)
  if (context.failure) return context.failure
  const { circle, userId, canManage, canRead } = context
  const record = id ? records.get(id) : undefined
  if (id && (!record || record.circleId !== circleId || !canRead(record.document))) return missing()
  const serialize = (d: CareDocument) => ({ ...d, canManage: canManage(d) })
  if (request.method === 'GET') {
    const params = Object.fromEntries(new URL(request.url).searchParams)
    if (
      file &&
      !z
        .object({ disposition: z.enum(['inline', 'attachment']).optional() })
        .strict()
        .safeParse(params).success
    )
      return error(400, 'validation_error', 'Choose inline or attachment disposition.')

    if (record && file)
      return new HttpResponse(new Uint8Array(record.bytes), {
        headers: {
          'Content-Type': record.document.mimeType,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': `${params.disposition ?? 'attachment'}; filename*=UTF-8''${encodeURIComponent(record.document.fileName)}`,
        },
      })
    if (record) return HttpResponse.json({ document: serialize(record.document) })
    const filters = z
      .object({
        recipientId: z.string().min(1).optional(),
        category: z.enum(['medical', 'insurance', 'financial', 'personal', 'other']).optional(),
        search: z.string().trim().max(200).optional(),
      })
      .strict()
      .safeParse(params)
    if (!filters.success) return error(400, 'validation_error', 'Provide valid document filters.')
    if (filters.data.recipientId && !circle.recipients.some((r) => r.id === filters.data.recipientId)) return missing()
    const documents = [...records.values()]
      .filter(
        (r) =>
          r.circleId === circleId &&
          canRead(r.document) &&
          (!filters.data.recipientId || r.document.recipientId === filters.data.recipientId) &&
          (!filters.data.category || r.document.category === filters.data.category) &&
          `${r.document.title} ${r.document.fileName}`
            .toLowerCase()
            .includes((filters.data.search ?? '').toLowerCase()),
      )
      .map((r) => serialize(r.document))
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.id.localeCompare(b.id))
    return HttpResponse.json({ documents })
  }
  if (record && !canManage(record.document))
    return error(403, 'document_manager_only', 'Only the uploader or a circle owner can manage this document.')
  if (request.method === 'DELETE') {
    records.delete(id!)
    return new HttpResponse(null, { status: 204 })
  }
  let metadata: unknown
  let uploaded: File | undefined
  let bytes: Uint8Array | undefined
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null)
    const entry = form?.get('file')
    if (!form || !entry || typeof entry === 'string' || form.getAll('file').length !== 1)
      return error(400, 'validation_error', 'Choose one file.')
    uploaded = entry as File
    const problem = documentFileError(uploaded)
    if (problem)
      return error(
        uploaded.size > 10 * 1024 * 1024 ? 413 : uploaded.size === 0 ? 400 : 415,
        uploaded.size > 10 * 1024 * 1024
          ? 'file_too_large'
          : uploaded.size === 0
            ? 'validation_error'
            : 'unsupported_file_type',
        problem,
      )
    try {
      metadata = JSON.parse(String(form.get('metadata')))
    } catch {
      return error(400, 'validation_error', 'Provide document metadata.')
    }
    bytes = new Uint8Array(await uploaded.arrayBuffer())
    const signature =
      uploaded.type === 'application/pdf'
        ? [37, 80, 68, 70, 45]
        : uploaded.type === 'image/png'
          ? [137, 80, 78, 71, 13, 10, 26, 10]
          : [255, 216, 255]
    if (!signature.every((byte, index) => bytes![index] === byte))
      return error(415, 'unsupported_file_type', 'The file contents do not match its type.')
  } else metadata = await request.json().catch(() => null)
  const parsed = (record ? updateDocumentSchema : createDocumentSchema).safeParse(metadata)
  if (!parsed.success)
    return error(400, 'validation_error', 'Provide a title, category, recipient, and sharing choice.')
  if (parsed.data.sharing?.memberIds.some((id) => !circle.members.some((m) => m.user.id === id))) return missing()
  if (record) {
    const update = updateDocumentSchema.parse(parsed.data)
    if (update.version !== record.document.version)
      return error(
        409,
        'document_conflict',
        'This document changed. Cancel editing, refresh the list, and reopen it before saving.',
      )
    Object.assign(record.document, update, { version: record.document.version + 1 })
    return HttpResponse.json({ document: serialize(record.document) })
  }
  const data = createDocumentSchema.parse(parsed.data)
  if (!circle.recipients.some((r) => r.id === data.recipientId)) return missing()
  const document: CareDocument = {
    ...data,
    id: crypto.randomUUID(),
    fileName: uploaded!.name.replace(/[\\/\r\n]/g, '_'),
    mimeType: uploaded!.type as CareDocument['mimeType'],
    sizeBytes: bytes!.length,
    uploadedBy: userId,
    version: 1,
    uploadedAt: new Date().toISOString(),
    canManage: true,
  }
  records.set(document.id, { circleId, document, bytes: bytes! })
  return HttpResponse.json({ document }, { status: 201 })
}
const base = '/api/circles/:circleId/documents'
export const documentHandlers = [
  http.get(base, ({ request, params }) => handle(request, String(params.circleId))),
  http.post(base, ({ request, params }) => handle(request, String(params.circleId))),
  http.get(`${base}/:documentId/file`, ({ request, params }) =>
    handle(request, String(params.circleId), String(params.documentId), true),
  ),
  ...['get', 'patch', 'delete'].map((method) =>
    http[method as 'get' | 'patch' | 'delete'](`${base}/:documentId`, ({ request, params }) =>
      handle(request, String(params.circleId), String(params.documentId)),
    ),
  ),
]
