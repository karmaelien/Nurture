import { HttpResponse } from 'msw'

export function error(status: number, code: string, message: string) {
  return HttpResponse.json({ error: { code, message } }, { status })
}

export const unauthorized = () => error(401, 'unauthorized', 'Your session has ended. Log in again.')

export const bearerToken = (request: Request) => request.headers.get('Authorization')?.replace(/^Bearer /, '')
