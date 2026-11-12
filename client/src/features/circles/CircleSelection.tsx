import type { CircleSummary } from '../../api/types.ts'

export function CircleSelection({
  circles,
  circle,
  onChange,
}: {
  circles: CircleSummary[]
  circle?: CircleSummary
  onChange: (id: string) => void
}) {
  return (
    <label className="grid gap-2">
      Care circle
      <select
        aria-label="Care circle"
        value={circle?.id ?? ''}
        disabled={circles.length === 0 || (circles.length === 1 && !!circle)}
        className="max-w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-body disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted disabled:opacity-60"
        onChange={(event) => onChange(event.target.value)}
      >
        {!circle && (
          <option value="" disabled>
            {circles.length ? 'Select a care circle' : 'No care circles'}
          </option>
        )}
        {circles.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  )
}
