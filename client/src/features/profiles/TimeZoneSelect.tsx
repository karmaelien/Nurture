import { useMemo, useState, type ComponentProps } from 'react'
import { SelectField } from '../../components/ui/Field.tsx'

const readable = (timeZone: string) => timeZone.replaceAll('_', ' ').replaceAll('/', ' / ')

type TimeZoneSelectProps = Omit<ComponentProps<typeof SelectField>, 'label' | 'children'> & {
  /** The starting choice, kept in the list even when the runtime lists it under another name, such as "UTC". */
  initialZone: string
  labelForZone?: (zone: string) => string
  uniqueLabels?: boolean
}

export function TimeZoneSelect({
  initialZone,
  labelForZone = readable,
  uniqueLabels = false,
  ...props
}: TimeZoneSelectProps) {
  const [now] = useState(() => new Date())
  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf('timeZone')
    if (!uniqueLabels) {
      const values = all.includes(initialZone) ? all : [initialZone, ...all]
      return values.map((value) => ({ value, label: labelForZone(value) }))
    }
    // Keep a saved zone's exact value, then prefer familiar representatives over city aliases.
    const values = [
      initialZone,
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Phoenix',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
      'UTC',
      ...all,
    ]
    const labels = new Map<string, { value: string; label: string }>()
    for (const value of values) {
      const label = labelForZone(value)
      if (!labels.has(label)) labels.set(label, { value, label })
    }
    const choices = [...labels.values()].map((choice) => {
      const offset = new Intl.DateTimeFormat('en-US', { timeZone: choice.value, timeZoneName: 'longOffset' })
        .formatToParts(now)
        .find((part) => part.type === 'timeZoneName')!.value
      const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset)
      const minutes = match ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1) : 0
      return { ...choice, minutes, label: `(UTC${match ? offset.slice(3) : '+00:00'}) ${choice.label}` }
    })
    return choices.sort((a, b) => a.minutes - b.minutes || a.label.localeCompare(b.label))
  }, [initialZone, labelForZone, uniqueLabels, now])

  return (
    <SelectField label="Time zone" {...props}>
      {zones.map((zone) => (
        <option key={zone.value} value={zone.value}>
          {zone.label}
        </option>
      ))}
    </SelectField>
  )
}
