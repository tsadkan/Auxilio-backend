const { error } = require("../util");

module.exports = function(UserPostVote) {
  /**
   * Saves users post reaction.
   *
   * Up Vote is represented by 1
   * Down Vote is represented by -1
   * Neutral state is represented by 0
   *
   * when doubling the same reaction,the reaction will be rested to  neutral
   * i.e Up Vote + Up Vote => NEUTRAL & same goes for down vote
   *
   * @param {Object} accessToken
   * @param {String} postId
   * @param {Number} vote
   */
  UserPostVote.vote = async (accessToken, postId, vote) => {
    UserPostVote.app.logger.info(vote, postId);
    const { Post } = UserPostVote.app.models;
    if (!(vote === 1 || vote === -1)) {
      throw error("Vote can only be 1 or -1", 422);
    }
    if (!accessToken || !accessToken.userId) throw Error("Forbidden User", 403);

    const { userId } = accessToken;

    const exists = await Post.findOne({ where: { id: postId } });
    if (!exists) {
      throw error("Post does note exist", 404);
    }

    const existingReaction = await UserPostVote.findOne({
      where: { userId, postId }
    });
    let newVote;
    if (existingReaction) {
      newVote = existingReaction.vote === vote ? 0 : vote;
    } else {
      newVote = vote;
    }

    await UserPostVote.upsertWithWhere(
      { postId, userId },
      { postId, userId, vote: newVote }
    );

    const postVotes = await UserPostVote.find({ where: { postId } });
    if (!postVotes) {
      throw error();
    }
    const result = postVotes.reduce(
      (agg, post) => {
        if (post.vote === 1) {
          agg.upVote += 1;
        }
        if (post.vote === -1) {
          agg.downVote += 1;
        }
        return agg;
      },
      {
        upVote: 0,
        downVote: 0
      }
    );

    const userReaction = await UserPostVote.findOne({
      where: { postId, userId }
    });
    result.voted = userReaction.vote;

    return result;
  };

  UserPostVote.remoteMethod("vote", {
    description: "Vote a post",
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
      { arg: "postId", type: "string", required: true },
      { arg: "vote", type: "number", required: true }
    ],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "post", path: "/" }
  });
};
