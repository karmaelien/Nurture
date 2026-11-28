import type { CareTask } from '../../api/types.ts'

export const taskReminderMinutes = 60

/** A deadline is due now at equality, overdue afterward; undated/completed tasks never alert. */
export function taskAttention(task: CareTask, now: number): 'overdue' | 'soon' | null {
  if (task.status !== 'pending' || !task.dueAt) return null
  const difference = Date.parse(task.dueAt) - now
  if (difference < 0) return 'overdue'
  return difference <= taskReminderMinutes * 60_000 ? 'soon' : null
}
