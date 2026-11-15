import { describe, expect, it } from 'vitest'
import { authApi } from '../api/auth.ts'
import { circlesApi } from '../api/circles.ts'
import { ApiError } from '../api/client.ts'
import { clearToken, setToken } from '../api/token.ts'
import { usersApi } from '../api/users.ts'
import { DEMO_ACCOUNT } from './db.ts'

const newAccount = { name: 'Daniel Alvarez', email: 'daniel@example.com', password: 'password123' }

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ status, code })
}

describe('mock auth API', () => {
  it('registers a new account', async () => {
    const { token, user } = await authApi.register(newAccount)
    expect(token).toBeTruthy()
    expect(user).toEqual({
      id: expect.any(String),
      name: 'Daniel Alvarez',
      email: 'daniel@example.com',
      phone: null,
      timeZone: null,
    })
  })

  it('rejects a duplicate email', async () => {
    await expectApiError(authApi.register({ ...newAccount, email: DEMO_ACCOUNT.email }), 409, 'email_taken')
  })

  it('rejects an invalid registration', async () => {
    await expectApiError(authApi.register({ ...newAccount, password: 'short' }), 400, 'validation_error')
  })

  it('logs in the demo account', async () => {
    const { user } = await authApi.login(DEMO_ACCOUNT)
    expect(user.name).toBe('Maya Alvarez')
  })

  it('rejects a wrong password', async () => {
    await expectApiError(authApi.login({ ...DEMO_ACCOUNT, password: 'nope' }), 401, 'invalid_credentials')
  })

  it('rejects a request without a valid token', async () => {
    await expectApiError(authApi.me(), 401, 'unauthorized')
    setToken('not-a-real-token')
    await expectApiError(authApi.me(), 401, 'unauthorized')
    clearToken()
  })

  it('ends only the current session on logout', async () => {
    const laptop = await authApi.login(DEMO_ACCOUNT)
    const phone = await authApi.login(DEMO_ACCOUNT)
    setToken(laptop.token)
    await authApi.logout()
    await expectApiError(authApi.me(), 401, 'unauthorized')

    setToken(phone.token)
    expect((await authApi.me()).user.email).toBe(DEMO_ACCOUNT.email)
    clearToken()
  })
})

describe('mock profile and circle API', () => {
  const rose = { name: 'Rose Alvarez', preferredName: 'Grandma Rose', dateOfBirth: '1941-03-14', notes: null }

  async function signUp() {
    const { token } = await authApi.register(newAccount)
    setToken(token)
  }

  it('updates only the fields sent', async () => {
    await signUp()
    const { user } = await usersApi.updateMe({ phone: ' (555) 123-4567 ', timeZone: 'America/Chicago' })
    expect(user).toMatchObject({ name: 'Daniel Alvarez', phone: '(555) 123-4567', timeZone: 'America/Chicago' })
    expect((await usersApi.updateMe({ phone: null })).user).toMatchObject({ phone: null, timeZone: 'America/Chicago' })
    expect((await authApi.me()).user.phone).toBeNull()
  })

  it('rejects an invalid profile and requires auth', async () => {
    await expectApiError(usersApi.updateMe({ name: 'Maya' }), 401, 'unauthorized')
    await signUp()
    await expectApiError(usersApi.updateMe({ timeZone: 'Nowhere/Special' }), 400, 'validation_error')
  })

  it('creates a circle with its first recipient and saves the label as the creator’s own', async () => {
    await signUp()
    const { circle } = await circlesApi.create({
      name: 'Alvarez family',
      recipient: { ...rose, relationship: 'grandparent' },
    })
    expect(circle).toEqual({
      id: expect.any(String),
      name: 'Alvarez family',
      role: 'owner',
      recipients: [{ id: expect.any(String), ...rose, relationship: 'grandparent' }],
    })
    expect((await authApi.me()).circles).toEqual([circle])

    const { recipient } = await circlesApi.addRecipient(circle.id, {
      name: 'Frank Alvarez',
      preferredName: null,
      dateOfBirth: null,
      notes: null,
      relationship: null,
    })
    expect(recipient).toMatchObject({ name: 'Frank Alvarez', relationship: null })
    const detail = (await circlesApi.detail(circle.id)).circle
    expect(detail.recipients.map((item) => item.name)).toEqual(['Rose Alvarez', 'Frank Alvarez'])
    expect(detail.members).toEqual([
      expect.objectContaining({ role: 'owner', relationships: { [circle.recipients[0].id]: 'grandparent' } }),
    ])
  })

  it('hides circles the user is not in', async () => {
    await signUp()
    const person = { ...rose, relationship: null }
    await expectApiError(circlesApi.addRecipient('c_demo', person), 404, 'not_found')
    await expectApiError(circlesApi.create({ name: '', recipient: person }), 400, 'validation_error')
  })

  it('shows members’ current profiles in circle details', async () => {
    const { token } = await authApi.login(DEMO_ACCOUNT)
    setToken(token)
    await usersApi.updateMe({ name: 'Maya A.' })
    const { circle } = await circlesApi.detail('c_demo')
    expect(circle.members.find((member) => member.user.id === 'u_demo')?.user.name).toBe('Maya A.')
  })
})
