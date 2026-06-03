import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import type { TweetResult } from './types.js';
export interface TweetOptions {
    /** Quote-tweet target: a tweet URL appended as attachment_url so X renders an embedded quote card. */
    attachmentUrl?: string;
}
export interface TwitterClientPostingMethods {
    tweet(text: string, mediaIds?: string[], options?: TweetOptions): Promise<TweetResult>;
    reply(text: string, replyToTweetId: string, mediaIds?: string[]): Promise<TweetResult>;
    noteTweet(text: string, mediaIds?: string[]): Promise<TweetResult>;
}
export declare function withPosting<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientPostingMethods>;
//# sourceMappingURL=posting.d.ts.map