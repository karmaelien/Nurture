const CONFLICTS = {
  users_email_key: {
    code: 'email_taken',
    message: 'That email already has an account. Log in instead, or use a different email.',
  },
  circle_members_pkey: {
    code: 'already_member',
    message: 'That person is already in this circle.',
  },
};

module.exports = (err, req, res, next) => {
  if (err.code === '23505') {
    const conflict = CONFLICTS[err.constraint] ?? {
      code: 'conflict',
      message: 'That already exists.',
    };
    return res.status(409).json({ error: conflict });
  }

  const status = err.status || 500;
  if (status === 500) console.error(err); // log real bugs, but don't leak details
  
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'validation_error', message: 'The request body must be valid JSON.' },
    });
}
  res.status(status).json({
    error: {
      code: err.errorCode || (status === 500 ? 'internal_error' : 'error'),
      message: status === 500 ? 'Something went wrong.' : err.message,
    },
  });
};