import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import type { TweetResult } from './types.js';
export interface TwitterClientPostingMethods {
    tweet(text: string, mediaIds?: string[]): Promise<TweetResult>;
    reply(text: string, replyToTweetId: string, mediaIds?: string[]): Promise<TweetResult>;
    noteTweet(text: string, mediaIds?: string[]): Promise<TweetResult>;
}
export declare function withPosting<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientPostingMethods>;
//# sourceMappingURL=posting.d.ts.map