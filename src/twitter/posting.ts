import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import { TWITTER_API_BASE, TWITTER_GRAPHQL_POST_URL } from './constants.js';
import { buildTweetCreateFeatures } from './features.js';
import type { CreateTweetResponse, TweetResult } from './types.js';
export interface TwitterClientPostingMethods {
    tweet(text: string, mediaIds?: string[]): Promise<TweetResult>;
    reply(text: string, replyToTweetId: string, mediaIds?: string[]): Promise<TweetResult>;
}
export function withPosting<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientPostingMethods> {
    abstract class TwitterClientPosting extends Base {
        // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor requirement.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
            super(...args);
        }
        async tweet(text: string, mediaIds?: string[]): Promise<TweetResult> {
            const variables = {
                tweet_text: text,
                dark_request: false,
                media: {
                    media_entities: (mediaIds ?? []).map((id) => ({ media_id: id, tagged_users: [] })),
                    possibly_sensitive: false,
                },
                semantic_annotation_ids: [],
            };
            const features = buildTweetCreateFeatures();
            return this.createTweet(variables, features);
        }
        async reply(text: string, replyToTweetId: string, mediaIds?: string[]): Promise<TweetResult> {
            const variables = {
                tweet_text: text,
                reply: {
                    in_reply_to_tweet_id: replyToTweetId,
                    exclude_reply_user_ids: [],
                },
                dark_request: false,
                media: {
                    media_entities: (mediaIds ?? []).map((id) => ({ media_id: id, tagged_users: [] })),
                    possibly_sensitive: false,
                },
                semantic_annotation_ids: [],
            };
            const features = buildTweetCreateFeatures();
            return this.createTweet(variables, features);
        }
        async createTweet(variables: Record<string, unknown>, features: Record<string, boolean>): Promise<TweetResult> {
            await this.ensureClientUserId();
            let queryId = await this.getQueryId('CreateTweet');
            let urlWithOperation = `${TWITTER_API_BASE}/${queryId}/CreateTweet`;
            const buildBody = (): string => JSON.stringify({ variables, features, queryId });
            let body = buildBody();
            const buildHeaders = async (url: string): Promise<Record<string, string>> => this.withTransactionId({ ...this.getHeaders(), referer: 'https://x.com/compose/post' }, 'POST', url);
            try {
                let response = await this.fetchWithTimeout(urlWithOperation, {
                    method: 'POST',
                    headers: await buildHeaders(urlWithOperation),
                    body,
                });
                if (response.status === 404) {
                    await this.refreshQueryIds();
                    queryId = await this.getQueryId('CreateTweet');
                    urlWithOperation = `${TWITTER_API_BASE}/${queryId}/CreateTweet`;
                    body = buildBody();
                    response = await this.fetchWithTimeout(urlWithOperation, {
                        method: 'POST',
                        headers: await buildHeaders(urlWithOperation),
                        body,
                    });
                    if (response.status === 404) {
                        const retry = await this.fetchWithTimeout(TWITTER_GRAPHQL_POST_URL, {
                            method: 'POST',
                            headers: await buildHeaders(TWITTER_GRAPHQL_POST_URL),
                            body,
                        });
                        if (!retry.ok) {
                            const text = await retry.text();
                            return { success: false, error: `HTTP ${retry.status}: ${text.slice(0, 200)}` };
                        }
                        const data = (await retry.json()) as CreateTweetResponse;
                        if (data.errors && data.errors.length > 0) {
                            return { success: false, error: this.formatErrors(data.errors) };
                        }
                        const tweetId = data.data?.create_tweet?.tweet_results?.result?.rest_id;
                        if (tweetId) {
                            return { success: true, tweetId };
                        }
                        return { success: false, error: 'Tweet created but no ID returned' };
                    }
                }
                if (!response.ok) {
                    const text = await response.text();
                    return {
                        success: false,
                        error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
                    };
                }
                const data = (await response.json()) as CreateTweetResponse;
                if (data.errors && data.errors.length > 0) {
                    return {
                        success: false,
                        error: this.formatErrors(data.errors),
                    };
                }
                const tweetId = data.data?.create_tweet?.tweet_results?.result?.rest_id;
                if (tweetId) {
                    return {
                        success: true,
                        tweetId,
                    };
                }
                return {
                    success: false,
                    error: 'Tweet created but no ID returned',
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        }
        formatErrors(errors: Array<{ message: string; code?: number }>): string {
            return errors
                .map((error) => (typeof error.code === 'number' ? `${error.message} (${error.code})` : error.message))
                .join(', ');
        }
    }
    return TwitterClientPosting as unknown as Mixin<TBase, TwitterClientPostingMethods>;
}
