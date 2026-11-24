// Keep finished appointments visible below scheduled ones, with chronological order within each group.
export function compareAppointmentListOrder(
  a: { status: string; startsAt: string },
  b: { status: string; startsAt: string },
) {
  return (
    Number(a.status === 'completed') - Number(b.status === 'completed') ||
    Date.parse(a.startsAt) - Date.parse(b.startsAt)
  )
}
