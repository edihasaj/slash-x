import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import type { CliContext, MediaSpec } from '../cli/shared.js';
import { extractArticleFromMarkdown, markdownToContentState } from '../lib/markdown-to-draftjs.js';
import { formatTweetUrlLine } from '../lib/output.js';
import type { ArticleConversationMode, ArticleVisibility } from '../twitter/articles.js';
import { TwitterClient } from '../twitter/client.js';
async function uploadMediaOrExit(client: TwitterClient, media: MediaSpec[], ctx: CliContext): Promise<string[] | undefined> {
    if (media.length === 0) {
        return undefined;
    }
    const uploaded: string[] = [];
    for (const item of media) {
        const res = await client.uploadMedia({ data: item.buffer, mimeType: item.mime, alt: item.alt });
        if (!res.success || !res.mediaId) {
            console.error(`${ctx.p('err')}Media upload failed: ${res.error ?? 'Unknown error'}`);
            process.exit(1);
        }
        uploaded.push(res.mediaId);
    }
    return uploaded;
}
export function registerPostCommands(parent: Command, ctx: CliContext, root?: Command): void {
    const optsSource = root ?? parent;
    parent
        .command('tweet')
        .description('Post a new tweet')
        .argument('<text>', 'Tweet text')
        .action(async (text: string) => {
        const opts = optsSource.opts();
        const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
        const quoteDepth = ctx.resolveQuoteDepthFromOptions(opts);
        let media: MediaSpec[] = [];
        try {
            media = ctx.loadMedia({ media: opts.media ?? [], alts: opts.alt ?? [] });
        }
        catch (error) {
            console.error(`${ctx.p('err')}${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
        const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);
        for (const warning of warnings) {
            console.error(`${ctx.p('warn')}${warning}`);
        }
        if (!cookies.authToken || !cookies.ct0) {
            console.error(`${ctx.p('err')}Missing required credentials`);
            process.exit(1);
        }
        if (cookies.source) {
            console.error(`${ctx.l('source')}${cookies.source}`);
        }
        const client = new TwitterClient({ cookies, timeoutMs, quoteDepth });
        const mediaIds = await uploadMediaOrExit(client, media, ctx);
        const result = await client.tweet(text, mediaIds);
        if (result.success) {
            console.log(`${ctx.p('ok')}Tweet posted successfully!`);
            console.log(formatTweetUrlLine(result.tweetId, ctx.getOutput()));
        }
        else {
            console.error(`${ctx.p('err')}Failed to post tweet: ${result.error}`);
            process.exit(1);
        }
    });
    parent
        .command('long')
        .description('Post a long-form post via CreateNoteTweet (Premium plain-text, up to 25k chars)')
        .argument('[text]', 'Post body (or use --file)')
        .option('-f, --file <path>', 'Read body from a file')
        .action(async (text: string | undefined, cmdOpts: { file?: string }) => {
        const opts = optsSource.opts();
        const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
        const quoteDepth = ctx.resolveQuoteDepthFromOptions(opts);
        let body = text;
        if (cmdOpts.file) {
            try {
                body = await readFile(cmdOpts.file, 'utf8');
            }
            catch (error) {
                console.error(`${ctx.p('err')}Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
                process.exit(1);
            }
        }
        if (!body || body.trim().length === 0) {
            console.error(`${ctx.p('err')}Body is empty. Provide <text> or --file <path>.`);
            process.exit(1);
        }
        if (body.length > 25000) {
            console.error(`${ctx.p('err')}Body is ${body.length} chars; X limit is 25000.`);
            process.exit(1);
        }
        let media: MediaSpec[] = [];
        try {
            media = ctx.loadMedia({ media: opts.media ?? [], alts: opts.alt ?? [] });
        }
        catch (error) {
            console.error(`${ctx.p('err')}${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
        const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);
        for (const warning of warnings) {
            console.error(`${ctx.p('warn')}${warning}`);
        }
        if (!cookies.authToken || !cookies.ct0) {
            console.error(`${ctx.p('err')}Missing required credentials`);
            process.exit(1);
        }
        if (cookies.source) {
            console.error(`${ctx.l('source')}${cookies.source}`);
        }
        console.error(`${ctx.p('info')}Posting long post (${body.length} chars)…`);
        const client = new TwitterClient({ cookies, timeoutMs, quoteDepth });
        const mediaIds = await uploadMediaOrExit(client, media, ctx);
        const result = await client.noteTweet(body, mediaIds);
        if (result.success) {
            console.log(`${ctx.p('ok')}Long post published!`);
            console.log(formatTweetUrlLine(result.tweetId, ctx.getOutput()));
        }
        else {
            console.error(`${ctx.p('err')}Failed to post: ${result.error}`);
            process.exit(1);
        }
    });
    parent
        .command('article')
        .description('Publish a rich X Article (Premium+; title + Draft.js body via ArticleEntity mutations)')
        .argument('[body]', 'Article body in markdown (or use --file)')
        .option('-f, --file <path>', 'Read article markdown from a file')
        .option('-t, --title <title>', 'Article title (otherwise extracted from first `# heading` of the markdown)')
        .option('--visibility <setting>', 'Article visibility: Public, Followers, Subscribers, MentionedUsers, CommunityTweet', 'Public')
        .option('--conversation <mode>', 'Reply control: All, ByInvitation, Community, Verified, Subscribers, Following', 'ByInvitation')
        .option('--dry-run', 'Convert markdown to Draft.js content_state and print it; do not call X.', false)
        .action(async (bodyArg: string | undefined, cmdOpts: { file?: string; title?: string; visibility: string; conversation: string; dryRun: boolean }) => {
        const opts = optsSource.opts();
        const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
        const quoteDepth = ctx.resolveQuoteDepthFromOptions(opts);
        let source = bodyArg;
        if (cmdOpts.file) {
            try {
                source = await readFile(cmdOpts.file, 'utf8');
            }
            catch (error) {
                console.error(`${ctx.p('err')}Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
                process.exit(1);
            }
        }
        if (!source || source.trim().length === 0) {
            console.error(`${ctx.p('err')}Article source is empty. Provide <body> or --file <path>.`);
            process.exit(1);
        }
        const { title, body } = extractArticleFromMarkdown(source, cmdOpts.title);
        if (!title) {
            console.error(`${ctx.p('err')}Article title is missing. Pass --title <title> or include a # heading in the markdown.`);
            process.exit(1);
        }
        const contentState = markdownToContentState(body);
        if (cmdOpts.dryRun) {
            console.log(JSON.stringify({ title, content_state: contentState }, null, 2));
            return;
        }
        const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);
        for (const warning of warnings) {
            console.error(`${ctx.p('warn')}${warning}`);
        }
        if (!cookies.authToken || !cookies.ct0) {
            console.error(`${ctx.p('err')}Missing required credentials`);
            process.exit(1);
        }
        if (cookies.source) {
            console.error(`${ctx.l('source')}${cookies.source}`);
        }
        console.error(`${ctx.p('info')}Publishing article: "${title}" (${contentState.blocks.length} blocks)`);
        const client = new TwitterClient({ cookies, timeoutMs, quoteDepth });
        const draft = await client.articleDraftCreate();
        if (!draft.success || !draft.data) {
            console.error(`${ctx.p('err')}Draft create failed: ${draft.error}`);
            process.exit(1);
        }
        const { articleEntityId } = draft.data;
        console.error(`${ctx.p('info')}Draft created (id ${articleEntityId}); setting title…`);
        const titleResult = await client.articleUpdateTitle(articleEntityId, title);
        if (!titleResult.success) {
            console.error(`${ctx.p('err')}Title update failed: ${titleResult.error}`);
            process.exit(1);
        }
        console.error(`${ctx.p('info')}Title set; uploading body…`);
        const contentResult = await client.articleUpdateContent(articleEntityId, contentState);
        if (!contentResult.success) {
            console.error(`${ctx.p('err')}Content update failed: ${contentResult.error}`);
            process.exit(1);
        }
        console.error(`${ctx.p('info')}Body uploaded; publishing…`);
        const publishResult = await client.articlePublish(articleEntityId, cmdOpts.visibility as ArticleVisibility, cmdOpts.conversation as ArticleConversationMode);
        if (!publishResult.success || !publishResult.data) {
            console.error(`${ctx.p('err')}Publish failed: ${publishResult.error}`);
            process.exit(1);
        }
        console.log(`${ctx.p('ok')}Article published!`);
        if (publishResult.data.tweetId) {
            console.log(formatTweetUrlLine(publishResult.data.tweetId, ctx.getOutput()));
        }
        else {
            console.log(`${ctx.p('info')}articleEntityId: ${publishResult.data.articleEntityId}`);
        }
    });
    parent
        .command('reply')
        .description('Reply to an existing tweet')
        .argument('<tweet-id-or-url>', 'Tweet ID or URL to reply to')
        .argument('<text>', 'Reply text')
        .action(async (tweetIdOrUrl: string, text: string) => {
        const opts = optsSource.opts();
        const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
        const quoteDepth = ctx.resolveQuoteDepthFromOptions(opts);
        let media: MediaSpec[] = [];
        try {
            media = ctx.loadMedia({ media: opts.media ?? [], alts: opts.alt ?? [] });
        }
        catch (error) {
            console.error(`${ctx.p('err')}${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
        const tweetId = ctx.extractTweetId(tweetIdOrUrl);
        const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);
        for (const warning of warnings) {
            console.error(`${ctx.p('warn')}${warning}`);
        }
        if (!cookies.authToken || !cookies.ct0) {
            console.error(`${ctx.p('err')}Missing required credentials`);
            process.exit(1);
        }
        if (cookies.source) {
            console.error(`${ctx.l('source')}${cookies.source}`);
        }
        console.error(`${ctx.p('info')}Replying to tweet: ${tweetId}`);
        const client = new TwitterClient({ cookies, timeoutMs, quoteDepth });
        const mediaIds = await uploadMediaOrExit(client, media, ctx);
        const result = await client.reply(text, tweetId, mediaIds);
        if (result.success) {
            console.log(`${ctx.p('ok')}Reply posted successfully!`);
            console.log(formatTweetUrlLine(result.tweetId, ctx.getOutput()));
        }
        else {
            console.error(`${ctx.p('err')}Failed to post reply: ${result.error}`);
            process.exit(1);
        }
    });
}
