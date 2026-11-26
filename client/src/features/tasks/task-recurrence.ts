import type { CareTask, TaskInput, TaskRecurrence, TaskSeriesSummary } from '../../api/types.ts'
import { doseInstant } from '../medications/medication-occurrences.ts'
import { dateInZone } from '../medications/medication-schedule.ts'
import { zoneName } from '../profiles/time.ts'

const day = 86_400_000
export type TaskSeries = Omit<TaskInput, 'dueAt'> & {
  id: string
  circleId: string
  version: number
  recurrence: TaskRecurrence
  startsOn: string
  time: string
  createdAt: string
  stoppedAt: string | null
  through?: string
  ranges?: Record<string, string>
}
export type TaskRecurrenceStore = {
  taskSeries?: TaskSeries[]
  deletedTaskOccurrences?: string[]
  care: { tasks: CareTask[] }
}
const stamp = (date: string) => Date.parse(`${date}T00:00:00Z`)
export const nextTaskDate = (date: string, days: number) => {
  const value = stamp(date) + days * day
  return !Number.isFinite(value) || value > stamp('9999-12-31')
    ? '9999-12-32'
    : new Date(value).toISOString().slice(0, 10)
}

export function lastTaskDate(series: TaskSeries) {
  const rule = series.recurrence
  if (rule.end.kind === 'never') return '9999-12-31'
  if (rule.end.kind === 'onDate') return rule.end.date
  if (rule.unit === 'days') return nextTaskDate(series.startsOn, (rule.end.count - 1) * rule.interval)
  const weekday = new Date(stamp(series.startsOn)).getUTCDay()
  const selected = [...rule.daysOfWeek].sort((a, b) => a - b)
  const firstWeek = selected.filter((value) => value >= weekday)
  if (rule.end.count <= firstWeek.length) return nextTaskDate(series.startsOn, firstWeek[rule.end.count - 1] - weekday)
  const remaining = rule.end.count - firstWeek.length - 1
  return nextTaskDate(
    series.startsOn,
    (Math.floor(remaining / selected.length) + 1) * rule.interval * 7 - weekday + selected[remaining % selected.length],
  )
}

/** Position in the original schedule, computed without scanning from its start. */
export function taskOccurrenceIndex(series: TaskSeries, date: string): number | null {
  const start = stamp(series.startsOn)
  const current = stamp(date)
  if (current < start || !Number.isFinite(current)) return null
  const rule = series.recurrence
  if (rule.end.kind === 'onDate' && date > rule.end.date) return null
  let index: number
  if (rule.unit === 'days') {
    const difference = Math.round((current - start) / day)
    if (difference % rule.interval) return null
    index = difference / rule.interval
  } else {
    const startDay = new Date(start).getUTCDay()
    const weekday = new Date(current).getUTCDay()
    const week = Math.floor((current - start + startDay * day) / (7 * day))
    const days = [...rule.daysOfWeek].sort((a, b) => a - b)
    if (week % rule.interval || !days.includes(weekday)) return null
    index =
      week === 0
        ? days.filter((value) => value >= startDay && value < weekday).length
        : days.filter((value) => value >= startDay).length +
          (week / rule.interval - 1) * days.length +
          days.indexOf(weekday)
  }
  return rule.end.kind === 'afterOccurrences' && index >= rule.end.count ? null : index
}

export function taskOccurrence(series: TaskSeries, date: string): CareTask | null {
  if (taskOccurrenceIndex(series, date) === null) return null
  const dueAt = doseInstant(date, series.time, series.recurrence.timeZone)
  // Do not invent history before creation; stop applies prospectively.
  if (
    !dueAt ||
    Date.parse(dueAt) < Date.parse(series.createdAt) ||
    (series.stoppedAt && Date.parse(dueAt) >= Date.parse(series.stoppedAt))
  )
    return null
  return {
    id: `${series.id}:${date}`,
    seriesId: series.id,
    version: 1,
    title: series.title,
    recipientId: series.recipientId,
    assignedCaregiverId: series.assignedCaregiverId,
    dueAt,
    status: 'pending',
    completedAt: null,
  }
}

