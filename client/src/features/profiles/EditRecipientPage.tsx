import { zodResolver } from '@hookform/resolvers/zod'
import { FormProvider, useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import type { Recipient } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { buttonClasses } from '../../components/ui/buttonClasses.ts'
import { useRequiredSession } from '../auth/session.ts'
import { useUpdateRecipient } from './mutations.ts'
import { displayName } from './names.ts'
import { profilePaths } from './paths.ts'
import { BackLink, NotFoundPanel, PageMain } from './ProfilePageParts.tsx'
import { RecipientFields } from './RecipientFields.tsx'
import { editRecipientFormSchema } from './schemas.ts'

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

function EditRecipientForm({ circleId, recipient }: { circleId: string; recipient: Recipient }) {
  const navigate = useNavigate()
  const update = useUpdateRecipient(circleId, recipient.id)
  const profile = profilePaths.person(circleId, recipient.id)
  const form = useForm({
    resolver: zodResolver(editRecipientFormSchema),
    defaultValues: {
      recipient: {
        name: recipient.name,
        preferredName: recipient.preferredName ?? '',
        dateOfBirth: recipient.dateOfBirth ?? '',
        notes: recipient.notes ?? '',
      },
    },
  })
  const {
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form

  const onSubmit = handleSubmit(async ({ recipient: details }) => {
    try {
      await update.mutateAsync(details)
      navigate(profile)
    } catch (error) {
      setError('root', { message: errorMessage(error) })
    }
  })

  return (
    <PageMain narrow>
      <BackLink to={profile}>{displayName(recipient)}</BackLink>
      <h1 className="mt-6 font-display text-h1 font-bold">Edit {displayName(recipient)}</h1>
      <p className="mt-2 text-muted">Everyone in the care circle sees these details.</p>
      <FormProvider {...form}>
        <form noValidate onSubmit={onSubmit} className="mt-8 grid gap-5">
          {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}
          <RecipientFields withRelationship={false} />
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
