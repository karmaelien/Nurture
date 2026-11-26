import { http } from './http.ts'
import { HttpResponse } from 'msw'
import { z } from 'zod'
import { appointmentInputSchema } from '../features/appointments/appointment-input.ts'
import { readDb, writeDb } from './db.ts'
import { bearerToken, error, unauthorized } from './responses.ts'

const collection = '/api/circles/:circleId/appointments'
const item = `${collection}/:appointmentId`
const notFound = () => error(404, 'not_found', 'This care circle or appointment is unavailable.')
const completionSchema = z.strictObject({ status: z.enum(['scheduled', 'completed']) })

function appointmentScope(request: Request, circleId: string | readonly string[] | undefined) {
  const db = readDb()
  const token = bearerToken(request)
  const userId = token ? db.sessions[token] : undefined
  if (!userId || !db.users.some((user) => user.id === userId)) return { failure: unauthorized() }
  const circle = db.circles.find(
    (circle) => circle.id === circleId && circle.members.some((member) => member.user.id === userId),
  )
  if (!circle) return { failure: notFound() }
  const hasRecipient = (id: string) => circle.recipients.some((recipient) => recipient.id === id)
  const hasCaregiver = (id: string | null) => id === null || circle.members.some((member) => member.user.id === id)
  const findAppointment = (id: typeof circleId) =>
    db.care.appointments.findIndex((record) => record.id === id && hasRecipient(record.recipientId))
  return { db, hasRecipient, hasCaregiver, findAppointment }
}

export const appointmentHandlers = [
  http.post(collection, async ({ request, params }) => {
    const body = await request.json().catch(() => null)
    const scope = appointmentScope(request, params.circleId)
    if (scope.failure) return scope.failure
    const parsed = appointmentInputSchema.safeParse(body)
    if (!parsed.success) return error(400, 'validation_error', parsed.error.issues[0].message)
    if (!scope.hasRecipient(parsed.data.recipientId) || !scope.hasCaregiver(parsed.data.assignedCaregiverId))
      return notFound()
    const appointment = { ...parsed.data, id: `a_${crypto.randomUUID()}`, status: 'scheduled' as const }
    scope.db.care.appointments.push(appointment)
    writeDb(scope.db)
    return HttpResponse.json({ appointment }, { status: 201 })
  }),
  http.patch(item, async ({ request, params }) => {
    const body = await request.json().catch(() => null)
    const scope = appointmentScope(request, params.circleId)
    if (scope.failure) return scope.failure
    const index = scope.findAppointment(params.appointmentId)
    if (index < 0) return notFound()
    const completion = completionSchema.safeParse(body)
    const existing = scope.db.care.appointments[index]
    if (completion.success) {
      existing.status = completion.data.status
    } else {
      const parsed = appointmentInputSchema.safeParse(body)
      if (!parsed.success) return error(400, 'validation_error', parsed.error.issues[0].message)
      if (!scope.hasRecipient(parsed.data.recipientId) || !scope.hasCaregiver(parsed.data.assignedCaregiverId))
        return notFound()
      Object.assign(existing, parsed.data)
    }
    writeDb(scope.db)
    return HttpResponse.json({ appointment: existing })
  }),
  http.delete(item, ({ request, params }) => {
    const scope = appointmentScope(request, params.circleId)
    if (scope.failure) return scope.failure
    const index = scope.findAppointment(params.appointmentId)
    if (index < 0) return notFound()
    scope.db.care.appointments.splice(index, 1)
    writeDb(scope.db)
    return new HttpResponse(null, { status: 204 })
  }),
]
