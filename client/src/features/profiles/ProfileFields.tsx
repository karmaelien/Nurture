import { useFormContext } from 'react-hook-form'
import { TextField } from '../../components/ui/Field.tsx'
import type { ProfileValues } from './schemas.ts'
import { TimeZoneSelect } from './TimeZoneSelect.tsx'

/**
 * A caregiver's own name, phone, and time zone, inside a form over `ProfileValues`.
 * Shared by setup step 1 and the My profile page.
 */
export function ProfileFields({ initialZone, timeZoneHint }: { initialZone: string; timeZoneHint?: string }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<ProfileValues>()
  return (
    <>
      <TextField label="Your name" autoComplete="name" error={errors.name?.message} {...register('name')} />
      <TextField
        label="Phone"
        optional
        type="tel"
        autoComplete="tel"
        hint="Only people in your care circle can see it."
        error={errors.phone?.message}
        {...register('phone')}
      />
      <TimeZoneSelect
        initialZone={initialZone}
        hint={timeZoneHint}
        error={errors.timeZone?.message}
        {...register('timeZone')}
      />
    </>
  )
}
