module.exports = (err, req, res, next) => {
  if (err.code === '23505') {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'That value is already in use.' },
    });
  }

  const status = err.status || 500;
  if (status === 500) console.error(err); // log real bugs, but don't leak details

  res.status(status).json({
    error: {
      code: err.errorCode || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR'),
      message: status === 500 ? 'Something went wrong.' : err.message,
    },
  });
};