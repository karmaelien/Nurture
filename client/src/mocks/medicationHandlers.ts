import { http, HttpResponse } from 'msw'
import type { Medication } from '../api/types.ts'
import { readDb } from './db.ts'
import { bearerToken, error, unauthorized } from './responses.ts'

// Read-only examples matching the dashboard's sample medications; no dose status is inferred here.
const medications: Medication[] = [
  {
    id: 'med_rose',
    recipientId: 'r_rose',
    name: 'Sample medication A',
    dosage: '1 tablet',
    schedule: { times: ['08:00', '20:00'], timeZone: 'America/New_York' },
    assignedCaregiverId: 'u_demo',
  },
  {
    id: 'med_frank',
    recipientId: 'r_frank',
    name: 'Sample medication B',
    dosage: '1 tablet',
    schedule: { times: ['12:00'], timeZone: 'America/New_York' },
    assignedCaregiverId: 'u_daniel',
  },
]

export const medicationHandlers = [
  http.get('/api/circles/:circleId/medications', ({ request, params }) => {
    const db = readDb()
    const token = bearerToken(request)
    const userId = token ? db.sessions[token] : undefined
    if (!userId || !db.users.some((user) => user.id === userId)) return unauthorized()
    const circle = db.circles.find(
      (item) => item.id === params.circleId && item.members.some((member) => member.user.id === userId),
    )
    if (!circle) return error(404, 'not_found', 'This care circle is unavailable.')
    return HttpResponse.json({
      medications:
        circle.id === 'c_demo'
          ? medications.filter((medication) => circle.recipients.some((person) => person.id === medication.recipientId))
          : [],
    })
  }),
]
