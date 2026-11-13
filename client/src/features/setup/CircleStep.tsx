import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { buttonClasses } from '../../components/ui/buttonClasses.ts'
import { TextField } from '../../components/ui/Field.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { useCreateCircle } from '../profiles/mutations.ts'
import { RecipientFields } from '../profiles/RecipientFields.tsx'
import { createCircleSchema, emptyRecipient, suggestCircleName, type CreateCircleValues } from '../profiles/schemas.ts'

const peopleStepPath = (circleId: string) => `/setup/circles/${encodeURIComponent(circleId)}/people`

/**
 * Setup step 2: the first person being cared for, and the circle that will hold their care.
 * Setup only ever creates the first circle, so once one exists (for example after pressing Back
 * from step 3) this step moves on to step 3 instead of offering to create a duplicate.
 */
export function CircleStep() {
  const { circles } = useRequiredSession()
  return circles.length > 0 ? <Navigate to={peopleStepPath(circles[0].id)} replace /> : <CircleForm />
}

function CircleForm() {
  const navigate = useNavigate()
  const createCircle = useCreateCircle()
  const form = useForm({
    resolver: zodResolver(createCircleSchema),
    defaultValues: { name: '', recipient: emptyRecipient },
  })
  const {
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { circle } = await createCircle.mutateAsync(values)
      // Replace step 2 in history so Back from step 3 skips it rather than bouncing off the redirect.
      navigate(peopleStepPath(circle.id), { replace: true })
    } catch (error) {
      setError('root', { message: errorMessage(error) })
    }
  })

  return (
    <>
      <h1 className="font-display text-h1 font-bold">Who are you caring for?</h1>
      <p className="mt-2 text-muted">Start with one person. You can add more next.</p>

      <FormProvider {...form}>
        <form noValidate onSubmit={onSubmit} className="mt-8 grid gap-5">
          {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}
          <RecipientFields />
          <hr className="border-line" />
          <CircleNameField />
          <div className="mt-1 flex gap-3">
            <Link to="/setup" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
              Back
            </Link>
            <Button type="submit" size="lg" loading={isSubmitting} className="flex-1">
              Create care circle
            </Button>
          </div>
        </form>
      </FormProvider>
    </>
  )
}

/**
 * Suggests a circle name from the person's name until the user types their own.
 * A child of the form, so it registers after RecipientFields and errors focus in visual order.
 */
function CircleNameField() {
  const {
    register,
    setValue,
    control,
    formState: { errors, isSubmitted },
  } = useFormContext<CreateCircleValues>()
  const [nameEdited, setNameEdited] = useState(false)
  const recipientName = useWatch({ control, name: 'recipient.name' })
  useEffect(() => {
    // After a failed submit, revalidate so a stale "Name your care circle." error clears.
    if (!nameEdited) setValue('name', suggestCircleName(recipientName), { shouldValidate: isSubmitted })
  }, [isSubmitted, nameEdited, recipientName, setValue])

  return (
    <TextField
      label="Name your care circle"
      autoComplete="off"
      hint="Everyone you invite later will share this space."
      error={errors.name?.message}
      {...register('name', { onChange: () => setNameEdited(true) })}
    />
  )
}
