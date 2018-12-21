module.exports = {
  error(message, code) {
    const e = new Error(message || "Internal Server Error");
    e.status = code || 500;
    e.expose = true;
    return e;
  }
};
