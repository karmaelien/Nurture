import { useRequiredSession } from '../auth/session.ts'
import { CircleSelection } from '../circles/CircleSelection.tsx'
import { useCircleSelection } from '../circles/selection.ts'
import { MedicationPanel } from './MedicationPanel.tsx'
import { PageHeader } from '../../components/ui/PageHeader.tsx'

export function MedicationsPage() {
  const { circles } = useRequiredSession()
  const { circle, selectCircle } = useCircleSelection(circles)
  return (
    <main className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
      <PageHeader
        title="Medications"
        description="Dosages, schedules, and caregivers for the people in your care."
        aside={<CircleSelection circles={circles} circle={circle} onChange={selectCircle} />}
      />
      {circle ? (
        <MedicationPanel key={circle.id} circle={circle} expanded />
      ) : (
        <p className="text-muted">Choose an available care circle above to view its medications.</p>
      )}
    </main>
  )
}
