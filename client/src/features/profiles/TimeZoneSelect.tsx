import { useMemo, type ComponentProps } from 'react'
import { SelectField } from '../../components/ui/Field.tsx'

const readable = (timeZone: string) => timeZone.replaceAll('_', ' ').replaceAll('/', ' / ')

type TimeZoneSelectProps = Omit<ComponentProps<typeof SelectField>, 'label' | 'children'> & {
  /** The starting choice, kept in the list even when the runtime lists it under another name, such as "UTC". */
  initialZone: string
}

export function TimeZoneSelect({ initialZone, ...props }: TimeZoneSelectProps) {
  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf('timeZone')
    return all.includes(initialZone) ? all : [initialZone, ...all]
  }, [initialZone])

  return (
    <SelectField label="Time zone" {...props}>
      {zones.map((zone) => (
        <option key={zone} value={zone}>
          {readable(zone)}
        </option>
      ))}
    </SelectField>
  )
}
