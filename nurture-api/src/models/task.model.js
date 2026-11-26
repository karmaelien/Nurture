const { randomUUID } = require('node:crypto');
const { httpError } = require('../utils/httpErrors');
const {
  dateInZone,
  firstTaskOccurrence,
  materializeTaskSeries,
  taskSeriesSummary,
  withTaskSeries,
} = require('../services/task-schedule');
const notFound = () =>
  httpError(
    404,
    'not_found',
    'This task, care profile, caregiver, or care circle is unavailable.',
  );
const conflict = () =>
  httpError(
    409,
    'edit_conflict',
    'This task or repeating schedule changed. Refresh before saving again.',
  );
const taskColumns = `id, recipient_id::text AS "recipientId", assigned_caregiver_id::text AS "assignedCaregiverId",
  title, due_at AS "dueAt", status, completed_at AS "completedAt", version,
  series_id::text AS "seriesId", occurrence_date AS "occurrenceDate"`;
const seriesColumns = `id::text, circle_id::text AS "circleId", recipient_id::text AS "recipientId",
  assigned_caregiver_id::text AS "assignedCaregiverId", title, version, recurrence,
  starts_on AS "startsOn", due_time AS time, created_at AS "createdAt", stopped_at AS "stoppedAt", progress`;
const iso = (value) => (value ? new Date(value).toISOString() : null);
const seriesValue = (row) => ({
  ...row,
  ...row.progress,
  createdAt: iso(row.createdAt),
  stoppedAt: iso(row.stoppedAt),
});

async function transaction(db, action) {
  if (db.transaction) return db.transaction(action);
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    const result = await action(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    tx.release();
  }
}

