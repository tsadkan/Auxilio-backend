const {
  error,
  validatesAbsenceOf,
  validateRequiredFields
} = require("../util");

module.exports = function(PostCategory) {
  /**
   * update post category
   */
  PostCategory.updateCategory = async (accessToken, body) => {
    const fields = ["id", "name", "color"];
    const requiredFields = ["id"];

    if (!accessToken || !accessToken.userId) throw error("Forbidden User", 403);

    validatesAbsenceOf(fields, body);
    validateRequiredFields(requiredFields, body);

    const category = await PostCategory.findById(body.id);
    delete category.id;

    await category.patchAttributes({ ...body });

    return { status: true };
  };
  PostCategory.remoteMethod("updateCategory", {
    description: "update category",
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
      { arg: "body", type: "object", required: true }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "patch", path: "/update-category" }
  });
};
