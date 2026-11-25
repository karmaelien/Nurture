// Server counterpart of the client's schedule engine. Calendar arithmetic uses the
// medication's IANA zone; persistence and filtering use UTC instants.
const day = 86400000;
const maxDoseRange = 366 * day;
const historyBatchRange = 31 * day;
const formatters = new Map();
function localMinute(instant, timeZone) {
  if (!formatters.has(timeZone))
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        era: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    );
  const parts = formatters.get(timeZone).formatToParts(instant);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${String(part('era') === 'BC' ? 1 - Number(part('year')) : Number(part('year'))).padStart(4, '0')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
function scheduleEndDate(schedule) {
  if (schedule.end.kind === 'never') return null;
  if (schedule.end.kind === 'onDate') return schedule.end.date;
  const date = new Date(`${schedule.startsOn}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + schedule.end.days - 1);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}
function doseInstant(date, time, timeZone) {
  const local = `${date}T${time}`;
  const naive = Date.parse(`${local}:00Z`);
  const offsets = new Set(
    [-36, 0, 36].map((hours) => {
      const instant = naive + hours * 3600000;
      return Date.parse(`${localMinute(instant, timeZone)}:00Z`) - instant;
    }),
  );
  const candidates = [...offsets].map((offset) => naive - offset);
  const matches = candidates.filter((instant) => localMinute(instant, timeZone) === local);
  // Nonexistent spring times shift forward; repeated fall times use the first occurrence.
  const resolved = matches.length
    ? matches
    : candidates.filter((instant) => localMinute(instant, timeZone) > local);
  return resolved.length ? new Date(Math.min(...resolved)).toISOString() : null;
}
function generateMedicationDoses(medication, from, to) {
  const lower = Date.parse(from),
    upper = Date.parse(to);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower || upper - lower > maxDoseRange)
    return [];
  const { schedule } = medication;
  const first = localMinute(lower, schedule.timeZone).slice(0, 10);
  const last = localMinute(upper - 1, schedule.timeZone).slice(0, 10);
  const end = scheduleEndDate(schedule);
  const start = first > schedule.startsOn ? first : schedule.startsOn;
  const finish = end && end < last ? end : last;
  const doses = new Map();
  for (
    const date = new Date(`${start}T00:00:00Z`);
    date.getTime() <= Date.parse(`${finish}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    if (!schedule.daysOfWeek.includes(date.getUTCDay())) continue;
    for (const time of schedule.times) {
      const scheduledAt = doseInstant(date.toISOString().slice(0, 10), time, schedule.timeZone);
      if (!scheduledAt || Date.parse(scheduledAt) < lower || Date.parse(scheduledAt) >= upper) continue;
      const id = `dose_${medication.id}_${medication.recipientId}_v${medication.version}_${Date.parse(scheduledAt)}`;
      doses.set(id, {
        id,
        version: 1,
        definitionVersion: medication.version,
        medicationId: medication.id,
        recipientId: medication.recipientId,
        name: medication.name,
        dosage: medication.dosage,
        scheduledAt,
        status: 'pending',
        overdueAfterMinutes: schedule.overdueAfterMinutes ?? 30,
        reminderBeforeMinutes: schedule.reminderBeforeMinutes ?? null,
      });
    }
  }
  return [...doses.values()];
}
function medicationSegments(medication, revisions = []) {
  return [...revisions, { definition: medication, from: revisions.at(-1)?.to ?? null, to: null }];
}
function generateEffectiveDoses(medication, from, to, revisions = []) {
  return medicationSegments(medication, revisions).flatMap((segment) => {
    const lower = Math.max(Date.parse(from), segment.from ? Date.parse(segment.from) : -Infinity);
    const upper = Math.min(Date.parse(to), segment.to ? Date.parse(segment.to) : Infinity);
    return upper > lower
      ? generateMedicationDoses(
          segment.definition,
          new Date(lower).toISOString(),
          new Date(upper).toISOString(),
        )
      : [];
  });
}
function medicationHistoryBounds(medication, before, revisions = []) {
  const segments = medicationSegments(medication, revisions);
  const lower = Math.min(
    ...segments.map((segment) =>
      Math.max(
        Date.parse('0001-01-01T00:00:00Z'),
        Date.parse(`${segment.definition.schedule.startsOn}T00:00:00Z`) - 36 * 3600000,
        segment.from ? Date.parse(segment.from) : -Infinity,
      ),
    ),
  );
  const finish = Math.min(
    Date.parse(before),
    Math.max(
      ...segments.map((segment) => {
        const end = scheduleEndDate(segment.definition.schedule);
        return Math.min(
          end ? Date.parse(`${end}T00:00:00Z`) + 36 * 3600000 : Infinity,
          segment.to ? Date.parse(segment.to) : Infinity,
        );
      }),
    ),
  );
  return { lower, finish };
}
module.exports = {
  maxDoseRange,
  historyBatchRange,
  scheduleEndDate,
  doseInstant,
  generateMedicationDoses,
  generateEffectiveDoses,
  medicationHistoryBounds,
};
