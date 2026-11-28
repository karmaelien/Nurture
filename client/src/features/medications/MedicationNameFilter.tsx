import { useEffect, useId, useRef, useState } from 'react'
import type { CircleSummary, Medication } from '../../api/types.ts'
import { TextField } from '../../components/ui/Field.tsx'

export function MedicationNameFilter({
  medications,
  circle,
  value,
  onChange,
}: {
  medications: Medication[]
  circle: CircleSummary
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const listId = useId()
  useEffect(() => {
    const outside = (event: Event) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && wrapper.current?.contains(document.activeElement)) {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  const selected = medications.find((item) => item.id === value)
  const matching = medications
    .filter((item) => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  function choose(id: string) {
    onChange(id)
    setOpen(false)
    setSearch('')
    trigger.current?.focus()
  }
  return (
    <div className="relative w-64 max-w-full" ref={wrapper}>
      <p className="mb-1.5 text-small font-semibold">Medication</p>
      <button
        type="button"
        ref={trigger}
        role="combobox"
        aria-label="Medication"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-control border border-field bg-surface px-3.5 text-left outline-none focus:ring-3 focus:ring-primary/25"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{selected?.name ?? 'All medications'}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-80 max-w-[80vw] rounded-control border border-line bg-surface p-3 shadow-lg">
          <TextField
            label="Search medications"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && matching.length) {
                event.preventDefault()
                choose(matching[0].id)
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                wrapper.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus()
              }
            }}
            autoFocus
          />
          <div
            id={listId}
            role="listbox"
            aria-label="Medications by name"
            className="mt-3 max-h-60 overflow-y-auto"
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
              const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
              const index = options.indexOf(document.activeElement as HTMLButtonElement)
              event.preventDefault()
              options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus()
            }}
          >
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className="w-full rounded-control px-3 py-2 text-left hover:bg-wash"
              onClick={() => choose('')}
            >
              All medications
            </button>
            {matching.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={value === item.id}
                className="block w-full rounded-control px-3 py-2 text-left hover:bg-wash"
                onClick={() => choose(item.id)}
              >
                <span className="block font-semibold">{item.name}</span>
                <span className="text-small text-muted">
                  {circle.recipients.find((person) => person.id === item.recipientId)?.name ??
                    'Care profile unavailable'}
                </span>
              </button>
            ))}
          </div>
          {!matching.length && <p className="mt-2 text-small text-muted">No matching medications.</p>}
        </div>
      )}
    </div>
  )
}
