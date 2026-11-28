import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { assistanceApi } from '../../api/assistance.ts'
import type { AssistanceFilters } from '../../api/types.ts'
import { useRequiredSession } from '../auth/session.ts'

export function useAssistanceReports(
  circleId: string,
  recipientId = '',
  status: AssistanceFilters['status'] = 'active',
) {
  const { user } = useRequiredSession()
  const query = useInfiniteQuery({
    queryKey: ['care', user.id, circleId, 'assistance', { recipientId, status }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      assistanceApi.list(circleId, { recipientId: recipientId || undefined, status, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
    refetchOnWindowFocus: true,
  })
  return {
    ...query,
    reports: query.data?.pages.flatMap((page) => page.reports) ?? [],
    resources: query.data?.pages[0]?.resources ?? [],
    totalCount: query.data?.pages[0]?.totalCount ?? 0,
  }
}
export function useRefreshAssistance(circleId: string) {
  const cache = useQueryClient()
  const { user } = useRequiredSession()
  return () => cache.invalidateQueries({ queryKey: ['care', user.id, circleId, 'assistance'] })
}
