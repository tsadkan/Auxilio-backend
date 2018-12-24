const fs = require("fs");
const formidable = require("formidable");
const {
  error,
  validatesAbsenceOf,
  validateRequiredFields
} = require("../util");

module.exports = function(Post) {
  const BUCKET = "post";

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
    const { Feedback, FeedbackReplay } = Post.app.models;

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

    await Post.destroyById(postId);
    await Feedback.destroyAll({
      postId
    });
    await FeedbackReplay.destroyAll({
      postId
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
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

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

      const requiredFields = ["title"];
      validateRequiredFields(requiredFields, fields);

      const { title, description } = fields;

      const post = await Post.create({
        title,
        description,
        files,
        createdById: accessToken.userId,
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
};
