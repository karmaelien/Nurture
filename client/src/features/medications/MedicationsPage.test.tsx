import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'

async function logIn() {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
}

it('opens from navigation and filters medications by care profile', async () => {
  await logIn()
  const user = userEvent.setup()
  renderApp('/app')
  await user.click(await screen.findByRole('link', { name: 'Medications' }))
  expect(await screen.findByRole('heading', { name: 'Sample medication A' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Sample medication B' })).toBeInTheDocument()
  const list = screen.getByRole('region', { name: 'Medication list' })
  expect(within(list).getByText('Daily at 8:00 AM and 8:00 PM')).toBeInTheDocument()
  expect(await within(list).findByText('Maya Alvarez')).toBeInTheDocument()
  expect(await within(list).findByText('Daniel Alvarez')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Care profile'), 'r_frank')
  expect(screen.queryByRole('heading', { name: 'Sample medication A' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Sample medication B' })).toBeInTheDocument()
})

it('shows an empty list without inventing medications', async () => {
  await logIn()
  server.use(http.get('/api/circles/:circleId/medications', () => HttpResponse.json({ medications: [] })))
  renderApp('/app/medications')
  expect(await screen.findByText('No medications for this family.')).toBeInTheDocument()
})

it('lets the user retry a failed medication request', async () => {
  await logIn()
  server.use(
    http.get('/api/circles/:circleId/medications', () => new HttpResponse(null, { status: 503 }), { once: true }),
  )
  const user = userEvent.setup()
  renderApp('/app/medications')
  await user.click(await screen.findByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { name: 'Sample medication A' })).toBeInTheDocument()
})

it('rejects medication requests without a session or membership', async () => {
  await expect(careApi.medications('c_demo')).rejects.toMatchObject({ status: 401 })
  const { token } = await authApi.register({
    name: 'Another caregiver',
    email: 'another@example.test',
    password: 'password123',
  })
  setToken(token)
  await expect(careApi.medications('c_demo')).rejects.toMatchObject({ status: 404 })
})
