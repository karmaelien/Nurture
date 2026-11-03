import { getToken } from './token.ts'
import type { ApiErrorBody } from './types.ts'

// Empty means same origin: the mock worker, the Vite dev proxy to the local server, or a production proxy.
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
}

export async function request<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(new URL(path, BASE_URL || window.location.origin), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network_error', "Can't reach Nurture. Check your connection and try again.")
  }

  if (response.status === 204) return undefined as T

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown_error',
      error?.message ?? `Nurture returned an unexpected error (${response.status}). Try again in a moment.`,
    )
  }
  return data as T
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something unexpected happened. Try again in a moment.'
}
