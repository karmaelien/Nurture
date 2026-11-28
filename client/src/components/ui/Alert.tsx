import { clsx } from 'clsx'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { statusColors } from './statusStyles.ts'

type Tone = 'danger' | 'warning' | 'success' | 'info'

const tones: Record<Tone, { box: string; icon: string; Icon: typeof Info }> = {
  danger: { box: statusColors.danger, icon: 'text-danger', Icon: CircleAlert },
  warning: { box: statusColors.warning, icon: 'text-warning', Icon: TriangleAlert },
  success: { box: statusColors.positive, icon: 'text-primary', Icon: CircleCheck },
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
