import { clsx } from 'clsx'
import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useId, useState, type ComponentProps, type ReactNode } from 'react'

type FieldShellProps = {
  label: string
  /** Marks the field as optional in its label. */
  optional?: boolean
  error?: string
  hint?: ReactNode
  children: (control: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
}

function FieldShell({ label, optional, error, hint, children }: FieldShellProps) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error ?? hint
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-small font-semibold text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children({ id, describedBy: message ? messageId : undefined, invalid: Boolean(error) })}
      {message && (
        <p id={messageId} className={clsx('text-small', error ? 'font-medium text-danger' : 'text-muted')}>
          {message}
        </p>
      )}
    </div>
  )
}

const controlClasses = (invalid: boolean) =>
  clsx(
    'w-full rounded-control border bg-surface px-3.5 text-body text-ink outline-none transition-[border-color,box-shadow]',
    'placeholder:text-muted/70 focus:border-primary focus:ring-3 focus:ring-primary/25',
    invalid ? 'border-danger' : 'border-line-strong',
  )

type TextFieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  label: string
  optional?: boolean
  error?: string
  hint?: ReactNode
  trailing?: ReactNode
}

export function TextField({ label, optional, error, hint, trailing, className, ...props }: TextFieldProps) {
  return (
    <FieldShell label={label} optional={optional} error={error} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <input
            id={id}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={clsx(controlClasses(invalid), 'h-12', trailing && 'pr-12', className)}
            {...props}
          />
          {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
        </div>
      )}
    </FieldShell>
  )
}

export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="grid size-10 place-items-center rounded-[8px] text-muted hover:bg-wash hover:text-ink"
        >
          <Icon className="size-5" aria-hidden />
        </button>
      }
    />
  )
}

type SelectFieldProps = Omit<ComponentProps<'select'>, 'id'> & {
  label: string
  optional?: boolean
  error?: string
  hint?: ReactNode
}

export function SelectField({ label, optional, error, hint, className, children, ...props }: SelectFieldProps) {
  return (
    <FieldShell label={label} optional={optional} error={error} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select
            id={id}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={clsx(controlClasses(invalid), 'h-12 appearance-none pr-11', className)}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-muted"
            aria-hidden
          />
        </div>
      )}
    </FieldShell>
  )
}

type TextAreaFieldProps = Omit<ComponentProps<'textarea'>, 'id'> & {
  label: string
  optional?: boolean
  error?: string
  hint?: ReactNode
}

export function TextAreaField({ label, optional, error, hint, className, ...props }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} optional={optional} error={error} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={clsx(controlClasses(invalid), 'min-h-28 resize-y py-3', className)}
          {...props}
        />
      )}
    </FieldShell>
  )
}
