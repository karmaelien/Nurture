// Server counterpart of the client task scheduler; parity is covered by tests.
const { doseInstant } = require('./medication-schedule');
const dateInZone = (instant, zone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type) => parts.find((item) => item.type === type).value;
  return (
    part('year').padStart(4, '0') + '-' + part('month') + '-' + part('day')
  );
};
const zoneName = (zone) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    timeZoneName: 'longGeneric',
  })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName').value;
const day = 86_400_000;
const stamp = (date) => Date.parse(`${date}T00:00:00Z`);
const nextTaskDate = (date, days) => {
  const value = stamp(date) + days * day;
  return !Number.isFinite(value) || value > stamp('9999-12-31')
    ? '9999-12-32'
    : new Date(value).toISOString().slice(0, 10);
};
function lastTaskDate(series) {
  const rule = series.recurrence;
  if (rule.end.kind === 'never') return '9999-12-31';
  if (rule.end.kind === 'onDate') return rule.end.date;
  if (rule.unit === 'days')
    return nextTaskDate(series.startsOn, (rule.end.count - 1) * rule.interval);
  const weekday = new Date(stamp(series.startsOn)).getUTCDay();
  const selected = [...rule.daysOfWeek].sort((a, b) => a - b);
  const firstWeek = selected.filter((value) => value >= weekday);
  if (rule.end.count <= firstWeek.length)
    return nextTaskDate(
      series.startsOn,
      firstWeek[rule.end.count - 1] - weekday,
    );
  const remaining = rule.end.count - firstWeek.length - 1;
  return nextTaskDate(
    series.startsOn,
    (Math.floor(remaining / selected.length) + 1) * rule.interval * 7 -
      weekday +
      selected[remaining % selected.length],
  );
}
function taskOccurrenceIndex(series, date) {
  const start = stamp(series.startsOn);
  const current = stamp(date);
  if (current < start || !Number.isFinite(current)) return null;
  const rule = series.recurrence;
  if (rule.end.kind === 'onDate' && date > rule.end.date) return null;
  let index;
  if (rule.unit === 'days') {
    const difference = Math.round((current - start) / day);
    if (difference % rule.interval) return null;
    index = difference / rule.interval;
  } else {
    const startDay = new Date(start).getUTCDay();
    const weekday = new Date(current).getUTCDay();
    const week = Math.floor((current - start + startDay * day) / (7 * day));
    const days = [...rule.daysOfWeek].sort((a, b) => a - b);
    if (week % rule.interval || !days.includes(weekday)) return null;
    index =
      week === 0
        ? days.filter((value) => value >= startDay && value < weekday).length
        : days.filter((value) => value >= startDay).length +
          (week / rule.interval - 1) * days.length +
          days.indexOf(weekday);
  }
  return rule.end.kind === 'afterOccurrences' && index >= rule.end.count
    ? null
    : index;
}
function taskOccurrence(series, date) {
  if (taskOccurrenceIndex(series, date) === null) return null;
  const dueAt = doseInstant(date, series.time, series.recurrence.timeZone);
  if (
    !dueAt ||
    Date.parse(dueAt) < Date.parse(series.createdAt) ||
    (series.stoppedAt && Date.parse(dueAt) >= Date.parse(series.stoppedAt))
  )
    return null;
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
  };
}
function firstTaskOccurrence(series) {
  let date = dateInZone(
    new Date(Math.max(stamp(series.startsOn), Date.parse(series.createdAt))),
    series.recurrence.timeZone,
  );
  if (date < series.startsOn) date = series.startsOn;
  const end = lastTaskDate(series);
  for (
    let index = 0;
    index <= 365 * 7 + 7 && date <= '9999-12-31' && date <= end;
    index++, date = nextTaskDate(date, 1)
  ) {
    const task = taskOccurrence(series, date);
    if (task) return task;
    if (
      series.recurrence.end.kind === 'onDate' &&
      date >= series.recurrence.end.date
    )
      break;
  }
  return null;
}
/** Merge scanned dates, not viewed query keys. Evicted coverage can safely be
 * rescanned: occurrence IDs, edits, and deletion exceptions remain authoritative.
 */
