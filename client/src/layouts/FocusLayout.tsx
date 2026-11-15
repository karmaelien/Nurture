import type { ReactNode } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { Logo } from '../components/ui/Logo.tsx'
import { useLogout } from '../features/auth/session.ts'

/** A quiet frame for one focused task, such as setup or adding a person: logo, log out, and a narrow column. */
export function FocusLayout({ children }: { children: ReactNode }) {
  const logout = useLogout()
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Logo />
          <Button variant="ghost" size="sm" loading={logout.isPending} onClick={() => logout.mutate()}>
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[560px] px-4 py-10 sm:px-8 sm:py-14">{children}</main>
    </div>
  )
}
