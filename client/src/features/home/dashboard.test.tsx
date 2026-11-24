import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'
import { dashboardWindow } from './dashboard.ts'

async function login() {
  const { token } = await authApi.login(DEMO_ACCOUNT)
  setToken(token)
}

describe('dashboard', () => {
  it('shows real mock totals and filters every section by recipient', async () => {
    await login()
    renderApp('/app')
    expect(await screen.findByText('$270.50')).toBeInTheDocument()
    expect(await screen.findByText('Grocery delivery')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Showing'), { target: { value: 'r_frank' } })
    expect(await screen.findByText('$103.00')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Pick up prescription')).not.toBeInTheDocument())
    const medications = screen.getByRole('region', { name: 'Today’s medications' })
    expect(await within(medications).findByText('Sample medication B · 1 tablet')).toBeInTheDocument()
    expect(within(medications).queryByText('Sample medication A · 1 tablet')).not.toBeInTheDocument()
  })

  it('shows an independent expense error and lets the user retry', async () => {
    await login()
    server.use(
      http.get('/api/circles/:circleId/expenses', () =>
        HttpResponse.json({ error: { code: 'unavailable', message: 'Spending is unavailable.' } }, { status: 503 }),
      ),
    )
    renderApp('/app')
    expect(await screen.findByText('Spending is unavailable.')).toBeInTheDocument()
    expect(await screen.findByText('Grocery delivery')).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
    server.resetHandlers()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('$270.50')).toBeInTheDocument()
  })

  it('resets recipient selection when changing circles and displays empty states', async () => {
    await login()
    const db = readDb()
    db.circles.push({ ...db.circles[0], id: 'c_empty', name: 'Second circle', recipients: [] })
    writeDb(db)
    renderApp('/app')
    await screen.findByText('$270.50')
    fireEvent.change(screen.getByLabelText('Showing'), { target: { value: 'r_rose' } })
    fireEvent.change(screen.getByLabelText('Care circle'), { target: { value: 'c_empty' } })
    await waitFor(() => expect(screen.getAllByText('Nothing to show for this period.')).toHaveLength(4))
    expect(screen.getByLabelText('Showing')).toHaveValue('')
    expect(screen.queryByText('Pick up prescription')).not.toBeInTheDocument()
  })

  it('uses calendar midnight boundaries and a month-to-date date range', () => {
    const result = dashboardWindow(new Date(2026, 10, 1, 12))
    expect(result.todayStart).toBe(new Date(2026, 10, 1).toISOString())
    expect(result.tomorrowStart).toBe(new Date(2026, 10, 2).toISOString())
    expect(result.to).toBe(new Date(2026, 10, 8).toISOString())
    expect(result.fromDate).toBe('2026-11-01')
    expect(result.toDate).toBe('2026-11-02')
  })
})
