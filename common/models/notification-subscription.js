const { error } = require("../util");

module.exports = NotificationSubscription => {
  // subscribe user for push notification
  NotificationSubscription.subscribe = async (deviceToken, userId) => {
    const { UserAccount } = NotificationSubscription.app.models;

    // find current user
    const user = await UserAccount.findById(userId);
    if (!user) throw error("Unknown User", 403);

    await NotificationSubscription.findOrCreate(
      { where: { userAccountId: userId, deviceToken } },
      {
        userAccountId: userId,
        deviceToken
      }
    );

    return { status: true };
  };

  NotificationSubscription.remoteMethod("subscribe", {
    description: "subscribe user for push notification",
    accepts: [
      { arg: "deviceToken", type: "string", required: true },
      { arg: "userId", type: "string", required: true }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/subscribe" }
  });

  // unsubscribe user for push notification
  NotificationSubscription.unsubscribe = async userId => {
    const { UserAccount } = NotificationSubscription.app.models;

    // find current user
    const user = await UserAccount.findById(userId);
    if (!user) return { status: false, message: "Unknown User" };

    await NotificationSubscription.destroyAll({
      userAccountId: userId || 0
    });
    return { status: true };
  };

  NotificationSubscription.remoteMethod("unsubscribe", {
    description: "unsubscribe user for push notification",
    accepts: [{ arg: "userId", type: "string", required: true }],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/unsubscribe" }
  });
};
