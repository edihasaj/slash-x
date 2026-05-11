import { withArticles } from './articles.js';
import { TwitterClientBase } from './base.js';
import { withBookmarks } from './bookmarks.js';
import { withEngagement } from './engagement.js';
import { withFollow } from './follow.js';
import { withHome } from './home.js';
import { withLists } from './lists.js';
import { withMedia } from './media.js';
import { withNews } from './news.js';
import { withPosting } from './posting.js';
import { withSearch } from './search.js';
import { withTimelines } from './timelines.js';
import { withTweetDetails } from './tweet-detail.js';
import { withUserLookup } from './user-lookup.js';
import { withUserTweets } from './user-tweets.js';
import { withUsers } from './users.js';
// News mixin wraps search because it depends on the search() method
// Engagement mixin adds like/unlike/retweet/unretweet/bookmark methods
const MixedTwitterClient = withArticles(withNews(withUserTweets(withUserLookup(withUsers(withLists(withHome(withTimelines(withSearch(withTweetDetails(withPosting(withEngagement(withFollow(withBookmarks(withMedia(TwitterClientBase)))))))))))))));
export class TwitterClient extends MixedTwitterClient {
}
//# sourceMappingURL=client.js.map