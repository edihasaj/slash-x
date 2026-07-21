#!/usr/bin/env node
// One-time bridge: run this in a REAL Terminal.app window (GUI session) where
// the login keychain is accessible. It extracts your live x.com auth_token +
// ct0 from Chrome (via slash-x's own decryption) and writes them to ~/.profile
// as AUTH_TOKEN / CT0. After that, the headless Claude agent (Background
// launchd session, no keychain) can post via slash-x using those env vars.
//
//   cd ~/Projects/slash-x && node scripts/persist-tokens.mjs
//
// Re-run any time the tokens expire to refresh them.

import { resolveCredentials } from '../dist/lib/cookies.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const source = process.argv[2] || 'chrome';
const { cookies, warnings } = await resolveCredentials({ cookieSource: [source] });

if (!cookies.authToken || !cookies.ct0) {
  console.error(`\n❌ Could not extract tokens from ${source}.`);
  for (const w of warnings) console.error('  ' + w);
  console.error('\nMake sure Chrome is logged into x.com, then re-run.');
  process.exit(1);
}

const profile = join(homedir(), '.profile');
let body = existsSync(profile) ? readFileSync(profile, 'utf8') : '';

// Strip any prior block we wrote, so this is idempotent.
const START = '# >>> slash-x tokens (auto) >>>';
const END = '# <<< slash-x tokens (auto) <<<';
const re = new RegExp(`\\n?${START}[\\s\\S]*?${END}\\n?`, 'g');
body = body.replace(re, '\n');

const block = [
  START,
  `export AUTH_TOKEN=${cookies.authToken}`,
  `export CT0=${cookies.ct0}`,
  END,
  '',
].join('\n');

if (!body.endsWith('\n') && body.length) body += '\n';
writeFileSync(profile, body + block, { mode: 0o600 });

console.log(`\n✅ Wrote AUTH_TOKEN + CT0 to ${profile} (from ${cookies.source}).`);
console.log('   The headless agent can now post via slash-x with no keychain.');
