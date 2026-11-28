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
  const [writes, setWrites] = useState<Record<string, { pending: boolean; error?: string }>>({})
  const pending = useRef(new Set<string>())
  return {
    isPending: (appointment: AppointmentSummary) => !!writes[appointmentKey(appointment)]?.pending,
    completionError: (appointment: AppointmentSummary) => writes[appointmentKey(appointment)]?.error,
    applyCompletion(appointment: AppointmentSummary): AppointmentSummary {
      // Connected pages render the latest query result. Local state is only for standalone previews.
      if (saveCompletion) return appointment
      const status = statuses[appointmentKey(appointment)]
      return status && appointment.status !== 'cancelled' ? { ...appointment, status } : appointment
    },
    async setCompletion(appointment: AppointmentSummary, status: CompletionStatus) {
      const key = appointmentKey(appointment)
      if (appointment.status === 'cancelled' || pending.current.has(key)) return
      pending.current.add(key)
      setWrites((current) => ({ ...current, [key]: { pending: true } }))
      try {
        if (saveCompletion) await saveCompletion(appointment.circleId, appointment.id, status)
        else setStatuses((current) => ({ ...current, [key]: status }))
      } catch (error) {
        setWrites((current) => ({
          ...current,
          [key]: { pending: true, error: `Could not save appointment status. ${errorMessage(error)}` },
        }))
      } finally {
        pending.current.delete(key)
        setWrites((current) => {
          const next = { ...current }
          if (next[key]?.error) next[key] = { ...next[key], pending: false }
          else delete next[key]
          return next
        })
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
