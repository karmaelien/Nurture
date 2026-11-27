module.exports = function medicationNotificationModel(db) {
  return {
    async exists(userId, endpoint) {
      const result = await db.query(
        'SELECT 1 FROM medication_push_subscriptions WHERE endpoint = $1 AND user_id = $2',
        [endpoint, userId],
      );
      return result.rowCount > 0;
    },
    save: (userId, subscription) =>
      db.query(
        `
      INSERT INTO medication_push_subscriptions(user_id, endpoint, subscription) VALUES ($1,$2,$3)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, subscription = EXCLUDED.subscription, updated_at = now()`,
        [userId, subscription.endpoint, JSON.stringify(subscription)],
      ),
    remove: (userId, endpoint) =>
      db.query('DELETE FROM medication_push_subscriptions WHERE endpoint = $1 AND user_id = $2', [
        endpoint,
        userId,
      ]),
    pruneDeliveries: () =>
      db.query("DELETE FROM medication_push_deliveries WHERE sent_at < now() - INTERVAL '7 days'"),
    async families() {
      return (
        await db.query(`SELECT cm.circle_id::text AS "circleId", min(cm.user_id)::text AS "userId"
        FROM circle_members cm JOIN medication_push_subscriptions s ON s.user_id = cm.user_id GROUP BY cm.circle_id`)
      ).rows;
    },
    async subscriptions(circleId) {
      return (
        await db.query(
          `SELECT s.id FROM medication_push_subscriptions s
        JOIN circle_members cm ON cm.user_id = s.user_id WHERE cm.circle_id = $1`,
          [circleId],
        )
      ).rows;
    },
    // Keep access, medication and dose locks until the delivery callback commits or rolls back.
    withDelivery: (subscriptionId, doseId, action) =>
      db.transaction(async (tx) => {
        const {
          rows: [row],
        } = await tx.query(
          `
        SELECT s.subscription, s.id, d.status, d.scheduled_at AS "scheduledAt",
          d.overdue_after_minutes AS "overdueAfterMinutes", d.reminder_before_minutes AS "reminderBeforeMinutes",
          d.circle_id::text AS "circleId", m.stopped_at AS "medicationStoppedAt"
        FROM medication_push_subscriptions s
        JOIN medication_occurrences d ON d.id = $2
        JOIN medications m ON m.id = d.medication_id AND m.circle_id = d.circle_id
        JOIN circle_members cm ON cm.circle_id = d.circle_id AND cm.user_id = s.user_id
        WHERE s.id = $1 AND d.status = 'pending'
        FOR SHARE OF cm, m, d FOR UPDATE OF s SKIP LOCKED`,
          [subscriptionId, doseId],
        );
        if (!row) return false;
        return action(row, {
          async claim(kind) {
            const result = await tx.query(
              `INSERT INTO medication_push_deliveries(subscription_id, occurrence_id, kind)
            VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING subscription_id`,
              [subscriptionId, doseId, kind],
            );
            return result.rowCount > 0;
          },
          remove: () => tx.query('DELETE FROM medication_push_subscriptions WHERE id = $1', [subscriptionId]),
        });
      }),
  };
};
