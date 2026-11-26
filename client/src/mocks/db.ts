import { seedCareData } from './careData.ts'
import { dateInZone, everyDay } from '../features/medications/medication-schedule.ts'
import type { CircleDetail, Member, User } from '../api/types.ts'
import { DB_KEY, MockStorageError } from './storage.ts'
import type { MedicationRevisions } from '../features/medications/medication-occurrences.ts'
import type { TaskSeries } from '../features/tasks/task-recurrence.ts'

// A tiny localStorage-backed stand-in for the real database.
// Passwords are stored in plain text because this only ever runs in the browser as a mock.

type DbUser = User & { password: string }

export type Db = {
  taskSeries?: TaskSeries[]
  deletedTaskOccurrences?: string[]
  changeId?: string
  medicationHistory?: Record<string, { version: number; through: string }>
  medicationRevisions?: MedicationRevisions
  users: DbUser[]
  circles: CircleDetail[]
  care: ReturnType<typeof seedCareData>
  /** token -> user id. A user can have several tokens, one per device. */
  sessions: Record<string, string>
}

// Bump the version whenever the shape changes, so stale browser data is replaced rather than misread.

export const DEMO_ACCOUNT = { email: 'demo@nurture.app', password: 'caregiver123' }

function seed(): Db {
  const users: DbUser[] = [
    { id: 'u_demo', name: 'Maya Alvarez', ...DEMO_ACCOUNT, phone: '(555) 010-2030', timeZone: 'America/New_York' },
    {
      id: 'u_daniel',
      name: 'Daniel Alvarez',
      email: 'daniel@example.test',
      password: 'mock-only-password',
      phone: '(555) 010-4455',
      timeZone: 'America/Chicago',
    },
  ]
  // Daniel's own label, so the demo shows how other members know someone.
  const danielLabels: Member['relationships'] = { r_rose: 'grandparent' }
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
            version: 1,
          },
          {
            id: 'r_frank',
            name: 'Frank Alvarez',
            preferredName: null,
            dateOfBirth: '1939-08-02',
            notes: null,
            relationship: null,
            version: 1,
          },
        ],
        members: users.map((user, index) => ({
          user: toUser(user),
          role: index === 0 ? 'owner' : 'member',
          joinedAt: new Date().toISOString(),
          relationships: index === 0 ? {} : danielLabels,
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
    if (raw) {
      const db = JSON.parse(raw) as Db
      // Upgrade task versions without resetting saved tasks.
      for (const task of db.care.tasks) task.version ??= 1
      // Older demo sessions lack medication definitions; preserve their existing care data.
      db.care.medications ??= seedCareData().medications
      for (const medication of db.care.medications) {
        medication.version ??= 1
        // Upgrade earlier daily-only definitions without resetting saved medications or other care data.
        medication.schedule.daysOfWeek ??= [...everyDay]
        medication.schedule.startsOn ??= dateInZone(new Date(), medication.schedule.timeZone)
        medication.schedule.end ??= { kind: 'never' }
      }
      for (const dose of db.care.medicationOccurrences) {
        dose.version ??= 1
        if (dose.definitionVersion === undefined) {
          dose.definitionVersion = 0
          // Revisit legacy pending history in bounded batches before showing it as current.
          if (dose.status === 'pending' && db.medicationHistory) delete db.medicationHistory[dose.medicationId]
        }
      }
      return db
    }
  } catch {
    // Fall through to a fresh seed.
  }
  const db = seed()
  writeDb(db)
  return db
}

export function writeDb(db: Db, notify = true) {
  if (notify) db.changeId = crypto.randomUUID()
  try {
    const serialized = JSON.stringify(db)
    if (serialized !== localStorage.getItem(DB_KEY)) localStorage.setItem(DB_KEY, serialized)
  } catch {
    throw new MockStorageError(
      'Your changes could not be saved in this browser. Free up browser storage or allow site storage, then try again.',
    )
  }
}

export function toUser({ id, name, email, phone, timeZone }: DbUser): User {
  return { id, name, email, phone, timeZone }
}
