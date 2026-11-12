const isProduction = process.env.NODE_ENV === 'production';

// Fields that describe what went wrong without the values involved.
// Postgres puts user data in message, detail, hint and where, so those are left out.
const safeError = (err) => ({
  name: err.name,
  code: err.code,             // Postgres error code, such as '23503'
  constraint: err.constraint,
  table: err.table,
  column: err.column,
  stack: err.stack?.split('\n').slice(1).join('\n'), // the first line repeats the message
});

exports.safeError = safeError;

exports.logError = (err, req) => {
  if (!isProduction) {
    console.error(err); // full detail on your own machine
    return;
  }
  console.error(JSON.stringify({
    level: 'error',
    requestId: req?.id,
    method: req?.method,
    // The route pattern, such as /api/circles/:circleId, so no IDs or query strings
    route: req?.route ? req.baseUrl + req.route.path : undefined,
    ...safeError(err),
  }));
};