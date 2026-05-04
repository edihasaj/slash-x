import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import type { SearchResult } from './types.js';
/** Options for user tweets fetch methods */
export interface UserTweetsFetchOptions {
    /** Include raw GraphQL response in `_raw` field */
    includeRaw?: boolean;
}
/** Options for paginated user tweets fetch */
export interface UserTweetsPaginationOptions extends UserTweetsFetchOptions {
    maxPages?: number;
    cursor?: string;
    pageDelayMs?: number;
}
export interface TwitterClientUserTweetsMethods {
    getUserTweets(userId: string, count?: number, options?: UserTweetsFetchOptions): Promise<SearchResult>;
    getUserTweetsPaged(userId: string, limit: number, options?: UserTweetsPaginationOptions): Promise<SearchResult>;
}
export declare function withUserTweets<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientUserTweetsMethods>;
//# sourceMappingURL=user-tweets.d.ts.map