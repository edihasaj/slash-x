import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import { TWITTER_API_BASE } from './constants.js';
import { buildSearchFeatures } from './features.js';
import type { SearchResult } from './types.js';
import { extractCursorFromInstructions, parseTweetsFromInstructions } from './utils.js';
/** Options for search methods */
export interface SearchFetchOptions {
    /** Include raw GraphQL response in `_raw` field */
    includeRaw?: boolean;
}
/** Options for paged search methods */
export interface SearchPaginationOptions extends SearchFetchOptions {
    maxPages?: number;
    /** Starting cursor for pagination (resume from previous fetch) */
    cursor?: string;
}
export interface TwitterClientSearchMethods {
    search(query: string, count?: number, options?: SearchFetchOptions): Promise<SearchResult>;
    getAllSearchResults(query: string, options?: SearchPaginationOptions): Promise<SearchResult>;
}
const RAW_QUERY_MISSING_REGEX = /must be defined/i;
function isQueryIdMismatch(payload: string): boolean {
    try {
        // biome-ignore lint/suspicious/noExplicitAny: parsed payload shape
        const parsed = JSON.parse(payload) as any;
        return (parsed.errors?.some((error: { extensions?: { code?: string }; path?: string[]; message?: string }) => {
            if (error?.extensions?.code === 'GRAPHQL_VALIDATION_FAILED') {
                return true;
            }
            if (error?.path?.includes('rawQuery') && RAW_QUERY_MISSING_REGEX.test(error.message ?? '')) {
                return true;
            }
            return false;
        }) ?? false);
    }
    catch {
        return false;
    }
}
export function withSearch<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientSearchMethods> {
    abstract class TwitterClientSearch extends Base {
        // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor requirement.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
            super(...args);
        }
        async search(query: string, count = 20, options: SearchFetchOptions = {}): Promise<SearchResult> {
            return this.searchPaged(query, count, options);
        }
        async getAllSearchResults(query: string, options?: SearchPaginationOptions): Promise<SearchResult> {
            return this.searchPaged(query, Number.POSITIVE_INFINITY, options);
        }
        async searchPaged(query: string, limit: number, options: SearchPaginationOptions = {}): Promise<SearchResult> {
            const features = buildSearchFeatures();
            const pageSize = 20;
            const seen = new Set<string>();
            // biome-ignore lint/suspicious/noExplicitAny: tweet shape
            const tweets: any[] = [];
            let cursor = options.cursor;
            let nextCursor: string | undefined;
            let pagesFetched = 0;
            const { includeRaw = false, maxPages } = options;
            // biome-ignore lint/suspicious/noExplicitAny: page shape
            const fetchPage = async (pageCount: number, pageCursor?: string): Promise<any> => {
                let lastError: string | undefined;
                let had404 = false;
                const queryIds = await this.getSearchTimelineQueryIds();
                for (const queryId of queryIds) {
                    const variables: Record<string, unknown> = {
                        rawQuery: query,
                        count: pageCount,
                        querySource: 'typed_query',
                        product: 'Latest',
                        ...(pageCursor ? { cursor: pageCursor } : {}),
                    };
                    const params = new URLSearchParams({
                        variables: JSON.stringify(variables),
                    });
                    const url = `${TWITTER_API_BASE}/${queryId}/SearchTimeline?${params.toString()}`;
                    try {
                        const response = await this.fetchWithTimeout(url, {
                            method: 'POST',
                            headers: this.getHeaders(),
                            body: JSON.stringify({ features, queryId }),
                        });
                        if (response.status === 404) {
                            had404 = true;
                            lastError = `HTTP ${response.status}`;
                            continue;
                        }
                        if (!response.ok) {
                            const text = await response.text();
                            const shouldRefreshQueryIds = (response.status === 400 || response.status === 422) && isQueryIdMismatch(text);
                            return {
                                success: false,
                                error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
                                had404: had404 || shouldRefreshQueryIds,
                            };
                        }
                        // biome-ignore lint/suspicious/noExplicitAny: API response
                        const data = (await response.json()) as any;
                        if (data.errors && data.errors.length > 0) {
                            // biome-ignore lint/suspicious/noExplicitAny: error shape
                            const shouldRefreshQueryIds = data.errors.some((error: any) => error?.extensions?.code === 'GRAPHQL_VALIDATION_FAILED');
                            return {
                                success: false,
                                // biome-ignore lint/suspicious/noExplicitAny: error shape
                                error: data.errors.map((e: any) => e.message).join(', '),
                                had404: had404 || shouldRefreshQueryIds,
                            };
                        }
                        const instructions = data.data?.search_by_raw_query?.search_timeline?.timeline?.instructions;
                        const pageTweets = parseTweetsFromInstructions(instructions, { quoteDepth: this.quoteDepth, includeRaw });
                        const nextCursorVal = extractCursorFromInstructions(instructions);
                        return { success: true, tweets: pageTweets, cursor: nextCursorVal, had404 };
                    }
                    catch (error) {
                        lastError = error instanceof Error ? error.message : String(error);
                    }
                }
                return { success: false, error: lastError ?? 'Unknown error fetching search results', had404 };
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
            const unlimited = limit === Number.POSITIVE_INFINITY;
            while (unlimited || tweets.length < limit) {
                const pageCount = unlimited ? pageSize : Math.min(pageSize, limit - tweets.length);
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
                    if (!unlimited && tweets.length >= limit) {
                        break;
                    }
                }
                const pageCursor = page.cursor;
                if (!pageCursor || pageCursor === cursor || page.tweets.length === 0 || added === 0) {
                    nextCursor = undefined;
                    break;
                }
                if (maxPages && pagesFetched >= maxPages) {
                    nextCursor = pageCursor;
                    break;
                }
                cursor = pageCursor;
                nextCursor = pageCursor;
            }
            return { success: true, tweets, nextCursor };
        }
    }
    return TwitterClientSearch as unknown as Mixin<TBase, TwitterClientSearchMethods>;
}
