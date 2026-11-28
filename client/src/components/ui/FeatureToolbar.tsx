import { Button } from './Button.tsx'
import type { ReactNode } from 'react'

/** One control row for collection pages: filters first, primary actions at the right. */
export function FeatureToolbar({
  children,
  actions,
  onClear,
}: {
  children?: ReactNode
  actions?: ReactNode
  onClear?: () => void
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      {(children || onClear) && (
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3 [&>div]:max-w-48">
          {children}
          {onClear && (
            <Button variant="secondary" onClick={onClear}>
              Clear filters
            </Button>
          )}
        </div>
      )}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  )
}
