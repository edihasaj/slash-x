import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import { TWITTER_API_BASE } from './constants.js';
import { buildBookmarksFeatures, buildLikesFeatures } from './features.js';
import type { SearchResult } from './types.js';
import { extractCursorFromInstructions, parseTweetsFromInstructions } from './utils.js';
/** Options for timeline fetch methods */
export interface TimelineFetchOptions {
    /** Include raw GraphQL response in `_raw` field */
    includeRaw?: boolean;
}
/** Options for paged timeline fetch methods */
export interface TimelinePaginationOptions extends TimelineFetchOptions {
    maxPages?: number;
    /** Starting cursor for pagination (resume from previous fetch) */
    cursor?: string;
}
export interface TwitterClientTimelineMethods {
    getBookmarks(count?: number, options?: TimelineFetchOptions): Promise<SearchResult>;
    getAllBookmarks(options?: TimelinePaginationOptions): Promise<SearchResult>;
    getLikes(count?: number, options?: TimelineFetchOptions): Promise<SearchResult>;
    getAllLikes(options?: TimelinePaginationOptions): Promise<SearchResult>;
    getBookmarkFolderTimeline(folderId: string, count?: number, options?: TimelineFetchOptions): Promise<SearchResult>;
    getAllBookmarkFolderTimeline(folderId: string, options?: TimelinePaginationOptions): Promise<SearchResult>;
}
export function withTimelines<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientTimelineMethods> {
    abstract class TwitterClientTimelines extends Base {
        // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor requirement.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
            super(...args);
        }
        // biome-ignore lint/suspicious/noExplicitAny: debug data shape
        logBookmarksDebug(message: string, data?: any): void {
            if (process.env.SLASH_DEBUG_BOOKMARKS !== '1') {
                return;
            }
            if (data) {
                console.error(`[slash][debug][bookmarks] ${message}`, JSON.stringify(data));
            }
            else {
                console.error(`[slash][debug][bookmarks] ${message}`);
            }
        }
        async getBookmarksQueryIds(): Promise<string[]> {
            const primary = await this.getQueryId('Bookmarks');
            return Array.from(new Set([primary, 'RV1g3b8n_SGOHwkqKYSCFw', 'tmd4ifV8RHltzn8ymGg1aw']));
        }
        async getBookmarkFolderQueryIds(): Promise<string[]> {
            const primary = await this.getQueryId('BookmarkFolderTimeline');
            return Array.from(new Set([primary, 'KJIQpsvxrTfRIlbaRIySHQ']));
        }
        async getLikesQueryIds(): Promise<string[]> {
            const primary = await this.getQueryId('Likes');
            return Array.from(new Set([primary, 'JR2gceKucIKcVNB_9JkhsA']));
        }
        async getBookmarks(count = 20, options: TimelineFetchOptions = {}): Promise<SearchResult> {
            return this.getBookmarksPaged(count, options);
        }
        async getAllBookmarks(options?: TimelinePaginationOptions): Promise<SearchResult> {
            return this.getBookmarksPaged(Number.POSITIVE_INFINITY, options);
        }
        async getLikes(count = 20, options: TimelineFetchOptions = {}): Promise<SearchResult> {
            return this.getLikesPaged(count, options);
        }
        async getAllLikes(options?: TimelinePaginationOptions): Promise<SearchResult> {
            return this.getLikesPaged(Number.POSITIVE_INFINITY, options);
        }
        async getLikesPaged(limit: number, options: TimelinePaginationOptions = {}): Promise<SearchResult> {
            // biome-ignore lint/suspicious/noExplicitAny: getCurrentUser provided by users mixin
            const userResult = await (this as any).getCurrentUser();
            if (!userResult.success || !userResult.user) {
                return { success: false, error: userResult.error ?? 'Could not determine current user' };
            }
            const userId = userResult.user.id;
            const features = buildLikesFeatures();
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
                const queryIds = await this.getLikesQueryIds();
                for (const queryId of queryIds) {
                    const variables: Record<string, unknown> = {
                        userId,
                        count: pageCount,
                        includePromotedContent: false,
                        withClientEventToken: false,
                        withBirdwatchNotes: false,
                        withVoice: true,
                        ...(pageCursor ? { cursor: pageCursor } : {}),
                    };
                    const params = new URLSearchParams({
                        variables: JSON.stringify(variables),
                        features: JSON.stringify(features),
                    });
                    const url = `${TWITTER_API_BASE}/${queryId}/Likes?${params.toString()}`;
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
                        const instructions = data.data?.user?.result?.timeline?.timeline?.instructions;
                        if (data.errors && data.errors.length > 0) {
                            // biome-ignore lint/suspicious/noExplicitAny: error shape
                            const message = data.errors.map((e: any) => e.message).join(', ');
                            if (!instructions) {
                                if (message.includes('Query: Unspecified')) {
                                    lastError = message;
                                    continue;
                                }
                                return { success: false, error: message, had404 };
                            }
                        }
                        const pageTweets = parseTweetsFromInstructions(instructions, { quoteDepth: this.quoteDepth, includeRaw });
                        const extractedCursor = extractCursorFromInstructions(instructions);
                        return { success: true, tweets: pageTweets, cursor: extractedCursor, had404 };
                    }
                    catch (error) {
                        lastError = error instanceof Error ? error.message : String(error);
                    }
                }
                return { success: false, error: lastError ?? 'Unknown error fetching likes', had404 };
            };
            // biome-ignore lint/suspicious/noExplicitAny: page shape
            const fetchWithRefresh = async (pageCount: number, pageCursor?: string): Promise<any> => {
                const firstAttempt = await fetchPage(pageCount, pageCursor);
                if (firstAttempt.success) {
                    return firstAttempt;
                }
                const shouldRefresh = firstAttempt.had404 ||
                    (typeof firstAttempt.error === 'string' && firstAttempt.error.includes('Query: Unspecified'));
                if (shouldRefresh) {
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
        async getBookmarkFolderTimeline(folderId: string, count = 20, options: TimelineFetchOptions = {}): Promise<SearchResult> {
            return this.getBookmarkFolderTimelinePaged(folderId, count, options);
        }
        async getAllBookmarkFolderTimeline(folderId: string, options?: TimelinePaginationOptions): Promise<SearchResult> {
            return this.getBookmarkFolderTimelinePaged(folderId, Number.POSITIVE_INFINITY, options);
        }
        async getBookmarksPaged(limit: number, options: TimelinePaginationOptions = {}): Promise<SearchResult> {
            const features = buildBookmarksFeatures();
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
                const queryIds = await this.getBookmarksQueryIds();
                const variables: Record<string, unknown> = {
                    count: pageCount,
                    includePromotedContent: false,
                    withDownvotePerspective: false,
                    withReactionsMetadata: false,
                    withReactionsPerspective: false,
                    ...(pageCursor ? { cursor: pageCursor } : {}),
                };
                const params = new URLSearchParams({
                    variables: JSON.stringify(variables),
                    features: JSON.stringify(features),
                });
                for (const queryId of queryIds) {
                    const url = `${TWITTER_API_BASE}/${queryId}/Bookmarks?${params.toString()}`;
                    try {
                        this.logBookmarksDebug('request bookmarks page', {
                            queryId,
                            pageCount,
                            hasCursor: Boolean(pageCursor),
                        });
                        const response = await this.fetchWithRetry(url, {
                            method: 'GET',
                            headers: this.getHeaders(),
                        });
                        if (response.status === 404) {
                            had404 = true;
                            lastError = `HTTP ${response.status}`;
                            this.logBookmarksDebug('bookmarks 404', { queryId });
                            continue;
                        }
                        if (!response.ok) {
                            const text = await response.text();
                            this.logBookmarksDebug('bookmarks non-200', {
                                queryId,
                                status: response.status,
                                body: text.slice(0, 200),
                            });
                            return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}`, had404 };
                        }
                        // biome-ignore lint/suspicious/noExplicitAny: API response
                        const data = (await response.json()) as any;
                        const instructions = data.data?.bookmark_timeline_v2?.timeline?.instructions;
                        const pageTweets = parseTweetsFromInstructions(instructions, { quoteDepth: this.quoteDepth, includeRaw });
                        const nextCursorVal = extractCursorFromInstructions(instructions);
                        if (data.errors && data.errors.length > 0) {
                            this.logBookmarksDebug('bookmarks graphql errors (non-fatal)', { queryId, errors: data.errors });
                            if (!instructions) {
                                // biome-ignore lint/suspicious/noExplicitAny: error shape
                                lastError = data.errors.map((e: any) => e.message).join(', ');
                                continue;
                            }
                        }
                        this.logBookmarksDebug('bookmarks page parsed', {
                            queryId,
                            tweets: pageTweets.length,
                            hasNextCursor: Boolean(nextCursorVal),
                        });
                        return { success: true, tweets: pageTweets, cursor: nextCursorVal, had404 };
                    }
                    catch (error) {
                        lastError = error instanceof Error ? error.message : String(error);
                        this.logBookmarksDebug('bookmarks request error', { queryId, error: lastError });
                    }
                }
                return { success: false, error: lastError ?? 'Unknown error fetching bookmarks', had404 };
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
        async getBookmarkFolderTimelinePaged(folderId: string, limit: number, options: TimelinePaginationOptions = {}): Promise<SearchResult> {
            const features = buildBookmarksFeatures();
            const pageSize = 20;
            const seen = new Set<string>();
            // biome-ignore lint/suspicious/noExplicitAny: tweet shape
            const tweets: any[] = [];
            let cursor = options.cursor;
            let nextCursor: string | undefined;
            let pagesFetched = 0;
            const { includeRaw = false, maxPages } = options;
            const buildVariables = (pageCount: number, pageCursor: string | undefined, includeCount: boolean): Record<string, unknown> => ({
                bookmark_collection_id: folderId,
                includePromotedContent: true,
                ...(includeCount ? { count: pageCount } : {}),
                ...(pageCursor ? { cursor: pageCursor } : {}),
            });
            // biome-ignore lint/suspicious/noExplicitAny: page shape
            const fetchPage = async (pageCount: number, pageCursor?: string): Promise<any> => {
                let lastError: string | undefined;
                let had404 = false;
                const queryIds = await this.getBookmarkFolderQueryIds();
                // biome-ignore lint/suspicious/noExplicitAny: page shape
                const tryOnce = async (variables: Record<string, unknown>): Promise<any> => {
                    const params = new URLSearchParams({
                        variables: JSON.stringify(variables),
                        features: JSON.stringify(features),
                    });
                    for (const queryId of queryIds) {
                        const url = `${TWITTER_API_BASE}/${queryId}/BookmarkFolderTimeline?${params.toString()}`;
                        try {
                            this.logBookmarksDebug('request bookmark folder page', {
                                queryId,
                                pageCount,
                                hasCursor: Boolean(pageCursor),
                                includeCount: Object.hasOwn(variables, 'count'),
                            });
                            const response = await this.fetchWithRetry(url, {
                                method: 'GET',
                                headers: this.getHeaders(),
                            });
                            if (response.status === 404) {
                                had404 = true;
                                lastError = `HTTP ${response.status}`;
                                this.logBookmarksDebug('bookmark folder 404', { queryId });
                                continue;
                            }
                            if (!response.ok) {
                                const text = await response.text();
                                this.logBookmarksDebug('bookmark folder non-200', {
                                    queryId,
                                    status: response.status,
                                    body: text.slice(0, 200),
                                });
                                return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}`, had404 };
                            }
                            // biome-ignore lint/suspicious/noExplicitAny: API response
                            const data = (await response.json()) as any;
                            const instructions = data.data?.bookmark_collection_timeline?.timeline?.instructions;
                            const pageTweets = parseTweetsFromInstructions(instructions, { quoteDepth: this.quoteDepth, includeRaw });
                            const nextCursorVal = extractCursorFromInstructions(instructions);
                            if (data.errors && data.errors.length > 0) {
                                this.logBookmarksDebug('bookmark folder graphql errors (non-fatal)', { queryId, errors: data.errors });
                                if (!instructions) {
                                    // biome-ignore lint/suspicious/noExplicitAny: error shape
                                    lastError = data.errors.map((e: any) => e.message).join(', ');
                                    continue;
                                }
                            }
                            this.logBookmarksDebug('bookmark folder page parsed', {
                                queryId,
                                tweets: pageTweets.length,
                                hasNextCursor: Boolean(nextCursorVal),
                            });
                            return { success: true, tweets: pageTweets, cursor: nextCursorVal, had404 };
                        }
                        catch (error) {
                            lastError = error instanceof Error ? error.message : String(error);
                            this.logBookmarksDebug('bookmark folder request error', { queryId, error: lastError });
                        }
                    }
                    return { success: false, error: lastError ?? 'Unknown error fetching bookmark folder', had404 };
                };
                let attempt = await tryOnce(buildVariables(pageCount, pageCursor, true));
                if (!attempt.success && attempt.error?.includes('Variable "$count"')) {
                    attempt = await tryOnce(buildVariables(pageCount, pageCursor, false));
                }
                if (!attempt.success && attempt.error?.includes('Variable "$cursor"') && pageCursor) {
                    return {
                        success: false,
                        error: 'Bookmark folder pagination rejected the cursor parameter',
                        had404: attempt.had404,
                    };
                }
                return attempt;
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
        async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
            const maxRetries = 2;
            const baseDelayMs = 500;
            const retryable = new Set([429, 500, 502, 503, 504]);
            for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
                const response = await this.fetchWithTimeout(url, init);
                if (!retryable.has(response.status) || attempt === maxRetries) {
                    return response;
                }
                this.logBookmarksDebug('retrying bookmarks request', {
                    status: response.status,
                    attempt,
                });
                const retryAfter = response.headers?.get?.('retry-after');
                const retryAfterMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : Number.NaN;
                const backoffMs = Number.isFinite(retryAfterMs)
                    ? retryAfterMs
                    : baseDelayMs * 2 ** attempt + Math.floor(Math.random() * baseDelayMs);
                await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
            }
            return this.fetchWithTimeout(url, init);
        }
    }
    return TwitterClientTimelines as unknown as Mixin<TBase, TwitterClientTimelineMethods>;
}
