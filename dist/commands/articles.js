import { parsePositiveIntFlag } from '../cli/pagination.js';
import { normalizeHandle } from '../lib/normalize-handle.js';
import { TwitterClient } from '../twitter/client.js';
export function registerArticlesCommand(program, ctx) {
    const formatExample = (cmd, desc) => `  ${ctx.colors.command(cmd)}\n    ${ctx.colors.muted(desc)}`;
    program
        .command('articles')
        .description("List a user's published X Articles (defaults to you)")
        .argument('[handle]', "Username (e.g. @hasajedi); omit to list your own articles")
        .option('-n, --count <number>', 'Number of articles to fetch', '20')
        .option('--cursor <string>', 'Resume pagination from a cursor')
        .option('--json', 'Output as JSON')
        .option('--json-full', 'Output as JSON with full raw API response in _raw field')
        .addHelpText('after', () => `\n${ctx.colors.section('Command Examples')}\n${[
        formatExample('slash articles', 'List your own articles'),
        formatExample('slash articles @hasajedi', "List a user's articles"),
        formatExample('slash articles @hasajedi -n 50 --json', '50 articles as JSON'),
        formatExample('slash articles --cursor "DAABCg..."', 'Resume from cursor'),
    ].join('\n')}`)
        // biome-ignore lint/suspicious/noExplicitAny: cmd opts shape
        .action(async (handle, cmdOpts) => {
        const opts = program.opts();
        const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
        const quoteDepth = ctx.resolveQuoteDepthFromOptions(opts);
        const countParsed = parsePositiveIntFlag(cmdOpts.count, '--count');
        if (!countParsed.ok) {
            console.error(`${ctx.p('err')}${countParsed.error}`);
            process.exit(2);
        }
        const count = countParsed.value ?? 20;
        const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);
        for (const warning of warnings) {
            console.error(`${ctx.p('warn')}${warning}`);
        }
        if (!cookies.authToken || !cookies.ct0) {
            console.error(`${ctx.p('err')}Missing required credentials`);
            process.exit(1);
        }
        const client = new TwitterClient({ cookies, timeoutMs, quoteDepth });
        let userId;
        let displayName = '';
        if (handle) {
            const username = normalizeHandle(handle);
            if (!username) {
                console.error(`${ctx.p('err')}Invalid handle: ${handle}`);
                process.exit(2);
            }
            console.error(`${ctx.p('info')}Looking up @${username}...`);
            const lookup = await client.getUserIdByUsername(username);
            if (!lookup.success || !lookup.userId) {
                console.error(`${ctx.p('err')}${lookup.error || `Could not find user @${username}`}`);
                process.exit(1);
            }
            userId = lookup.userId;
            displayName = lookup.name ? `${lookup.name} (@${lookup.username})` : `@${lookup.username}`;
        }
        else {
            const me = await client.getCurrentUser();
            if (!me.success || !me.user?.id) {
                console.error(`${ctx.p('err')}Could not resolve current user: ${me.error ?? 'unknown error'}`);
                process.exit(1);
            }
            userId = me.user.id;
            displayName = me.user.username ? `@${me.user.username}` : 'you';
        }
        console.error(`${ctx.p('info')}Fetching articles from ${displayName}...`);
        const includeRaw = cmdOpts.jsonFull ?? false;
        const result = await client.getUserArticles(userId, { count, cursor: cmdOpts.cursor, includeRaw });
        if (!result.success) {
            console.error(`${ctx.p('err')}Failed to fetch articles: ${result.error}`);
            process.exit(1);
        }
        const isJson = Boolean(cmdOpts.json || cmdOpts.jsonFull);
        ctx.printTweetsResult(result, {
            json: isJson,
            usePagination: Boolean(cmdOpts.cursor) || count > 20,
            emptyMessage: `No articles found for ${displayName}.`,
        });
        if (result.nextCursor && !isJson) {
            console.error(`${ctx.p('info')}More articles available. Use --cursor "${result.nextCursor}" to continue.`);
        }
    });
}
//# sourceMappingURL=articles.js.map