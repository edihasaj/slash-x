import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import type { AboutAccountResult } from './types.js';
/** Result of username to userId lookup */
export interface UserLookupResult {
    success: boolean;
    userId?: string;
    username?: string;
    name?: string;
    error?: string;
}
export interface TwitterClientUserLookupMethods {
    getUserIdByUsername(username: string): Promise<UserLookupResult>;
    getUserAboutAccount(username: string): Promise<AboutAccountResult>;
}
export declare function withUserLookup<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientUserLookupMethods>;
//# sourceMappingURL=user-lookup.d.ts.map