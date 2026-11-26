import { expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb } from '../../mocks/db.ts'
import { isDoseReminderActive } from './medication-schedule.ts'

const range = { from: '2026-12-01T00:00:00Z', to: '2026-12-04T00:00:00Z' }

it('never invents pre-creation missed doses for a new backdated medication, including after edits', async () => {
  vi.setSystemTime(new Date('2026-12-02T12:00:00.500Z'))
  try {
    setToken((await authApi.login(DEMO_ACCOUNT)).token)
    const { medication } = await careApi.createMedication('c_demo', {
      recipientId: 'r_rose',
      name: 'Backdated new course',
      dosage: '1 tablet',
      assignedCaregiverId: null,
      schedule: {
        times: ['08:00', '12:00', '20:00'],
        timeZone: 'UTC',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startsOn: '2000-01-01',
        end: { kind: 'never' },
      },
    })
    const load = async () =>
      (await careApi.medicationOccurrences('c_demo', range)).medicationOccurrences.filter(
        (dose) => dose.medicationId === medication.id,
      )
    expect(readDb().care.medications.find((item) => item.id === medication.id)?.effectiveFrom).toBe(
      '2026-12-02T12:00:00.500Z',
    )
    expect(medication.effectiveFrom).toBeUndefined()
    expect((await load()).map((dose) => dose.scheduledAt)).toEqual([
      '2026-12-02T20:00:00.000Z',
      '2026-12-03T08:00:00.000Z',
      '2026-12-03T12:00:00.000Z',
      '2026-12-03T20:00:00.000Z',
    ])
    let missed = await careApi.overdueMedicationDoses('c_demo', range.to)
    expect(missed.medicationOccurrences.filter((dose) => dose.medicationId === medication.id)).toHaveLength(0)
    expect(missed.historyPending).toBe(false)
    vi.setSystemTime(new Date('2026-12-03T13:00:00Z'))
    missed = await careApi.overdueMedicationDoses('c_demo', range.to)
    expect(missed.medicationOccurrences.filter((dose) => dose.medicationId === medication.id)).toHaveLength(3)
    const { id, ...details } = medication
    await careApi.updateMedication('c_demo', id, { ...details, schedule: { ...details.schedule, times: ['09:00'] } })
    expect((await load()).map((dose) => dose.scheduledAt)).toEqual([
      '2026-12-02T20:00:00.000Z',
      '2026-12-03T08:00:00.000Z',
      '2026-12-03T12:00:00.000Z',
    ])
    missed = await careApi.overdueMedicationDoses('c_demo', range.to)
    expect(missed.medicationOccurrences.filter((dose) => dose.medicationId === medication.id)).toHaveLength(3)
    expect(missed.historyPending).toBe(false)
    const later = (
      await careApi.medicationOccurrences('c_demo', { ...range, to: '2026-12-05T00:00:00Z' })
    ).medicationOccurrences.filter((dose) => dose.medicationId === id)
    expect(later.at(-1)?.scheduledAt).toBe('2026-12-04T09:00:00.000Z')
  } finally {
    vi.useRealTimers()
  }
})

