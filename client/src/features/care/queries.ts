import { skipToken, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { careApi } from '../../api/care.ts'
import type { AppointmentFilters, ExpenseFilters, MedicationOccurrenceFilters, TaskFilters } from '../../api/types.ts'
import { useRequiredSession } from '../auth/session.ts'

// Scope cached care data to the signed-in user as well as the circle and every filter.
export const careKeys = {
  medications: (userId: string, circleId: string | null) => ['care', userId, circleId, 'medications'] as const,
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

export function useMedications(circleId: string | null) {
  const { user } = useRequiredSession()
  return useQuery({
    queryKey: careKeys.medications(user.id, circleId),
    queryFn: circleId ? () => careApi.medications(circleId) : skipToken,
    select: (data) => data.medications,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: false,
  })
}

export function useMedicationOccurrences(circleId: string | null, filters: MedicationOccurrenceFilters) {
  const { user } = useRequiredSession()
  return useQuery({
    queryKey: careKeys.medicationOccurrences(user.id, circleId, filters),
    queryFn: circleId ? () => careApi.medicationOccurrences(circleId, filters) : skipToken,
    select: (data) => data.medicationOccurrences,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: false,
  })
}

export function useOverdueMedicationDoses(circleId: string, before: string, recipientId?: string) {
  const { user } = useRequiredSession()
  const query = useInfiniteQuery({
    queryKey: ['care', user.id, circleId, 'medication-occurrences', { overdueBefore: before, recipientId }],
    queryFn: ({ pageParam }) => careApi.overdueMedicationDoses(circleId, before, recipientId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
    refetchOnWindowFocus: true,
    // Continue bounded history work while keeping each request and displayed page small.
    refetchInterval: (query) => (query.state.data?.pages.at(-1)?.historyPending ? 1000 : 60_000),
  })
  return {
    ...query,
    data: query.data?.pages.flatMap((page) => page.medicationOccurrences),
    // Each page can finish another history batch; its summary supersedes older pages.
    historyPending: query.data?.pages.at(-1)?.historyPending ?? false,
    totalOverdueCount: query.data?.pages.at(-1)?.totalOverdueCount,
  }
}

export function useTasks(circleId: string | null, filters: TaskFilters = {}) {
  const { user } = useRequiredSession()
  return useQuery({
    queryKey: careKeys.tasks(user.id, circleId, filters),
    queryFn: circleId ? () => careApi.tasks(circleId, filters) : skipToken,
    select: (data) => data.tasks,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
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
