import { LoaderCircle } from 'lucide-react'
import { Button } from './Button.tsx'

export function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status">
      <LoaderCircle className="size-7 animate-spin text-primary" aria-hidden />
      <span className="sr-only">Loading Nurture</span>
    </div>
  )
}

export function FullPageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="font-display text-h2 font-bold">Nurture didn't load</h1>
        <p className="mt-2 text-muted">{message}</p>
        <Button className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  )
}
