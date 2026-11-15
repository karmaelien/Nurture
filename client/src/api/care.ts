import { request } from './client.ts'
import type {
  CreateExpenseRequest,
  UpdateExpenseRequest,
  Appointment,
  AppointmentFilters,
  CareTask,
  Expense,
  ExpenseFilters,
  MedicationOccurrence,
  MedicationOccurrenceFilters,
  TaskFilters,
} from './types.ts'

function resourcePath(circleId: string, resource: string, filters: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) query.set(key, value)
  }
  const suffix = query.size ? `?${query}` : ''
  return `/api/circles/${encodeURIComponent(circleId)}/${resource}${suffix}`
}

export const careApi = {
  createExpense: (circleId: string, body: CreateExpenseRequest) =>
    request<{ expense: Expense }>(resourcePath(circleId, 'expenses', {}), { method: 'POST', body }),
  updateExpense: (circleId: string, expenseId: string, body: UpdateExpenseRequest) =>
    request<{ expense: Expense }>(resourcePath(circleId, `expenses/${encodeURIComponent(expenseId)}`, {}), {
      method: 'PATCH',
      body,
    }),
  deleteExpense: (circleId: string, expenseId: string) =>
    request<void>(resourcePath(circleId, `expenses/${encodeURIComponent(expenseId)}`, {}), { method: 'DELETE' }),
  appointments: (circleId: string, filters: AppointmentFilters) =>
    request<{ appointments: Appointment[] }>(resourcePath(circleId, 'appointments', filters)),
  medicationOccurrences: (circleId: string, filters: MedicationOccurrenceFilters) =>
    request<{ medicationOccurrences: MedicationOccurrence[] }>(
      resourcePath(circleId, 'medication-occurrences', filters),
    ),
  tasks: (circleId: string, filters: TaskFilters = {}) =>
    request<{ tasks: CareTask[] }>(resourcePath(circleId, 'tasks', filters)),
  expenses: (circleId: string, filters: ExpenseFilters) =>
    request<{ expenses: Expense[] }>(resourcePath(circleId, 'expenses', filters)),
}
