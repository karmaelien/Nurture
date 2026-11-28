import type { CareTask } from '../../api/types.ts'

export const compareTasks = (a: CareTask, b: CareTask) =>
  Number(a.status === 'completed') - Number(b.status === 'completed') ||
  (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) ||
  a.title.localeCompare(b.title) ||
  a.id.localeCompare(b.id)
