// Server counterpart of the client's schedule engine. Calendar arithmetic uses the
// medication's IANA zone; persistence and filtering use UTC instants.
const day = 86400000;
const maxDoseRange = 366 * day;
const formatters = new Map();
function localMinute(instant, timeZone) {
  if (!formatters.has(timeZone))
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
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
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
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
      const id = `dose_${medication.id}_${Date.parse(scheduledAt)}`;
      doses.set(id, {
        id,
        version: 1,
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
module.exports = { maxDoseRange, scheduleEndDate, doseInstant, generateMedicationDoses };