export function firstTaskOccurrence(series: TaskSeries) {
  let date = dateInZone(
    new Date(Math.max(stamp(series.startsOn), Date.parse(series.createdAt))),
    series.recurrence.timeZone,
  )
  if (date < series.startsOn) date = series.startsOn
  // A weekly interval can skip up to 365 weeks. Only creation needs to find its first remaining date.
  const end = lastTaskDate(series)
  for (
    let index = 0;
    index <= 365 * 7 + 7 && date <= '9999-12-31' && date <= end;
    index++, date = nextTaskDate(date, 1)
  ) {
    const task = taskOccurrence(series, date)
    if (task) return task
    if (series.recurrence.end.kind === 'onDate' && date >= series.recurrence.end.date) break
  }
  return null
}

/** Bounded generation. IDs and deletion exceptions prevent reads from restoring edited/deleted occurrences. */
export function materializeTaskSeries(
  store: TaskRecurrenceStore,
  circleId: string,
  from?: string | null,
  to?: string | null,
  now = Date.now(),
) {
  const existing = new Set(store.care.tasks.map((task) => task.id))
  const deleted = new Set(store.deletedTaskOccurrences ?? [])
  let pending = false
  for (const series of store.taskSeries ?? []) {
    if (series.circleId !== circleId) continue
    const zone = series.recurrence.timeZone
    const rangeKey = `${from}|${to}`
    const requestedFrom = from
      ? (series.ranges?.[rangeKey] ?? dateInZone(new Date(Date.parse(from) - day), zone))
      : (series.through ?? dateInZone(new Date(series.createdAt), zone))
    const goal = to
      ? dateInZone(new Date(Date.parse(to) + day), zone)
      : nextTaskDate(dateInZone(new Date(now), zone), 31)
    let date = requestedFrom < series.startsOn ? series.startsOn : requestedFrom
    const stopDate = series.stoppedAt ? dateInZone(new Date(series.stoppedAt), zone) : goal
    const final = [stopDate, goal, lastTaskDate(series), '9999-12-31'].sort()[0]
    let scanned = 0
    for (; date <= final && scanned < 366; date = nextTaskDate(date, 1), scanned++) {
      const task = taskOccurrence(series, date)
      if (task && !existing.has(task.id) && !deleted.has(task.id)) {
        store.care.tasks.push(task)
        existing.add(task.id)
      }
    }
    if (!from) series.through = date
    else (series.ranges ??= {})[rangeKey] = date
    if (date <= final) pending = true
  }
  return pending
}

export function withTaskSeries(
  task: CareTask,
  store: TaskRecurrenceStore,
  descriptions?: Map<string, string>,
): CareTask {
  const series = store.taskSeries?.find((item) => item.id === task.seriesId)
  if (!series) return task
  const description = descriptions?.get(series.id) ?? taskSeriesSummary(series).description
  descriptions?.set(series.id, description)
  return {
    ...task,
    seriesVersion: series.version,
    seriesStoppedAt: series.stoppedAt,
    seriesTitle: series.title,
    seriesDescription: description,
  }
}

export function taskSeriesSummary(series: TaskSeries): TaskSeriesSummary {
  const rule = series.recurrence
  const pattern =
    rule.unit === 'days'
      ? rule.interval === 1
        ? 'Daily'
        : `Every ${rule.interval} days`
      : `${rule.interval === 1 ? 'Weekly' : `Every ${rule.interval} weeks`} on ${[...rule.daysOfWeek]
          .sort((a, b) => a - b)
          .map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day])
          .join(', ')}`
  const time = new Date(`2000-01-01T${series.time}:00Z`).toLocaleTimeString(undefined, {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  })
  const end =
    rule.end.kind === 'never'
      ? 'No end date'
      : rule.end.kind === 'afterOccurrences'
        ? `${rule.end.count} tasks`
        : `Through ${new Date(`${rule.end.date}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', dateStyle: 'medium' })}`
  return {
    id: series.id,
    version: series.version,
    title: series.title,
    recipientId: series.recipientId,
    stoppedAt: series.stoppedAt,
    description: `${pattern} · ${time} · ${zoneName(rule.timeZone)} · ${end}`,
  }
}
