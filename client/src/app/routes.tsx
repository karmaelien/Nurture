import { Navigate, Outlet, type RouteObject } from 'react-router'
import { FullPageSpinner } from '../components/ui/FullPageStatus.tsx'
import { AuthLayout } from '../layouts/AuthLayout.tsx'
import { AppLayout } from '../layouts/AppLayout.tsx'
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
                element: <AppLayout />,
                children: [
                  {
                    index: true,
                    lazy: async () => ({ Component: (await import('../features/home/HomePage.tsx')).HomePage }),
                  },
                  {
                    path: 'documents',
                    lazy: async () => ({
                      Component: (await import('../features/documents/DocumentsPage.tsx')).DocumentsPage,
                    }),
                  },
                  {
                    path: 'expenses',
                    lazy: async () => ({
                      Component: (await import('../features/expenses/ExpensesPage.tsx')).ExpensesPage,
                    }),
                  },
                  {
                    path: 'tasks',
                    lazy: async () => ({ Component: (await import('../features/tasks/TasksPage.tsx')).TasksPage }),
                  },
                  {
                    path: 'appointments',
                    lazy: async () => ({
                      Component: (await import('../features/appointments/AppointmentsRoute.tsx')).AppointmentsRoute,
                    }),
                  },
                  {
                    path: 'medications/assistance',
                    lazy: async () => ({
                      Component: (await import('../features/assistance/AssistancePage.tsx')).AssistancePage,
                    }),
                  },
                  {
                    path: 'medications',
                    lazy: async () => ({
                      Component: (await import('../features/medications/MedicationsPage.tsx')).MedicationsPage,
                    }),
                  },
                  {
                    path: 'profile',
                    lazy: async () => ({
                      Component: (await import('../features/profiles/MyProfilePage.tsx')).MyProfilePage,
                    }),
                  },
                  {
                    path: 'circles/:circleId/family',
                    lazy: async () => ({ Component: (await import('../features/profiles/FamilyPage.tsx')).FamilyPage }),
                  },
                  {
                    path: 'circles/:circleId/people/:recipientId',
                    lazy: async () => ({
                      Component: (await import('../features/profiles/RecipientProfilePage.tsx')).RecipientProfilePage,
                    }),
                  },
                  {
                    path: 'circles/:circleId/caregivers/:userId',
                    lazy: async () => ({
                      Component: (await import('../features/profiles/CaregiverProfilePage.tsx')).CaregiverProfilePage,
                    }),
                  },
                  {
                    path: 'circles/:circleId/people/:recipientId/edit',
                    lazy: async () => ({
                      Component: (await import('../features/profiles/EditRecipientPage.tsx')).EditRecipientPage,
                    }),
                  },
                ],
              },
              {
                path: 'circles/:circleId/people/new',
                lazy: async () => ({
                  Component: (await import('../features/profiles/AddRecipientPage.tsx')).AddRecipientPage,
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
