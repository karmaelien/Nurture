import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../../api/auth.ts'
import { ApiError } from '../../api/client.ts'
import { clearToken, getToken, setToken } from '../../api/token.ts'
import type { AuthResponse, Session } from '../../api/types.ts'

export const sessionKey = ['session'] as const

async function loadSession(): Promise<Session | null> {
  if (!getToken()) return null
  try {
    return await authApi.me()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearToken()
      return null
    }
    throw error
  }
}

export function useSession() {
  return useQuery({ queryKey: sessionKey, queryFn: loadSession, staleTime: Infinity, retry: false })
}

/** For components rendered behind RequireSession, where the session is guaranteed. */
export function useRequiredSession(): Session {
  const { data } = useSession()
  if (!data) throw new Error('useRequiredSession must be used inside RequireSession')
  return data
}

function useStartSession() {
  const queryClient = useQueryClient()
  return ({ token, ...session }: AuthResponse) => {
    setToken(token)
    queryClient.setQueryData<Session | null>(sessionKey, session)
  }
}

export function useLogin() {
  const startSession = useStartSession()
  return useMutation({ mutationFn: authApi.login, onSuccess: startSession })
}

export function useRegister() {
  const startSession = useStartSession()
  return useMutation({ mutationFn: authApi.register, onSuccess: startSession })
}

export function useLogout() {
  return useMutation({
    // Log out locally even if the server is unreachable.
    mutationFn: () => authApi.logout().catch(() => undefined),
    onSettled: () => {
      clearToken()
      // A full page load guarantees no cached care data survives in memory,
      // which matters on computers that family members share.
      window.location.replace('/login')
    },
  })
}

/** Only allow same-site paths as post-login destinations. */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}
