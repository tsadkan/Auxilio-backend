const debug = require("debug")("App:Server");
const loopback = require("loopback");
const boot = require("loopback-boot");
const result = require("dotenv").config();

const logger = require("./logger");

const app = loopback();
app.logger = logger;
require("loopback-row-count-mixin")(app);

app.logger.info(`NODE_ENV: ${process.env.NODE_ENV}`);

if (process.env.NODE_ENV === "production") {
  if (!result.parsed || !result.parsed.MONGO_PRODUCTION_URI) {
    // eslint-disable-next-line
console.log(
      `--------------------------------------------------------------------
| MONGO_PRODUCTION_URI is required environment  variable.\n| Either user .env file or export on your terminal to define it.
--------------------------------------------------------------------
    `
    );
    process.exit(-1);
  }
}
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
