import type { DraftContentState } from '../lib/markdown-to-draftjs.js';
import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import { TWITTER_API_BASE } from './constants.js';
import { buildArticleFeatures, buildArticleFieldToggles, buildArticleEntityFeatures } from './features.js';
import type { SearchResult } from './types.js';
import { extractCursorFromInstructions, parseTweetsFromInstructions } from './utils.js';
export type ArticleVisibility = 'Public' | 'Followers' | 'MentionedUsers' | 'CommunityTweet' | 'Subscribers';
export type ArticleConversationMode = 'All' | 'ByInvitation' | 'Community' | 'Verified' | 'Subscribers' | 'Following';
export interface ArticleMutationResult<TData = unknown> {
    success: boolean;
    data?: TData;
    error?: string;
}
export interface ArticleDraftCreateResult extends ArticleMutationResult<{ articleEntityId: string }> {
}
export interface ArticlePublishResult extends ArticleMutationResult<{ tweetId?: string; articleEntityId: string }> {
}
export interface UserArticlesOptions {
    count?: number;
    cursor?: string;
    includeRaw?: boolean;
}
export interface TwitterClientArticleMethods {
    articleDraftCreate(): Promise<ArticleDraftCreateResult>;
    articleUpdateTitle(articleEntityId: string, title: string): Promise<ArticleMutationResult>;
    articleUpdateContent(articleEntityId: string, contentState: DraftContentState): Promise<ArticleMutationResult>;
    articlePublish(articleEntityId: string, visibility?: ArticleVisibility, conversationMode?: ArticleConversationMode): Promise<ArticlePublishResult>;
    getUserArticles(userId: string, options?: UserArticlesOptions): Promise<SearchResult>;
}
// biome-ignore lint/suspicious/noExplicitAny: graphql response shapes vary; checked at runtime.
function pickRestId(value: any): string | undefined {
    return typeof value === 'string' && /^\d+$/.test(value) ? value : undefined;
}
// biome-ignore lint/suspicious/noExplicitAny: graphql response shapes vary.
function extractArticleEntityId(data: any): string | undefined {
    return (pickRestId(data?.articleentity_create_draft?.article_entity_results?.result?.rest_id) ??
        pickRestId(data?.articleentity_publish?.article_entity_results?.result?.rest_id) ??
        pickRestId(data?.articleentity_update_title?.rest_id) ??
        pickRestId(data?.articleentity_update_content_state?.rest_id));
}
// biome-ignore lint/suspicious/noExplicitAny: graphql response shapes vary.
function extractPublishedTweetId(data: any): string | undefined {
    return pickRestId(data?.articleentity_publish?.article_entity_results?.result?.metadata?.tweet_results?.result?.rest_id);
}
export function withArticles<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientArticleMethods> {
    abstract class TwitterClientArticles extends Base {
        // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
            super(...args);
        }
        private async articleMutation<T = unknown>(operationName: 'ArticleEntityDraftCreate' | 'ArticleEntityUpdateTitle' | 'ArticleEntityUpdateContent' | 'ArticleEntityPublish', variables: Record<string, unknown>): Promise<ArticleMutationResult<T>> {
            await this.ensureClientUserId();
            const features = buildArticleEntityFeatures();
            const send = async (qid: string): Promise<{ status: number; text: string }> => {
                const url = `${TWITTER_API_BASE}/${qid}/${operationName}`;
                const headers = await this.withTransactionId({ ...this.getHeaders(), referer: 'https://x.com/compose/articles' }, 'POST', url);
                const response = await this.fetchWithTimeout(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ variables, features, queryId: qid }),
                });
                return { status: response.status, text: await response.text() };
            };
            try {
                let queryId = await this.getQueryId(operationName);
                let attempt = await send(queryId);
                if (attempt.status === 404) {
                    await this.refreshQueryIds();
                    queryId = await this.getQueryId(operationName);
                    attempt = await send(queryId);
                }
                if (attempt.status < 200 || attempt.status >= 300) {
                    return { success: false, error: `HTTP ${attempt.status}: ${attempt.text.slice(0, 400)}` };
                }
                let payload: { data?: T; errors?: Array<{ message: string; code?: number }> } = {};
                try {
                    payload = JSON.parse(attempt.text);
                }
                catch {
                    return { success: false, error: `Non-JSON response: ${attempt.text.slice(0, 200)}` };
                }
                if (payload.errors && payload.errors.length > 0) {
                    return { success: false, error: payload.errors.map((e) => (typeof e.code === 'number' ? `${e.message} (${e.code})` : e.message)).join(', ') };
                }
                return { success: true, data: payload.data };
            }
            catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
        async articleDraftCreate(): Promise<ArticleDraftCreateResult> {
            const variables = { content_state: { blocks: [], entity_map: [] }, title: '' };
            const result = await this.articleMutation<Record<string, unknown>>('ArticleEntityDraftCreate', variables);
            if (!result.success || !result.data) {
                return { success: false, error: result.error ?? 'Draft create failed without error' };
            }
            const articleEntityId = extractArticleEntityId(result.data);
            if (!articleEntityId) {
                return { success: false, error: `Draft create response missing rest_id: ${JSON.stringify(result.data).slice(0, 300)}` };
            }
            return { success: true, data: { articleEntityId } };
        }
        async articleUpdateTitle(articleEntityId: string, title: string): Promise<ArticleMutationResult> {
            return this.articleMutation('ArticleEntityUpdateTitle', { articleEntityId, title });
        }
        async articleUpdateContent(articleEntityId: string, contentState: DraftContentState): Promise<ArticleMutationResult> {
            return this.articleMutation('ArticleEntityUpdateContent', { article_entity: articleEntityId, content_state: contentState });
        }
        async articlePublish(articleEntityId: string, visibility: ArticleVisibility = 'Public', conversationMode: ArticleConversationMode = 'ByInvitation'): Promise<ArticlePublishResult> {
            const variables = { articleEntityId, visibilitySetting: visibility, conversationControl: { mode: conversationMode } };
            const result = await this.articleMutation<Record<string, unknown>>('ArticleEntityPublish', variables);
            if (!result.success) {
                return { success: false, error: result.error };
            }
            const tweetId = extractPublishedTweetId(result.data);
            return { success: true, data: { articleEntityId, tweetId } };
        }
        async getUserArticles(userId: string, options: UserArticlesOptions = {}): Promise<SearchResult> {
            const { count = 20, cursor, includeRaw = false } = options;
            const variables: Record<string, unknown> = {
                userId,
                count,
                includePromotedContent: false,
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
                ...(cursor ? { cursor } : {}),
            };
            const params = new URLSearchParams({
                variables: JSON.stringify(variables),
                features: JSON.stringify(buildArticleFeatures()),
                fieldToggles: JSON.stringify({ ...buildArticleFieldToggles(), withArticlePlainText: true, withArticleRichContentState: true }),
            });
            const queryId = await this.getQueryId('UserArticlesTweets');
            const url = `${TWITTER_API_BASE}/${queryId}/UserArticlesTweets?${params.toString()}`;
            try {
                const response = await this.fetchWithTimeout(url, { method: 'GET', headers: this.getHeaders() });
                if (!response.ok) {
                    return { success: false, error: `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}` };
                }
                // biome-ignore lint/suspicious/noExplicitAny: graphql response shape.
                const data = (await response.json()) as any;
                const instructions = data?.data?.user?.result?.timeline?.timeline?.instructions ?? [];
                const tweets = parseTweetsFromInstructions(instructions, { quoteDepth: 0, includeRaw });
                const nextCursor = extractCursorFromInstructions(instructions, 'Bottom');
                return { success: true, tweets, nextCursor, ...(includeRaw ? { _raw: data } : {}) };
            }
            catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
    }
    return TwitterClientArticles as unknown as Mixin<TBase, TwitterClientArticleMethods>;
}
