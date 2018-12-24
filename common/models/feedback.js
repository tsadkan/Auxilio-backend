const {
  error,
  validatesAbsenceOf,
  validateRequiredFields
} = require("../util");

module.exports = function(Feedback) {
  Feedback.validatesPresenceOf("createdById", {
    message: "createdById is required"
  });
  Feedback.validatesPresenceOf("postId", { message: "postId is required" });

  // update feedback
  Feedback.updateMyFeedBack = async (accessToken, body) => {
    const fields = ["id", "body", "files"];
    const requiredFields = ["id"];

    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    validateRequiredFields(requiredFields, body);
    validatesAbsenceOf(fields, body);

    const feedback = await Feedback.findOne({
      where: {
        id: body.id
      },
      include: {
        relation: "createdBy"
      }
    });

    // check if the feedback is created by this user
    if (accessToken.userId !== feedback.createdBy.id)
      throw error("Cannot update others feedback.", 403);

    delete body.id;
    await feedback.patchAttributes({ ...body });

    return { status: true };
  };
  Feedback.remoteMethod("updateMyFeedback", {
    description: "Update users's feedback.",
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
    http: { verb: "put", path: "/update-my-feedback" }
  });

  // delete feedback
  Feedback.deleteMyFeedback = async (accessToken, feedbackId) => {
    const { FeedbackReplay } = Feedback.app.models;

    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    const feedback = await Feedback.findOne({
      where: {
        id: feedbackId
      },
      include: {
        relation: "createdBy"
      }
    });

    // check if the feedback is created by this user
    if (accessToken.userId !== feedback.createdBy.id)
      throw error("Cannot delete others feedback.", 403);

    await Feedback.destroyById(feedbackId);
    await FeedbackReplay.destroyAll({
      where: {
        feedbackId
      }
    });

    return { status: true };
  };
  Feedback.remoteMethod("deleteMyFeedback", {
    description: "delete users's feedback.",
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
      { arg: "feedbackId", type: "string", http: { source: "body" } }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "delete", path: "/delete-my-feedback" }
  });
};
