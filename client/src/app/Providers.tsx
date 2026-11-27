import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { mocksEnabled } from '../mocks/enabled.ts'
import { DB_KEY } from '../mocks/storage.ts'
import { CareSelectionProvider } from '../features/care/CareSelectionProvider.tsx'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }),
  )
  useEffect(() => {
    if (!mocksEnabled) return
    const refresh = () => {
      void queryClient.invalidateQueries()
    }
    const changed = (event: StorageEvent) => {
      if (event.key !== DB_KEY && event.key !== null) return
      // Read-only dose generation also persists data. Only user writes change this marker,
      // preventing two tabs' background reads from endlessly triggering each other.
      try {
        const previous = event.oldValue ? JSON.parse(event.oldValue).changeId : undefined
        const next = event.newValue ? JSON.parse(event.newValue).changeId : undefined
        if (event.key !== null && event.newValue !== null && previous === next) return
      } catch {
        /* Reload on externally cleared or malformed storage. */
      }
      refresh()
    }
    const visible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('storage', changed)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('storage', changed)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [queryClient])
  return (
    <QueryClientProvider client={queryClient}>
      <CareSelectionProvider>{children}</CareSelectionProvider>
    </QueryClientProvider>
  )
}
