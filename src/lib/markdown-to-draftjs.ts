import { randomBytes } from 'node:crypto';
export type DraftBlockType =
    | 'unstyled'
    | 'header-one'
    | 'header-two'
    | 'header-three'
    | 'blockquote'
    | 'unordered-list-item'
    | 'ordered-list-item';
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
function blockKey(): string {
    return randomBytes(3).toString('hex').slice(0, 5);
}
function makeBlock(type: DraftBlockType, text: string): DraftBlock {
    return { data: {}, text, key: blockKey(), type, entity_ranges: [], inline_style_ranges: [] };
}
export interface MarkdownToContentStateOptions {
    headerLevelOffset?: number;
}
export function markdownToContentState(markdown: string, options: MarkdownToContentStateOptions = {}): DraftContentState {
    const offset = options.headerLevelOffset ?? 0;
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const blocks: DraftBlock[] = [];
    let paragraph: string[] = [];
    const flush = (): void => {
        if (paragraph.length === 0) {
            return;
        }
        blocks.push(makeBlock('unstyled', paragraph.join(' ').trim()));
        paragraph = [];
    };
    for (const rawLine of lines) {
        const line = rawLine.replace(/\s+$/, '');
        if (line.trim() === '') {
            flush();
            continue;
        }
        const header = line.match(/^(#{1,6})\s+(.*)$/);
        if (header) {
            flush();
            const level = Math.min(3, Math.max(1, header[1].length + offset));
            const type: DraftBlockType = (['header-one', 'header-two', 'header-three'] as const)[level - 1];
            blocks.push(makeBlock(type, header[2].trim()));
            continue;
        }
        if (line.startsWith('> ')) {
            flush();
            blocks.push(makeBlock('blockquote', line.slice(2).trim()));
            continue;
        }
        if (line.startsWith('>')) {
            flush();
            blocks.push(makeBlock('blockquote', line.slice(1).trim()));
            continue;
        }
        const unordered = line.match(/^[\s]*[-*+]\s+(.*)$/);
        if (unordered) {
            flush();
            blocks.push(makeBlock('unordered-list-item', unordered[1].trim()));
            continue;
        }
        const ordered = line.match(/^[\s]*\d+\.\s+(.*)$/);
        if (ordered) {
            flush();
            blocks.push(makeBlock('ordered-list-item', ordered[1].trim()));
            continue;
        }
        paragraph.push(line.trim());
    }
    flush();
    return { blocks, entity_map: [] };
}
export function stripFrontmatter(source: string): string {
    if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) {
        return source;
    }
    const closing = source.indexOf('\n---', 4);
    if (closing === -1) {
        return source;
    }
    return source.slice(closing + 4).replace(/^\s*\n/, '');
}
export interface ExtractedArticleSource {
    title: string;
    body: string;
}
export function extractArticleFromMarkdown(source: string, explicitTitle?: string): ExtractedArticleSource {
    const stripped = stripFrontmatter(source).trim();
    if (explicitTitle && explicitTitle.trim().length > 0) {
        return { title: explicitTitle.trim(), body: stripped };
    }
    const lines = stripped.split('\n');
    const h1Index = lines.findIndex((line) => /^#\s+\S/.test(line));
    if (h1Index !== -1) {
        const title = lines[h1Index].replace(/^#\s+/, '').trim();
        const remaining = [...lines.slice(0, h1Index), ...lines.slice(h1Index + 1)].join('\n').trim();
        return { title, body: remaining };
    }
    return { title: '', body: stripped };
}
