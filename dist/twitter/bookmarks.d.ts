import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import type { BookmarkMutationResult } from './types.js';
export interface TwitterClientBookmarkMethods {
    unbookmark(tweetId: string): Promise<BookmarkMutationResult>;
}
export declare function withBookmarks<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientBookmarkMethods>;
//# sourceMappingURL=bookmarks.d.ts.map