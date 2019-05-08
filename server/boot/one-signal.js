const R = require("request-promise");

const { ONESIGNAL_APP_ID, ONE_SIGNAL_REST_API_KEY } = process.env;
const NOTIFICATION_URL = "https://onesignal.com/api/v1/notifications";

/**
 * One signal Service for the app
 */
module.exports = function(app) {
  app.ONE_SIGNAL = {
    /**
     * Sends sms using the mGov SMS REST API
     * @param {String} headin, phonenumber to send excluding country code e.g 0911121314
     * @param {String} message , the message to send it should be maximum of 160 characters to fit in a single message
     * @throws any error related to the SMS API
     */
    // eslint-disable-next-line
    async send(headings, contents, include_player_ids) {
      // eslint-disable-next-line no-console
      console.log(ONESIGNAL_APP_ID, ONE_SIGNAL_REST_API_KEY);

      const json = {
        app_id: ONESIGNAL_APP_ID,
        headings,
        contents,
        include_player_ids,
        small_icon: "./app_icon.png",
        large_icon: "./app_icon.png",
        icon: "./app_icon.png"
      };

      const option = {
        method: "POST",
        uri: NOTIFICATION_URL,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Basic ${ONE_SIGNAL_REST_API_KEY}`
        },
        json
      };

      try {
        const result = await R(option);
        return result;
      } catch (error) {
        throw error;
      }
    }
  };
};
