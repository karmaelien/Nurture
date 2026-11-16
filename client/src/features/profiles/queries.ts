import { useQuery } from '@tanstack/react-query'
import { circlesApi } from '../../api/circles.ts'
import { useRequiredSession } from '../auth/session.ts'

/** Circle details are cached per user, so switching accounts never shows the previous user's view. */
export const circleDetailKey = (userId: string, circleId: string) => ['circle', userId, circleId]

/** Everyone in a circle: its recipients with your labels, and its members with theirs. */
export function useCircleDetail(circleId: string, { enabled = true } = {}) {
  const { user } = useRequiredSession()
  return useQuery({
    queryKey: circleDetailKey(user.id, circleId),
    // Same key and response shape as the dashboard's query, so the two share one cache entry.
    queryFn: () => circlesApi.detail(circleId),
    select: (data) => data.circle,
    enabled,
    retry: false,
  })
}
