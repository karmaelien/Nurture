import { describe, expect, it } from 'vitest'
import { ageOn, createCircleSchema, profileSchema, recipientSchema, suggestCircleName, todayDate } from './schemas.ts'

const recipient = { name: 'Rose Alvarez', preferredName: '', dateOfBirth: '', notes: '', relationship: null }

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0].message

describe('profile schema', () => {
  it('trims fields and stores a blank phone as null', () => {
    expect(profileSchema.parse({ name: '  Maya ', phone: '  ', timeZone: 'America/New_York' })).toEqual({
      name: 'Maya',
      phone: null,
      timeZone: 'America/New_York',
    })
  })

  it.each(['555-01', 'call me maybe', '+1 555 010 2030 ext 4'])('rejects the phone number %j', (phone) => {
    const result = profileSchema.safeParse({ name: 'Maya', phone, timeZone: null })
    expect(firstMessage(result)).toBe('Enter a phone number like (555) 123-4567, or leave it blank.')
  })

  it('accepts common phone formats', () => {
    for (const phone of ['(555) 123-4567', '+44 20 7946 0958', '555-123-4567']) {
      expect(profileSchema.safeParse({ name: 'Maya', phone, timeZone: null }).success).toBe(true)
    }
  })

  it('rejects an unknown time zone', () => {
    const result = profileSchema.safeParse({ name: 'Maya', phone: null, timeZone: 'Mars/Olympus_Mons' })
    expect(firstMessage(result)).toBe('Choose a time zone from the list.')
  })
})

describe('recipient schema', () => {
  it('stores blank optional fields as null', () => {
    expect(recipientSchema.parse(recipient)).toEqual({
      name: 'Rose Alvarez',
      preferredName: null,
      dateOfBirth: null,
      notes: null,
      relationship: null,
    })
  })

  it('accepts a request that leaves out optional fields', () => {
    expect(recipientSchema.parse({ name: 'Frank', relationship: 'grandparent' })).toMatchObject({
      preferredName: null,
      dateOfBirth: null,
      notes: null,
    })
  })

  it.each([
    ['2999-01-01', "Date of birth can't be in the future."],
    ['1899-12-31', 'Enter a date of birth after 1900.'],
    ['1941-02-30', 'Enter a full date of birth, or leave it blank.'],
  ])('rejects the date of birth %s', (dateOfBirth, message) => {
    expect(firstMessage(recipientSchema.safeParse({ ...recipient, dateOfBirth }))).toBe(message)
  })

  it('accepts today as a date of birth', () => {
    expect(recipientSchema.safeParse({ ...recipient, dateOfBirth: todayDate() }).success).toBe(true)
  })

  it('limits notes to 500 characters', () => {
    expect(recipientSchema.safeParse({ ...recipient, notes: 'a'.repeat(500) }).success).toBe(true)
    expect(firstMessage(recipientSchema.safeParse({ ...recipient, notes: 'a'.repeat(501) }))).toBe(
      'Keep notes to 500 characters or fewer.',
    )
  })

  it('requires a name for the person and for the circle', () => {
    const result = createCircleSchema.safeParse({ name: ' ', recipient: { ...recipient, name: '' } })
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['Name your care circle.', 'Enter their name.'])
  })
})

describe('helpers', () => {
  it.each([
    ['Rose Alvarez', 'Alvarez family'],
    ['  Rose  de la Cruz ', 'Cruz family'],
    ['Rose', "Rose's family"],
    ['', ''],
  ])('suggests a circle name for %j', (name, suggestion) => {
    expect(suggestCircleName(name)).toBe(suggestion)
  })

  it('counts whole years, turning over on the birthday', () => {
    expect(ageOn('1941-03-14', '2026-03-13')).toBe(84)
    expect(ageOn('1941-03-14', '2026-03-14')).toBe(85)
  })
})
