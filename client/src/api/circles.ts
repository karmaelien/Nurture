import { request } from './client.ts'
import type { CircleDetail } from './types.ts'

export const circlesApi = {
  detail: (circleId: string) => request<{ circle: CircleDetail }>(`/api/circles/${encodeURIComponent(circleId)}`),
}
