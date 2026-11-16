import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronRight } from 'lucide-react'
import { FormProvider, useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useLogout, useRequiredSession } from '../auth/session.ts'
import { linkCardClasses } from './cardClasses.ts'
import { useUpdateProfile } from './mutations.ts'
import { profilePaths } from './paths.ts'
import { PageMain, ProfileSection } from './ProfilePageParts.tsx'
import { ProfileFields } from './ProfileFields.tsx'
import { deviceTimeZone, profileSchema } from './schemas.ts'

/** Your own caregiver profile: what everyone in your circles sees, plus your account. */
export function MyProfilePage() {
  const { user, circles } = useRequiredSession()
  const updateProfile = useUpdateProfile()
  const logout = useLogout()
  const initialZone = user.timeZone ?? deviceTimeZone()
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, phone: user.phone ?? '', timeZone: initialZone },
  })
  const {
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful, isDirty },
  } = form

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { user: saved } = await updateProfile.mutateAsync(values)
      // Start again from what was saved, so the form reads as unchanged.
      reset({ name: saved.name, phone: saved.phone ?? '', timeZone: saved.timeZone ?? initialZone })
    } catch (error) {
      setError('root', { message: errorMessage(error) })
    }
  })

  return (
    <PageMain narrow>
      <h1 className="font-display text-h1 font-bold">My profile</h1>
      <p className="mt-2 text-muted">People in your care circles see these details.</p>

      <FormProvider {...form}>
        <form noValidate onSubmit={onSubmit} className="mt-8 grid gap-5">
          {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}
          <ProfileFields
            initialZone={initialZone}
            timeZoneHint={
              user.timeZone ? undefined : 'We detected this from your device. Save to share it with your circle.'
            }
          />
          <div className="mt-1 flex flex-wrap items-center gap-4">
            <Button type="submit" size="lg" loading={isSubmitting}>
              Save changes
            </Button>
            <p role="status" className="text-small text-success">
              {isSubmitSuccessful && !isDirty && !errors.root ? 'Saved.' : ''}
            </p>
          </div>
        </form>
      </FormProvider>

      <div className="mt-10 grid gap-4">
        <ProfileSection title="Your care circles">
          <ul className="grid gap-2">
            {circles.map((circle) => (
              <li key={circle.id}>
                <Link to={profilePaths.family(circle.id)} className={`${linkCardClasses} py-3`}>
                  <span className="min-w-0 truncate font-semibold">{circle.name}</span>
                  <span className="rounded-full bg-sage px-2 py-0.5 text-[12px] leading-4 font-semibold text-primary">
                    {circle.role === 'owner' ? 'Owner' : 'Member'}
                  </span>
                  <ChevronRight className="ml-auto size-5 flex-none text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </ProfileSection>
        <ProfileSection title="Account">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 break-words">
              <span className="text-muted">Signed in as </span>
              {user.email}
            </p>
            <Button variant="secondary" loading={logout.isPending} onClick={() => logout.mutate()}>
              Log out
            </Button>
          </div>
        </ProfileSection>
      </div>
    </PageMain>
  )
}
