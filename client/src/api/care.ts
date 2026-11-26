import { request } from './client.ts'
import type {
  CreateExpenseRequest,
  UpdateExpenseRequest,
  Appointment,
  AppointmentCompletionStatus,
  AppointmentInput,
  AppointmentFilters,
  CareTask,
  Expense,
  ExpenseFilters,
  MedicationOccurrence,
  Medication,
  MedicationInput,
  MedicationUpdate,
  MedicationOccurrenceFilters,
  TaskFilters,
  TaskInput,
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
  createAppointment: (circleId: string, body: AppointmentInput) =>
    request<{ appointment: Appointment }>(resourcePath(circleId, 'appointments', {}), { method: 'POST', body }),
  updateAppointment: (circleId: string, appointmentId: string, body: AppointmentInput) =>
    request<{ appointment: Appointment }>(
      resourcePath(circleId, `appointments/${encodeURIComponent(appointmentId)}`, {}),
      {
        method: 'PATCH',
        body,
      },
    ),
  deleteAppointment: (circleId: string, appointmentId: string) =>
    request<void>(resourcePath(circleId, `appointments/${encodeURIComponent(appointmentId)}`, {}), {
      method: 'DELETE',
    }),
  updateAppointmentStatus: (circleId: string, appointmentId: string, status: AppointmentCompletionStatus) =>
    request<{ appointment: Appointment }>(
      resourcePath(circleId, `appointments/${encodeURIComponent(appointmentId)}`, {}),
      {
        method: 'PATCH',
        body: { status },
      },
    ),
  medications: (circleId: string) => request<{ medications: Medication[] }>(resourcePath(circleId, 'medications', {})),
  createMedication: (circleId: string, body: MedicationInput) =>
    request<{ medication: Medication }>(resourcePath(circleId, 'medications', {}), { method: 'POST', body }),
  updateMedication: (circleId: string, medicationId: string, body: MedicationUpdate) =>
    request<{ medication: Medication }>(resourcePath(circleId, `medications/${encodeURIComponent(medicationId)}`, {}), {
      method: 'PATCH',
      body,
    }),
  stopMedication: (circleId: string, medicationId: string, version: number) =>
    request<{ medication: Medication }>(
      resourcePath(circleId, `medications/${encodeURIComponent(medicationId)}/stop`, {}),
      {
        method: 'POST',
        body: { version },
      },
    ),
  deleteMedication: (circleId: string, medicationId: string, version: number) =>
    request<void>(resourcePath(circleId, `medications/${encodeURIComponent(medicationId)}`, {}), {
      method: 'DELETE',
      body: { version },
    }),
  medicationOccurrences: (circleId: string, filters: MedicationOccurrenceFilters) =>
    request<{ medicationOccurrences: MedicationOccurrence[] }>(
      resourcePath(circleId, 'medication-occurrences', filters),
    ),
  updateMedicationDose: (
    circleId: string,
    occurrenceId: string,
    status: MedicationOccurrence['status'],
    version: number,
  ) =>
    request<{ medicationOccurrence: MedicationOccurrence }>(
      resourcePath(circleId, `medication-occurrences/${encodeURIComponent(occurrenceId)}`, {}),
      { method: 'PATCH', body: { status, version } },
    ),
  overdueMedicationDoses: (circleId: string, before: string, recipientId?: string, cursor?: string) =>
    request<{
      medicationOccurrences: MedicationOccurrence[]
      historyPending?: boolean
      nextCursor?: string | null
      totalOverdueCount?: number
    }>(resourcePath(circleId, 'medication-occurrences/overdue', { before, recipientId, cursor })),
  tasks: (circleId: string, filters: TaskFilters = {}) =>
    request<{ tasks: CareTask[] }>(resourcePath(circleId, 'tasks', filters)),
  createTask: (circleId: string, body: TaskInput) =>
    request<{ task: CareTask }>(resourcePath(circleId, 'tasks', {}), { method: 'POST', body }),
  updateTask: (circleId: string, taskId: string, body: TaskInput & { version: number }) =>
    request<{ task: CareTask }>(resourcePath(circleId, `tasks/${encodeURIComponent(taskId)}`, {}), {
      method: 'PATCH',
      body,
    }),
  updateTaskStatus: (circleId: string, taskId: string, status: CareTask['status'], version: number) =>
    request<{ task: CareTask }>(resourcePath(circleId, `tasks/${encodeURIComponent(taskId)}`, {}), {
      method: 'PATCH',
      body: { status, version },
    }),
  expenses: (circleId: string, filters: ExpenseFilters) =>
    request<{ expenses: Expense[] }>(resourcePath(circleId, 'expenses', filters)),
}
