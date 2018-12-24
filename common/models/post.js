const {
  error,
  validatesAbsenceOf,
  validateRequiredFields
} = require("../util");

module.exports = function(Post) {
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

    // check if the post is created by this user
    if (accessToken.userId !== post.createdBy.id)
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
    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    const post = await Post.findOne({
      where: {
        id: postId
      },
      include: {
        relation: "createdBy"
      }
    });

    // check if the post is created by this user
    if (accessToken.userId !== post.createdBy.id)
      throw error("Cannot delete others post.", 403);

    await Post.destroyById(postId);

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
      { arg: "postId", type: "string", http: { source: "body" } }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "delete", path: "/delete-my-post" }
  });
};
