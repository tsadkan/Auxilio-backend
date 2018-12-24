/* eslint no-underscore-dangle:0 */
const { error } = require("../util");

const { ES_INDEX } = process.env;
const SEARCH_RESULTS_SIZE = 20;

module.exports = function(Search) {
  /**
   * converts es index name to frontend friendly name
   * e.g auxilio.post => POST
   * @param {String} indexName
   */
  const indexToType = indexName => {
    const prefixLen = ES_INDEX.length - 1;
    return indexName.substring(prefixLen).toUpperCase();
  };

  /**
   * A proxy to Elasticsearch search API
   * Search from everything
   *    Post [title,description,createdBy[fullName & email,phoneNumber]]
   *    Feedback [body,createdBy[fullName & email,phoneNumber]]
   *    FeedbackReplay [body,createdBy[fullName & email,phoneNumber]]
   *
   * @param {String} q search query term
   */
  Search.search = async q => {
    if (!q) return [];
    const { es } = Search.app;
    const body = {
      query: {
        multi_match: {
          query: q,
          type: "best_fields",
          fuzziness: 2,
          fields: [
            "title",
            "description",
            "body",
            "createdBy.phoneNumber",
            "createdBy.fullName",
            "createdBy.email"
          ]
        }
      }
    };
    let searchResult;
    try {
      const result = await es.search({
        body,
        size: SEARCH_RESULTS_SIZE,
        index: ES_INDEX
      });
      if (!result || !result.hits || !result.hits.hits) {
        Search.app.logger.error(result);
        throw error();
      }
      searchResult = result.hits.hits;
    } catch (err) {
      Search.app.logger.error(err);
      throw error();
    }

    const response = searchResult.map(searchHit => ({
      type: indexToType(searchHit._index),
      ...searchHit._source
    }));

    return response;
  };

  Search.remoteMethod("search", {
    description: "Search everything",
    accepts: [{ arg: "q", type: "string" }],
    returns: {
      type: "object",
      root: true
    },
    http: { verb: "get", path: "/" }
  });
};
