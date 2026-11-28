export type StatusTone = 'neutral' | 'danger' | 'warning' | 'positive'

// One semantic palette for warnings, status labels, and calendar blocks.
export const statusColors: Record<StatusTone, string> = {
  neutral: 'border-line bg-surface',
  danger: 'border-danger/30 bg-danger/8',
  warning: 'border-warning/30 bg-warning/8',
  positive: 'border-primary/30 bg-primary/8',
}
export const warningPanelClasses = (tone: StatusTone = 'neutral') => `rounded-panel border p-4 ${statusColors[tone]}`

export const statusBadgeClasses = (tone: StatusTone = 'neutral') =>
  `inline-flex items-center rounded-control border px-2.5 py-1 text-small font-medium ${statusColors[tone]} ${tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'positive' ? 'text-primary' : 'text-muted'}`

export const calendarBlockClasses = (overdue: boolean, completed: boolean) =>
  `w-full cursor-pointer overflow-hidden rounded-control border px-1.5 py-1 text-left text-small leading-4 transition-colors ${overdue ? 'border-danger bg-danger/8 text-danger hover:bg-danger/15' : 'border-transparent bg-wash text-ink hover:bg-sage'} ${completed ? 'line-through' : ''}`
