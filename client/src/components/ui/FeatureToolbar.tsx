import type { ReactNode } from 'react'

/** One control row for collection pages: filters first, primary actions at the right. */
export function FeatureToolbar({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      {children && <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{children}</div>}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  )
}
