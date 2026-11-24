import { http, HttpResponse } from 'msw'
import { z } from 'zod'
import {
  generateMedicationDoses,
  materializeMedicationHistory,
  reconcileMedicationDoses,
} from '../features/medications/medication-occurrences.ts'
import { isDoseOverdue } from '../features/medications/medication-schedule.ts'
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
  http.get('/api/circles/:circleId/medication-occurrences/overdue', ({ request, params }) => {
    const context = scope(request, params.circleId)
    if (context.failure) return context.failure
    const { db, circle } = context
    const query = new URL(request.url).searchParams
    const parsed = z
      .strictObject({ before: z.iso.datetime(), recipientId: z.string().min(1).optional() })
      .safeParse(Object.fromEntries(query))
    if (!parsed.success || [...query.keys()].some((key) => query.getAll(key).length !== 1))
      return error(400, 'validation_error', 'Provide a valid previous-day cutoff and care profile.')
    if (parsed.data.recipientId && !circle.recipients.some((person) => person.id === parsed.data.recipientId))
      return error(404, 'not_found', 'This care profile is unavailable.')
    const cutoff = Math.min(Date.parse(parsed.data.before), Date.now())
    const belongs = (recipientId: string) => circle.recipients.some((person) => person.id === recipientId)
    const definitions = new Map(
      db.care.medications
        .filter((medication) => belongs(medication.recipientId))
        .map((medication) => [medication.id, medication]),
    )
    db.medicationHistory ??= {}
    for (const medication of definitions.values()) {
      if (parsed.data.recipientId && medication.recipientId !== parsed.data.recipientId) continue
      const generated = materializeMedicationHistory(
        db.care.medicationOccurrences,
        medication,
        new Date(cutoff).toISOString(),
        db.medicationHistory[medication.id],
      )
      db.care.medicationOccurrences = generated.doses
      db.medicationHistory[medication.id] = generated.coverage
    }
    // Recheck stored pending history against current definitions after backfilling missing dates.
    db.care.medicationOccurrences = db.care.medicationOccurrences.filter((dose) => {
      if (!belongs(dose.recipientId) || dose.status !== 'pending' || Date.parse(dose.scheduledAt) >= cutoff) return true
      const medication = definitions.get(dose.medicationId)
      if (!medication) return false
      const expected = generateMedicationDoses(
        medication,
        dose.scheduledAt,
        new Date(Date.parse(dose.scheduledAt) + 1).toISOString(),
      )[0]
      if (!expected) return false
      Object.assign(dose, expected, { id: dose.id })
      return true
    })
    writeDb(db)
    const now = Date.now()
    const medicationOccurrences = db.care.medicationOccurrences
      .filter(
        (dose) =>
          belongs(dose.recipientId) &&
          (!parsed.data.recipientId || dose.recipientId === parsed.data.recipientId) &&
          Date.parse(dose.scheduledAt) < cutoff &&
          isDoseOverdue(dose, now),
      )
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.id.localeCompare(b.id))
    return HttpResponse.json({ medicationOccurrences })
  }),
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
    if (db.medicationHistory) delete db.medicationHistory[medication.id]
    db.care.medicationOccurrences = db.care.medicationOccurrences.filter((dose) => dose.medicationId !== medication.id)
    writeDb(db)
    return new HttpResponse(null, { status: 204 })
  }),
]
