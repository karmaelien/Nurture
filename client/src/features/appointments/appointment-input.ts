import { z } from 'zod'

export const appointmentInputSchema = z
  .strictObject({
    recipientId: z.string().min(1, 'Choose a care profile.'),
    title: z.string().trim().min(1, 'Enter a title.').max(120),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    location: z.string().trim().max(240).nullable(),
    assignedCaregiverId: z.string().min(1).nullable(),
  })
  .refine(({ startsAt, endsAt }) => Date.parse(endsAt) > Date.parse(startsAt), {
    message: 'End time must be after start time.',
  })
