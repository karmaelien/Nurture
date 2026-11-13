import { Navigate, Outlet, type RouteObject } from 'react-router'
import { FullPageSpinner } from '../components/ui/FullPageStatus.tsx'
import { AuthLayout } from '../layouts/AuthLayout.tsx'
import type { SetupHandle } from '../features/setup/SetupLayout.tsx'
import { GuestOnly, RequireCircle, RequireSession } from './guards.tsx'
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
            // Setup is for a user's first circle; step 2 moves on to step 3 once a circle exists.
            path: '/setup',
            lazy: async () => ({ Component: (await import('../features/setup/SetupLayout.tsx')).SetupLayout }),
            children: [
              {
                index: true,
                handle: { setupStep: 1 } satisfies SetupHandle,
                lazy: async () => ({ Component: (await import('../features/setup/ProfileStep.tsx')).ProfileStep }),
              },
              {
                path: 'circle',
                handle: { setupStep: 2 } satisfies SetupHandle,
                lazy: async () => ({ Component: (await import('../features/setup/CircleStep.tsx')).CircleStep }),
              },
              {
                path: 'circles/:circleId/people',
                handle: { setupStep: 3 } satisfies SetupHandle,
                lazy: async () => ({ Component: (await import('../features/setup/PeopleStep.tsx')).PeopleStep }),
              },
            ],
          },
          {
            path: '/app',
            element: <RequireCircle />,
            children: [
              {
                index: true,
                lazy: async () => ({ Component: (await import('../features/home/HomePage.tsx')).HomePage }),
              },
              {
                path: 'circles/:circleId/people/new',
                lazy: async () => ({
                  Component: (await import('../features/profiles/AddRecipientPage.tsx')).AddRecipientPage,
                }),
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
