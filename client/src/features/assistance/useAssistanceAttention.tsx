import { Link } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import type { CircleSummary } from '../../api/types.ts'
import type { AttentionItem } from '../../components/ui/AttentionNeeded.tsx'
import { circleLink } from '../circles/selection.ts'
import { AssistanceList } from './AssistanceList.tsx'
import { useAssistanceReports } from './queries.ts'

export const assistancePath = '/app/medications/assistance'
export function useAssistanceAttention(circle: CircleSummary, recipientId: string): AttentionItem {
  const query = useAssistanceReports(circle.id, recipientId)
  return {
    id: 'assistance',
    label: query.totalCount === 1 ? 'assistance notification' : 'assistance notifications',
    title: 'Patient Assistance',
    count: query.totalCount,
    tone: 'warning',
    loading: query.isPending,
    error: query.isError ? errorMessage(query.error) : undefined,
    retry: () => void query.refetch(),
    retryLabel: 'Retry assistance',
    content: () => (
      <>
        <AssistanceList query={query} circle={circle} />
        <Link className="link mt-4 inline-block" to={circleLink(assistancePath, circle.id)}>
          Open Patient Assistance
        </Link>
      </>
    ),
  }
}
