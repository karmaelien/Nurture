import { useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { assistanceApi } from '../../api/assistance.ts'
import { ApiError, errorMessage } from '../../api/client.ts'
import type { AssistanceReport, AssistanceResource } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { StatusBadge } from '../../components/ui/StatusBadge.tsx'
import { formatMoney } from '../home/dashboard.ts'
import { reasonLabel } from './schemas.ts'
import { useRefreshAssistance } from './queries.ts'

export function AssistanceReportItem({
  report,
  resources,
  person,
  onChange,
  onBusyChange,
}: {
  report: AssistanceReport
  resources: AssistanceResource[]
  person: string
  onChange?: (report: AssistanceReport) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accessError, setAccessError] = useState('')
  const refresh = useRefreshAssistance(report.circleId)
  async function toggle() {
    if (saving.current) return
    saving.current = true
    onBusyChange?.(true)
    setBusy(true)
    setError('')
    try {
      const { report: saved } = await assistanceApi.notification(
        report.circleId,
        report.id,
        !report.dismissedAt,
        report.version,
      )
      onChange?.(saved)
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
        // Hide this report immediately, before access revalidation finishes.
        setAccessError(errorMessage(cause))
        await refresh()
      } else if (cause instanceof ApiError && cause.status === 409) await refresh()
    } finally {
      saving.current = false
      onBusyChange?.(false)
      setBusy(false)
    }
  }
  async function recheckAccess() {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    try {
      await assistanceApi.get(report.circleId, report.id)
      await refresh()
      setAccessError('')
      setError('')
    } catch (cause) {
      setAccessError(errorMessage(cause))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  if (accessError)
    return (
      <li className="py-4 first:pt-0 last:pb-0">
        <Alert tone="danger">{accessError}</Alert>
        <Button className="mt-3" variant="secondary" loading={busy} onClick={() => void recheckAccess()}>
          Try again
        </Button>
      </li>
    )
  const matching = resources.filter((resource) => resource.reasons.includes(report.reason))
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="min-w-0 max-w-full break-words font-display text-h3 font-semibold">{report.medicationName}</h3>
        <StatusBadge tone={report.dismissedAt ? 'neutral' : 'warning'}>
          {report.dismissedAt ? 'Dismissed' : 'Active'}
        </StatusBadge>
      </div>
      <p className="mt-1">{person}</p>
      <p className="mt-2 font-semibold">{reasonLabel[report.reason]}</p>
      {report.reason === 'price_increase' && (
        <p className="mt-1">
          {formatMoney(report.previousCostCents!)} → {formatMoney(report.currentCostCents!)}
        </p>
      )}
      <p className="mt-1 text-small text-muted">User-reported · {new Date(report.createdAt).toLocaleString()}</p>
      {report.reason === 'not_covered' && (
        <p className="mt-1 text-small text-muted">This report is not an insurer's coverage decision.</p>
      )}
      {report.notes && <p className="mt-2 whitespace-pre-wrap break-words">{report.notes}</p>}
      {matching.length ? (
        <>
          <h4 className="mt-4 font-semibold">Assistance Resources</h4>
          <p className="mt-1 text-small text-muted">
            Search these U.S. resources for {report.medicationName}. Availability and eligibility are determined by each
            program.
          </p>
          <ul className="mt-3 space-y-3">
            {matching.map((resource) => (
              <li key={resource.id}>
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link inline-flex items-center gap-2"
                >
                  {resource.title}
                  <ExternalLink className="size-4 shrink-0" aria-hidden />
                </a>
                <p className="mt-1 text-small text-muted">{resource.description}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-small text-muted">
            Applications and payments stay with the external program. If a site is unavailable, try another resource.
          </p>
        </>
      ) : (
        <p className="mt-3 text-muted">
          No assistance resources are currently available for this report. The report has been saved.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" loading={busy} onClick={() => void toggle()}>
          {report.dismissedAt ? 'Show notification' : 'Dismiss notification'}
        </Button>
      </div>
      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </li>
  )
}
