import { expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb } from '../../mocks/db.ts'

const range = { from: '2026-12-01T00:00:00Z', to: '2026-12-04T00:00:00Z' }
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
