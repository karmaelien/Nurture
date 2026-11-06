import { zodResolver } from '@hookform/resolvers/zod'
import { FormProvider, useForm } from 'react-hook-form'
import { errorMessage } from '../../api/client.ts'
import type { Recipient } from '../../api/types.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useAddRecipient } from './mutations.ts'
import { RecipientFields } from './RecipientFields.tsx'
import { addRecipientFormSchema, emptyRecipient } from './schemas.ts'

type AddRecipientFormProps = {
  circleId: string
  onAdded: (recipient: Recipient) => void
  onCancel: () => void
}

/** Adds one more person to an existing circle. */
export function AddRecipientForm({ circleId, onAdded, onCancel }: AddRecipientFormProps) {
  const addRecipient = useAddRecipient(circleId)
  const form = useForm({
    resolver: zodResolver(addRecipientFormSchema),
    defaultValues: { recipient: emptyRecipient },
  })
  const {
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form

  const onSubmit = handleSubmit(async ({ recipient }) => {
    try {
      onAdded((await addRecipient.mutateAsync(recipient)).recipient)
    } catch (error) {
      setError('root', { message: errorMessage(error) })
    }
  })

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={onSubmit} className="grid gap-5">
        {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}
        <RecipientFields />
        <div className="mt-1 flex gap-3">
          <Button variant="secondary" size="lg" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="lg" loading={isSubmitting} className="flex-1">
            Add person
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
