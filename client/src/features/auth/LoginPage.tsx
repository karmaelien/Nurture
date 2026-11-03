import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { PasswordField, TextField } from '../../components/ui/Field.tsx'
import { DEMO_ACCOUNT } from '../../mocks/db.ts'
import { mocksEnabled } from '../../mocks/enabled.ts'
import { loginSchema } from './schemas.ts'
import { useLogin } from './session.ts'

export function LoginPage() {
  const login = useLogin()
  const [params] = useSearchParams()
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values)
    } catch (error) {
      setError('root', { message: errorMessage(error) })
    }
  })

  return (
    <>
      <h1 className="font-display text-h1 font-bold">Log in to Nurture</h1>
      <p className="mt-2 text-muted">
        {params.get('next') ? 'Log in to continue where you left off.' : 'Welcome back.'}
      </p>

      <form noValidate onSubmit={onSubmit} className="mt-8 grid gap-5">
        {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="mt-1">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-muted">
        New to Nurture?{' '}
        <Link to="/register" className="link">
          Create an account
        </Link>
      </p>

      {mocksEnabled && (
        <div className="mt-10 rounded-panel bg-wash p-4 text-small">
          <p className="font-semibold">Demo mode</p>
          <p className="mt-1 text-muted">
            There's no backend yet, so accounts are saved in this browser only. Use the demo account or create your own.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              setValue('email', DEMO_ACCOUNT.email)
              setValue('password', DEMO_ACCOUNT.password)
            }}
          >
            Fill in demo account
          </Button>
        </div>
      )}
    </>
  )
}
