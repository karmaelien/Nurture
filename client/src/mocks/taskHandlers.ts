import { http, HttpResponse } from 'msw'
import { taskInputSchema } from '../features/tasks/task-input.ts'
import { readDb, writeDb } from './db.ts'
import { bearerToken, error, unauthorized } from './responses.ts'

export const taskHandlers = [
  http.post('/api/circles/:circleId/tasks', async ({ request, params }) => {
    // Parse before reading storage, so an awaited body cannot leave a stale snapshot.
    const body = await request.json().catch(() => null)
    const db = readDb()
    const token = bearerToken(request)
    const userId = token ? db.sessions[token] : undefined
    if (!userId || !db.users.some((user) => user.id === userId)) return unauthorized()
    const circle = db.circles.find(
      (item) => item.id === params.circleId && item.members.some((member) => member.user.id === userId),
    )
    if (!circle) return error(404, 'not_found', 'This care circle is unavailable.')
    const parsed = taskInputSchema.safeParse(body)
    if (!parsed.success) return error(400, 'validation_error', parsed.error.issues[0].message)
    if (
      !circle.recipients.some((person) => person.id === parsed.data.recipientId) ||
      (parsed.data.assignedCaregiverId !== null &&
        !circle.members.some((member) => member.user.id === parsed.data.assignedCaregiverId))
    )
      return error(404, 'not_found', 'This care profile or caregiver is unavailable.')
    const task = { ...parsed.data, id: `task_${crypto.randomUUID()}`, status: 'pending' as const, completedAt: null }
    db.care.tasks.push(task)
    writeDb(db)
    if (!readDb().care.tasks.some((item) => item.id === task.id))
      return error(
        503,
        'storage_unavailable',
        'This task could not be saved in your browser. Check site storage and try again.',
      )
    return HttpResponse.json({ task }, { status: 201 })
  }),
]
