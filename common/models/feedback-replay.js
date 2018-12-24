const fs = require("fs");
const formidable = require("formidable");
const {
  error,
  validatesAbsenceOf,
  validateRequiredFields
} = require("../util");

module.exports = function(FeedbackReplay) {
  const BUCKET = "feedback-reply";

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

    if (!reply) throw error("feedback reply doesn't exist.", 403);

    // check if the reply is created by this user
    if (accessToken.userId.toString() !== reply.createdBy().id.toString())
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

    if (!reply) throw error("feedback reply doesn't exist.", 403);

    // check if the reply is created by this user
    if (accessToken.userId.toString() !== reply.createdBy().id.toString())
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
      { arg: "replyId", type: "string" }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "delete", path: "/delete-my-reply" }
  });

  FeedbackReplay.createReply = async (accessToken, req, res) => {
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const {
      name: storageName,
      root: storageRoot
    } = FeedbackReplay.app.dataSources.storage.settings;

    if (storageName === "storage") {
      const path = `${storageRoot}/${BUCKET}/`;

      if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
      }
    } else throw Error("Unknown Storage", 400);

    const { Container } = FeedbackReplay.app.models;
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

      const requiredFields = ["body", "postId", "feedbackId"];
      validateRequiredFields(requiredFields, fields);

      const { body, postId, feedbackId } = fields;

      const feedback = await FeedbackReplay.create({
        body,
        files,
        postId,
        feedbackId,
        createdById: accessToken.userId,
        container: BUCKET
      });

      return feedback;
    } catch (err) {
      throw err;
    }
  };

  FeedbackReplay.remoteMethod("createReply", {
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
