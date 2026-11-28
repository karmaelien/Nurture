import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it, vi } from 'vitest'
import { assistanceApi } from '../../api/assistance.ts'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import type { AssistanceInput } from '../../api/types.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'
import { parseCost } from './schemas.ts'

beforeEach(async () => {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
})
const input = (overrides: Partial<AssistanceInput> = {}): AssistanceInput => ({
  requestId: crypto.randomUUID(),
  medicationId: 'med_rose',
  reason: 'price_increase',
  previousCostCents: 1000,
  currentCostCents: 2000,
  notes: 'Same refill quantity',
  ...overrides,
})
const path = '/app/medications/assistance'

it('records once on concurrent/retried requests and never changes a medication or expense', async () => {
  const before = readDb()
  const body = input()
  const responses = await Promise.all([assistanceApi.create('c_demo', body), assistanceApi.create('c_demo', body)])
  expect(responses[0].report.id).toBe(responses[1].report.id)
  expect(readDb().assistanceReports).toHaveLength(1)
  expect(readDb().care.medications).toEqual(before.care.medications)
  expect(readDb().care.expenses).toEqual(before.care.expenses)
  await expect(assistanceApi.create('c_demo', { ...body, notes: 'different request' })).rejects.toMatchObject({
    status: 409,
  })
  expect((await assistanceApi.get('c_demo', responses[0].report.id)).report).toMatchObject({
    medicationName: 'Sample medication A',
    recipientId: 'r_rose',
    reportedBy: 'u_demo',
  })
})

it('validates prices and coverage data and rejects forged identity fields', async () => {
  for (const patch of [
    { previousCostCents: null },
    { currentCostCents: 1000 },
    { currentCostCents: -1 },
    { currentCostCents: 1.5 },
    { currentCostCents: 100_000_001 },
    { reason: 'not_covered' },
  ])
    await expect(assistanceApi.create('c_demo', { ...input(), ...patch } as AssistanceInput)).rejects.toMatchObject({
      status: 400,
    })
  await expect(
    assistanceApi.create('c_demo', { ...input(), recipientId: 'r_frank' } as AssistanceInput),
  ).rejects.toMatchObject({ status: 400 })
  expect(parseCost('12.30')).toBe(1230)
  for (const value of ['', '-1', '1.234', '1e3', '1000001']) expect(parseCost(value)).toBeNull()
  expect(
    (
      await assistanceApi.create(
        'c_demo',
        input({ reason: 'not_covered', previousCostCents: null, currentCostCents: null }),
      )
    ).report.reason,
  ).toBe('not_covered')
})

it('isolates reports by family and recipient and denies expired sessions', async () => {
  const { report } = await assistanceApi.create('c_demo', input())
  expect((await assistanceApi.list('c_demo', { status: 'active', recipientId: 'r_frank' })).totalCount).toBe(0)
  await expect(assistanceApi.get('foreign', report.id)).rejects.toMatchObject({ status: 404 })
  await expect(assistanceApi.create('c_demo', input({ medicationId: 'foreign' }))).rejects.toMatchObject({
    status: 404,
  })
  setToken('expired')
  await expect(assistanceApi.list('c_demo', { status: 'all' })).rejects.toMatchObject({ status: 401 })
  await expect(assistanceApi.notification('c_demo', report.id, true, 1)).rejects.toMatchObject({ status: 401 })
})

