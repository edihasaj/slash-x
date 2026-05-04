# slash-x

Edi's local X/Twitter CLI — post, read, search, follow, list.

The command name is `slash`.

## Install

### Homebrew (recommended)

```bash
brew install edihasaj/tap/slash-x
slash --help
```

Tap: <https://github.com/edihasaj/homebrew-tap>. Releases publish a Node-based formula automatically when tagged.

### From source (Node.js 22+)

```bash
git clone https://github.com/edihasaj/slash-x.git
cd slash-x
npm install
npm run build
npm link
slash --help
```

Source lives in `src/`; `npm run build` runs `tsc` and emits `dist/`. Use `npm run build:watch` while iterating.

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

# Posting (namespace + flat aliases — both forms work)
slash post tweet "hello from slash-x"
slash tweet "hello from slash-x"
slash post reply <tweet-id-or-url> "nice thread"
slash reply <tweet-id-or-url> "nice thread"

slash trending -n 10        # alias: slash news
slash query-ids --fresh
```

## Auth

`slash` uses X/Twitter cookies. Credential priority:

1. Flags: `--auth-token`, `--ct0`
2. Env: `AUTH_TOKEN`, `CT0`, `TWITTER_AUTH_TOKEN`, `TWITTER_CT0`
3. Browser cookies: Chrome, Safari, Firefox

Default local config prefers Chrome:

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

## Project Layout

```
src/
  cli.ts                 # entry
  cli/                   # program, shared, pagination
  commands/              # one file per command
  twitter/               # GraphQL client (mixin cluster)
  lib/                   # cookies, output, paginate-cursor, etc.
  lib/extract/           # ID extractors
  runtime/               # query-ids + features refresh
  data/                  # baked-in JSON (query-ids, features)
```

`tsc` builds to `dist/`; `bin: dist/cli.js` is what `slash` resolves to.

## Release

Tag `vX.Y.Z` and push:

```bash
git tag v0.9.0
git push origin v0.9.0
```

The `Release` workflow:

1. Builds `dist/`
2. Packs a tarball (`dist/`, `vendor/`, `package.json`, lockfile, docs)
3. Creates a GitHub release and uploads the tarball + `.sha256`
4. Renders `Formula/slash-x.rb` and pushes it to `edihasaj/homebrew-tap` (requires `HOMEBREW_TAP_GITHUB_TOKEN` repo secret)

The local formula template lives at `packaging/homebrew/Formula/slash-x.rb.template`.

## Notes

- Open source on GitHub; Homebrew formula is the supported install path.
- Uses browser cookie auth against X/Twitter web APIs.
- Chrome cookie extraction is patched locally for slower macOS Keychain reads and Node 22 sqlite bigint support.
- See `NOTICE.md` for required third-party license attribution.

## Author

Edi Hasaj <edihasaj@gmail.com> (https://github.com/edihasaj)
