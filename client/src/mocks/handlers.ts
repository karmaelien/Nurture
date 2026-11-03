import { delay, http, HttpResponse } from 'msw'
import type { z } from 'zod'
import type { AuthResponse, Session } from '../api/types.ts'
import { loginSchema, registerSchema } from '../features/auth/schemas.ts'
import { readDb, toUser, writeDb, type Db } from './db.ts'

import { careHandlers } from './careHandlers.ts'
import { bearerToken, error, unauthorized } from './responses.ts'

async function parseBody<T extends z.ZodType>(request: Request, schema: T) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  return parsed.success
    ? { data: parsed.data as z.output<T> }
    : { failure: error(400, 'validation_error', parsed.error.issues[0].message) }
}

function toSession(db: Db, userId: string): Session {
  const user = db.users.find((u) => u.id === userId)!
  const circles = db.circles.flatMap((circle) => {
    const member = circle.members.find((member) => member.user.id === userId)
    if (!member) return []
    return [
      {
        id: circle.id,
        name: circle.name,
        role: member.role,
        recipients: circle.recipients.map((recipient) => ({
          ...recipient,
          relationship: member.relationships[recipient.id] ?? null,
        })),
      },
    ]
  })
  return { user: toUser(user), circles }
}

function startSession(db: Db, userId: string): AuthResponse {
  const token = crypto.randomUUID()
  db.sessions[token] = userId
  writeDb(db)
  return { token, ...toSession(db, userId) }
}

export const handlers = [
  ...careHandlers,
  http.get('/api/circles/:circleId', async ({ request, params }) => {
    await delay()
    const db = readDb()
    const token = bearerToken(request)
    const userId = token ? db.sessions[token] : undefined
    if (!userId || !db.users.some((user) => user.id === userId)) return unauthorized()
    const circle = toSession(db, userId).circles.find((circle) => circle.id === params.circleId)
    if (!circle) return error(404, 'not_found', 'This care circle is unavailable.')
    return HttpResponse.json({
      circle: { ...circle, members: db.circles.find((item) => item.id === circle.id)!.members },
    })
  }),
  http.post('/api/auth/register', async ({ request }) => {
    await delay()
    const body = await parseBody(request, registerSchema)
    if (body.failure) return body.failure

    const { name, email, password } = body.data
    const db = readDb()
    if (db.users.some((u) => u.email === email)) {
      return error(409, 'email_taken', 'That email already has an account. Log in instead, or use a different email.')
    }
    const id = `u_${crypto.randomUUID()}`
    db.users.push({ id, name, email, password })
    return HttpResponse.json(startSession(db, id), { status: 201 })
  }),

  http.post('/api/auth/login', async ({ request }) => {
    await delay()
    const body = await parseBody(request, loginSchema)
    if (body.failure) return body.failure

    const { email, password } = body.data
    const db = readDb()
    const user = db.users.find((u) => u.email === email)
    if (!user || user.password !== password) {
      return error(401, 'invalid_credentials', "That email and password don't match. Check them and try again.")
    }
    return HttpResponse.json(startSession(db, user.id))
  }),

  http.get('/api/auth/me', async ({ request }) => {
    await delay()
    const token = bearerToken(request)
    const db = readDb()
    const userId = token ? db.sessions[token] : undefined
    if (!userId || !db.users.some((u) => u.id === userId)) return unauthorized()
    return HttpResponse.json(toSession(db, userId))
  }),

  http.post('/api/auth/logout', async ({ request }) => {
    await delay()
    const token = bearerToken(request)
    const db = readDb()
    if (token) delete db.sessions[token]
    writeDb(db)
    return new HttpResponse(null, { status: 204 })
  }),
]
