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

      const requiredFields = ["id"];
      const abscencefields = ["id", "body"];

      validateRequiredFields(requiredFields, fields);
      validatesAbsenceOf(abscencefields, fields);

      const { id } = fields;
      const reply = await FeedbackReply.findOne({
        where: {
          id
        },
        include: ["createdBy"]
      });

      if (!reply) throw error("reply doesn't exist.", 403);

      const { userId } = accessToken;
      const { isAdmin } = accessToken.userInfo;
      // check if the reply is created by this user
      if (userId.toString() !== reply.createdById.toString() && !isAdmin)
        throw error("Cannot update others reply.", 403);

      delete fields.id;
      delete fields.replyId;
      await reply.patchAttributes({ ...fields, files });
      reply.isOwner = true;
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
    if (!replyId) throw error("replyId is required", 403);

    const reply = await FeedbackReply.findOne({
      where: {
        id: replyId
      },
      include: {
        relation: "createdBy"
      }
    });

    if (!reply) throw error("feedback reply doesn't exist.", 403);

    const { userId } = accessToken;
    const { isAdmin } = accessToken.userInfo;
    // check if the reply is created by this user
    if (userId.toString() !== reply.createdById.toString() && !isAdmin)
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

  // eslint-disable-next-line no-unused-vars
  FeedbackReply.createReply = async (accessToken, req, res) => {
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    // const { Container } = FeedbackReply.app.models;
    const { UserPostStatus } = FeedbackReply.app.models;
    const form = new formidable.IncomingForm();

    // const filePromise = new Promise(resolve => {
    //   const filesInfo = Container.customUpload(req, res, BUCKET);

    //   return resolve(filesInfo);
    // });

    const fieldsPromise = new Promise((resolve, reject) => {
      form.parse(req, (err, fields) => {
        if (err) return reject(err);

        return resolve(fields);
      });
    });

    try {
      const [fields] = await Promise.all([fieldsPromise]);

      const requiredFields = ["body", "replyId"];
      validateRequiredFields(requiredFields, fields);

      const { body, replyId } = fields;

      // let year;
      // let summary;
      // let bibliography;
      // let title;

      const files = [];
      // const filesMeta = JSON.parse(fields.files);

      // const counter = 0;

      // const keys = Object.keys(filesInfo);
      // for (const key of keys) {
      //   const fileObject = filesInfo[key][0];

      //   const file = {
      //     name: fileObject.name,
      //     size: fileObject.size,
      //     fileType: fileObject.type,
      //     originalName: fileObject.originalFilename
      //   };

      // const fileMeta = filesMeta[counter].meta;
      // if (fileMeta) {
      // ({ title, year, summary, bibliography } = fileMeta);
      // }
      // const meta = {
      // title,
      // year,
      // summary,
      // bibliography
      // };

      // files.push({
      // file,
      // meta
      // });
      // }

      const { Feedback } = FeedbackReply.app.models;
      const feedbackReply = await FeedbackReply.findOne({
        where: { id: replyId }
      });
      const feedback = await Feedback.findOne({
        where: { id: feedbackReply.feedbackId }
      });

      if (!feedbackReply) {
        throw error("Invalid reply Id", 422);
      }
      const reply = await FeedbackReply.create({
        body,
        files,
        postId: feedback.postId,
        feedbackId: feedback.id,
        createdById: accessToken.userId,
        container: BUCKET,
        replyId
      });

      const result = await FeedbackReply.findOne({
        where: { id: reply.id },
        include: [
          {
            relation: "createdBy",
            scope: {
              fields: {
                givenName: true,
                familyName: true,
                email: true,
                profilePicture: true
              }
            }
          }
        ]
      });
      result.isOwner = true;

      const { postId } = feedback;
      // update/insert user seen status
      const lastSeen = new Date();
      await UserPostStatus.upsertWithWhere(
        { postId, userAccountId: accessToken.userId },
        { postId, userAccountId: accessToken.userId, lastSeen }
      );
      return result;
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

  // eslint-disable-next-line no-unused-vars
  FeedbackReply.createFeedbackReply = async (accessToken, req, res) => {
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    // const { Container } = FeedbackReply.app.models;
    const { UserPostStatus } = FeedbackReply.app.models;
    const form = new formidable.IncomingForm();

    // const filePromise = new Promise(resolve => {
    //   const filesInfo = Container.customUpload(req, res, BUCKET);

    //   return resolve(filesInfo);
    // });

    const fieldsPromise = new Promise((resolve, reject) => {
      form.parse(req, (err, fields) => {
        if (err) return reject(err);

        return resolve(fields);
      });
    });

    try {
      const [fields] = await Promise.all([fieldsPromise]);

      const requiredFields = ["body", "feedbackId"];
      validateRequiredFields(requiredFields, fields);

      const { body, feedbackId } = fields;

      // let year;
      // let summary;
      // let bibliography;
      // let title;

      const files = [];
      // const filesMeta = JSON.parse(fields.files);

      // const counter = 0;

      // const keys = Object.keys(filesInfo);
      // for (const key of keys) {
      //   const fileObject = filesInfo[key][0];

      //   const file = {
      //     name: fileObject.name,
      //     size: fileObject.size,
      //     fileType: fileObject.type,
      //     originalName: fileObject.originalFilename
      //   };

      // const fileMeta = filesMeta[counter].meta;
      // if (fileMeta) {
      // ({ title, year, summary, bibliography } = fileMeta);
      // }
      // const meta = {
      // title,
      // year,
      // summary,
      // bibliography
      // };

      // files.push({
      // file,
      // meta
      // });
      // }

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

      const result = await FeedbackReply.findOne({
        where: { id: reply.id },
        include: [
          {
            relation: "createdBy",
            scope: {
              fields: {
                givenName: true,
                familyName: true,
                email: true,
                profilePicture: true
              }
            }
          }
        ]
      });
      result.isOwner = true;

      const { postId } = feedback;
      // update/insert user seen status
      const lastSeen = new Date();
      await UserPostStatus.upsertWithWhere(
        { postId, userAccountId: accessToken.userId },
        { postId, userAccountId: accessToken.userId, lastSeen }
      );
      return result;
    } catch (err) {
      throw err;
    }
  };

  FeedbackReply.remoteMethod("createFeedbackReply", {
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
    http: { verb: "post", path: "/create-feedback-reply" }
  });
};
