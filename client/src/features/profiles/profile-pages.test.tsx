import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { circlesApi } from '../../api/circles.ts'
import { getToken, setToken } from '../../api/token.ts'
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

  it('sends only the changed details, with the version they are based on', async () => {
    await logIn()
    const bodies: unknown[] = []
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'PATCH') bodies.push(await request.clone().json())
    })
    const user = userEvent.setup()
    const router = renderApp('/app/circles/c_demo/people/r_frank/edit')

    // Saving without changes sends nothing.
    await user.click(await screen.findByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/circles/c_demo/people/r_frank'))
    expect(bodies).toEqual([])

    await router.navigate('/app/circles/c_demo/people/r_frank/edit')
    await user.type(await screen.findByLabelText('Notes (optional)'), 'Walks every morning.')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/circles/c_demo/people/r_frank'))
    // The request observer reads a cloned body asynchronously, independently of navigation.
    await waitFor(() => expect(bodies).toEqual([{ version: 1, notes: 'Walks every morning.' }]))
    server.events.removeAllListeners()
  })

  it('shows what’s saved now when someone else saved first, and saves over it only when asked', async () => {
    await logIn()
    const user = userEvent.setup()
    const router = renderApp('/app/circles/c_demo/people/r_frank/edit')
    await user.type(await screen.findByLabelText('Preferred name (optional)'), 'Grandpa Frank')
    // Another member saves while this page is open.
    await circlesApi.updateRecipient('c_demo', 'r_frank', { version: 1, notes: 'Walks every morning.' })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const notice = await screen.findByText('Someone in the circle changed these details while you were editing.')
    expect(notice.closest('[tabindex="-1"]')).toHaveFocus()
    expect(router.state.location.pathname).toBe('/app/circles/c_demo/people/r_frank/edit')
    expect(screen.getByLabelText('Notes (optional)')).toHaveAccessibleDescription(/Saved now: Walks every morning\./)
    expect(screen.getByLabelText('Preferred name (optional)')).toHaveAccessibleDescription(/Saved now: blank/)
    expect(screen.getByLabelText('Full name')).not.toHaveAccessibleDescription(/Saved now/)
    // Typed text stays, and nothing was saved over the other member's notes.
    expect(screen.getByLabelText('Preferred name (optional)')).toHaveValue('Grandpa Frank')
    expect((await circlesApi.detail('c_demo')).circle.recipients[1]).toMatchObject({
      preferredName: null,
      notes: 'Walks every morning.',
      version: 2,
    })

    await user.click(screen.getByRole('button', { name: 'Save mine anyway' }))
    expect(await screen.findByRole('heading', { name: 'Grandpa Frank', level: 1 })).toBeInTheDocument()
    expect((await circlesApi.detail('c_demo')).circle.recipients[1]).toMatchObject({
      preferredName: 'Grandpa Frank',
      notes: null,
      version: 3,
    })
  })

  it('swaps in what’s saved now when you choose the saved version', async () => {
    await logIn()
    const user = userEvent.setup()
    renderApp('/app/circles/c_demo/people/r_frank/edit')
    await user.type(await screen.findByLabelText('Preferred name (optional)'), 'Grandpa Frank')
    await circlesApi.updateRecipient('c_demo', 'r_frank', { version: 1, notes: 'Walks every morning.' })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await user.click(await screen.findByRole('button', { name: 'Use the saved version' }))
    expect(screen.queryByText(/changed these details while you were editing/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Preferred name (optional)')).toHaveValue('')
    expect(screen.getByLabelText('Notes (optional)')).toHaveValue('Walks every morning.')
    expect(screen.getByLabelText('Notes (optional)')).not.toHaveAccessibleDescription(/Saved now/)
  })

  it('explains an unknown person', async () => {
    await logIn()
    renderApp('/app/circles/c_demo/people/r_nobody')
    expect(await screen.findByRole('heading', { name: 'We couldn’t find that person' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Alvarez family' })).toBeInTheDocument()
  })
})

describe('caregiver profile', () => {
  it('shows how to reach another caregiver and who they care for', async () => {
    await logIn()
    const user = userEvent.setup()
    renderApp('/app/circles/c_demo/family')
    await user.click(await screen.findByRole('link', { name: /Daniel Alvarez/ }))

    expect(await screen.findByRole('heading', { name: 'Daniel Alvarez', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call Daniel' })).toHaveAttribute('href', 'tel:5550104455')
    expect(screen.getByRole('link', { name: 'Email Daniel' })).toHaveAttribute('href', 'mailto:daniel@example.test')
    const contact = screen.getByRole('region', { name: 'Contact' })
    expect(contact).toHaveTextContent('(555) 010-4455')
    expect(contact).toHaveTextContent(/Local time\d{1,2}:\d{2}\s?[AP]M, Central Time/)
    const caresFor = screen.getByRole('region', { name: 'Cares for' })
    expect(caresFor).toHaveTextContent('Grandma RoseDaniel’s grandparent')
    expect(caresFor).toHaveTextContent('Frank AlvarezNo relationship set')
  })

  it('sends you to your own profile instead of a read-only copy', async () => {
    await logIn()
    const router = renderApp('/app/circles/c_demo/caregivers/u_demo')
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/profile'))
  })

  it('explains an unknown caregiver', async () => {
    await logIn()
    renderApp('/app/circles/c_demo/caregivers/u_nobody')
    expect(await screen.findByRole('heading', { name: 'We couldn’t find that caregiver' })).toBeInTheDocument()
  })
})

describe('My profile', () => {
  it('opens from the header and saves your details for the circle to see', async () => {
    await logIn()
    const user = userEvent.setup()
    const router = renderApp('/app')
    await user.click(await screen.findByRole('link', { name: 'Maya, my profile' }))

    expect(await screen.findByRole('heading', { name: 'My profile' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/app/profile')
    expect(screen.getByText('demo@nurture.app')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Phone (optional)'))
    await user.type(screen.getByLabelText('Phone (optional)'), '555 999 1234')
    await user.selectOptions(screen.getByLabelText('Time zone'), 'America/Denver')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    const { circle } = await circlesApi.detail('c_demo')
    expect(circle.members.find((member) => member.user.id === 'u_demo')?.user).toMatchObject({
      phone: '555 999 1234',
      timeZone: 'America/Denver',
    })
    // Editing again clears the confirmation.
    await user.type(screen.getByLabelText('Your name'), ' A.')
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
  })

  it('shows field errors without saving', async () => {
    await logIn()
    const user = userEvent.setup()
    renderApp('/app/profile')
    await user.type(await screen.findByLabelText('Phone (optional)'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/Enter a phone number like/)).toBeInTheDocument()
    expect((await authApi.me()).user.phone).toBe('(555) 010-2030')
  })

  it('links to each of your circles and logs you out', async () => {
    await logIn()
    const user = userEvent.setup()
    renderApp('/app/profile')
    const circles = await screen.findByRole('region', { name: 'Your care circles' })
    expect(within(circles).getByRole('link', { name: /Alvarez family/ })).toHaveAttribute(
      'href',
      '/app/circles/c_demo/family',
    )
    const account = screen.getByRole('region', { name: 'Account' })
    await user.click(within(account).getByRole('button', { name: 'Log out' }))
    // Logging out reloads the page at /login, so check that the session is gone.
    await waitFor(() => expect(getToken()).toBeNull())
  })
})
