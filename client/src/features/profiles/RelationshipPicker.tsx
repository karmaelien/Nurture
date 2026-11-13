import { clsx } from 'clsx'
import { useController, useFormContext, useWatch } from 'react-hook-form'
import type { Relationship } from '../../api/types.ts'
import { RELATIONSHIPS, type RecipientValues } from './schemas.ts'

const options: { value: Relationship | null; label: string }[] = [
  ...RELATIONSHIPS.map((value) => ({ value, label: value })),
  { value: null, label: 'skip' },
]

/** What to call the person in the question: their preferred name, else their first name. */
function shortName(name: string, preferredName: string | null | undefined) {
  return preferredName?.trim() || name.trim().split(/\s+/)[0] || 'This person'
}

/** Chips that complete the sentence "{name} is my…", which makes the direction of the relationship clear. */
export function RelationshipPicker() {
  const { control } = useFormContext<{ recipient: RecipientValues }>()
  const { field } = useController({ control, name: 'recipient.relationship' })
  const [name, preferredName] = useWatch({ control, name: ['recipient.name', 'recipient.preferredName'] })

  return (
    <fieldset className="grid gap-2.5">
      <legend className="text-small font-semibold text-ink">{shortName(name, preferredName)} is my…</legend>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.label} className="relative">
            <input
              type="radio"
              name={field.name}
              value={option.value ?? ''}
              checked={field.value === option.value}
              onChange={() => field.onChange(option.value)}
              onBlur={field.onBlur}
              ref={option.value === RELATIONSHIPS[0] ? field.ref : undefined}
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
                option.value === null && 'border-dashed text-muted',
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
      <p className="text-small text-muted">This label is yours. Others in the circle set their own.</p>
    </fieldset>
  )
}
