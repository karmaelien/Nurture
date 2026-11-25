import { http } from './http.ts'
import { HttpResponse } from 'msw'
import { z } from 'zod'
import {
  generateEffectiveDoses,
  materializeMedicationHistory,
  reconcileMedicationDoses,
  historyBatchRange,
  synchronizeFutureDoses,
} from '../features/medications/medication-occurrences.ts'
import { isDoseOverdue } from '../features/medications/medication-schedule.ts'
import { medicationInputSchema, medicationUpdateSchema } from '../features/medications/medication-input.ts'
import { readDb, writeDb } from './db.ts'
import { bearerToken, error, unauthorized } from './responses.ts'
import type { Medication } from '../api/types.ts'

// Generation boundaries are server-owned, not editable definition fields.
function publicMedication(medication: Medication) {
  const value = { ...medication }
  delete value.effectiveFrom
  return value
}

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
      .strictObject({
        before: z.iso.datetime(),
        recipientId: z.string().min(1).optional(),
        cursor: z
          .string()
          .max(250)
          .refine((value) => {
            const parts = value.split('|')
            return parts.length === 2 && Number.isFinite(Date.parse(parts[0])) && parts[1].length > 0
          })
          .optional(),
      })
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
    let historyPending = false
    const selected = [...definitions.values()].filter(
      (medication) =>
        !parsed.data.recipientId ||
        medication.recipientId === parsed.data.recipientId ||
        db.medicationRevisions?.[medication.id]?.some(
          (revision) => revision.definition.recipientId === parsed.data.recipientId,
        ),
    )
    const budget = Math.floor(historyBatchRange / Math.max(1, selected.length))
    for (const medication of selected) {
      const generated = materializeMedicationHistory(
        db.care.medicationOccurrences,
        medication,
        new Date(cutoff).toISOString(),
        db.medicationHistory[medication.id],
        budget,
        db.medicationRevisions?.[medication.id],
      )
      db.care.medicationOccurrences = generated.doses
      db.medicationHistory[medication.id] = generated.coverage
      historyPending ||= generated.pending
    }
    // Old pending snapshots are hidden until their definition's bounded reconciliation
    // reaches them. Do not re-generate every saved historical dose on each request.
    writeDb(db, false)
    const now = Date.now()
    const all = db.care.medicationOccurrences
      .filter(
        (dose) =>
          belongs(dose.recipientId) &&
          (!parsed.data.recipientId || dose.recipientId === parsed.data.recipientId) &&
          Date.parse(dose.scheduledAt) < cutoff &&
          (dose.definitionVersion === definitions.get(dose.medicationId)?.version ||
            Date.parse(dose.scheduledAt) <
              Date.parse(
                definitions.get(dose.medicationId)?.stoppedAt ??
                  db.medicationRevisions?.[dose.medicationId]?.at(-1)?.to ??
                  '',
              )) &&
          isDoseOverdue(dose, now),
      )
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.id.localeCompare(b.id))
    const [cursorAt, cursorId] = parsed.data.cursor?.split('|') ?? []
    const page = all
      .filter(
        (dose) =>
          !cursorAt ||
          Date.parse(dose.scheduledAt) > Date.parse(cursorAt) ||
          (Date.parse(dose.scheduledAt) === Date.parse(cursorAt) && dose.id.localeCompare(cursorId) > 0),
      )
      .slice(0, 101)
    const medicationOccurrences = page.slice(0, 100)
    const last = medicationOccurrences.at(-1)
    const nextCursor = page.length > 100 && last ? `${last.scheduledAt}|${last.id}` : null
    return HttpResponse.json({ medicationOccurrences, nextCursor, historyPending, totalOverdueCount: all.length })
  }),
  http.patch('/api/circles/:circleId/medication-occurrences/:occurrenceId', async ({ request, params }) => {
    const body = await request.json().catch(() => null)
    const context = scope(request, params.circleId)
    if (context.failure) return context.failure
    const { db, circle } = context
    const parsed = z
      .strictObject({ status: z.enum(['pending', 'completed']), version: z.number().int().positive() })
      .safeParse(body)
    if (!parsed.success) return error(400, 'validation_error', 'Choose taken or pending.')
    const dose = db.care.medicationOccurrences.find(
      (item) => item.id === params.occurrenceId && circle.recipients.some((person) => person.id === item.recipientId),
    )
    if (!dose) return error(404, 'not_found', 'This dose is unavailable.')
    if (dose.version !== parsed.data.version)
      return error(
        409,
        'edit_conflict',
        'This dose changed in another tab or by another caregiver. The list has been refreshed; review its current status.',
      )
    const medication = db.care.medications.find(
      (item) => item.id === dose.medicationId && circle.recipients.some((person) => person.id === item.recipientId),
    )
    if (!medication) return error(404, 'not_found', 'This medication is unavailable.')
    const end = new Date(Date.parse(dose.scheduledAt) + 1).toISOString()
    const revisions = db.medicationRevisions?.[medication.id] ?? []
    const historical = Date.parse(dose.scheduledAt) < Date.parse(medication.stoppedAt ?? revisions.at(-1)?.to ?? '')
    const expected = generateEffectiveDoses(medication, dose.scheduledAt, end, revisions)[0]
    // Taken history may outlive a removed schedule time. Refuse undo rather than silently deleting it.
    if (
      dose.status === 'completed' &&
      parsed.data.status === 'pending' &&
      !historical &&
      (!expected || expected.recipientId !== dose.recipientId)
    )
      return error(
        409,
        'schedule_conflict',
        'This taken dose is no longer in the current schedule for this care profile and cannot be marked pending. Its taken history has been kept.',
      )
    db.care.medicationOccurrences = reconcileMedicationDoses(
      db.care.medicationOccurrences,
      [medication],
      dose.scheduledAt,
      end,
      db.medicationRevisions,
    )
    const current = db.care.medicationOccurrences.find((item) => item.id === dose.id)
    if (!current) return error(404, 'not_found', 'This dose is no longer in the current schedule. Refresh the list.')
    if (current.version !== parsed.data.version)
      return error(
        409,
        'edit_conflict',
        'This dose changed with its medication schedule. Refresh the list and review it before trying again.',
      )
    if (!historical && current.status === 'completed' && parsed.data.status === 'pending' && expected) {
      Object.assign(current, expected, {
        id: current.id,
        version: current.version,
        status: 'completed',
        takenAt: current.takenAt,
      })
    }
    if (parsed.data.status === 'completed' && current.status !== 'completed') current.takenAt = new Date().toISOString()
    if (parsed.data.status === 'pending') current.takenAt = null
    if (current.status !== parsed.data.status) current.version += 1
    current.status = parsed.data.status
    writeDb(db)
    return HttpResponse.json({ medicationOccurrence: current })
  }),
  http.get(path, ({ request, params }) => {
    const context = scope(request, params.circleId)
    if (context.failure) return context.failure
    const { db, circle } = context
    return HttpResponse.json({
      medications: db.care.medications
        .filter((medication) => circle.recipients.some((person) => person.id === medication.recipientId))
        .map(publicMedication),
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
    const medication = {
      ...parsed.data,
      id: `med_${crypto.randomUUID()}`,
      version: 1,
      effectiveFrom: new Date().toISOString(),
    }
    db.care.medications.push(medication)
    writeDb(db)
    return HttpResponse.json({ medication: publicMedication(medication) }, { status: 201 })
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
    if (medication.stoppedAt)
      return error(
        409,
        'edit_conflict',
        'This medication was stopped. Its history has been kept; add a new medication to start another course.',
      )
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
    db.medicationRevisions ??= {}
    const revisions = (db.medicationRevisions[medication.id] ??= [])
    const effectiveAt = new Date(
      Math.max(Date.now(), Date.parse(revisions.at(-1)?.to ?? medication.effectiveFrom ?? '') || 0),
    ).toISOString()
    revisions.push({
      definition: structuredClone(medication),
      from: revisions.at(-1)?.to ?? medication.effectiveFrom ?? null,
      to: effectiveAt,
    })
    // Coverage remains valid: earlier ranges keep the definition that originally governed them.
    Object.assign(medication, details, { version: version + 1, effectiveFrom: effectiveAt })
    db.care.medicationOccurrences = synchronizeFutureDoses(db.care.medicationOccurrences, medication, effectiveAt)
    writeDb(db)
    return HttpResponse.json({ medication: publicMedication(medication) })
  }),
  http.post(`${path}/:medicationId/stop`, async ({ request, params }) => {
    const body = await request.json().catch(() => null)
    const context = scope(request, params.circleId)
    if (context.failure) return context.failure
    const { db, circle } = context
    const medication = db.care.medications.find(
      (item) => item.id === params.medicationId && circle.recipients.some((person) => person.id === item.recipientId),
    )
    if (!medication) return error(404, 'not_found', 'This medication is unavailable.')
    const parsed = z.strictObject({ version: z.number().int().positive() }).safeParse(body)
    if (!parsed.success) return error(400, 'validation_error', 'Provide the medication version being stopped.')
    if (medication.version !== parsed.data.version)
      return error(409, 'edit_conflict', 'This medication changed. Close and reopen it before stopping it.')
    if (!medication.stoppedAt) {
      medication.stoppedAt = new Date(
        Math.max(
          Date.now(),
          Date.parse(db.medicationRevisions?.[medication.id]?.at(-1)?.to ?? medication.effectiveFrom ?? '') || 0,
        ),
      ).toISOString()
      medication.version += 1
      db.care.medicationOccurrences = synchronizeFutureDoses(
        db.care.medicationOccurrences,
        medication,
        medication.stoppedAt,
      )
      writeDb(db)
    }
    return HttpResponse.json({ medication: publicMedication(medication) })
  }),
  http.delete(`${path}/:medicationId`, async ({ request, params }) => {
    const parsed = z
      .strictObject({ version: z.number().int().positive() })
      .safeParse(await request.json().catch(() => null))
    const context = scope(request, params.circleId)
    if (context.failure) return context.failure
    const { db, circle } = context
    const index = db.care.medications.findIndex(
      (item) => item.id === params.medicationId && circle.recipients.some((person) => person.id === item.recipientId),
    )
    if (index < 0) return error(404, 'not_found', 'This medication is unavailable.')
    if (!parsed.success) return error(400, 'validation_error', 'Provide the medication version being deleted.')
    if (db.care.medications[index].version !== parsed.data.version)
      return error(
        409,
        'edit_conflict',
        'This medication changed while deletion was open. Close and reopen it to review the latest version.',
      )
    const [medication] = db.care.medications.splice(index, 1)
    if (db.medicationHistory) delete db.medicationHistory[medication.id]
    if (db.medicationRevisions) delete db.medicationRevisions[medication.id]
    db.care.medicationOccurrences = db.care.medicationOccurrences.filter((dose) => dose.medicationId !== medication.id)
    writeDb(db)
    return new HttpResponse(null, { status: 204 })
  }),
]
