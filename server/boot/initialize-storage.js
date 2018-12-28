const fs = require("fs");

/**
 * This boot script set's up app storage buckets
 *
 * Since this app is using local filesystem provider
 * it is simply creating the bucket directory if not exist
 */
const APP_BUCKETS = ["users", "post", "feedback", "feedback-reply"];

module.exports = app => {
  const { name, root } = app.dataSources.storage.settings;
  if (name === "storage") {
    for (const bucket of APP_BUCKETS) {
      const path = `${root}/${bucket}/`;
      if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
      }
    }
  }
};
