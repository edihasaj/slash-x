import { Command } from 'commander';
import { registerBookmarksCommand } from '../commands/bookmarks.js';
import { registerCheckCommand } from '../commands/check.js';
import { registerFollowCommands } from '../commands/follow.js';
import { registerHelpCommand } from '../commands/help.js';
import { registerHomeCommand } from '../commands/home.js';
import { registerListsCommand } from '../commands/lists.js';
import { registerNewsCommand } from '../commands/news.js';
import { registerPostCommands } from '../commands/post.js';
import { registerQueryIdsCommand } from '../commands/query-ids.js';
import { registerReadCommands } from '../commands/read.js';
import { registerSearchCommands } from '../commands/search.js';
import { registerUnbookmarkCommand } from '../commands/unbookmark.js';
import { registerUserTweetsCommand } from '../commands/user-tweets.js';
import { registerUserCommands } from '../commands/users.js';
import { getCliVersion } from '../lib/version.js';
import { collectCookieSource } from './shared.js';
export const KNOWN_COMMANDS = new Set([
    'post',
    'tweet',
    'reply',
    'query-ids',
    'read',
    'replies',
    'thread',
    'search',
    'mentions',
    'bookmarks',
    'unbookmark',
    'follow',
    'unfollow',
    'following',
    'followers',
    'likes',
    'lists',
    'list-timeline',
    'home',
    'user-tweets',
    'trending',
    'news',
    'help',
    'whoami',
    'check',
    'about',
]);
export function createProgram(ctx) {
    const program = new Command();
    program.configureHelp({
        showGlobalOptions: true,
        styleTitle: (t) => ctx.colors.section(t),
        styleUsage: (t) => ctx.colors.description(t),
        styleCommandText: (t) => ctx.colors.command(t),
        styleCommandDescription: (t) => ctx.colors.muted(t),
        styleOptionTerm: (t) => ctx.colors.option(t),
        styleOptionText: (t) => ctx.colors.option(t),
        styleOptionDescription: (t) => ctx.colors.muted(t),
        styleArgumentTerm: (t) => ctx.colors.argument(t),
        styleArgumentText: (t) => ctx.colors.argument(t),
        styleArgumentDescription: (t) => ctx.colors.muted(t),
        styleSubcommandTerm: (t) => ctx.colors.command(t),
        styleSubcommandText: (t) => ctx.colors.command(t),
        styleSubcommandDescription: (t) => ctx.colors.muted(t),
        styleDescriptionText: (t) => ctx.colors.muted(t),
    });
    const collect = (value, previous = []) => {
        previous.push(value);
        return previous;
    };
    program.addHelpText('beforeAll', () => `${ctx.colors.banner('slash-x')} ${ctx.colors.muted(getCliVersion())} ${ctx.colors.subtitle("— Edi's local X/Twitter CLI")}`);
    program.name('slash').description("Edi's local X/Twitter CLI — post, read, search, follow, list").version(`slash-x ${getCliVersion()}`, '-V, --version', 'output the version number');
    const formatExample = (command, description) => `${ctx.colors.command(`  ${command}`)}\n${ctx.colors.muted(`    ${description}`)}`;
    const groupedHelp = () => {
        const groups = [
            { title: 'Writing', lines: ['post tweet <text>          Post a new tweet (alias: tweet)', 'post reply <id> <text>     Reply to a tweet (alias: reply)'] },
            { title: 'Reading', lines: ['read <id-or-url>           Read a tweet', 'thread <id-or-url>         Show full conversation', 'replies <id-or-url>        List replies'] },
            { title: 'Discovery', lines: ['search <query>             Search tweets', 'mentions                   Tweets mentioning you', 'trending                   Trending + AI-curated news (alias: news)'] },
            { title: 'Feeds', lines: ['home                       Your "For You" timeline', 'bookmarks                  Your bookmarks', 'likes                      Your likes'] },
            { title: 'Users', lines: ['follow <user>              Follow a user', 'unfollow <user>            Unfollow a user', 'following [user]           Who you/they follow', 'followers [user]           Who follows you/them', 'user-tweets <handle>       Tweets from a profile', 'about <user>               Account origin & info'] },
            { title: 'Lists', lines: ['lists                      Your lists', 'list-timeline <id-or-url>  Tweets from a list', 'unbookmark <id...>         Remove bookmarks'] },
            { title: 'Account', lines: ['whoami                     Logged-in account', 'check                      Credential availability'] },
            { title: 'Maintenance', lines: ['query-ids [--fresh]        Show/refresh GraphQL query IDs'] },
        ];
        return `\n${groups
            .map((g) => `${ctx.colors.section(g.title)}\n${g.lines.map((l) => {
            const [cmd, ...rest] = l.split(/\s{2,}/);
            const desc = rest.join('  ');
            return `  ${ctx.colors.command((cmd ?? '').padEnd(28))}${ctx.colors.muted(desc)}`;
        }).join('\n')}`)
            .join('\n\n')}`;
    };
    program.addHelpText('afterAll', () => `${groupedHelp()}\n\n${ctx.colors.section('Examples')}\n${[
        formatExample('slash whoami', 'Show the logged-in X/Twitter account'),
        formatExample('slash post tweet "hello from slash-x"', 'Post a tweet via the post namespace'),
        formatExample('slash tweet "hello from slash-x"', 'Same — flat alias still works'),
        formatExample('slash 1234567890123456789 --json', 'Tweet ID/URL shorthand reads the tweet as JSON'),
        formatExample('slash --firefox-profile default-release whoami', 'Pick a specific browser profile for cookie auth'),
    ].join('\n\n')}\n\n${ctx.colors.section('Shortcuts')}\n${[
        formatExample('slash <tweet-id-or-url> [--json]', 'Shorthand for `slash read <tweet-id-or-url>`'),
    ].join('\n\n')}\n\n${ctx.colors.section('JSON Output')}\n${ctx.colors.muted(`  Add ${ctx.colors.option('--json')} to: read, replies, thread, search, mentions, bookmarks, likes, following, followers, about, lists, list-timeline, user-tweets, query-ids`)}\n${ctx.colors.muted(`  Add ${ctx.colors.option('--json-full')} to include raw API response in ${ctx.colors.argument('_raw')} field (tweet commands only)`)}\n${ctx.colors.muted(`  (Run ${ctx.colors.command('slash <command> --help')} to see per-command flags.)`)}`);
    program.addHelpText('afterAll', () => `\n\n${ctx.colors.section('Config')}\n${ctx.colors.muted(`  Reads ${ctx.colors.argument('~/.config/slash-x/config.json5')} and ${ctx.colors.argument('./.slashrc.json5')} (JSON5)`)}\n${ctx.colors.muted(`  Supports: chromeProfile, chromeProfileDir, firefoxProfile, cookieSource, cookieTimeoutMs, timeoutMs, quoteDepth`)}\n\n${ctx.colors.section('Env')}\n${ctx.colors.muted(`  ${ctx.colors.option('NO_COLOR')}, ${ctx.colors.option('SLASH_TIMEOUT_MS')}, ${ctx.colors.option('SLASH_COOKIE_TIMEOUT_MS')}, ${ctx.colors.option('SLASH_QUOTE_DEPTH')}`)}`);
    program
        .option('--auth-token <token>', 'Twitter auth_token cookie')
        .option('--ct0 <token>', 'Twitter ct0 cookie')
        .option('--chrome-profile <name>', 'Chrome profile name for cookie extraction', ctx.config.chromeProfile)
        .option('--chrome-profile-dir <path>', 'Chrome/Chromium profile directory or cookie DB path for cookie extraction', ctx.config.chromeProfileDir)
        .option('--firefox-profile <name>', 'Firefox profile name for cookie extraction', ctx.config.firefoxProfile)
        .option('--cookie-timeout <ms>', 'Cookie extraction timeout in milliseconds (keychain/OS helpers)')
        .option('--cookie-source <source>', 'Cookie source for browser cookie extraction (repeatable)', collectCookieSource)
        .option('--media <path>', 'Attach media file (repeatable, up to 4 images or 1 video)', collect)
        .option('--alt <text>', 'Alt text for the corresponding --media (repeatable)', collect)
        .option('--timeout <ms>', 'Request timeout in milliseconds')
        .option('--quote-depth <depth>', 'Max quoted tweet depth (default: 1; 0 disables)')
        .option('--plain', 'Plain output (stable, no emoji, no color)')
        .option('--no-emoji', 'Disable emoji output')
        .option('--no-color', 'Disable ANSI colors (or set NO_COLOR)');
    program.hook('preAction', (_thisCommand, actionCommand) => {
        ctx.applyOutputFromCommand(actionCommand);
    });
    registerHelpCommand(program, ctx);
    registerQueryIdsCommand(program, ctx);
    registerPostCommands(program, ctx);
    registerReadCommands(program, ctx);
    registerSearchCommands(program, ctx);
    registerBookmarksCommand(program, ctx);
    registerUnbookmarkCommand(program, ctx);
    registerFollowCommands(program, ctx);
    registerListsCommand(program, ctx);
    registerHomeCommand(program, ctx);
    registerUserCommands(program, ctx);
    registerUserTweetsCommand(program, ctx);
    registerNewsCommand(program, ctx);
    registerCheckCommand(program, ctx);
    const post = program.command('post').description('Post tweets and replies (subcommands: tweet, reply)');
    registerPostCommands(post, ctx, program);
    return program;
}
//# sourceMappingURL=program.js.map