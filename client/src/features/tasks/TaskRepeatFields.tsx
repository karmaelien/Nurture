import { useState } from 'react'
import { SelectField, TextField } from '../../components/ui/Field.tsx'

export type TaskRepeatUnit = 'none' | 'days' | 'weeks'
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export function TaskRepeatFields({
  unit,
  onChange,
  startDate,
}: {
  unit: TaskRepeatUnit
  onChange: (unit: TaskRepeatUnit) => void
  startDate: string
}) {
  const [today] = useState(() => new Date().getDay())
  const [chosenDays, setSelected] = useState<number[] | null>(null)
  // Follow the due date until the user explicitly chooses weekdays; preserve their choices afterward.
  const selected = chosenDays ?? [startDate ? new Date(`${startDate}T00:00:00`).getDay() : today]
  const [ending, setEnding] = useState('never')
  return (
    <>
      <SelectField
        label="Repeat"
        name="repeatUnit"
        value={unit}
        onChange={(event) => onChange(event.target.value as TaskRepeatUnit)}
      >
        <option value="none">Does not repeat</option>
        <option value="days">Daily</option>
        <option value="weeks">Weekly</option>
      </SelectField>
      {unit !== 'none' && (
        <>
          <TextField
            label={`Repeat every (${unit})`}
            name="repeatInterval"
            type="number"
            min={1}
            max={365}
            step={1}
            defaultValue={1}
            required
          />
          {unit === 'weeks' && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 font-semibold">Repeat on</legend>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={selected.length === 7}
                  onChange={() => setSelected(selected.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6])}
                />
                Select all
              </label>
              <div className="flex flex-wrap gap-3">
                {days.map((day, index) => (
                  <label key={day} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="repeatDays"
                      value={index}
                      className="accent-primary"
                      checked={selected.includes(index)}
                      onChange={() =>
                        setSelected(
                          selected.includes(index) ? selected.filter((value) => value !== index) : [...selected, index],
                        )
                      }
                    />
                    {day}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <SelectField
            label="Repeat ends"
            name="repeatEnd"
            value={ending}
            onChange={(event) => setEnding(event.target.value)}
          >
            <option value="never">No end date</option>
            <option value="onDate">On a date</option>
            <option value="afterOccurrences">After a number of tasks</option>
          </SelectField>
          {ending === 'onDate' && <TextField label="Last repeat date" name="repeatEndDate" type="date" required />}
          {ending === 'afterOccurrences' && (
            <TextField
              label="Number of tasks"
              name="repeatCount"
              type="number"
              min={1}
              max={36500}
              step={1}
              defaultValue={10}
              required
            />
          )}
          <p className="text-small text-muted">
            The due date starts the schedule. Weekly tasks follow the selected days on or after that date. Times follow
            your local time zone. Earlier occurrences before this schedule is saved are not added.
          </p>
        </>
      )}
    </>
  )
}
