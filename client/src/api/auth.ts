import { request } from './client.ts'
import type { AuthResponse, LoginRequest, RegisterRequest, Session } from './types.ts'

export const authApi = {
  register: (body: RegisterRequest) => request<AuthResponse>('/api/auth/register', { method: 'POST', body }),
  login: (body: LoginRequest) => request<AuthResponse>('/api/auth/login', { method: 'POST', body }),
  me: () => request<Session>('/api/auth/me'),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
}
