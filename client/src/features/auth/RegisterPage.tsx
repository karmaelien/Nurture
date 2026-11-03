import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { ApiError, errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { PasswordField, TextField } from '../../components/ui/Field.tsx'
import { MIN_PASSWORD_LENGTH, registerSchema } from './schemas.ts'
import { useRegister } from './session.ts'

function passwordHint(length: number) {
  if (length === 0) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  if (length < MIN_PASSWORD_LENGTH) {
    const remaining = MIN_PASSWORD_LENGTH - length
    return `${remaining} more ${remaining === 1 ? 'character' : 'characters'} needed.`
  }
  return 'Long enough.'
}

export function RegisterPage() {
  const registerAccount = useRegister()
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(registerSchema), defaultValues: { name: '', email: '', password: '' } })

  const password = useWatch({ control, name: 'password' })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerAccount.mutateAsync(values)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'email_taken') {
        setError('email', { type: 'server', message: error.message }, { shouldFocus: true })
      } else {
        setError('root', { message: errorMessage(error) })
      }
    }
  })

  return (
    <>
      <h1 className="font-display text-h1 font-bold">Create your account</h1>
      <p className="mt-2 text-muted">Set up a shared space for your family's caregiving.</p>

      <form noValidate onSubmit={onSubmit} className="mt-8 grid gap-5">
        {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}
        <TextField label="Your name" autoComplete="name" error={errors.name?.message} {...register('name')} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          error={errors.password?.message}
          hint={passwordHint(password.length)}
          {...register('password')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="mt-1">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-muted">
        Already have an account?{' '}
        <Link to="/login" className="link">
          Log in
        </Link>
      </p>
    </>
  )
}
