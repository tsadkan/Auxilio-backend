module.exports = {
  error(message, code) {
    const e = new Error(message || "Internal Server Error");
    e.status = code || 500;
    e.expose = true;
    return e;
  },
  validatesAbsenceOf: (fields, data) => {
    for (const key in data) {
      if (fields.indexOf(key) === -1) {
        throw Error(`property ${key} doesn't exist.`, 422);
      }
    }
  }
};
