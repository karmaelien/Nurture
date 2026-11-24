import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { request } from '../../api/client.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { http } from '../../mocks/http.ts'
import { DB_KEY } from '../../mocks/storage.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'

async function fixture() {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const { medication } = await careApi.createMedication('c_demo', {
    recipientId: 'r_rose',
    name: 'Concurrent sample',
    dosage: '1 tablet',
    assignedCaregiverId: null,
    schedule: {
      times: ['08:00'],
      timeZone: 'UTC',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startsOn: '2026-11-23',
      end: { kind: 'onDate', date: '2026-11-23' },
    },
  })
  const load = async () =>
    (
      await careApi.medicationOccurrences('c_demo', {
        from: '2026-11-23T00:00:00Z',
        to: '2026-11-24T00:00:00Z',
      })
    ).medicationOccurrences.filter((dose) => dose.medicationId === medication.id)
  return { medication, load }
}

it('rejects a stale dose action even after its status changes away and back', async () => {
  const { load } = await fixture()
  const first = (await load())[0]
  const take = await careApi.updateMedicationDose('c_demo', first.id, 'completed', first.version)
  const stale = take.medicationOccurrence
  const undo = await careApi.updateMedicationDose('c_demo', first.id, 'pending', stale.version)
  const latest = await careApi.updateMedicationDose('c_demo', first.id, 'completed', undo.medicationOccurrence.version)
  await expect(careApi.updateMedicationDose('c_demo', first.id, 'pending', stale.version)).rejects.toMatchObject({
    status: 409,
  })
  expect((await load())[0]).toEqual(latest.medicationOccurrence)
})

