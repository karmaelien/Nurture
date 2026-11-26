export const DB_KEY = 'nurture.mock-db.v6'

export class MockStorageError extends Error {}

/** All mock handlers share the origin-wide lock.
 * Acquire it before reading so the whole read/check/write operation is atomic across tabs.
 */
export async function withMockDbLock<T>(action: () => T | Promise<T>): Promise<T> {
  if (!navigator.locks)
    throw new MockStorageError(
      'This browser cannot safely save demo data across tabs. Use a browser with Web Locks support.',
    )
  return navigator.locks.request(DB_KEY, action)
}
