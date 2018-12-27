const casual = require("casual");

module.exports = async app => {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  const {
    Post,
    Feedback,
    FeedbackReply,
    UserAccount,
    UserRole,
    PostCategory
  } = app.models;

  const SEED_USERS_AMOUNT = 30;
  const SEED_POSTS_AMOUNT = 50;
  const SEED_FEEDBACKS_AMOUNT = 150;
  const SEED_REPLAYS_AMOUNT = 100;
  const enoughDataAvailable = async () => {
    const posts = await Post.count();
    const feedbacks = await Feedback.count();
    const replays = await FeedbackReply.count();
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
  app.logger.info("Dev Seed Started");
  const memberRole = await UserRole.findOne({
    where: { name: "member" }
  });
  if (!memberRole) {
    app.logger.error("Unable to find member role");
    return;
  }
  try {
    const users = [];
    for (let i = 0; i < SEED_USERS_AMOUNT; i += 1) {
      users.push({
        title: casual.name_prefix,
        fullName: casual.full_name,
        email: casual.email,
        phoneNumber: casual.phone,
        password: casual.password,
        roleId: memberRole.id
      });
    }
    const accounts = await UserAccount.create(users);

    const categories = [];
    for (let i = 0; i < 4; i += 1) {
      categories.push({
        name: casual.word,
        color: casual.rgb_hex
      });
    }
    const categoriesCreated = await PostCategory.create(categories);

    const posts = [];
    for (let i = 0; i < SEED_POSTS_AMOUNT; i += 1) {
      posts.push({
        title: casual.description,
        description: casual.text,
        endDate: casual.date(),
        createdById: accounts[Math.floor(Math.random() * accounts.length)].id,
        categoryId:
          categoriesCreated[
            Math.floor(Math.random() * categoriesCreated.length)
          ].id
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

    const replies = [];
    for (let i = 0; i < SEED_REPLAYS_AMOUNT; i += 1) {
      replies.push({
        body: casual.text,
        createdById: accounts[Math.floor(Math.random() * accounts.length)].id,
        postId:
          postsCreated[Math.floor(Math.random() * postsCreated.length)].id,
        feedbackId:
          feedbacksCreated[Math.floor(Math.random() * feedbacksCreated.length)]
            .id
      });
    }
    await FeedbackReply.create(replies);
    app.logger.info("Dev Seed Complete");
  } catch (err) {
    if (err) {
      app.logger.error(`dev seed error:: ${err.toString()}`);
    }
  }
};
