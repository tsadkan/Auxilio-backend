module.exports = NotificationConfig => {
  /**
   * Update or create notification setting for a user
   */
  NotificationConfig.updateConfig = async (accessToken, configData) => {
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const { userId } = accessToken;

    if (configData.onSubTopicCreate) {
      configData.onMySubTopicCreate = false;
    }
    if (configData.onFeedbackCreate) {
      configData.onMyFeedbackCreate = false;
    }
    if (configData.onReplyCreate) {
      configData.onMyReplyCreate = false;
    }

    await NotificationConfig.upsertWithWhere(
      {
        userAccountId: userId || "GARBAGE"
      },
      {
        userAccountId: userId,
        ...configData
      }
    );
    return { status: true };
  };
  NotificationConfig.remoteMethod("updateConfig", {
    description: "Update notification config for a user",
    accepts: [
      {
        arg: "accessToken",
        type: "object",
        http: ctx => {
          const req = ctx && ctx.req;
          const accessToken = req && req.accessToken;
          return accessToken ? req.accessToken : null;
        }
      },
      { arg: "configData", type: "object", required: true }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/update-config" }
  });

  /**
   * return notification config for the user
   */
  NotificationConfig.getConfig = async accessToken => {
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const { userId } = accessToken;

    const config = await NotificationConfig.findOne({
      where: {
        userAccountId: userId
      },
      scope: {
        fields: {
          onFeedbackCreate: true,
          onMyFeedbackCreate: true,
          onMyReplyCreate: true,
          onMySubTopicCreate: true,
          onReplyCreate: true,
          onSubTopicCreate: true,
          onTopicCreate: true
        }
      }
    });

    return config || {};
  };
  NotificationConfig.remoteMethod("getConfig", {
    description: "get notification config for a user",
    accepts: [
      {
        arg: "accessToken",
        type: "object",
        http: ctx => {
          const req = ctx && ctx.req;
          const accessToken = req && req.accessToken;
          return accessToken ? req.accessToken : null;
        }
      }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "get", path: "/get-config" }
  });
};
