const result = require("dotenv").config();

/**
 * validates presence of listed environment variables
 * @param {[]String} variables
 */
function validatePresenceOfEnvVars(variables) {
  for (const variable of variables) {
    if (!result.parsed || !result.parsed[variable]) {
      // eslint-disable-next-line
      console.log(`----------------------------------------------------`);
      // eslint-disable-next-line
      console.log(`${variable} is required environment  variable.\nEither user .env file or export on your terminal to define it.
      `);
      // eslint-disable-next-line
      console.log(`----------------------------------------------------`);
      process.exit(-1);
    }
  }
}

module.exports = validatePresenceOfEnvVars;
