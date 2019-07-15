const fs = require("fs");
const formidable = require("formidable");
const { error: Error } = require("../util");

module.exports = Announcement => {
  const BUCKET = "announcement";

  Announcement.upload = async (req, res, accessToken) => {
    const {
      name: storageName,
      root: storageRoot
    } = Announcement.app.dataSources.storage.settings;

    if (!accessToken || !accessToken.userId || !accessToken.userInfo.isAdmin)
      throw Error("Forbidden User", 403);

    const uploadedById = accessToken.userId;

    if (storageName === "storage") {
      const path = `${storageRoot}/${BUCKET}/`;

      if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
      }
    } else throw Error("Unknown Storage", 400);

    const {
      Container,
      NotificationConfig,
      AppNotification,
      UserAccount
    } = Announcement.app.models;
    const user = await UserAccount.findById(accessToken.userId);
    const form = new formidable.IncomingForm();

    const filePromise = Container.customUpload(req, res, BUCKET);

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

      let files = (filesInfo.files || []).map(file => ({
        name: file.name,
        size: file.size,
        originalName: file.originalFilename,
        fileType: file.type
      }));
      files = files.length === 0 ? undefined : files;

      const { title, documentId } = fields;

      const document = Announcement.findById(documentId || 0);
      if (!document) throw Error("Unknown Document", 412);

      const result = await Announcement.upsertWithWhere(
        { id: documentId || 0 },
        {
          title,
          files,
          uploadedById,
          container: BUCKET
        }
      );

      const announcementNotificationConfigs = await NotificationConfig.find({
        where: {
          onAnnouncementCreate: true
        }
      });
      const announcementSubscribedUsersIds = announcementNotificationConfigs.map(
        config => config.userAccountId
      );

      await Promise.all(
        (announcementSubscribedUsersIds || []).map(async id => {
          //  construct notification object to send for the users
          const notification = {
            title: "New Announcement",
            body: `${user.givenName} ${
              user.familyName
            } posted new announcement`,
            userAccountId: id
          };

          // create notification for the user
          await AppNotification.create(notification);
        })
      );

      return result;
    } catch (err) {
      throw err;
    }
  };

  Announcement.remoteMethod("upload", {
    description: "Uploads announcement with a file",
    accepts: [
      { arg: "req", type: "object", http: { source: "req" } },
      { arg: "res", type: "object", http: { source: "res" } },
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
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/upload" }
  });

  Announcement.observe("before save", async context => {
    const { Container } = Announcement.app.models;
    if (context.data && context.data.deletedId) {
      Announcement.findById(context.data.deletedId).then(doc => {
        if (doc && doc.file) {
          Container.removeFile(BUCKET, doc.file.name);
        }
      });
    }
  });

  Announcement.list = async (limit, skip, order, filter, accessToken) => {
    if (!accessToken || !accessToken.userId) {
      throw Error("Unauthorized User", 403);
    }

    limit = limit || 0;
    skip = skip || 0;
    order = order || "createdAt ASC";
    filter = filter || {};

    const count = await Announcement.count({ ...filter });

    const announcements = await Announcement.find({
      include: ["uploadedBy"],
      limit,
      skip,
      order
    });
    return { count, rows: announcements };
  };

  Announcement.remoteMethod("list", {
    description: "return list of announcements.",
    accepts: [
      { arg: "limit", type: "number" },
      { arg: "skip", type: "number" },
      { arg: "order", type: "string" },
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
};
