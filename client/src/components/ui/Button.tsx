import { clsx } from 'clsx'
import { LoaderCircle } from 'lucide-react'
import type { ComponentProps } from 'react'
import { buttonClasses, type Size, type Variant } from './buttonClasses.ts'

type ButtonProps = ComponentProps<'button'> & {
  variant?: Variant
  size?: Size
  block?: boolean
  loading?: boolean
}

export function Button({
  variant,
  size,
  block,
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx(buttonClasses({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
