import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import type { CookieSource } from '../lib/cookies.js';

type CheckOptions = {
    chromeProfile?: string;
    chromeProfileDir?: string;
    cookieSource?: CookieSource[];
};

type ChromeDiagnostic = {
    cookieDbPath: string | null;
    keychainWarning: string | null;
    isSsh: boolean;
    isTmux: boolean;
};

function formatPathForDisplay(filePath: string): string {
    const home = homedir();
    return filePath.startsWith(`${home}${path.sep}`) ? `~${filePath.slice(home.length)}` : filePath;
}

function safeIsDirectory(filePath: string): boolean {
    try {
        return statSync(filePath).isDirectory();
    }
    catch {
        return false;
    }
}

function firstExistingPath(candidates: string[]): string | null {
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveChromeCookieDbPath(chromeProfile?: string): string | null {
    const roots = [path.join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome')];
    if (chromeProfile) {
        const expanded = chromeProfile.startsWith('~') ? path.join(homedir(), chromeProfile.slice(1)) : chromeProfile;
        if (expanded.endsWith('Cookies') && existsSync(expanded)) {
            return expanded;
        }
        if (safeIsDirectory(expanded)) {
            return firstExistingPath([path.join(expanded, 'Network', 'Cookies'), path.join(expanded, 'Cookies')]);
        }
        return firstExistingPath(roots.flatMap((root) => [
            path.join(root, expanded, 'Network', 'Cookies'),
            path.join(root, expanded, 'Cookies'),
        ]));
    }
    return firstExistingPath(roots.flatMap((root) => [
        path.join(root, 'Default', 'Network', 'Cookies'),
        path.join(root, 'Default', 'Cookies'),
    ]));
}

function buildChromeDiagnostic(opts: CheckOptions, warnings: string[], ctx: CliContext): ChromeDiagnostic | null {
    if (process.platform !== 'darwin') {
        return null;
    }
    const cookieSources = opts.cookieSource?.map((source) => source.toLowerCase()) ?? [];
    const configSources = Array.isArray(ctx.config.cookieSource)
        ? ctx.config.cookieSource
        : typeof ctx.config.cookieSource === 'string'
            ? [ctx.config.cookieSource]
            : [];
    const effectiveSources = cookieSources.length > 0 ? cookieSources : configSources;
    const checksChrome = effectiveSources.length === 0 || effectiveSources.includes('chrome');
    const chromeWarning = warnings.find((warning) => warning.includes('Chrome Safe Storage') || warning.includes('No Twitter cookies found in Chrome'));
    if (!checksChrome || !chromeWarning) {
        return null;
    }
    const chromeProfile = opts.chromeProfileDir || opts.chromeProfile || ctx.config.chromeProfileDir || ctx.config.chromeProfile;
    return {
        cookieDbPath: resolveChromeCookieDbPath(chromeProfile),
        keychainWarning: warnings.find((warning) => warning.includes('Chrome Safe Storage')) ?? null,
        isSsh: Boolean(process.env.SSH_CONNECTION || process.env.SSH_TTY),
        isTmux: Boolean(process.env.TMUX),
    };
}

function printChromeDiagnostic(diag: ChromeDiagnostic, ctx: CliContext): void {
    console.log(`\n${ctx.p('info')}Chrome diagnostics:`);
    console.log(`   - Cookie DB: ${diag.cookieDbPath ? `found ${formatPathForDisplay(diag.cookieDbPath)}` : 'not found'}`);
    if (diag.keychainWarning) {
        console.log(`   - Keychain: blocked (${diag.keychainWarning})`);
    }
    else {
        console.log('   - Keychain: no Chrome Safe Storage error reported');
    }
    if (diag.isSsh || diag.isTmux) {
        const session = [diag.isSsh ? 'SSH' : null, diag.isTmux ? 'tmux' : null].filter(Boolean).join(' + ');
        console.log(`   - Session: ${session}`);
    }
    if (diag.keychainWarning && (diag.isSsh || diag.isTmux)) {
        console.log('   - Fix: start tmux from a GUI Terminal/iTerm session, approve Chrome Safe Storage, then rerun check');
    }
}

export function registerCheckCommand(program: Command, ctx: CliContext): void {
    program
        .command('check')
        .description('Check credential availability')
        .action(async () => {
        const opts = program.opts<CheckOptions>();
        const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);
        console.log(`${ctx.p('info')}Credential check`);
        console.log('─'.repeat(40));
        if (cookies.authToken) {
            console.log(`${ctx.p('ok')}auth_token: ${cookies.authToken.slice(0, 10)}...`);
        }
        else {
            console.log(`${ctx.p('err')}auth_token: not found`);
        }
        if (cookies.ct0) {
            console.log(`${ctx.p('ok')}ct0: ${cookies.ct0.slice(0, 10)}...`);
        }
        else {
            console.log(`${ctx.p('err')}ct0: not found`);
        }
        if (cookies.source) {
            console.log(`${ctx.l('source')}${cookies.source}`);
        }
        if (warnings.length > 0) {
            console.log(`\n${ctx.p('warn')}Warnings:`);
            for (const warning of warnings) {
                console.log(`   - ${warning}`);
            }
        }
        const chromeDiagnostic = buildChromeDiagnostic(opts, warnings, ctx);
        if (chromeDiagnostic) {
            printChromeDiagnostic(chromeDiagnostic, ctx);
        }
        if (cookies.authToken && cookies.ct0) {
            console.log(`\n${ctx.p('ok')}Ready to tweet!`);
        }
        else {
            console.log(`\n${ctx.p('err')}Missing credentials. Options:`);
            console.log('   1. Login to x.com in Safari/Chrome/Firefox');
            console.log('   2. Set AUTH_TOKEN and CT0 environment variables');
            console.log('   3. Use --auth-token and --ct0 flags');
            process.exit(1);
        }
    });
}
