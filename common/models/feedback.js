const formidable = require("formidable");
const loopback = require("loopback");
const path = require("path");
const parser = require("useragent-parser-js");
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

  const sendEmailToModerator = async (
    postOwnerEmail,
    postOwnerFullName,
    requestFullName,
    postTitle,
    postId,
    feedbackId,
    reasonToDelete,
    userInfo
  ) => {
    const { Email } = Feedback.app.models;
    const { ADMIN_EMAIL, POST_URL } = process.env;
    const { browserName, OSName } = userInfo;

    const postUrl = `${POST_URL}${postId}?scrollTarget=target-${feedbackId}`;
    const content = {
      postOwnerFullName,
      requestFullName,
      postTitle,
      reasonToDelete,
      postUrl,
      OSName,
      browserName
    };

    const sendEmail = async msg => {
      const result = await Email.send(msg);

      return result;
    };
    const renderer = loopback.template(
      path.resolve(__dirname, "../../common/views/post-delete-template.ejs")
    );
    const htmlBody = renderer(content);
    const messageContent = {
      to: postOwnerEmail,
      from: ADMIN_EMAIL,
      subject: "Feedback delete request",
      text: "Feedback delete request",
      html: htmlBody
    };

    await sendEmail(messageContent);
  };

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
              fields: { givenName: true, email: true, profilePicture: true }
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
  Feedback.deleteMyFeedback = async (
    accessToken,
    feedbackId,
    reasonToDelete,
    userInfo
  ) => {
    const { FeedbackReply, UserAccount, DeleteRequest } = Feedback.app.models;

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
    if (userId.toString() !== feedback.createdById.toString() && !isAdmin) {
      // throw error("Cannot delete others feedback.", 403);

      // throw error("Cannot delete others post.", 403);
      const postOwnerEmail = feedback.createdBy().email;
      const postOwnerFullName = `${feedback.createdBy().givenName} ${
        feedback.createdBy().familyName
      }`;

      const user = await UserAccount.findById(userId);
      const requestFullName = `${user.givenName} ${user.familyName}`;

      const { POST_URL } = process.env;

      const link = `${POST_URL}${feedback.postId}?scrollTarget=target-${feedback.id}`;

      await DeleteRequest.findOrCreate(
        {
          where: {
            requestedById: userId,
            postId: feedback.id
          }
        },
        {
          title: feedback.body,
          link,
          reasonToDelete: "I report to delete this feedback",
          type: "FEEDBACK",
          requestedById: userId,
          feedbackId: feedback.id
        }
      );

      sendEmailToModerator(
        postOwnerEmail,
        postOwnerFullName,
        requestFullName,
        feedback.body,
        feedback.postId,
        feedback.id,
        reasonToDelete || "I report to delete this feedback",
        userInfo
      );
      return { status: true };
    }
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
      { arg: "feedbackId", type: "string" },
      { arg: "reasonToDelete", type: "string" },
      {
        arg: "userInfo",
        type: "object",
        http: ctx => {
          const req = ctx && ctx.req;
          const userAgent = req && req.headers["user-agent"];
          const result = parser.parse(userAgent);
          const userInfo = {
            browserName: result.browser,
            OSName: result.os
          };
          return userInfo.browserName && userInfo.OSName ? userInfo : null;
        }
      }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "delete", path: "/delete-my-feedback" }
  });

  const hasParticipatedInTopic = async (mainTopicId, userIds) => {
    const { Post } = Feedback.app.models;

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

  Feedback.createFeedback = async (accessToken, req, res) => {
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const {
      Container,
      UserPostStatus,
      MainTopic,
      AppNotification,
      Post,
      NotificationConfig
    } = Feedback.app.models;
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

      const { body, postId } = fields;
      const post = await Post.findById(postId);
      const { mainTopicId } = post;

      let year;
      let summary;
      let bibliography;
      let title;

      const files = [];
      const filesMeta = JSON.parse(fields.files);

      const counter = 0;

      const keys = Object.keys(filesInfo);
      for (const key of keys) {
        const fileObject = filesInfo[key][0];

        const file = {
          name: fileObject.name,
          size: fileObject.size,
          fileType: fileObject.type,
          originalName: fileObject.originalFilename
        };

        const fileMeta = filesMeta[counter].meta;
        if (fileMeta) {
          ({ title, year, summary, bibliography } = fileMeta);
        }
        const meta = {
          title,
          year,
          summary,
          bibliography
        };

        files.push({
          file,
          meta
        });
      }

      const feedback = await Feedback.create({
        body,
        files,
        postId,
        mainTopicId,
        createdById: accessToken.userId,
        container: BUCKET
      });

      const result = await Feedback.findOne({
        where: { id: feedback.id },
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

      // update/insert user seen status
      const lastSeen = new Date();
      await UserPostStatus.upsertWithWhere(
        { postId, userAccountId: accessToken.userId },
        { postId, userAccountId: accessToken.userId, lastSeen }
      );

      /**  filter users who have a config of recieving notification when new feedback is created
       * and the creator of the topic which holds the newly created subtopic
       */

      /**  filter all users with  
       *  (- onFeedbackCreate and
       *   - participated on 
            - create post inside this feedbacks main topic or
            - create feedback inside this main topic
          ) and (
            - onMyFeedbackCreate and
            - participated on
              - creator post of this feedbacks post
              - creator of feedback inside this post
          ) 
      */

      const mainTopic = await MainTopic.findById(mainTopicId);
      const topicCreatorId = mainTopic.createdById;

      const feedbackNotificationConfigs = await NotificationConfig.find({
        where: {
          onFeedbackCreate: true
        }
      });
      let feedbackSubscribedUsersIds = feedbackNotificationConfigs.map(
        config => config.userAccountId
      );

      feedbackSubscribedUsersIds = await hasParticipatedInTopic(
        mainTopicId,
        feedbackSubscribedUsersIds
      );

      feedbackSubscribedUsersIds = [
        ...new Set(feedbackSubscribedUsersIds, topicCreatorId)
      ];

      // eslint-disable-next-line no-console
      console.log(feedbackSubscribedUsersIds);

      await Promise.all(
        (feedbackSubscribedUsersIds || []).map(async id => {
          //  construct notification object to send for the users
          const notification = {
            title: "New comment",
            body: `A comment with title "${body}" is created under subtopic "${
              post.title
            }"`,
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

  Feedback.rejectRequest = async (accessToken, requestId) => {
    if (!accessToken || !accessToken.userId) {
      throw error("Unauthorized User", 403);
    }

    const { isAdmin } = accessToken.userInfo;

    if (!isAdmin) throw error("Unauthorized User", 403);

    const { DeleteRequest } = Feedback.app.models;

    const deleteRequest = await DeleteRequest.findById(requestId);
    await deleteRequest.patchAttributes({
      status: "REJECTED"
    });

    return { status: true };
  };

  Feedback.remoteMethod("rejectRequest", {
    description: "reject delete request.",
    accepts: [
      {
        arg: "accessToken",
        type: "object",
        http: ctx => {
          const req = ctx && ctx.req;
          const accessToken = req && req.accessToken ? req.accessToken : null;
          return accessToken;
        }
      },
      { arg: "requestId", type: "string", required: true }
    ],
    returns: { type: "object", root: true },
    http: { path: "/reject-request", verb: "post" }
  });

  Feedback.approveRequest = async (accessToken, requestId, feedbackId) => {
    if (!accessToken || !accessToken.userId) {
      throw error("Unauthorized User", 403);
    }

    const { isAdmin } = accessToken.userInfo;

    if (!isAdmin) throw error("Unauthorized User", 403);

    const { DeleteRequest } = Feedback.app.models;

    const deleteRequest = await DeleteRequest.findById(requestId);
    await Feedback.destroyById(feedbackId);
    await deleteRequest.patchAttributes({
      status: "APPROVED"
    });

    return { status: true };
  };

  Feedback.remoteMethod("approveRequest", {
    description: "approve delete request.",
    accepts: [
      {
        arg: "accessToken",
        type: "object",
        http: ctx => {
          const req = ctx && ctx.req;
          const accessToken = req && req.accessToken ? req.accessToken : null;
          return accessToken;
        }
      },
      { arg: "requestId", type: "string", required: true },
      { arg: "feedbackId", type: "string", required: true }
    ],
    returns: { type: "object", root: true },
    http: { path: "/approve-request", verb: "post" }
  });
};
