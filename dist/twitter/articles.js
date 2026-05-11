import { TWITTER_API_BASE } from './constants.js';
import { buildArticleEntityFeatures } from './features.js';
function findRestId(node, seen = new WeakSet()) {
    if (!node || typeof node !== 'object') {
        return undefined;
    }
    const obj = node;
    if (seen.has(obj)) {
        return undefined;
    }
    seen.add(obj);
    const rest = obj.rest_id;
    if (typeof rest === 'string' && /^\d+$/.test(rest)) {
        return rest;
    }
    for (const value of Object.values(obj)) {
        const found = findRestId(value, seen);
        if (found) {
            return found;
        }
    }
    return undefined;
}
function findTweetId(node) {
    if (!node || typeof node !== 'object') {
        return undefined;
    }
    const obj = node;
    const tweetResults = obj.tweet_results;
    if (tweetResults?.result?.rest_id) {
        return tweetResults.result.rest_id;
    }
    for (const value of Object.values(obj)) {
        if (value && typeof value === 'object') {
            const found = findTweetId(value);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
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
            const articleEntityId = findRestId(result.data);
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
            const tweetId = findTweetId(result.data) ?? findRestId(result.data);
            return { success: true, data: { articleEntityId, tweetId } };
        }
    }
    return TwitterClientArticles;
}
//# sourceMappingURL=articles.js.map