import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Providers } from './app/Providers.tsx'
import { routes } from './app/routes.tsx'
import { mocksEnabled } from './mocks/enabled.ts'
import './styles/theme.css'

async function startMockBackend() {
  if (!mocksEnabled) return
  const { worker } = await import('./mocks/browser.ts')
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true })
}

const router = createBrowserRouter(routes)

startMockBackend().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  )
})
