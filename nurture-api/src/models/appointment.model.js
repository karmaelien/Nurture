const columns = `id::text, recipient_id::text AS "recipientId", title,
  starts_at AS "startsAt", ends_at AS "endsAt", location,
  assigned_caregiver_id::text AS "assignedCaregiverId", status`;
const detailValues = body => [
  body.recipientId, body.title, body.startsAt, body.endsAt, body.location, body.assignedCaregiverId,
];

module.exports = function appointmentModel(db) {
  const one = async (sql, values) => (await db.query(sql, values)).rows[0];
  return {
    async isMember(circleId, userId) {
      return Boolean(await one('SELECT 1 FROM circle_members WHERE circle_id = $1 AND user_id = $2', [circleId, userId]));
    },
    async hasRecipient(circleId, recipientId) {
      return Boolean(await one('SELECT 1 FROM recipients WHERE circle_id = $1 AND id = $2', [circleId, recipientId]));
    },
    async list(circleId, { from, to, recipientId }) {
      const result = await db.query(
        `SELECT ${columns} FROM appointments
         WHERE circle_id = $1 AND starts_at >= $2 AND starts_at < $3
           AND ($4::int IS NULL OR recipient_id = $4)
         ORDER BY starts_at, appointments.id`,
        [circleId, from, to, recipientId ?? null],
      );
      return result.rows;
    },
    create: (circleId, body) => one(
      `INSERT INTO appointments (circle_id, recipient_id, title, starts_at, ends_at, location, assigned_caregiver_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${columns}`,
      [circleId, ...detailValues(body)],
    ),
    updateDetails: (circleId, id, body) => one(
      `UPDATE appointments
       SET recipient_id = $3, title = $4, starts_at = $5, ends_at = $6, location = $7, assigned_caregiver_id = $8
       WHERE circle_id = $1 AND id = $2 RETURNING ${columns}`,
      [circleId, id, ...detailValues(body)],
    ),
    updateStatus: (circleId, id, status) => one(
      `UPDATE appointments SET status = $3 WHERE circle_id = $1 AND id = $2 RETURNING ${columns}`,
      [circleId, id, status],
    ),
    async remove(circleId, id) {
      const result = await db.query('DELETE FROM appointments WHERE circle_id = $1 AND id = $2', [circleId, id]);
      return result.rowCount > 0;
    },
  };
};
