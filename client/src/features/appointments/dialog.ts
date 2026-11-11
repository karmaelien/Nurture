import type { MouseEvent } from 'react'

// Native dialog backdrop clicks target the dialog itself; padding clicks do too, so check the bounds.
export function closeOnBackdropClick(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return
  const bounds = event.currentTarget.getBoundingClientRect()
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  ) {
    event.currentTarget.close()
  }
}
