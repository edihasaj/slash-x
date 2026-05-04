import { paginateCursor } from '../lib/paginate-cursor.js';
import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import { TWITTER_API_BASE } from './constants.js';
import { buildArticleFeatures, buildArticleFieldToggles, buildTweetDetailFeatures } from './features.js';
import type { GetTweetResult, SearchResult } from './types.js';
import { extractArticleText, extractCursorFromInstructions, findTweetInInstructions, firstText, mapTweetResult, parseTweetsFromInstructions, } from './utils.js';
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
export function withTweetDetails<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientTweetDetailMethods> {
    abstract class TwitterClientTweetDetails extends Base {
        // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor requirement.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
            super(...args);
        }
        async fetchUserArticlePlainText(userId: string, tweetId: string): Promise<{ title?: string; plainText?: string }> {
            const variables = {
                userId,
                count: 20,
                includePromotedContent: true,
                withVoice: true,
                withQuickPromoteEligibilityTweetFields: true,
                withBirdwatchNotes: true,
                withCommunity: true,
                withSafetyModeUserFields: true,
                withSuperFollowsUserFields: true,
                withDownvotePerspective: false,
                withReactionsMetadata: false,
                withReactionsPerspective: false,
                withSuperFollowsTweetFields: true,
                withSuperFollowsReplyCount: false,
                withClientEventToken: false,
            };
            const params = new URLSearchParams({
                variables: JSON.stringify(variables),
                features: JSON.stringify(buildArticleFeatures()),
                fieldToggles: JSON.stringify(buildArticleFieldToggles()),
            });
            const queryId = await this.getQueryId('UserArticlesTweets');
            const url = `${TWITTER_API_BASE}/${queryId}/UserArticlesTweets?${params.toString()}`;
            try {
                const response = await this.fetchWithTimeout(url, { method: 'GET', headers: this.getHeaders() });
                if (!response.ok) {
                    return {};
                }
                // biome-ignore lint/suspicious/noExplicitAny: API response
                const data = (await response.json()) as any;
                const instructions = data.data?.user?.result?.timeline?.timeline?.instructions ?? [];
                for (const instruction of instructions) {
                    for (const entry of instruction.entries ?? []) {
                        const result = entry.content?.itemContent?.tweet_results?.result;
                        if (result?.rest_id !== tweetId) {
                            continue;
                        }
                        const articleResult = result.article?.article_results?.result;
                        const title = firstText(articleResult?.title, result.article?.title);
                        const plainText = firstText(articleResult?.plain_text, result.article?.plain_text);
                        return { title, plainText };
                    }
                }
            }
            catch {
                return {};
            }
            return {};
        }
        // biome-ignore lint/suspicious/noExplicitAny: response shape
        async fetchTweetDetail(tweetId: string, cursor?: string): Promise<{ success: true; data: any } | { success: false; error: string }> {
            const variables: Record<string, unknown> = {
                focalTweetId: tweetId,
                with_rux_injections: false,
                rankingMode: 'Relevance',
                includePromotedContent: true,
                withCommunity: true,
                withQuickPromoteEligibilityTweetFields: true,
                withBirdwatchNotes: true,
                withVoice: true,
                ...(cursor ? { cursor } : {}),
            };
            const features = {
                ...buildTweetDetailFeatures(),
                articles_preview_enabled: true,
                articles_rest_api_enabled: true,
                responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                creator_subscriptions_tweet_preview_api_enabled: true,
                graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
                view_counts_everywhere_api_enabled: true,
                longform_notetweets_consumption_enabled: true,
                responsive_web_twitter_article_tweet_consumption_enabled: true,
                freedom_of_speech_not_reach_fetch_enabled: true,
                standardized_nudges_misinfo: true,
                tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
                rweb_video_timestamps_enabled: true,
            };
            const fieldToggles = {
                ...buildArticleFieldToggles(),
                withArticleRichContentState: true,
            };
            const params = new URLSearchParams({
                variables: JSON.stringify(variables),
                features: JSON.stringify(features),
                fieldToggles: JSON.stringify(fieldToggles),
            });
            try {
                // biome-ignore lint/suspicious/noExplicitAny: response shape
                const parseResponse = async (response: Response): Promise<{ success: true; data: any } | { success: false; error: string }> => {
                    if (!response.ok) {
                        const text = await response.text();
                        return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
                    }
                    // biome-ignore lint/suspicious/noExplicitAny: API response
                    const data = (await response.json()) as any;
                    if (data.errors && data.errors.length > 0) {
                        const hasUsableData = Boolean(data.data?.tweetResult?.result ||
                            data.data?.threaded_conversation_with_injections_v2?.instructions?.length);
                        if (!hasUsableData) {
                            // biome-ignore lint/suspicious/noExplicitAny: error shape
                            return { success: false, error: data.errors.map((e: any) => e.message).join(', ') };
                        }
                    }
                    return { success: true, data: data.data ?? {} };
                };
                let lastError: string | undefined;
                let had404 = false;
                // biome-ignore lint/suspicious/noExplicitAny: response shape
                const tryOnce = async (): Promise<{ success: true; data: any } | { success: false; error: string }> => {
                    const queryIds = await this.getTweetDetailQueryIds();
                    for (const queryId of queryIds) {
                        const url = `${TWITTER_API_BASE}/${queryId}/TweetDetail?${params.toString()}`;
                        const response = await this.fetchWithTimeout(url, {
                            method: 'GET',
                            headers: this.getHeaders(),
                        });
                        if (response.status !== 404) {
                            return await parseResponse(response);
                        }
                        had404 = true;
                        const postResponse = await this.fetchWithTimeout(`${TWITTER_API_BASE}/${queryId}/TweetDetail`, {
                            method: 'POST',
                            headers: this.getHeaders(),
                            body: JSON.stringify({ variables, features, queryId }),
                        });
                        if (postResponse.status !== 404) {
                            return await parseResponse(postResponse);
                        }
                        lastError = 'HTTP 404';
                    }
                    return { success: false, error: lastError ?? 'Unknown error fetching tweet detail' };
                };
                const firstAttempt = await tryOnce();
                if (firstAttempt.success) {
                    return firstAttempt;
                }
                if (had404) {
                    await this.refreshQueryIds();
                    return await tryOnce();
                }
                return firstAttempt;
            }
            catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
        async getTweet(tweetId: string, options: TweetFetchOptions = {}): Promise<GetTweetResult> {
            const { includeRaw = false } = options;
            const response = await this.fetchTweetDetail(tweetId);
            if (!response.success) {
                return response;
            }
            const tweetResult = response.data.tweetResult?.result ??
                findTweetInInstructions(response.data.threaded_conversation_with_injections_v2?.instructions, tweetId);
            const mapped = mapTweetResult(tweetResult, { quoteDepth: this.quoteDepth, includeRaw });
            if (mapped) {
                if (tweetResult?.article) {
                    const title = firstText(tweetResult.article.article_results?.result?.title, tweetResult.article.title);
                    const articleText = extractArticleText(tweetResult);
                    if (title && (!articleText || articleText.trim() === title.trim())) {
                        const userId = tweetResult.core?.user_results?.result?.rest_id;
                        if (userId) {
                            const fallback = await this.fetchUserArticlePlainText(userId, tweetId);
                            if (fallback.plainText) {
                                mapped.text = fallback.title ? `${fallback.title}\n\n${fallback.plainText}` : fallback.plainText;
                            }
                        }
                    }
                }
                return { success: true, tweet: mapped };
            }
            return { success: false, error: 'Tweet not found in response' };
        }
        async getReplies(tweetId: string, options: TweetFetchOptions = {}): Promise<SearchResult> {
            const { includeRaw = false } = options;
            const response = await this.fetchTweetDetail(tweetId);
            if (!response.success) {
                return response;
            }
            const instructions = response.data.threaded_conversation_with_injections_v2?.instructions;
            const tweets = parseTweetsFromInstructions(instructions, { quoteDepth: this.quoteDepth, includeRaw });
            const replies = tweets.filter((tweet) => tweet.inReplyToStatusId === tweetId);
            return { success: true, tweets: replies };
        }
        async getThread(tweetId: string, options: TweetFetchOptions = {}): Promise<SearchResult> {
            const { includeRaw = false } = options;
            const response = await this.fetchTweetDetail(tweetId);
            if (!response.success) {
                return response;
            }
            const instructions = response.data.threaded_conversation_with_injections_v2?.instructions;
            const tweets = parseTweetsFromInstructions(instructions, { quoteDepth: this.quoteDepth, includeRaw });
            const target = tweets.find((t) => t.id === tweetId);
            const rootId = target?.conversationId || tweetId;
            const thread = tweets.filter((tweet) => tweet.conversationId === rootId);
            thread.sort((a, b) => {
                const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
                const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
                return aTime - bTime;
            });
            return { success: true, tweets: thread };
        }
        async getRepliesPaged(tweetId: string, options: TweetDetailPaginationOptions = {}): Promise<SearchResult> {
            const { includeRaw = false, maxPages, pageDelayMs = 1000 } = options;
            const result = await paginateCursor({
                cursor: options.cursor,
                maxPages,
                pageDelayMs,
                sleep: async (ms: number) => this.sleep(ms),
                // biome-ignore lint/suspicious/noExplicitAny: tweet shape
                getKey: (tweet: any) => tweet.id,
                fetchPage: async (cursor) => {
                    const response = await this.fetchTweetDetail(tweetId, cursor);
                    if (!response.success) {
                        return response;
                    }
                    const instructions = response.data.threaded_conversation_with_injections_v2?.instructions;
                    const tweets = parseTweetsFromInstructions(instructions, { quoteDepth: this.quoteDepth, includeRaw });
                    const replies = tweets.filter((tweet) => tweet.inReplyToStatusId === tweetId);
                    const pageCursor = extractCursorFromInstructions(instructions);
                    return { success: true, items: replies, cursor: pageCursor };
                },
            });
            if (result.success) {
                return { success: true, tweets: result.items, nextCursor: result.nextCursor };
            }
            if (result.items) {
                return { success: false, tweets: result.items, nextCursor: result.nextCursor, error: result.error };
            }
            return { success: false, error: result.error };
        }
        async getThreadPaged(tweetId: string, options: TweetDetailPaginationOptions = {}): Promise<SearchResult> {
            const { includeRaw = false, maxPages, pageDelayMs = 1000 } = options;
            let rootId: string | undefined;
            const result = await paginateCursor({
                cursor: options.cursor,
                maxPages,
                pageDelayMs,
                sleep: async (ms: number) => this.sleep(ms),
                // biome-ignore lint/suspicious/noExplicitAny: tweet shape
                getKey: (tweet: any) => tweet.id,
                fetchPage: async (cursor) => {
                    const response = await this.fetchTweetDetail(tweetId, cursor);
                    if (!response.success) {
                        return response;
                    }
                    const instructions = response.data.threaded_conversation_with_injections_v2?.instructions;
                    const tweets = parseTweetsFromInstructions(instructions, { quoteDepth: this.quoteDepth, includeRaw });
                    if (!rootId) {
                        const target = tweets.find((t) => t.id === tweetId);
                        rootId = target?.conversationId || tweetId;
                    }
                    const threadTweets = tweets.filter((tweet) => tweet.conversationId === rootId);
                    const pageCursor = extractCursorFromInstructions(instructions);
                    return { success: true, items: threadTweets, cursor: pageCursor };
                },
            });
            const sortedTweets = (result.items ?? []).slice().sort((a, b) => {
                const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
                const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
                return aTime - bTime;
            });
            if (result.success) {
                return { success: true, tweets: sortedTweets, nextCursor: result.nextCursor };
            }
            if (result.items) {
                return { success: false, tweets: sortedTweets, nextCursor: result.nextCursor, error: result.error };
            }
            return { success: false, error: result.error };
        }
    }
    return TwitterClientTweetDetails as unknown as Mixin<TBase, TwitterClientTweetDetailMethods>;
}
