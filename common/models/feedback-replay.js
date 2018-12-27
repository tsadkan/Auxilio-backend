const fs = require("fs");
const formidable = require("formidable");
const {
  error,
  validatesAbsenceOf,
  validateRequiredFields
} = require("../util");

module.exports = function(FeedbackReply) {
  const BUCKET = "feedback-reply";

  FeedbackReply.validatesPresenceOf("createdById", {
    message: "createdById is required"
  });
  FeedbackReply.validatesPresenceOf("postId", {
    message: "postId is required"
  });
  FeedbackReply.validatesPresenceOf("feedbackId", {
    message: "feedbackId is required"
  });

  // update feedback reply
  FeedbackReply.updateMyReply = async (accessToken, req, res) => {
    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    const {
      name: storageName,
      root: storageRoot
    } = FeedbackReply.app.dataSources.storage.settings;

    if (storageName === "storage") {
      const path = `${storageRoot}/${BUCKET}/`;

      if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
      }
    } else throw Error("Unknown Storage", 400);

    const { Container } = FeedbackReply.app.models;
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

      const requiredFields = ["replyId"];
      const abscencefields = ["id", "body", "replyId"];

      validateRequiredFields(requiredFields, fields);
      validatesAbsenceOf(abscencefields, fields);

      const { replyId } = fields;
      const reply = await FeedbackReply.findOne({
        where: {
          id: replyId
        },
        include: ["createdBy"]
      });

      if (!reply) throw error("reply doesn't exist.", 403);

      // check if the reply is created by this user
      if (accessToken.userId.toString() !== reply.createdBy().id.toString())
        throw error("Cannot update others reply.", 403);

      delete fields.id;
      delete fields.replyId;
      await reply.patchAttributes({ ...fields, files });

      return reply;
    } catch (err) {
      throw err;
    }
  };

  FeedbackReply.remoteMethod("updateMyReply", {
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
      { arg: "req", type: "object", http: { source: "req" } },
      { arg: "res", type: "object", http: { source: "res" } }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "patch", path: "/update-my-reply" }
  });

  // delete feedback reply
  FeedbackReply.deleteMyReply = async (accessToken, replyId) => {
    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    const reply = await FeedbackReply.findOne({
      where: {
        id: replyId
      },
      include: {
        relation: "createdBy"
      }
    });

    if (!reply) throw error("feedback reply doesn't exist.", 403);

    // check if the reply is created by this user
    if (accessToken.userId.toString() !== reply.createdBy().id.toString())
      throw error("Cannot delete others reply.", 403);

    await FeedbackReply.destroyById(replyId);

    return { status: true };
  };
  FeedbackReply.remoteMethod("deleteMyReply", {
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
      { arg: "replyId", type: "string" }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "delete", path: "/delete-my-reply" }
  });

  FeedbackReply.createReply = async (accessToken, req, res) => {
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const {
      name: storageName,
      root: storageRoot
    } = FeedbackReply.app.dataSources.storage.settings;

    if (storageName === "storage") {
      const path = `${storageRoot}/${BUCKET}/`;

      if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
      }
    } else throw Error("Unknown Storage", 400);

    const { Container } = FeedbackReply.app.models;
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

      const requiredFields = ["body", "feedbackId"];
      validateRequiredFields(requiredFields, fields);

      const { body, feedbackId } = fields;

      const { Feedback } = FeedbackReply.app.models;
      const feedback = await Feedback.findOne({ where: { id: feedbackId } });

      if (!feedback) {
        throw error("Invalid feedback Id", 422);
      }
      const reply = await FeedbackReply.create({
        body,
        files,
        postId: feedback.postId,
        feedbackId,
        createdById: accessToken.userId,
        container: BUCKET
      });

      return reply;
    } catch (err) {
      throw err;
    }
  };

  FeedbackReply.remoteMethod("createReply", {
    description: "Create reply with uploaded file.",
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
    http: { verb: "post", path: "/create-reply" }
  });
};
