import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import type { Recipient } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { buttonClasses } from '../../components/ui/buttonClasses.ts'
import { useRequiredSession } from '../auth/session.ts'
import { conflictingRecipient, useUpdateRecipient } from './mutations.ts'
import { displayName } from './names.ts'
import { profilePaths } from './paths.ts'
import { BackLink, NotFoundPanel, PageMain } from './ProfilePageParts.tsx'
import { RecipientFields, type RecipientDetail } from './RecipientFields.tsx'
import { editRecipientFormSchema } from './schemas.ts'
import { longDate } from './time.ts'

/** Edits the details of someone the circle cares for. Any member can do this. */
export function EditRecipientPage() {
  const { circleId = '', recipientId = '' } = useParams()
  const { circles } = useRequiredSession()
  const circle = circles.find((item) => item.id === circleId)
  const recipient = circle?.recipients.find((item) => item.id === recipientId)

  if (!circle || !recipient) {
    return (
      <PageMain narrow>
        <NotFoundPanel
          title="We couldn’t find that person"
          backTo={circle ? profilePaths.family(circle.id) : '/app'}
          backLabel={circle ? `Back to ${circle.name}` : 'Back to overview'}
        />
      </PageMain>
    )
  }
  return <EditRecipientForm circleId={circle.id} recipient={recipient} />
}

const DETAILS = ['name', 'preferredName', 'dateOfBirth', 'notes'] as const satisfies RecipientDetail[]

type Details = Pick<Recipient, RecipientDetail>

const formValues = (recipient: Recipient) => ({
  recipient: {
    name: recipient.name,
    preferredName: recipient.preferredName ?? '',
    dateOfBirth: recipient.dateOfBirth ?? '',
    notes: recipient.notes ?? '',
  },
})

/** A form value as the server would store it: trimmed, with empty as null. */
const stored = (value: string | null | undefined) => value?.trim() || null

function EditRecipientForm({ circleId, recipient }: { circleId: string; recipient: Recipient }) {
  const navigate = useNavigate()
  const update = useUpdateRecipient(circleId, recipient.id)
  const profile = profilePaths.person(circleId, recipient.id)
  const form = useForm({ resolver: zodResolver(editRecipientFormSchema), defaultValues: formValues(recipient) })
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = form
  // The saved details this edit is based on. It changes only when this page learns of a newer save,
  // never quietly in the background, so the server can tell when someone else saved in between.
  const [base, setBase] = useState(recipient)
  // Set when the server refused the save because someone else saved first.
  const [conflict, setConflict] = useState<Recipient | null>(null)
  const notice = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (conflict) notice.current?.focus()
  }, [conflict])

  const onSubmit = handleSubmit(async ({ recipient: details }) => {
    // Send only what changed, so a save never restates fields this person didn't touch.
    const changes: Partial<Details> = {}
    for (const key of DETAILS) {
      if (details[key] !== base[key]) Object.assign(changes, { [key]: details[key] })
    }
    try {
      if (Object.keys(changes).length > 0) await update.mutateAsync({ version: base.version, ...changes })
      navigate(profile)
    } catch (error) {
      const current = conflictingRecipient(error)
      if (!current) return setError('root', { message: errorMessage(error) })
      setBase(current)
      setConflict(current)
    }
  })

  const takeSaved = () => {
    if (!conflict) return
    reset(formValues(conflict))
    setConflict(null)
  }

  const typed = useWatch({ control, name: 'recipient' })
  const notices: Partial<Record<RecipientDetail, ReactNode>> = {}
  if (conflict) {
    for (const key of DETAILS) {
      const saved = conflict[key]
      if (stored(typed[key]) === saved) continue
      notices[key] = (
        <span className="block border-l-2 border-warning pl-2.5 text-ink">
          <span className="font-semibold">Saved now:</span>{' '}
          {saved === null ? <span className="text-muted">blank</span> : key === 'dateOfBirth' ? longDate(saved) : saved}
        </span>
      )
    }
  }

  return (
    <PageMain narrow>
      <BackLink to={profile}>{displayName(recipient)}</BackLink>
      <h1 className="mt-6 font-display text-h1 font-bold">Edit {displayName(recipient)}</h1>
      <p className="mt-2 text-muted">Everyone in the care circle sees these details.</p>
      <FormProvider {...form}>
        <form noValidate onSubmit={onSubmit} className="mt-8 grid gap-5">
          {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}
          {conflict && (
            <div ref={notice} tabIndex={-1} className="rounded-control outline-none">
              <Alert tone="warning">
                <p className="font-semibold">Someone in the circle changed these details while you were editing.</p>
                <p className="mt-1">What&rsquo;s saved now is shown under each field that&rsquo;s different.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={takeSaved}>
                    Use the saved version
                  </Button>
                  <Button type="submit" variant="secondary" size="sm" loading={isSubmitting}>
                    Save mine anyway
                  </Button>
                </div>
              </Alert>
            </div>
          )}
          <RecipientFields withRelationship={false} notices={notices} />
          <div className="mt-1 flex gap-3">
            <Link to={profile} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
              Cancel
            </Link>
            <Button type="submit" size="lg" loading={isSubmitting} className="flex-1">
              Save changes
            </Button>
          </div>
        </form>
      </FormProvider>
    </PageMain>
  )
}
