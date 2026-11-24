const { httpError } = require('../utils/httpErrors');
const { generateMedicationDoses, maxDoseRange, scheduleEndDate } = require('../services/medication-schedule');
const notFound = () =>
  httpError(404, 'not_found', 'This medication, dose, care profile, or care circle is unavailable.');
const conflict = (message) => httpError(409, 'edit_conflict', message);
const medicationColumns = `id::text, recipient_id::text AS "recipientId", version, name, dosage, schedule,
  assigned_caregiver_id::text AS "assignedCaregiverId"`;
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
  return {
    // Serialize medication reads that generate doses and all medication writes per family.
    // Recheck membership inside the transaction and hold it until commit, so revocation
    // cannot pass an earlier authorization check and race a subsequent save.
    run: (circleId, userId, action) =>
      transaction(db, async (tx) => {
        const one = async (sql, values) => (await tx.query(sql, values)).rows[0];
        const circle = await one('SELECT id FROM circles WHERE id = $1 FOR UPDATE', [circleId]);
        if (
          !circle ||
          !(await one('SELECT 1 FROM circle_members WHERE circle_id = $1 AND user_id = $2 FOR SHARE', [
            circleId,
            userId,
          ]))
        )
          throw notFound();
        const medication = async (id) => {
          const value = await one(
            `SELECT ${medicationColumns}, history_version, history_through FROM medications WHERE circle_id = $1 AND id = $2`,
            [circleId, id],
          );
          if (!value) throw notFound();
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

        async function reconcile(definition, from, to) {
          const expected = generateMedicationDoses(definition, from, to);
          // Only pending occurrences can follow schedule edits. Completed rows are snapshots.
          await tx.query(
            `DELETE FROM medication_occurrences WHERE circle_id = $1 AND medication_id = $2
          AND status = 'pending' AND scheduled_at >= $3 AND scheduled_at < $4
          AND NOT (scheduled_at = ANY($5::timestamptz[]))`,
            [circleId, definition.id, from, to, expected.map((dose) => dose.scheduledAt)],
          );
          if (!expected.length) return;
          await tx.query(
            `INSERT INTO medication_occurrences
          (id, circle_id, medication_id, recipient_id, name, dosage, scheduled_at, overdue_after_minutes, reminder_before_minutes)
          SELECT x.id, $1, $2, x."recipientId"::int, x.name, x.dosage, x."scheduledAt", x."overdueAfterMinutes", x."reminderBeforeMinutes"
          FROM jsonb_to_recordset($3::jsonb) AS x(id text, "recipientId" text, name text, dosage text,
            "scheduledAt" timestamptz, "overdueAfterMinutes" int, "reminderBeforeMinutes" int)
          ON CONFLICT (medication_id, scheduled_at) DO UPDATE SET
            recipient_id = EXCLUDED.recipient_id, name = EXCLUDED.name, dosage = EXCLUDED.dosage,
            overdue_after_minutes = EXCLUDED.overdue_after_minutes, reminder_before_minutes = EXCLUDED.reminder_before_minutes,
            version = medication_occurrences.version + CASE WHEN
              ROW(medication_occurrences.recipient_id, medication_occurrences.name, medication_occurrences.dosage,
                medication_occurrences.overdue_after_minutes, medication_occurrences.reminder_before_minutes)
              IS DISTINCT FROM ROW(EXCLUDED.recipient_id, EXCLUDED.name, EXCLUDED.dosage,
                EXCLUDED.overdue_after_minutes, EXCLUDED.reminder_before_minutes) THEN 1 ELSE 0 END
          WHERE medication_occurrences.status = 'pending'`,
            [circleId, definition.id, JSON.stringify(expected)],
          );
        }

        const operations = {
          list,
          hasRecipient,
          async create(body) {
            return one(
              `INSERT INTO medications(circle_id, recipient_id, name, dosage, schedule, assigned_caregiver_id)
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${medicationColumns}`,
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
            await medication(id);
            const value = await one(
              `UPDATE medications SET recipient_id = $3, name = $4, dosage = $5,
            schedule = $6, assigned_caregiver_id = $7, version = version + 1
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
              ],
            );
            if (!value)
              throw conflict(
                'This medication changed while you were editing. Close and reopen it to review the latest version.',
              );
            return value;
          },
          async remove(id, version) {
            await medication(id);
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
            // Reconcile every definition in the family, including moves between its profiles.
            for (const definition of await list()) await reconcile(definition, query.from, query.to);
            return (
              await tx.query(
                `SELECT ${doseColumns} FROM medication_occurrences WHERE circle_id = $1
            AND scheduled_at >= $2 AND scheduled_at < $3 AND ($4::int IS NULL OR recipient_id = $4)
            AND ($5::text IS NULL OR status = $5) ORDER BY scheduled_at, id`,
                [circleId, query.from, query.to, query.recipientId ?? null, query.status ?? null],
              )
            ).rows;
          },
          async overdue(query) {
            await hasRecipient(query.recipientId);
            const now = (await one('SELECT clock_timestamp() AS now')).now;
            const cutoff = Math.min(Date.parse(query.before), now.getTime());
            const definitions = (
              await tx.query(
                `SELECT ${medicationColumns}, history_version, history_through
            FROM medications WHERE circle_id = $1 ORDER BY id`,
                [circleId],
              )
            ).rows;
            for (const definition of definitions) {
              const end = scheduleEndDate(definition.schedule);
              const finish = end ? Math.min(cutoff, Date.parse(`${end}T00:00:00Z`) + 36 * 3600000) : cutoff;
              const lower = Date.parse(`${definition.schedule.startsOn}T00:00:00Z`) - 36 * 3600000;
              let cursor =
                definition.history_version === definition.version && definition.history_through
                  ? Math.max(lower, definition.history_through.getTime())
                  : lower;
              while (cursor < finish) {
                const upper = Math.min(finish, cursor + maxDoseRange);
                await reconcile(definition, new Date(cursor).toISOString(), new Date(upper).toISOString());
                cursor = upper;
              }
              // A shortened/moved course can leave old pending rows outside the new
              // generation window. Remove those too, while retaining taken snapshots.
              await tx.query(
                `DELETE FROM medication_occurrences WHERE circle_id = $1 AND medication_id = $2
              AND status = 'pending' AND scheduled_at < $3 AND (scheduled_at < $4 OR scheduled_at >= $5)`,
                [
                  circleId,
                  definition.id,
                  new Date(cutoff),
                  new Date(Date.parse(`${definition.schedule.startsOn}T00:00:00Z`) - 36 * 3600000),
                  new Date(finish),
                ],
              );
              // Never move coverage backwards for narrower queries in the same version.
              const through =
                definition.history_version === definition.version && definition.history_through
                  ? Math.max(cutoff, definition.history_through.getTime())
                  : cutoff;
              await tx.query(
                'UPDATE medications SET history_version = version, history_through = $3 WHERE circle_id = $1 AND id = $2',
                [circleId, definition.id, new Date(through)],
              );
            }
            return (
              await tx.query(
                `SELECT ${doseColumns} FROM medication_occurrences WHERE circle_id = $1
            AND status = 'pending' AND scheduled_at < $2
            AND scheduled_at + overdue_after_minutes * INTERVAL '1 minute' <= $3
            AND ($4::int IS NULL OR recipient_id = $4) ORDER BY scheduled_at, id`,
                [circleId, new Date(cutoff), now, query.recipientId ?? null],
              )
            ).rows;
          },
          async changeStatus(id, body) {
            let dose = await one(
              `SELECT ${doseColumns} FROM medication_occurrences WHERE circle_id = $1 AND id = $2 FOR UPDATE`,
              [circleId, id],
            );
            if (!dose) throw notFound();
            if (dose.version !== body.version)
              throw conflict(
                'This dose changed in another tab or by another caregiver. Refresh the list and review its current status.',
              );
            const definition = await medication(dose.medicationId);
            const from = dose.scheduledAt.toISOString();
            const to = new Date(dose.scheduledAt.getTime() + 1).toISOString();
            const expected = generateMedicationDoses(definition, from, to)[0];
            if (
              dose.status === 'completed' &&
              body.status === 'pending' &&
              (!expected || expected.recipientId !== dose.recipientId)
            ) {
              throw httpError(
                409,
                'schedule_conflict',
                'This taken dose is no longer in the current schedule for this care profile and cannot be marked pending. Its taken history has been kept.',
              );
            }
            if (dose.status === 'pending') {
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
            taken_at = CASE WHEN $3 = 'completed' THEN clock_timestamp() ELSE NULL END
            WHERE circle_id = $1 AND id = $2 AND version = $4 RETURNING ${doseColumns}`,
              [circleId, id, body.status, body.version],
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
};
