const { httpError } = require('../utils/httpErrors');
const {
  generateEffectiveDoses,
  medicationHistoryBounds,
  maxDoseRange,
  historyBatchRange,
} = require('../services/medication-schedule');
const notFound = () =>
  httpError(404, 'not_found', 'This medication, dose, care profile, or care circle is unavailable.');
const conflict = (message) => httpError(409, 'edit_conflict', message);
const medicationColumns = `id::text, recipient_id::text AS "recipientId", version, name, dosage, schedule,
  assigned_caregiver_id::text AS "assignedCaregiverId", stopped_at AS "stoppedAt"`;
const doseColumns = `id, medication_id::text AS "medicationId", recipient_id::text AS "recipientId", version,
  name, dosage, scheduled_at AS "scheduledAt", status, taken_at AS "takenAt",
  overdue_after_minutes AS "overdueAfterMinutes", reminder_before_minutes AS "reminderBeforeMinutes"`;

// Use the application's transaction helper, or an injected pg Pool in integration tests.
async function transaction(db, action) {
  if (db.transaction) return db.transaction(action);
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    const value = await action(tx);
    await tx.query('COMMIT');
    return value;
  } catch (error) {
    await tx.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    tx.release();
  }
}

module.exports = function medicationModel(db) {
  const scoped = {
    // Hold only the requesting membership through each short transaction.
    // Medication writes/generation acquire their own parent row before dose rows.
    run: (circleId, userId, action) =>
      transaction(db, async (tx) => {
        const one = async (sql, values) => (await tx.query(sql, values)).rows[0];
        if (
          !(await one('SELECT 1 FROM circle_members WHERE circle_id = $1 AND user_id = $2 FOR SHARE', [
            circleId,
            userId,
          ]))
        )
          throw notFound();
        const medication = async (id, lock = false, optional = false) => {
          const value = await one(
            `SELECT ${medicationColumns}, history_version, history_through, effective_from FROM medications WHERE circle_id = $1 AND id = $2${lock ? ' FOR UPDATE' : ''}`,
            [circleId, id],
          );
          if (!value && !optional) throw notFound();
          return value;
        };
        const hasRecipient = async (id) => {
          if (
            id !== undefined &&
            !(await one('SELECT 1 FROM recipients WHERE circle_id = $1 AND id = $2', [circleId, id]))
          )
            throw notFound();
        };
        const list = async () =>
          (
            await tx.query(`SELECT ${medicationColumns} FROM medications WHERE circle_id = $1 ORDER BY id`, [
              circleId,
            ])
          ).rows;

        const revisionCache = new Map();
        async function revisionsFor(id) {
          if (!revisionCache.has(id)) {
            const result = await tx.query(
              'SELECT definition, effective_from, effective_to FROM medication_revisions WHERE medication_id = $1 ORDER BY version',
              [id],
            );
            revisionCache.set(
              id,
              result.rows.map((row) => ({
                definition: row.definition,
                from: row.effective_from?.toISOString() ?? null,
                to: row.effective_to.toISOString(),
              })),
            );
          }
          return revisionCache.get(id);
        }

        async function reconcile(definition, from, to) {
          const revisions = await revisionsFor(definition.id);
          const frozenBefore = definition.stoppedAt ?? revisions.at(-1)?.to ?? null;
          const expected = generateEffectiveDoses(definition, from, to, revisions);
          // Only pending occurrences can follow schedule edits. Completed rows are snapshots.
          await tx.query(
            `DELETE FROM medication_occurrences WHERE circle_id = $1 AND medication_id = $2
          AND status = 'pending' AND scheduled_at >= $3 AND scheduled_at < $4
          AND ($7::timestamptz IS NULL OR scheduled_at >= $7)
          AND (recipient_id <> $6 OR NOT (scheduled_at = ANY($5::timestamptz[])))`,
            [
              circleId,
              definition.id,
              from,
              to,
              expected.map((dose) => dose.scheduledAt),
              definition.recipientId,
              frozenBefore,
            ],
          );
          await upsertExpected(definition, expected, frozenBefore);
        }

        async function upsertExpected(definition, expected, frozenBefore) {
          if (!expected.length) return;
          await tx.query(
            `INSERT INTO medication_occurrences
          (id, circle_id, medication_id, recipient_id, name, dosage, scheduled_at, overdue_after_minutes, reminder_before_minutes, definition_version)
          SELECT x.id, $1, $2, x."recipientId"::int, x.name, x.dosage, x."scheduledAt", x."overdueAfterMinutes", x."reminderBeforeMinutes", x."definitionVersion"
          FROM jsonb_to_recordset($3::jsonb) AS x(id text, "recipientId" text, name text, dosage text,
            "scheduledAt" timestamptz, "overdueAfterMinutes" int, "reminderBeforeMinutes" int, "definitionVersion" int)
          ON CONFLICT (medication_id, recipient_id, scheduled_at) DO UPDATE SET
            recipient_id = EXCLUDED.recipient_id, name = EXCLUDED.name, dosage = EXCLUDED.dosage,
            definition_version = EXCLUDED.definition_version,
            overdue_after_minutes = EXCLUDED.overdue_after_minutes, reminder_before_minutes = EXCLUDED.reminder_before_minutes,
            version = medication_occurrences.version + CASE WHEN
              ROW(medication_occurrences.recipient_id, medication_occurrences.name, medication_occurrences.dosage,
                medication_occurrences.overdue_after_minutes, medication_occurrences.reminder_before_minutes)
              IS DISTINCT FROM ROW(EXCLUDED.recipient_id, EXCLUDED.name, EXCLUDED.dosage,
                EXCLUDED.overdue_after_minutes, EXCLUDED.reminder_before_minutes) THEN 1 ELSE 0 END
          WHERE medication_occurrences.status = 'pending' AND ($4::timestamptz IS NULL OR medication_occurrences.scheduled_at >= $4)`,
            [circleId, definition.id, JSON.stringify(expected), frozenBefore],
          );
        }

        async function synchronizeFuture(definition, effectiveAt) {
          const rows = (
            await tx.query(
              `SELECT ${doseColumns} FROM medication_occurrences
            WHERE circle_id = $1 AND medication_id = $2 AND status = 'pending' AND scheduled_at >= $3`,
              [circleId, definition.id, effectiveAt],
            )
          ).rows;
          const remove = [],
            expected = [];
          for (const dose of rows) {
            const value = generateEffectiveDoses(
              definition,
              dose.scheduledAt.toISOString(),
              new Date(dose.scheduledAt.getTime() + 1).toISOString(),
            )[0];
            if (!value || value.recipientId !== dose.recipientId) remove.push(dose.id);
            else expected.push(value);
          }
          if (remove.length)
            await tx.query(
              `DELETE FROM medication_occurrences WHERE circle_id = $1 AND id = ANY($2::text[]) AND status = 'pending'`,
              [circleId, remove],
            );
          await upsertExpected(definition, expected, effectiveAt.toISOString());
        }

        const operations = {
          list,
          hasRecipient,
          clock: async () => (await one('SELECT clock_timestamp() AS now')).now,
          async eligible(recipientId) {
            await hasRecipient(recipientId);
            const ids = [];
            for (const definition of await list()) {
              if (
                !recipientId ||
                definition.recipientId === recipientId ||
                (await revisionsFor(definition.id)).some(
                  (revision) => revision.definition.recipientId === recipientId,
                )
              )
                ids.push(definition.id);
            }
            return ids;
          },
          async create(body) {
            return one(
              `INSERT INTO medications(circle_id, recipient_id, name, dosage, schedule, assigned_caregiver_id, effective_from)
            VALUES ($1,$2,$3,$4,$5,$6,date_trunc('milliseconds', clock_timestamp())) RETURNING ${medicationColumns}`,
              [
                circleId,
                body.recipientId,
                body.name,
                body.dosage,
                JSON.stringify(body.schedule),
                body.assignedCaregiverId,
              ],
            );
          },
          async update(id, body) {
            const previous = await medication(id, true);
            if (previous.stoppedAt)
              throw conflict(
                'This medication was stopped. Its history has been kept; add a new medication to start another course.',
              );
            if (previous.version !== body.version)
              throw conflict(
                'This medication changed while you were editing. Close and reopen it to review the latest version.',
              );
            const now = (await one("SELECT date_trunc('milliseconds', clock_timestamp()) AS now")).now;
            const effectiveAt = new Date(Math.max(now.getTime(), previous.effective_from?.getTime() ?? 0));
            const snapshot = Object.fromEntries(
              ['id', 'recipientId', 'version', 'name', 'dosage', 'schedule', 'assignedCaregiverId'].map(
                (key) => [key, previous[key]],
              ),
            );
            await tx.query(
              'INSERT INTO medication_revisions(medication_id,version,effective_from,effective_to,definition) VALUES ($1,$2,$3,$4,$5)',
              [id, previous.version, previous.effective_from, effectiveAt, JSON.stringify(snapshot)],
            );
            const value = await one(
              `UPDATE medications SET recipient_id = $3, name = $4, dosage = $5,
            schedule = $6, assigned_caregiver_id = $7, version = version + 1, effective_from = $9
            WHERE circle_id = $1 AND id = $2 AND version = $8 RETURNING ${medicationColumns}`,
              [
                circleId,
                id,
                body.recipientId,
                body.name,
                body.dosage,
                JSON.stringify(body.schedule),
                body.assignedCaregiverId,
                body.version,
                effectiveAt,
              ],
            );
            if (!value)
              throw conflict(
                'This medication changed while you were editing. Close and reopen it to review the latest version.',
              );
            await synchronizeFuture(value, effectiveAt);
            return value;
          },
          async stop(id, version) {
            const previous = await medication(id, true);
            if (previous.version !== version)
              throw conflict('This medication changed. Close and reopen it before stopping it.');
            if (previous.stoppedAt)
              return Object.fromEntries(
                [
                  'id',
                  'recipientId',
                  'version',
                  'name',
                  'dosage',
                  'schedule',
                  'assignedCaregiverId',
                  'stoppedAt',
                ].map((key) => [key, previous[key]]),
              );
            const value = await one(
              `UPDATE medications SET stopped_at = GREATEST(date_trunc('milliseconds', clock_timestamp()), effective_from), version = version + 1
               WHERE circle_id = $1 AND id = $2 AND version = $3 RETURNING ${medicationColumns}`,
              [circleId, id, version],
            );
            if (!value) throw conflict('This medication changed. Close and reopen it before stopping it.');
            await synchronizeFuture(value, value.stoppedAt);
            return value;
          },
          async remove(id, version) {
            await medication(id, true);
            const result = await tx.query(
              'DELETE FROM medications WHERE circle_id = $1 AND id = $2 AND version = $3',
              [circleId, id, version],
            );
            if (!result.rowCount)
              throw conflict(
                'This medication changed while deletion was open. Close and reopen it to review the latest version.',
              );
          },
          async occurrences(query) {
            await hasRecipient(query.recipientId);
            const definition = await medication(query.medicationId, true, true);
            if (!definition) return [];
            await reconcile(definition, query.from, query.to);
            const rows = (
              await tx.query(
                `SELECT ${doseColumns} FROM medication_occurrences WHERE circle_id = $1
            AND medication_id = $6
            AND scheduled_at >= $2 AND scheduled_at < $3 AND ($4::int IS NULL OR recipient_id = $4)
            AND ($5::text IS NULL OR status = $5) ORDER BY scheduled_at, id`,
                [
                  circleId,
                  query.from,
                  query.to,
                  query.recipientId ?? null,
                  query.status ?? null,
                  query.medicationId,
                ],
              )
            ).rows;
            return definition.stoppedAt
              ? rows.map((dose) => ({ ...dose, medicationStoppedAt: definition.stoppedAt }))
              : rows;
          },
          async overdue(query) {
            await hasRecipient(query.recipientId);
            const now = query.now;
            const cutoff = Math.min(Date.parse(query.before), now.getTime());
            const value = await medication(query.medicationId, true, true);
            if (!value)
              return {
                medicationOccurrences: [],
                historyPending: false,
                totalOverdueCount: 0,
                nextCursor: null,
              };
            const definitions = [value];
            let historyPending = false;
            const budget = query.budget;
            for (const definition of definitions) {
              const revisions = await revisionsFor(definition.id);
              const { lower, finish } = medicationHistoryBounds(
                definition,
                new Date(cutoff).toISOString(),
                revisions,
              );
              let cursor = definition.history_through
                ? Math.max(lower, definition.history_through.getTime())
                : lower;
              const initial = cursor;
              while (cursor < finish && cursor - initial < budget) {
                const upper = Math.min(finish, cursor + maxDoseRange, initial + budget);
                await reconcile(definition, new Date(cursor).toISOString(), new Date(upper).toISOString());
                cursor = upper;
              }
              // Never move coverage backwards for narrower queries in the same version.
              const pending = cursor < finish;
              historyPending ||= pending;
              const through = pending
                ? cursor
                : definition.history_through
                  ? Math.max(cutoff, definition.history_through.getTime())
                  : cutoff;
              await tx.query(
                'UPDATE medications SET history_version = version, history_through = $3 WHERE circle_id = $1 AND id = $2',
                [circleId, definition.id, new Date(through)],
              );
            }
            // Return only a bounded page; the count covers all materialized overdue rows.
            const where = `circle_id = $1 AND medication_id = $7 AND status = 'pending' AND scheduled_at < $2
              AND scheduled_at + overdue_after_minutes * INTERVAL '1 minute' <= $3
              AND ($4::int IS NULL OR recipient_id = $4)
              AND EXISTS (SELECT 1 FROM medications m WHERE m.id = medication_occurrences.medication_id
                AND (m.version = medication_occurrences.definition_version OR medication_occurrences.scheduled_at < COALESCE(m.stopped_at, m.effective_from)))`;
            const values = [circleId, new Date(cutoff), now, query.recipientId ?? null];
            const total = await one(
              `SELECT count(*)::int AS count FROM medication_occurrences WHERE ${where.replace('$7', '$5')}`,
              [...values, query.medicationId],
            );
            const [cursorAt, cursorId] = query.cursor?.split('|') ?? [];
            const rows = (
              await tx.query(
                `SELECT ${doseColumns} FROM medication_occurrences WHERE ${where}
              AND ($5::timestamptz IS NULL OR (scheduled_at, id COLLATE "C") > ($5::timestamptz, $6::text COLLATE "C"))
              ORDER BY scheduled_at, id COLLATE "C" LIMIT 101`,
                [...values, cursorAt ?? null, cursorId ?? null, query.medicationId],
              )
            ).rows;
            const medicationOccurrences = rows.slice(0, 100);
            const last = medicationOccurrences.at(-1);
            return {
              medicationOccurrences,
              historyPending,
              totalOverdueCount: total.count,
              nextCursor: rows.length > 100 && last ? `${last.scheduledAt.toISOString()}|${last.id}` : null,
            };
          },
          async changeStatus(id, body) {
            const location = await one(
              'SELECT medication_id::text AS id FROM medication_occurrences WHERE circle_id = $1 AND id = $2',
              [circleId, id],
            );
            if (!location) throw notFound();
            const definition = await medication(location.id, true);
            let dose = await one(
              `SELECT ${doseColumns} FROM medication_occurrences WHERE circle_id = $1 AND id = $2 FOR UPDATE`,
              [circleId, id],
            );
            if (!dose) throw notFound();
            if (dose.version !== body.version)
              throw conflict(
                'This dose changed in another tab or by another caregiver. Refresh the list and review its current status.',
              );
            const from = dose.scheduledAt.toISOString();
            const to = new Date(dose.scheduledAt.getTime() + 1).toISOString();
            const frozenBefore = definition.stoppedAt ?? definition.effective_from;
            const historical = frozenBefore && dose.scheduledAt.getTime() < frozenBefore.getTime();
            const expected = generateEffectiveDoses(
              definition,
              from,
              to,
              await revisionsFor(definition.id),
            )[0];
            if (
              dose.status === 'completed' &&
              body.status === 'pending' &&
              !historical &&
              (!expected || expected.recipientId !== dose.recipientId)
            ) {
              throw httpError(
                409,
                'schedule_conflict',
                'This taken dose is no longer in the current schedule for this care profile and cannot be marked pending. Its taken history has been kept.',
              );
            }
            if (dose.status === 'pending' && !historical) {
              if (!expected) throw notFound();
              await reconcile(definition, from, to);
              dose = await one(
                `SELECT ${doseColumns} FROM medication_occurrences WHERE circle_id = $1 AND id = $2`,
                [circleId, id],
              );
              if (!dose || dose.version !== body.version)
                throw conflict(
                  'This dose changed with its medication schedule. Refresh the list and review it.',
                );
            }
            if (dose.status === body.status) return dose;
            const value = await one(
              `UPDATE medication_occurrences SET status = $3, version = version + 1,
            definition_version = CASE WHEN $3 = 'pending' AND $10::boolean THEN $5 ELSE definition_version END,
            name = CASE WHEN $3 = 'pending' AND $10::boolean THEN $6 ELSE name END,
            dosage = CASE WHEN $3 = 'pending' AND $10::boolean THEN $7 ELSE dosage END,
            overdue_after_minutes = CASE WHEN $3 = 'pending' AND $10::boolean THEN $8 ELSE overdue_after_minutes END,
            reminder_before_minutes = CASE WHEN $3 = 'pending' AND $10::boolean THEN $9 ELSE reminder_before_minutes END,
            taken_at = CASE WHEN $3 = 'completed' THEN clock_timestamp() ELSE NULL END
            WHERE circle_id = $1 AND id = $2 AND version = $4 RETURNING ${doseColumns}`,
              [
                circleId,
                id,
                body.status,
                body.version,
                definition.version,
                expected?.name ?? dose.name,
                expected?.dosage ?? dose.dosage,
                expected?.overdueAfterMinutes ?? dose.overdueAfterMinutes,
                expected?.reminderBeforeMinutes ?? null,
                !historical,
              ],
            );
            if (!value) throw conflict('This dose changed. Refresh the list and review it.');
            return value;
          },
        };
        try {
          return await action(operations);
        } catch (error) {
          if (error.code === '23503') throw notFound();
          throw error;
        }
      }),
  };
  const sortDoses = (a, b) =>
    new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    run: async (circleId, userId, action) => {
      const run = (callback) => scoped.run(circleId, userId, callback);
      const operations = {
        list: () => run((model) => model.list()),
        create: (body) => run((model) => model.create(body)),
        update: (id, body) => run((model) => model.update(id, body)),
        remove: (id, version) => run((model) => model.remove(id, version)),
        stop: (id, version) => run((model) => model.stop(id, version)),
        changeStatus: (id, body) => run((model) => model.changeStatus(id, body)),
        async occurrences(query) {
          const ids = await run((model) => model.eligible(query.recipientId));
          const rows = [];
          for (const medicationId of ids)
            rows.push(...(await run((model) => model.occurrences({ ...query, medicationId }))));
          await run(() => null); // Recheck access before returning the collected results.
          return rows.sort(sortDoses);
        },
        async overdue(query) {
          const { ids, now } = await run(async (model) => ({
            ids: await model.eligible(query.recipientId),
            now: await model.clock(),
          }));
          const budget = Math.floor(historyBatchRange / Math.max(1, ids.length));
          const pages = [];
          for (const medicationId of ids)
            pages.push(await run((model) => model.overdue({ ...query, medicationId, now, budget })));
          await run(() => null);
          const rows = pages.flatMap((page) => page.medicationOccurrences).sort(sortDoses);
          const medicationOccurrences = rows.slice(0, 100);
          const last = medicationOccurrences.at(-1);
          const more = rows.length > 100 || pages.some((page) => page.nextCursor);
          return {
            medicationOccurrences,
            totalOverdueCount: pages.reduce((sum, page) => sum + page.totalOverdueCount, 0),
            historyPending: pages.some((page) => page.historyPending),
            nextCursor: more && last ? `${last.scheduledAt.toISOString()}|${last.id}` : null,
          };
        },
      };
      // Authorization still precedes validation, including on malformed requests.
      await run(() => null);
      return action(operations);
    },
  };
};
