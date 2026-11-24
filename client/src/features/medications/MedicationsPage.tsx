import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { circlesApi } from '../../api/circles.ts'
import { errorMessage } from '../../api/client.ts'
import type { CircleSummary, Medication } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { useMedications } from '../care/queries.ts'
import { CircleSelection } from '../circles/CircleSelection.tsx'
import { useCircleSelection } from '../circles/selection.ts'
import { MedicationEditor } from './MedicationEditor.tsx'
import { scheduleCourse, scheduleSummary } from './medication-schedule.ts'
import { zoneName } from '../profiles/time.ts'

function MedicationList({ circle }: { circle: CircleSummary }) {
  const { user } = useRequiredSession()
  const [recipientId, setRecipientId] = useState('')
  const [editor, setEditor] = useState<{ medication?: Medication; deleting?: boolean } | null>(null)
  const medications = useMedications(circle.id)
  const detail = useQuery({
    queryKey: ['circle', user.id, circle.id],
    queryFn: () => circlesApi.detail(circle.id),
    retry: false,
  })
  const visible = medications.data?.filter((medication) => !recipientId || medication.recipientId === recipientId) ?? []

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button disabled={!detail.data || !circle.recipients.length} onClick={() => setEditor({})}>
          Add medication
        </Button>
      </div>
      {editor && detail.data && (
        <MedicationEditor
          circle={detail.data.circle}
          recipientId={recipientId}
          medication={editor.medication}
          deleting={editor.deleting}
          onClose={() => setEditor(null)}
          onSaved={() => {
            if (!editor.medication) setRecipientId('')
          }}
        />
      )}
      <label className="mb-6 grid max-w-sm gap-2">
        Care profile
        <select
          className="rounded-control border border-field bg-surface px-3 py-2 text-body"
          value={recipientId}
          onChange={(event) => setRecipientId(event.target.value)}
        >
          <option value="">All care profiles</option>
          {circle.recipients.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      {detail.isError && (
        <div className="mb-5">
          <Alert tone="danger">
            Caregiver names could not load.{' '}
            <Button variant="secondary" onClick={() => void detail.refetch()}>
              Retry caregiver names
            </Button>
          </Alert>
        </div>
      )}
      <section aria-label="Medication list" className="rounded-panel border border-line bg-surface p-5 sm:p-6">
        {medications.isPending ? (
          <p role="status" className="text-muted">
            Loading medications…
          </p>
        ) : medications.isError ? (
          <Alert tone="danger">
            {errorMessage(medications.error)}{' '}
            <Button variant="secondary" onClick={() => void medications.refetch()}>
              Try again
            </Button>
          </Alert>
        ) : visible.length === 0 ? (
          <p className="text-muted">No medications for {recipientId ? 'this care profile' : 'this family'}.</p>
        ) : (
          <ul className="grid gap-5">
            {visible.map((medication) => {
              const person = circle.recipients.find((item) => item.id === medication.recipientId)
              const caregiver =
                medication.assignedCaregiverId === null
                  ? 'Unassigned'
                  : (detail.data?.circle.members.find((member) => member.user.id === medication.assignedCaregiverId)
                      ?.user.name ?? (detail.isPending ? 'Loading caregiver…' : 'Caregiver unavailable'))
              return (
                <li key={medication.id} className="rounded-panel border border-line-strong bg-wash/30 p-5 sm:p-6">
                  <h2 className="font-display text-h3 font-semibold">{medication.name}</h2>
                  <p className="mt-1">{person?.name ?? 'Care profile unavailable'}</p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-small text-muted">Dosage</dt>
                      <dd>{medication.dosage}</dd>
                    </div>
                    <div>
                      <dt className="text-small text-muted">Schedule</dt>
                      <dd>
                        {scheduleSummary(medication.schedule)}
                        <span className="block text-small text-muted">{scheduleCourse(medication.schedule)}</span>
                        <span className="block text-small text-muted">
                          {zoneName(medication.schedule.timeZone)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-small text-muted">Caregiver</dt>
                      <dd>{caregiver}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" disabled={!detail.data} onClick={() => setEditor({ medication })}>
                      Edit medication
                    </Button>
                    <Button
                      variant="danger"
                      disabled={!detail.data}
                      onClick={() => setEditor({ medication, deleting: true })}
                    >
                      Delete medication
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

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
        <MedicationList key={circle.id} circle={circle} />
      ) : (
        <p className="text-muted">Choose an available care circle above to view its medications.</p>
      )}
    </main>
  )
}
