import { clsx } from 'clsx'
import { Monitor, Moon, Sun } from 'lucide-react'
import { setThemePreference, useThemePreference, type ThemePreference } from '../../app/theme.ts'

const options: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

/**
 * A three-way System / Light / Dark switch. `onBrand` styles it for the pine brand panel.
 * Built from native radios, so arrow keys move between options.
 */
export function ThemeSwitch({ onBrand = false }: { onBrand?: boolean }) {
  const preference = useThemePreference()
  return (
    <fieldset
      className={clsx(
        'inline-flex flex-none gap-0.5 rounded-control border p-0.5',
        onBrand ? 'border-brand-foreground/25' : 'border-line bg-surface',
      )}
    >
      <legend className="sr-only">Theme</legend>
      {options.map(({ value, label, Icon }) => (
        <label key={value} title={`${label} theme`} className="relative">
          <input
            type="radio"
            name="theme"
            value={value}
            checked={preference === value}
            onChange={() => setThemePreference(value)}
            className="peer sr-only"
          />
          <span
            className={clsx(
              'grid size-8 cursor-pointer place-items-center rounded-[7px] transition-colors',
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1',
              onBrand
                ? 'text-brand-foreground/70 peer-checked:bg-brand-foreground/15 peer-checked:text-brand-foreground peer-focus-visible:outline-brand-foreground hover:text-brand-foreground'
                : 'text-muted peer-checked:bg-wash peer-checked:text-primary peer-focus-visible:outline-primary hover:text-ink',
            )}
          >
            <Icon className="size-[18px]" aria-hidden />
            <span className="sr-only">{label}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}
