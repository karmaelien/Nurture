import { request } from './client.ts'
import type { UpdateProfileRequest, User } from './types.ts'

export const usersApi = {
  updateMe: (body: UpdateProfileRequest) => request<{ user: User }>('/api/users/me', { method: 'PATCH', body }),
}
