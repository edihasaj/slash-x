import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import type { CurrentUserResult, FollowingResult } from './types.js';
export interface TwitterClientUserMethods {
    getCurrentUser(): Promise<CurrentUserResult>;
    getFollowing(userId: string, count?: number, cursor?: string): Promise<FollowingResult>;
    getFollowers(userId: string, count?: number, cursor?: string): Promise<FollowingResult>;
}
export declare function withUsers<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientUserMethods>;
//# sourceMappingURL=users.d.ts.map