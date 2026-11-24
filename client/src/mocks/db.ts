import { seedCareData } from './careData.ts'
import type { CircleDetail, User } from '../api/types.ts'

// A tiny localStorage-backed stand-in for the real database.
// Passwords are stored in plain text because this only ever runs in the browser as a mock.

type DbUser = User & { password: string }

export type Db = {
  users: DbUser[]
  circles: CircleDetail[]
  care: ReturnType<typeof seedCareData>
  /** token -> user id. A user can have several tokens, one per device. */
  sessions: Record<string, string>
}

// Bump the version whenever the shape changes, so stale browser data is replaced rather than misread.
const DB_KEY = 'nurture.mock-db.v4'

export const DEMO_ACCOUNT = { email: 'demo@nurture.app', password: 'caregiver123' }

function seed(): Db {
  const users: DbUser[] = [
    { id: 'u_demo', name: 'Maya Alvarez', ...DEMO_ACCOUNT, phone: '(555) 010-2030', timeZone: 'America/New_York' },
    {
      id: 'u_daniel',
      name: 'Daniel Alvarez',
      email: 'daniel@example.test',
      password: 'mock-only-password',
      phone: null,
      timeZone: 'America/Chicago',
    },
  ]
  return {
    users,
    circles: [
      {
        id: 'c_demo',
        name: 'Alvarez family',
        role: 'owner',
        recipients: [
          {
            id: 'r_rose',
            name: 'Rose Alvarez',
            preferredName: 'Grandma Rose',
            dateOfBirth: '1941-03-14',
            notes: 'Hard of hearing in her left ear. Best reached in the mornings.',
            relationship: null,
          },
          {
            id: 'r_frank',
            name: 'Frank Alvarez',
            preferredName: null,
            dateOfBirth: '1939-08-02',
            notes: null,
            relationship: null,
          },
        ],
        members: users.map((user, index) => ({
          user: toUser(user),
          role: index === 0 ? 'owner' : 'member',
          joinedAt: new Date().toISOString(),
          relationships: {},
        })),
      },
    ],
    care: seedCareData(),
    sessions: {},
  }
}

export function readDb(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    // Fall through to a fresh seed.
  }
  const db = seed()
  writeDb(db)
  return db
}

export function writeDb(db: Db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    // Mock data simply won't persist.
  }
}

export function toUser({ id, name, email, phone, timeZone }: DbUser): User {
  return { id, name, email, phone, timeZone }
}
