// IDs in URLs must be whole numbers that fit Postgres INT, or the query fails with a 500.
const MAX_INT = 2147483647;

// Returns the ID as a number, or null if it can't be a real row.
exports.parseId = (value) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return id >= 1 && id <= MAX_INT ? id : null;
};
