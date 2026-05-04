import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import type { SearchResult } from './types.js';
/** Options for home timeline fetch methods */
export interface HomeTimelineFetchOptions {
    /** Include raw GraphQL response in `_raw` field */
    includeRaw?: boolean;
}
export interface TwitterClientHomeMethods {
    getHomeTimeline(count?: number, options?: HomeTimelineFetchOptions): Promise<SearchResult>;
    getHomeLatestTimeline(count?: number, options?: HomeTimelineFetchOptions): Promise<SearchResult>;
}
export declare function withHome<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientHomeMethods>;
//# sourceMappingURL=home.d.ts.map