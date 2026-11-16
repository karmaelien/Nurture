import { useFormContext, useWatch } from 'react-hook-form'
import { TextAreaField, TextField } from '../../components/ui/Field.tsx'
import { RelationshipPicker } from './RelationshipPicker.tsx'
import { MAX_NOTES_LENGTH, todayDate, type RecipientValues } from './schemas.ts'

/**
 * The fields that describe one person being cared for. Renders inside any form whose values
 * nest them under `recipient`, so setup, adding a person, and editing one share one form.
 * Editing leaves out the relationship, which the profile page saves on its own.
 */
export function RecipientFields({ withRelationship = true }: { withRelationship?: boolean }) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<{ recipient: RecipientValues }>()
  const notes = useWatch({ control, name: 'recipient.notes' }) ?? ''
  const fieldErrors = errors.recipient

  return (
    <div className="grid gap-5">
      <TextField
        label="Full name"
        autoComplete="off"
        error={fieldErrors?.name?.message}
        {...register('recipient.name')}
      />
      <TextField
        label="Preferred name"
        optional
        autoComplete="off"
        hint="What the family calls them, like “Grandma Rose”."
        error={fieldErrors?.preferredName?.message}
        {...register('recipient.preferredName')}
      />
      <TextField
        label="Date of birth"
        optional
        type="date"
        min="1900-01-01"
        max={todayDate()}
        error={fieldErrors?.dateOfBirth?.message}
        {...register('recipient.dateOfBirth')}
      />
      {withRelationship && <RelationshipPicker />}
      <TextAreaField
        label="Notes"
        optional
        maxLength={MAX_NOTES_LENGTH}
        hint={
          <span className="flex justify-between gap-4">
            <span>Anything the family should know. Not for medical records.</span>
            <span className="whitespace-nowrap tabular-nums">
              {notes.length} / {MAX_NOTES_LENGTH}
            </span>
          </span>
        }
        error={fieldErrors?.notes?.message}
        {...register('recipient.notes')}
      />
    </div>
  )
}
