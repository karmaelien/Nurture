exports.httpError = (status, code, message) => {
  const err = new Error(message);
  err.status = status;
  err.errorCode = code;
  return err;
};