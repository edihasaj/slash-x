import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import { TWITTER_API_BASE } from './constants.js';
import { buildExploreFeatures } from './features.js';
import type { TweetData } from './types.js';
const POST_COUNT_REGEX = /[\d.]+[KMB]?\s*posts?/i;
const POST_COUNT_MATCH_REGEX = /([\d.]+)([KMB]?)\s*posts?/i;
// Timeline IDs for different Explore tabs
const TIMELINE_IDS = {
    forYou: 'VGltZWxpbmU6DAC2CwABAAAAB2Zvcl95b3UAAA==',
    trending: 'VGltZWxpbmU6DAC2CwABAAAACHRyZW5kaW5nAAA=',
    news: 'VGltZWxpbmU6DAC2CwABAAAABG5ld3MAAA==',
    sports: 'VGltZWxpbmU6DAC2CwABAAAABnNwb3J0cwAA',
    entertainment: 'VGltZWxpbmU6DAC2CwABAAAADWVudGVydGFpbm1lbnQAAA==',
} as const;
export type ExploreTab = keyof typeof TIMELINE_IDS;
/** Options for news fetch methods */
export interface NewsFetchOptions {
    /** Include raw GraphQL response in `_raw` field */
    includeRaw?: boolean;
    /** Also fetch related tweets for each news item */
    withTweets?: boolean;
    /** Number of tweets to fetch per news item (default: 5) */
    tweetsPerItem?: number;
    /** Filter to show only AI-curated news items */
    aiOnly?: boolean;
    /** Fetch from specific tabs only (default: all tabs) */
    tabs?: ExploreTab[];
}
export interface NewsItem {
    id: string;
    headline: string;
    category?: string;
    timeAgo?: string;
    postCount?: number;
    description?: string;
    url?: string;
    tweets?: TweetData[];
    // biome-ignore lint/suspicious/noExplicitAny: raw passthrough
    _raw?: any;
}
export type NewsResult = {
    success: true;
    items: NewsItem[];
} | {
    success: false;
    error: string;
};
export interface TwitterClientNewsMethods {
    getNews(count?: number, options?: NewsFetchOptions): Promise<NewsResult>;
}
export function withNews<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientNewsMethods> {
    abstract class TwitterClientNews extends Base {
        // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor requirement.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
            super(...args);
        }
        async getNews(count = 10, options: NewsFetchOptions = {}): Promise<NewsResult> {
            const { includeRaw = false, withTweets = false, tweetsPerItem = 5, aiOnly = false, tabs = ['forYou', 'news', 'sports', 'entertainment'], } = options;
            const debug = process.env.SLASH_DEBUG === '1';
            if (debug) {
                console.error(`[getNews] Fetching from tabs: ${tabs.join(', ')}`);
            }
            const allItems: NewsItem[] = [];
            const seenHeadlines = new Set<string>();
            for (const tab of tabs) {
                const timelineId = TIMELINE_IDS[tab];
                if (!timelineId) {
                    continue;
                }
                try {
                    const tabItems = await this.fetchTimelineTab(tab, timelineId, count, aiOnly, includeRaw);
                    for (const item of tabItems) {
                        if (!seenHeadlines.has(item.headline)) {
                            seenHeadlines.add(item.headline);
                            allItems.push(item);
                        }
                    }
                    if (debug) {
                        console.error(`[getNews] Tab ${tab}: found ${tabItems.length} items, total unique: ${allItems.length}`);
                    }
                    if (allItems.length >= count) {
                        break;
                    }
                }
                catch (error) {
                    if (debug) {
                        console.error(`[getNews] Error fetching tab ${tab}:`, error);
                    }
                }
            }
            if (allItems.length === 0) {
                return { success: false, error: 'No news items found' };
            }
            const items = allItems.slice(0, count);
            if (withTweets) {
                await this.enrichWithTweets(items, tweetsPerItem, includeRaw);
            }
            return { success: true, items };
        }
        async fetchTimelineTab(tabName: string, timelineId: string, maxCount: number, aiOnly: boolean, includeRaw: boolean): Promise<NewsItem[]> {
            const queryId = await this.getQueryId('GenericTimelineById');
            const features = buildExploreFeatures();
            const variables = {
                timelineId: timelineId,
                count: maxCount * 2,
                includePromotedContent: false,
            };
            const params = new URLSearchParams({
                variables: JSON.stringify(variables),
                features: JSON.stringify(features),
            });
            const url = `${TWITTER_API_BASE}/${queryId}/GenericTimelineById?${params.toString()}`;
            const response = await this.fetchWithTimeout(url, {
                method: 'GET',
                headers: this.getHeaders(),
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
            }
            // biome-ignore lint/suspicious/noExplicitAny: API response shape
            const data = (await response.json()) as any;
            if (process.env.SLASH_DEBUG_JSON) {
                const fs = await import('node:fs/promises');
                const debugPath = process.env.SLASH_DEBUG_JSON.replace('.json', `-${tabName}.json`);
                await fs.writeFile(debugPath, JSON.stringify(data, null, 2)).catch(() => { });
            }
            if (data.errors && data.errors.length > 0) {
                // biome-ignore lint/suspicious/noExplicitAny: error shape
                throw new Error(data.errors.map((e: any) => e.message).join('; '));
            }
            return this.parseTimelineTabItems(data, tabName, maxCount, aiOnly, includeRaw);
        }
        parseTimelineTabItems(
        // biome-ignore lint/suspicious/noExplicitAny: API response structure is complex
        data: any, source: string, maxCount: number, aiOnly: boolean, includeRaw: boolean): NewsItem[] {
            const items: NewsItem[] = [];
            const seenHeadlines = new Set<string>();
            const timeline = data?.data?.timeline?.timeline;
            if (!timeline) {
                return [];
            }
            const instructions = timeline.instructions || [];
            for (const instruction of instructions) {
                const entries = instruction.entries ?? (instruction.entry ? [instruction.entry] : []);
                if (!entries || entries.length === 0) {
                    continue;
                }
                for (const entry of entries) {
                    if (items.length >= maxCount) {
                        break;
                    }
                    const content = entry.content;
                    if (!content) {
                        continue;
                    }
                    if (content.itemContent) {
                        const newsItem = this.parseNewsItemFromContent(content.itemContent, entry.entryId, source, seenHeadlines, aiOnly, includeRaw);
                        if (newsItem) {
                            items.push(newsItem);
                        }
                    }
                    const itemsArray = content?.items || [];
                    for (const dataItem of itemsArray) {
                        if (items.length >= maxCount) {
                            break;
                        }
                        const itemContent = dataItem?.itemContent || dataItem?.item?.itemContent;
                        if (!itemContent) {
                            continue;
                        }
                        const newsItem = this.parseNewsItemFromContent(itemContent, entry.entryId, source, seenHeadlines, aiOnly, includeRaw);
                        if (newsItem) {
                            items.push(newsItem);
                        }
                    }
                }
            }
            return items;
        }
        parseNewsItemFromContent(
        // biome-ignore lint/suspicious/noExplicitAny: API response structure is complex
        itemContent: any, entryId: string | undefined, source: string, seenHeadlines: Set<string>, aiOnly: boolean, includeRaw: boolean): NewsItem | null {
            const headline = itemContent.name || itemContent.title;
            if (!headline) {
                return null;
            }
            const trendMetadata = itemContent?.trend_metadata;
            const trendUrl = itemContent.trend_url?.url || trendMetadata?.url?.url;
            const socialContext = itemContent?.social_context?.text || '';
            const hasNewsCategory = socialContext.includes('News') || socialContext.includes('hours ago');
            const isFullSentence = headline.split(' ').length >= 5;
            const isExplicitlyAiTrend = itemContent.is_ai_trend === true;
            const isAiNews = isExplicitlyAiTrend || (isFullSentence && hasNewsCategory);
            if (aiOnly && !isAiNews) {
                return null;
            }
            if (seenHeadlines.has(headline)) {
                return null;
            }
            seenHeadlines.add(headline);
            let postCount: number | undefined;
            let timeAgo: string | undefined;
            let category = 'Trending';
            const socialCtx = itemContent?.social_context;
            if (socialCtx?.text) {
                const socialContextText = socialCtx.text;
                const parts = socialContextText.split('·').map((s: string) => s.trim());
                for (const part of parts) {
                    if (part.includes('ago')) {
                        timeAgo = part;
                    }
                    else if (part.match(POST_COUNT_REGEX)) {
                        const match = part.match(POST_COUNT_MATCH_REGEX);
                        if (match) {
                            let num = Number.parseFloat(match[1]);
                            const suffix = match[2]?.toUpperCase();
                            if (suffix === 'K') {
                                num *= 1000;
                            }
                            else if (suffix === 'M') {
                                num *= 1_000_000;
                            }
                            else if (suffix === 'B') {
                                num *= 1_000_000_000;
                            }
                            postCount = Math.round(num);
                        }
                    }
                    else {
                        category = part;
                    }
                }
            }
            if (trendMetadata?.meta_description) {
                const metaDesc = trendMetadata.meta_description;
                const postMatch = metaDesc.match(POST_COUNT_MATCH_REGEX);
                if (postMatch) {
                    let num = Number.parseFloat(postMatch[1]);
                    const suffix = postMatch[2]?.toUpperCase();
                    if (suffix === 'K') {
                        num *= 1000;
                    }
                    else if (suffix === 'M') {
                        num *= 1_000_000;
                    }
                    else if (suffix === 'B') {
                        num *= 1_000_000_000;
                    }
                    postCount = Math.round(num);
                }
            }
            if (trendMetadata?.domain_context && (category === 'Trending' || category === 'News')) {
                category = trendMetadata.domain_context;
            }
            const item: NewsItem = {
                id: trendUrl ?? (entryId ? `${entryId}-${headline}` : `${source}-${headline}`),
                headline,
                category: isAiNews ? `AI · ${category}` : category,
                timeAgo,
                postCount,
                description: itemContent.description,
                url: trendUrl,
            };
            if (includeRaw) {
                item._raw = itemContent;
            }
            return item;
        }
        async enrichWithTweets(items: NewsItem[], tweetsPerItem: number, includeRaw: boolean): Promise<void> {
            const debug = process.env.SLASH_DEBUG === '1';
            for (const item of items) {
                try {
                    const searchQuery = item.headline;
                    if (!searchQuery) {
                        continue;
                    }
                    if ('search' in this && typeof (this as { search?: unknown }).search === 'function') {
                        // biome-ignore lint/suspicious/noExplicitAny: search method from search mixin
                        const result = (await (this as any).search(searchQuery, tweetsPerItem, { includeRaw })) as { success: boolean; tweets?: TweetData[] };
                        if (result.success && result.tweets) {
                            item.tweets = result.tweets;
                        }
                    }
                }
                catch {
                    if (debug) {
                        console.error('[getNews] Failed to enrich item with tweets:', item.headline);
                    }
                }
            }
        }
    }
    return TwitterClientNews as unknown as Mixin<TBase, TwitterClientNewsMethods>;
}
