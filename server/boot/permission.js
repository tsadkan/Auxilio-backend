module.exports = function(app) {
  const { UserRole } = app.models;

  UserRole.registerResolver("$admin", async (role, context) => {
    if (
      !context.accessToken ||
      !context.accessToken.userInfo ||
      !context.accessToken.userInfo.role ||
      context.accessToken.userInfo.role.name !== "Admin"
    ) {
      return false;
    }

    return true;
  });

  UserRole.registerResolver("$member", async (role, context) => {
    if (
      !context.accessToken ||
      !context.accessToken.userInfo ||
      !context.accessToken.userInfo.role ||
      context.accessToken.userInfo.role.name !== "member"
    ) {
      return false;
    }
    return true;
  });
};
