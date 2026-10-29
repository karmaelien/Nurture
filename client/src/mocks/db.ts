import type { User } from '../api/types.ts'

// A tiny localStorage-backed stand-in for the real database.
// Passwords are stored in plain text because this only ever runs in the browser as a mock.

type DbUser = User & { password: string }

export type Db = {
  users: DbUser[]
  /** token -> user id. A user can have several tokens, one per device. */
  sessions: Record<string, string>
}

// Bump the version whenever the shape changes, so stale browser data is replaced rather than misread.
const DB_KEY = 'nurture.mock-db.v2'

export const DEMO_ACCOUNT = { email: 'demo@nurture.app', password: 'caregiver123' }

function seed(): Db {
  return {
    users: [{ id: 'u_demo', name: 'Maya Alvarez', ...DEMO_ACCOUNT }],
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

export function toUser({ id, name, email }: DbUser): User {
  return { id, name, email }
}
