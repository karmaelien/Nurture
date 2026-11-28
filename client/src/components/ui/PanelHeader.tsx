import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** Shared dashboard header: linked icon/title at the left, primary actions at the right. */
export function PanelHeader({
  id,
  title,
  icon,
  to,
  action,
  description,
}: {
  id?: string
  title: string
  icon: ReactNode
  to?: string
  action?: ReactNode
  description?: ReactNode
}) {
  const heading = (
    <>
      <span className="shrink-0 text-primary [&>svg]:size-5" aria-hidden>
        {icon}
      </span>
      <h2 id={id} className="font-display text-h3 font-semibold">
        {title}
      </h2>
    </>
  )
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {to ? (
          <Link
            to={to}
            aria-label={`View ${title.toLowerCase()}`}
            className="flex min-w-0 items-center gap-2 rounded-control hover:text-primary"
          >
            {heading}
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-2">{heading}</div>
        )}
        {action && <div className="ml-auto flex shrink-0 flex-wrap items-center gap-3">{action}</div>}
      </div>
      {description && <p className="mt-2 text-small text-muted">{description}</p>}
    </div>
  )
}
