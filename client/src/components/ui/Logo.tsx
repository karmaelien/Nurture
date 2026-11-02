import { clsx } from 'clsx'

export function Logo({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-2 font-display font-bold tracking-[-0.025em]',
        size === 'md' ? 'text-[22px]' : 'text-[19px]',
        className,
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'grid place-items-center rounded-[9px_9px_9px_3px] bg-accent',
          size === 'md' ? 'size-[26px]' : 'size-[22px]',
        )}
      >
        <span className={clsx('rounded-full bg-pine', size === 'md' ? 'size-2.5' : 'size-2')} />
      </span>
      Nurture
    </span>
  )
}
