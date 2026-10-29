import { clsx } from 'clsx'

export type Variant = 'primary' | 'secondary' | 'ghost'
export type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-wash',
  ghost: 'text-ink hover:bg-wash',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-small',
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-12 px-5 text-base',
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = false,
}: { variant?: Variant; size?: Size; block?: boolean } = {}) {
  return clsx(
    'inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variants[variant],
    sizes[size],
    block && 'w-full',
  )
}
