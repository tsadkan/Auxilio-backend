module.exports = function(CustomAccessToken) {
  CustomAccessToken.observe("before save", async ctx => {
    if (ctx.instance && ctx.isNewInstance) {
      const { UserAccount } = CustomAccessToken.app.models;
      try {
        const user = await UserAccount.findById(ctx.instance.userId, {
          include: ["role"]
        });
        if (user) {
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
