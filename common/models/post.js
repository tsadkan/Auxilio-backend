const fs = require("fs");
const formidable = require("formidable");
const { differenceInDays } = require("date-fns");

const {
  error,
  isOwner,
  validatesAbsenceOf,
  validateRequiredFields,
  sort
} = require("../util");

module.exports = function(Post) {
  const BUCKET = "post";

  /**
   * This operation hook sets the startDate property similar to created at
   */
  Post.observe("before save", async ctx => {
    if (ctx.instance && ctx.instance.createdAt) {
      ctx.instance.startDate = ctx.instance.createdAt;
    }
  });

  // update post
  Post.updateMyPost = async (accessToken, req, res) => {
    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    const {
      name: storageName,
      root: storageRoot
    } = Post.app.dataSources.storage.settings;

    if (storageName === "storage") {
      const path = `${storageRoot}/${BUCKET}/`;

      if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
      }
    } else throw Error("Unknown Storage", 400);

    const { Container } = Post.app.models;
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

      const requiredFields = ["postId"];
      const abscencefields = [
        "id",
        "title",
        "description",
        "endDate",
        "startDate",
        "postId",
        "categoryId"
      ];

      validateRequiredFields(requiredFields, fields);
      validatesAbsenceOf(abscencefields, fields);

      const { postId } = fields;
      const post = await Post.findOne({
        where: {
          id: postId
        },
        include: ["createdBy"]
      });

      if (!post) throw error("post doesn't exist.", 403);

      // check if the post is created by this user
      if (accessToken.userId.toString() !== post.createdBy().id.toString())
        throw error("Cannot update others post.", 403);

      delete fields.id;
      delete fields.postId;
      await post.patchAttributes({ ...fields, files });

      return post;
    } catch (err) {
      throw err;
    }
  };

  Post.remoteMethod("updateMyPost", {
    description: "Update users's post.",
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
    http: { verb: "patch", path: "/update-my-post" }
  });

  // delete post
  Post.deleteMyPost = async (accessToken, postId) => {
    const { Feedback, FeedbackReply, Container } = Post.app.models;

    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);
    if (!postId) throw error("postId is required", 403);

    const post = await Post.findOne({
      where: {
        id: postId
      },
      include: {
        relation: "createdBy"
      }
    });

    if (!post) throw error("post doesn't exist.", 403);

    // console.log(accessToken.userId.toString());
    // console.log(post.createdById.toString());
    // check if the post is created by this user
    if (accessToken.userId.toString() !== post.createdById.toString())
      throw error("Cannot delete others post.", 403);

    const feedbacks = await Feedback.find({
      where: {
        postId
      }
    });

    const replies = await FeedbackReply.find({
      where: {
        postId
      }
    });

    await Post.destroyById(postId);
    await Feedback.destroyAll({
      postId
    });
    await FeedbackReply.destroyAll({
      postId
    });

    // delete all the files related to this post and its feedback and its replies
    const { files } = post;
    await Promise.all(
      (files || []).map(async file => {
        await Container.removeFile(BUCKET, file.filename, () => {});
        return true;
      })
    );

    feedbacks.forEach(async feedback => {
      const feedbackFiles = feedback.files;
      await Promise.all(
        (feedbackFiles || []).map(async file => {
          await Container.removeFile(BUCKET, file.filename, () => {});
          return true;
        })
      );
    });

    replies.forEach(async reply => {
      const replyFiles = reply.files;
      await Promise.all(
        (replyFiles || []).map(async file => {
          await Container.removeFile(BUCKET, file.filename, () => {});
          return true;
        })
      );
    });

    return { status: true };
  };
  Post.remoteMethod("deleteMyPost", {
    description: "delete users's post.",
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
      { arg: "postId", type: "string" }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "delete", path: "/delete-my-post" }
  });

  Post.createPost = async (accessToken, req, res) => {
    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    const {
      name: storageName,
      root: storageRoot
    } = Post.app.dataSources.storage.settings;

    if (storageName === "storage") {
      const path = `${storageRoot}/${BUCKET}/`;

      if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
      }
    } else throw error("Unknown Storage", 400);

    const { Container } = Post.app.models;
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

      const requiredFields = ["title", "categoryId", "endDate"];
      validateRequiredFields(requiredFields, fields);

      const { title, description, endDate, categoryId, fileMeta } = fields;

      let year;
      let summary;
      let bibliography;
      let fileTitle;
      if (fileMeta && JSON.parse(fileMeta)) {
        const parsed = JSON.parse(fileMeta);
        ({ year, summary, bibliography } = parsed);
        fileTitle = parsed.title;
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
              title: fileTitle,
              year,
              summary,
              bibliography
            }
          }))
        : undefined;

      const post = await Post.create({
        title,
        description,
        endDate,
        files,
        createdById: accessToken.userId,
        categoryId,
        container: BUCKET
      });

      const result = await Post.findOne({
        where: { id: post.id },
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

  Post.remoteMethod("createPost", {
    description: "Create post with uploaded file.",
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
    http: { verb: "post", path: "/create-post" }
  });

  /**
   * Attach isOwner flag for feedback replies
   * @param {Array} feedbacks
   */
  const includeRepliesOwner = async (userId, feedbacks) =>
    feedbacks.map(feedback => {
      feedback.replies = feedback.replies().map(reply => {
        reply.isOwner = isOwner(userId, reply);
        return reply;
      });
      return feedback;
    });

  /**
   * Attach users voted status for a post
   * @param {Array} feedbacks
   */
  const includeUserFeedbackVoteStatus = async (userId, feedbacks) => {
    const { UserFeedbackVote } = Post.app.models;
    for (const feedback of feedbacks) {
      // eslint-disable-next-line
      const reaction = await UserFeedbackVote.findOne({
        where: {
          userId,
          feedbackId: feedback.id
        }
      });
      Post.app.logger.info(reaction);
      feedback.voted = (reaction && reaction.vote) || 0;
    }
    return feedbacks;
  };

  /**
   * Attach users voted status for a post
   * @param {Array} feedbacks
   */
  const includeUserPostVoteStatus = async (userId, posts) => {
    const { UserPostVote } = Post.app.models;
    for (const post of posts) {
      // eslint-disable-next-line
      const reaction = await UserPostVote.findOne({
        where: {
          userId,
          postId: post.id
        }
      });

      post.voted = (reaction && reaction.vote) || 0;
    }
    return posts;
  };

  /**
   * Attach isOwner flag for feedbacks
   * @param {Array} feedbacks
   */
  const includeFeedbacksOwner = async (userId, feedbacks) =>
    feedbacks.map(feedback => {
      feedback.isOwner = isOwner(userId, feedback);
      return feedback;
    });

  /**
   * Attach up vote & down vote amount for feedbacks
   * @param {Array} feedbacks
   */
  const includeFeedbackVotes = async feedbacks => {
    const { UserFeedbackVote } = Post.app.models;
    const feedbackIds = feedbacks.map(feedback => feedback.id);
    const feedbackVotes = await UserFeedbackVote.find({
      id: { inq: feedbackIds }
    });

    if (!feedbackVotes || !feedbackVotes.length) {
      return feedbacks.map(feedback => {
        feedback.upVote = 0;
        feedback.downVote = 0;
        return feedback;
      });
    }
    return feedbacks.map(feedback => {
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
    });
  };

  /**
   * Attach remaining days and progress on posts
   * @param {Array} posts
   */
  const includePostProgress = posts =>
    posts.map(post => {
      const totalDays =
        post.endDate && post.startDate
          ? differenceInDays(post.endDate, post.startDate)
          : 0;
      const remaining = post.endDate
        ? differenceInDays(post.endDate, new Date())
        : 0;
      post.remainingDays = remaining || 0;
      post.progress =
        remaining && totalDays
          ? Number.parseFloat((remaining / totalDays) * 100).toFixed(2) || 0
          : 0;
      return post;
    });

  /**
   * Attach up vote & down vote amount for posts
   * @param {Array} posts
   */
  const includePostVotes = async posts => {
    const { UserPostVote } = Post.app.models;
    const postIds = posts.map(post => post.id);
    const postVotes = await UserPostVote.find({
      id: { inq: postIds }
    });

    if (!postVotes || !postVotes.length) {
      return posts.map(post => {
        post.upVote = 0;
        post.downVote = 0;
        return post;
      });
    }
    return posts.map(post => {
      post.upVote = 0;
      post.downVote = 0;
      for (const postVote of postVotes) {
        if (postVote.postId.toString() === post.id.toString()) {
          if (postVote.vote === 1) {
            post.upVote += 1;
          }
          if (postVote.vote === -1) {
            post.downVote += 1;
          }
        }
      }
      return post;
    });
  };

  // get list of posts
  Post.list = async (limit, skip, filter, accessToken) => {
    const { UserPostStatus, Feedback } = Post.app.models;

    if (!accessToken || !accessToken.userId) {
      throw error("Unauthorized User", 403);
    }
    const { userId } = accessToken;

    limit = limit || 0;
    skip = skip || 0;

    const count = await Post.count({ ...filter });

    const posts = await Post.find({
      where: {
        ...filter
      },
      include: ["feedbacks", "category"],
      limit,
      skip
    });

    // prepare new posts to return as a list of posts including the number of new feedbacks
    let newPosts = await Promise.all(
      (posts || []).map(async post => {
        const userPostStatus = await UserPostStatus.findOne({
          where: {
            postId: post.id,
            userAccountId: userId
          }
        });

        const lastSeenTimeStamp =
          (userPostStatus && userPostStatus.lastSeen) ||
          new Date(-8640000000000000);

        // count feedbacks for this post after lastSeen timeStamp
        const newFeedbacks = await Feedback.count({
          postId: post.id,
          createdAt: { gt: lastSeenTimeStamp }
        });

        // attach new feedbacks to post object
        post.newFeedbacks = newFeedbacks;
        // attach number of feedbacks post object
        post.numberOfFeedbacks = post.feedbacks().length;
        // @todo delete feedbacks
        return post;
      })
    );

    newPosts = sort(newPosts, "newFeedbacks");

    // include post ownership detail
    newPosts = newPosts.map(post => {
      post.isOwner = isOwner(userId, post);
      return post;
    });

    let result = includePostProgress(newPosts);
    result = await includePostVotes(result);
    return { count, rows: result };
  };

  Post.remoteMethod("list", {
    description: "return list of posts.",
    accepts: [
      { arg: "limit", type: "number" },
      { arg: "skip", type: "number" },
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

  // get detail of a post
  Post.detail = async (postId, accessToken) => {
    const { UserPostStatus } = Post.app.models;

    if (!accessToken || !accessToken.userId)
      throw error("Unauthorized User", 403);

    const post = await Post.findOne({
      where: { id: postId },
      fields: { _isDeleted: false },
      include: [
        {
          relation: "category",
          scope: { fields: { id: true, name: true, color: true } }
        },
        {
          relation: "feedbacks",
          scope: {
            include: [
              {
                relation: "replies",
                scope: {
                  include: [
                    {
                      relation: "createdBy",
                      scope: {
                        fields: {
                          fullName: true,
                          email: true,
                          profilePicture: true
                        }
                      }
                    }
                  ]
                }
              },
              {
                relation: "createdBy",
                scope: {
                  fields: { fullName: true, email: true, profilePicture: true }
                }
              }
            ],
            order: "createdAt DESC"
          }
        },
        {
          relation: "createdBy",
          scope: {
            fields: { fullName: true, email: true, profilePicture: true }
          }
        }
      ]
    });

    if (!post) throw error("post doesn't exist.", 404);

    const { userId } = accessToken;

    // update/insert user seen status
    const lastSeen = new Date();
    await UserPostStatus.upsertWithWhere(
      { postId, userAccountId: userId },
      { postId, userAccountId: userId, lastSeen }
    );

    post.numberOfFeedbacks = (post.feedbacks() && post.feedbacks().length) || 0;
    post.isOwner = isOwner(userId, post);

    post.feedbacks = includeFeedbacksOwner(userId, post.feedbacks());
    post.feedbacks = includeRepliesOwner(userId, post.feedbacks());
    post.feedbacks = includeUserFeedbackVoteStatus(userId, post.feedbacks());
    let result = await includeFeedbackVotes(post.feedbacks());
    result = includeUserPostVoteStatus(userId, [post]);
    result = includePostProgress([post]);
    result = await includePostVotes(result);
    return result[0];
  };

  Post.remoteMethod("detail", {
    description: "return detail of post.",
    accepts: [
      { arg: "postId", type: "string" },
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
    http: { path: "/detail", verb: "get" }
  });
};
