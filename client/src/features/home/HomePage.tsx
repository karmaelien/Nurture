import { Button } from '../../components/ui/Button.tsx'
import { Logo } from '../../components/ui/Logo.tsx'
import { useLogout, useRequiredSession } from '../auth/session.ts'

/** A deliberately minimal page after logging in, until the app's real features are built. */
export function HomePage() {
  const { user } = useRequiredSession()
  const logout = useLogout()
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <Logo className="mb-8" />
        <h1 className="font-display text-h1 font-bold">You're logged in</h1>
        <p className="mt-2 text-muted">
          Signed in as {user.name} ({user.email}).
        </p>
        <Button variant="secondary" className="mt-6" loading={logout.isPending} onClick={() => logout.mutate()}>
          Log out
        </Button>
      </div>
    </main>
  )
}
