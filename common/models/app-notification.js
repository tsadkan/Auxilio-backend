const { error } = require("../util");

module.exports = AppNotification => {
  // send push notifications to the subscribed users
  AppNotification.observe("after save", async ctx => {
    if (ctx.instance && ctx.isNewInstance) {
      const { NotificationSubscription } = AppNotification.app.models;
      const notification = ctx.instance;

      const subscriptions = await NotificationSubscription.find({
        where: { userAccountId: notification.userAccountId.toString() }
      });

      const playerIds = subscriptions.map(
        subscription => subscription.deviceToken
      );

      const headings = {
        en: notification.title
      };
      const contents = {
        en: notification.body
      };

      // send push notification if any playerIds exist
      if (playerIds.length > 0)
        await AppNotification.app.ONE_SIGNAL.send(
          headings,
          contents,
          playerIds
        );

      return true;
    }
    return true;
  });

  // list notifications per user
  AppNotification.list = async (limit, skip, userId) => {
    limit = limit || 0;
    skip = skip || 0;

    const count = await AppNotification.count({
      userAccountId: userId
    });
    const list = await AppNotification.find({
      where: { userAccountId: userId },
      limit,
      skip
    });

    return { count, rows: list };
  };
  AppNotification.remoteMethod("list", {
    description: "notification list",
    accepts: [
      { arg: "limit", type: "number" },
      { arg: "skip", type: "number" },
      { arg: "userId", type: "string" }
    ],
    returns: {
      type: "array",
      root: true
    },
    http: { verb: "get", path: "/list" }
  });

  // set seen notification
  AppNotification.seen = async id => {
    const notice = await AppNotification.findById(id);
    if (!notice) throw error("Unknown Data", 422);

    await notice.patchAttributes({ isSeen: true });

    return { status: true };
  };
  AppNotification.remoteMethod("seen", {
    description: "set notification seen",
    accepts: [{ arg: "id", type: "string", required: true }],
    returns: {
      type: "array",
      root: true
    },
    http: { verb: "post", path: "/seen" }
  });

  // set seen notification
  AppNotification.seenAll = async userId => {
    await AppNotification.updateAll(
      { userAccountId: userId },
      { isSeen: true }
    );
    return { status: true };
  };
  AppNotification.remoteMethod("seenAll", {
    description: "set notification seen",
    accepts: [{ arg: "userId", type: "string" }],
    returns: {
      type: "array",
      root: true
    },
    http: { verb: "post", path: "/seen-all" }
  });
};
