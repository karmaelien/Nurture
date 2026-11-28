import type { CircleSummary } from '../../api/types.ts'
import { SelectField } from '../../components/ui/Field.tsx'

/** One person selector for Home and every feature page. Empty means Everyone. */
export function CareProfileSelection({
  circle,
  profiles,
  value,
  onChange,
}: {
  circle?: CircleSummary
  profiles?: { id: string; name: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="w-64 max-w-full">
      <SelectField label="Care profile" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Everyone</option>
        {(profiles ?? circle?.recipients ?? []).map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </SelectField>
    </div>
  )
}
