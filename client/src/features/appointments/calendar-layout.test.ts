import { describe, expect, it } from 'vitest'
import type { AppointmentSummary } from './AppointmentsPage.tsx'
import { hasValidAppointmentTime, layoutDayAppointments } from './calendar-layout.ts'

const day = new Date(2026, 10, 3)
function appointment(
  id: string,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute = 0,
): AppointmentSummary {
  return {
    id,
    circleId: 'family',
    recipientId: 'rose',
    title: id,
    status: 'scheduled',
    startsAt: new Date(2026, 10, 3, startHour, startMinute).toISOString(),
    endsAt: new Date(2026, 10, 3, endHour, endMinute).toISOString(),
  }
}

describe('appointment time layout', () => {
  it('rejects missing, invalid, zero-length and backwards times', () => {
    const valid = appointment('valid', 10, 0, 11)
    expect(hasValidAppointmentTime(valid)).toBe(true)
    for (const endsAt of ['', 'invalid', valid.startsAt, new Date(2026, 10, 3, 9).toISOString()]) {
      expect(hasValidAppointmentTime({ ...valid, endsAt })).toBe(false)
    }
    expect(layoutDayAppointments([{ ...valid, endsAt: '' }], day)).toEqual([])
  })

  it('shares columns for partial overlaps, reuses freed columns and separates touching events', () => {
    const blocks = layoutDayAppointments(
      [
        appointment('long', 10, 0, 12),
        appointment('short', 10, 30, 11),
        appointment('reuse', 11, 0, 11, 30),
        appointment('after', 12, 0, 13),
      ],
      day,
    )
    expect(blocks.map(({ appointment: item, column, columns }) => [item.id, column, columns])).toEqual([
      ['long', 0, 2],
      ['short', 1, 2],
      ['reuse', 1, 2],
      ['after', 0, 1],
    ])
    expect(blocks[1].endMinute - blocks[1].startMinute).toBe(30)
  })

  it('clips an overnight appointment to each day and excludes its ending day at midnight', () => {
    const overnight = appointment('overnight', 23, 30, 25)
    expect(layoutDayAppointments([overnight], day)[0]).toMatchObject({ startMinute: 1410, endMinute: 1440 })
    expect(layoutDayAppointments([overnight], new Date(2026, 10, 4))[0]).toMatchObject({
      startMinute: 0,
      endMinute: 60,
    })
    const midnight = appointment('midnight', 23, 0, 24)
    expect(layoutDayAppointments([midnight], new Date(2026, 10, 4))).toEqual([])
  })
})
