import { ChevronRight, UserPlus } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import type { Member } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { buttonClasses } from '../../components/ui/buttonClasses.ts'
import { useRequiredSession } from '../auth/session.ts'
import { linkCardClasses } from './cardClasses.ts'
import { profilePaths } from './paths.ts'
import { PersonAvatar } from './PersonAvatar.tsx'
import { LoadingPanel, NotFoundPanel, PageMain } from './ProfilePageParts.tsx'
import { useCircleDetail } from './queries.ts'
import { RecipientCard } from './RecipientCard.tsx'
import { clockTime, useMinute, zoneName } from './time.ts'

/** Everyone in a care circle: the people it cares for and the caregivers in it. */
export function FamilyPage() {
  const { circleId = '' } = useParams()
  const { user, circles } = useRequiredSession()
  const circle = circles.find((item) => item.id === circleId)
  const detail = useCircleDetail(circleId, { enabled: !!circle })

  if (!circle) {
    return (
      <PageMain narrow>
        <NotFoundPanel title="We couldn’t find that care circle" backTo="/app" backLabel="Back to overview" />
      </PageMain>
    )
  }

  // You first, then everyone else by name.
  const members = [...(detail.data?.members ?? [])].sort(
    (a, b) => Number(b.user.id === user.id) - Number(a.user.id === user.id) || a.user.name.localeCompare(b.user.name),
  )

  return (
    <PageMain>
      <h1 className="font-display text-h1 font-bold">{circle.name}</h1>
      <p className="mt-2 text-muted">Everyone in this care circle.</p>

      <div className="mt-8 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-h3 font-semibold">People you care for</h2>
        <Link
          to={profilePaths.addPerson(circle.id)}
          state={{ from: profilePaths.family(circle.id) }}
          className={buttonClasses({ variant: 'secondary', size: 'sm' })}
        >
          <UserPlus className="size-4" aria-hidden />
          Add a person
        </Link>
      </div>
      <ul aria-label="People you care for" className="grid gap-3 md:grid-cols-2">
        {circle.recipients.map((recipient) => (
          <li key={recipient.id}>
            <RecipientCard recipient={recipient} to={profilePaths.person(circle.id, recipient.id)} />
          </li>
        ))}
      </ul>

      <h2 className="mt-10 mb-4 font-display text-h3 font-semibold">Caregivers</h2>
      {detail.isPending ? (
        <LoadingPanel label="Loading caregivers" />
      ) : detail.isError ? (
        <Alert tone="danger">{errorMessage(detail.error)}</Alert>
      ) : (
        <ul aria-label="Caregivers" className="grid gap-3 md:grid-cols-2">
          {members.map((member) => (
            <li key={member.user.id}>
              <CaregiverCard
                member={member}
                isYou={member.user.id === user.id}
                to={member.user.id === user.id ? profilePaths.me : profilePaths.caregiver(circle.id, member.user.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </PageMain>
  )
}

function CaregiverCard({ member, isYou, to }: { member: Member; isYou: boolean; to: string }) {
  const now = useMinute()
  const { name, timeZone } = member.user
  return (
    <Link to={to} className={linkCardClasses}>
      <PersonAvatar name={name} kind="caregiver" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
          <span className="truncate">{name}</span>
          {isYou && <Badge>You</Badge>}
          {member.role === 'owner' && <Badge>Owner</Badge>}
        </p>
        <p className="text-small text-muted">
          {timeZone ? `${zoneName(timeZone, now)} · ${clockTime(now, timeZone)} now` : 'No time zone set'}
        </p>
      </div>
      <ChevronRight className="ml-auto size-5 flex-none text-muted" aria-hidden />
    </Link>
  )
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-sage px-2 py-0.5 text-[12px] leading-4 font-semibold text-primary">
      {children}
    </span>
  )
}
