import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import type { CliContext, MediaSpec } from '../cli/shared.js';
import { formatTweetUrlLine } from '../lib/output.js';
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
        .command('article')
        .description('Post a long-form X article (Premium long post, up to 25k chars)')
        .argument('[text]', 'Article body (or use --file)')
        .option('-f, --file <path>', 'Read article body from a file (e.g. a markdown post)')
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
            console.error(`${ctx.p('err')}Article body is empty. Provide <text> or --file <path>.`);
            process.exit(1);
        }
        if (body.length > 25000) {
            console.error(`${ctx.p('err')}Article body is ${body.length} chars; X limit is 25000.`);
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
        console.error(`${ctx.p('info')}Posting article (${body.length} chars)…`);
        const client = new TwitterClient({ cookies, timeoutMs, quoteDepth });
        const mediaIds = await uploadMediaOrExit(client, media, ctx);
        const result = await client.noteTweet(body, mediaIds);
        if (result.success) {
            console.log(`${ctx.p('ok')}Article posted successfully!`);
            console.log(formatTweetUrlLine(result.tweetId, ctx.getOutput()));
        }
        else {
            console.error(`${ctx.p('err')}Failed to post article: ${result.error}`);
            process.exit(1);
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
