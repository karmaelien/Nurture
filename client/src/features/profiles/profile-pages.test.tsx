import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'

async function logIn() {
  const { token } = await authApi.login(DEMO_ACCOUNT)
  setToken(token)
}

describe('Family page', () => {
  it('lists the people in the circle and its caregivers, reached from the nav', async () => {
    await logIn()
    const user = userEvent.setup()
    const router = renderApp('/app')

    await user.click(await screen.findByRole('link', { name: 'Family' }))
    expect(await screen.findByRole('heading', { name: 'Alvarez family' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/app/circles/c_demo/family')
    expect(screen.getByRole('link', { name: 'Family' })).toHaveAttribute('aria-current', 'page')

    const people = screen.getByRole('list', { name: 'People you care for' })
    expect(within(people).getByRole('link', { name: /Grandma Rose · Rose Alvarez/ })).toHaveAttribute(
      'href',
      '/app/circles/c_demo/people/r_rose',
    )
    expect(within(people).getByRole('link', { name: /Frank Alvarez/ })).toBeInTheDocument()

    const caregivers = await screen.findByRole('list', { name: 'Caregivers' })
    const [you, daniel] = within(caregivers).getAllByRole('link')
    expect(you).toHaveTextContent('Maya AlvarezYouOwner')
    expect(you).toHaveAttribute('href', '/app/profile')
    expect(daniel).toHaveTextContent(/Daniel Alvarez.*Central Time/)
    expect(daniel).toHaveAttribute('href', '/app/circles/c_demo/caregivers/u_daniel')
  })

  it('returns to the Family page after adding someone from it', async () => {
    await logIn()
    const user = userEvent.setup()
    const router = renderApp('/app/circles/c_demo/family')

    await user.click(await screen.findByRole('link', { name: 'Add a person' }))
    expect(await screen.findByRole('link', { name: 'Back to Alvarez family' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Full name'), 'Lucia Alvarez')
    await user.click(screen.getByRole('button', { name: 'Add person' }))

    const people = await screen.findByRole('list', { name: 'People you care for' })
    expect(within(people).getByRole('link', { name: /Lucia Alvarez/ })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/app/circles/c_demo/family')
  })

  it('explains an unknown circle instead of redirecting', async () => {
    await logIn()
    renderApp('/app/circles/c_nope/family')
    expect(await screen.findByRole('heading', { name: 'We couldn’t find that care circle' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to overview' })).toHaveAttribute('href', '/app')
  })
})
