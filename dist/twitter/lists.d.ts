import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import type { TimelineFetchOptions, TimelinePaginationOptions } from './timelines.js';
import type { ListsResult, SearchResult } from './types.js';
export interface TwitterClientListMethods {
    getOwnedLists(count?: number): Promise<ListsResult>;
    getListMemberships(count?: number): Promise<ListsResult>;
    getListTimeline(listId: string, count?: number, options?: TimelineFetchOptions): Promise<SearchResult>;
    getAllListTimeline(listId: string, options?: TimelinePaginationOptions): Promise<SearchResult>;
}
export declare function withLists<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientListMethods>;
//# sourceMappingURL=lists.d.ts.map