import { TWITTER_API_BASE } from './constants.js';
import { buildArticleFeatures, buildArticleFieldToggles, buildArticleEntityFeatures } from './features.js';
import { extractCursorFromInstructions, parseTweetsFromInstructions } from './utils.js';
// biome-ignore lint/suspicious/noExplicitAny: graphql response shapes vary; checked at runtime.
function pickRestId(value) {
    return typeof value === 'string' && /^\d+$/.test(value) ? value : undefined;
}
// biome-ignore lint/suspicious/noExplicitAny: graphql response shapes vary.
function extractArticleEntityId(data) {
    return (pickRestId(data?.articleentity_create_draft?.article_entity_results?.result?.rest_id) ??
        pickRestId(data?.articleentity_publish?.article_entity_results?.result?.rest_id) ??
        pickRestId(data?.articleentity_update_title?.rest_id) ??
        pickRestId(data?.articleentity_update_content_state?.rest_id));
}
// biome-ignore lint/suspicious/noExplicitAny: graphql response shapes vary.
function extractPublishedTweetId(data) {
    return pickRestId(data?.articleentity_publish?.article_entity_results?.result?.metadata?.tweet_results?.result?.rest_id);
}
export function withArticles(Base) {
    class TwitterClientArticles extends Base {
        // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args) {
            super(...args);
        }
        async articleMutation(operationName, variables) {
            await this.ensureClientUserId();
            const features = buildArticleEntityFeatures();
            const send = async (qid) => {
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
                let payload = {};
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
        async articleDraftCreate() {
            const variables = { content_state: { blocks: [], entity_map: [] }, title: '' };
            const result = await this.articleMutation('ArticleEntityDraftCreate', variables);
            if (!result.success || !result.data) {
                return { success: false, error: result.error ?? 'Draft create failed without error' };
            }
            const articleEntityId = extractArticleEntityId(result.data);
            if (!articleEntityId) {
                return { success: false, error: `Draft create response missing rest_id: ${JSON.stringify(result.data).slice(0, 300)}` };
            }
            return { success: true, data: { articleEntityId } };
        }
        async articleUpdateTitle(articleEntityId, title) {
            return this.articleMutation('ArticleEntityUpdateTitle', { articleEntityId, title });
        }
        async articleUpdateContent(articleEntityId, contentState) {
            return this.articleMutation('ArticleEntityUpdateContent', { article_entity: articleEntityId, content_state: contentState });
        }
        async articlePublish(articleEntityId, visibility = 'Public', conversationMode = 'ByInvitation') {
            const variables = { articleEntityId, visibilitySetting: visibility, conversationControl: { mode: conversationMode } };
            const result = await this.articleMutation('ArticleEntityPublish', variables);
            if (!result.success) {
                return { success: false, error: result.error };
            }
            const tweetId = extractPublishedTweetId(result.data);
            return { success: true, data: { articleEntityId, tweetId } };
        }
        async getUserArticles(userId, options = {}) {
            const { count = 20, cursor, includeRaw = false } = options;
            const variables = {
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
                const data = (await response.json());
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
    return TwitterClientArticles;
}
//# sourceMappingURL=articles.js.map