# slash-x

Edi's local X/Twitter CLI for tweeting, replying, reading, searching, timelines, bookmarks, and account checks.

The command name is `slash`.

## Install

Requires Node.js 22+.

```bash
cd ~/Projects/slash-x
npm install
npm link
slash --help
```

No npm publish needed. `npm link` exposes the local `slash` binary on PATH.

## Common Commands

```bash
slash whoami
slash check
slash read <tweet-id-or-url>
slash <tweet-id-or-url> --json
slash thread <tweet-id-or-url>
slash replies <tweet-id-or-url>
slash search "from:hasajedi" -n 5
slash mentions -n 5
slash user-tweets @hasajedi -n 20
slash bookmarks -n 20
slash likes -n 20
slash tweet "hello from slash"
slash reply <tweet-id-or-url> "nice thread"
slash query-ids --fresh
```

## Auth

`slash` uses X/Twitter cookies. Credential priority:

1. Flags: `--auth-token`, `--ct0`
2. Env: `AUTH_TOKEN`, `CT0`, `TWITTER_AUTH_TOKEN`, `TWITTER_CT0`
3. Browser cookies: Chrome, Safari, Firefox

Edi's default local config prefers Chrome:

```json5
{
  cookieSource: ["chrome"],
  cookieTimeoutMs: 15000,
}
```

Useful browser flags:

```bash
slash --cookie-source chrome --cookie-timeout 15000 whoami
slash --cookie-source chrome --chrome-profile "Default" --cookie-timeout 15000 whoami
slash --cookie-source safari whoami
slash --cookie-source firefox --firefox-profile default-release whoami
```

## Config

Global config:

```text
~/.config/slash-x/config.json5
```

Project config:

```text
./.slashrc.json5
```

Example:

```json5
{
  cookieSource: ["chrome"],
  chromeProfile: "Default",
  timeoutMs: 20000,
  cookieTimeoutMs: 15000,
  quoteDepth: 1,
}
```

Env knobs:

```text
SLASH_TIMEOUT_MS
SLASH_COOKIE_TIMEOUT_MS
SLASH_QUOTE_DEPTH
SLASH_QUERY_IDS_CACHE
SLASH_FEATURES_CACHE
SLASH_FEATURES_PATH
SLASH_FEATURES_JSON
SLASH_DEBUG
SLASH_DEBUG_JSON
SLASH_DEBUG_ARTICLE
SLASH_DEBUG_BOOKMARKS
```

## Notes

- Open source on GitHub, installed locally with `npm link`.
- Uses browser cookie auth against X/Twitter web APIs.
- Chrome cookie extraction is patched locally for slower macOS Keychain reads and Node 22 sqlite bigint support.
- See `NOTICE.md` for required third-party license attribution.
