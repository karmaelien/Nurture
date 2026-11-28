import { useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { assistanceApi } from '../../api/assistance.ts'
import { errorMessage } from '../../api/client.ts'
import type { AssistanceReport, AssistanceResource, CircleSummary, Medication } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { SelectField, TextField } from '../../components/ui/Field.tsx'
import { FormDialog } from '../../components/ui/FormDialog.tsx'
import { QueryFeedback } from '../../components/ui/QueryFeedback.tsx'
import { useMedications } from '../care/queries.ts'
import { useRequiredSession } from '../auth/session.ts'
import { AssistanceReportItem } from './AssistanceReportItem.tsx'
import { assistanceInputSchema, parseCost } from './schemas.ts'
import { useRefreshAssistance } from './queries.ts'

export function AssistanceReportForm({
  circle,
  initialMedication,
  initialRecipientId,
  onClose,
  onSaved,
}: {
  circle: CircleSummary
  initialMedication?: Medication
  initialRecipientId?: string
  onClose: () => void
  onSaved?: () => void
}) {
  const medications = useMedications(circle.id)
  const { user } = useRequiredSession()
  const [recipientId, setRecipientId] = useState(
    initialMedication?.recipientId ?? initialRecipientId ?? circle.recipients[0]?.id ?? '',
  )
  const [medicationId, setMedicationId] = useState(initialMedication?.id ?? '')
  const [reason, setReason] = useState<'price_increase' | 'not_covered'>('price_increase')
  const [previous, setPrevious] = useState(''),
    [current, setCurrent] = useState(''),
    [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [saved, setSaved] = useState<{ report: AssistanceReport; resources: AssistanceResource[] } | null>(null)
  const saving = useRef(false)
  const attempt = useRef<{ signature: string; id: string } | null>(null)
  const refresh = useRefreshAssistance(circle.id)
  // Keep saved details live: a later access failure must hide the snapshot and links.
  const details = useQuery({
    queryKey: ['care', user.id, circle.id, 'assistance', 'report', saved?.report.id],
    queryFn: () => assistanceApi.get(circle.id, saved!.report.id),
    initialData: saved ?? undefined,
    enabled: !!saved,
    retry: false,
    refetchOnWindowFocus: true,
  })
  const options = (medications.data ?? []).filter((medication) => medication.recipientId === recipientId)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving.current || medications.isError || medications.isPending) return
    if (!options.some((medication) => medication.id === medicationId)) {
      setError('Choose an available medication for this person.')
      return
    }
    const input = {
      medicationId,
      reason,
      previousCostCents: reason === 'price_increase' ? parseCost(previous) : null,
      currentCostCents: reason === 'price_increase' ? parseCost(current) : null,
      notes: notes.trim(),
    }
    const signature = JSON.stringify(input)
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() }
    const parsed = assistanceInputSchema.safeParse({ ...input, requestId: attempt.current!.id })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const result = await assistanceApi.create(circle.id, parsed.data)
      await refresh()
      setSaved(result)
      onSaved?.()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  return (
    <FormDialog
      key={saved ? 'saved-report' : 'report-form'}
      title={saved ? 'Patient Assistance' : 'Report medication cost or coverage'}
      busy={busy}
      isBusy={() => saving.current}
      onClose={onClose}
    >
      {saved && (details.isError || details.isPending) ? (
        <QueryFeedback query={details} loading="Loading assistance resources…" />
      ) : saved && details.data ? (
        <ul>
          <AssistanceReportItem
            report={details.data.report}
            resources={details.data.resources}
            person={
              circle.recipients.find((person) => person.id === saved.report.recipientId)?.name ??
              'Care profile unavailable'
            }
            onChange={(report) => setSaved({ ...saved, report })}
            onBusyChange={(pending) => {
              saving.current = pending
              setBusy(pending)
            }}
          />
        </ul>
      ) : (
        <>
          <p className="mb-4 text-small text-muted">
            Report a cost increase or missing coverage to find assistance resources. This does not change medication
            schedules or record an expense.
          </p>
          <form aria-label="Report medication cost or coverage" onSubmit={submit} className="grid gap-4">
            <fieldset disabled={busy} className="grid gap-4">
              <SelectField
                label="Care profile"
                value={recipientId}
                onChange={(event) => {
                  setRecipientId(event.target.value)
                  setMedicationId('')
                }}
              >
                {circle.recipients.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </SelectField>
              {medications.isPending || medications.isError ? (
                <QueryFeedback query={medications} loading="Loading medications…" />
              ) : (
                <>
                  <SelectField
                    label="Medication"
                    value={medicationId}
                    onChange={(event) => setMedicationId(event.target.value)}
                    required
                  >
                    <option value="">Select a medication</option>
                    {options.map((medication) => (
                      <option key={medication.id} value={medication.id}>
                        {medication.name}
                        {medication.stoppedAt ? ' (stopped)' : ''}
                      </option>
                    ))}
                  </SelectField>
                  {!options.length && (
                    <p className="text-small text-muted">
                      Add a medication for this person before reporting a cost or coverage issue.
                    </p>
                  )}
                </>
              )}
              <SelectField
                label="What changed?"
                value={reason}
                onChange={(event) => setReason(event.target.value as typeof reason)}
              >
                <option value="price_increase">The price increased</option>
                <option value="not_covered">Insurance does not cover it</option>
              </SelectField>
              {reason === 'price_increase' && (
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Previous cost (USD)"
                    inputMode="decimal"
                    maxLength={12}
                    value={previous}
                    onChange={(event) => setPrevious(event.target.value)}
                    required
                  />
                  <TextField
                    label="Current cost (USD)"
                    inputMode="decimal"
                    maxLength={12}
                    value={current}
                    onChange={(event) => setCurrent(event.target.value)}
                    required
                  />
                  <p className="col-span-2 text-small text-muted">
                    Compare the same quantity or refill. These are costs you report, not verified pharmacy prices.
                  </p>
                </div>
              )}
              {reason === 'not_covered' && (
                <p className="text-small text-muted">
                  This records your report, not a formal coverage determination from an insurer.
                </p>
              )}
              <TextField
                label="Notes"
                optional
                maxLength={500}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </fieldset>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                loading={busy}
                disabled={medications.isError || medications.isPending || !options.length}
              >
                Save report
              </Button>
              <Button variant="secondary" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        </>
      )}
    </FormDialog>
  )
}
