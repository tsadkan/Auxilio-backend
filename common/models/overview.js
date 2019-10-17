const fs = require("fs");
const formidable = require("formidable");
const { error: Error } = require("../util");

module.exports = Overview => {
  const BUCKET = "overview";

  Overview.createOverview = async (req, res, accessToken) => {
    const {
      name: storageName,
      root: storageRoot
    } = Overview.app.dataSources.storage.settings;

    if (!accessToken || !accessToken.userId || !accessToken.userInfo.isAdmin)
      throw Error("Forbidden User", 403);

    const uploadedById = accessToken.userId;

    if (storageName === "storage") {
      const path = `${storageRoot}/${BUCKET}/`;

      if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
      }
    } else throw Error("Unknown Storage", 400);

    const { Container } = Overview.app.models;
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

      const files = (filesInfo.files || []).map(file => ({
        name: file.name,
        size: file.size,
        originalName: file.originalFilename,
        fileType: file.type
      }));
      const videoSummary = files.length === 0 ? undefined : files[0].name;

      const { pdflink, overviewId, socialLinks } = fields;

      const overview = Overview.findById(overviewId || 0);
      if (!overview) throw Error("Unknown Overview", 412);

      const result = await Overview.upsertWithWhere(
        { id: overviewId || 0 },
        {
          pdflink,
          videoSummary,
          socialLinks: JSON.parse(socialLinks),
          uploadedById,
          container: BUCKET
        }
      );

      return result;
    } catch (err) {
      throw err;
    }
  };

  Overview.remoteMethod("createOverview", {
    description: "Creates or updates overview with featured image",
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
    http: { verb: "post", path: "/create-overview" }
  });

  Overview.observe("before save", async context => {
    const { Container } = Overview.app.models;
    if (context.data && context.data.deletedId) {
      Overview.findById(context.data.deletedId).then(doc => {
        if (doc && doc.file) {
          Container.removeFile(BUCKET, doc.file.name);
        }
      });
    }
  });

  Overview.list = async (limit, skip, order, filter, accessToken) => {
    if (!accessToken || !accessToken.userId) {
      throw Error("Unauthorized User", 403);
    }

    limit = limit || 0;
    skip = skip || 0;
    order = order || "createdAt ASC";
    filter = filter || {};

    const count = await Overview.count({ ...filter });

    const announcements = await Overview.find({
      include: ["uploadedBy"],
      limit,
      skip,
      order
    });
    return { count, rows: announcements };
  };

  Overview.remoteMethod("list", {
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
