import { errorMessage } from '../../api/client.ts'
import { Alert } from './Alert.tsx'
import { Button } from './Button.tsx'

export type QueryState = { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }

/** Keep read failures inside their workspace, with the same retry action everywhere. */
export function QueryFeedback({
  query,
  loading = 'Loading…',
  message,
}: {
  query: QueryState
  loading?: string
  message?: string
}) {
  if (query.isError)
    return (
      <Alert tone="danger">
        <p>{message ?? errorMessage(query.error)}</p>
        <Button variant="secondary" className="mt-3" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </Alert>
    )
  if (query.isPending)
    return (
      <p role="status" className="text-muted">
        {loading}
      </p>
    )
  return null
}
