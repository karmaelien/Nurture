import { clsx } from 'clsx'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import type { CircleSummary } from '../../api/types.ts'
import { buttonClasses } from '../../components/ui/buttonClasses.ts'
import { useRequiredSession } from '../auth/session.ts'
import { AddRecipientForm } from '../profiles/AddRecipientForm.tsx'
import { RecipientCard } from '../profiles/RecipientCard.tsx'

/** Setup step 3: add anyone else the circle cares for, then finish. */
export function PeopleStep() {
  const { circleId } = useParams()
  const { circles } = useRequiredSession()
  const circle = circles.find((item) => item.id === circleId)
  if (!circle) return <Navigate to="/app" replace />
  return <People circle={circle} />
}

function People({ circle }: { circle: CircleSummary }) {
  const [adding, setAdding] = useState(false)
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  return (
    <>
      <h1 className="font-display text-h1 font-bold">Anyone else in {circle.name}?</h1>
      <p className="mt-2 text-muted">Add anyone else your family cares for, like a second grandparent.</p>

      <ul className="mt-8 grid gap-3" aria-label="People you care for">
        {circle.recipients.map((recipient) => (
          <li key={recipient.id}>
            <RecipientCard recipient={recipient} />
          </li>
        ))}
      </ul>
      <p role="status" className="sr-only">
        {lastAdded && `Added ${lastAdded}.`}
      </p>

      {adding ? (
        <section aria-labelledby="add-person-title" className="mt-6 rounded-panel border border-line bg-surface p-5">
          <h2 id="add-person-title" className="mb-5 font-display text-h3 font-semibold">
            Add another person
          </h2>
          <AddRecipientForm
            circleId={circle.id}
            onAdded={(recipient) => {
              setLastAdded(recipient.preferredName ?? recipient.name)
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-panel border-2 border-dashed border-line-strong font-semibold text-primary transition-colors hover:bg-wash"
        >
          <Plus className="size-5" aria-hidden />
          Add another person
        </button>
      )}

      {/* Hidden while the form is open, so "Add person" is the only primary action. */}
      {!adding && (
        <Link to="/app" className={clsx(buttonClasses({ size: 'lg', block: true }), 'mt-8')}>
          Go to your dashboard
        </Link>
      )}
    </>
  )
}
