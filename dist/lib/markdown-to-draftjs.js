import { randomBytes } from 'node:crypto';
function blockKey() {
    return randomBytes(3).toString('hex').slice(0, 5);
}
function makeBlock(type, text) {
    return { data: {}, text, key: blockKey(), type, entity_ranges: [], inline_style_ranges: [] };
}
export function markdownToContentState(markdown, options = {}) {
    const offset = options.headerLevelOffset ?? 0;
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let paragraph = [];
    const flush = () => {
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
            const type = ['header-one', 'header-two', 'header-three'][level - 1];
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
export function stripFrontmatter(source) {
    if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) {
        return source;
    }
    const closing = source.indexOf('\n---', 4);
    if (closing === -1) {
        return source;
    }
    return source.slice(closing + 4).replace(/^\s*\n/, '');
}
export function extractArticleFromMarkdown(source, explicitTitle) {
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
//# sourceMappingURL=markdown-to-draftjs.js.map