import { clsx } from 'clsx'
import { initials } from './names.ts'

/**
 * A round initials badge. People being cared for sit on sage; caregivers get an outlined wash,
 * so the two read as different groups on the Family page.
 */
export function PersonAvatar({
  name,
  size = 'md',
  kind = 'recipient',
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
  kind?: 'recipient' | 'caregiver'
}) {
  return (
    <span
      aria-hidden
      className={clsx(
        'grid flex-none place-items-center rounded-full font-semibold text-primary',
        { sm: 'size-7 text-[12px]', md: 'size-11', lg: 'size-16 text-h3' }[size],
        kind === 'recipient' ? 'bg-sage' : 'border border-line-strong bg-wash',
      )}
    >
      {initials(name)}
    </span>
  )
}