it('accepts only one of two simultaneous writes based on the same dose version', async () => {
  const { load } = await fixture()
  const dose = (await load())[0]
  const results = await Promise.allSettled([
    careApi.updateMedicationDose('c_demo', dose.id, 'completed', dose.version),
    careApi.updateMedicationDose('c_demo', dose.id, 'completed', dose.version),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
  const taken = (await load())[0]
  const repeated = await careApi.updateMedicationDose('c_demo', taken.id, 'completed', taken.version)
  expect(repeated.medicationOccurrence).toEqual(taken)
})

it('refuses an old delete confirmation after the definition changes', async () => {
  const { medication } = await fixture()
  const { id, ...body } = medication
  await careApi.updateMedication('c_demo', id, { ...body, dosage: '2 tablets' })
  await expect(careApi.deleteMedication('c_demo', id, medication.version)).rejects.toMatchObject({ status: 409 })
  expect((await careApi.medications('c_demo')).medications.find((item) => item.id === id)?.dosage).toBe('2 tablets')
})

it.each(['time removed', 'care profile changed'])(
  'keeps taken history when undo is attempted after %s',
  async (change) => {
    const { medication, load } = await fixture()
    const dose = (await load())[0]
    const taken = (await careApi.updateMedicationDose('c_demo', dose.id, 'completed', dose.version))
      .medicationOccurrence
    const { id, ...body } = medication
    await careApi.updateMedication(
      'c_demo',
      id,
      change === 'time removed'
        ? { ...body, schedule: { ...body.schedule, times: ['09:00'] } }
        : { ...body, recipientId: 'r_frank' },
    )
    await expect(careApi.updateMedicationDose('c_demo', dose.id, 'pending', taken.version)).rejects.toMatchObject({
      status: 409,
      code: 'schedule_conflict',
    })
    expect((await load()).find((item) => item.id === dose.id)).toEqual(taken)
  },
)

it('serializes read/write operations from other mock endpoints with medication changes', async () => {
  const { medication } = await fixture()
  let release!: () => void
  let started!: () => void
  const began = new Promise<void>((resolve) => {
    started = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post('/api/audit-delayed-save', async () => {
      const db = readDb()
      started()
      await gate
      db.users[0].phone = '555-010-9999'
      writeDb(db)
      return HttpResponse.json({ saved: true })
    }),
  )
  const otherSave = request('/api/audit-delayed-save', { method: 'POST' })
  await began
  const { id, ...body } = medication
  const medicationSave = careApi.updateMedication('c_demo', id, { ...body, dosage: '2 tablets' })
  try {
    await new Promise((resolve) => setTimeout(resolve, 25))
  } finally {
    release()
  }
  await Promise.all([otherSave, medicationSave])
  expect(readDb().users[0].phone).toBe('555-010-9999')
  expect(readDb().care.medications.find((item) => item.id === id)?.dosage).toBe('2 tablets')
})

it('reports storage failures and preserves the last saved dose status', async () => {
  const { load } = await fixture()
  const dose = (await load())[0]
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError')
  })
  try {
    await expect(careApi.updateMedicationDose('c_demo', dose.id, 'completed', dose.version)).rejects.toMatchObject({
      status: 503,
      code: 'storage_unavailable',
    })
    expect(readDb().care.medicationOccurrences.find((item) => item.id === dose.id)?.status).toBe('pending')
  } finally {
    storage.mockRestore()
  }
  await careApi.updateMedicationDose('c_demo', dose.id, 'completed', dose.version)
  expect((await load())[0].status).toBe('completed')
})

it('refreshes another tab’s changes on storage events and on returning to the tab', async () => {
  const { medication } = await fixture()
  renderApp('/app/medications')
  await screen.findByRole('heading', { name: medication.name })
  const oldValue = localStorage.getItem(DB_KEY)
  const { id, ...body } = medication
  const updated = await careApi.updateMedication('c_demo', id, { ...body, name: 'Changed elsewhere' })
  fireEvent(window, new StorageEvent('storage', { key: DB_KEY, oldValue, newValue: localStorage.getItem(DB_KEY) }))
  expect(await screen.findByRole('heading', { name: 'Changed elsewhere' })).toBeInTheDocument()
  const { id: ignored, ...latest } = updated.medication
  void ignored
  await careApi.updateMedication('c_demo', id, { ...latest, name: 'Changed while away' })
  fireEvent.focus(window)
  expect(await screen.findByRole('heading', { name: 'Changed while away' })).toBeInTheDocument()
})

it('shows a failed save in the dose list without displaying a taken state', async () => {
  await fixture()
  renderApp('/app/medications')
  const doses = await screen.findByRole('region', { name: 'Doses' })
  fireEvent.change(within(doses).getByLabelText('Dose date'), { target: { value: '2026-11-23' } })
  const button = await within(doses).findByRole('button', { name: /^Mark taken: Concurrent sample/ })
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError')
  })
  try {
    fireEvent.click(button)
    expect(await within(doses).findByRole('alert')).toHaveTextContent('could not be saved')
    await waitFor(() => expect(button).toBeEnabled())
    expect(within(doses).queryByRole('button', { name: /^Mark pending: Concurrent sample/ })).not.toBeInTheDocument()
  } finally {
    storage.mockRestore()
  }
})

it('does not refresh other tabs for background dose-generation writes', async () => {
  await fixture()
  renderApp('/app/medications')
  await screen.findByRole('heading', { name: 'Concurrent sample' })
  const medications = vi.spyOn(careApi, 'medications')
  try {
    const oldValue = localStorage.getItem(DB_KEY)
    await careApi.overdueMedicationDoses('c_demo', new Date().toISOString())
    const newValue = localStorage.getItem(DB_KEY)
    fireEvent(window, new StorageEvent('storage', { key: DB_KEY, oldValue, newValue }))
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(medications).not.toHaveBeenCalled()
  } finally {
    medications.mockRestore()
  }
})

it('fails safely when an origin-wide browser lock is unavailable', async () => {
  await fixture()
  const locks = navigator.locks
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  try {
    await expect(careApi.medications('c_demo')).rejects.toMatchObject({ status: 503, code: 'storage_unavailable' })
  } finally {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: locks })
  }
})
