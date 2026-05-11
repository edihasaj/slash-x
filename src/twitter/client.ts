import { type TwitterClientArticleMethods, withArticles } from './articles.js';
import type { AbstractConstructor } from './base.js';
import { TwitterClientBase } from './base.js';
import { type TwitterClientBookmarkMethods, withBookmarks } from './bookmarks.js';
import { type TwitterClientEngagementMethods, withEngagement } from './engagement.js';
import { type TwitterClientFollowMethods, withFollow } from './follow.js';
import { type TwitterClientHomeMethods, withHome } from './home.js';
import { type TwitterClientListMethods, withLists } from './lists.js';
import { type TwitterClientMediaMethods, withMedia } from './media.js';
import { type TwitterClientNewsMethods, withNews } from './news.js';
import { type TwitterClientPostingMethods, withPosting } from './posting.js';
import { type TwitterClientSearchMethods, withSearch } from './search.js';
import { type TwitterClientTimelineMethods, withTimelines } from './timelines.js';
import { type TwitterClientTweetDetailMethods, withTweetDetails } from './tweet-detail.js';
import { type TwitterClientUserLookupMethods, withUserLookup } from './user-lookup.js';
import { type TwitterClientUserTweetsMethods, withUserTweets } from './user-tweets.js';
import { type TwitterClientUserMethods, withUsers } from './users.js';
type TwitterClientInstance = TwitterClientBase & TwitterClientArticleMethods & TwitterClientBookmarkMethods & TwitterClientEngagementMethods & TwitterClientFollowMethods & TwitterClientHomeMethods & TwitterClientListMethods & TwitterClientMediaMethods & TwitterClientNewsMethods & TwitterClientPostingMethods & TwitterClientSearchMethods & TwitterClientTimelineMethods & TwitterClientTweetDetailMethods & TwitterClientUserMethods & TwitterClientUserLookupMethods & TwitterClientUserTweetsMethods;
// News mixin wraps search because it depends on the search() method
// Engagement mixin adds like/unlike/retweet/unretweet/bookmark methods
const MixedTwitterClient = withArticles(withNews(withUserTweets(withUserLookup(withUsers(withLists(withHome(withTimelines(withSearch(withTweetDetails(withPosting(withEngagement(withFollow(withBookmarks(withMedia(TwitterClientBase))))))))))))))) as unknown as AbstractConstructor<TwitterClientInstance>;
export class TwitterClient extends MixedTwitterClient {
}
export type { ExploreTab, NewsFetchOptions, NewsItem, NewsResult } from './news.js';
export type { BookmarkMutationResult, CurrentUserResult, FollowingResult, FollowMutationResult, GetTweetResult, ListsResult, SearchResult, TweetData, TweetResult, TwitterClientOptions, TwitterList, TwitterUser, UploadMediaResult, } from './types.js';
