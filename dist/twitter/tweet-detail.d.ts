import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import type { GetTweetResult, SearchResult } from './types.js';
/** Options for tweet fetching methods */
export interface TweetFetchOptions {
    /** Include raw GraphQL response in `_raw` field */
    includeRaw?: boolean;
}
/** Options for paginated tweet detail fetch */
export interface TweetDetailPaginationOptions extends TweetFetchOptions {
    maxPages?: number;
    cursor?: string;
    pageDelayMs?: number;
}
export interface TwitterClientTweetDetailMethods {
    getTweet(tweetId: string, options?: TweetFetchOptions): Promise<GetTweetResult>;
    getReplies(tweetId: string, options?: TweetFetchOptions): Promise<SearchResult>;
    getThread(tweetId: string, options?: TweetFetchOptions): Promise<SearchResult>;
    getRepliesPaged(tweetId: string, options?: TweetDetailPaginationOptions): Promise<SearchResult>;
    getThreadPaged(tweetId: string, options?: TweetDetailPaginationOptions): Promise<SearchResult>;
}
export declare function withTweetDetails<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientTweetDetailMethods>;
//# sourceMappingURL=tweet-detail.d.ts.map