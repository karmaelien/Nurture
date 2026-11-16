import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { circlesApi } from '../../api/circles.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'

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

describe('person profile', () => {
  it('shows their details and saves your relationship as soon as you pick it', async () => {
    await logIn()
    const user = userEvent.setup()
    renderApp('/app/circles/c_demo/family')
    await user.click(await screen.findByRole('link', { name: /Grandma Rose/ }))

    expect(await screen.findByRole('heading', { name: 'Grandma Rose', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/Rose Alvarez · \d+ years old/)).toBeInTheDocument()
    const details = screen.getByRole('region', { name: 'Details' })
    expect(within(details).getByText('March 14, 1941')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Notes' })).toHaveTextContent('Hard of hearing')
    expect(await screen.findByText(/Grandma Rose is Daniel’s grandparent/)).toBeInTheDocument()

    expect(screen.getByRole('radio', { name: 'not set' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'grandparent' }))
    expect(screen.getByRole('radio', { name: 'grandparent' })).toBeChecked()
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect((await authApi.me()).circles[0].recipients[0].relationship).toBe('grandparent')

    // The Family page shows the new label straight away.
    await user.click(screen.getByRole('link', { name: 'Alvarez family' }))
    expect(await screen.findByText(/Your grandparent/)).toBeInTheDocument()
  })

  it('puts your previous label back if saving fails', async () => {
    await logIn()
    server.use(
      http.put('/api/circles/:circleId/recipients/:recipientId/relationship', () =>
        HttpResponse.json({ error: { code: 'server_error', message: 'Labels are unavailable.' } }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    renderApp('/app/circles/c_demo/people/r_frank')
    await user.click(await screen.findByRole('radio', { name: 'parent' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Labels are unavailable.')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'not set' })).toBeChecked())
  })

  it('edits their details and returns to the profile', async () => {
    await logIn()
    const user = userEvent.setup()
    const router = renderApp('/app/circles/c_demo/people/r_frank')
    await user.click(await screen.findByRole('link', { name: 'Edit' }))

    expect(await screen.findByRole('heading', { name: 'Edit Frank Alvarez' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /is my/ })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Preferred name (optional)'), 'Grandpa Frank')
    await user.type(screen.getByLabelText('Notes (optional)'), 'Walks every morning.')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('heading', { name: 'Grandpa Frank', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/app/circles/c_demo/people/r_frank')
    expect(screen.getByRole('region', { name: 'Notes' })).toHaveTextContent('Walks every morning.')
    const { circle } = await circlesApi.detail('c_demo')
    expect(circle.recipients[1]).toMatchObject({ preferredName: 'Grandpa Frank', notes: 'Walks every morning.' })
  })

  it('shows field errors on the edit page without saving', async () => {
    await logIn()
    const user = userEvent.setup()
    renderApp('/app/circles/c_demo/people/r_frank/edit')
    await user.clear(await screen.findByLabelText('Full name'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Enter their name.')).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toHaveFocus()
    expect((await circlesApi.detail('c_demo')).circle.recipients[1].name).toBe('Frank Alvarez')
  })

  it('explains an unknown person', async () => {
    await logIn()
    renderApp('/app/circles/c_demo/people/r_nobody')
    expect(await screen.findByRole('heading', { name: 'We couldn’t find that person' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Alvarez family' })).toBeInTheDocument()
  })
})
