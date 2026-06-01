# Changelog

## 1.3.0

- Homebrew formula no longer declares `depends_on "node"`. The release tarball already bundles its own `node_modules`, and the `slash` wrapper now runs whatever `node` is on your PATH (e.g. an nvm-managed runtime). Installing slash-x no longer pulls a second Node runtime onto the machine, avoiding native-module ABI clashes with other toolchains.
- Docs: added the slash-x logo and documented `slash article`, `slash articles`, and `slash long` in the README.

## 1.2.0

- Added `slash article` for publishing real X Articles (Premium+). Drives the four-step `ArticleEntityDraftCreate` → `ArticleEntityUpdateTitle` → `ArticleEntityUpdateContent` → `ArticleEntityPublish` pipeline against x.com's GraphQL endpoints, with `--title`, `--visibility`, `--conversation`, `--draft`, and `--dry-run` flags.
- Added `slash articles [user]` for listing a user's published X Articles (defaults to the current user). Uses the existing `UserArticlesTweets` query and reuses the standard timeline renderer.
- `slash user-tweets` now enables `withArticlePlainText` / `withArticleRichContentState` so article tweets surface their title and rich body inline instead of appearing as empty entries.
- Added a markdown → Draft.js content_state converter (`src/lib/markdown-to-draftjs.ts`) supporting paragraphs, `#`/`##`/`###` headings, `>` blockquotes, and `-`/`1.` lists; also strips YAML frontmatter and auto-extracts a title from the first `# heading` when one isn't passed.
- Renamed the v1.1.0 `slash article` (CreateNoteTweet long post) to `slash long` / `slash post long`, since `article` is now the rich Article path.
- Added a new `TwitterClientArticles` mixin and corresponding query IDs / features so the existing query-id refresh keeps the article mutations in sync with x.com bundles.

## 1.1.0

- Added `slash article` (and `slash post article`) for posting long-form X articles via the `CreateNoteTweet` GraphQL mutation. Premium subscribers can post up to 25,000 characters, with `--file` for reading the body from disk and `--media` for attaching a lead image.
- `createTweet` mutation caller is parameterized by operation name; response parser handles both `create_tweet` and `notetweet_create` result branches.
- `CreateNoteTweet` queryId added to discovery list and fallback table, so cache refresh keeps it in sync with x.com client bundles.

## 1.0.0

First stable release. Drops the `-local.*` pre-release line; future versions follow standard semver from here.

- TypeScript source tree under `src/`; `tsc` emits `dist/`. `dist/` is the built artifact, source-of-truth lives in `src/`.
- Reorganized internals: `twitter-client-*` consolidated into `src/twitter/` (prefix dropped), runtime helpers in `src/runtime/`, JSON data in `src/data/`, ID extractors in `src/lib/extract/`.
- Added `slash post tweet|reply` namespace; flat `slash tweet` / `slash reply` retained as aliases.
- Flipped `slash news` → `slash trending` as primary; `news` kept as alias.
- `slash --version` now prefixes "slash-x" for parity with `brew test`.
- Reworked `slash --help` with section groups (Writing/Reading/Discovery/Feeds/Users/Lists/Account/Maintenance) and updated banner.
- Homebrew formula installable via `brew install edihasaj/tap/slash-x`. Release workflow builds runtime tarball (with bundled prod `node_modules`) and publishes to `edihasaj/homebrew-tap` on tag.
- Fixed `slash lists` and `slash list-timeline`: accept partial-success responses where X returns 200 with field-level errors on `default_banner_media_results.result`. Owner `screen_name`/`name` now read from new `user.core` path with `legacy` fallback.

## 0.8.0-local.1

- Rebranded project metadata and docs for Edi's local `slash` CLI.
- Vendored and patched the browser cookie helper under a local package name.
- Prefer Chrome cookies through local config.
- Remove old upstream changelog/provenance noise from user-facing docs.

## 0.8.0-local.0

- Recovered working local X/Twitter CLI runtime.
- Renamed command to `slash`.
- Added local config/cache/env names under `slash-x` / `SLASH_*`.
- Linked the CLI for local use.
