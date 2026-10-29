import { z } from 'zod'

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .pipe(z.email('Enter an email address like name@example.com.'))

export const MIN_PASSWORD_LENGTH = 8

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
})

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use 80 characters or fewer.'),
  email,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(128, 'Use 128 characters or fewer.'),
})

export type LoginValues = z.input<typeof loginSchema>
export type RegisterValues = z.input<typeof registerSchema>
