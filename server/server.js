const debug = require("debug")("App:Server");
const loopback = require("loopback");
const boot = require("loopback-boot");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const config = require("./config.json");
const validatePresenceOfEnvVars = require("../common/util/env");
const logger = require("./logger");

const app = loopback();
app.logger = logger;
require("loopback-row-count-mixin")(app);

app.logger.info(`NODE_ENV: ${process.env.NODE_ENV}`);

validatePresenceOfEnvVars([
  "MONGO_PRODUCTION_URI",
  "RESET_PASSWORD_URL",
  "ADMIN_EMAIL",
  "ADMIN_PASS"
]);

const rateLimiter = new RateLimiterMemory({
  points: 3,
  duration: 1,
  blockDuration: 10
});
app.use(`${config.restApiRoot}/UserAccounts/*`, async (req, res, next) => {
  try {
    await rateLimiter.consume(req.connection.remoteAddress);
    next();
  } catch (err) {
    res.status(429).send("Too many requests");
  }
});

app.start = function() {
  // start the web server
  return app.listen(() => {
    app.emit("started");
    const baseUrl = app.get("url").replace(/\/$/, "");
    // eslint-disable-next-line
    debug("Web server listening at: %s", baseUrl);
    if (app.get("loopback-component-explorer")) {
      const explorerPath = app.get("loopback-component-explorer").mountPath;
      // eslint-disable-next-line
      debug("Browse your REST API at %s%s", baseUrl, explorerPath);
    }
  });
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, err => {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module) app.start();
});

module.exports = app;
