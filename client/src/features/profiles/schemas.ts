import { z } from 'zod'
import type { Relationship } from '../../api/types.ts'

// Shared by the forms and the mock backend, so both enforce the same rules as docs/api-contract.md.

export const RELATIONSHIPS = [
  'parent',
  'grandparent',
  'spouse',
  'sibling',
  'child',
  'friend',
  'other',
] as const satisfies readonly Relationship[]

export const MAX_NOTES_LENGTH = 500
const MAX_NAME_LENGTH = 80
const tooLong = (max: number) => `Use ${max} characters or fewer.`

/** Trims optional text and stores an empty answer as null. */
const optionalText = (max: number, message = tooLong(max)) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null)

const personName = (emptyMessage: string) =>
  z.string().trim().min(1, emptyMessage).max(MAX_NAME_LENGTH, tooLong(MAX_NAME_LENGTH))

const PHONE_CHARACTERS = /^[\d\s+\-()]+$/

const PHONE_MESSAGE = 'Enter a phone number like (555) 123-4567, or leave it blank.'
const phone = optionalText(20, PHONE_MESSAGE).refine(
  (value) => value === null || (PHONE_CHARACTERS.test(value) && value.replace(/\D/g, '').length >= 7),
  PHONE_MESSAGE,
)

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/** The time zone this device is set to, such as "America/New_York". */
export function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

const timeZone = z.string().refine(isValidTimeZone, 'Choose a time zone from the list.').nullable()

/** Today's date on the user's own calendar, as YYYY-MM-DD. */
export function todayDate(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const EARLIEST_BIRTH_DATE = '1900-01-01'

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  // Date normalizes impossible dates such as February 30, so compare the round trip.
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const dateOfBirth = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null)
  .superRefine((value, context) => {
    if (value === null) return
    if (!isCalendarDate(value)) {
      context.addIssue({ code: 'custom', message: 'Enter a full date of birth, or leave it blank.' })
    } else if (value > todayDate()) {
      context.addIssue({ code: 'custom', message: "Date of birth can't be in the future." })
    } else if (value < EARLIEST_BIRTH_DATE) {
      context.addIssue({ code: 'custom', message: 'Enter a date of birth after 1900.' })
    }
  })

export const profileSchema = z.object({
  name: personName('Enter your name.'),
  phone,
  timeZone,
})

/** PATCH /api/users/me accepts any subset of the profile fields. */
export const profileUpdateSchema = profileSchema.partial()

export const recipientSchema = z.object({
  name: personName('Enter their name.'),
  preferredName: optionalText(MAX_NAME_LENGTH),
  dateOfBirth,
  notes: optionalText(MAX_NOTES_LENGTH, `Keep notes to ${MAX_NOTES_LENGTH} characters or fewer.`),
  relationship: z.enum(RELATIONSHIPS).nullable(),
})

export const createCircleSchema = z.object({
  name: z.string().trim().min(1, 'Name your care circle.').max(MAX_NAME_LENGTH, tooLong(MAX_NAME_LENGTH)),
  recipient: recipientSchema,
})

/** Forms that add one person nest the fields under `recipient`, so RecipientFields works in every form. */
export const addRecipientFormSchema = z.object({ recipient: recipientSchema })

export type ProfileValues = z.input<typeof profileSchema>
export type RecipientValues = z.input<typeof recipientSchema>
export type CreateCircleValues = z.input<typeof createCircleSchema>

export const emptyRecipient: RecipientValues = {
  name: '',
  preferredName: '',
  dateOfBirth: '',
  notes: '',
  relationship: null,
}

/** A starting circle name from the person's name: "Rose Alvarez" becomes "Alvarez family". */
export function suggestCircleName(recipientName: string) {
  const words = recipientName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  return words.length === 1 ? `${words[0]}'s family` : `${words[words.length - 1]} family`
}

/** Whole years since a YYYY-MM-DD birth date. */
export function ageOn(dateOfBirth: string, today = todayDate()) {
  const [birthYear, birthMonthDay] = [Number(dateOfBirth.slice(0, 4)), dateOfBirth.slice(5)]
  const [year, monthDay] = [Number(today.slice(0, 4)), today.slice(5)]
  return year - birthYear - (monthDay < birthMonthDay ? 1 : 0)
}
