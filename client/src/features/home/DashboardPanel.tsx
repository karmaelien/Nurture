import { Link } from 'react-router'
import type { ReactNode } from 'react'
import { errorMessage } from '../../api/client.ts'
import { Button } from '../../components/ui/Button.tsx'

export type QueryState = { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }

export function DashboardPanel({
  id,
  title,
  icon,
  to,
  query,
  empty,
  action,
  children,
}: {
  id: string
  title: string
  icon: ReactNode
  to?: string
  query: QueryState
  empty: boolean
  action?: ReactNode
  children: ReactNode
}) {
  const heading = (
    <>
      <h2 id={`${id}-title`} className="font-display text-h3 font-semibold">
        {title}
      </h2>
      <span className="text-primary" aria-hidden>
        {icon}
      </span>
    </>
  )
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="min-w-0 scroll-mt-6 rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      {to ? (
        <Link to={to} className="mb-5 flex items-center justify-between gap-3 rounded-control hover:text-primary">
          {heading}
        </Link>
      ) : (
        <div className="mb-5 flex items-center justify-between gap-3">{heading}</div>
      )}
      {query.isError ? (
        <div role="alert">
          <p>{errorMessage(query.error)}</p>
          <Button variant="secondary" className="mt-3" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      ) : query.isPending ? (
        <p role="status" className="text-muted">
          Loading…
        </p>
      ) : empty ? (
        <p className="text-muted">Nothing to show for this period.</p>
      ) : (
        children
      )}
      {action && <div className="mt-6">{action}</div>}
    </section>
  )
}
