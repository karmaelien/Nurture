import type { ReactNode } from 'react'
import { statusBadgeClasses, type StatusTone } from './statusStyles.ts'

export function StatusBadge({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  return <span className={statusBadgeClasses(tone)}>{children}</span>
}
