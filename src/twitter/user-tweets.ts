import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import { TWITTER_API_BASE } from './constants.js';
import { buildUserTweetsFeatures } from './features.js';
import type { SearchResult } from './types.js';
import { extractCursorFromInstructions, parseTweetsFromInstructions } from './utils.js';
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
export function withUserTweets<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientUserTweetsMethods> {
    abstract class TwitterClientUserTweets extends Base {
        // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor requirement.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
            super(...args);
        }
        async getUserTweetsQueryIds(): Promise<string[]> {
            const primary = await this.getQueryId('UserTweets');
            return Array.from(new Set([primary, 'Wms1GvIiHXAPBaCr9KblaA']));
        }
        async getUserTweets(userId: string, count = 20, options: UserTweetsFetchOptions = {}): Promise<SearchResult> {
            return this.getUserTweetsPaged(userId, count, options);
        }
        async getUserTweetsPaged(userId: string, limit: number, options: UserTweetsPaginationOptions = {}): Promise<SearchResult> {
            if (!Number.isFinite(limit) || limit <= 0) {
                return { success: false, error: `Invalid limit: ${limit}` };
            }
            const { includeRaw = false, maxPages, pageDelayMs = 1000 } = options;
            const features = buildUserTweetsFeatures();
            const pageSize = 20;
            const seen = new Set<string>();
            // biome-ignore lint/suspicious/noExplicitAny: tweet shape
            const tweets: any[] = [];
            let cursor = options.cursor;
            let nextCursor: string | undefined;
            let pagesFetched = 0;
            const hardMaxPages = 10;
            const computedMaxPages = Math.max(1, Math.ceil(limit / pageSize));
            const effectiveMaxPages = Math.min(hardMaxPages, maxPages ?? computedMaxPages);
            // biome-ignore lint/suspicious/noExplicitAny: page shape
            const fetchPage = async (pageCount: number, pageCursor?: string): Promise<any> => {
                let lastError: string | undefined;
                let had404 = false;
                const queryIds = await this.getUserTweetsQueryIds();
                const variables: Record<string, unknown> = {
                    userId,
                    count: pageCount,
                    includePromotedContent: false,
                    withQuickPromoteEligibilityTweetFields: true,
                    withVoice: true,
                    ...(pageCursor ? { cursor: pageCursor } : {}),
                };
                const fieldToggles = {
                    withArticlePlainText: true,
                    withArticleRichContentState: true,
                };
                const params = new URLSearchParams({
                    variables: JSON.stringify(variables),
                    features: JSON.stringify(features),
                    fieldToggles: JSON.stringify(fieldToggles),
                });
                for (const queryId of queryIds) {
                    const url = `${TWITTER_API_BASE}/${queryId}/UserTweets?${params.toString()}`;
                    try {
                        const response = await this.fetchWithTimeout(url, {
                            method: 'GET',
                            headers: this.getHeaders(),
                        });
                        if (response.status === 404) {
                            had404 = true;
                            lastError = `HTTP ${response.status}`;
                            continue;
                        }
                        if (!response.ok) {
                            const text = await response.text();
                            return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}`, had404 };
                        }
                        // biome-ignore lint/suspicious/noExplicitAny: API response
                        const data = (await response.json()) as any;
                        if (data.errors && data.errors.length > 0) {
                            // biome-ignore lint/suspicious/noExplicitAny: error shape
                            const errorMsg = data.errors.map((e: any) => e.message).join(', ');
                            if (errorMsg.includes('User has been suspended') || errorMsg.includes('User not found')) {
                                return { success: false, error: errorMsg, had404 };
                            }
                            if (!data.data?.user?.result?.timeline?.timeline?.instructions) {
                                return { success: false, error: errorMsg, had404 };
                            }
                        }
                        const instructions = data.data?.user?.result?.timeline?.timeline?.instructions;
                        const pageTweets = parseTweetsFromInstructions(instructions, { quoteDepth: this.quoteDepth, includeRaw });
                        const pageCursorValue = extractCursorFromInstructions(instructions);
                        return { success: true, tweets: pageTweets, cursor: pageCursorValue, had404 };
                    }
                    catch (error) {
                        lastError = error instanceof Error ? error.message : String(error);
                    }
                }
                return { success: false, error: lastError ?? 'Unknown error fetching user tweets', had404 };
            };
            // biome-ignore lint/suspicious/noExplicitAny: page shape
            const fetchWithRefresh = async (pageCount: number, pageCursor?: string): Promise<any> => {
                const firstAttempt = await fetchPage(pageCount, pageCursor);
                if (firstAttempt.success) {
                    return firstAttempt;
                }
                if (firstAttempt.had404) {
                    await this.refreshQueryIds();
                    const secondAttempt = await fetchPage(pageCount, pageCursor);
                    if (secondAttempt.success) {
                        return secondAttempt;
                    }
                    return { success: false, error: secondAttempt.error };
                }
                return { success: false, error: firstAttempt.error };
            };
            while (tweets.length < limit) {
                if (pagesFetched > 0 && pageDelayMs > 0) {
                    await this.sleep(pageDelayMs);
                }
                const remaining = limit - tweets.length;
                const pageCount = Math.min(pageSize, remaining);
                const page = await fetchWithRefresh(pageCount, cursor);
                if (!page.success) {
                    return { success: false, error: page.error };
                }
                pagesFetched += 1;
                let added = 0;
                for (const tweet of page.tweets) {
                    if (seen.has(tweet.id)) {
                        continue;
                    }
                    seen.add(tweet.id);
                    tweets.push(tweet);
                    added += 1;
                    if (tweets.length >= limit) {
                        break;
                    }
                }
                const pageCursor = page.cursor;
                if (!pageCursor || pageCursor === cursor || page.tweets.length === 0 || added === 0) {
                    nextCursor = undefined;
                    break;
                }
                if (pagesFetched >= effectiveMaxPages) {
                    nextCursor = pageCursor;
                    break;
                }
                cursor = pageCursor;
                nextCursor = pageCursor;
            }
            return { success: true, tweets, nextCursor };
        }
    }
    return TwitterClientUserTweets as unknown as Mixin<TBase, TwitterClientUserTweetsMethods>;
}
