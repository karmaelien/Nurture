import { documentHandlers } from './documentHandlers.ts'
import { delay, http, HttpResponse } from 'msw'
import type { z } from 'zod'
import type { AuthResponse, CircleSummary, Recipient, RecipientConflictBody, Session } from '../api/types.ts'
import { loginSchema, registerSchema } from '../features/auth/schemas.ts'
import {
  createCircleSchema,
  profileUpdateSchema,
  recipientSchema,
  recipientUpdateSchema,
  relationshipSchema,
} from '../features/profiles/schemas.ts'
import { readDb, toUser, writeDb, type Db } from './db.ts'

import { expenseHandlers } from './expenseHandlers.ts'
import { appointmentHandlers } from './appointmentHandlers.ts'
import { careHandlers } from './careHandlers.ts'
import { taskHandlers } from './taskHandlers.ts'
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
const recipientNotFound = () => error(404, 'not_found', 'This person is not in the care circle.')

/** The circle, the signed-in member, and one of its recipients, or the error response to send instead. */
function findRecipient(db: Db, request: Request, circleId: unknown, recipientId: unknown) {
  const userId = signedInUserId(db, request)
  if (!userId) return { failure: unauthorized() }
  const circle = db.circles.find((circle) => circle.id === circleId)
  const member = circle?.members.find((member) => member.user.id === userId)
  if (!circle || !member) return { failure: circleNotFound() }
  const recipient = circle.recipients.find((recipient) => recipient.id === recipientId)
  if (!recipient) return { failure: recipientNotFound() }
  return { member, recipient }
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
  ...taskHandlers,
  ...documentHandlers,
  ...careHandlers,
  ...appointmentHandlers,
  ...expenseHandlers,
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
      recipients: [{ id: recipientId, ...recipient, relationship: null, version: 1 }],
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
    const recipient: Recipient = { id: `r_${crypto.randomUUID()}`, ...fields, relationship: null, version: 1 }
    circle.recipients.push(recipient)
    if (relationship) member.relationships[recipient.id] = relationship
    writeDb(db)
    return HttpResponse.json({ recipient: { ...recipient, relationship } }, { status: 201 })
  }),

  http.patch('/api/circles/:circleId/recipients/:recipientId', async ({ request, params }) => {
    await delay()
    const db = readDb()
    const found = findRecipient(db, request, params.circleId, params.recipientId)
    if (found.failure) return found.failure
    const body = await parseBody(request, recipientUpdateSchema)
    if (body.failure) return body.failure

    const { recipient, member } = found
    const current = () => ({ ...recipient, relationship: member.relationships[recipient.id] ?? null })
    const { version, ...changes } = body.data
    // Someone saved since this edit began: change nothing and send back what's saved now.
    if (version !== recipient.version) {
      return HttpResponse.json(
        {
          error: {
            code: 'edit_conflict',
            message: 'Someone in the circle changed these details while you were editing.',
          },
          recipient: current(),
        } satisfies RecipientConflictBody,
        { status: 409 },
      )
    }
    for (const [key, value] of Object.entries(changes) as [keyof typeof changes, string | null][]) {
      if (value !== undefined) Object.assign(recipient, { [key]: value })
    }
    recipient.version += 1
    writeDb(db)
    return HttpResponse.json({ recipient: current() })
  }),

  http.put('/api/circles/:circleId/recipients/:recipientId/relationship', async ({ request, params }) => {
    await delay()
    const db = readDb()
    const found = findRecipient(db, request, params.circleId, params.recipientId)
    if (found.failure) return found.failure
    const body = await parseBody(request, relationshipSchema)
    if (body.failure) return body.failure

    const { recipient, member } = found
    const { relationship } = body.data
    if (relationship) member.relationships[recipient.id] = relationship
    else delete member.relationships[recipient.id]
    writeDb(db)
    return HttpResponse.json({ recipient: { ...recipient, relationship } })
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
