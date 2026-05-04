import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import { TWITTER_API_BASE } from './constants.js';
import type { FollowMutationResult } from './types.js';
export interface TwitterClientFollowMethods {
    follow(userId: string): Promise<FollowMutationResult>;
    unfollow(userId: string): Promise<FollowMutationResult>;
}
export function withFollow<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientFollowMethods> {
    abstract class TwitterClientFollow extends Base {
        // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor requirement.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
            super(...args);
        }
        /**
         * Follow a user by their user ID
         */
        async follow(userId: string): Promise<FollowMutationResult> {
            await this.ensureClientUserId();
            const restResult = await this.followViaRest(userId, 'create');
            if (restResult.success) {
                return restResult;
            }
            return this.followViaGraphQL(userId, true);
        }
        /**
         * Unfollow a user by their user ID
         */
        async unfollow(userId: string): Promise<FollowMutationResult> {
            await this.ensureClientUserId();
            const restResult = await this.followViaRest(userId, 'destroy');
            if (restResult.success) {
                return restResult;
            }
            return this.followViaGraphQL(userId, false);
        }
        async followViaRest(userId: string, action: 'create' | 'destroy'): Promise<FollowMutationResult> {
            const urls = [
                `https://x.com/i/api/1.1/friendships/${action}.json`,
                `https://api.twitter.com/1.1/friendships/${action}.json`,
            ];
            const params = new URLSearchParams({
                user_id: userId,
                skip_status: 'true',
            });
            let lastError: string | undefined;
            for (const url of urls) {
                try {
                    const response = await this.fetchWithTimeout(url, {
                        method: 'POST',
                        headers: {
                            ...this.getBaseHeaders(),
                            'content-type': 'application/x-www-form-urlencoded',
                        },
                        body: params.toString(),
                    });
                    if (!response.ok) {
                        const text = await response.text();
                        try {
                            const errorData = JSON.parse(text) as { errors?: Array<{ message: string; code?: number }> };
                            if (errorData.errors && errorData.errors.length > 0) {
                                const error = errorData.errors[0]!;
                                if (error.code === 160) {
                                    return { success: true };
                                }
                                if (error.code === 162) {
                                    return { success: false, error: 'You have been blocked from following this account' };
                                }
                                if (error.code === 108) {
                                    return { success: false, error: 'User not found' };
                                }
                                lastError = `${error.message} (code ${error.code})`;
                                continue;
                            }
                        }
                        catch {
                            // Not JSON, continue with generic error
                        }
                        lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
                        continue;
                    }
                    const data = (await response.json()) as { id_str?: string; screen_name?: string; errors?: Array<{ message: string }> };
                    if (data.errors && data.errors.length > 0) {
                        lastError = data.errors.map((e) => e.message).join(', ');
                        continue;
                    }
                    if (data.id_str || data.screen_name) {
                        return {
                            success: true,
                            userId: data.id_str,
                            username: data.screen_name,
                        };
                    }
                    return { success: true };
                }
                catch (error) {
                    lastError = error instanceof Error ? error.message : String(error);
                }
            }
            return { success: false, error: lastError ?? `Unknown error during ${action}` };
        }
        async followViaGraphQL(userId: string, follow: boolean): Promise<FollowMutationResult> {
            const operationName = follow ? 'CreateFriendship' : 'DestroyFriendship';
            const variables = {
                user_id: userId,
            };
            const tryOnce = async (): Promise<{ success: boolean; userId?: string; username?: string; error?: string; had404: boolean }> => {
                let lastError: string | undefined;
                let had404 = false;
                const queryIds = await this.getFollowQueryIds(follow);
                for (const queryId of queryIds) {
                    const url = `${TWITTER_API_BASE}/${queryId}/${operationName}`;
                    try {
                        const response = await this.fetchWithTimeout(url, {
                            method: 'POST',
                            headers: this.getHeaders(),
                            body: JSON.stringify({ variables, queryId }),
                        });
                        if (response.status === 404) {
                            had404 = true;
                            lastError = 'HTTP 404';
                            continue;
                        }
                        if (!response.ok) {
                            const text = await response.text();
                            lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
                            continue;
                        }
                        // biome-ignore lint/suspicious/noExplicitAny: GraphQL response shape varies
                        const data = (await response.json()) as any;
                        if (data.errors && data.errors.length > 0) {
                            // biome-ignore lint/suspicious/noExplicitAny: error shape varies
                            lastError = data.errors.map((e: any) => e.message).join(', ');
                            continue;
                        }
                        const result = data.data?.user?.result;
                        return {
                            success: true,
                            userId: result?.rest_id,
                            username: result?.legacy?.screen_name,
                            had404,
                        };
                    }
                    catch (error) {
                        lastError = error instanceof Error ? error.message : String(error);
                    }
                }
                return {
                    success: false,
                    error: lastError ?? `Unknown error during ${operationName}`,
                    had404,
                };
            };
            const firstAttempt = await tryOnce();
            if (firstAttempt.success) {
                return { success: true, userId: firstAttempt.userId, username: firstAttempt.username };
            }
            if (firstAttempt.had404) {
                await this.refreshQueryIds();
                const secondAttempt = await tryOnce();
                if (secondAttempt.success) {
                    return { success: true, userId: secondAttempt.userId, username: secondAttempt.username };
                }
                return { success: false, error: secondAttempt.error ?? 'Unknown error' };
            }
            return { success: false, error: firstAttempt.error ?? 'Unknown error' };
        }
        async getFollowQueryIds(follow: boolean): Promise<string[]> {
            const primary = await this.getQueryId(follow ? 'CreateFriendship' : 'DestroyFriendship');
            const fallbacks = follow
                ? ['8h9JVdV8dlSyqyRDJEPCsA', 'OPwKc1HXnBT_bWXfAlo-9g']
                : ['ppXWuagMNXgvzx6WoXBW0Q', '8h9JVdV8dlSyqyRDJEPCsA'];
            return Array.from(new Set([primary, ...fallbacks]));
        }
    }
    return TwitterClientFollow as unknown as Mixin<TBase, TwitterClientFollowMethods>;
}