it('rejects competing notification updates and preserves the reported circumstances when dismissed', async () => {
  const { report } = await assistanceApi.create('c_demo', input())
  const updates = await Promise.allSettled([
    assistanceApi.notification('c_demo', report.id, true, 1),
    assistanceApi.notification('c_demo', report.id, true, 1),
  ])
  expect(updates.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  const failure = updates.find((result) => result.status === 'rejected')
  expect(failure?.status === 'rejected' && failure.reason.status).toBe(409)
  const dismissed = (await assistanceApi.get('c_demo', report.id)).report
  expect(dismissed).toEqual({ ...report, dismissedAt: expect.any(String), version: 2 })
  expect((await assistanceApi.list('c_demo', { status: 'active' })).totalCount).toBe(0)
  expect((await assistanceApi.list('c_demo', { status: 'dismissed' })).totalCount).toBe(1)
  expect((await assistanceApi.notification('c_demo', report.id, false, 2)).report.dismissedAt).toBeNull()
})

it('retains a report snapshot and idempotent retry after medication deletion', async () => {
  const body = input()
  const { report } = await assistanceApi.create('c_demo', body)
  await careApi.deleteMedication('c_demo', 'med_rose', 1)
  expect((await assistanceApi.get('c_demo', report.id)).report).toMatchObject({
    medicationId: null,
    medicationName: 'Sample medication A',
  })
  expect((await assistanceApi.create('c_demo', body)).report.id).toBe(report.id)
})

it('paginates without truncating counts or repeating report IDs', async () => {
  await Promise.all(Array.from({ length: 53 }, () => assistanceApi.create('c_demo', input())))
  const first = await assistanceApi.list('c_demo', { status: 'active' })
  expect(first.reports).toHaveLength(50)
  expect(first.totalCount).toBe(53)
  const next = await assistanceApi.list('c_demo', { status: 'active', cursor: first.nextCursor! })
  expect(next.reports).toHaveLength(3)
  expect(next.nextCursor).toBeNull()
  expect(new Set([...first.reports, ...next.reports].map((report) => report.id)).size).toBe(53)
})

it('removes assistance history and retry metadata when its person is deleted', async () => {
  await assistanceApi.create('c_demo', input())
  const db = readDb()
  db.circles[0].recipients = db.circles[0].recipients.filter((person) => person.id !== 'r_rose')
  writeDb(db)
  expect(readDb().assistanceReports).toHaveLength(0)
  expect(readDb().assistanceRequestKeys).toEqual({})
})

it.each(['/app', '/app/medications'])(
  'reports a price increase from %s, shares notifications, and dismisses without deleting the report',
  async (route) => {
    const user = userEvent.setup()
    const router = renderApp(route)
    const medications = await screen.findByRole('region', { name: 'Medication List' })
    const heading = await within(medications).findByRole('heading', { name: 'Sample medication A' })
    await user.click(within(heading.closest('li')!).getByRole('button', { name: 'Patient Assistance' }))
    let dialog = screen.getByRole('dialog', { name: 'Report medication cost or coverage' })
    expect(within(dialog).getByLabelText('Care profile')).toHaveValue('r_rose')
    expect(within(dialog).getByLabelText('Medication')).toHaveValue('med_rose')
    await user.type(within(dialog).getByLabelText('Previous cost (USD)'), '10.00')
    await user.type(within(dialog).getByLabelText('Current cost (USD)'), '20.00')
    await user.click(within(dialog).getByRole('button', { name: 'Save report' }))
    dialog = await screen.findByRole('dialog', { name: 'Patient Assistance' })
    expect(within(dialog).getByRole('link', { name: 'NeedyMeds' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(dialog).getByRole('link', { name: 'RxAssist' })).toHaveAttribute('target', '_blank')
    expect(within(dialog).getByRole('link', { name: 'Medicare Extra Help' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(await screen.findByRole('button', { name: '1 assistance notification' })).toBeInTheDocument()
    await act(() => router.navigate(route === '/app' ? '/app/medications' : '/app'))
    await user.click(await screen.findByRole('button', { name: '1 assistance notification' }))
    dialog = screen.getByRole('dialog', { name: 'Patient Assistance' })
    expect(within(dialog).getByText('Sample medication A')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss notification' }))
    await waitFor(() => expect(readDb().assistanceReports?.[0].dismissedAt).toEqual(expect.any(String)))
    expect(readDb().assistanceReports?.[0].currentCostCents).toBe(2000)
    cleanup()
    renderApp(path)
    await user.selectOptions(await screen.findByLabelText('Notifications'), 'dismissed')
    expect(await screen.findByRole('heading', { name: 'Sample medication A' })).toBeInTheDocument()
    expect(screen.getByText('Dismissed', { selector: 'span' })).toBeInTheDocument()
  },
)

it('reports missing coverage, preserves filters, and supports click-away before saving', async () => {
  const user = userEvent.setup()
  renderApp(path)
  await user.selectOptions(await screen.findByLabelText('Care profile'), 'r_frank')
  await user.click(screen.getByRole('button', { name: 'Report cost or coverage' }))
  let dialog = screen.getByRole('dialog', { name: 'Report medication cost or coverage' })
  fireEvent.click(dialog, { clientX: -10, clientY: -10 })
  expect(readDb().assistanceReports ?? []).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Report cost or coverage' }))
  dialog = screen.getByRole('dialog', { name: 'Report medication cost or coverage' })
  expect(within(dialog).getByLabelText('Care profile')).toHaveValue('r_frank')
  await user.selectOptions(within(dialog).getByLabelText('Medication'), 'med_frank')
  await user.selectOptions(within(dialog).getByLabelText('What changed?'), 'not_covered')
  expect(within(dialog).queryByLabelText('Previous cost (USD)')).not.toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Save report' }))
  dialog = await screen.findByRole('dialog', { name: 'Patient Assistance' })
  expect(within(dialog).getByRole('link', { name: 'Medicare Extra Help' })).toBeInTheDocument()
  expect(within(dialog).getByText("This report is not an insurer's coverage decision.")).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Close' }))
  expect(screen.getByLabelText('Care profile')).toHaveValue('r_frank')
  expect(readDb().assistanceReports?.[0]).toMatchObject({
    reason: 'not_covered',
    previousCostCents: null,
    currentCostCents: null,
    recipientId: 'r_frank',
  })
})

it('blocks double save and dismissal while pending, keeps a failed draft, and reuses its request ID on retry', async () => {
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const ids: string[] = []
  server.use(
    http.post('/api/circles/:circleId/assistance-reports', async ({ request }) => {
      ids.push(((await request.json()) as AssistanceInput).requestId)
      await waiting
      return HttpResponse.json({ error: { code: 'unavailable', message: 'Report save unavailable.' } }, { status: 503 })
    }),
  )
  const user = userEvent.setup()
  renderApp(path)
  await user.click(await screen.findByRole('button', { name: 'Report cost or coverage' }))
  const dialog = screen.getByRole('dialog', { name: 'Report medication cost or coverage' })
  await user.selectOptions(within(dialog).getByLabelText('Medication'), 'med_rose')
  await user.type(within(dialog).getByLabelText('Previous cost (USD)'), '10')
  await user.type(within(dialog).getByLabelText('Current cost (USD)'), '20')
  try {
    act(() => {
      fireEvent.submit(within(dialog).getByRole('form'))
      fireEvent.submit(within(dialog).getByRole('form'))
    })
    await waitFor(() => expect(ids).toHaveLength(1))
    fireEvent.click(dialog, { clientX: -10, clientY: -10 })
    expect(fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(false)
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
    release()
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Report save unavailable.')
    expect(within(dialog).getByLabelText('Current cost (USD)')).toHaveValue('20')
    server.resetHandlers()
    await user.click(within(dialog).getByRole('button', { name: 'Save report' }))
    await screen.findByRole('dialog', { name: 'Patient Assistance' })
    expect(readDb().assistanceReports?.[0].id).toBe(ids[0])
  } finally {
    release()
  }
})

it('hides saved report details and links after an access failure', async () => {
  const user = userEvent.setup()
  renderApp(path)
  await user.click(await screen.findByRole('button', { name: 'Report cost or coverage' }))
  let dialog = screen.getByRole('dialog', { name: 'Report medication cost or coverage' })
  await user.selectOptions(within(dialog).getByLabelText('Medication'), 'med_rose')
  await user.selectOptions(within(dialog).getByLabelText('What changed?'), 'not_covered')
  await user.click(within(dialog).getByRole('button', { name: 'Save report' }))
  dialog = await screen.findByRole('dialog', { name: 'Patient Assistance' })
  await within(dialog).findByRole('link', { name: 'NeedyMeds' })
  server.use(
    http.get('/api/circles/:circleId/assistance-reports/:reportId', () =>
      HttpResponse.json({ error: { code: 'not_found', message: 'Assistance access unavailable.' } }, { status: 404 }),
    ),
  )
  fireEvent.focus(window)
  await within(dialog).findByText('Assistance access unavailable.')
  expect(within(dialog).queryByText('Sample medication A')).not.toBeInTheDocument()
  expect(within(dialog).queryByRole('link', { name: 'NeedyMeds' })).not.toBeInTheDocument()
})

it('shows a no-resources result while retaining the report', async () => {
  server.use(
    http.get('/api/circles/:circleId/assistance-reports/:reportId', ({ params }) =>
      HttpResponse.json({
        report: readDb().assistanceReports?.find((report) => report.id === params.reportId),
        resources: [],
      }),
    ),
  )
  const user = userEvent.setup()
  renderApp(path)
  await user.click(await screen.findByRole('button', { name: 'Report cost or coverage' }))
  let dialog = screen.getByRole('dialog', { name: 'Report medication cost or coverage' })
  await user.selectOptions(within(dialog).getByLabelText('Medication'), 'med_rose')
  await user.selectOptions(within(dialog).getByLabelText('What changed?'), 'not_covered')
  await user.click(within(dialog).getByRole('button', { name: 'Save report' }))
  dialog = await screen.findByRole('dialog', { name: 'Patient Assistance' })
  expect(
    await within(dialog).findByText(
      'No assistance resources are currently available for this report. The report has been saved.',
    ),
  ).toBeInTheDocument()
  expect(readDb().assistanceReports).toHaveLength(1)
})

it('blocks Close, Escape, and click-away while a saved report notification is being changed', async () => {
  const user = userEvent.setup()
  renderApp(path)
  await user.click(await screen.findByRole('button', { name: 'Report cost or coverage' }))
  let dialog = screen.getByRole('dialog', { name: 'Report medication cost or coverage' })
  await user.selectOptions(within(dialog).getByLabelText('Medication'), 'med_rose')
  await user.selectOptions(within(dialog).getByLabelText('What changed?'), 'not_covered')
  await user.click(within(dialog).getByRole('button', { name: 'Save report' }))
  dialog = await screen.findByRole('dialog', { name: 'Patient Assistance' })
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.patch('/api/circles/:circleId/assistance-reports/:reportId/notification', async () => {
      await waiting
      return HttpResponse.json({ error: { code: 'unavailable', message: 'Dismissal unavailable.' } }, { status: 503 })
    }),
  )
  try {
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss notification' }))
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
    fireEvent.click(dialog, { clientX: -10, clientY: -10 })
    expect(fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(false)
    expect(dialog).toBeInTheDocument()
    release()
    await within(dialog).findByText('Dismissal unavailable.')
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeEnabled()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  } finally {
    release()
  }
})

it('returns a storage failure without falsely recording a report', async () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('full')
  })
  try {
    await expect(assistanceApi.create('c_demo', input())).rejects.toMatchObject({ status: 503 })
  } finally {
    spy.mockRestore()
  }
  expect(readDb().assistanceReports ?? []).toHaveLength(0)
})

it('opens the shared report form from calendar dose details with medication and person prefilled', async () => {
  const user = userEvent.setup()
  renderApp('/app/medications')
  const calendar = await screen.findByRole('region', { name: 'Medication Calendar' })
  const doses = await within(calendar).findAllByRole('button', { name: /Sample medication A for Rose Alvarez/ })
  await user.click(doses[0])
  const details = screen.getByRole('dialog', { name: 'Dose Details' })
  await user.click(within(details).getByRole('button', { name: 'Patient Assistance' }))
  expect(screen.queryByRole('dialog', { name: 'Dose Details' })).not.toBeInTheDocument()
  const form = screen.getByRole('dialog', { name: 'Report medication cost or coverage' })
  expect(within(form).getByLabelText('Care profile')).toHaveValue('r_rose')
  expect(within(form).getByLabelText('Medication')).toHaveValue('med_rose')
  await user.click(within(form).getByRole('button', { name: 'Cancel' }))
  expect(readDb().assistanceReports ?? []).toHaveLength(0)
})

it('clears person/status filters and hides cached report context after a failed list refresh', async () => {
  const { report } = await assistanceApi.create('c_demo', input())
  await assistanceApi.notification('c_demo', report.id, true, 1)
  const user = userEvent.setup()
  renderApp(path)
  await user.selectOptions(await screen.findByLabelText('Care profile'), 'r_frank')
  await user.selectOptions(screen.getByLabelText('Notifications'), 'dismissed')
  await screen.findByText('No assistance notifications for the selected filters.')
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByLabelText('Care profile')).toHaveValue('')
  expect(screen.getByLabelText('Notifications')).toHaveValue('active')
  await user.selectOptions(screen.getByLabelText('Notifications'), 'all')
  await screen.findByRole('heading', { name: 'Sample medication A' })
  server.use(
    http.get('/api/circles/:circleId/assistance-reports', () =>
      HttpResponse.json({ error: { code: 'not_found', message: 'Assistance access unavailable.' } }, { status: 404 }),
    ),
  )
  fireEvent.focus(window)
  await screen.findByText('Assistance access unavailable.')
  expect(screen.queryByRole('heading', { name: 'Sample medication A' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'NeedyMeds' })).not.toBeInTheDocument()
})

it.each([401, 403, 404])(
  'hides report context on a %s dismissal response until access is checked again',
  async (status) => {
    await assistanceApi.create('c_demo', input({ notes: 'Private report note' }))
    const user = userEvent.setup()
    renderApp(path)
    await screen.findByRole('heading', { name: 'Sample medication A' })
    server.use(
      http.patch('/api/circles/:circleId/assistance-reports/:reportId/notification', () =>
        HttpResponse.json({ error: { code: 'access_denied', message: 'Assistance access expired.' } }, { status }),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    await screen.findByText('Assistance access expired.')
    expect(screen.queryByRole('heading', { name: 'Sample medication A' })).not.toBeInTheDocument()
    expect(screen.queryByText('Private report note')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'NeedyMeds' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dismiss notification' })).not.toBeInTheDocument()
    // Even if list revalidation succeeds, this report stays hidden until an explicit access retry.
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'Sample medication A' })
    expect(screen.getByRole('link', { name: 'NeedyMeds' })).toBeInTheDocument()
    expect(readDb().assistanceReports?.[0].dismissedAt).toBeNull()
  },
)
