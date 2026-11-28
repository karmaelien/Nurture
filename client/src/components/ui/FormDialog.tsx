import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button.tsx'
import { closeOnBackdropClick } from '../../features/appointments/dialog.ts'

/** Shared form shell; a pending write cannot be dismissed by any close mechanism. */
export function FormDialog({
  title,
  children,
  busy = false,
  onClose,
}: {
  title: string
  children: ReactNode
  busy?: boolean
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.showModal()
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault()
      }}
      onClick={(event) => {
        if (!busy) closeOnBackdropClick(event)
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-panel border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id={heading} className="font-display text-h2 font-semibold">
          {title}
        </h2>
        <Button variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>
          Close
        </Button>
      </div>
      {children}
    </dialog>
  )
}
