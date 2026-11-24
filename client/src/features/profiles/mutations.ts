import { useMutation, useQueryClient } from '@tanstack/react-query'
import { circlesApi } from '../../api/circles.ts'
import type { RecipientInput, Session } from '../../api/types.ts'
import { usersApi } from '../../api/users.ts'
import { sessionKey, useRequiredSession } from '../auth/session.ts'

// Each mutation writes its result into the cached session, so guards and pages update without a refetch.

function useUpdateSession() {
  const queryClient = useQueryClient()
  return (update: (session: Session) => Session) =>
    queryClient.setQueryData<Session | null>(sessionKey, (session) => session && update(session))
}

export function useUpdateProfile() {
  const updateSession = useUpdateSession()
  return useMutation({
    mutationFn: usersApi.updateMe,
    onSuccess: ({ user }) => updateSession((session) => ({ ...session, user })),
  })
}

export function useCreateCircle() {
  const updateSession = useUpdateSession()
  return useMutation({
    mutationFn: circlesApi.create,
    onSuccess: ({ circle }) => updateSession((session) => ({ ...session, circles: [...session.circles, circle] })),
  })
}

export function useAddRecipient(circleId: string) {
  const queryClient = useQueryClient()
  const updateSession = useUpdateSession()
  const { user } = useRequiredSession()
  return useMutation({
    mutationFn: (recipient: RecipientInput) => circlesApi.addRecipient(circleId, recipient),
    onSuccess: ({ recipient }) => {
      updateSession((session) => ({
        ...session,
        circles: session.circles.map((circle) =>
          circle.id === circleId ? { ...circle, recipients: [...circle.recipients, recipient] } : circle,
        ),
      }))
      // The dashboard caches circle details under this key (see HomePage).
      return queryClient.invalidateQueries({ queryKey: ['circle', user.id, circleId] })
    },
  })
}
