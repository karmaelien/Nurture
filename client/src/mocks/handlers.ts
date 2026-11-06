import { delay, http, HttpResponse } from 'msw'
import type { z } from 'zod'
import type { AuthResponse, CircleSummary, Recipient, Session } from '../api/types.ts'
import { loginSchema, registerSchema } from '../features/auth/schemas.ts'
import { createCircleSchema, profileUpdateSchema, recipientSchema } from '../features/profiles/schemas.ts'
import { readDb, toUser, writeDb, type Db } from './db.ts'

import { careHandlers } from './careHandlers.ts'
import { bearerToken, error, unauthorized } from './responses.ts'

async function parseBody<T extends z.ZodType>(request: Request, schema: T) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  return parsed.success
    ? { data: parsed.data as z.output<T> }
    : { failure: error(400, 'validation_error', parsed.error.issues[0].message) }
}

/** The signed-in user's id, or undefined when the token is missing, unknown, or for a deleted user. */
function signedInUserId(db: Db, request: Request) {
  const token = bearerToken(request)
  const userId = token ? db.sessions[token] : undefined
  return userId && db.users.some((user) => user.id === userId) ? userId : undefined
}

const circleNotFound = () => error(404, 'not_found', 'This care circle is unavailable.')

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
    const userId = signedInUserId(db, request)
    if (!userId) return unauthorized()
    const circle = toSession(db, userId).circles.find((circle) => circle.id === params.circleId)
    if (!circle) return circleNotFound()
    const members = db.circles
      .find((item) => item.id === circle.id)!
      .members.map((member) => ({
        ...member,
        // Members store a snapshot of the user, so read the current profile.
        user: toUser(db.users.find((user) => user.id === member.user.id)!),
      }))
    return HttpResponse.json({ circle: { ...circle, members } })
  }),

  http.post('/api/circles', async ({ request }) => {
    await delay()
    const db = readDb()
    const userId = signedInUserId(db, request)
    if (!userId) return unauthorized()
    const body = await parseBody(request, createCircleSchema)
    if (body.failure) return body.failure

    const { relationship, ...recipient } = body.data.recipient
    const circleId = `c_${crypto.randomUUID()}`
    const recipientId = `r_${crypto.randomUUID()}`
    const user = db.users.find((user) => user.id === userId)!
    db.circles.push({
      id: circleId,
      name: body.data.name,
      role: 'owner',
      recipients: [{ id: recipientId, ...recipient, relationship: null }],
      members: [
        {
          user: toUser(user),
          role: 'owner',
          joinedAt: new Date().toISOString(),
          relationships: relationship ? { [recipientId]: relationship } : {},
        },
      ],
    })
    writeDb(db)
    const circle: CircleSummary = toSession(db, userId).circles.find((circle) => circle.id === circleId)!
    return HttpResponse.json({ circle }, { status: 201 })
  }),

  http.post('/api/circles/:circleId/recipients', async ({ request, params }) => {
    await delay()
    const db = readDb()
    const userId = signedInUserId(db, request)
    if (!userId) return unauthorized()
    const circle = db.circles.find((circle) => circle.id === params.circleId)
    const member = circle?.members.find((member) => member.user.id === userId)
    if (!circle || !member) return circleNotFound()
    const body = await parseBody(request, recipientSchema)
    if (body.failure) return body.failure

    const { relationship, ...fields } = body.data
    const recipient: Recipient = { id: `r_${crypto.randomUUID()}`, ...fields, relationship: null }
    circle.recipients.push(recipient)
    if (relationship) member.relationships[recipient.id] = relationship
    writeDb(db)
    return HttpResponse.json({ recipient: { ...recipient, relationship } }, { status: 201 })
  }),

  http.patch('/api/users/me', async ({ request }) => {
    await delay()
    const db = readDb()
    const userId = signedInUserId(db, request)
    if (!userId) return unauthorized()
    const body = await parseBody(request, profileUpdateSchema)
    if (body.failure) return body.failure

    const user = db.users.find((user) => user.id === userId)!
    const { name, phone, timeZone } = body.data
    if (name !== undefined) user.name = name
    if (phone !== undefined) user.phone = phone
    if (timeZone !== undefined) user.timeZone = timeZone
    writeDb(db)
    return HttpResponse.json({ user: toUser(user) })
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
    db.users.push({ id, name, email, password, phone: null, timeZone: null })
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
    const db = readDb()
    const userId = signedInUserId(db, request)
    if (!userId) return unauthorized()
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
