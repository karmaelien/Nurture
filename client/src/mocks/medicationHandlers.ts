import { http, HttpResponse } from 'msw'
import { medicationInputSchema } from '../features/medications/medication-input.ts'
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
    const medication = { ...parsed.data, id: `med_${crypto.randomUUID()}` }
    db.care.medications.push(medication)
    writeDb(db)
    return HttpResponse.json({ medication }, { status: 201 })
  }),
]
