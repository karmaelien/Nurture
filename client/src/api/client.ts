import { getToken } from './token.ts'
import type { ApiErrorBody } from './types.ts'
import { mocksEnabled } from '../mocks/enabled.ts'

// Empty means same origin: the mock worker, the Vite dev proxy to the local server, or a production proxy.
const BASE_URL = mocksEnabled ? '' : (import.meta.env.VITE_API_URL ?? '')

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** The whole response body, for errors that carry more than `error`, such as 409 edit_conflict. */
  readonly body: unknown

  constructor(status: number, code: string, message: string, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  responseType?: 'json' | 'blob'
}

export async function request<T>(
  path: string,
  { method = 'GET', body, responseType = 'json' }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(new URL(path, BASE_URL || window.location.origin), {
      method,
      headers,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network_error', "Can't reach Nurture. Check your connection and try again.")
  }

  if (response.status === 204) return undefined as T

  if (response.ok && responseType === 'blob') return (await response.blob()) as T

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error
    const missingRoute =
      response.status === 404
        ? `The ${mocksEnabled ? 'demo' : 'server'} API did not handle ${method} ${path.split('?')[0]} (404).`
        : undefined
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown_error',
      error?.message ??
        missingRoute ??
        `Nurture returned an unexpected error (${response.status}). Try again in a moment.`,
      data,
    )
  }
  return data as T
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something unexpected happened. Try again in a moment.'
}
