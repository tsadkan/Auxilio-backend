const {
  error,
  validatesAbsenceOf,
  validateRequiredFields
} = require("../util");

module.exports = function(FeedbackReplay) {
  FeedbackReplay.validatesPresenceOf("createdById", {
    message: "createdById is required"
  });
  FeedbackReplay.validatesPresenceOf("postId", {
    message: "postId is required"
  });
  FeedbackReplay.validatesPresenceOf("feedbackId", {
    message: "feedbackId is required"
  });

  // update feedback reply
  FeedbackReplay.updateMyReply = async (accessToken, body) => {
    const fields = ["id", "body", "files"];
    const requiredFields = ["id"];

    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    validateRequiredFields(requiredFields, body);
    validatesAbsenceOf(fields, body);

    const reply = await FeedbackReplay.findOne({
      where: {
        id: body.id
      },
      include: {
        relation: "createdBy"
      }
    });

    // check if the reply is created by this user
    if (accessToken.userId !== reply.createdBy.id)
      throw error("Cannot update others reply.", 403);

    delete body.id;
    await reply.patchAttributes({ ...body });

    return { status: true };
  };
  FeedbackReplay.remoteMethod("updateMyReply", {
    description: "Update users's reply.",
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
      { arg: "body", type: "object", http: { source: "body" } }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "put", path: "/update-my-reply" }
  });

  // delete feedback reply
  FeedbackReplay.deleteMyReply = async (accessToken, replyId) => {
    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    const reply = await FeedbackReplay.findOne({
      where: {
        id: replyId
      },
      include: {
        relation: "createdBy"
      }
    });

    // check if the reply is created by this user
    if (accessToken.userId !== reply.createdBy.id)
      throw error("Cannot delete others reply.", 403);

    await FeedbackReplay.destroyById(replyId);

    return { status: true };
  };
  FeedbackReplay.remoteMethod("deleteMyReply", {
    description: "delete users's reply.",
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
      { arg: "replyId", type: "string", http: { source: "body" } }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "delete", path: "/delete-my-feedback-reply" }
  });
};
