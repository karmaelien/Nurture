import { Button } from '../../components/ui/Button.tsx'

export function OverdueDoseControls({
  historyPending,
  hasNextPage,
  busy,
  onMore,
}: {
  historyPending: boolean
  hasNextPage: boolean
  busy: boolean
  onMore: () => void
}) {
  return (
    <>
      {historyPending && (
        <p role="status" className="mt-3 text-small text-muted">
          Loading older overdue doses…
        </p>
      )}
      {hasNextPage && (
        <Button className="mt-4" variant="secondary" loading={busy} onClick={onMore}>
          Show more overdue doses
        </Button>
      )}
    </>
  )
}
