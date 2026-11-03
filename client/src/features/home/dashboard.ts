/** Calendar arithmetic stays local until conversion to UTC, including daylight-saving changes. */
export function dashboardWindow(now: Date) {
  const midnight = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
  const dateOnly = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return {
    from: now.toISOString(),
    to: midnight(7).toISOString(),
    todayStart: midnight(0).toISOString(),
    tomorrowStart: midnight(1).toISOString(),
    fromDate: dateOnly(new Date(now.getFullYear(), now.getMonth(), 1)),
    toDate: dateOnly(midnight(1)),
  }
}

export const formatMoney = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
