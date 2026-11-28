import { request } from './client.ts'
import type {
  AssistanceFilters,
  AssistanceInput,
  AssistanceReport,
  AssistanceResource,
  AssistanceResponse,
} from './types.ts'

const path = (circleId: string) => `/api/circles/${encodeURIComponent(circleId)}/assistance-reports`
export const assistanceApi = {
  get: (circleId: string, reportId: string) =>
    request<{ report: AssistanceReport; resources: AssistanceResource[] }>(`${path(circleId)}/${encodeURIComponent(reportId)}`),
  list(circleId: string, filters: AssistanceFilters) {
    const query = new URLSearchParams({ status: filters.status })
    if (filters.recipientId) query.set('recipientId', filters.recipientId)
    if (filters.cursor) query.set('cursor', filters.cursor)
    return request<AssistanceResponse>(`${path(circleId)}?${query}`)
  },
  create: (circleId: string, body: AssistanceInput) =>
    request<{ report: AssistanceReport; resources: AssistanceResource[] }>(path(circleId), { method: 'POST', body }),
  notification: (circleId: string, reportId: string, dismissed: boolean, version: number) =>
    request<{ report: AssistanceReport }>(`${path(circleId)}/${encodeURIComponent(reportId)}/notification`, {
      method: 'PATCH',
      body: { dismissed, version },
    }),
}
