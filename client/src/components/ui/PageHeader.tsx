import type { ReactNode } from 'react'

export function PageHeader({ title, description, aside }: { title: string; description: string; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-h1 font-bold">{title}</h1>
        <p className="mt-1 text-muted">{description}</p>
      </div>
      {aside}
    </div>
  )
}
