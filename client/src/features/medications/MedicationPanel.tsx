import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { circlesApi } from '../../api/circles.ts'
import { errorMessage } from '../../api/client.ts'
import type { CircleSummary, Medication } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { useMedications } from '../care/queries.ts'
import { MedicationEditor } from './MedicationEditor.tsx'
import { defaultOverdueMinutes, scheduleCourse, scheduleSummary } from './medication-schedule.ts'
import { zoneName } from '../profiles/time.ts'
import { MedicationDoses } from './MedicationDoses.tsx'
import { MedicationAttention } from './MedicationAttention.tsx'
import { CareProfileSelection } from '../care/CareProfileSelection.tsx'
import { useCareSelection } from '../care/selection.ts'
import { MedicationCalendar } from './MedicationCalendar.tsx'
import { MedicationNotifications } from './MedicationNotifications.tsx'

// Both pages use the same person/date state, scoped to the signed-in user and family.
export function MedicationPanel({
  circle,
  showProfileFilter = true,
  heading,
  id,
  showCaregiverError = true,
  expanded = false,
}: {
  circle: CircleSummary
  showProfileFilter?: boolean
  heading?: ReactNode
  id?: string
  showCaregiverError?: boolean
  expanded?: boolean
}) {
  const { user } = useRequiredSession()
  const { recipientId, setRecipientId } = useCareSelection(circle)
  const [editor, setEditor] = useState<{
    medication?: Medication
    deleting?: boolean
    stopping?: boolean
    restarting?: boolean
    startsOn?: string
    fromCalendar?: boolean
  } | null>(null)
  const medications = useMedications(circle.id)
  const detail = useQuery({
    queryKey: ['circle', user.id, circle.id],
    queryFn: () => circlesApi.detail(circle.id),
    retry: false,
  })
  const visible = medications.data?.filter((medication) => !recipientId || medication.recipientId === recipientId) ?? []

  return (
    <section
      id={id}
      aria-label="Medications"
      className="min-w-0 rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <div className={`mb-4 flex flex-wrap items-center gap-3 ${heading ? 'justify-between' : 'justify-end'}`}>
        {heading}
        <MedicationNotifications />
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
          stopping={editor.stopping}
          restarting={editor.restarting}
          initialStartsOn={editor.startsOn}
          allowDelete={!editor.fromCalendar}
          onClose={() => setEditor(null)}
        />
      )}
      {showProfileFilter && (
        <div className="mb-6 max-w-sm">
          <CareProfileSelection circle={circle} value={recipientId} onChange={setRecipientId} />
        </div>
      )}
      <MedicationAttention circle={circle} recipientId={recipientId} />
      <div className={expanded ? 'grid items-start gap-5 lg:grid-cols-2' : ''}>
        <MedicationDoses circle={circle} recipientId={recipientId} fillColumn={expanded} />
        <section
          aria-label="Medication List"
          className={`min-w-0 rounded-panel border border-line bg-surface p-5 sm:p-6 ${expanded ? 'flex flex-col lg:h-[38rem]' : ''}`}
        >
          <h2 className="mb-4 shrink-0 font-display text-h3 font-semibold">Medication List</h2>
          <div className={expanded ? 'min-h-0 flex-1 overflow-y-auto pr-2' : ''}>
            {showCaregiverError && detail.isError && (
              <div className="mb-5">
                <Alert tone="danger">
                  Caregiver names could not load.{' '}
                  <Button variant="secondary" onClick={() => void detail.refetch()}>
                    Retry caregiver names
                  </Button>
                </Alert>
              </div>
            )}
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
              <ul
                className={`grid max-h-96 auto-rows-max content-start gap-3 overflow-y-auto pr-2 ${expanded ? 'lg:max-h-none lg:overflow-visible lg:pr-0' : ''}`}
              >
                {visible.map((medication) => {
                  const person = circle.recipients.find((item) => item.id === medication.recipientId)
                  const caregiver =
                    medication.assignedCaregiverId === null
                      ? 'Unassigned'
                      : (detail.data?.circle.members.find((member) => member.user.id === medication.assignedCaregiverId)
                          ?.user.name ?? (detail.isPending ? 'Loading caregiver…' : 'Caregiver unavailable'))
                  return (
                    <li key={medication.id} className="rounded-panel border border-line-strong bg-wash/30 p-4">
                      <h2 className="font-display text-h3 font-semibold">{medication.name}</h2>
                      {medication.stoppedAt && (
                        <p className="mt-1 text-small text-muted">
                          Stopped on {new Date(medication.stoppedAt).toLocaleString()}
                        </p>
                      )}
                      <p className="mt-1">{person?.name ?? 'Care profile unavailable'}</p>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                        <div>
                          <dt className="text-small text-muted">Dosage</dt>
                          <dd>{medication.dosage}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-small text-muted">Caregiver</dt>
                          <dd>{caregiver}</dd>
                        </div>
                        <div className="col-span-2 min-w-0">
                          <dt className="sr-only">Schedule</dt>
                          <dd>
                            {scheduleSummary(medication.schedule)}
                            <span className="block text-small text-muted">
                              {scheduleCourse(medication.schedule, medication.stoppedAt)} ·{' '}
                              {zoneName(medication.schedule.timeZone)} · Missed after{' '}
                              {medication.schedule.overdueAfterMinutes ?? defaultOverdueMinutes}m
                              {medication.schedule.reminderBeforeMinutes !== null &&
                                medication.schedule.reminderBeforeMinutes !== undefined && (
                                  <>
                                    {' · '}
                                    {medication.schedule.reminderBeforeMinutes === 0
                                      ? 'Remind at dose time'
                                      : `Remind ${medication.schedule.reminderBeforeMinutes}m before`}
                                  </>
                                )}
                            </span>
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {medication.stoppedAt && (
                          <Button
                            variant="outline"
                            disabled={!detail.data}
                            onClick={() => setEditor({ medication, restarting: true })}
                          >
                            Restart medication
                          </Button>
                        )}
                        {!medication.stoppedAt && (
                          <>
                            <Button variant="outline" disabled={!detail.data} onClick={() => setEditor({ medication })}>
                              Edit medication
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={!detail.data}
                              onClick={() => setEditor({ medication, stopping: true })}
                            >
                              Stop medication
                            </Button>
                          </>
                        )}
                        <Button
                          variant="danger"
                          disabled={!detail.data}
                          onClick={() => setEditor({ medication, deleting: true })}
                        >
                          Delete permanently
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
      {expanded && (
        <MedicationCalendar
          circle={circle}
          recipientId={recipientId}
          medications={medications.isError ? [] : (medications.data ?? [])}
          onAdd={
            detail.data && !detail.isError && circle.recipients.length
              ? (startsOn) => setEditor({ startsOn, fromCalendar: true })
              : undefined
          }
          onEdit={
            detail.data && !detail.isError ? (medication) => setEditor({ medication, fromCalendar: true }) : undefined
          }
        />
      )}
    </section>
  )
}
