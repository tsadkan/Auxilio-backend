const TokenGenerator = require("uuid-token-generator");
const loopback = require("loopback");
const path = require("path");
const differenceInHours = require("date-fns/difference_in_hours");

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

  UserAccount.appResetPassword = async email => {
    const { Email, PasswordReset } = UserAccount.app.models;

    const sendEmail = async msg => {
      const result = await Email.send(msg);

      return result;
    };

    // check if a user with this email exists
    const user = await UserAccount.findOne({
      where: {
        email
      }
    });

    if (user) {
      // generate unique token
      const tokgen = new TokenGenerator(256, TokenGenerator.BASE62);
      const resetToken = tokgen.generate();

      // read the reset url from env file
      const { RESET_PASSWORD_URL } = process.env;
      const { fullName } = user;
      const ADMIN_EMAIL = process.env;
      const resetUrl = `${RESET_PASSWORD_URL}/${resetToken}`;

      const content = {
        fullName,
        resetUrl
      };

      const renderer = loopback.template(
        path.resolve(__dirname, "../../common/views/email-template.ejs")
      );
      const htmlBody = renderer(content);
      const messageContent = {
        to: email,
        from: ADMIN_EMAIL,
        subject: "Password Reset",
        text: "Reset your password.",
        html: htmlBody
      };

      await sendEmail(messageContent);

      await PasswordReset.create({
        email,
        resetToken
      });
    }

    return { status: true };
  };

  UserAccount.remoteMethod("appResetPassword", {
    description: "reset user password via email.",
    accepts: [{ arg: "email", type: "string", required: true }],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/app-password-reset-request" }
  });

  UserAccount.appVerifyResetPassword = async (resetToken, newPassword) => {
    const { PasswordReset } = UserAccount.app.models;

    // check if a password reset request with this request exists
    const passwordReset = await PasswordReset.findOne({
      where: {
        resetToken
      }
    });

    if (!passwordReset) throw error("Invalid reset Token.", 403);

    // check if the user with this request token exists
    const { email } = passwordReset;
    const user = UserAccount.findOne({
      where: {
        email
      }
    });

    if (!user) {
      await PasswordReset.destroyById(passwordReset.id);
      throw error("Invalid reset Token.", 403);
    }

    const hourDiff = differenceInHours(new Date(), passwordReset.createdAt);

    if (hourDiff >= 24) {
      await PasswordReset.destroyById(passwordReset.id);
      throw error("reset Token time out.", 403);
    }

    const passwordResets = await PasswordReset.find({
      where: {
        email
      }
    });

    // delete all password reset request for this email
    await Promise.all(
      (passwordResets || []).map(reset => {
        PasswordReset.destroyById(reset.id);
        return true;
      })
    );

    const response = await UserAccount.login({
      email,
      password: newPassword
    });

    return { tokenId: response.id };
  };

  UserAccount.remoteMethod("appVerifyResetPassword", {
    description: "reset user password via email.",
    accepts: [
      { arg: "resetToken", type: "string", required: true },
      { arg: "newPassword", type: "string", required: true }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/app-verify-reset-password" }
  });
};
