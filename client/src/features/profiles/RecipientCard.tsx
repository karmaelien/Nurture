import type { Recipient } from '../../api/types.ts'
import { ageOn } from './schemas.ts'

function initials(name: string) {
  const words = name.trim().split(/\s+/)
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
}

/** A compact summary of someone being cared for, as the signed-in user sees them. */
export function RecipientCard({ recipient }: { recipient: Recipient }) {
  const details = [
    recipient.relationship && `Your ${recipient.relationship}`,
    recipient.dateOfBirth && `${ageOn(recipient.dateOfBirth)} years old`,
  ].filter(Boolean)

  return (
    <div className="flex items-center gap-3 rounded-panel border border-line bg-surface p-4">
      <span
        aria-hidden
        className="grid size-11 flex-none place-items-center rounded-full bg-sage font-semibold text-primary"
      >
        {initials(recipient.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">
          {recipient.preferredName ?? recipient.name}
          {recipient.preferredName && <span className="font-normal text-muted"> · {recipient.name}</span>}
        </p>
        {details.length > 0 && <p className="text-small text-muted">{details.join(' · ')}</p>}
      </div>
    </div>
  )
}
