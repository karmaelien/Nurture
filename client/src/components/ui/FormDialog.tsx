import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { Button } from './Button.tsx'
import { closeOnBackdropClick } from '../../features/appointments/dialog.ts'

/** Shared form shell; a pending write cannot be dismissed by any close mechanism. */
export function FormDialog({
  title,
  children,
  busy = false,
  onClose,
  dialogRef,
  titleId,
  descriptionId,
  isBusy,
  open = true,
}: {
  title: string
  children: ReactNode
  busy?: boolean
  onClose: () => void
  dialogRef?: RefObject<HTMLDialogElement | null>
  titleId?: string
  descriptionId?: string
  isBusy?: () => boolean
  open?: boolean
}) {
  const ownDialog = useRef<HTMLDialogElement>(null)
  const dialog = dialogRef ?? ownDialog
  const generatedHeading = useId()
  const heading = titleId ?? generatedHeading
  const blocked = () => busy || !!isBusy?.()
  useEffect(() => {
    const element = dialog.current
    if (!open) {
      if (element?.open) element.close()
      return
    }
    const previous = document.activeElement
    if (!element?.open) element?.showModal()
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [dialog, open])
  return (
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      aria-describedby={descriptionId}
      onClose={onClose}
      onCancel={(event) => {
        if (blocked()) event.preventDefault()
      }}
      onClick={(event) => {
        if (!blocked()) closeOnBackdropClick(event)
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-panel border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id={heading} className="font-display text-h2 font-semibold">
          {title}
        </h2>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (!blocked()) dialog.current?.close()
          }}
        >
          Close
        </Button>
      </div>
      {children}
    </dialog>
  )
}
