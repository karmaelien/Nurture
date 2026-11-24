import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { request } from '../../api/client.ts'
import { clearToken, setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { sessionKey } from '../auth/session.ts'
import { useExpenses } from '../care/queries.ts'
import { useCreateExpense, useDeleteExpense, useUpdateExpense } from './mutations.ts'

const body = {
  recipientId: 'r_rose',
  description: '  Pharmacy  ',
  category: 'medication' as const,
  amountCents: 1200,
  currency: 'USD' as const,
  incurredOn: '2026-11-10',
}
const filters = { fromDate: '2026-11-01', toDate: '2026-12-01' }
let client: QueryClient
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(async () => {
  const { token, ...session } = await authApi.login(DEMO_ACCOUNT)
  setToken(token)
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  client.setQueryData(sessionKey, session)
  const db = readDb()
  db.care.expenses = []
  writeDb(db)
})

describe('expense mutations', () => {
  it('creates, edits, and deletes while refreshing all active expense filters', async () => {
    const { result } = renderHook(
      () => ({
        all: useExpenses('c_demo', filters),
        medication: useExpenses('c_demo', { ...filters, category: 'medication' }),
        create: useCreateExpense('c_demo'),
        update: useUpdateExpense('c_demo'),
        remove: useDeleteExpense('c_demo'),
      }),
      { wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.all.data).toEqual([]))
    let id = ''
    await act(async () => {
      const response = await result.current.create.mutateAsync(body)
      id = response.expense.id
    })
    await waitFor(() => expect(result.current.all.data?.[0].description).toBe('Pharmacy'))
    expect(result.current.medication.data?.[0].amountCents).toBe(1200)
    await act(async () => {
      await result.current.update.mutateAsync({
        expenseId: id,
        body: { amountCents: 2500, category: 'other', recipientId: 'r_frank' },
      })
    })
    await waitFor(() => expect(result.current.medication.data).toEqual([]))
    expect(result.current.all.data?.[0]).toMatchObject({
      id,
      amountCents: 2500,
      recipientId: 'r_frank',
      description: 'Pharmacy',
    })
    await act(async () => {
      await result.current.remove.mutateAsync(id)
    })
    await waitFor(() => expect(result.current.all.data).toEqual([]))
    expect(readDb().care.expenses).toEqual([])
    await expect(careApi.deleteExpense('c_demo', id)).rejects.toMatchObject({ status: 404 })
  })

  it.each([
    { amountCents: 0 },
    { amountCents: -1 },
    { amountCents: 1.5 },
    { amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { description: ' ' },
    { description: 'x'.repeat(201) },
    { category: 'invalid' },
    { currency: 'EUR' },
    { incurredOn: '2026-02-30' },
    { recipientId: '' },
    { description: null },
    { id: 'client-id' },
  ])('rejects invalid creation and updates without changing data: %j', async (invalid) => {
    await expect(
      request('/api/circles/c_demo/expenses', { method: 'POST', body: { ...body, ...invalid } }),
    ).rejects.toMatchObject({ status: 400 })
    expect(readDb().care.expenses).toHaveLength(0)
    const { expense } = await careApi.createExpense('c_demo', body)
    await expect(
      request(`/api/circles/c_demo/expenses/${expense.id}`, { method: 'PATCH', body: invalid }),
    ).rejects.toMatchObject({ status: 400 })
    expect(readDb().care.expenses).toEqual([expense])
  })

  it('rejects empty updates and invalid category filters', async () => {
    const { expense } = await careApi.createExpense('c_demo', body)
    await expect(careApi.updateExpense('c_demo', expense.id, {})).rejects.toMatchObject({ status: 400 })
    await expect(
      request('/api/circles/c_demo/expenses?fromDate=2026-11-01&toDate=2026-12-01&category=bad'),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('isolates circles and recipients and requires authentication for every mutation', async () => {
    const { expense } = await careApi.createExpense('c_demo', body)
    const db = readDb()
    db.circles.push({
      ...db.circles[0],
      id: 'c_other',
      recipients: [
        {
          id: 'r_other',
          name: 'Other recipient',
          preferredName: null,
          dateOfBirth: null,
          notes: null,
          relationship: null,
        },
      ],
    })
    writeDb(db)
    await expect(careApi.createExpense('c_demo', { ...body, recipientId: 'r_other' })).rejects.toMatchObject({
      status: 404,
    })
    await expect(careApi.updateExpense('c_demo', expense.id, { recipientId: 'r_other' })).rejects.toMatchObject({
      status: 404,
    })
    await expect(careApi.updateExpense('c_other', expense.id, {})).rejects.toMatchObject({ status: 404 })
    await expect(careApi.deleteExpense('c_other', expense.id)).rejects.toMatchObject({ status: 404 })
    const outsider = await authApi.register({ name: 'Outside', email: 'outside@example.test', password: 'password123' })
    for (const token of [outsider.token, null]) {
      if (token) setToken(token)
      else clearToken()
      const status = token ? 404 : 401
      await expect(careApi.createExpense('c_demo', body)).rejects.toMatchObject({ status })
      await expect(careApi.updateExpense('c_demo', expense.id, {})).rejects.toMatchObject({ status })
      await expect(careApi.deleteExpense('c_demo', expense.id)).rejects.toMatchObject({ status })
    }
    expect(readDb().care.expenses).toEqual([expense])
  })

  it('allows an ordinary member to manage expenses and preserves concurrent creates', async () => {
    const db = readDb()
    db.circles[0].members[0].role = 'member'
    writeDb(db)
    const results = await Promise.all([careApi.createExpense('c_demo', body), careApi.createExpense('c_demo', body)])
    expect(new Set(results.map((result) => result.expense.id)).size).toBe(2)
    expect(readDb().care.expenses).toHaveLength(2)
    await careApi.updateExpense('c_demo', results[0].expense.id, { amountCents: 500 })
    await careApi.deleteExpense('c_demo', results[1].expense.id)
    expect(readDb().care.expenses[0].amountCents).toBe(500)
  })
})
