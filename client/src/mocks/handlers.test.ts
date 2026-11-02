import { describe, expect, it } from 'vitest'
import { authApi } from '../api/auth.ts'
import { ApiError } from '../api/client.ts'
import { clearToken, setToken } from '../api/token.ts'
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
    expect(user).toEqual({ id: expect.any(String), name: 'Daniel Alvarez', email: 'daniel@example.com' })
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
