import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { CircleSummary } from '../../api/types.ts'
import { CareSelectionProvider } from './CareSelectionProvider.tsx'
import { useCareSelection } from './selection.ts'

const session = vi.hoisted(() => ({ user: { id: 'first-user' } }))
vi.mock('../auth/session.ts', () => ({ useRequiredSession: () => session }))

function Probe({ family, available = true }: { family: string; available?: boolean }) {
  const circle = {
    id: family,
    recipients: available ? [{ id: 'person', name: 'Person' }] : [],
  } as unknown as CircleSummary
  const selection = useCareSelection(circle)
  return (
    <>
      <output aria-label="Selected person">{selection.recipientId || 'Everyone'}</output>
      <button onClick={() => selection.setRecipientId('person')}>Select person</button>
    </>
  )
}

it('isolates family and account selection and ignores a person who is no longer accessible', async () => {
  const user = userEvent.setup()
  const view = (family: string, available = true) => (
    <CareSelectionProvider>
      <Probe family={family} available={available} />
    </CareSelectionProvider>
  )
  const { rerender } = render(view('first-family'))
  await user.click(screen.getByRole('button', { name: 'Select person' }))
  expect(screen.getByLabelText('Selected person')).toHaveTextContent('person')
  rerender(view('second-family'))
  expect(screen.getByLabelText('Selected person')).toHaveTextContent('Everyone')
  rerender(view('first-family'))
  expect(screen.getByLabelText('Selected person')).toHaveTextContent('person')
  session.user.id = 'second-user'
  rerender(view('first-family'))
  expect(screen.getByLabelText('Selected person')).toHaveTextContent('Everyone')
  session.user.id = 'first-user'
  rerender(view('first-family', false))
  expect(screen.getByLabelText('Selected person')).toHaveTextContent('Everyone')
})
