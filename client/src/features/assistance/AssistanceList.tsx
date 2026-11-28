import type { CircleSummary } from '../../api/types.ts'
import { Button } from '../../components/ui/Button.tsx'
import { QueryFeedback } from '../../components/ui/QueryFeedback.tsx'
import { AssistanceReportItem } from './AssistanceReportItem.tsx'
import type { useAssistanceReports } from './queries.ts'

export function AssistanceList({
  query,
  circle,
}: {
  query: ReturnType<typeof useAssistanceReports>
  circle: CircleSummary
}) {
  if (query.isError || query.isPending)
    return <QueryFeedback query={query} loading="Loading assistance notifications…" />
  return (
    <>
      {!query.reports.length ? (
        <p className="text-muted">No assistance notifications for the selected filters.</p>
      ) : (
        <ul className="divide-y divide-line">
          {query.reports.map((report) => (
            <AssistanceReportItem
              key={report.id}
              report={report}
              resources={query.resources}
              person={
                circle.recipients.find((person) => person.id === report.recipientId)?.name ?? 'Care profile unavailable'
              }
            />
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <Button
          className="mt-4"
          variant="secondary"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Show more notifications
        </Button>
      )}
    </>
  )
}
