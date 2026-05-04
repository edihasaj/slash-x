import { TWITTER_API_BASE } from './constants.js';
import { buildExploreFeatures } from './features.js';
const POST_COUNT_REGEX = /[\d.]+[KMB]?\s*posts?/i;
const POST_COUNT_MATCH_REGEX = /([\d.]+)([KMB]?)\s*posts?/i;
// Timeline IDs for different Explore tabs
const TIMELINE_IDS = {
    forYou: 'VGltZWxpbmU6DAC2CwABAAAAB2Zvcl95b3UAAA==',
    trending: 'VGltZWxpbmU6DAC2CwABAAAACHRyZW5kaW5nAAA=',
    news: 'VGltZWxpbmU6DAC2CwABAAAABG5ld3MAAA==',
    sports: 'VGltZWxpbmU6DAC2CwABAAAABnNwb3J0cwAA',
    entertainment: 'VGltZWxpbmU6DAC2CwABAAAADWVudGVydGFpbm1lbnQAAA==',
};
export function withNews(Base) {
    class TwitterClientNews extends Base {
        // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor requirement.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args) {
            super(...args);
        }
        async getNews(count = 10, options = {}) {
            const { includeRaw = false, withTweets = false, tweetsPerItem = 5, aiOnly = false, tabs = ['forYou', 'news', 'sports', 'entertainment'], } = options;
            const debug = process.env.SLASH_DEBUG === '1';
            if (debug) {
                console.error(`[getNews] Fetching from tabs: ${tabs.join(', ')}`);
            }
            const allItems = [];
            const seenHeadlines = new Set();
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
        async fetchTimelineTab(tabName, timelineId, maxCount, aiOnly, includeRaw) {
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
            const data = (await response.json());
            if (process.env.SLASH_DEBUG_JSON) {
                const fs = await import('node:fs/promises');
                const debugPath = process.env.SLASH_DEBUG_JSON.replace('.json', `-${tabName}.json`);
                await fs.writeFile(debugPath, JSON.stringify(data, null, 2)).catch(() => { });
            }
            if (data.errors && data.errors.length > 0) {
                // biome-ignore lint/suspicious/noExplicitAny: error shape
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }
            return this.parseTimelineTabItems(data, tabName, maxCount, aiOnly, includeRaw);
        }
        parseTimelineTabItems(
        // biome-ignore lint/suspicious/noExplicitAny: API response structure is complex
        data, source, maxCount, aiOnly, includeRaw) {
            const items = [];
            const seenHeadlines = new Set();
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
        itemContent, entryId, source, seenHeadlines, aiOnly, includeRaw) {
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
            let postCount;
            let timeAgo;
            let category = 'Trending';
            const socialCtx = itemContent?.social_context;
            if (socialCtx?.text) {
                const socialContextText = socialCtx.text;
                const parts = socialContextText.split('·').map((s) => s.trim());
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
            const item = {
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
        async enrichWithTweets(items, tweetsPerItem, includeRaw) {
            const debug = process.env.SLASH_DEBUG === '1';
            for (const item of items) {
                try {
                    const searchQuery = item.headline;
                    if (!searchQuery) {
                        continue;
                    }
                    if ('search' in this && typeof this.search === 'function') {
                        // biome-ignore lint/suspicious/noExplicitAny: search method from search mixin
                        const result = (await this.search(searchQuery, tweetsPerItem, { includeRaw }));
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
    return TwitterClientNews;
}
//# sourceMappingURL=news.js.map