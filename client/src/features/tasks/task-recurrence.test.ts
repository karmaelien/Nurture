import { expect, it } from 'vitest'
import {
  firstTaskOccurrence,
  lastTaskDate,
  materializeTaskSeries,
  taskOccurrence,
  type TaskSeries,
} from './task-recurrence.ts'

const series = (changes: Partial<TaskSeries> = {}): TaskSeries => ({
  id: 'series',
  circleId: 'c_demo',
  version: 1,
  title: 'Repeat sample',
  recipientId: 'r_rose',
  assignedCaregiverId: null,
  startsOn: '2026-03-07',
  time: '08:00',
  createdAt: '2026-03-06T00:00:00Z',
  stoppedAt: null,
  recurrence: {
    unit: 'days',
    interval: 1,
    daysOfWeek: [],
    timeZone: 'America/New_York',
    end: { kind: 'afterOccurrences', count: 3 },
  },
  ...changes,
})

it('preserves local due times across DST and creates distinct occurrences with an inclusive end', () => {
  const course = series()
  expect(taskOccurrence(course, '2026-03-07')?.dueAt).toBe('2026-03-07T13:00:00.000Z')
  expect(taskOccurrence(course, '2026-03-08')?.dueAt).toBe('2026-03-08T12:00:00.000Z')
  expect(taskOccurrence(course, '2026-03-09')?.dueAt).toBe('2026-03-09T12:00:00.000Z')
  expect(taskOccurrence(course, '2026-03-10')).toBeNull()
  expect(lastTaskDate(course)).toBe('2026-03-09')
  expect(taskOccurrence(course, '2026-03-08')?.id).not.toBe(taskOccurrence(course, '2026-03-07')?.id)
})

it('counts selected weekdays across repeated weeks rather than treating the interval as days', () => {
  const course = series({
    startsOn: '2026-11-26',
    recurrence: {
      unit: 'weeks',
      interval: 2,
      daysOfWeek: [1, 4],
      timeZone: 'UTC',
      end: { kind: 'afterOccurrences', count: 4 },
    },
  })
  expect(
    ['2026-11-26', '2026-12-07', '2026-12-10', '2026-12-21'].map((date) => !!taskOccurrence(course, date)),
  ).toEqual([true, true, true, true])
  expect(taskOccurrence(course, '2026-11-30')).toBeNull()
  expect(taskOccurrence(course, '2026-12-24')).toBeNull()
  expect(lastTaskDate(course)).toBe('2026-12-21')
})

it('does not backfill pre-creation tasks and rejects courses with no remaining occurrences', () => {
  expect(firstTaskOccurrence(series({ createdAt: '2026-03-08T15:00:00Z' }))?.dueAt).toBe('2026-03-09T12:00:00.000Z')
  expect(firstTaskOccurrence(series({ createdAt: '2026-03-10T00:00:00Z' }))).toBeNull()
})

it('keeps read generation bounded, preserves edits/deletions, and advances history to completion', () => {
  const course = series({
    startsOn: '2020-01-01',
    createdAt: '2019-12-31T00:00:00Z',
    recurrence: { unit: 'days', interval: 1, daysOfWeek: [], timeZone: 'UTC', end: { kind: 'never' } },
  })
  const store = {
    taskSeries: [course],
    deletedTaskOccurrences: ['series:2020-01-03'],
    care: { tasks: [{ ...taskOccurrence(course, '2020-01-02')!, title: 'Individual edit', dueAt: null }] },
  }
  const now = Date.parse('2022-01-01T00:00:00Z')
  expect(materializeTaskSeries(store, 'c_demo', undefined, undefined, now)).toBe(true)
  expect(store.care.tasks.length).toBeLessThanOrEqual(366)
  for (let index = 0; index < 4; index++) materializeTaskSeries(store, 'c_demo', undefined, undefined, now)
  expect(materializeTaskSeries(store, 'c_demo', undefined, undefined, now)).toBe(false)
  expect(new Set(store.care.tasks.map((task) => task.id)).size).toBe(store.care.tasks.length)
  expect(store.care.tasks.some((task) => task.id === 'series:2020-01-03')).toBe(false)
  expect(store.care.tasks.find((task) => task.id === 'series:2020-01-02')).toMatchObject({
    title: 'Individual edit',
    dueAt: null,
  })
  const futureStore = { taskSeries: [series({ recurrence: { ...course.recurrence } })], care: { tasks: [] } }
  materializeTaskSeries(futureStore, 'c_demo', '2099-03-01T00:00:00Z', '2099-04-01T00:00:00Z', now)
  expect(futureStore.care.tasks.length).toBeLessThan(35)
})

it('reuses overlapping month/week/day coverage and discards legacy view keys', () => {
  const course = series({
    startsOn: '2026-01-01',
    createdAt: '2025-12-31T00:00:00Z',
    recurrence: { unit: 'days', interval: 1, daysOfWeek: [], timeZone: 'UTC', end: { kind: 'never' } },
    ranges: { '2026-03-01T00:00:00Z|2026-04-01T00:00:00Z': '2026-04-03' },
  })
  const store = { taskSeries: [course], care: { tasks: [] } }
  materializeTaskSeries(store, 'c_demo', '2026-03-10T00:00:00Z', '2026-03-11T00:00:00Z')
  expect(course.ranges).toBeUndefined()
  expect(course.coverage).toEqual([{ from: '2026-02-28', to: '2026-04-03' }])
  expect(store.care.tasks).toHaveLength(0)
  materializeTaskSeries(store, 'c_demo', '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z')
  expect(course.coverage).toEqual([{ from: '2026-02-28', to: '2026-05-03' }])
  const count = store.care.tasks.length
  materializeTaskSeries(store, 'c_demo', '2026-04-05T00:00:00Z', '2026-04-12T00:00:00Z')
  expect(store.care.tasks).toHaveLength(count)
})
