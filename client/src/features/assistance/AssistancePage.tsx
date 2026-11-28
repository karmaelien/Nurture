import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { buttonClasses } from '../../components/ui/buttonClasses.ts'
import type { AssistanceFilters, CircleSummary } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { SelectField } from '../../components/ui/Field.tsx'
import { FeatureToolbar } from '../../components/ui/FeatureToolbar.tsx'
import { PageHeader } from '../../components/ui/PageHeader.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { CareProfileSelection } from '../care/CareProfileSelection.tsx'
import { useCareSelection } from '../care/selection.ts'
import { CircleSelection } from '../circles/CircleSelection.tsx'
import { circleLink, useCircleSelection } from '../circles/selection.ts'
import { AssistanceList } from './AssistanceList.tsx'
import { AssistanceReportForm } from './AssistanceReportForm.tsx'
import { useAssistanceReports } from './queries.ts'

function Reports({ circle }: { circle: CircleSummary }) {
  const { recipientId, setRecipientId, resetFilters } = useCareSelection(circle)
  const [status, setStatus] = useState<AssistanceFilters['status']>('active')
  const [reporting, setReporting] = useState(false),
    [notice, setNotice] = useState('')
  const query = useAssistanceReports(circle.id, recipientId, status)
  return (
    <section className="min-w-0 rounded-panel border border-line bg-surface p-5 sm:p-6">
      <FeatureToolbar
        onClear={() => {
          resetFilters()
          setStatus('active')
        }}
        actions={
          <Button
            disabled={!circle.recipients.length}
            onClick={() => {
              setNotice('')
              setReporting(true)
            }}
          >
            Report cost or coverage
          </Button>
        }
      >
        <CareProfileSelection circle={circle} value={recipientId} onChange={setRecipientId} />
        <SelectField
          label="Notifications"
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
        >
          <option value="active">Active</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All reports</option>
        </SelectField>
      </FeatureToolbar>
      {notice && <Alert tone="success">{notice}</Alert>}
      {!query.isPending && !query.isError && (
        <p className="mb-4 text-small text-muted" role="status">
          {query.totalCount}{' '}
          {status === 'all'
            ? query.totalCount === 1
              ? 'report'
              : 'reports'
            : `${status} ${query.totalCount === 1 ? 'notification' : 'notifications'}`}{' '}
          · User-reported medication costs and coverage
        </p>
      )}
      <div className="max-h-[38rem] overflow-y-auto pr-2">
        <AssistanceList query={query} circle={circle} />
      </div>
      {reporting && (
        <AssistanceReportForm
          circle={circle}
          initialRecipientId={recipientId || undefined}
          onSaved={() => setNotice('Report saved. Filters have been preserved.')}
          onClose={() => setReporting(false)}
        />
      )}
    </section>
  )
}
export function AssistancePage() {
  const { circles } = useRequiredSession()
  const { circle, selectCircle } = useCircleSelection(circles)
  return (
    <main className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
      <Link
        to={circleLink('/app/medications', circle?.id)}
        className={`${buttonClasses({ variant: 'secondary' })} mb-4`}
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to Medications
      </Link>
      <PageHeader
        title="Patient Assistance"
        description="Help finding resources for medication costs and missing insurance coverage."
        aside={<CircleSelection circles={circles} circle={circle} onChange={selectCircle} />}
      />
      {circle ? (
        <Reports key={circle.id} circle={circle} />
      ) : (
        <p className="text-muted">Choose an available family to view assistance reports.</p>
      )}
    </main>
  )
}
