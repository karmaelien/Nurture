// Accept the shared pool in production and an isolated connection in integration tests.
module.exports = function expenseModel(db) {
  const columns = `id::text, recipient_id::text AS "recipientId", description, category,
    amount_cents::text AS "amountCents", currency, to_char(incurred_on, 'YYYY-MM-DD') AS "incurredOn"`;
  const serialize = row => row ? { ...row, amountCents: Number(row.amountCents) } : null;
  const one = async (sql, values) => serialize((await db.query(sql, values)).rows[0]);
  return {
    async isMember(circleId, userId) {
      return (await db.query('SELECT 1 FROM circle_members WHERE circle_id = $1 AND user_id = $2', [circleId, userId])).rowCount > 0;
    },
    async hasRecipient(circleId, recipientId) {
      return (await db.query('SELECT 1 FROM recipients WHERE circle_id = $1 AND id = $2', [circleId, recipientId])).rowCount > 0;
    },
    find: (circleId, id) => one(`SELECT ${columns} FROM expenses WHERE circle_id = $1 AND id = $2`, [circleId, id]),
    async list(circleId, filters) {
      const values = [circleId, filters.fromDate, filters.toDate];
      let where = 'circle_id = $1 AND incurred_on >= $2 AND incurred_on < $3';
      if (filters.recipientId) { values.push(filters.recipientId); where += ` AND recipient_id = $${values.length}`; }
      if (filters.category) { values.push(filters.category); where += ` AND category = $${values.length}`; }
      const result = await db.query(`SELECT ${columns} FROM expenses WHERE ${where} ORDER BY incurred_on DESC, expenses.id ASC`, values);
      return result.rows.map(serialize);
    },
    create: (circleId, body) => one(`INSERT INTO expenses
      (circle_id, recipient_id, description, category, amount_cents, currency, incurred_on)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${columns}`,
      [circleId, body.recipientId, body.description, body.category, body.amountCents, body.currency, body.incurredOn]),
    update(circleId, id, body) {
      const names = { recipientId: 'recipient_id', description: 'description', category: 'category', amountCents: 'amount_cents', currency: 'currency', incurredOn: 'incurred_on' };
      const entries = Object.entries(body);
      const assignments = entries.map(([key], index) => `${names[key]} = $${index + 3}`);
      return one(`UPDATE expenses SET ${assignments.join(', ')} WHERE circle_id = $1 AND id = $2 RETURNING ${columns}`, [circleId, id, ...entries.map(([, value]) => value)]);
    },
    async remove(circleId, id) {
      return (await db.query('DELETE FROM expenses WHERE circle_id = $1 AND id = $2', [circleId, id])).rowCount > 0;
    },
  };
};
