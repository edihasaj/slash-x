// ABOUTME: Mixin for Twitter Lists GraphQL operations.
// ABOUTME: Provides methods to fetch user's owned lists, memberships, and list timelines.
import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import { TWITTER_API_BASE } from './constants.js';
import { buildListsFeatures } from './features.js';
import type { TimelineFetchOptions, TimelinePaginationOptions } from './timelines.js';
import type { ListsResult, SearchResult, TwitterList } from './types.js';
import { extractCursorFromInstructions, parseTweetsFromInstructions } from './utils.js';
export interface TwitterClientListMethods {
    getOwnedLists(count?: number): Promise<ListsResult>;
    getListMemberships(count?: number): Promise<ListsResult>;
    getListTimeline(listId: string, count?: number, options?: TimelineFetchOptions): Promise<SearchResult>;
    getAllListTimeline(listId: string, options?: TimelinePaginationOptions): Promise<SearchResult>;
}
// biome-ignore lint/suspicious/noExplicitAny: list shapes vary
function parseList(listResult: any): TwitterList | null {
    if (!listResult.id_str || !listResult.name) {
        return null;
    }
    const owner = listResult.user_results?.result;
    return {
        id: listResult.id_str,
        name: listResult.name,
        description: listResult.description,
        memberCount: listResult.member_count,
        subscriberCount: listResult.subscriber_count,
        isPrivate: listResult.mode?.toLowerCase() === 'private',
        createdAt: listResult.created_at,
        owner: owner
            ? {
                id: owner.rest_id ?? '',
                username: owner.core?.screen_name ?? owner.legacy?.screen_name ?? '',
                name: owner.core?.name ?? owner.legacy?.name ?? '',
            }
            : undefined,
    };
}
// biome-ignore lint/suspicious/noExplicitAny: instruction shapes vary
function parseListsFromInstructions(instructions: any[] | undefined): TwitterList[] {
    const lists: TwitterList[] = [];
    if (!instructions) {
        return lists;
    }
    for (const instruction of instructions) {
        if (!instruction.entries) {
            continue;
        }
        for (const entry of instruction.entries) {
            const listResult = entry.content?.itemContent?.list;
            if (listResult) {
                const parsed = parseList(listResult);
                if (parsed) {
                    lists.push(parsed);
                }
            }
        }
    }
    return lists;
}
export function withLists<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientListMethods> {
    abstract class TwitterClientLists extends Base {
        // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor requirement.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
            super(...args);
        }
        async getListOwnershipsQueryIds(): Promise<string[]> {
            const primary = await this.getQueryId('ListOwnerships');
            return Array.from(new Set([primary, 'wQcOSjSQ8NtgxIwvYl1lMg']));
        }
        async getListMembershipsQueryIds(): Promise<string[]> {
            const primary = await this.getQueryId('ListMemberships');
            return Array.from(new Set([primary, 'BlEXXdARdSeL_0KyKHHvvg']));
        }
        async getListTimelineQueryIds(): Promise<string[]> {
            const primary = await this.getQueryId('ListLatestTweetsTimeline');
            return Array.from(new Set([primary, '2TemLyqrMpTeAmysdbnVqw']));
        }
        async getOwnedLists(count = 100): Promise<ListsResult> {
            // biome-ignore lint/suspicious/noExplicitAny: getCurrentUser provided by users mixin
            const userResult = await (this as any).getCurrentUser();
            if (!userResult.success || !userResult.user) {
                return { success: false, error: userResult.error ?? 'Could not determine current user' };
            }
            const variables = {
                userId: userResult.user.id,
                count,
                isListMembershipShown: true,
                isListMemberTargetUserId: userResult.user.id,
            };
            const features = buildListsFeatures();
            const params = new URLSearchParams({
                variables: JSON.stringify(variables),
                features: JSON.stringify(features),
            });
            const tryOnce = async (): Promise<{ success: boolean; lists?: TwitterList[]; error?: string; had404: boolean }> => {
                let lastError: string | undefined;
                let had404 = false;
                const queryIds = await this.getListOwnershipsQueryIds();
                for (const queryId of queryIds) {
                    const url = `${TWITTER_API_BASE}/${queryId}/ListOwnerships?${params.toString()}`;
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
                        // biome-ignore lint/suspicious/noExplicitAny: API response shape
                        const data = (await response.json()) as any;
                        // X returns 200 with partial { data, errors } when peripheral fields
                        // (e.g. default_banner_media_results.result) fail to decode.
                        // Trust extracted lists; only surface errors when no data came through.
                        const instructions = data.data?.user?.result?.timeline?.timeline?.instructions;
                        const lists = parseListsFromInstructions(instructions);
                        if (lists.length > 0) {
                            return { success: true, lists, had404 };
                        }
                        if (data.errors && data.errors.length > 0) {
                            // biome-ignore lint/suspicious/noExplicitAny: error shape
                            return { success: false, error: data.errors.map((e: any) => e.message).join(', '), had404 };
                        }
                        return { success: true, lists, had404 };
                    }
                    catch (error) {
                        lastError = error instanceof Error ? error.message : String(error);
                    }
                }
                return { success: false, error: lastError ?? 'Unknown error fetching owned lists', had404 };
            };
            const firstAttempt = await tryOnce();
            if (firstAttempt.success) {
                return { success: true, lists: firstAttempt.lists };
            }
            if (firstAttempt.had404) {
                await this.refreshQueryIds();
                const secondAttempt = await tryOnce();
                if (secondAttempt.success) {
                    return { success: true, lists: secondAttempt.lists };
                }
                return { success: false, error: secondAttempt.error };
            }
            return { success: false, error: firstAttempt.error };
        }
        async getListMemberships(count = 100): Promise<ListsResult> {
            // biome-ignore lint/suspicious/noExplicitAny: getCurrentUser provided by users mixin
            const userResult = await (this as any).getCurrentUser();
            if (!userResult.success || !userResult.user) {
                return { success: false, error: userResult.error ?? 'Could not determine current user' };
            }
            const variables = {
                userId: userResult.user.id,
                count,
                isListMembershipShown: true,
                isListMemberTargetUserId: userResult.user.id,
            };
            const features = buildListsFeatures();
            const params = new URLSearchParams({
                variables: JSON.stringify(variables),
                features: JSON.stringify(features),
            });
            const tryOnce = async (): Promise<{ success: boolean; lists?: TwitterList[]; error?: string; had404: boolean }> => {
                let lastError: string | undefined;
                let had404 = false;
                const queryIds = await this.getListMembershipsQueryIds();
                for (const queryId of queryIds) {
                    const url = `${TWITTER_API_BASE}/${queryId}/ListMemberships?${params.toString()}`;
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
                        // Same partial-success handling as getOwnedLists.
                        const instructions = data.data?.user?.result?.timeline?.timeline?.instructions;
                        const lists = parseListsFromInstructions(instructions);
                        if (lists.length > 0) {
                            return { success: true, lists, had404 };
                        }
                        if (data.errors && data.errors.length > 0) {
                            // biome-ignore lint/suspicious/noExplicitAny: error shape
                            return { success: false, error: data.errors.map((e: any) => e.message).join(', '), had404 };
                        }
                        return { success: true, lists, had404 };
                    }
                    catch (error) {
                        lastError = error instanceof Error ? error.message : String(error);
                    }
                }
                return { success: false, error: lastError ?? 'Unknown error fetching list memberships', had404 };
            };
            const firstAttempt = await tryOnce();
            if (firstAttempt.success) {
                return { success: true, lists: firstAttempt.lists };
            }
            if (firstAttempt.had404) {
                await this.refreshQueryIds();
                const secondAttempt = await tryOnce();
                if (secondAttempt.success) {
                    return { success: true, lists: secondAttempt.lists };
                }
                return { success: false, error: secondAttempt.error };
            }
            return { success: false, error: firstAttempt.error };
        }
        async getListTimeline(listId: string, count = 20, options: TimelineFetchOptions = {}): Promise<SearchResult> {
            return this.getListTimelinePaged(listId, count, options);
        }
        async getAllListTimeline(listId: string, options?: TimelinePaginationOptions): Promise<SearchResult> {
            return this.getListTimelinePaged(listId, Number.POSITIVE_INFINITY, options);
        }
        async getListTimelinePaged(listId: string, limit: number, options: TimelinePaginationOptions = {}): Promise<SearchResult> {
            const features = buildListsFeatures();
            const pageSize = 20;
            const seen = new Set<string>();
            // biome-ignore lint/suspicious/noExplicitAny: tweet shape
            const tweets: any[] = [];
            let cursor = options.cursor;
            let nextCursor: string | undefined;
            let pagesFetched = 0;
            const { includeRaw = false, maxPages } = options;
            // biome-ignore lint/suspicious/noExplicitAny: page shape varies
            const fetchPage = async (pageCount: number, pageCursor?: string): Promise<any> => {
                let lastError: string | undefined;
                let had404 = false;
                const queryIds = await this.getListTimelineQueryIds();
                const variables: Record<string, unknown> = {
                    listId,
                    count: pageCount,
                    ...(pageCursor ? { cursor: pageCursor } : {}),
                };
                const params = new URLSearchParams({
                    variables: JSON.stringify(variables),
                    features: JSON.stringify(features),
                });
                for (const queryId of queryIds) {
                    const url = `${TWITTER_API_BASE}/${queryId}/ListLatestTweetsTimeline?${params.toString()}`;
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
                            return { success: false, error: data.errors.map((e: any) => e.message).join(', '), had404 };
                        }
                        const instructions = data.data?.list?.tweets_timeline?.timeline?.instructions;
                        const pageTweets = parseTweetsFromInstructions(instructions, { quoteDepth: this.quoteDepth, includeRaw });
                        const nextCursorVal = extractCursorFromInstructions(instructions);
                        return { success: true, tweets: pageTweets, cursor: nextCursorVal, had404 };
                    }
                    catch (error) {
                        lastError = error instanceof Error ? error.message : String(error);
                    }
                }
                return { success: false, error: lastError ?? 'Unknown error fetching list timeline', had404 };
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
    return TwitterClientLists as unknown as Mixin<TBase, TwitterClientListMethods>;
}
