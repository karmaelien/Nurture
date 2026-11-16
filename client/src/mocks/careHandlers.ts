import { delay, http, HttpResponse } from 'msw'
import { expenseCategorySchema } from '../features/expenses/schemas.ts'
import { readDb } from './db.ts'
import { bearerToken, error, unauthorized } from './responses.ts'

const notFound = () => error(404, 'not_found', 'This care circle or recipient is unavailable.')
const invalid = () => error(400, 'validation_error', 'Check the date range and filters, then try again.')

const resources = {
  appointments: { required: ['from', 'to'], dates: ['from', 'to'], statuses: false },
  'medication-occurrences': { required: ['from', 'to'], dates: ['from', 'to'], statuses: true },
  tasks: { required: [], dates: ['dueFrom', 'dueBefore', 'completedFrom', 'completedBefore'], statuses: true },
  expenses: { required: ['fromDate', 'toDate'], dates: ['fromDate', 'toDate'], statuses: false },
} as const

function validDate(value: string, dateOnly: boolean) {
  const pattern = dateOnly ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
  if (!pattern.test(value)) return false
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return false
  // Date.parse normalizes invalid calendar dates such as February 30.
  return date.toISOString().slice(0, 10) === value.slice(0, 10)
}

function inRange(value: string | null, from: string | null, to: string | null, dateOnly = false) {
  if (!from && !to) return true
  if (value === null) return false
  const comparable = (date: string) => (dateOnly ? date : Date.parse(date))
  return (!from || comparable(value) >= comparable(from)) && (!to || comparable(value) < comparable(to))
}

function byDate<T extends { id: string }>(key: (record: T) => string | null, descending = false) {
  return (a: T, b: T) => {
    const left = key(a)
    const right = key(b)
    if (left === null && right !== null) return 1
    if (right === null && left !== null) return -1
    const order = left === null || right === null ? 0 : Date.parse(left) - Date.parse(right)
    return (descending ? -order : order) || a.id.localeCompare(b.id)
  }
}

export const careHandlers = Object.entries(resources).map(([resource, config]) =>
  http.get(`/api/circles/:circleId/${resource}`, async ({ request, params }) => {
    await delay()
    const db = readDb()
    const token = bearerToken(request)
    const userId = token ? db.sessions[token] : undefined
    if (!userId || !db.users.some((user) => user.id === userId)) return unauthorized()
    const circle = db.circles.find(
      (circle) => circle.id === params.circleId && circle.members.some((member) => member.user.id === userId),
    )
    if (!circle) return notFound()

    const query = new URL(request.url).searchParams
    const recipientId = query.get('recipientId')
    if (recipientId !== null && !circle.recipients.some((recipient) => recipient.id === recipientId)) return notFound()
    const allowed: string[] = [
      ...config.dates,
      'recipientId',
      ...(config.statuses ? ['status'] : []),
      ...(resource === 'expenses' ? ['category'] : []),
    ]
    if ([...query.keys()].some((key) => !allowed.includes(key) || query.getAll(key).length !== 1)) return invalid()
    if (config.required.some((key) => !query.has(key))) return invalid()
    const category = query.get('category')
    if (category !== null && !expenseCategorySchema.safeParse(category).success) return invalid()
    const dateOnly = resource === 'expenses'
    if (config.dates.some((key) => query.has(key) && !validDate(query.get(key)!, dateOnly))) return invalid()
    for (let i = 0; i < config.dates.length; i += 2) {
      const from = query.get(config.dates[i])
      const to = query.get(config.dates[i + 1])
      if (from && to && Date.parse(from) >= Date.parse(to)) return invalid()
    }
    const status = query.get('status')
    if (status !== null && status !== 'pending' && status !== 'completed') return invalid()
    if (status === 'pending' && (query.has('completedFrom') || query.has('completedBefore'))) return invalid()
    const included = (record: { recipientId: string }) =>
      circle.recipients.some((recipient) => recipient.id === record.recipientId) &&
      (!recipientId || recipientId === record.recipientId)

    if (resource === 'appointments') {
      const appointments = db.care.appointments.filter(
        (record) => included(record) && inRange(record.startsAt, query.get('from'), query.get('to')),
      )
      return HttpResponse.json({ appointments: appointments.sort(byDate((record) => record.startsAt)) })
    }
    if (resource === 'medication-occurrences') {
      const medicationOccurrences = db.care.medicationOccurrences.filter(
        (record) =>
          included(record) &&
          (!status || record.status === status) &&
          inRange(record.scheduledAt, query.get('from'), query.get('to')),
      )
      return HttpResponse.json({
        medicationOccurrences: medicationOccurrences.sort(byDate((record) => record.scheduledAt)),
      })
    }
    if (resource === 'tasks') {
      const tasks = db.care.tasks.filter(
        (record) =>
          included(record) &&
          (!status || record.status === status) &&
          inRange(record.dueAt, query.get('dueFrom'), query.get('dueBefore')) &&
          inRange(record.completedAt, query.get('completedFrom'), query.get('completedBefore')),
      )
      return HttpResponse.json({ tasks: tasks.sort(byDate((record) => record.dueAt)) })
    }
    const expenses = db.care.expenses.filter(
      (record) =>
        included(record) &&
        (!category || record.category === category) &&
        inRange(record.incurredOn, query.get('fromDate'), query.get('toDate'), true),
    )
    return HttpResponse.json({ expenses: expenses.sort(byDate((record) => record.incurredOn, true)) })
  }),
)
