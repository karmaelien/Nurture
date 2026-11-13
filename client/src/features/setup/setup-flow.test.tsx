import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { circlesApi } from '../../api/circles.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'

async function signUp() {
  const { token } = await authApi.register({ name: 'Maya Alvarez', email: 'maya@example.com', password: 'password123' })
  setToken(token)
}

describe('setup flow', () => {
  it('walks a new caregiver from their profile to the dashboard', async () => {
    await signUp()
    const user = userEvent.setup()
    const router = renderApp('/app')

    // Step 1: about you. A new account has no circle, so the dashboard sends them here.
    expect(await screen.findByRole('heading', { name: 'Tell us about you' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/setup')
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('1 · About you')
    await user.type(screen.getByLabelText('Phone (optional)'), '(555) 123-4567')
    await user.selectOptions(screen.getByLabelText('Time zone'), 'America/Chicago')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    // Step 2: the first person, with a circle name suggested from theirs.
    expect(await screen.findByRole('heading', { name: 'Who are you caring for?' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Full name'), 'Rose Alvarez')
    expect(screen.getByLabelText('Name your care circle')).toHaveValue('Alvarez family')
    await user.type(screen.getByLabelText('Preferred name (optional)'), 'Grandma Rose')
    expect(screen.getByRole('group', { name: 'Grandma Rose is my…' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'grandparent' }))
    await user.type(screen.getByLabelText('Date of birth (optional)'), '1941-03-14')
    await user.type(screen.getByLabelText('Notes (optional)'), 'Prefers mornings.')
    expect(screen.getByText('17 / 500')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create care circle' }))

    // Step 3: add a second person, then finish.
    expect(await screen.findByRole('heading', { name: 'Anyone else in Alvarez family?' })).toBeInTheDocument()
    const people = screen.getByRole('list', { name: 'People you care for' })
    expect(within(people).getByText('Grandma Rose')).toBeInTheDocument()
    expect(within(people).getByText(/Your grandparent · \d+ years old/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add another person' }))
    await user.type(screen.getByLabelText('Full name'), 'Frank Alvarez')
    await user.click(screen.getByRole('button', { name: 'Add person' }))
    expect(await within(people).findByText('Frank Alvarez')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Added Frank Alvarez.')
    await user.click(screen.getByRole('link', { name: 'Go to your dashboard' }))

    expect(await screen.findByRole('heading', { name: 'A little clarity for your day.' })).toBeInTheDocument()
    expect(screen.getByText('Alvarez family')).toBeInTheDocument()
    const me = await authApi.me()
    expect(me.user).toMatchObject({ phone: '(555) 123-4567', timeZone: 'America/Chicago' })
    expect(me.circles[0].recipients.map((person) => person.name)).toEqual(['Rose Alvarez', 'Frank Alvarez'])
  })

  it('keeps a circle name the caregiver typed themselves', async () => {
    await signUp()
    const user = userEvent.setup()
    renderApp('/setup/circle')

    const circleName = await screen.findByLabelText('Name your care circle')
    await user.type(circleName, 'Team Rose')
    await user.type(screen.getByLabelText('Full name'), 'Rose Alvarez')
    expect(circleName).toHaveValue('Team Rose')
  })

  it('moves on to step 3 instead of creating a second circle', async () => {
    await signUp()
    const { circle } = await circlesApi.create({
      name: 'Alvarez family',
      recipient: { name: 'Rose Alvarez', preferredName: null, dateOfBirth: null, notes: null, relationship: null },
    })
    const router = renderApp('/setup/circle')

    expect(await screen.findByRole('heading', { name: 'Anyone else in Alvarez family?' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/setup/circles/${circle.id}/people`)
    expect(screen.queryByRole('button', { name: 'Create care circle' })).not.toBeInTheDocument()
    expect((await authApi.me()).circles).toHaveLength(1)
  })

  it('shows field errors and focuses the first one', async () => {
    await signUp()
    const user = userEvent.setup()
    renderApp('/setup/circle')

    await user.type(await screen.findByLabelText('Date of birth (optional)'), '2999-01-01')
    await user.click(screen.getByRole('button', { name: 'Create care circle' }))

    expect(await screen.findByText('Enter their name.')).toBeInTheDocument()
    expect(screen.getByText("Date of birth can't be in the future.")).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toHaveFocus()
    expect(screen.getByText('Name your care circle.')).toBeInTheDocument()

    // The suggested circle name clears its own error.
    await user.type(screen.getByLabelText('Full name'), 'Rose Alvarez')
    expect(await screen.findByLabelText('Name your care circle')).toHaveValue('Alvarez family')
    expect(screen.queryByText('Name your care circle.')).not.toBeInTheDocument()
  })

  it('shows a server error without losing what was typed', async () => {
    await signUp()
    server.use(
      http.patch('/api/users/me', () =>
        HttpResponse.json({ error: { code: 'unavailable', message: 'Profiles are unavailable.' } }, { status: 503 }),
      ),
    )
    const user = userEvent.setup()
    renderApp('/setup')

    await user.type(await screen.findByLabelText('Phone (optional)'), '555 010 2030')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Profiles are unavailable.')
    expect(screen.getByLabelText('Phone (optional)')).toHaveValue('555 010 2030')
  })

  it('lets an existing caregiver add someone from the dashboard', async () => {
    const { token } = await authApi.login(DEMO_ACCOUNT)
    setToken(token)
    const user = userEvent.setup()
    const router = renderApp('/app')

    await user.click(await screen.findByRole('link', { name: 'Add a person' }))
    expect(await screen.findByRole('heading', { name: 'Add someone you care for' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/app/circles/c_demo/people/new')
    await user.type(screen.getByLabelText('Full name'), 'Lucia Alvarez')
    await user.click(screen.getByRole('radio', { name: 'parent' }))
    await user.click(screen.getByRole('button', { name: 'Add person' }))

    expect(await screen.findByRole('heading', { name: 'A little clarity for your day.' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Lucia Alvarez' })).toBeInTheDocument()
  })
})
