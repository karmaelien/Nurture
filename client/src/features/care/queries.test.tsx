import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import { seedCareData } from '../../mocks/careData.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { server } from '../../test/setup.ts'
import { sessionKey } from '../auth/session.ts'
import { useAppointments, useExpenses, useMedicationOccurrences, useTasks } from './queries.ts'

const dates = { from: '2026-11-01T00:00:00Z', to: '2026-12-01T00:00:00Z' }
const expenseDates = { fromDate: '2026-11-01', toDate: '2026-12-01' }
let client: QueryClient

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const { token, ...session } = await authApi.login(DEMO_ACCOUNT)
  setToken(token)
  client.setQueryData(sessionKey, session)
  const db = readDb()
  db.care = seedCareData(new Date(2026, 10, 15, 10))
  db.circles.push({ ...db.circles[0], id: 'c_empty', recipients: [] })
  writeDb(db)
})

describe('care API requests', () => {
  it('passes the filters for all four resources to the mock API', async () => {
    const appointments = await careApi.appointments('c_demo', { ...dates, recipientId: 'r_frank' })
    expect(appointments.appointments.map((item) => item.id)).toEqual(['a_therapy'])
    const doses = await careApi.medicationOccurrences('c_demo', { ...dates, status: 'completed' })
    expect(doses.medicationOccurrences.map((item) => item.id)).toEqual(['dose_morning'])
    const tasks = await careApi.tasks('c_demo', {
      status: 'completed',
      completedFrom: dates.from,
      completedBefore: dates.to,
    })
    expect(tasks.tasks.map((item) => item.id)).toEqual(['t_completed'])
    const expenses = await careApi.expenses('c_demo', { ...expenseDates, recipientId: 'r_frank' })
    expect(expenses.expenses.map((item) => item.id)).toEqual(['e_clinic', 'e_utilities'])
    expect((await careApi.tasks('c_demo')).tasks).toHaveLength(4)
  })

  it('encodes IDs and omits undefined optional filters', async () => {
    let observed: URL | undefined
    server.use(
      http.get('/api/circles/:circleId/appointments', ({ request }) => {
        observed = new URL(request.url)
        return HttpResponse.json({ appointments: [] })
      }),
    )
    await careApi.appointments('circle/with space', { ...dates, recipientId: undefined })
    expect(observed?.pathname).toBe('/api/circles/circle%2Fwith%20space/appointments')
    expect(observed?.searchParams.get('from')).toBe(dates.from)
    expect(observed?.searchParams.has('recipientId')).toBe(false)
  })
})

describe('care queries', () => {
  it('keeps section failures independent and supports retry', async () => {
    server.use(
      http.get('/api/circles/:circleId/expenses', () =>
        HttpResponse.json({ error: { code: 'unavailable', message: 'Try again.' } }, { status: 503 }),
      ),
    )
    const { result } = renderHook(
      () => ({
        appointments: useAppointments('c_demo', dates),
        doses: useMedicationOccurrences('c_demo', dates),
        tasks: useTasks('c_demo'),
        expenses: useExpenses('c_demo', expenseDates),
      }),
      { wrapper: Wrapper },
    )
    await waitFor(() =>
      expect(
        result.current.appointments.isSuccess && result.current.doses.isSuccess && result.current.tasks.isSuccess,
      ).toBe(true),
    )
    await waitFor(() => expect(result.current.expenses.isError).toBe(true))
    expect(result.current.expenses.data).toBeUndefined()
    server.resetHandlers()
    await act(async () => {
      await result.current.expenses.refetch()
    })
    await waitFor(() => expect(result.current.expenses.data).toHaveLength(5))
  })

  it('pauses without a circle and separates circles and recipient filters', async () => {
    const { result, rerender } = renderHook(
      ({ circleId, recipientId }: { circleId: string | null; recipientId?: string }) =>
        useAppointments(circleId, { ...dates, recipientId }),
      {
        wrapper: Wrapper,
        initialProps: { circleId: null as string | null, recipientId: undefined as string | undefined },
      },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
    rerender({ circleId: 'c_demo', recipientId: 'r_rose' })
    await waitFor(() => expect(result.current.data).toHaveLength(2))
    rerender({ circleId: 'c_demo', recipientId: 'r_frank' })
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data?.[0].id).toBe('a_therapy'))
    rerender({ circleId: 'c_empty', recipientId: undefined })
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data).toEqual([]))
  })

  it('separates date ranges and signed-in users', async () => {
    const { result, rerender } = renderHook(({ fromDate }) => useExpenses('c_demo', { ...expenseDates, fromDate }), {
      wrapper: Wrapper,
      initialProps: { fromDate: '2026-11-01' },
    })
    await waitFor(() => expect(result.current.data).toHaveLength(5))
    rerender({ fromDate: '2026-11-30' })
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data).toEqual([]))
    const { token, ...session } = await authApi.register({
      name: 'Other user',
      email: 'other@example.test',
      password: 'password123',
    })
    setToken(token)
    act(() => {
      client.setQueryData(sessionKey, session)
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
