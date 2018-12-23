const casual = require("casual");

module.exports = async app => {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  const { Post, Feedback, FeedbackReplay, UserAccount } = app.models;

  const enoughDataAvailable = async () => {
    const posts = await Post.count();
    const feedbacks = await Feedback.count();
    const replays = await FeedbackReplay.count();
    return (
      posts &&
      feedbacks &&
      replays &&
      posts >= 100 &&
      feedbacks >= 25 &&
      replays >= 25
    );
  };

  if (await enoughDataAvailable()) return;
  app.logger.info("generating seed data for development");
  try {
    const users = [];
    for (let i = 0; i < 30; i += 1) {
      users.push({
        fullName: casual.full_name,
        email: casual.email,
        password: casual.password
      });
    }
    const accounts = await UserAccount.create(users);

    const posts = [];
    for (let i = 0; i < 100; i += 1) {
      posts.push({
        title: casual.description,
        description: casual.text,
        createdById: accounts[Math.floor(Math.random() * accounts.length)].id
      });
    }
    const postsCreated = await Post.create(posts);
    const feedbacks = [];
    for (let i = 0; i < 25; i += 1) {
      feedbacks.push({
        body: casual.text,
        createdById: accounts[Math.floor(Math.random() * accounts.length)],
        postId: postsCreated[Math.floor(Math.random() * postsCreated.length)]
      });
    }

    const feedbacksCreated = await Feedback.create(feedbacks);

    const feedbackReplays = [];
    for (let i = 0; i < 25; i += 1) {
      feedbackReplays.push({
        body: casual.text,
        createdById: accounts[Math.floor(Math.random() * accounts.length)],
        postId: postsCreated[Math.floor(Math.random() * postsCreated.length)],
        feedbackId:
          feedbacksCreated[Math.floor(Math.random() * feedbacksCreated.length)]
      });
    }
    await FeedbackReplay.create(feedbackReplays);
  } catch (err) {
    app.logger.error(err);
  }
};
