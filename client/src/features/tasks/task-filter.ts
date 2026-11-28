import type { CareTask } from '../../api/types.ts'

/** Shared by the list and calendar so both show the same title/assignment matches. */
export function matchesTask(task: CareTask, search: string, caregiver: string) {
  return (
    task.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (!caregiver ||
      (caregiver === 'unassigned' ? task.assignedCaregiverId === null : task.assignedCaregiverId === caregiver))
  )
}
