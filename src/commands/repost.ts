import type { Command } from 'commander';
import type { CliContext, MediaSpec } from '../cli/shared.js';
import { extractTweetId } from '../lib/extract/tweet-id.js';
import { formatTweetUrl, formatTweetUrlLine } from '../lib/output.js';
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
async function resolveClientOrExit(ctx: CliContext, opts: Record<string, unknown>): Promise<TwitterClient> {
    const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
    const quoteDepth = ctx.resolveQuoteDepthFromOptions(opts);
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
    return new TwitterClient({ cookies, timeoutMs, quoteDepth });
}
export function registerRepostCommands(parent: Command, ctx: CliContext, root?: Command): void {
    const optsSource = root ?? parent;
    parent
        .command('repost')
        .aliases(['retweet'])
        .description('Repost (retweet) a tweet; use --undo to remove your repost')
        .argument('<id-or-url>', 'Tweet ID or URL to repost')
        .option('--undo', 'Remove an existing repost instead of creating one')
        .action(async (idOrUrl: string, cmdOpts: { undo?: boolean }) => {
        const opts = optsSource.opts();
        const tweetId = extractTweetId(idOrUrl);
        const client = await resolveClientOrExit(ctx, opts);
        const result = cmdOpts.undo ? await client.unretweet(tweetId) : await client.retweet(tweetId);
        if (result.success) {
            console.log(`${ctx.p('ok')}${cmdOpts.undo ? 'Repost removed' : 'Reposted'} successfully!`);
            console.log(formatTweetUrlLine(tweetId, ctx.getOutput()));
        }
        else {
            console.error(`${ctx.p('err')}Failed to ${cmdOpts.undo ? 'remove repost' : 'repost'}: ${result.error}`);
            process.exit(1);
        }
    });
    parent
        .command('quote')
        .description('Quote-tweet (repost with your own comment)')
        .argument('<id-or-url>', 'Tweet ID or URL to quote')
        .argument('<text>', 'Your comment')
        .action(async (idOrUrl: string, text: string) => {
        const opts = optsSource.opts();
        const tweetId = extractTweetId(idOrUrl);
        let media: MediaSpec[] = [];
        try {
            media = ctx.loadMedia({ media: opts.media ?? [], alts: opts.alt ?? [] });
        }
        catch (error) {
            console.error(`${ctx.p('err')}${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
        const client = await resolveClientOrExit(ctx, opts);
        const mediaIds = await uploadMediaOrExit(client, media, ctx);
        const result = await client.tweet(text, mediaIds, { attachmentUrl: formatTweetUrl(tweetId) });
        if (result.success) {
            console.log(`${ctx.p('ok')}Quote posted successfully!`);
            console.log(formatTweetUrlLine(result.tweetId, ctx.getOutput()));
        }
        else {
            console.error(`${ctx.p('err')}Failed to post quote: ${result.error}`);
            process.exit(1);
        }
    });
}
