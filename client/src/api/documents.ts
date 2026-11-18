import { request } from './client.ts'
import type { CareDocument, CreateDocumentRequest, UpdateDocumentRequest } from './types.ts'
const path = (circleId: string, id?: string) =>
  `/api/circles/${encodeURIComponent(circleId)}/documents${id ? `/${encodeURIComponent(id)}` : ''}`
export const documentsApi = {
  list: (circleId: string) => request<{ documents: CareDocument[] }>(path(circleId)),
  upload: (circleId: string, file: File, metadata: CreateDocumentRequest) => {
    const body = new FormData()
    body.append('file', file)
    body.append('metadata', JSON.stringify(metadata))
    return request<{ document: CareDocument }>(path(circleId), { method: 'POST', body })
  },
  update: (circleId: string, id: string, body: UpdateDocumentRequest) =>
    request<{ document: CareDocument }>(path(circleId, id), { method: 'PATCH', body }),
  remove: (circleId: string, id: string) => request<void>(path(circleId, id), { method: 'DELETE' }),
  file: (circleId: string, id: string) =>
    request<Blob>(`${path(circleId, id)}/file?disposition=inline`, { responseType: 'blob' }),
}
