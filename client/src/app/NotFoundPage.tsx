import { Link } from 'react-router'
import { buttonClasses } from '../components/ui/buttonClasses.ts'
import { Logo } from '../components/ui/Logo.tsx'

export function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <Logo className="mb-8" />
        <h1 className="font-display text-h1 font-bold">This page doesn't exist</h1>
        <p className="mt-2 text-muted">The link may be old or mistyped.</p>
        <Link to="/" className={`${buttonClasses()} mt-6`}>
          Go to the home page
        </Link>
      </div>
    </div>
  )
}
