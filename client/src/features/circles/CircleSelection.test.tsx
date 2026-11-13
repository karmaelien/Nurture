import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import type { CircleSummary } from '../../api/types.ts'
import { CircleSelection } from './CircleSelection.tsx'
import { circleLink, useCircleSelection } from './selection.ts'

const circles: CircleSummary[] = [
  { id: 'first', name: 'First family', role: 'member', recipients: [] },
  { id: 'second', name: 'Second family', role: 'member', recipients: [] },
]
function Page({ items = circles }: { items?: CircleSummary[] }) {
  const { circle, selectCircle } = useCircleSelection(items)
  return (
    <>
      <CircleSelection circles={items} circle={circle} onChange={selectCircle} />
      <Link to={circleLink('/app/expenses', circle?.id)}>Expenses</Link>
      <Link to={circleLink('/app', circle?.id)}>Overview</Link>
      {circle && <p>Selected: {circle.name}</p>}
    </>
  )
}
it('preserves the selected circle when navigating between dashboard and expenses', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Page />
    </MemoryRouter>,
  )
  await user.selectOptions(screen.getByLabelText('Care circle'), 'second')
  expect(screen.getByRole('link', { name: 'Expenses' })).toHaveAttribute('href', '/app/expenses?circleId=second')
  await user.click(screen.getByText('Expenses'))
  expect(screen.getByLabelText('Care circle')).toHaveValue('second')
  await user.click(screen.getByText('Overview'))
  expect(screen.getByLabelText('Care circle')).toHaveValue('second')
})
it('shows a disabled dropdown for a single circle', () => {
  render(
    <MemoryRouter>
      <Page items={circles.slice(0, 1)} />
    </MemoryRouter>,
  )
  expect(screen.getByLabelText('Care circle')).toBeDisabled()
  expect(screen.getByLabelText('Care circle')).toHaveValue('first')
})
it('does not silently replace an invalid circle and allows explicit recovery', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/expenses?circleId=missing']}>
      <Page items={circles.slice(0, 1)} />
    </MemoryRouter>,
  )
  expect(screen.queryByText('Selected: First family')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Care circle')).toBeEnabled()
  await user.selectOptions(screen.getByLabelText('Care circle'), 'first')
  expect(screen.getByText('Selected: First family')).toBeInTheDocument()
  expect(screen.getByLabelText('Care circle')).toBeDisabled()
})
it('handles users with no circles', () => {
  render(
    <MemoryRouter>
      <Page items={[]} />
    </MemoryRouter>,
  )
  expect(screen.getByLabelText('Care circle')).toBeDisabled()
  expect(screen.getByText('No care circles')).toBeInTheDocument()
})
