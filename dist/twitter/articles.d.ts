import type { DraftContentState } from '../lib/markdown-to-draftjs.js';
import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
export type ArticleVisibility = 'Public' | 'Followers' | 'MentionedUsers' | 'CommunityTweet' | 'Subscribers';
export type ArticleConversationMode = 'All' | 'ByInvitation' | 'Community' | 'Verified' | 'Subscribers' | 'Following';
export interface ArticleMutationResult<TData = unknown> {
    success: boolean;
    data?: TData;
    error?: string;
}
export interface ArticleDraftCreateResult extends ArticleMutationResult<{
    articleEntityId: string;
}> {
}
export interface ArticlePublishResult extends ArticleMutationResult<{
    tweetId?: string;
    articleEntityId: string;
}> {
}
export interface TwitterClientArticleMethods {
    articleDraftCreate(): Promise<ArticleDraftCreateResult>;
    articleUpdateTitle(articleEntityId: string, title: string): Promise<ArticleMutationResult>;
    articleUpdateContent(articleEntityId: string, contentState: DraftContentState): Promise<ArticleMutationResult>;
    articlePublish(articleEntityId: string, visibility?: ArticleVisibility, conversationMode?: ArticleConversationMode): Promise<ArticlePublishResult>;
}
export declare function withArticles<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientArticleMethods>;
//# sourceMappingURL=articles.d.ts.map