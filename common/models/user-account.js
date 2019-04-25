const TokenGenerator = require("uuid-token-generator");
const loopback = require("loopback");
const path = require("path");
const differenceInHours = require("date-fns/difference_in_hours");
const bcrypt = require("bcrypt-nodejs");
const parser = require("useragent-parser-js");

const {
  error,
  validatesAbsenceOf,
  validateRequiredFields
} = require("../util");

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
      id: userInfo.id,
      title: userInfo.title,
      profilePicture: userInfo.profilePicture,
      givenName: userInfo.givenName,
      familyName: userInfo.familyName,
      organization: userInfo.organization,
      position: userInfo.position,
      email: userInfo.email,
      phoneNumber: userInfo.phoneNumber,
      status: userInfo.status,
      role: userInfo.role() ? userInfo.role().name : ""
    };
  });

  /**
   * Register user with role 'member'
   */
  UserAccount.registerMember = async (
    // title,
    profilePicture,
    givenName,
    familyName,
    organization,
    // position,
    email,
    country,
    password,
    phoneNumber
  ) => {
    const { UserRole } = UserAccount.app.models;
    const role = await UserRole.findOne({
      where: { name: "Team Member" }
    });

    if (!role) {
      throw error("unable to find member role");
    }
    const user = {
      roleId: role.id,
      // title,
      givenName,
      familyName,
      organization,
      // position,
      country,
      email,
      password,
      phoneNumber,
      profilePicture
    };
    const createdUser = await UserAccount.create(user);
    return createdUser;
  };
  UserAccount.remoteMethod("registerMember", {
    description: "Register user",
    accepts: [
      // { arg: "title", type: "string", required: true },
      { arg: "profilePicture", type: "string", required: false },
      { arg: "givenName", type: "string", required: true },
      { arg: "familyName", type: "string", required: true },
      { arg: "organization", type: "string", required: false },
      // { arg: "position", type: "string", required: false },
      { arg: "email", type: "string", required: true },
      { arg: "country", type: "string", required: false },
      { arg: "password", type: "string", required: true },
      { arg: "phoneNumber", type: "string", required: false }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/register-member" }
  });

  /**
   * Approve Registered user'
   */
  UserAccount.approveUser = async (accessToken, userObj) => {
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const { userIds } = userObj;
    await Promise.all(
      userIds.map(async userId => {
        const user = await UserAccount.findById(userId);
        user.patchAttributes({ status: "ACTIVE" });
      })
    );

    return { status: true };
  };
  UserAccount.remoteMethod("approveUser", {
    description: "Approve registered users",
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
      { arg: "userObj", type: "object", required: true }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/approve-user" }
  });

  /**
   * Approve set of registered user'
   */
  UserAccount.disapproveUser = async (accessToken, userObj) => {
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const { userIds } = userObj;
    await Promise.all(
      userIds.map(async userId => {
        const user = await UserAccount.findById(userId);
        user.patchAttributes({ status: "INACTIVE" });
      })
    );

    return { status: true };
  };
  UserAccount.remoteMethod("disapproveUser", {
    description: "Disapprove registered users",
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
      { arg: "userObj", type: "object", required: true }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/disapprove-user" }
  });

  /**
   * update member user
   */
  UserAccount.updateMember = async (accessToken, body) => {
    const fields = [
      "id",
      "title",
      "givenName",
      "familyName",
      "organization",
      "position",
      "email",
      "phoneNumber",
      "password",
      "profilePicture"
    ];
    const requiredFields = ["id"];

    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    validatesAbsenceOf(fields, body);
    validateRequiredFields(requiredFields, body);

    const { UserRole } = UserAccount.app.models;
    const role = await UserRole.findOne({
      where: { name: "Team Member" }
    });

    if (!role) {
      throw error("unable to find member role");
    }
    const user = await UserAccount.findById(body.id);
    delete body.id;

    await user.patchAttributes({ ...body });

    return { status: true };
  };
  UserAccount.remoteMethod("updateMember", {
    description: "update user",
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
    http: { verb: "patch", path: "/update-member" }
  });

  UserAccount.appResetPassword = async (email, userInfo) => {
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
      const { browserName, OSName } = userInfo;
      // generate unique token
      const tokgen = new TokenGenerator(256, TokenGenerator.BASE62);
      const resetToken = tokgen.generate();

      // read the reset url from env file
      const { RESET_PASSWORD_URL } = process.env;
      const fullName = `${user.givenName} ${user.familyName}`;
      const { ADMIN_EMAIL } = process.env;
      const resetUrl = `${RESET_PASSWORD_URL}/${resetToken}`;

      const content = {
        fullName,
        resetUrl,
        OSName,
        browserName
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
    accepts: [
      { arg: "email", type: "string", required: true },
      {
        arg: "userInfo",
        type: "object",
        http: ctx => {
          const req = ctx && ctx.req;
          const userAgent = req && req.headers["user-agent"];
          const result = parser.parse(userAgent);
          const userInfo = {
            browserName: result.browser,
            OSName: result.os
          };
          return userInfo.browserName && userInfo.OSName ? userInfo : null;
        }
      }
    ],
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
    const user = await UserAccount.findOne({
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

    // update users password to new password
    await user.patchAttributes({
      password: newPassword
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

  // custom user logout endpoint
  UserAccount.logoutUser = async accessToken => {
    const { CustomAccessToken } = UserAccount.app.models;

    if (!accessToken || !accessToken.userId) return { status: true };

    const token = await CustomAccessToken.findOne({
      where: {
        id: accessToken.id
      }
    });
    if (!token) return { status: true };

    await UserAccount.logout(accessToken.id);

    return { status: true };
  };
  UserAccount.remoteMethod("logoutUser", {
    accepts: [
      {
        arg: "accessToken",
        type: "object",
        http: ctx => {
          const req = ctx && ctx.req;
          const accessToken = req && req.accessToken;
          return accessToken ? req.accessToken : null;
        }
      }
    ],
    returns: { type: "object", root: true },
    http: { path: "/logout-user", verb: "post" }
  });

  // update user account
  UserAccount.updateMyProfile = async (accessToken, body) => {
    const fields = [
      "id",
      "title",
      "profilePicture",
      "givenName",
      "familyName",
      "organization",
      "position",
      "email",
      "phoneNumber",
      "oldPassword",
      "newPasssword"
    ];

    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    validatesAbsenceOf(fields, body);

    const account = await UserAccount.findById(accessToken.userId);
    delete body.id;

    if (body.newPassword && body.oldPassword) {
      await UserAccount.updatePassword(
        body.oldPassword,
        body.newPassword,
        accessToken
      );
    }

    delete body.oldPassword;
    delete body.newPassword;

    const hasEmailChanged = body.email !== account.email;
    if (!hasEmailChanged) delete body.email;

    await account.patchAttributes({ ...body }, false);

    const token = await UserAccount.app.models.CustomAccessToken.create({
      userId: accessToken.userId
    });

    return { tokenId: token.id, profilePicture: account.profilePicture };
  };
  UserAccount.remoteMethod("updateMyProfile", {
    description: "Update users's profile.",
    accepts: [
      {
        arg: "accessToken",
        type: "object",
        http: ctx => {
          const req = ctx && ctx.req;
          const accessToken = req && req.accessToken ? req.accessToken : null;
          return accessToken;
        }
      },
      { arg: "body", type: "object", http: { source: "body" } }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "patch", path: "/update-my-account" }
  });

  // change password
  UserAccount.updatePassword = async (
    oldPassword,
    newPassword,
    accessToken
  ) => {
    if (!accessToken || !accessToken.userId)
      throw error("Unauthorized User", 403);

    // find current user
    const user = await UserAccount.findById(accessToken.userId);
    if (!user) throw error("Unauthorized User", 403);

    // check if old password is correct
    const isMatch = await new Promise(resolve => {
      bcrypt.compare(oldPassword, user.password, (err, match) => {
        resolve(match);
      });
    });

    // if old password is not correct throw error
    if (!isMatch) throw error("Incorrect Old Password", 403);

    await UserAccount.setPassword(user.id, newPassword);

    await UserAccount.login({
      email: user.email,
      password: newPassword
    });

    const token = await UserAccount.app.models.CustomAccessToken.create({
      userId: user.id
    });

    return { tokenId: token.id };
  };
  UserAccount.remoteMethod("updatePassword", {
    description: "Request password change",
    accepts: [
      { arg: "oldPassword", type: "string", required: true },
      { arg: "newPassword", type: "string", required: true },
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
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/update-password" }
  });

  /**
   * Return user post, feedback and replies including profile information
   */
  UserAccount.myPosts = async (
    accessToken,
    userAccountId,
    limit,
    skip,
    order
  ) => {
    const { Post } = UserAccount.app.models;

    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const userId = userAccountId || accessToken.userId;

    limit = limit || 0;
    skip = skip || 0;
    order = order || "createdAt DESC";

    const postCount = await Post.count({
      createdById: userId
    });

    const userPosts = await Post.find({
      where: {
        createdById: userId
      },
      include: ["category"],
      limit,
      skip,
      order
    });

    const posts = { count: postCount, rows: userPosts };

    return posts;
  };
  UserAccount.remoteMethod("myPosts", {
    description: "return user posts with vote",
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
      { arg: "userAccountId", type: "string", required: false },
      { arg: "limit", type: "number", required: false },
      { arg: "skip", type: "number", required: false },
      { arg: "order", type: "string", required: false }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/my-posts" }
  });

  /**
   * Return user Agendas, feedback and replies including profile information
   */
  UserAccount.myPosts = async (
    accessToken,
    userAccountId,
    limit,
    skip,
    order
  ) => {
    const { MainTopic } = UserAccount.app.models;

    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const userId = userAccountId || accessToken.userId;

    limit = limit || 0;
    skip = skip || 0;
    order = order || "createdAt DESC";

    const agendaCount = await MainTopic.count({
      createdById: userId
    });

    const userAgendas = await MainTopic.find({
      where: {
        createdById: userId
      },
      include: ["post"],
      limit,
      skip,
      order
    });

    const agendas = { count: agendaCount, rows: userAgendas };

    return agendas;
  };
  UserAccount.remoteMethod("myAgendas", {
    description: "return user posts with vote",
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
      { arg: "userAccountId", type: "string", required: false },
      { arg: "limit", type: "number", required: false },
      { arg: "skip", type: "number", required: false },
      { arg: "order", type: "string", required: false }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/my-agendas" }
  });

  /**
   * Return user post, feedback and replies including profile information
   */
  UserAccount.myReplies = async (
    accessToken,
    userAccountId,
    limit,
    skip,
    order
  ) => {
    const { FeedbackReply } = UserAccount.app.models;

    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const userId = userAccountId || accessToken.userId;

    limit = limit || 0;
    skip = skip || 0;
    order = order || "createdAt DESC";

    const replyCount = await FeedbackReply.count({
      createdById: userId
    });

    const userReplies = await FeedbackReply.find({
      where: {
        createdById: userId
      },
      limit,
      skip,
      order
    });

    const replies = { count: replyCount, rows: userReplies };

    return replies;
  };
  UserAccount.remoteMethod("myReplies", {
    description: "return user Replies",
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
      { arg: "userAccountId", type: "string", required: false },
      { arg: "limit", type: "number", required: false },
      { arg: "skip", type: "number", required: false },
      { arg: "order", type: "string", required: false }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/my-replies" }
  });

  UserAccount.myFeedbacks = async (
    accessToken,
    userAccountId,
    limit,
    skip,
    order
  ) => {
    const { Feedback } = UserAccount.app.models;

    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const userId = userAccountId || accessToken.userId;

    limit = limit || 0;
    skip = skip || 0;
    order = order || "createdAt DESC";

    const feedbackCount = await Feedback.count({
      createdById: userId
    });

    const userFeedbacks = await Feedback.find({
      where: {
        createdById: userId
      },
      limit,
      skip,
      order
    });

    const feedbacks = { count: feedbackCount, rows: userFeedbacks };

    return feedbacks;
  };
  UserAccount.remoteMethod("myFeedbacks", {
    description: "return user feedbacks with vote",
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
      { arg: "userAccountId", type: "string", required: false },
      { arg: "limit", type: "number", required: false },
      { arg: "skip", type: "number", required: false },
      { arg: "order", type: "string", required: false }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/my-feedbacks" }
  });

  UserAccount.mySystemFeedbacks = async (
    accessToken,
    userAccountId,
    limit,
    skip,
    order
  ) => {
    const { UserFeedback } = UserAccount.app.models;

    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const userId = userAccountId || accessToken.userId;

    limit = limit || 0;
    skip = skip || 0;
    order = order || "createdAt DESC";

    const feedbackCount = await UserFeedback.count({
      createdById: userId
    });

    const userFeedbacks = await UserFeedback.find({
      where: {
        and: [{ userId }, { feedbackType: "FEEDBACK" }]
      },
      limit,
      skip,
      order
    });

    const feedbacks = { count: feedbackCount, rows: userFeedbacks };

    return feedbacks;
  };
  UserAccount.remoteMethod("mySystemFeedbacks", {
    description: "return user feedbacks with vote",
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
      { arg: "userAccountId", type: "string", required: false },
      { arg: "limit", type: "number", required: false },
      { arg: "skip", type: "number", required: false },
      { arg: "order", type: "string", required: false }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/my-system-feedbacks" }
  });

  UserAccount.getUserProfile = async (accessToken, userAccountId) => {
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const userId = userAccountId || accessToken.userId;

    const user = await UserAccount.findById(userId);
    return user;
  };
  UserAccount.remoteMethod("getUserProfile", {
    description: "return user",
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
      { arg: "userAccountId", type: "string", required: false }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/get-user-profile" }
  });

  UserAccount.search = async (
    accessToken,
    emailObj,
    keyword,
    limit,
    skip,
    order
  ) => {
    if (!accessToken || !accessToken.userId)
      throw error("Unauthorized User", 403);

    limit = limit || 0;
    skip = skip || 0;
    order = order || "createdAt DESC";

    const { invitedEmails } = emailObj;
    const user = await UserAccount.findOne({
      where: {
        id: accessToken.userId
      }
    });
    const { email } = user;
    invitedEmails.push(email);

    const users = await UserAccount.find({
      where: {
        and: [
          {
            or: [
              { givenName: { like: `${keyword}.*`, options: "i" } },
              { familyName: { like: `${keyword}.*`, options: "i" } },
              { email: { like: `${keyword}.*`, options: "i" } }
            ]
          },
          { email: { nin: invitedEmails } }
        ]
      },
      limit,
      skip,
      order
    });

    return users;
  };

  UserAccount.remoteMethod("search", {
    description: "search users by email, givenName or familyName",
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
      { arg: "emailObj", type: "object", required: true },
      { arg: "keyword", type: "string", required: true },
      { arg: "limit", type: "number" },
      { arg: "skip", type: "number" },
      { arg: "order", type: "string" }
    ],
    returns: {
      type: "array",
      root: true
    },
    http: { verb: "post", path: "/search" }
  });

  UserAccount.feedback = async (
    accessToken,
    feedbackType,
    urgencyLevel,
    subject,
    description
  ) => {
    if (!accessToken || !accessToken.userId)
      throw error("Unauthorized User", 403);

    const { UserFeedback } = UserAccount.app.models;
    await UserFeedback.create({
      userId: accessToken.userId,
      feedbackType,
      urgencyLevel,
      subject,
      description
    });

    return { status: true };
  };

  UserAccount.remoteMethod("feedback", {
    description: "report feedback or an issue.",
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
      { arg: "feedbackType", type: "string", required: true },
      { arg: "urgencyLevel", type: "string", required: false },
      { arg: "subject", type: "string", required: true },
      { arg: "description", type: "string", required: true }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/feedback" }
  });

  UserAccount.myStatus = async (
    accessToken,
    userAccountId,
    limit,
    skip,
    order
  ) => {
    const {
      MainTopic,
      Feedback,
      Post,
      FeedbackReply,
      UserFeedback
    } = UserAccount.app.models;

    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const userId = userAccountId || accessToken.userId;

    limit = limit || 0;
    skip = skip || 0;
    order = order || "createdAt DESC";

    const agendaCount = await MainTopic.count({
      createdById: userId
    });

    const userAgendas = await MainTopic.find({
      where: {
        createdById: userId
      },
      include: ["posts"],
      limit,
      skip,
      order
    });

    const postCount = await Post.count({
      createdById: userId
    });

    const userPosts = await Post.find({
      where: {
        createdById: userId
      },
      include: ["category"],
      limit,
      skip,
      order
    });

    const feedbackCount = await Feedback.count({
      createdById: userId
    });

    const feedbacks = await Feedback.find({
      where: {
        createdById: userId
      },
      limit,
      skip,
      order
    });

    const replyCount = await FeedbackReply.count({
      createdById: userId
    });

    const useReplies = await FeedbackReply.find({
      where: {
        createdById: userId
      },
      limit,
      skip,
      order
    });

    const userFeedbackCount = await UserFeedback.count({
      userId
    });

    const userFeedbacks = await UserFeedback.find({
      where: {
        userId
      },
      limit,
      skip,
      order
    });

    const result = {
      agendas: { count: agendaCount, rows: userAgendas },
      posts: { count: postCount, rows: userPosts },
      feedbacks: { count: feedbackCount, rows: feedbacks },
      replies: { count: replyCount, rows: useReplies },
      systemFeedbacks: { count: userFeedbackCount, rows: userFeedbacks }
    };

    return result;
  };
  UserAccount.remoteMethod("myStatus", {
    description: "return user status.",
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
      { arg: "userAccountId", type: "string", required: false },
      { arg: "limit", type: "number", required: false },
      { arg: "skip", type: "number", required: false },
      { arg: "order", type: "string", required: false }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/my-status" }
  });
};
