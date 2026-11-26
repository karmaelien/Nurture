import { useState, type ReactNode } from 'react'
import { CareSelectionContext, type Selections } from './selection.ts'

export function CareSelectionProvider({ children }: { children: ReactNode }) {
  const [selections, setSelections] = useState<Selections>({})
  return <CareSelectionContext.Provider value={{ selections, setSelections }}>{children}</CareSelectionContext.Provider>
}
