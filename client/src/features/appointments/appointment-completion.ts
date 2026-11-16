import { createContext, useContext, useRef, useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import type { AppointmentCompletionStatus as CompletionStatus } from '../../api/types.ts'
import type { AppointmentSummary } from './AppointmentsPage.tsx'

type CompletionState = Record<string, CompletionStatus>
type SaveCompletion = (circleId: string, appointmentId: string, status: CompletionStatus) => Promise<unknown>

export function appointmentKey(appointment: AppointmentSummary) {
  return JSON.stringify([appointment.circleId, appointment.id])
}

export function useAppointmentCompletionState(saveCompletion?: SaveCompletion) {
  const [statuses, setStatuses] = useState<CompletionState>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const pending = useRef(new Set<string>())
  return {
    saveError,
    applyCompletion(appointment: AppointmentSummary): AppointmentSummary {
      const status = statuses[appointmentKey(appointment)]
      return status && appointment.status !== 'cancelled' ? { ...appointment, status } : appointment
    },
    async setCompletion(appointment: AppointmentSummary, status: CompletionStatus) {
      const key = appointmentKey(appointment)
      if (appointment.status === 'cancelled' || pending.current.has(key)) return
      pending.current.add(key)
      setSaveError(null)
      try {
        if (saveCompletion) await saveCompletion(appointment.circleId, appointment.id, status)
        setStatuses((current) => ({ ...current, [key]: status }))
      } catch (error) {
        setSaveError(`Could not save appointment status. ${errorMessage(error)}`)
      } finally {
        pending.current.delete(key)
      }
    },
  }
}

export const AppointmentCompletionContext = createContext<ReturnType<typeof useAppointmentCompletionState> | null>(null)

export function useAppointmentCompletion() {
  const shared = useContext(AppointmentCompletionContext)
  const local = useAppointmentCompletionState()
  return shared ?? local
}
