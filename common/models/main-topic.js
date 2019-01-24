const TokenGenerator = require("uuid-token-generator");
const loopback = require("loopback");
const path = require("path");
const parser = require("useragent-parser-js");

const { error, sort } = require("../util");

module.exports = function(MainTopic) {
  const getMyTopics = async (userId, limit, skip) => {
    const { TopicInvitation } = MainTopic.app.models;

    const topicInvitations = await TopicInvitation.find({
      where: {
        userId,
        isConfirmed: true
      },
      include: ["user"]
    });

    const myTopicIds = topicInvitations.map(
      invitation => invitation.mainTopicId
    );

    const myTopics = await MainTopic.find({
      where: { id: { inq: myTopicIds } },
      include: ["posts", "createdBy", "category", "users"],
      limit,
      skip
    });

    return myTopics;
  };

  const includeInvitedUsers = async (userId, mainTopicId) => {
    const { TopicInvitation } = MainTopic.app.models;

    const topicInvitations = await TopicInvitation.find({
      where: {
        mainTopicId
      },
      include: ["user"]
    });

    const users = topicInvitations.map(invitation => {
      const user = invitation.user();
      user.isConfirmed = invitation.isConfirmed;
      user.isAdmin = invitation.isAdmin;
      user.isActive = user.id.toString() === userId.toString();
      return user;
    });

    return users;
  };

  MainTopic.list = async (limit, skip, filter, accessToken) => {
    const { Post } = MainTopic.app.models;

    if (!accessToken || !accessToken.userId) {
      throw error("Unauthorized User", 403);
    }

    limit = limit || 0;
    skip = skip || 0;

    const count = await MainTopic.count({ ...filter });

    const mainTopics = await getMyTopics(accessToken.userId, limit, skip);

    const postLimit = 4;
    const postSkip = 0;

    let result = await Promise.all(
      mainTopics.map(async mainTopic => {
        const posts = await Post.list(
          postLimit,
          postSkip,
          { mainTopicId: mainTopic.id, ...filter },
          accessToken
        );
        mainTopic.subTopics = posts;
        mainTopic.subTopicLength = posts.rows.length;
        if (posts.rows.length > 0) {
          let upVote = 0;
          let downVote = 0;
          let numberOfFeedbacks = 0;

          posts.rows.forEach(post => {
            upVote += post.upVote;
            downVote += post.downVote;
            numberOfFeedbacks += post.numberOfFeedbacks;
          });

          mainTopic.upVote = upVote;
          mainTopic.downVote = downVote;
          mainTopic.aggregateVote = upVote - downVote;
          mainTopic.numberOfFeedbacks = numberOfFeedbacks;
        } else {
          mainTopic.upVote = 0;
          mainTopic.downVote = 0;
          mainTopic.numberOfFeedbacks = 0;
          mainTopic.aggregateVote = 0;
        }

        const users = await includeInvitedUsers(
          accessToken.userId,
          mainTopic.id
        );
        mainTopic.invitedUsers = users;

        return mainTopic;
      })
    );

    result = sort(result, "subTopicLength");
    result = sort(result, "aggregateVote");

    return { count, rows: result };
  };

  MainTopic.remoteMethod("list", {
    description: "return list of main topics including posts inside.",
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

  MainTopic.confirmInvitation = async (invitationHash, accessToken) => {
    if (!accessToken || !accessToken.userId) {
      throw error("Unauthorized User", 403);
    }

    const { TopicInvitation } = MainTopic.app.models;

    const topicInvitation = await TopicInvitation.findOne({
      where: {
        invitationHash
      }
    });

    if (!topicInvitation) throw error("Invalid invitation.", 403);

    const { mainTopicId } = topicInvitation;

    await topicInvitation.patchAttributes({
      isConfirmed: true
    });

    return { mainTopicId };
  };

  MainTopic.remoteMethod("confirmInvitation", {
    description: "confirm user invitation for main topic.",
    accepts: [
      { arg: "invitationHash", type: "string", required: true },
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
    http: { path: "/confirm-invitation", verb: "post" }
  });

  MainTopic.leaveTopic = async (mainTopicId, userId, accessToken) => {
    if (!accessToken || !accessToken.userId) {
      throw error("Unauthorized User", 403);
    }

    const { TopicInvitation } = MainTopic.app.models;

    await TopicInvitation.destroyAll({
      mainTopicId,
      userId
    });

    return { status: true };
  };

  MainTopic.remoteMethod("leaveTopic", {
    description: "remove user from topic.",
    accepts: [
      { arg: "mainTopicId", type: "string", required: true },
      { arg: "userId", type: "string", required: true },
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
    http: { path: "/leave-topic", verb: "post" }
  });

  MainTopic.invite = async (
    email,
    mainTopicId,
    invitationMessage,
    accessToken,
    userInfo
  ) => {
    if (!accessToken || !accessToken.userId) {
      throw error("Unauthorized User", 403);
    }

    const { TopicInvitation, UserAccount, Email } = MainTopic.app.models;
    const { userId } = accessToken;
    const user = await UserAccount.findById(userId);
    const mainTopic = await MainTopic.findById(mainTopicId);

    if (!mainTopic) throw error("Unkonwn topic", 403);

    const sendEmail = async msg => {
      const result = await Email.send(msg);

      return result;
    };

    // generate an invitation template containing a link(hash, topicid)

    const { browserName, OSName } = userInfo;
    // generate unique token
    const tokgen = new TokenGenerator(256, TokenGenerator.BASE62);
    const invitationHash = tokgen.generate();

    // read the reset url from env file
    const { INVITATION_URL } = process.env;
    const fullName = `${user.givenName} ${user.familyName}`;
    const { ADMIN_EMAIL } = process.env;
    const invitationUrl = `${INVITATION_URL}${invitationHash}`;

    const content = {
      fullName,
      invitationUrl,
      cardName: mainTopic.title,
      invitationMessage,
      OSName,
      browserName
    };

    const renderer = loopback.template(
      path.resolve(__dirname, "../../common/views/invitation-template.ejs")
    );
    const htmlBody = renderer(content);
    const messageContent = {
      to: email,
      from: ADMIN_EMAIL,
      subject: "Invitation",
      text: "You are invited to a card in auxilio.",
      html: htmlBody
    };

    await sendEmail(messageContent);

    const toSentUser = await UserAccount.findOne({
      where: {
        email
      }
    });
    await TopicInvitation.upsertWithWhere(
      {
        userId: toSentUser.id,
        mainTopicId
      },
      {
        invitationHash,
        userId: toSentUser.id,
        mainTopicId
      }
    );

    return { status: true };
  };

  MainTopic.remoteMethod("invite", {
    description: "invite a user to a main topic.",
    accepts: [
      { arg: "email", type: "string", required: true },
      { arg: "mainTopicId", type: "string", required: true },
      { arg: "invitationMessage", type: "string", required: false },
      {
        arg: "accessToken",
        type: "object",
        http: ctx => {
          const req = ctx && ctx.req;
          const accessToken = req && req.accessToken ? req.accessToken : null;
          return accessToken;
        }
      },
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
    returns: { type: "object", root: true },
    http: { path: "/invite", verb: "post" }
  });

  MainTopic.createTopic = async (accessToken, title, description) => {
    if (!accessToken || !accessToken.userId) {
      throw error("Unauthorized User", 403);
    }

    const { TopicInvitation } = MainTopic.app.models;

    const { userId } = accessToken;

    const mainTopic = await MainTopic.create({
      title,
      description,
      createdById: userId
    });

    await TopicInvitation.create({
      mainTopicId: mainTopic.id,
      userId,
      isConfirmed: true,
      isAdmin: true
    });

    return mainTopic;
  };

  MainTopic.remoteMethod("createTopic", {
    description: "create new topic.",
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
      { arg: "title", type: "string", required: true },
      { arg: "description", type: "string" }
    ],
    returns: { type: "object", root: true },
    http: { path: "/create-topic", verb: "post" }
  });
};
