import { useState, type ReactNode } from 'react'
import { Alert } from './Alert.tsx'
import { Button } from './Button.tsx'
import { FormDialog } from './FormDialog.tsx'
import { statusColors, warningPanelClasses, type StatusTone } from './statusStyles.ts'

export type AttentionItem = {
  id: string
  label: string
  count: number
  title: string
  tone: StatusTone
  partial?: boolean
  loading?: boolean
  error?: string
  retry?: () => void
  retryLabel?: string
  ariaLabel?: string
  content: (close: () => void) => ReactNode
}

/** Every page uses count buttons and this same popup, never an inline detail list. */
export function AttentionNeeded({
  items,
  scope,
  label = 'Attention Needed',
  className = '',
  children,
}: {
  items: AttentionItem[]
  scope: string
  label?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <section aria-label={label} className={`${warningPanelClasses()} ${className}`}>
      <h2 className="font-display text-h3 font-semibold">Attention Needed</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        {items.map((item) => (
          <AttentionRow key={JSON.stringify([scope, item.id, item.loading, !!item.error])} item={item} />
        ))}
      </div>
      {children}
    </section>
  )
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <div className="min-w-0 flex-1 basis-52">
      <button
        type="button"
        aria-haspopup="dialog"
        disabled={item.loading || !!item.error}
        aria-label={
          item.error
            ? `${item.label} unavailable`
            : item.loading
              ? `Loading ${item.label}`
              : (item.ariaLabel ?? `${item.partial ? 'At least ' : ''}${item.count} ${item.label}`)
        }
        onClick={() => setOpen(true)}
        className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-control border px-3.5 py-3 text-left transition-colors disabled:cursor-default focus-visible:outline-2 focus-visible:outline-primary ${statusColors[item.count && !item.error && !item.loading ? item.tone : 'neutral']} ${item.tone === 'danger' && item.count ? 'hover:bg-danger/15' : item.tone === 'warning' && item.count ? 'hover:bg-warning/15' : 'hover:bg-wash'}`}
      >
        <span className="text-small capitalize">{item.label}</span>
        <span
          className={`font-display text-h3 font-semibold ${item.count && !item.error && !item.loading ? (item.tone === 'danger' ? 'text-danger' : item.tone === 'warning' ? 'text-warning' : '') : ''}`}
        >
          {item.error ? 'Unavailable' : item.loading ? '…' : `${item.partial ? 'At least ' : ''}${item.count}`}
        </span>
      </button>
      {item.error && (
        <div className="mt-2">
          <Alert tone="danger">
            {item.error}{' '}
            {item.retry && (
              <Button variant="secondary" onClick={item.retry}>
                {item.retryLabel ?? `Retry ${item.label}`}
              </Button>
            )}
          </Alert>
        </div>
      )}
      {open && (
        <FormDialog title={item.title} onClose={close}>
          <div className="max-h-[28rem] overflow-y-auto pr-2">{item.content(close)}</div>
        </FormDialog>
      )}
    </div>
  )
}
