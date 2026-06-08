<p align="center">
  <img src="assets/logo.png" alt="slash-x logo" width="160" />
</p>

<h1 align="center">slash-x</h1>

<p align="center">
  Edi's local X/Twitter CLI — post, read, search, follow, list, and publish long-form Articles. The command name is <code>slash</code>.
</p>

## Install

### Homebrew (recommended)

```bash
brew install edihasaj/tap/slash-x
slash --help
```

Tap: <https://github.com/edihasaj/homebrew-tap>. Tagged releases auto-publish a Node-backed formula.

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
# Identity & health
slash whoami
slash check

# Reading
slash read <tweet-id-or-url>
slash <tweet-id-or-url> --json
slash thread <tweet-id-or-url>
slash replies <tweet-id-or-url>
slash search "from:hasajedi" -n 5
slash mentions -n 5
slash user-tweets @hasajedi -n 20      # article tweets show full body inline
slash bookmarks -n 20
slash likes -n 20

# Posting (namespace + flat aliases — both forms work)
slash post tweet "hello from slash-x"
slash tweet "hello from slash-x"
slash post reply <tweet-id-or-url> "nice thread"
slash reply <tweet-id-or-url> "nice thread"

# Repost & quote
slash repost <tweet-id-or-url>             # alias: slash retweet
slash repost <tweet-id-or-url> --undo      # remove your repost
slash quote <tweet-id-or-url> "my take"    # quote-tweet (supports --media)

# Discovery
slash trending -n 10                    # alias: slash news

# Maintenance
slash query-ids --fresh
```

## Long-form & Articles

slash-x can publish two flavors of long-form post on X (Premium account required):

```bash
# Long post (CreateNoteTweet) — Premium, plain text, up to 25k chars
slash long --file ./essay.txt
slash long "a single really long thought"

# Real X Article (Premium+) — Draft.js body via ArticleEntity mutations
# Title auto-extracted from the first `# heading` of the markdown
slash article --file ./posts/security-in-the-age-of-ai-coders.md
slash article "body markdown..." --title "Custom title"

# Stage a draft (create + title + body) without publishing — review in X drafts
slash article --file ./essay.md --draft

# Dry-run the markdown → Draft.js content_state conversion (no network)
slash article --file ./essay.md --dry-run

# Control visibility and reply policy
slash article --file ./essay.md --visibility Public --conversation ByInvitation

# Browse your own articles (or someone else's)
slash articles                          # your published articles
slash articles @hasajedi -n 50
```

Supported markdown for `slash article`: paragraphs, `#`/`##`/`###` headings, `>` blockquotes, `-`/`1.` lists. YAML frontmatter is stripped automatically.

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

Troubleshooting Chrome from SSH/tmux:

```bash
slash check
```

If Chrome cookies exist but macOS Keychain reports `Chrome Safe Storage` as blocked, start tmux from a GUI Terminal/iTerm session and approve the Keychain prompt, or use `AUTH_TOKEN` and `CT0` env vars for remote sessions.

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
  commands/              # one file per command (incl. articles)
  twitter/               # GraphQL client (mixin cluster) — articles, posting, timelines, …
  lib/                   # cookies, output, markdown→draftjs, paginate-cursor, …
  lib/extract/           # ID extractors
  runtime/               # query-ids + features refresh
  data/                  # baked-in JSON (query-ids, features)
```

`tsc` builds to `dist/`; `bin: dist/cli.js` is what `slash` resolves to.

## Release

Tag `vX.Y.Z` and push:

```bash
git tag v1.2.0
git push origin v1.2.0
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

Edi Hasaj (<https://edihasaj.com>)
