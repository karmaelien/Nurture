import { clsx } from 'clsx'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { buttonClasses } from '../../components/ui/buttonClasses.ts'

/** The page column under the app header: full width for lists, narrow for one person. */
export function PageMain({ narrow = false, children }: { narrow?: boolean; children: ReactNode }) {
  return (
    <main className={clsx('mx-auto w-full px-5 py-8 sm:px-8', narrow ? 'max-w-[640px]' : 'max-w-6xl')}>{children}</main>
  )
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="link inline-flex items-center gap-1.5 text-small">
      <ArrowLeft className="size-4" aria-hidden />
      {children}
    </Link>
  )
}

/** A white card with a small heading, used for each block of a profile. */
export function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-panel border border-line bg-surface p-5 sm:p-6" aria-label={title}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** Shown in place of a page whose circle, person, or caregiver doesn't exist or isn't visible. */
export function NotFoundPanel({ title, backTo, backLabel }: { title: string; backTo: string; backLabel: string }) {
  return (
    <section className="rounded-panel border border-line bg-surface p-6 text-center">
      <h1 className="font-display text-h2 font-bold">{title}</h1>
      <p className="mt-2 text-muted">They may have been removed, or the link is out of date.</p>
      <Link to={backTo} className={clsx(buttonClasses({ variant: 'secondary' }), 'mt-5')}>
        {backLabel}
      </Link>
    </section>
  )
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div role="status" className="grid place-items-center py-16">
      <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  )
}
