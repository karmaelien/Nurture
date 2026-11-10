import { useMutation, useQueryClient } from '@tanstack/react-query'
import { careApi } from '../../api/care.ts'
import type { CreateExpenseRequest, UpdateExpenseRequest } from '../../api/types.ts'
import { useRequiredSession } from '../auth/session.ts'

function useExpenseRefresh(circleId: string) {
  const { user } = useRequiredSession()
  const client = useQueryClient()
  // Includes every date, category, and recipient filter used by the dashboard and expense page.
  return () => client.invalidateQueries({ queryKey: ['care', user.id, circleId, 'expenses'] })
}

export function useCreateExpense(circleId: string) {
  const refresh = useExpenseRefresh(circleId)
  return useMutation({
    mutationFn: (body: CreateExpenseRequest) => careApi.createExpense(circleId, body),
    onSuccess: refresh,
  })
}

export function useUpdateExpense(circleId: string) {
  const refresh = useExpenseRefresh(circleId)
  return useMutation({
    mutationFn: ({ expenseId, body }: { expenseId: string; body: UpdateExpenseRequest }) =>
      careApi.updateExpense(circleId, expenseId, body),
    onSuccess: refresh,
  })
}

export function useDeleteExpense(circleId: string) {
  const refresh = useExpenseRefresh(circleId)
  return useMutation({
    mutationFn: (expenseId: string) => careApi.deleteExpense(circleId, expenseId),
    onSuccess: refresh,
  })
}
