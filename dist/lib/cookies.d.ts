export interface TwitterCookies {
    authToken: string | null;
    ct0: string | null;
    cookieHeader: string | null;
    source: string | null;
}
export interface CookieExtractionResult {
    cookies: TwitterCookies;
    warnings: string[];
}
export type CookieSource = 'safari' | 'chrome' | 'edge' | 'firefox';
export declare function extractCookiesFromSafari(): Promise<CookieExtractionResult>;
export declare function extractCookiesFromChrome(profile?: string): Promise<CookieExtractionResult>;
export declare function extractCookiesFromEdge(profile?: string): Promise<CookieExtractionResult>;
export declare function extractCookiesFromFirefox(profile?: string): Promise<CookieExtractionResult>;
/**
 * Resolve Twitter credentials from multiple sources.
 * Priority: CLI args > environment variables > browsers (ordered).
 */
export declare function resolveCredentials(options: {
    authToken?: string;
    ct0?: string;
    cookieSource?: CookieSource | CookieSource[];
    chromeProfile?: string;
    edgeProfile?: string;
    firefoxProfile?: string;
    cookieTimeoutMs?: number;
}): Promise<CookieExtractionResult>;
//# sourceMappingURL=cookies.d.ts.map