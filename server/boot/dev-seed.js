const casual = require("casual");

module.exports = async app => {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  const { Post, Feedback, FeedbackReplay, UserAccount } = app.models;

  const SEED_USERS_AMOUNT = 30;
  const SEED_POSTS_AMOUNT = 50;
  const SEED_FEEDBACKS_AMOUNT = 150;
  const SEED_REPLAYS_AMOUNT = 100;
  const enoughDataAvailable = async () => {
    const posts = await Post.count();
    const feedbacks = await Feedback.count();
    const replays = await FeedbackReplay.count();
    return (
      posts &&
      feedbacks &&
      replays &&
      posts >= SEED_POSTS_AMOUNT &&
      feedbacks >= SEED_FEEDBACKS_AMOUNT &&
      replays >= SEED_REPLAYS_AMOUNT
    );
  };

  if (await enoughDataAvailable()) return;
  app.logger.info("generating seed data for development");
  try {
    const users = [];
    for (let i = 0; i < SEED_USERS_AMOUNT; i += 1) {
      users.push({
        fullName: casual.full_name,
        email: casual.email,
        password: casual.password
      });
    }
    const accounts = await UserAccount.create(users);

    const posts = [];
    for (let i = 0; i < SEED_POSTS_AMOUNT; i += 1) {
      posts.push({
        title: casual.description,
        description: casual.text,
        createdById: accounts[Math.floor(Math.random() * accounts.length)].id
      });
    }
    const postsCreated = await Post.create(posts);
    const feedbacks = [];
    for (let i = 0; i < SEED_FEEDBACKS_AMOUNT; i += 1) {
      feedbacks.push({
        body: casual.text,
        createdById: accounts[Math.floor(Math.random() * accounts.length)].id,
        postId: postsCreated[Math.floor(Math.random() * postsCreated.length)].id
      });
    }

    const feedbacksCreated = await Feedback.create(feedbacks);

    const feedbackReplays = [];
    for (let i = 0; i < SEED_REPLAYS_AMOUNT; i += 1) {
      feedbackReplays.push({
        body: casual.text,
        createdById: accounts[Math.floor(Math.random() * accounts.length)].id,
        postId:
          postsCreated[Math.floor(Math.random() * postsCreated.length)].id,
        feedbackId:
          feedbacksCreated[Math.floor(Math.random() * feedbacksCreated.length)]
            .id
      });
    }
    await FeedbackReplay.create(feedbackReplays);
  } catch (err) {
    app.logger.error(err);
  }
};
