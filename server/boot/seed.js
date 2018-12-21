const { error } = require("../../common/util");

async function seedCategories(app) {
  const { PostCategory } = app.models;
  const categories = [
    { name: "Infrastructure" },
    { name: "Health" },
    { name: "Other" }
  ];
  for (const category of categories) {
    // eslint-disable-next-line
    await PostCategory.findOrCreate({ name: category.name }, category);
  }
}
async function seedTags(app) {
  const { Tag } = app.models;
  const tags = [
    { name: "Internet" },
    { name: "Social Media" },
    { name: "HIV" },
    { name: "Ebola" },
    { name: "Children" }
  ];
  for (const tag of tags) {
    // eslint-disable-next-line
    await Tag.findOrCreate({ name: tag.name }, tag);
  }
}

async function seedRoles(app) {
  const { UserRole } = app.models;
  const roles = [{ name: "admin" }, { name: "member" }];
  for (const role of roles) {
    // eslint-disable-next-line
    await UserRole.findOrCreate({ name: role.name }, role);
  }
}

async function seedAdmins(app) {
  const { UserAccount, UserRole } = app.models;
  const users = [
    {
      fullName: "admin",
      email: "admin@ahadoo.com",
      password: "admin"
    }
  ];
  const adminRole = await UserRole.findOne({
    where: { name: "admin" }
  });

  if (!adminRole) {
    throw error("Unable to find admin role");
  }
  for (const user of users) {
    user.roleId = adminRole.id;
    // eslint-disable-next-line
    await UserAccount.findOrCreate({ where: { email: user.email } }, user);
  }
}

module.exports = async function(app) {
  app.logger.info("Seeding started");
  await seedRoles(app);
  await seedAdmins(app);
  await seedCategories(app);
  await seedTags(app);
  app.logger.info("Seeding complete");
};
