const fs = require("fs");
const formidable = require("formidable");
const { error: Error } = require("../util");

module.exports = GenericDocument => {
  const BUCKET = "generic-document";

  GenericDocument.upload = async (req, res, accessToken) => {
    const {
      name: storageName,
      root: storageRoot
    } = GenericDocument.app.dataSources.storage.settings;

    if (!accessToken || !accessToken.userId || !accessToken.userInfo.isAdmin)
      throw Error("Forbidden User", 403);

    const uploadedById = accessToken.userId;

    if (storageName === "storage") {
      const path = `${storageRoot}/${BUCKET}/`;

      if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
      }
    } else throw Error("Unknown Storage", 400);

    const { Container } = GenericDocument.app.models;
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

      const document = GenericDocument.findById(documentId || 0);
      if (!document) throw Error("Unknown Document", 412);

      const result = await GenericDocument.upsertWithWhere(
        { id: documentId || 0 },
        {
          title,
          files,
          uploadedById,
          container: BUCKET
        }
      );

      return result;
    } catch (err) {
      throw err;
    }
  };

  GenericDocument.remoteMethod("upload", {
    description: "Uploads a file or multiple files",
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

  GenericDocument.observe("before save", async context => {
    const { Container } = GenericDocument.app.models;
    if (context.data && context.data.deletedId) {
      GenericDocument.findById(context.data.deletedId).then(doc => {
        if (doc && doc.file) {
          Container.removeFile(BUCKET, doc.file.name);
        }
      });
    }
  });

  GenericDocument.list = async (limit, skip, order, filter, accessToken) => {
    if (!accessToken || !accessToken.userId) {
      throw Error("Unauthorized User", 403);
    }

    limit = limit || 10;
    skip = skip || 0;
    order = order || "createdAt ASC";
    filter = filter || {};

    const count = await GenericDocument.count({ ...filter });

    const documents = await GenericDocument.find({
      include: ["uploadedBy"],
      limit,
      skip,
      order
    });
    // let files = documents.map(doc => doc.files);
    // files = [].concat(...files);
    return { count, rows: documents };
  };

  GenericDocument.remoteMethod("list", {
    description: "return list of documents.",
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
