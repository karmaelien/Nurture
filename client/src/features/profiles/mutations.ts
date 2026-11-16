import { useMutation, useQueryClient } from '@tanstack/react-query'
import { circlesApi } from '../../api/circles.ts'
import type { Recipient, RecipientInput, Relationship, Session, UpdateRecipientRequest } from '../../api/types.ts'
import { usersApi } from '../../api/users.ts'
import { sessionKey, useRequiredSession } from '../auth/session.ts'
import { circleDetailKey } from './queries.ts'

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
      return queryClient.invalidateQueries({ queryKey: circleDetailKey(user.id, circleId) })
    },
  })
}

/** Swaps one recipient in the cached session, then refetches the circle's details. */
function useRecipientSaved(circleId: string) {
  const queryClient = useQueryClient()
  const updateSession = useUpdateSession()
  const { user } = useRequiredSession()
  return ({ recipient }: { recipient: Recipient }) => {
    updateSession((session) => ({
      ...session,
      circles: session.circles.map((circle) =>
        circle.id === circleId
          ? { ...circle, recipients: circle.recipients.map((item) => (item.id === recipient.id ? recipient : item)) }
          : circle,
      ),
    }))
    return queryClient.invalidateQueries({ queryKey: circleDetailKey(user.id, circleId) })
  }
}

export function useUpdateRecipient(circleId: string, recipientId: string) {
  const onSuccess = useRecipientSaved(circleId)
  return useMutation({
    mutationFn: (body: UpdateRecipientRequest) => circlesApi.updateRecipient(circleId, recipientId, body),
    onSuccess,
  })
}

export function useSetRelationship(circleId: string, recipientId: string) {
  const onSuccess = useRecipientSaved(circleId)
  return useMutation({
    mutationFn: (relationship: Relationship | null) => circlesApi.setRelationship(circleId, recipientId, relationship),
    // Arrowing through the chips saves each one; run those saves in order so the last choice wins.
    scope: { id: `relationship:${circleId}:${recipientId}` },
    onSuccess,
  })
}
