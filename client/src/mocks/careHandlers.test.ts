import { beforeEach, describe, expect, it } from 'vitest'
import { authApi } from '../api/auth.ts'
import { request } from '../api/client.ts'
import { clearToken, setToken } from '../api/token.ts'
import type { Appointment, CareTask, Expense, MedicationOccurrence } from '../api/types.ts'
import { seedCareData } from './careData.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from './db.ts'

const base = '/api/circles/c_demo'
const range = 'from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z'
const endpoints = [
  ['appointments', range, 'appointments'],
  ['medication-occurrences', range, 'medicationOccurrences'],
  ['tasks', '', 'tasks'],
  ['expenses', 'fromDate=2026-11-01&toDate=2026-12-01', 'expenses'],
]

beforeEach(async () => {
  clearToken()
  const { token } = await authApi.login(DEMO_ACCOUNT)
  setToken(token)
  const db = readDb()
  db.care = seedCareData(new Date(2026, 10, 15, 10))
  writeDb(db)
})

describe('mock care resource APIs', () => {
  it('exposes demo membership and keeps newly registered users separate', async () => {
    expect((await authApi.me()).circles[0].id).toBe('c_demo')
    const circle = await request<{ circle: { members: unknown[] } }>(base)
    expect(circle.circle.members).toHaveLength(2)
    const account = await authApi.register({ name: 'New user', email: 'new@example.test', password: 'password123' })
    expect(account.circles).toEqual([])
  })

  it.each(endpoints)('protects %s and filters recipients', async (resource, query, key) => {
    const path = `${base}/${resource}?${query}`
    const data = await request<Record<string, { recipientId: string }[]>>(`${path}&recipientId=r_rose`)
    expect(data[key].length).toBeGreaterThan(0)
    expect(data[key].every((record) => record.recipientId === 'r_rose')).toBe(true)
    await expect(request(`${path}&recipientId=r_unknown`)).rejects.toMatchObject({ status: 404 })
    await expect(request(path.replace('c_demo', 'c_unknown'))).rejects.toMatchObject({ status: 404 })
    const db = readDb()
    db.circles.push({
      id: 'c_empty',
      name: 'Empty circle',
      role: 'owner',
      recipients: [],
      members: db.circles[0].members,
    })
    writeDb(db)
    expect(await request(path.replace('c_demo', 'c_empty'))).toEqual({ [key]: [] })
    const outsider = await authApi.register({ name: 'Outside', email: 'outside@example.test', password: 'password123' })
    setToken(outsider.token)
    await expect(request(`${path}&bad=value`)).rejects.toMatchObject({ status: 404 })
    clearToken()
    await expect(request(path)).rejects.toMatchObject({ status: 401 })
    setToken('invalid')
    await expect(request(path)).rejects.toMatchObject({ status: 401 })
  })

  it('uses inclusive/exclusive UTC bounds and deterministic appointment sorting', async () => {
    const db = readDb()
    const template = db.care.appointments[0]
    db.care.appointments = [
      { ...template, id: 'b', startsAt: '2026-11-01T05:00:00Z' },
      { ...template, id: 'a', startsAt: '2026-11-01T05:00:00.000Z' },
      { ...template, id: 'end', startsAt: '2026-11-02T05:00:00Z' },
      { ...template, id: 'before', startsAt: '2026-11-01T04:59:59Z' },
    ]
    writeDb(db)
    const data = await request<{ appointments: Appointment[] }>(
      `${base}/appointments?from=2026-11-01T05:00:00Z&to=2026-11-02T05:00:00Z`,
    )
    expect(data.appointments.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('filters scheduled doses by status', async () => {
    const data = await request<{ medicationOccurrences: MedicationOccurrence[] }>(
      `${base}/medication-occurrences?${range}&status=completed`,
    )
    expect(data.medicationOccurrences.map((item) => item.id)).toEqual(['dose_morning'])
  })

  it('includes overdue tasks and treats due dates separately from completion dates', async () => {
    const db = readDb()
    db.care.tasks.push({ ...db.care.tasks[0], id: 'undated', dueAt: null })
    db.care.tasks[3].dueAt = '2026-10-01T08:00:00Z'
    writeDb(db)
    const pending = await request<{ tasks: CareTask[] }>(`${base}/tasks?status=pending&dueBefore=2026-12-01T00:00:00Z`)
    expect(pending.tasks.map((task) => task.id)).toEqual(['t_overdue', 't_today', 't_upcoming'])
    const all = await request<{ tasks: CareTask[] }>(`${base}/tasks`)
    expect(all.tasks.at(-1)?.id).toBe('undated')
    const completed = await request<{ tasks: CareTask[] }>(
      `${base}/tasks?completedFrom=2026-11-01T00:00:00Z&completedBefore=2026-12-01T00:00:00Z`,
    )
    expect(completed.tasks.map((task) => task.id)).toEqual(['t_completed'])
  })

  it('returns month expenses newest first with exact integer totals', async () => {
    const data = await request<{ expenses: Expense[] }>(`${base}/expenses?fromDate=2026-11-01&toDate=2026-12-01`)
    expect(data.expenses.map((item) => item.id)).toEqual([
      'e_pharmacy',
      'e_clinic',
      'e_insurance',
      'e_utilities',
      'e_transport',
    ])
    expect(data.expenses.reduce((total, item) => total + item.amountCents, 0)).toBe(27050)
    const empty = await request(`${base}/expenses?fromDate=2026-12-01&toDate=2027-01-01`)
    expect(empty).toEqual({ expenses: [] })
  })

  it.each([
    'appointments',
    `appointments?${range}&unexpected=yes`,
    'appointments?from=2026-11-01T00:00:00Z&to=2026-11-01T00:00:00.000Z',
    'appointments?from=2026-11-02T00:00:00Z&to=2026-11-01T00:00:00Z',
    'appointments?from=2026-02-30T00:00:00Z&to=2026-03-10T00:00:00Z',
    'appointments?from=2026-11-01&to=2026-12-01',
    `medication-occurrences?${range}&status=skipped`,
    `medication-occurrences?${range}&status=pending&status=completed`,
    'tasks?status=pending&completedFrom=2026-11-01T00:00:00Z',
    'tasks?dueBefore=',
    'expenses?fromDate=2026-02-30&toDate=2026-03-10',
    'expenses?fromDate=2026-11-01',
  ])('rejects invalid filters: %s', async (path) => {
    await expect(request(`${base}/${path}`)).rejects.toMatchObject({ status: 400, code: 'validation_error' })
  })
})
