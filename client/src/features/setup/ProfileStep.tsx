import { zodResolver } from '@hookform/resolvers/zod'
import { FormProvider, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { useUpdateProfile } from '../profiles/mutations.ts'
import { deviceTimeZone, profileSchema } from '../profiles/schemas.ts'
import { ProfileFields } from '../profiles/ProfileFields.tsx'

/** Setup step 1: the caregiver's own profile. */
export function ProfileStep() {
  const { user } = useRequiredSession()
  const navigate = useNavigate()
  const updateProfile = useUpdateProfile()
  const initialZone = user.timeZone ?? deviceTimeZone()
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, phone: user.phone ?? '', timeZone: initialZone },
  })
  const {
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form

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

      <FormProvider {...form}>
        <form noValidate onSubmit={onSubmit} className="mt-8 grid gap-5">
          {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}
          <ProfileFields
            initialZone={initialZone}
            timeZoneHint={
              user.timeZone ? undefined : 'We detected this from your device. Times will show in this zone.'
            }
          />
          <Button type="submit" size="lg" loading={isSubmitting} className="mt-1">
            Continue
          </Button>
        </form>
      </FormProvider>
    </>
  )
}
