import { describe, expect, it } from 'vitest'
import { loginSchema, registerSchema } from './schemas.ts'

describe('auth schemas', () => {
  it('normalizes email addresses', () => {
    expect(loginSchema.parse({ email: '  Maya@Example.COM ', password: 'x' }).email).toBe('maya@example.com')
  })

  it('explains what a valid email looks like', () => {
    const result = loginSchema.safeParse({ email: 'maya', password: 'x' })
    expect(result.error?.issues[0].message).toBe('Enter an email address like name@example.com.')
  })

  it('requires an 8 character password on registration', () => {
    const result = registerSchema.safeParse({ name: 'Maya', email: 'maya@example.com', password: 'short' })
    expect(result.error?.issues[0].message).toBe('Use at least 8 characters.')
  })
})
