import { type TwitterClientArticleMethods } from './articles.js';
import type { AbstractConstructor } from './base.js';
import { TwitterClientBase } from './base.js';
import { type TwitterClientBookmarkMethods } from './bookmarks.js';
import { type TwitterClientEngagementMethods } from './engagement.js';
import { type TwitterClientFollowMethods } from './follow.js';
import { type TwitterClientHomeMethods } from './home.js';
import { type TwitterClientListMethods } from './lists.js';
import { type TwitterClientMediaMethods } from './media.js';
import { type TwitterClientNewsMethods } from './news.js';
import { type TwitterClientPostingMethods } from './posting.js';
import { type TwitterClientSearchMethods } from './search.js';
import { type TwitterClientTimelineMethods } from './timelines.js';
import { type TwitterClientTweetDetailMethods } from './tweet-detail.js';
import { type TwitterClientUserLookupMethods } from './user-lookup.js';
import { type TwitterClientUserTweetsMethods } from './user-tweets.js';
import { type TwitterClientUserMethods } from './users.js';
type TwitterClientInstance = TwitterClientBase & TwitterClientArticleMethods & TwitterClientBookmarkMethods & TwitterClientEngagementMethods & TwitterClientFollowMethods & TwitterClientHomeMethods & TwitterClientListMethods & TwitterClientMediaMethods & TwitterClientNewsMethods & TwitterClientPostingMethods & TwitterClientSearchMethods & TwitterClientTimelineMethods & TwitterClientTweetDetailMethods & TwitterClientUserMethods & TwitterClientUserLookupMethods & TwitterClientUserTweetsMethods;
declare const MixedTwitterClient: AbstractConstructor<TwitterClientInstance>;
export declare class TwitterClient extends MixedTwitterClient {
}
export type { ExploreTab, NewsFetchOptions, NewsItem, NewsResult } from './news.js';
export type { BookmarkMutationResult, CurrentUserResult, FollowingResult, FollowMutationResult, GetTweetResult, ListsResult, SearchResult, TweetData, TweetResult, TwitterClientOptions, TwitterList, TwitterUser, UploadMediaResult, } from './types.js';
//# sourceMappingURL=client.d.ts.map