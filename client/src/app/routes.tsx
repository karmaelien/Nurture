import { Navigate, Outlet, type RouteObject } from 'react-router'
import { FullPageSpinner } from '../components/ui/FullPageStatus.tsx'
import { AuthLayout } from '../layouts/AuthLayout.tsx'
import { GuestOnly, RequireSession } from './guards.tsx'
import { NotFoundPage } from './NotFoundPage.tsx'

// Pages load on demand so each one ships only the code it needs.
export const routes: RouteObject[] = [
  {
    element: <Outlet />,
    hydrateFallbackElement: <FullPageSpinner />,
    children: [
      // RequireSession sends logged-out visitors from /app to login.
      { path: '/', element: <Navigate to="/app" replace /> },
      {
        element: <AuthLayout />,
        children: [
          {
            element: <GuestOnly />,
            children: [
              {
                path: '/login',
                lazy: async () => ({ Component: (await import('../features/auth/LoginPage.tsx')).LoginPage }),
              },
              {
                path: '/register',
                lazy: async () => ({ Component: (await import('../features/auth/RegisterPage.tsx')).RegisterPage }),
              },
            ],
          },
        ],
      },
      {
        element: <RequireSession />,
        children: [
          {
            path: '/app',
            element: <Outlet />,
            children: [
              {
                index: true,
                lazy: async () => ({ Component: (await import('../features/home/HomePage.tsx')).HomePage }),
              },
              {
                path: 'expenses',
                lazy: async () => ({ Component: (await import('../features/expenses/ExpensesPage.tsx')).ExpensesPage }),
              },
              {
                path: 'appointments',
                lazy: async () => ({
                  Component: (await import('../features/appointments/AppointmentsPage.tsx')).AppointmentsPage,
                }),
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
