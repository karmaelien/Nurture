import { vi } from 'vitest'
import { careApi } from '../api/care.ts'
import type { MedicationInput } from '../api/types.ts'

/** Existing-history scenarios must create the tracked course before its scheduled doses. */
export async function createTrackedMedication(circleId: string, body: MedicationInput) {
  const beforeCourse = Date.parse(`${body.schedule.startsOn}T00:00:00Z`) - 36 * 3_600_000
  if (!Number.isFinite(beforeCourse) || beforeCourse >= Date.now()) return careApi.createMedication(circleId, body)
  const previous = vi.getMockedSystemTime()
  vi.setSystemTime(new Date(beforeCourse))
  try {
    return await careApi.createMedication(circleId, body)
  } finally {
    if (previous) vi.setSystemTime(previous)
    else vi.useRealTimers()
  }
}
