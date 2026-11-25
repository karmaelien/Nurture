import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import type { CircleSummary } from '../../api/types.ts'
import { useRequiredSession } from '../auth/session.ts'

type Selection = { recipientId: string; selectedDate: string | null }
export type Selections = Record<string, Selection>
const initial: Selection = { recipientId: '', selectedDate: null }
export const CareSelectionContext = createContext<{
  selections: Selections
  setSelections: Dispatch<SetStateAction<Selections>>
} | null>(null)

/** Keep Home and Medications on the same person/date without sharing another user's or family's state. */
export function useCareSelection(circle: CircleSummary) {
  const { user } = useRequiredSession()
  const context = useContext(CareSelectionContext)
  if (!context) throw new Error('useCareSelection requires CareSelectionProvider')
  const key = JSON.stringify([user.id, circle.id])
  const selection = context.selections[key] ?? initial
  const update = (changes: Partial<Selection>) =>
    context.setSelections((previous) => ({
      ...previous,
      [key]: { ...(previous[key] ?? initial), ...changes },
    }))
  return {
    recipientId: circle.recipients.some((person) => person.id === selection.recipientId) ? selection.recipientId : '',
    selectedDate: selection.selectedDate,
    setRecipientId: (recipientId: string) => update({ recipientId }),
    setSelectedDate: (selectedDate: string | null) => update({ selectedDate }),
  }
}
