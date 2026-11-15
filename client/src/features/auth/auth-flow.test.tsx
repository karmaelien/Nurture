import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DEMO_ACCOUNT } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'

describe('auth flow', () => {
  it('sends logged-out visitors to login and back after logging in', async () => {
    const user = userEvent.setup()
    const router = renderApp('/')

    await user.type(await screen.findByLabelText('Email'), DEMO_ACCOUNT.email)
    expect(router.state.location.pathname).toBe('/login')
    await user.type(screen.getByLabelText('Password'), DEMO_ACCOUNT.password)
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('heading', { name: 'A little clarity for your day.' })).toBeInTheDocument()
    expect(screen.getByText('Signed in as Maya Alvarez (demo@nurture.app).')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/app')
  })

  it('shows a clear error for a wrong password', async () => {
    const user = userEvent.setup()
    renderApp('/login')

    await user.type(await screen.findByLabelText('Email'), DEMO_ACCOUNT.email)
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("That email and password don't match.")
  })

  it('validates fields before calling the API', async () => {
    const user = userEvent.setup()
    renderApp('/register')

    await user.click(await screen.findByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Enter your name.')).toBeInTheDocument()
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
  })

  it('registers and continues to setup', async () => {
    const user = userEvent.setup()
    const router = renderApp('/register')

    await user.type(await screen.findByLabelText('Your name'), 'Daniel Alvarez')
    await user.type(screen.getByLabelText('Email'), 'daniel@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Tell us about you' })).toBeInTheDocument()
    expect(screen.getByLabelText('Your name')).toHaveValue('Daniel Alvarez')
    expect(router.state.location.pathname).toBe('/setup')
  })

  it('points a duplicate email at the email field', async () => {
    const user = userEvent.setup()
    renderApp('/register')

    await user.type(await screen.findByLabelText('Your name'), 'Maya')
    await user.type(screen.getByLabelText('Email'), DEMO_ACCOUNT.email)
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText(/That email already has an account/)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()
  })
})
