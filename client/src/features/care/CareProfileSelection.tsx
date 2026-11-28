import type { CircleSummary } from '../../api/types.ts'
import { SelectField } from '../../components/ui/Field.tsx'

export function CareProfileSelection({
  circle,
  value,
  onChange,
}: {
  circle: CircleSummary
  value: string
  onChange: (id: string) => void
}) {
  return (
    <SelectField label="Showing" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Everyone</option>
      {circle.recipients.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </SelectField>
  )
}
