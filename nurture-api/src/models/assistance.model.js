const { httpError } = require('../utils/httpErrors');
const notFound = () =>
  httpError(
    404,
    'not_found',
    'This medication, assistance report, or care circle is unavailable.',
  );
const columns = `id::text, circle_id::text AS "circleId", medication_id::text AS "medicationId",
  medication_name AS "medicationName", recipient_id::text AS "recipientId", reason,
  previous_cost_cents AS "previousCostCents", current_cost_cents AS "currentCostCents", notes,
  reported_by::text AS "reportedBy", created_at AS "createdAt", dismissed_at AS "dismissedAt", version`;

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
      // Retain membership through the transaction, including idempotent retries and dismissals.
      if (
        !(await one(
          'SELECT 1 FROM circle_members WHERE circle_id=$1 AND user_id=$2 FOR SHARE',
          [circleId, userId],
        ))
      )
        throw notFound();
      return action({
        async get(id) {
          const report = await one(
            `SELECT ${columns} FROM patient_assistance_reports WHERE circle_id=$1 AND id=$2`,
            [circleId, id],
          );
          if (!report) throw notFound();
          return report;
        },
        async list(filters) {
          if (
            filters.recipientId &&
            !(await one(
              'SELECT 1 FROM recipients WHERE circle_id=$1 AND id=$2',
              [circleId, filters.recipientId],
            ))
          )
            throw notFound();
          const values = [circleId];
          let where = 'circle_id=$1';
          if (filters.recipientId) {
            values.push(filters.recipientId);
            where += ` AND recipient_id=$${values.length}`;
          }
          if (filters.status !== 'all')
            where += ` AND dismissed_at IS ${filters.status === 'active' ? '' : 'NOT '}NULL`;
          const countWhere = where;
          if (filters.cursor) {
            const [at, id] = filters.cursor.split('|');
            values.push(at, id);
            where += ` AND (date_trunc('milliseconds', created_at),id) < ($${values.length - 1}::timestamptz,$${values.length}::uuid)`;
          }
          // Count and page share one statement snapshot, even if another caregiver
          // creates/dismisses a report while this request is running. LEFT JOIN
          // retains the total when the requested page is empty.
          const result = await tx.query(
            `SELECT page.*, total.count AS "totalCount"
             FROM (SELECT count(*)::int AS count FROM patient_assistance_reports WHERE ${countWhere}) total
             LEFT JOIN LATERAL (
               SELECT ${columns} FROM patient_assistance_reports WHERE ${where}
               ORDER BY date_trunc('milliseconds', created_at) DESC,id DESC LIMIT 51
             ) page ON TRUE
             ORDER BY date_trunc('milliseconds', page."createdAt") DESC,page.id DESC`,
            values,
          );
          const rows = result.rows
            .filter((row) => row.id)
            .map(({ totalCount, ...report }) => report);
          const reports = rows.slice(0, 50),
            last = reports.at(-1);
          return {
            reports,
            totalCount: result.rows[0].totalCount,
            nextCursor:
              rows.length > 50 && last
                ? `${last.createdAt.toISOString()}|${last.id}`
                : null,
          };
        },
        async create(body) {
          const { requestId, ...input } = body;
          // Snapshot access and medication identity before insertion; never trust supplied names/person IDs.
          const existing = await one(
            `SELECT ${columns}, request_body AS request FROM patient_assistance_reports WHERE circle_id=$1 AND id=$2`,
            [circleId, requestId],
          );
          const same = (row) =>
            row.reportedBy === String(userId) &&
            Object.entries(input).every(
              ([key, value]) => row.request[key] === value,
            );
          if (existing) {
            if (!same(existing))
              throw httpError(
                409,
                'report_conflict',
                'This report request was already used. Reopen the report form.',
              );
            delete existing.request;
            return existing;
          }
          const medication = await one(
            'SELECT name,recipient_id FROM medications WHERE circle_id=$1 AND id=$2 FOR SHARE',
            [circleId, input.medicationId],
          );
          if (!medication) throw notFound();
          const saved = await one(
            `INSERT INTO patient_assistance_reports
          (id,circle_id,recipient_id,medication_id,medication_name,reason,previous_cost_cents,current_cost_cents,notes,reported_by,request_body)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING RETURNING ${columns}`,
            [
              requestId,
              circleId,
              medication.recipient_id,
              input.medicationId,
              medication.name,
              input.reason,
              input.previousCostCents,
              input.currentCostCents,
              input.notes,
              userId,
              input,
            ],
          );
          if (saved) return saved;
          const duplicate = await one(
            `SELECT ${columns}, request_body AS request FROM patient_assistance_reports WHERE circle_id=$1 AND id=$2`,
            [circleId, requestId],
          );
          if (!duplicate || !same(duplicate))
            throw httpError(
              409,
              'report_conflict',
              'This report request was already used. Reopen the report form.',
            );
          delete duplicate.request;
          return duplicate;
        },
        async notification(id, body) {
          const current = await one(
            `SELECT ${columns} FROM patient_assistance_reports WHERE circle_id=$1 AND id=$2 FOR UPDATE`,
            [circleId, id],
          );
          if (!current) throw notFound();
          if (current.version !== body.version)
            throw httpError(
              409,
              'edit_conflict',
              'This notification changed. Review the refreshed list before trying again.',
            );
          if (!!current.dismissedAt === body.dismissed) return current;
          // Only notification state changes: reported prices/coverage and original metadata are immutable.
          return one(
            `UPDATE patient_assistance_reports SET dismissed_at=${body.dismissed ? 'clock_timestamp()' : 'NULL'},version=version+1 WHERE circle_id=$1 AND id=$2 RETURNING ${columns}`,
            [circleId, id],
          );
        },
      });
    }),
});
