import { useRequiredSession } from '../auth/session.ts'
import { CircleSelection } from '../circles/CircleSelection.tsx'
import { useCircleSelection } from '../circles/selection.ts'
import { MedicationPanel } from './MedicationPanel.tsx'

export function MedicationsPage() {
  const { circles } = useRequiredSession()
  const { circle, selectCircle } = useCircleSelection(circles)
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-h1 font-bold">Medications</h1>
          <p className="mt-2 text-muted">Dosages, schedules, and caregivers for the people in your care.</p>
        </div>
        <CircleSelection circles={circles} circle={circle} onChange={selectCircle} />
      </div>
      {circle ? (
        <MedicationPanel key={circle.id} circle={circle} expanded />
      ) : (
        <p className="text-muted">Choose an available care circle above to view its medications.</p>
      )}
    </main>
  )
}
