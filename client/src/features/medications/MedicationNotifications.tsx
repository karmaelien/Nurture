import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { ApiError, errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { mocksEnabled } from '../../mocks/enabled.ts'
import { useRequiredSession } from '../auth/session.ts'
import {
  disableMedicationNotifications,
  enableMedicationNotifications,
  notificationConfig,
  notificationsEnabled,
} from './medication-notifications.ts'

function Controls() {
  const { user } = useRequiredSession()
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const supported =
    window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
  const state = useQuery({
    queryKey: ['medication-notifications', user.id],
    queryFn: async () => {
      const config = await notificationConfig()
      return { ...config, subscribed: config.enabled ? await notificationsEnabled() : false }
    },
    enabled: supported,
    retry: false,
  })
  async function toggle() {
    if (saving.current || !state.data?.publicKey) return
    saving.current = true
    setBusy(true)
    setError(undefined)
    try {
      if (state.data.subscribed) await disableMedicationNotifications()
      else await enableMedicationNotifications(state.data.publicKey)
      await state.refetch()
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? errorMessage(cause)
          : cause instanceof Error
            ? cause.message
            : 'Notifications could not be updated.',
      )
      // Unsubscribing locally may succeed even if removing the server record fails.
      await state.refetch()
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  if (!supported || (!state.data?.enabled && !state.isError)) return null
  return (
    <div>
      {state.isError ? (
        <Button variant="secondary" onClick={() => void state.refetch()}>
          Retry notifications
        </Button>
      ) : (
        <Button variant="secondary" loading={busy} onClick={() => void toggle()}>
          {state.data?.subscribed ? 'Disable notifications' : 'Enable notifications'}
        </Button>
      )}
      {error && (
        <div className="mt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </div>
  )
}

export function MedicationNotifications() {
  return mocksEnabled ? null : <Controls />
}
