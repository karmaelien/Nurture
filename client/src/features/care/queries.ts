import { skipToken, useQuery } from '@tanstack/react-query'
import { careApi } from '../../api/care.ts'
import type { AppointmentFilters, ExpenseFilters, MedicationOccurrenceFilters, TaskFilters } from '../../api/types.ts'
import { useRequiredSession } from '../auth/session.ts'

// Scope cached care data to the signed-in user as well as the circle and every filter.
export const careKeys = {
  appointments: (userId: string, circleId: string | null, filters: AppointmentFilters) =>
    ['care', userId, circleId, 'appointments', filters] as const,
  medicationOccurrences: (userId: string, circleId: string | null, filters: MedicationOccurrenceFilters) =>
    ['care', userId, circleId, 'medication-occurrences', filters] as const,
  tasks: (userId: string, circleId: string | null, filters: TaskFilters) =>
    ['care', userId, circleId, 'tasks', filters] as const,
  expenses: (userId: string, circleId: string | null, filters: ExpenseFilters) =>
    ['care', userId, circleId, 'expenses', filters] as const,
}

// Use behind RequireSession. A null circle pauses requests during setup/selection.
// Each hook exposes its own loading, error, and refetch state; no previous-circle placeholder data.
export function useAppointments(circleId: string | null, filters: AppointmentFilters) {
  const { user } = useRequiredSession()
  return useQuery({
    queryKey: careKeys.appointments(user.id, circleId, filters),
    queryFn: circleId ? () => careApi.appointments(circleId, filters) : skipToken,
    select: (data) => data.appointments,
    retry: false,
  })
}

export function useMedicationOccurrences(circleId: string | null, filters: MedicationOccurrenceFilters) {
  const { user } = useRequiredSession()
  return useQuery({
    queryKey: careKeys.medicationOccurrences(user.id, circleId, filters),
    queryFn: circleId ? () => careApi.medicationOccurrences(circleId, filters) : skipToken,
    select: (data) => data.medicationOccurrences,
    retry: false,
  })
}

export function useTasks(circleId: string | null, filters: TaskFilters = {}) {
  const { user } = useRequiredSession()
  return useQuery({
    queryKey: careKeys.tasks(user.id, circleId, filters),
    queryFn: circleId ? () => careApi.tasks(circleId, filters) : skipToken,
    select: (data) => data.tasks,
    retry: false,
  })
}

export function useExpenses(circleId: string | null, filters: ExpenseFilters) {
  const { user } = useRequiredSession()
  return useQuery({
    queryKey: careKeys.expenses(user.id, circleId, filters),
    queryFn: circleId ? () => careApi.expenses(circleId, filters) : skipToken,
    select: (data) => data.expenses,
    retry: false,
  })
}