module.exports = (db) => ({
  run: (circleId, userId, action) =>
    transaction(db, async (tx) => {
      const one = async (sql, values) => (await tx.query(sql, values)).rows[0];
      const descriptions = new Map();
      // Membership cannot be revoked midway through an authorized transaction.
      if (
        !(await one(
          'SELECT 1 FROM circle_members WHERE circle_id=$1 AND user_id=$2 FOR SHARE',
          [circleId, userId],
        ))
      )
        throw notFound();
      const hasRecipient = async (id) => {
        if (
          id !== undefined &&
          !(await one(
            'SELECT 1 FROM recipients WHERE circle_id=$1 AND id=$2 FOR KEY SHARE',
            [circleId, id],
          ))
        )
          throw notFound();
      };
      const assignments = async (body) => {
        await hasRecipient(body.recipientId);
        if (
          body.assignedCaregiverId !== null &&
          !(await one(
            'SELECT 1 FROM circle_members WHERE circle_id=$1 AND user_id=$2 FOR KEY SHARE',
            [circleId, body.assignedCaregiverId],
          ))
        )
          throw notFound();
      };
      const getSeries = async (id, lock = false) => {
        const row = await one(
          `SELECT ${seriesColumns} FROM task_series WHERE circle_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`,
          [circleId, id],
        );
        if (!row) throw notFound();
        return seriesValue(row);
      };
      const decorate = (row, series = []) => {
        const { occurrenceDate, seriesId, ...task } = row;
        return withTaskSeries(
          {
            ...task,
            dueAt: iso(task.dueAt),
            completedAt: iso(task.completedAt),
            ...(seriesId ? { seriesId } : {}),
          },
          { taskSeries: series },
          descriptions,
        );
      };
      const lockedTask = async (id) => {
        const value = await one(
          'SELECT series_id::text AS "seriesId" FROM tasks WHERE circle_id=$1 AND id=$2',
          [circleId, id],
        );
        if (!value) throw notFound();
        // Every operation locks the parent before occurrences; generation and stop use the same order.
        const series = value.seriesId
          ? [await getSeries(value.seriesId, true)]
          : [];
        const task = await one(
          `SELECT ${taskColumns} FROM tasks WHERE circle_id=$1 AND id=$2 FOR UPDATE`,
          [circleId, id],
        );
        if (!task) throw notFound();
        return { task, series };
      };
      const insert = async (task, date = null) =>
        one(
          `INSERT INTO tasks
      (id,circle_id,recipient_id,assigned_caregiver_id,title,due_at,series_id,occurrence_date)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8
      WHERE NOT EXISTS (SELECT 1 FROM task_occurrence_exceptions WHERE series_id=$7 AND occurrence_date=$8)
      ON CONFLICT DO NOTHING RETURNING ${taskColumns}`,
          [
            task.id,
            circleId,
            task.recipientId,
            task.assignedCaregiverId,
            task.title,
            task.dueAt,
            task.seriesId ?? null,
            date,
          ],
        );
      const operations = {
        async list(filters) {
          await hasRecipient(filters.recipientId);
          // Sorted parent locking avoids deadlocks between simultaneous range reads and writes.
          const series = (
            await tx.query(
              `SELECT ${seriesColumns} FROM task_series WHERE circle_id=$1 ORDER BY id FOR UPDATE`,
              [circleId],
            )
          ).rows.map(seriesValue);
          let historyPending = false;
          for (const definition of series) {
            const store = { taskSeries: [definition], care: { tasks: [] } };
            historyPending =
              materializeTaskSeries(
                store,
                String(circleId),
                filters.dueFrom,
                filters.dueBefore,
              ) || historyPending;
            for (const task of store.care.tasks)
              await insert(task, task.id.slice(task.id.indexOf(':') + 1));
            await tx.query(
              'UPDATE task_series SET progress=$3 WHERE circle_id=$1 AND id=$2',
              [
                circleId,
                definition.id,
                JSON.stringify({
                  through: definition.through,
                  ranges: definition.ranges,
                }),
              ],
            );
          }
          const rows = (
            await tx.query(
              `SELECT ${taskColumns} FROM tasks WHERE circle_id=$1
          AND ($2::int IS NULL OR recipient_id=$2) AND ($3::text IS NULL OR status=$3)
          AND ((($4::timestamptz IS NULL OR due_at >= $4) AND ($5::timestamptz IS NULL OR due_at < $5)) OR ($6::boolean AND due_at IS NULL))
          AND ($7::timestamptz IS NULL OR completed_at >= $7) AND ($8::timestamptz IS NULL OR completed_at < $8)
          ORDER BY due_at NULLS LAST, id`,
              [
                circleId,
                filters.recipientId ?? null,
                filters.status ?? null,
                filters.dueFrom ?? null,
                filters.dueBefore ?? null,
                filters.includeUndated === 'true',
                filters.completedFrom ?? null,
                filters.completedBefore ?? null,
              ],
            )
          ).rows;
          const summaries = series
            .filter(
              (item) =>
                !filters.recipientId ||
                item.recipientId === filters.recipientId,
            )
            .map(taskSeriesSummary);
          return {
            tasks: rows.map((row) => decorate(row, series)),
            ...(summaries.length ? { series: summaries, historyPending } : {}),
          };
        },
        async create(body) {
          await assignments(body);
          if (!body.recurrence)
            return decorate(
              await insert({ ...body, id: `task_${randomUUID()}` }),
            );
          const zone = body.recurrence.timeZone;
          const parts = new Intl.DateTimeFormat('en', {
            timeZone: zone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).formatToParts(new Date(body.dueAt));
          const time = `${parts.find((part) => part.type === 'hour').value}:${parts.find((part) => part.type === 'minute').value}`;
          const row = await one(
            `INSERT INTO task_series(circle_id,recipient_id,assigned_caregiver_id,title,recurrence,starts_on,due_time)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${seriesColumns}`,
            [
              circleId,
              body.recipientId,
              body.assignedCaregiverId,
              body.title,
              JSON.stringify(body.recurrence),
              dateInZone(new Date(body.dueAt), zone),
              time,
            ],
          );
          const definition = seriesValue(row);
          const first = firstTaskOccurrence(definition);
          if (!first)
            throw httpError(
              400,
              'validation_error',
              'This repeating schedule has no remaining tasks. Choose a future due date.',
            );
          return decorate(await insert(first, first.id.split(':')[1]), [
            definition,
          ]);
        },
        async update(id, body) {
          const { task, series } = await lockedTask(id);
          if (task.version !== body.version) throw conflict();
          if ('status' in body) {
            if (task.status === body.status) return decorate(task, series);
            const result = await one(
              `UPDATE tasks SET status=$3, completed_at=CASE WHEN $3='completed' THEN date_trunc('milliseconds',clock_timestamp()) ELSE NULL END,
            version=version+1 WHERE circle_id=$1 AND id=$2 RETURNING ${taskColumns}`,
              [circleId, id, body.status],
            );
            return decorate(result, series);
          }
          await assignments(body);
          if (
            task.recipientId === body.recipientId &&
            task.title === body.title &&
            iso(task.dueAt) === iso(body.dueAt) &&
            task.assignedCaregiverId === body.assignedCaregiverId
          )
            return decorate(task, series);
          return decorate(
            await one(
              `UPDATE tasks SET recipient_id=$3, assigned_caregiver_id=$4,title=$5,due_at=$6,version=version+1
          WHERE circle_id=$1 AND id=$2 RETURNING ${taskColumns}`,
              [
                circleId,
                id,
                body.recipientId,
                body.assignedCaregiverId,
                body.title,
                body.dueAt,
              ],
            ),
            series,
          );
        },
        async remove(id, version) {
          const { task } = await lockedTask(id);
          if (task.version !== version) throw conflict();
          if (task.seriesId)
            await tx.query(
              'INSERT INTO task_occurrence_exceptions(series_id,occurrence_date) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [task.seriesId, task.occurrenceDate],
            );
          await tx.query('DELETE FROM tasks WHERE circle_id=$1 AND id=$2', [
            circleId,
            id,
          ]);
        },
        async stop(id, version) {
          const series = await getSeries(id, true);
          if (series.version !== version) throw conflict();
          if (series.stoppedAt) return;
          const stopped = await one(
            `UPDATE task_series SET stopped_at=date_trunc('milliseconds',clock_timestamp()),version=version+1
          WHERE circle_id=$1 AND id=$2 RETURNING stopped_at`,
            [circleId, id],
          );
          // Use actual (possibly individually edited) due times; retain undated/past/completed tasks.
          await tx.query(
            `INSERT INTO task_occurrence_exceptions(series_id,occurrence_date)
          SELECT series_id,occurrence_date FROM tasks WHERE circle_id=$1 AND series_id=$2 AND status='pending' AND due_at >= $3
          ON CONFLICT DO NOTHING`,
            [circleId, id, stopped.stopped_at],
          );
          await tx.query(
            "DELETE FROM tasks WHERE circle_id=$1 AND series_id=$2 AND status='pending' AND due_at >= $3",
            [circleId, id, stopped.stopped_at],
          );
        },
      };
      return action(operations);
    }),
});
