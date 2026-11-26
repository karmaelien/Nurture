import { clsx } from 'clsx'

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
export type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  outline: 'border border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-wash',
  ghost: 'text-ink hover:bg-wash',
  danger: 'border border-danger bg-transparent text-danger hover:bg-danger hover:text-surface',
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
