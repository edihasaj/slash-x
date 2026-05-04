import type { AbstractConstructor, Mixin, TwitterClientBase } from './base.js';
import type { UploadMediaResult } from './types.js';
export interface TwitterClientMediaMethods {
    uploadMedia(input: {
        data: Uint8Array;
        mimeType: string;
        alt?: string;
    }): Promise<UploadMediaResult>;
}
export declare function withMedia<TBase extends AbstractConstructor<TwitterClientBase>>(Base: TBase): Mixin<TBase, TwitterClientMediaMethods>;
//# sourceMappingURL=media.d.ts.map