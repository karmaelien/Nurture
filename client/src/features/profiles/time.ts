import { useEffect, useState } from 'react'

/** The current time, refreshed every minute on the minute. */
export function useMinute() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const next = new Date()
      timer = setTimeout(
        () => {
          setNow(new Date())
          schedule()
        },
        60_000 - (next.getSeconds() * 1000 + next.getMilliseconds()),
      )
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])
  return now
}

/** "3:12 PM" in a time zone. */
export const clockTime = (now: Date, timeZone: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' }).format(now)

/** A friendly zone name such as "Central Time", falling back to the IANA name. */
export function zoneName(timeZone: string, now = new Date()) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longGeneric' })
    .formatToParts(now)
    .find((item) => item.type === 'timeZoneName')
  return part?.value ?? timeZone.replaceAll('_', ' ')
}

/** "March 14, 1941" for a YYYY-MM-DD calendar date, the same in every time zone. */
export const longDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
