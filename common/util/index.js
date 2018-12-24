const getError = (message, code) => {
  const e = new Error(message || "Internal Server Error!");
  e.status = code || 500;
  e.expose = true;
  return e;
};

module.exports = {
  error: getError,
  validateRequiredFields: (fields, data) => {
    for (let i = 0, l = fields.length; i < l; i += 1) {
      if (Object.keys(data).indexOf(fields[i]) === -1) {
        throw getError(`property ${fields} is required`, 422);
      }
    }
  },
  validatesAbsenceOf: (fields, data) => {
    for (const key in data) {
      if (fields.indexOf(key) === -1) {
        throw getError(`property ${key} doesn't exist.`, 422);
      }
    }
  }
};
