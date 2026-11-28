import { useQueryClient } from '@tanstack/react-query'
import { Outlet, ScrollRestoration } from 'react-router'
import { careApi } from '../api/care.ts'
import {
  AppointmentCompletionContext,
  useAppointmentCompletionState,
} from '../features/appointments/appointment-completion.ts'
import { useRequiredSession } from '../features/auth/session.ts'
import { AppHeader } from './AppHeader.tsx'

export function AppLayout() {
  const { user } = useRequiredSession()
  const queryClient = useQueryClient()
  const completion = useAppointmentCompletionState(async (circleId, appointmentId, status) => {
    await careApi.updateAppointmentStatus(circleId, appointmentId, status)
    await queryClient.invalidateQueries({ queryKey: ['care', user.id, circleId, 'appointments'] })
  })
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <AppointmentCompletionContext.Provider value={completion}>
        <Outlet />
      </AppointmentCompletionContext.Provider>
      {/* Reset new-page scroll, restore history positions, and honor dashboard section links. */}
      <ScrollRestoration />
    </div>
  )
}
