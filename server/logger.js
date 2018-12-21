const winston = require("winston");

const consoleLoggerFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.align(),
  winston.format.printf(info => {
    const { timestamp, level, message, ...args } = info;
    const ts = timestamp.slice(0, 19).replace("T", " ");
    return `${ts} [${level}]:${message} ${
      Object.keys(args).length ? JSON.stringify(args, null, 2) : ""
    }`;
  })
);

const fileLoggerFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.align(),
  winston.format.printf(info => {
    const { timestamp, level, message, ...args } = info;
    const ts = timestamp.slice(0, 19).replace("T", " ");
    return `${ts} [${level}]:${message} ${
      Object.keys(args).length ? JSON.stringify(args, null, 2) : ""
    }`;
  })
);

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({
      format: fileLoggerFormat,
      filename: "./logs/info.log",
      level: "info"
    }),
    new winston.transports.File({
      format: fileLoggerFormat,
      filename: "./logs/warn.log",
      level: "warn"
    }),
    new winston.transports.File({
      format: fileLoggerFormat,
      filename: "./logs/error.log",
      level: "error"
    })
  ]
});
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: consoleLoggerFormat
    })
  );
}

module.exports = logger;
