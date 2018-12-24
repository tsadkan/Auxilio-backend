const fs = require("fs-extra");
const path = require("path");
const gm = require("gm").subClass({ imageMagick: true });

const { error } = require("../util");

module.exports = Container => {
  function resizer(srcPath, dstPath, width, height) {
    return new Promise((resolve, reject) => {
      try {
        gm(srcPath)
          .resize(width, height)
          .resizeExact(width, height)
          .noProfile()
          .write(dstPath, err => {
            if (err) {
              throw err;
            }
            resolve();
          });
      } catch (err) {
        reject(err);
      }
    });
  }

  const resizeImages = async (file, containerName, isThumbnail) => {
    const fileName = file.name.split(".");
    const baseDir = path.join(__dirname, "../", "../");
    const fileExtension = `.${fileName.pop()}`;
    const srcPath = path.join(baseDir, containerName, fileName + fileExtension);
    const dstPath = path.join(
      baseDir,
      containerName,
      `${fileName}-temp${fileExtension}`
    );

    // if the coming file if thumbnail resize it by 50x50
    if (isThumbnail) {
      await resizer(srcPath, dstPath, 50, 50);
    } else {
      await resizer(srcPath, dstPath, 300, 300);
    }

    await fs.remove(srcPath);
    await fs.move(dstPath, srcPath);
  };

  const checkFileType = (file, container) => {
    const extention = file.name.split(".").pop();

    let fileTest;

    /*
     *  if the container is forumfeedback means .... file uploader is user
     *  so, restricting the user from uploading image, audio and video files
     *
     *  otherwise the uploader is admin or content manager .... he can upload
     *  any type in the list.
     * */
    if (container === "forumfeedback" || container === "archive") {
      fileTest = !(
        file.type.startsWith("image") ||
        file.type.startsWith("video") ||
        file.type.startsWith("audio")
      );
    } else {
      fileTest = /(jpe?g|png|wma|mp3|m4a|mp4|wmv|avi|webm|pdf|docx|xlst|ppt)$/i.test(
        extention
      );
    }

    // if the coming file is not in the above list
    if (!fileTest) {
      throw error(`Unsupported file format - ${extention}`);
    }
  };

  const upload = (req, res, container) =>
    new Promise((resolve, reject) => {
      Container.upload(
        req,
        res,
        {
          container
        },
        (err, fileObj) => {
          // if the user does not upload any file return it as undefined
          if (!fileObj) {
            return resolve(undefined);
          }
          if (err) reject(err);
          return resolve(fileObj);
        }
      );
    });

  Container.customUpload = async (req, res, container) => {
    const fileObj = await upload(req, res, container);

    // if the user does not upload any file return it as empty filesInfo array
    if (fileObj) {
      /*
       * if there are files uploaded ...
       * for every file call checkFileType method and if error happens throw error
       * then
       * if the file type is image call resizeImage method
       * */
      if (fileObj.files.file) {
        fileObj.files.file.map(file => {
          checkFileType(file, container);

          if (file.type.startsWith("image")) {
            resizeImages(
              file,
              path.join(
                Container.app.dataSources.storage.settings.root,
                file.container
              ),
              false
            );
          }
          return file;
        });
      }

      if (fileObj.files.thumbnail) {
        fileObj.files.thumbnail.map(file => {
          checkFileType(file, container);

          // if the upcoming file for thumbnail is not image throw error
          if (file.type.startsWith("image")) {
            resizeImages(
              file,
              path.join(
                Container.app.dataSources.storage.settings.root,
                file.container
              ),
              true
            );
          } else {
            throw error(`Unsupported thumbnail format type`);
          }

          return file;
        });
      }

      return fileObj.files;
    }
    return [];
  };

  Container.remoteMethod("customUpload", {
    description: "Uploads file",
    accepts: [
      { arg: "req", type: "object", http: { source: "req" } },
      { arg: "res", type: "object", http: { source: "res" } },
      { arg: "container", type: "string", required: true }
    ],
    returns: {
      arg: "fileObject",
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/:container/customUpload" }
  });
};
