import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import type { FollowMutationResult } from './types.js';
export interface TwitterClientFollowMethods {
    follow(userId: string): Promise<FollowMutationResult>;
    unfollow(userId: string): Promise<FollowMutationResult>;
}
export declare function withFollow<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientFollowMethods>;
//# sourceMappingURL=follow.d.ts.map