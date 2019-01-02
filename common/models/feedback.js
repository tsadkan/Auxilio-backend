const formidable = require("formidable");
const {
  error,
  validatesAbsenceOf,
  validateRequiredFields
} = require("../util");

module.exports = function(Feedback) {
  const BUCKET = "feedback";

  Feedback.validatesPresenceOf("createdById", {
    message: "createdById is required"
  });
  Feedback.validatesPresenceOf("postId", { message: "postId is required" });

  /**
   * @todo REFACTOR ME , THIS IS REALLY SHITTY
   * Attach users voted status for a post
   * @param {Array} feedbacks
   */
  const includeUserFeedbackVoteStatus = async (userId, feedback) => {
    const { UserFeedbackVote } = Feedback.app.models;
    // eslint-disable-next-line
    const reaction = await UserFeedbackVote.findOne({
      where: {
        userId,
        feedbackId: feedback.id
      }
    });
    feedback.voted = (reaction && reaction.vote) || 0;
    return feedback;
  };

  /**
   * @todo REFACTOR ME , THIS IS REALLY SHITTY
   * Attach up vote & down vote amount for feedbacks
   * @param {Array} feedbacks
   */
  const includeFeedbackVotes = async feedback => {
    const { UserFeedbackVote } = Feedback.app.models;
    const feedbackVotes = await UserFeedbackVote.find({
      where: { feedbackId: feedback.id }
    });

    if (!feedbackVotes || !feedbackVotes.length) {
      feedback.upVote = 0;
      feedback.downVote = 0;
      return feedback;
    }
    feedback.upVote = 0;
    feedback.downVote = 0;
    for (const feedbackVote of feedbackVotes) {
      if (feedbackVote.feedbackId.toString() === feedback.id.toString()) {
        if (feedbackVote.vote === 1) {
          feedback.upVote += 1;
        }
        if (feedbackVote.vote === -1) {
          feedback.downVote += 1;
        }
      }
    }
    return feedback;
  };

  // update feedback
  Feedback.updateMyFeedback = async (accessToken, req, res) => {
    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    const { Container } = Feedback.app.models;
    const form = new formidable.IncomingForm();

    const filePromise = new Promise(resolve => {
      const filesInfo = Container.customUpload(req, res, BUCKET);

      return resolve(filesInfo);
    });

    const fieldsPromise = new Promise((resolve, reject) => {
      form.parse(req, (err, fields) => {
        if (err) return reject(err);

        return resolve(fields);
      });
    });

    try {
      const [filesInfo, fields] = await Promise.all([
        filePromise,
        fieldsPromise
      ]);
      // check if there are file ... if not make it undefined
      const files = filesInfo.file
        ? filesInfo.file.map(file => ({
            name: file.name,
            size: file.size,
            originalName: file.originalFilename,
            fileType: file.type
          }))
        : undefined;

      const requiredFields = ["id"];
      const abscencefields = ["id", "body"];

      validateRequiredFields(requiredFields, fields);
      validatesAbsenceOf(abscencefields, fields);

      const { id } = fields;

      const feedback = await Feedback.findOne({ where: { id } });

      if (!feedback) throw error("feedback doesn't exist.", 403);

      const { userId } = accessToken;
      const { isAdmin } = accessToken.userInfo;
      // check if the feedback is created by this user
      if (userId.toString() !== feedback.createdById.toString() && !isAdmin)
        throw error("Cannot update others feedback.", 403);

      delete fields.id;
      await feedback.patchAttributes({ ...fields, files });

      let result = await Feedback.findOne({
        where: { id },
        include: [
          {
            relation: "replies"
          },
          {
            relation: "createdBy",
            scope: {
              fields: { fullName: true, email: true, profilePicture: true }
            }
          }
        ]
      });
      // @TODO REFACTOR ME
      result = await includeUserFeedbackVoteStatus(userId, result);
      result = await includeFeedbackVotes(result);
      result.isOwner = true;
      return result;
    } catch (err) {
      throw err;
    }
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
      { arg: "req", type: "object", http: { source: "req" } },
      { arg: "res", type: "object", http: { source: "res" } }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "patch", path: "/update-my-feedback" }
  });

  // delete feedback
  Feedback.deleteMyFeedback = async (accessToken, feedbackId) => {
    const { FeedbackReply } = Feedback.app.models;

    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);
    if (!feedbackId) throw error("feedbackId is required", 403);

    const feedback = await Feedback.findOne({
      where: {
        id: feedbackId
      },
      include: {
        relation: "createdBy"
      }
    });

    if (!feedback) throw error("feedback doesn't exist.", 403);

    const { userId } = accessToken;
    const { isAdmin } = accessToken.userInfo;
    // check if the feedback is created by this user
    if (userId.toString() !== feedback.createdById.toString() && !isAdmin)
      throw error("Cannot delete others feedback.", 403);

    await Feedback.destroyById(feedbackId);
    await FeedbackReply.destroyAll({
      feedbackId
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
      { arg: "feedbackId", type: "string" }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "delete", path: "/delete-my-feedback" }
  });

  Feedback.createFeedback = async (accessToken, req, res) => {
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const { Container } = Feedback.app.models;
    const form = new formidable.IncomingForm();

    const filePromise = new Promise(resolve => {
      const filesInfo = Container.customUpload(req, res, BUCKET);

      return resolve(filesInfo);
    });

    const fieldsPromise = new Promise((resolve, reject) => {
      form.parse(req, (err, fields) => {
        if (err) return reject(err);

        return resolve(fields);
      });
    });

    try {
      const [filesInfo, fields] = await Promise.all([
        filePromise,
        fieldsPromise
      ]);

      const requiredFields = ["body", "postId"];
      validateRequiredFields(requiredFields, fields);

      const { body, postId, fileMeta } = fields;

      let year;
      let summary;
      let bibliography;
      let title;
      if (fileMeta && JSON.parse(fileMeta)) {
        ({ title, year, summary, bibliography } = JSON.parse(fileMeta));
      }

      // check if there are file ... if not make it undefined
      const files = filesInfo.file
        ? filesInfo.file.map(file => ({
            file: {
              name: file.name,
              size: file.size,
              originalName: file.originalFilename,
              fileType: file.type
            },
            meta: {
              title,
              year,
              summary,
              bibliography
            }
          }))
        : undefined;

      const feedback = await Feedback.create({
        body,
        files,
        postId,
        createdById: accessToken.userId,
        container: BUCKET
      });

      const result = await Feedback.findOne({
        where: { id: feedback.id },
        include: [
          {
            relation: "createdBy",
            scope: {
              fields: { fullName: true, email: true, profilePicture: true }
            }
          }
        ]
      });
      result.isOwner = true;
      return result;
    } catch (err) {
      throw err;
    }
  };

  Feedback.remoteMethod("createFeedback", {
    description: "Create feedback with uploaded file.",
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
      { arg: "req", type: "object", http: { source: "req" } },
      { arg: "res", type: "object", http: { source: "res" } }
    ],
    returns: {
      arg: "fileObject",
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/create-feedback" }
  });
};