function mergeCoverage(ranges) {
  const merged = [];
  for (const range of ranges
    .filter((range) => range.from < range.to)
    .sort((a, b) => a.from.localeCompare(b.from))) {
    const previous = merged.at(-1);
    if (previous && range.from <= previous.to)
      previous.to = previous.to > range.to ? previous.to : range.to;
    else merged.push({ ...range });
  }
  return merged;
}
function savedCoverage(series) {
  const ranges = [...(series.coverage ?? [])];
  const zone = series.recurrence.timeZone;
  if (series.through)
    ranges.push({
      from:
        series.startsOn > dateInZone(new Date(series.createdAt), zone)
          ? series.startsOn
          : dateInZone(new Date(series.createdAt), zone),
      to: series.through,
    });
  // Legacy cursors identify scanned prefixes, including unfinished batches.
  for (const [key, to] of Object.entries(series.ranges ?? {})) {
    const from = Date.parse(key.split('|')[0]);
    if (!Number.isFinite(from)) continue;
    const start = dateInZone(new Date(from - day), zone);
    ranges.push({
      from: start < series.startsOn ? series.startsOn : start,
      to,
    });
  }
  delete series.ranges;
  return mergeCoverage(ranges);
}
function capCoverage(ranges, start, cursor) {
  const merged = mergeCoverage(ranges);
  if (merged.length <= 64) return merged;
  // Always retain this request's contiguous progress so an unfinished range cannot
  // restart forever when the cache is full. Other coverage is only an optimization.
  const active = merged.find(
    (range) => range.from <= start && range.to >= cursor,
  );
  return [
    ...(active ? [active] : []),
    ...merged.filter((range) => range !== active).slice(-(active ? 63 : 64)),
  ].sort((a, b) => a.from.localeCompare(b.from));
}

/** Bounded generation with shared coverage across overlapping calendar views. */
function materializeTaskSeries(store, circleId, from, to, now = Date.now()) {
  const existing = new Set(store.care.tasks.map((task) => task.id));
  const deleted = new Set(store.deletedTaskOccurrences ?? []);
  let pending = false;
  for (const series of store.taskSeries ?? []) {
    if (series.circleId !== circleId) continue;
    const zone = series.recurrence.timeZone;
    const coverage = savedCoverage(series);
    const requestedFrom = from
      ? dateInZone(new Date(Date.parse(from) - day), zone)
      : (series.through ?? dateInZone(new Date(series.createdAt), zone));
    const start =
      requestedFrom < series.startsOn ? series.startsOn : requestedFrom;
    const goal = to
      ? dateInZone(new Date(Date.parse(to) + day), zone)
      : nextTaskDate(dateInZone(new Date(now), zone), 31);
    const stopDate = series.stoppedAt
      ? dateInZone(new Date(series.stoppedAt), zone)
      : goal;
    const final = [
      stopDate,
      goal,
      lastTaskDate(series),
      '9999-12-31',
    ].sort()[0];
    let date = start;
    let scanned = 0;
    while (date <= final) {
      const covered = coverage.find(
        (range) => range.from <= date && date < range.to,
      );
      if (covered) {
        date = covered.to;
        continue;
      }
      if (scanned >= 366) break;
      const task = taskOccurrence(series, date);
      if (task && !existing.has(task.id) && !deleted.has(task.id)) {
        store.care.tasks.push(task);
        existing.add(task.id);
      }
      scanned++;
      date = nextTaskDate(date, 1);
    }
    if (!from) series.through = date;
    if (start < date) coverage.push({ from: start, to: date });
    series.coverage = capCoverage(coverage, start, date);
    if (date <= final) pending = true;
  }
  return pending;
}

function withTaskSeries(task, store, descriptions) {
  const series = store.taskSeries?.find((item) => item.id === task.seriesId);
  if (!series) return task;
  const description =
    descriptions?.get(series.id) ?? taskSeriesSummary(series).description;
  descriptions?.set(series.id, description);
  return {
    ...task,
    seriesVersion: series.version,
    seriesStoppedAt: series.stoppedAt,
    seriesTitle: series.title,
    seriesDescription: description,
  };
}
function taskSeriesSummary(series) {
  const rule = series.recurrence;
  const pattern =
    rule.unit === 'days'
      ? rule.interval === 1
        ? 'Daily'
        : `Every ${rule.interval} days`
      : `${rule.interval === 1 ? 'Weekly' : `Every ${rule.interval} weeks`} on ${[
          ...rule.daysOfWeek,
        ]
          .sort((a, b) => a - b)
          .map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day])
          .join(', ')}`;
  const time = new Date(`2000-01-01T${series.time}:00Z`).toLocaleTimeString(
    undefined,
    {
      timeZone: 'UTC',
      hour: 'numeric',
      minute: '2-digit',
    },
  );
  const end =
    rule.end.kind === 'never'
      ? 'No end date'
      : rule.end.kind === 'afterOccurrences'
        ? `${rule.end.count} tasks`
        : `Through ${new Date(`${rule.end.date}T00:00:00Z`).toLocaleDateString(
            undefined,
            {
              timeZone: 'UTC',
              dateStyle: 'medium',
            },
          )}`;
  return {
    id: series.id,
    version: series.version,
    title: series.title,
    recipientId: series.recipientId,
    stoppedAt: series.stoppedAt,
    description: `${pattern} · ${time} · ${zoneName(rule.timeZone)} · ${end}`,
  };
}

module.exports = {
  dateInZone,
  nextTaskDate,
  lastTaskDate,
  taskOccurrenceIndex,
  taskOccurrence,
  firstTaskOccurrence,
  materializeTaskSeries,
  taskSeriesSummary,
  withTaskSeries,
};
