import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import type { Recipient } from '../../api/types.ts'
import { cardClasses, linkCardClasses } from './cardClasses.ts'
import { displayName } from './names.ts'
import { PersonAvatar } from './PersonAvatar.tsx'
import { ageOn } from './schemas.ts'

/** A compact summary of someone being cared for, as the signed-in user sees them. Pass `to` to make it a link. */
export function RecipientCard({ recipient, to }: { recipient: Recipient; to?: string }) {
  const details = [
    recipient.relationship && `Your ${recipient.relationship}`,
    recipient.dateOfBirth && `${ageOn(recipient.dateOfBirth)} years old`,
  ].filter(Boolean)

  const body = (
    <>
      <PersonAvatar name={recipient.name} />
      <div className="min-w-0">
        <p className="truncate font-semibold">
          {displayName(recipient)}
          {/* The space sits outside the span so assistive tech reads "Grandma Rose · Rose Alvarez". */}
          {recipient.preferredName && (
            <>
              {' '}
              <span className="font-normal text-muted">· {recipient.name}</span>
            </>
          )}
        </p>
        {details.length > 0 && <p className="text-small text-muted">{details.join(' · ')}</p>}
      </div>
    </>
  )

  if (!to) return <div className={cardClasses}>{body}</div>
  return (
    <Link to={to} className={linkCardClasses}>
      {body}
      <ChevronRight className="ml-auto size-5 flex-none text-muted" aria-hidden />
    </Link>
  )
}