it('does not backfill an already-ended course that was only added after it ended', async () => {
  vi.setSystemTime(new Date('2026-12-03T12:00:00Z'))
  try {
    setToken((await authApi.login(DEMO_ACCOUNT)).token)
    const { medication } = await careApi.createMedication('c_demo', {
      recipientId: 'r_rose',
      name: 'Old completed course',
      dosage: '1 tablet',
      assignedCaregiverId: null,
      schedule: {
        times: ['08:00'],
        timeZone: 'UTC',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startsOn: '2000-01-01',
        end: { kind: 'onDate', date: '2026-12-02' },
      },
    })
    expect(
      (await careApi.medicationOccurrences('c_demo', range)).medicationOccurrences.filter(
        (dose) => dose.medicationId === medication.id,
      ),
    ).toHaveLength(0)
    const missed = await careApi.overdueMedicationDoses('c_demo', range.to)
    expect(missed.medicationOccurrences.filter((dose) => dose.medicationId === medication.id)).toHaveLength(0)
    expect(missed.historyPending).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})
async function setup() {
  vi.setSystemTime(new Date('2026-12-01T00:00:00Z'))
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const { medication } = await careApi.createMedication('c_demo', {
    recipientId: 'r_rose',
    name: 'Original',
    dosage: '1 tablet',
    assignedCaregiverId: null,
    schedule: {
      times: ['08:00', '20:00'],
      timeZone: 'UTC',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startsOn: '2026-12-01',
      end: { kind: 'never' },
      overdueAfterMinutes: 30,
      reminderBeforeMinutes: 15,
    },
  })
  const load = async () =>
    (await careApi.medicationOccurrences('c_demo', range)).medicationOccurrences.filter(
      (dose) => dose.medicationId === medication.id,
    )
  return { medication, load }
}

it('stopping keeps past taken and missed doses, removes future pending doses, and stops reminders', async () => {
  try {
    const { medication, load } = await setup()
    const original = await load()
    await careApi.updateMedicationDose('c_demo', original[0].id, 'completed', original[0].version)
    vi.setSystemTime(new Date('2026-12-02T08:10:00Z'))
    const { medication: stopped } = await careApi.stopMedication('c_demo', medication.id, medication.version)
    expect(stopped).toMatchObject({ stoppedAt: '2026-12-02T08:10:00.000Z', version: medication.version + 1 })
    const rows = await load()
    expect(rows.map((dose) => dose.scheduledAt)).toEqual(original.slice(0, 3).map((dose) => dose.scheduledAt))
    expect(rows.map((dose) => dose.status)).toEqual(['completed', 'pending', 'pending'])
    expect(rows.every((dose) => !isDoseReminderActive(dose, Date.now()))).toBe(true)
    vi.setSystemTime(new Date('2026-12-04T12:00:00Z'))
    const overdue = await careApi.overdueMedicationDoses('c_demo', '2026-12-05T00:00:00Z', 'r_rose')
    expect(overdue.medicationOccurrences.filter((dose) => dose.medicationId === medication.id)).toHaveLength(2)
    await careApi.updateMedicationDose('c_demo', rows[0].id, 'pending', rows[0].version)
    expect((await load())[0].status).toBe('pending')
    const { id, ...body } = medication
    await expect(careApi.updateMedication('c_demo', id, body)).rejects.toMatchObject({ status: 409 })
    await careApi.deleteMedication('c_demo', id, stopped.version)
    expect(await load()).toHaveLength(0)
  } finally {
    vi.useRealTimers()
  }
})

it('stopping before history is viewed still backfills past doses and never generates later ones', async () => {
  try {
    const { medication, load } = await setup()
    vi.setSystemTime(new Date('2026-12-02T12:00:00Z'))
    await careApi.stopMedication('c_demo', medication.id, medication.version)
    vi.setSystemTime(new Date('2026-12-04T12:00:00Z'))
    const overdue = await careApi.overdueMedicationDoses('c_demo', '2026-12-05T00:00:00Z', 'r_rose')
    expect(overdue.medicationOccurrences.filter((dose) => dose.medicationId === medication.id)).toHaveLength(3)
    expect(await load()).toHaveLength(3)
  } finally {
    vi.useRealTimers()
  }
})

it('stopping rejects competing stale requests and keeps future taken history without allowing undo', async () => {
  try {
    const { medication, load } = await setup()
    const future = (await load()).at(-1)!
    const taken = (await careApi.updateMedicationDose('c_demo', future.id, 'completed', future.version))
      .medicationOccurrence
    vi.setSystemTime(new Date('2026-12-02T12:00:00Z'))
    const results = await Promise.allSettled([
      careApi.stopMedication('c_demo', medication.id, medication.version),
      careApi.stopMedication('c_demo', medication.id, medication.version),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
    expect((await load()).find((dose) => dose.id === taken.id)).toMatchObject(taken)
    await expect(careApi.updateMedicationDose('c_demo', taken.id, 'pending', taken.version)).rejects.toMatchObject({
      status: 409,
      code: 'schedule_conflict',
    })
    const stopped = (await careApi.medications('c_demo')).medications.find((item) => item.id === medication.id)!
    expect((await careApi.stopMedication('c_demo', stopped.id, stopped.version)).medication).toEqual(stopped)
  } finally {
    vi.useRealTimers()
  }
})

it('keeps past taken and pending doses unchanged while replacing only future untaken times', async () => {
  try {
    const { medication, load } = await setup()
    const first = (await load())[0]
    await careApi.updateMedicationDose('c_demo', first.id, 'completed', first.version)
    const before = await load()
    const boundary = '2026-12-02T12:00:00Z'
    vi.setSystemTime(new Date(boundary))
    const { id, ...body } = medication
    await careApi.updateMedication('c_demo', id, {
      ...body,
      dosage: '2 tablets',
      schedule: { ...body.schedule, times: ['09:00'] },
    })
    const after = await load()
    expect(after.filter((dose) => Date.parse(dose.scheduledAt) < Date.parse(boundary))).toEqual(
      before.filter((dose) => Date.parse(dose.scheduledAt) < Date.parse(boundary)),
    )
    expect(after.map((dose) => dose.scheduledAt)).toEqual([
      '2026-12-01T08:00:00.000Z',
      '2026-12-01T20:00:00.000Z',
      '2026-12-02T08:00:00.000Z',
      '2026-12-03T09:00:00.000Z',
    ])
    expect(after.at(-1)).toMatchObject({ dosage: '2 tablets', status: 'pending' })
    // Historical undo remains a real saved dose, even though its time was removed for the future.
    await careApi.updateMedicationDose('c_demo', first.id, 'pending', after[0].version)
    expect((await load())[0]).toMatchObject({ id: first.id, status: 'pending', dosage: '1 tablet' })
  } finally {
    vi.useRealTimers()
  }
})

it('backfills never-viewed past dates with the old schedule rather than inventing new missed times', async () => {
  try {
    const { medication, load } = await setup()
    vi.setSystemTime(new Date('2026-12-02T12:00:00Z'))
    const { id, ...body } = medication
    await careApi.updateMedication('c_demo', id, { ...body, schedule: { ...body.schedule, times: ['09:00'] } })
    const overdue = await careApi.overdueMedicationDoses('c_demo', '2026-12-03T00:00:00Z', 'r_rose')
    expect(
      overdue.medicationOccurrences.filter((dose) => dose.medicationId === id).map((dose) => dose.scheduledAt),
    ).toEqual(['2026-12-01T08:00:00.000Z', '2026-12-01T20:00:00.000Z', '2026-12-02T08:00:00.000Z'])
    expect((await load()).some((dose) => dose.scheduledAt === '2026-12-01T09:00:00.000Z')).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

it('keeps completed backfill coverage on unrelated edits and preserves old dose metadata', async () => {
  try {
    const { medication, load } = await setup()
    vi.setSystemTime(new Date('2026-12-02T12:00:00Z'))
    await careApi.overdueMedicationDoses('c_demo', '2026-12-03T00:00:00Z')
    const coverage = readDb().medicationHistory![medication.id].through
    const before = (await load()).filter((dose) => Date.parse(dose.scheduledAt) < Date.now())
    const { id, ...body } = medication
    const edited = (
      await careApi.updateMedication('c_demo', id, {
        ...body,
        name: 'Renamed',
        dosage: '2 tablets',
        assignedCaregiverId: 'u_daniel',
        schedule: { ...body.schedule, reminderBeforeMinutes: 60, overdueAfterMinutes: 1440 },
      })
    ).medication
    expect(readDb().medicationHistory![id].through).toBe(coverage)
    expect((await load()).filter((dose) => Date.parse(dose.scheduledAt) < Date.now())).toEqual(before)
    const future = (await load()).find((dose) => dose.scheduledAt === '2026-12-02T20:00:00.000Z')!
    expect(future).toMatchObject({ name: 'Renamed', dosage: '2 tablets', reminderBeforeMinutes: 60 })
    const { id: ignored, ...next } = edited
    void ignored
    await careApi.updateMedication('c_demo', id, { ...next, name: 'Renamed again' })
    expect(readDb().medicationHistory![id].through).toBe(coverage)
  } finally {
    vi.useRealTimers()
  }
})

it('keeps the old profile’s past missed doses visible after reassignment', async () => {
  try {
    const { medication } = await setup()
    vi.setSystemTime(new Date('2026-12-02T12:00:00Z'))
    const { id, ...body } = medication
    await careApi.updateMedication('c_demo', id, { ...body, recipientId: 'r_frank' })
    const past = await careApi.overdueMedicationDoses('c_demo', '2026-12-03T00:00:00Z', 'r_rose')
    expect(past.medicationOccurrences.filter((dose) => dose.medicationId === id)).toHaveLength(3)
    const future = (
      await careApi.medicationOccurrences('c_demo', { ...range, recipientId: 'r_frank' })
    ).medicationOccurrences.filter((dose) => dose.medicationId === id)
    expect(future.every((dose) => Date.parse(dose.scheduledAt) >= Date.parse('2026-12-02T12:00:00Z'))).toBe(true)
    expect(future).toHaveLength(3)
  } finally {
    vi.useRealTimers()
  }
})

it('retires obsolete future rows before a later edit can freeze them as missed history', async () => {
  try {
    const { medication, load } = await setup()
    await load() // Materialize tomorrow's old 8 AM / 8 PM times.
    vi.setSystemTime(new Date('2026-12-01T12:00:00Z'))
    const { id, ...body } = medication
    const updated = (
      await careApi.updateMedication('c_demo', id, { ...body, schedule: { ...body.schedule, times: ['09:00'] } })
    ).medication
    vi.setSystemTime(new Date('2026-12-03T12:00:00Z'))
    const { id: ignored, ...next } = updated
    void ignored
    await careApi.updateMedication('c_demo', id, { ...next, name: 'Later rename' })
    const rows = await load()
    expect(rows.some((dose) => dose.scheduledAt === '2026-12-02T08:00:00.000Z')).toBe(false)
    expect(rows.some((dose) => dose.scheduledAt === '2026-12-02T20:00:00.000Z')).toBe(false)
    expect(rows.some((dose) => dose.scheduledAt === '2026-12-02T09:00:00.000Z')).toBe(true)
  } finally {
    vi.useRealTimers()
  }
})
