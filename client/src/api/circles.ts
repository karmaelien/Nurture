import { request } from './client.ts'
import type { CircleDetail, CircleSummary, CreateCircleRequest, Recipient, RecipientInput } from './types.ts'

const circlePath = (circleId: string) => `/api/circles/${encodeURIComponent(circleId)}`

export const circlesApi = {
  detail: (circleId: string) => request<{ circle: CircleDetail }>(circlePath(circleId)),
  create: (body: CreateCircleRequest) => request<{ circle: CircleSummary }>('/api/circles', { method: 'POST', body }),
  addRecipient: (circleId: string, body: RecipientInput) =>
    request<{ recipient: Recipient }>(`${circlePath(circleId)}/recipients`, { method: 'POST', body }),
}
