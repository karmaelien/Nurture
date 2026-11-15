import { useSearchParams } from 'react-router'
import type { CircleSummary } from '../../api/types.ts'

export const circleLink = (path: string, circleId?: string) =>
  circleId ? `${path}?circleId=${encodeURIComponent(circleId)}` : path

export function useCircleSelection(circles: CircleSummary[]) {
  const [params, setParams] = useSearchParams()
  const requested = params.get('circleId')
  const circle = requested === null ? circles[0] : circles.find((item) => item.id === requested)
  return {
    circle,
    selectCircle: (id: string) => {
      setParams((previous) => {
        const next = new URLSearchParams(previous)
        next.set('circleId', id)
        return next
      })
    },
  }
}
