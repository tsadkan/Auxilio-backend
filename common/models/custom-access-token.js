module.exports = function(CustomAccessToken) {
  const isAdmin = async roleId => {
    const { UserRole } = CustomAccessToken.app.models;
    const adminRole = await UserRole.findOne({
      where: { name: "Admin" }
    });
    const moderatorRole = await UserRole.findOne({
      where: { name: "Moderator" }
    });
    if (
      roleId.toString() === adminRole.id.toString() ||
      roleId.toString() === moderatorRole.id.toString()
    )
      return true;

    return false;
  };

  CustomAccessToken.observe("before save", async ctx => {
    if (ctx.instance && ctx.isNewInstance) {
      const { UserAccount } = CustomAccessToken.app.models;
      try {
        const user = await UserAccount.findById(ctx.instance.userId, {
          include: ["role"]
        });
        if (user) {
          user.isAdmin = await isAdmin(user.role().id);

          delete user.password;
          ctx.instance.userInfo = user;
        }
      } catch (err) {
        CustomAccessToken.app.logger.error(err);
        throw err;
      }
    }
  });
};
