const fs = require("fs");
const formidable = require("formidable");
const { differenceInDays } = require("date-fns");

const {
  error,
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
  Post.updateMyPost = async (accessToken, body) => {
    const fields = ["id", "title", "description", "files"];
    const requiredFields = ["id"];

    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    validateRequiredFields(requiredFields, body);
    validatesAbsenceOf(fields, body);

    const post = await Post.findOne({
      where: {
        id: body.id
      },
      include: {
        relation: "createdBy"
      }
    });

    if (!post) throw error("post doesn't exist.", 403);

    // check if the post is created by this user
    if (accessToken.userId.toString() !== post.createdBy().id.toString())
      throw error("Cannot update others post.", 403);

    delete body.id;
    await post.patchAttributes({ ...body });

    return { status: true };
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
      { arg: "body", type: "object", http: { source: "body" } }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "put", path: "/update-my-post" }
  });

  // delete post
  Post.deleteMyPost = async (accessToken, postId) => {
    const { Feedback, FeedbackReplay, Container } = Post.app.models;

    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    const post = await Post.findOne({
      where: {
        id: postId
      },
      include: {
        relation: "createdBy"
      }
    });

    if (!post) throw error("post doesn't exist.", 403);

    // check if the post is created by this user
    if (accessToken.userId.toString() !== post.createdBy().id.toString())
      throw error("Cannot delete others post.", 403);

    const feedbacks = Feedback.find({
      where: {
        postId
      }
    });

    const replies = FeedbackReplay.find({
      where: {
        postId
      }
    });

    await Post.destroyById(postId);
    await Feedback.destroyAll({
      postId
    });
    await FeedbackReplay.destroyAll({
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
      // check if there are file ... if not make it undefined
      const files = filesInfo.file
        ? filesInfo.file.map(file => ({
            name: file.name,
            size: file.size,
            originalName: file.originalFilename,
            fileType: file.type
          }))
        : undefined;

      const requiredFields = ["title", "categoryId", "endDate"];
      validateRequiredFields(requiredFields, fields);

      const { title, description, endDate, categoryId } = fields;

      const post = await Post.create({
        title,
        description,
        endDate,
        files,
        createdById: accessToken.userId,
        categoryId,
        container: BUCKET
      });

      return post;
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
   * Attach remaining days and progress on posts
   * @param {Array} posts
   */
  const addPostProgress = posts =>
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
  const addVotes = async posts => {
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

    if (!accessToken || !accessToken.userId)
      throw error("Unauthorized User", 403);

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
            UserAccountId: accessToken.userId
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
        delete post.feedbacks;

        return post;
      })
    );

    newPosts = sort(newPosts, "newFeedbacks");

    let result = addPostProgress(newPosts);
    result = await addVotes(result);
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
    const { UserAccount, UserPostStatus } = Post.app.models;

    if (!accessToken || !accessToken.userId)
      throw error("Unauthorized User", 403);

    const post = await Post.findOne({
      where: {
        id: postId
      },
      include: [
        {
          relation: "feedbacks",
          scope: {
            include: ["createdBy", "feedbackReplays"]
          }
        },
        {
          relation: "createdBy"
        }
      ]
    });

    if (!post) throw error("post doesn't exist.", 404);

    const user = await UserAccount.findById(accessToken.userId);

    // update/insert user seen status
    const lastSeen = new Date();
    await UserPostStatus.upsertWithWhere(
      { postId, userAccountId: user.id },
      { postId, userAccountId: user.id, lastSeen }
    );

    let result = addPostProgress([post]);
    result = await addVotes(result);
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
