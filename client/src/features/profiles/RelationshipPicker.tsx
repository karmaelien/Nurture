import { clsx } from 'clsx'
import type { Ref } from 'react'
import { useController, useFormContext, useWatch } from 'react-hook-form'
import type { Relationship } from '../../api/types.ts'
import { shortName } from './names.ts'
import { RELATIONSHIPS, type RecipientValues } from './schemas.ts'

type RelationshipChipsProps = {
  /** The name in the legend, "{name} is my…". */
  name: string
  value: Relationship | null
  onChange: (value: Relationship | null) => void
  onBlur?: () => void
  /** The label of the chip that means "no label". */
  noneLabel?: string
  disabled?: boolean
  hint?: string
  /** Receives the first chip, so a form can focus it on a validation error. */
  inputRef?: Ref<HTMLInputElement>
}

/** Chips that complete the sentence "{name} is my…", which makes the direction of the relationship clear. */
export function RelationshipChips({
  name,
  value,
  onChange,
  onBlur,
  noneLabel = 'skip',
  disabled = false,
  hint = 'This label is yours. Others in the circle set their own.',
  inputRef,
}: RelationshipChipsProps) {
  const options: { value: Relationship | null; label: string }[] = [
    ...RELATIONSHIPS.map((value) => ({ value, label: value })),
    { value: null, label: noneLabel },
  ]
  return (
    <fieldset className="grid gap-2.5" disabled={disabled}>
      <legend className="text-small font-semibold text-ink">{name} is my…</legend>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.label} className="relative">
            <input
              type="radio"
              name="relationship"
              value={option.value ?? ''}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              onBlur={onBlur}
              ref={option.value === RELATIONSHIPS[0] ? inputRef : undefined}
              className="peer sr-only"
            />
            <span
              className={clsx(
                'inline-flex h-10 cursor-pointer items-center rounded-full border px-4 text-small font-semibold transition-colors',
                'border-field bg-surface text-ink hover:bg-wash',
                'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground',
                // Keep the selected chip filled while the pointer is over it.
                'peer-checked:hover:border-primary-hover peer-checked:hover:bg-primary-hover',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
                'peer-disabled:cursor-wait',
                option.value === null && 'border-dashed text-muted',
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
      {hint && <p className="text-small text-muted">{hint}</p>}
    </fieldset>
  )
}

/** RelationshipChips bound to `recipient.relationship` in the surrounding form. */
export function RelationshipPicker() {
  const { control } = useFormContext<{ recipient: RecipientValues }>()
  const { field } = useController({ control, name: 'recipient.relationship' })
  const [name, preferredName] = useWatch({ control, name: ['recipient.name', 'recipient.preferredName'] })
  return (
    <RelationshipChips
      name={shortName(name, preferredName)}
      value={field.value}
      onChange={field.onChange}
      onBlur={field.onBlur}
      inputRef={field.ref}
    />
  )
}
