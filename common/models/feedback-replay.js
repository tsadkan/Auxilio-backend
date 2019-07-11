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

  const hasParticipatedInTopic = async (mainTopicId, userIds) => {
    const { Post, Feedback } = FeedbackReply.app.models;

    const posts = await Post.find({
      where: {
        mainTopicId,
        createdById: { inq: userIds }
      }
    });

    const postIds = posts.map(post => post.createdById.toString());

    const feedbacks = await Feedback.find({
      where: {
        mainTopicId,
        createdById: { inq: userIds }
      }
    });

    const feedbackIds = feedbacks.map(feedback =>
      feedback.createdById.toString()
    );

    const allIds = [...postIds, ...feedbackIds];
    return [...new Set(allIds)];
  };

  const hasParticipatedInMyReply = async (feedbackId, userIds) => {
    const { Feedback } = FeedbackReply.app.models;

    const feedbacks = await Feedback.find({
      where: {
        id: feedbackId,
        createdById: { inq: userIds }
      }
    });

    const feedbackIds = feedbacks.map(feedback =>
      feedback.createdById.toString()
    );

    const replies = await FeedbackReply.find({
      where: {
        feedbackId,
        createdById: { inq: userIds }
      }
    });

    const replyIds = replies.map(reply => reply.createdById.toString());

    const allIds = [...feedbackIds, ...replyIds];
    return [...new Set(allIds)];
  };

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
    const {
      UserPostStatus,
      NotificationConfig,
      AppNotification,
      UserAccount,
      MainTopic
    } = FeedbackReply.app.models;
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
        mainTopicId: feedback.mainTopicId,
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

      const user = await UserAccount.findById(accessToken.userId);

      const mainTopic = await MainTopic.findById(feedback.mainTopicId);
      // eslint-disable-next-line no-unused-vars
      const topicCreatorId = mainTopic.createdById;

      const feedbackNotificationConfigs = await NotificationConfig.find({
        where: {
          onReplyCreate: true
        }
      });
      let feedbackSubscribedUsersIds = feedbackNotificationConfigs.map(
        config => config.userAccountId
      );

      feedbackSubscribedUsersIds = await hasParticipatedInTopic(
        feedback.mainTopicId,
        feedbackSubscribedUsersIds
      );

      const onlyFeedbackNotificationConfigs = await NotificationConfig.find({
        where: {
          onMyReplyCreate: true
        }
      });

      let onlyFeedbackSubscribedUsersIds = onlyFeedbackNotificationConfigs.map(
        config => config.userAccountId
      );

      onlyFeedbackSubscribedUsersIds = await hasParticipatedInMyReply(
        feedback.id,
        onlyFeedbackSubscribedUsersIds
      );

      let allIds = [
        ...feedbackSubscribedUsersIds,
        // topicCreatorId,
        ...onlyFeedbackSubscribedUsersIds
      ];

      allIds = [...new Set(allIds)];

      // eslint-disable-next-line no-console
      console.log(allIds);

      await Promise.all(
        (allIds || []).map(async id => {
          //  construct notification object to send for the users
          const notification = {
            title: "New Reply",
            body: `i4policy \n ${user.givenName} ${
              user.familyName
            } gave a reply.`,
            userAccountId: id
          };
          // create notification for the user
          await AppNotification.create(notification);
        })
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
    const {
      UserPostStatus,
      NotificationConfig,
      UserAccount,
      MainTopic,
      AppNotification
    } = FeedbackReply.app.models;
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
        mainTopicId: feedback.mainTopicId,
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

      const user = await UserAccount.findById(accessToken.userId);

      const mainTopic = await MainTopic.findById(feedback.mainTopicId);
      // eslint-disable-next-line no-unused-vars
      const topicCreatorId = mainTopic.createdById;

      const feedbackNotificationConfigs = await NotificationConfig.find({
        where: {
          onReplyCreate: true
        }
      });
      let feedbackSubscribedUsersIds = feedbackNotificationConfigs.map(
        config => config.userAccountId
      );

      feedbackSubscribedUsersIds = await hasParticipatedInTopic(
        feedback.mainTopicId,
        feedbackSubscribedUsersIds
      );

      const onlyFeedbackNotificationConfigs = await NotificationConfig.find({
        where: {
          onMyReplyCreate: true
        }
      });

      let onlyFeedbackSubscribedUsersIds = onlyFeedbackNotificationConfigs.map(
        config => config.userAccountId
      );

      onlyFeedbackSubscribedUsersIds = await hasParticipatedInMyReply(
        feedbackId,
        onlyFeedbackSubscribedUsersIds
      );

      let allIds = [
        ...feedbackSubscribedUsersIds,
        // topicCreatorId,
        ...onlyFeedbackSubscribedUsersIds
      ];

      allIds = [...new Set(allIds)];

      // eslint-disable-next-line no-console
      console.log(allIds);

      await Promise.all(
        (allIds || []).map(async id => {
          //  construct notification object to send for the users
          const notification = {
            title: "New Reply",
            body: `i4policy \n ${user.givenName} ${
              user.familyName
            } gave a reply.`,
            userAccountId: id
          };
          // create notification for the user
          await AppNotification.create(notification);
        })
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

  FeedbackReply.list = async (limit, skip, order, filter, accessToken) => {
    if (!accessToken || !accessToken.userId) {
      throw Error("Unauthorized User", 403);
    }

    limit = limit || 10;
    skip = skip || 0;
    order = order || "createdAt ASC";
    filter = filter || {};

    const count = await FeedbackReply.count({ ...filter });

    const replies = await FeedbackReply.find({
      include: ["createdBy"],
      limit,
      skip,
      order,
      where: {
        ...filter
      }
    });

    // let files = documents.map(doc => doc.files);
    // files = [].concat(...files);
    return { count, rows: replies };
  };

  FeedbackReply.remoteMethod("list", {
    description: "return list of replies.",
    accepts: [
      { arg: "limit", type: "number" },
      { arg: "skip", type: "number" },
      { arg: "order", type: "string" },
      { arg: "filter", type: "object" },
      {
        arg: "accessToken",
        type: "object",
        http: ctx => {
          const req = ctx && ctx.req;
          const accessToken = req && req.accessToken ? req.accessToken : null;
          return accessToken;
        }
      }
    ],
    returns: { type: "object", root: true },
    http: { path: "/list", verb: "get" }
  });
};
