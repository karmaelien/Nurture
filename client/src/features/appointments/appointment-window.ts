const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

// Match the API's exclusive upper bound while including the exact seven-day endpoint.
export function appointmentUpcomingEnd(now: number) {
  return now + sevenDaysMs + 1
}
