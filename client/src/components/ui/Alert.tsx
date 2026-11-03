import { clsx } from 'clsx'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

type Tone = 'danger' | 'warning' | 'success' | 'info'

const tones: Record<Tone, { box: string; icon: string; Icon: typeof Info }> = {
  danger: { box: 'border-danger/30 bg-danger/8', icon: 'text-danger', Icon: CircleAlert },
  warning: { box: 'border-warning/30 bg-warning/8', icon: 'text-warning', Icon: TriangleAlert },
  success: { box: 'border-success/30 bg-success/8', icon: 'text-success', Icon: CircleCheck },
  info: { box: 'border-info/30 bg-info/8', icon: 'text-info', Icon: Info },
}

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const { box, icon, Icon } = tones[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={clsx('flex gap-3 rounded-control border px-3.5 py-3 text-small text-ink', box)}
    >
      <Icon className={clsx('mt-0.5 size-[18px] flex-none', icon)} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
