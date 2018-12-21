const { error } = require("../util");

module.exports = function(UserAccount) {
  /**
   * Returns additional user detail on login
   */
  UserAccount.afterRemote("login", async (ctx, result) => {
    const { userInfo } = result;
    if (!userInfo) {
      throw error();
    }
    ctx.result = {
      token: result.id,
      fullName: userInfo.fullName,
      email: userInfo.email,
      phoneNumber: userInfo.phoneNumber,
      role: userInfo.role() ? userInfo.role().name : ""
    };
  });

  /**
   * Register user with role 'member'
   */
  UserAccount.registerMember = async (
    fullName,
    email,
    password,
    phoneNumber
  ) => {
    // todo check permission from the access token
    const { UserRole } = UserAccount.app.models;
    const role = await UserRole.findOne({
      where: { name: "member" }
    });

    if (!role) {
      throw error("unable to find member role");
    }
    const user = {
      roleId: role.id,
      fullName,
      email,
      password,
      phoneNumber
    };
    const createdUser = await UserAccount.create(user);
    return createdUser;
  };
  UserAccount.remoteMethod("registerMember", {
    description: "Register user",
    accepts: [
      { arg: "fullName", type: "string", required: true },
      { arg: "email", type: "string", required: true },
      { arg: "password", type: "string", required: true },
      { arg: "phoneNumber", type: "string", required: false }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/register-member" }
  });
};
