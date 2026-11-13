import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { TextField } from '../../components/ui/Field.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { useUpdateProfile } from '../profiles/mutations.ts'
import { deviceTimeZone, profileSchema } from '../profiles/schemas.ts'
import { TimeZoneSelect } from '../profiles/TimeZoneSelect.tsx'

/** Setup step 1: the caregiver's own profile. */
export function ProfileStep() {
  const { user } = useRequiredSession()
  const navigate = useNavigate()
  const updateProfile = useUpdateProfile()
  const initialZone = user.timeZone ?? deviceTimeZone()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, phone: user.phone ?? '', timeZone: initialZone },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await updateProfile.mutateAsync(values)
      navigate('/setup/circle')
    } catch (error) {
      setError('root', { message: errorMessage(error) })
    }
  })

  return (
    <>
      <h1 className="font-display text-h1 font-bold">Tell us about you</h1>
      <p className="mt-2 text-muted">Your family will see this so they know how to reach you.</p>

      <form noValidate onSubmit={onSubmit} className="mt-8 grid gap-5">
        {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}
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
          hint={user.timeZone ? undefined : 'We detected this from your device. Times will show in this zone.'}
          error={errors.timeZone?.message}
          {...register('timeZone')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="mt-1">
          Continue
        </Button>
      </form>
    </>
  )
}
