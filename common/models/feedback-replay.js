module.exports = function(FeedbackReplay) {
  FeedbackReplay.validatesPresenceOf("createdById", {
    message: "createdById is required"
  });
  FeedbackReplay.validatesPresenceOf("postId", {
    message: "postId is required"
  });
  FeedbackReplay.validatesPresenceOf("feedbackId", {
    message: "feedbackId is required"
  });
};
