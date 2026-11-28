import { PanelHeader } from '../../components/ui/PanelHeader.tsx'
import type { ReactNode } from 'react'
import { QueryFeedback, type QueryState } from '../../components/ui/QueryFeedback.tsx'
export type { QueryState } from '../../components/ui/QueryFeedback.tsx'

export function DashboardPanel({
  id,
  title,
  icon,
  to,
  query,
  empty,
  action,
  description,
  children,
}: {
  id: string
  title: string
  icon: ReactNode
  to?: string
  query: QueryState
  empty: boolean
  action?: ReactNode
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="min-w-0 scroll-mt-6 rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <PanelHeader id={`${id}-title`} title={title} icon={icon} to={to} action={action} description={description} />
      {query.isError || query.isPending ? (
        <QueryFeedback query={query} />
      ) : empty ? (
        <p className="text-muted">Nothing to show for this period.</p>
      ) : (
        children
      )}
    </section>
  )
}
