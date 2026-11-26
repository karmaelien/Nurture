import { delay, http as mswHttp, HttpResponse, type HttpResponseResolver } from 'msw'
import { MockStorageError, withMockDbLock } from './storage.ts'

function locked(create: typeof mswHttp.get, delayed = false) {
  return (
    path: Parameters<typeof mswHttp.get>[0],
    resolver: HttpResponseResolver,
    options?: Parameters<typeof mswHttp.get>[2],
  ) =>
    create(
      path,
      async (args) => {
        try {
          // Simulated network latency must not hold the database lock.
          if (delayed) await delay()
          return await withMockDbLock(() => resolver(args))
        } catch (error) {
          if (!(error instanceof MockStorageError)) throw error
          return HttpResponse.json({ error: { code: 'storage_unavailable', message: error.message } }, { status: 503 })
        }
      },
      options,
    )
}

// Every handler using the shared database must participate, not only medication writes.
export const http = {
  get: locked(mswHttp.get),
  post: locked(mswHttp.post),
  patch: locked(mswHttp.patch),
  put: locked(mswHttp.put),
  delete: locked(mswHttp.delete),
}
export const delayedHttp = {
  get: locked(mswHttp.get, true),
  post: locked(mswHttp.post, true),
  patch: locked(mswHttp.patch, true),
  put: locked(mswHttp.put, true),
  delete: locked(mswHttp.delete, true),
}
