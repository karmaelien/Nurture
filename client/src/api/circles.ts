import { request } from './client.ts'
import type {
  CircleDetail,
  CircleSummary,
  CreateCircleRequest,
  Recipient,
  RecipientInput,
  Relationship,
  UpdateRecipientRequest,
} from './types.ts'

const circlePath = (circleId: string) => `/api/circles/${encodeURIComponent(circleId)}`
const recipientPath = (circleId: string, recipientId: string) =>
  `${circlePath(circleId)}/recipients/${encodeURIComponent(recipientId)}`

export const circlesApi = {
  detail: (circleId: string) => request<{ circle: CircleDetail }>(circlePath(circleId)),
  create: (body: CreateCircleRequest) => request<{ circle: CircleSummary }>('/api/circles', { method: 'POST', body }),
  addRecipient: (circleId: string, body: RecipientInput) =>
    request<{ recipient: Recipient }>(`${circlePath(circleId)}/recipients`, { method: 'POST', body }),
  updateRecipient: (circleId: string, recipientId: string, body: UpdateRecipientRequest) =>
    request<{ recipient: Recipient }>(recipientPath(circleId, recipientId), { method: 'PATCH', body }),
  setRelationship: (circleId: string, recipientId: string, relationship: Relationship | null) =>
    request<{ recipient: Recipient }>(`${recipientPath(circleId, recipientId)}/relationship`, {
      method: 'PUT',
      body: { relationship },
    }),
}
