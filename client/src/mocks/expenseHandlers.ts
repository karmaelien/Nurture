import { delay, http, HttpResponse } from 'msw'
import { createExpenseSchema, updateExpenseSchema } from '../features/expenses/schemas.ts'
import { readDb, writeDb } from './db.ts'
import { bearerToken, error, unauthorized } from './responses.ts'

const notFound = () => error(404, 'not_found', 'This expense, recipient, or circle is unavailable.')

async function mutate(request: Request, circleId: string, expenseId?: string) {
  await delay()
  // Read the body before the database so concurrent requests don't overwrite a stale snapshot.
  const body = request.method === 'DELETE' ? undefined : await request.json().catch(() => null)
  const db = readDb()
  const token = bearerToken(request)
  const userId = token ? db.sessions[token] : undefined
  if (!userId || !db.users.some((user) => user.id === userId)) return unauthorized()
  const circle = db.circles.find(
    (item) => item.id === circleId && item.members.some((member) => member.user.id === userId),
  )
  if (!circle) return notFound()
  const expense = expenseId
    ? db.care.expenses.find(
        (item) => item.id === expenseId && circle.recipients.some((recipient) => recipient.id === item.recipientId),
      )
    : undefined
  if (expenseId && !expense) return notFound()
  if (request.method === 'DELETE') {
    db.care.expenses = db.care.expenses.filter((item) => item.id !== expenseId)
    writeDb(db)
    return new HttpResponse(null, { status: 204 })
  }
  const parsed = (expenseId ? updateExpenseSchema : createExpenseSchema).safeParse(body)
  if (!parsed.success) return error(400, 'validation_error', parsed.error.issues[0].message)
  if (parsed.data.recipientId && !circle.recipients.some((recipient) => recipient.id === parsed.data.recipientId))
    return notFound()
  if (expense) {
    Object.assign(expense, parsed.data)
    writeDb(db)
    return HttpResponse.json({ expense })
  }
  const created = { ...createExpenseSchema.parse(parsed.data), id: `e_${crypto.randomUUID()}` }
  db.care.expenses.push(created)
  writeDb(db)
  return HttpResponse.json({ expense: created }, { status: 201 })
}

export const expenseHandlers = [
  http.post('/api/circles/:circleId/expenses', ({ request, params }) => mutate(request, String(params.circleId))),
  http.patch('/api/circles/:circleId/expenses/:expenseId', ({ request, params }) =>
    mutate(request, String(params.circleId), String(params.expenseId)),
  ),
  http.delete('/api/circles/:circleId/expenses/:expenseId', ({ request, params }) =>
    mutate(request, String(params.circleId), String(params.expenseId)),
  ),
]
