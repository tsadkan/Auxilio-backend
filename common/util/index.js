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
  },
  sort: (array, order) => {
    const orderBy = order.split(" ")[0];
    const asc = order.split(" ")[1] === "ASC";

    if (array && array.length > 1) {
      array.sort((a, b) => {
        if (a[orderBy] < b[orderBy]) {
          return asc ? -1 : 1;
        }
        if (a[orderBy] > b[orderBy]) {
          return asc ? 1 : -1;
        }
        return 0;
      });
    }

    return array;
  }
};
