import { Pencil } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import type { Recipient, Relationship } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { buttonClasses } from '../../components/ui/buttonClasses.ts'
import { useRequiredSession } from '../auth/session.ts'
import { useSetRelationship } from './mutations.ts'
import { displayName, shortName } from './names.ts'
import { profilePaths } from './paths.ts'
import { PersonAvatar } from './PersonAvatar.tsx'
import { BackLink, Fact, Facts, NotFoundPanel, PageMain, ProfileSection } from './ProfilePageParts.tsx'
import { useCircleDetail } from './queries.ts'
import { RelationshipChips } from './RelationshipPicker.tsx'
import { ageOn } from './schemas.ts'
import { longDate } from './time.ts'

/** One person the circle cares for: their details, notes, and how each caregiver relates to them. */
export function RecipientProfilePage() {
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

  const summary = [
    recipient.preferredName && recipient.name,
    recipient.dateOfBirth && `${ageOn(recipient.dateOfBirth)} years old`,
  ].filter(Boolean)

  return (
    <PageMain narrow>
      <BackLink to={profilePaths.family(circle.id)}>{circle.name}</BackLink>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <PersonAvatar name={recipient.name} size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-h1 font-bold break-words">{displayName(recipient)}</h1>
            {summary.length > 0 && <p className="mt-1 text-muted">{summary.join(' · ')}</p>}
          </div>
        </div>
        <Link to={profilePaths.editPerson(circle.id, recipient.id)} className={buttonClasses({ variant: 'outline' })}>
          <Pencil className="size-4" aria-hidden />
          Edit
        </Link>
      </div>

      <div className="mt-8 grid gap-4">
        <ProfileSection title="Details">
          <Facts>
            <Fact label="Full name">{recipient.name}</Fact>
            {recipient.preferredName && <Fact label="Goes by">{recipient.preferredName}</Fact>}
            <Fact label="Born" muted={!recipient.dateOfBirth}>
              {recipient.dateOfBirth ? longDate(recipient.dateOfBirth) : 'Not added'}
            </Fact>
          </Facts>
        </ProfileSection>
        {recipient.notes && (
          <ProfileSection title="Notes">
            <p className="border-l-3 border-accent pl-3 whitespace-pre-line">{recipient.notes}</p>
          </ProfileSection>
        )}
        <RelationshipSection circleId={circle.id} recipient={recipient} />
      </div>
    </PageMain>
  )
}

/** Your own label, saved as soon as you pick it, and the labels everyone else in the circle chose. */
function RelationshipSection({ circleId, recipient }: { circleId: string; recipient: Recipient }) {
  const { user } = useRequiredSession()
  const setRelationship = useSetRelationship(circleId, recipient.id)
  const detail = useCircleDetail(circleId)
  // Show the latest choice straight away; if saving fails, the saved label comes back.
  const shown: Relationship | null = setRelationship.isPending ? setRelationship.variables : recipient.relationship
  const others = (detail.data?.members ?? []).flatMap((member) => {
    const label = member.relationships[recipient.id]
    return member.user.id !== user.id && label ? [`${shortName(member.user.name)}’s ${label}`] : []
  })
  const name = shortName(recipient.name, recipient.preferredName)

  return (
    <ProfileSection title="Your relationship">
      <RelationshipChips
        name={name}
        value={shown}
        noneLabel="not set"
        onChange={(relationship) => {
          if (relationship !== recipient.relationship) setRelationship.mutate(relationship)
        }}
        hint="Saves as soon as you pick. Only you see your own label."
      />
      <div role="status" className="mt-3 empty:hidden">
        {setRelationship.isSuccess && <p className="text-small text-success">Saved.</p>}
      </div>
      {setRelationship.isError && (
        <div className="mt-3">
          <Alert tone="danger">{errorMessage(setRelationship.error)}</Alert>
        </div>
      )}
      {others.length > 0 && (
        <p className="mt-4 border-t border-line pt-4 text-small">
          <span className="text-muted">Others in the circle: </span>
          {name} is {others.join(', ')}.
        </p>
      )}
    </ProfileSection>
  )
}
