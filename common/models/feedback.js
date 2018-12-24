const fs = require("fs");
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

  // update feedback
  Feedback.updateMyFeedback = async (accessToken, body) => {
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

    if (!feedback) throw error("feedback doesn't exist.", 403);

    // check if the feedback is created by this user
    if (accessToken.userId.toString() !== feedback.createdBy().id.toString())
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

    if (!feedback) throw error("feedback doesn't exist.", 403);

    // check if the feedback is created by this user
    if (accessToken.userId.toString() !== feedback.createdBy().id.toString())
      throw error("Cannot delete others feedback.", 403);

    await Feedback.destroyById(feedbackId);
    await FeedbackReplay.destroyAll({
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

    const {
      name: storageName,
      root: storageRoot
    } = Feedback.app.dataSources.storage.settings;

    if (storageName === "storage") {
      const path = `${storageRoot}/${BUCKET}/`;

      if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
      }
    } else throw Error("Unknown Storage", 400);

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

      const requiredFields = ["body", "postId"];
      validateRequiredFields(requiredFields, fields);

      const { body, postId } = fields;

      const feedback = await Feedback.create({
        body,
        files,
        postId,
        createdById: accessToken.userId,
        container: BUCKET
      });

      return feedback;
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
