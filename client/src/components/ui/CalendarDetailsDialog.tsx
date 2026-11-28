import type { ReactNode, RefObject } from 'react'
import { FormDialog } from './FormDialog.tsx'

/** Shared calendar detail layout: heading/close, date and person, Add, then bounded content. */
export function CalendarDetailsDialog({
  title,
  open,
  dialogRef,
  date,
  scope,
  action,
  onClose,
  children,
}: {
  title: string
  open: boolean
  dialogRef: RefObject<HTMLDialogElement | null>
  date?: Date
  scope: string
  action?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  return (
    <FormDialog title={title} open={open} dialogRef={dialogRef} onClose={onClose}>
      {date && (
        <p className="mb-4 text-muted">
          {date.toLocaleDateString(undefined, { dateStyle: 'full' })} · {scope}
        </p>
      )}
      {action && <div className="mb-4">{action}</div>}
      <div className="max-h-96 overflow-y-auto pr-2">{children}</div>
    </FormDialog>
  )
}
