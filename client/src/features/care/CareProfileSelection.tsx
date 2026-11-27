import type { CircleSummary } from '../../api/types.ts'

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
    <label className="grid gap-2">
      Showing
      <select
        className="max-w-full rounded-control border border-field bg-surface px-3 py-2 text-body"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Everyone</option>
        {circle.recipients.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    </label>
  )
}
