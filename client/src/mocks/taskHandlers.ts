import { HttpResponse } from 'msw'
import { http } from './http.ts'
import { taskInputSchema, taskStatusSchema, taskUpdateSchema } from '../features/tasks/task-input.ts'
import { readDb, writeDb } from './db.ts'
import { bearerToken, error, unauthorized } from './responses.ts'
import type { CareTask } from '../api/types.ts'
import { firstTaskOccurrence, withTaskSeries, type TaskSeries } from '../features/tasks/task-recurrence.ts'
import { dateInZone } from '../features/medications/medication-schedule.ts'

export const taskHandlers = [
  http.post('/api/circles/:circleId/task-series/:seriesId/stop', async ({ request, params }) => {
    const body = await request.json().catch(() => null)
    const db = readDb()
    const token = bearerToken(request)
    const userId = token ? db.sessions[token] : undefined
    if (!userId || !db.users.some((user) => user.id === userId)) return unauthorized()
    const circle = db.circles.find(
      (item) => item.id === params.circleId && item.members.some((member) => member.user.id === userId),
    )
    const series = db.taskSeries?.find((item) => item.id === params.seriesId && item.circleId === circle?.id)
    if (!circle || !series) return error(404, 'not_found', 'This repeating task is unavailable.')
    const parsed = taskStatusSchema.pick({ version: true }).safeParse(body)
    if (!parsed.success) return error(400, 'validation_error', 'Provide the current repeating-task version.')
    if (series.version !== parsed.data.version)
      return error(409, 'edit_conflict', 'This repeating task changed. Close and reopen the editor to review it.')
    if (!series.stoppedAt) {
      series.stoppedAt = new Date().toISOString()
      series.version++
      const retired = db.care.tasks.filter(
        (task) =>
          task.seriesId === series.id &&
          task.status === 'pending' &&
          task.dueAt &&
          Date.parse(task.dueAt) >= Date.parse(series.stoppedAt!),
      )
      db.deletedTaskOccurrences = [
        ...new Set([...(db.deletedTaskOccurrences ?? []), ...retired.map((task) => task.id)]),
      ]
      db.care.tasks = db.care.tasks.filter(
        (task) =>
          task.seriesId !== series.id ||
          task.status === 'completed' ||
          !task.dueAt ||
          Date.parse(task.dueAt) < Date.parse(series.stoppedAt!),
      )
      writeDb(db)
    }
    return new HttpResponse(null, { status: 204 })
  }),
  http.delete('/api/circles/:circleId/tasks/:taskId', async ({ request, params }) => {
    const body = await request.json().catch(() => null)
    const db = readDb()
    const token = bearerToken(request)
    const userId = token ? db.sessions[token] : undefined
    if (!userId || !db.users.some((user) => user.id === userId)) return unauthorized()
    const circle = db.circles.find(
      (item) => item.id === params.circleId && item.members.some((member) => member.user.id === userId),
    )
    if (!circle) return error(404, 'not_found', 'This care circle is unavailable.')
    const task = db.care.tasks.find(
      (item) => item.id === params.taskId && circle.recipients.some((person) => person.id === item.recipientId),
    )
    if (!task) return error(404, 'not_found', 'This task is unavailable.')
    const parsed = taskStatusSchema.pick({ version: true }).safeParse(body)
    if (!parsed.success) return error(400, 'validation_error', 'Provide the current task version.')
    if (task.version !== parsed.data.version)
      return error(
        409,
        'edit_conflict',
        'This task changed in another tab or by another caregiver. Close and reopen the confirmation to review the latest task before deleting it.',
      )
    if (task.seriesId) (db.deletedTaskOccurrences ??= []).push(task.id)
    db.care.tasks = db.care.tasks.filter((item) => item.id !== task.id)
    writeDb(db)
    if (readDb().care.tasks.some((item) => item.id === task.id))
      return error(503, 'storage_unavailable', 'This task could not be deleted from your browser. Try again.')
    return new HttpResponse(null, { status: 204 })
  }),
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
    const { recurrence, ...details } = parsed.data
    let task: CareTask = {
      ...details,
      id: `task_${crypto.randomUUID()}`,
      version: 1,
      status: 'pending' as const,
      completedAt: null,
    }
    if (recurrence) {
      const instant = new Date(details.dueAt!)
      const clock = new Intl.DateTimeFormat('en-GB', {
        timeZone: recurrence.timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(instant)
      const series: TaskSeries = {
        id: `series_${crypto.randomUUID()}`,
        circleId: circle.id,
        version: 1,
        title: details.title,
        recipientId: details.recipientId,
        assignedCaregiverId: details.assignedCaregiverId,
        recurrence,
        startsOn: dateInZone(instant, recurrence.timeZone),
        time: clock,
        createdAt: new Date().toISOString(),
        stoppedAt: null,
      }
      const first = firstTaskOccurrence(series)
      if (!first)
        return error(
          400,
          'validation_error',
          'This schedule has no remaining occurrences. Choose a later start or end date.',
        )
      ;(db.taskSeries ??= []).push(series)
      task = first
    }
    db.care.tasks.push(task)
    writeDb(db)
    if (!readDb().care.tasks.some((item) => item.id === task.id))
      return error(
        503,
        'storage_unavailable',
        'This task could not be saved in your browser. Check site storage and try again.',
      )
    return HttpResponse.json({ task: withTaskSeries(task, db) }, { status: 201 })
  }),
  http.patch('/api/circles/:circleId/tasks/:taskId', async ({ request, params }) => {
    const body = await request.json().catch(() => null)
    const db = readDb()
    const token = bearerToken(request)
    const userId = token ? db.sessions[token] : undefined
    if (!userId || !db.users.some((user) => user.id === userId)) return unauthorized()
    const circle = db.circles.find(
      (item) => item.id === params.circleId && item.members.some((member) => member.user.id === userId),
    )
    if (!circle) return error(404, 'not_found', 'This care circle is unavailable.')
    const task = db.care.tasks.find(
      (item) => item.id === params.taskId && circle.recipients.some((person) => person.id === item.recipientId),
    )
    if (!task) return error(404, 'not_found', 'This task is unavailable.')
    const parsed = taskStatusSchema.or(taskUpdateSchema).safeParse(body)
    if (!parsed.success)
      return error(
        400,
        'validation_error',
        'Provide valid task details or a status change, and the current task version.',
      )
    if (task.version !== parsed.data.version)
      return error(
        409,
        'edit_conflict',
        'This task changed in another tab or by another caregiver. The list has been refreshed; review its current status.',
      )
    if ('status' in parsed.data) {
      if (task.status === parsed.data.status) return HttpResponse.json({ task: withTaskSeries(task, db) })
      task.status = parsed.data.status
      task.completedAt = task.status === 'completed' ? new Date().toISOString() : null
    } else {
      const { version: _version, ...details } = parsed.data
      if (
        !circle.recipients.some((person) => person.id === details.recipientId) ||
        (details.assignedCaregiverId !== null &&
          !circle.members.some((member) => member.user.id === details.assignedCaregiverId))
      )
        return error(404, 'not_found', 'This care profile or caregiver is unavailable.')
      if (Object.entries(details).every(([key, value]) => task[key as keyof typeof details] === value))
        return HttpResponse.json({ task: withTaskSeries(task, db) })
      // Editing details never changes completion state or the original completion timestamp.
      Object.assign(task, details)
    }
    task.version += 1
    writeDb(db)
    const saved = readDb().care.tasks.find((item) => item.id === task.id)
    if (
      !saved ||
      saved.version !== task.version ||
      saved.status !== task.status ||
      saved.completedAt !== task.completedAt
    )
      return error(
        503,
        'storage_unavailable',
        'This task could not be saved in your browser. Check site storage and try again.',
      )
    return HttpResponse.json({ task: withTaskSeries(task, db) })
  }),
]
