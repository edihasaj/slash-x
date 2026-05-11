export type DraftBlockType = 'unstyled' | 'header-one' | 'header-two' | 'header-three' | 'blockquote' | 'unordered-list-item' | 'ordered-list-item';
export interface DraftBlock {
    data: Record<string, unknown>;
    text: string;
    key: string;
    type: DraftBlockType;
    entity_ranges: unknown[];
    inline_style_ranges: unknown[];
}
export interface DraftContentState {
    blocks: DraftBlock[];
    entity_map: unknown[];
}
export interface MarkdownToContentStateOptions {
    headerLevelOffset?: number;
}
export declare function markdownToContentState(markdown: string, options?: MarkdownToContentStateOptions): DraftContentState;
export declare function stripFrontmatter(source: string): string;
export interface ExtractedArticleSource {
    title: string;
    body: string;
}
export declare function extractArticleFromMarkdown(source: string, explicitTitle?: string): ExtractedArticleSource;
//# sourceMappingURL=markdown-to-draftjs.d.ts.map