import { http, HttpResponse } from 'msw'
import { z } from 'zod'
import { reconcileMedicationDoses } from '../features/medications/medication-occurrences.ts'
import { medicationInputSchema, medicationUpdateSchema } from '../features/medications/medication-input.ts'
import { readDb, writeDb } from './db.ts'
import { bearerToken, error, unauthorized } from './responses.ts'

function scope(request: Request, circleId: unknown) {
  const db = readDb()
  const token = bearerToken(request)
  const userId = token ? db.sessions[token] : undefined
  if (!userId || !db.users.some((user) => user.id === userId)) return { failure: unauthorized() }
  const circle = db.circles.find(
    (item) => item.id === circleId && item.members.some((member) => member.user.id === userId),
  )
  if (!circle) return { failure: error(404, 'not_found', 'This care circle is unavailable.') }
  return { db, circle }
}

const path = '/api/circles/:circleId/medications'
export const medicationHandlers = [
  http.patch('/api/circles/:circleId/medication-occurrences/:occurrenceId', async ({ request, params }) => {
    const body = await request.json().catch(() => null)
    const context = scope(request, params.circleId)
    if (context.failure) return context.failure
    const { db, circle } = context
    const parsed = z.strictObject({ status: z.enum(['pending', 'completed']) }).safeParse(body)
    if (!parsed.success) return error(400, 'validation_error', 'Choose taken or pending.')
    const dose = db.care.medicationOccurrences.find(
      (item) => item.id === params.occurrenceId && circle.recipients.some((person) => person.id === item.recipientId),
    )
    if (!dose) return error(404, 'not_found', 'This dose is unavailable.')
    const medication = db.care.medications.find(
      (item) => item.id === dose.medicationId && circle.recipients.some((person) => person.id === item.recipientId),
    )
    if (!medication) return error(404, 'not_found', 'This medication is unavailable.')
    const end = new Date(Date.parse(dose.scheduledAt) + 1).toISOString()
    db.care.medicationOccurrences = reconcileMedicationDoses(
      db.care.medicationOccurrences,
      [medication],
      dose.scheduledAt,
      end,
    )
    const current = db.care.medicationOccurrences.find((item) => item.id === dose.id)
    if (!current) return error(404, 'not_found', 'This dose is no longer in the current schedule. Refresh the list.')
    if (parsed.data.status === 'completed' && current.status !== 'completed') current.takenAt = new Date().toISOString()
    if (parsed.data.status === 'pending') current.takenAt = null
    current.status = parsed.data.status
    writeDb(db)
    return HttpResponse.json({ medicationOccurrence: current })
  }),
  http.get(path, ({ request, params }) => {
    const context = scope(request, params.circleId)
    if (context.failure) return context.failure
    const { db, circle } = context
    return HttpResponse.json({
      medications: db.care.medications.filter((medication) =>
        circle.recipients.some((person) => person.id === medication.recipientId),
      ),
    })
  }),
  http.post(path, async ({ request, params }) => {
    const body = await request.json().catch(() => null)
    // Read current membership after parsing, immediately before the synchronous write.
    const context = scope(request, params.circleId)
    if (context.failure) return context.failure
    const parsed = medicationInputSchema.safeParse(body)
    if (!parsed.success) return error(400, 'validation_error', parsed.error.issues[0].message)
    const { db, circle } = context
    const { recipientId, assignedCaregiverId } = parsed.data
    if (
      !circle.recipients.some((person) => person.id === recipientId) ||
      (assignedCaregiverId !== null && !circle.members.some((member) => member.user.id === assignedCaregiverId))
    ) {
      return error(404, 'not_found', 'This care profile or caregiver is unavailable.')
    }
    const medication = { ...parsed.data, id: `med_${crypto.randomUUID()}`, version: 1 }
    db.care.medications.push(medication)
    writeDb(db)
    return HttpResponse.json({ medication }, { status: 201 })
  }),
  http.patch(`${path}/:medicationId`, async ({ request, params }) => {
    const body = await request.json().catch(() => null)
    const context = scope(request, params.circleId)
    if (context.failure) return context.failure
    const { db, circle } = context
    const medication = db.care.medications.find(
      (item) => item.id === params.medicationId && circle.recipients.some((person) => person.id === item.recipientId),
    )
    if (!medication) return error(404, 'not_found', 'This medication is unavailable.')
    const parsed = medicationUpdateSchema.safeParse(body)
    if (!parsed.success) return error(400, 'validation_error', parsed.error.issues[0].message)
    const { version, ...details } = parsed.data
    if (
      !circle.recipients.some((person) => person.id === details.recipientId) ||
      (details.assignedCaregiverId !== null &&
        !circle.members.some((member) => member.user.id === details.assignedCaregiverId))
    )
      return error(404, 'not_found', 'This care profile or caregiver is unavailable.')
    // Refuse stale full-form edits instead of overwriting another caregiver's changes.
    if (version !== medication.version)
      return error(
        409,
        'edit_conflict',
        'This medication changed while you were editing. Close and reopen it to review the latest version.',
      )
    Object.assign(medication, details, { version: version + 1 })
    writeDb(db)
    return HttpResponse.json({ medication })
  }),
  http.delete(`${path}/:medicationId`, ({ request, params }) => {
    const context = scope(request, params.circleId)
    if (context.failure) return context.failure
    const { db, circle } = context
    const index = db.care.medications.findIndex(
      (item) => item.id === params.medicationId && circle.recipients.some((person) => person.id === item.recipientId),
    )
    if (index < 0) return error(404, 'not_found', 'This medication is unavailable.')
    const [medication] = db.care.medications.splice(index, 1)
    db.care.medicationOccurrences = db.care.medicationOccurrences.filter((dose) => dose.medicationId !== medication.id)
    writeDb(db)
    return new HttpResponse(null, { status: 204 })
  }),
]
