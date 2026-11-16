import { Mail, Phone } from 'lucide-react'
import { Navigate, useParams } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import type { CircleDetail, Member } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { buttonClasses } from '../../components/ui/buttonClasses.ts'
import { useRequiredSession } from '../auth/session.ts'
import { displayName, shortName } from './names.ts'
import { profilePaths } from './paths.ts'
import { PersonAvatar } from './PersonAvatar.tsx'
import { BackLink, Fact, Facts, LoadingPanel, NotFoundPanel, PageMain, ProfileSection } from './ProfilePageParts.tsx'
import { useCircleDetail } from './queries.ts'
import { clockTime, useMinute, zoneName } from './time.ts'

/** Another caregiver in the circle, read-only: how to reach them and who they care for. */
export function CaregiverProfilePage() {
  const { circleId = '', userId = '' } = useParams()
  const { user, circles } = useRequiredSession()
  const circle = circles.find((item) => item.id === circleId)
  const detail = useCircleDetail(circleId, { enabled: !!circle && userId !== user.id })

  // Your own caregiver profile is the one you can edit.
  if (userId === user.id) return <Navigate to={profilePaths.me} replace />
  if (circle && detail.isPending) {
    return (
      <PageMain narrow>
        <LoadingPanel label="Loading caregiver" />
      </PageMain>
    )
  }
  if (circle && detail.isError) {
    return (
      <PageMain narrow>
        <Alert tone="danger">{errorMessage(detail.error)}</Alert>
      </PageMain>
    )
  }
  const member = detail.data?.members.find((item) => item.user.id === userId)
  if (!circle || !detail.data || !member) {
    return (
      <PageMain narrow>
        <NotFoundPanel
          title="We couldn’t find that caregiver"
          backTo={circle ? profilePaths.family(circle.id) : '/app'}
          backLabel={circle ? `Back to ${circle.name}` : 'Back to overview'}
        />
      </PageMain>
    )
  }
  return <CaregiverProfile circle={detail.data} member={member} />
}

const joined = (timestamp: string) =>
  new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(timestamp))

function CaregiverProfile({ circle, member }: { circle: CircleDetail; member: Member }) {
  const now = useMinute()
  const { name, email, phone, timeZone } = member.user
  const first = shortName(name)

  return (
    <PageMain narrow>
      <BackLink to={profilePaths.family(circle.id)}>{circle.name}</BackLink>
      <div className="mt-6 flex min-w-0 items-center gap-4">
        <PersonAvatar name={name} size="lg" kind="caregiver" />
        <div className="min-w-0">
          <h1 className="font-display text-h1 font-bold break-words">{name}</h1>
          <p className="mt-1 text-muted">
            {member.role === 'owner' ? 'Owner' : 'Member'} · joined {joined(member.joinedAt)}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {phone && (
          <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={buttonClasses({ size: 'sm' })}>
            <Phone className="size-4" aria-hidden />
            Call {first}
          </a>
        )}
        <a href={`mailto:${email}`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
          <Mail className="size-4" aria-hidden />
          Email {first}
        </a>
      </div>

      <div className="mt-8 grid gap-4">
        <ProfileSection title="Contact">
          <Facts>
            <Fact label="Email">{email}</Fact>
            <Fact label="Phone" muted={!phone}>
              {phone ?? 'Not added'}
            </Fact>
            <Fact label="Local time" muted={!timeZone}>
              {timeZone ? `${clockTime(now, timeZone)}, ${zoneName(timeZone, now)}` : 'No time zone set'}
            </Fact>
          </Facts>
        </ProfileSection>
        <ProfileSection title="Cares for">
          <Facts>
            {circle.recipients.map((recipient) => {
              const label = member.relationships[recipient.id]
              return (
                <Fact key={recipient.id} label={displayName(recipient)} muted={!label}>
                  {label ? `${first}’s ${label}` : 'No relationship set'}
                </Fact>
              )
            })}
          </Facts>
        </ProfileSection>
      </div>
    </PageMain>
  )
}
