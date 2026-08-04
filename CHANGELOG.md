# Changelog

All notable changes to this package are logged here, newest first. Bump
`package.json`'s `"version"` and `src/version.js`'s `SHARED_UI_VERSION` together
whenever you add an entry — that pair is how a consuming app can tell exactly which
build it's actually running (see README "Versioning").

Every consuming app pins this package by git commit SHA, not semver — after
publishing a new version here, remember to bump the pin in **every** consumer
(`mini_site/package.json` AND `admin_client (EKZ/new_admin)/package.json`), not just
the one you're actively working on. Forgetting one leaves it silently rendering a
stale build with no error — check its installed version against this file with
`grep '"version"' node_modules/stappie-shared-ui/package.json`.

## 0.3.0 — 2026-08-04

Retrieval tuning/diagnostics escape hatch for `ChatInterface`, built for
admin_client's AI Search tuning panel (mirrors Cloudflare's own AI Search
playground):

- `ChatInterface` is now wrapped in `forwardRef`. Passing a `ref` is optional and has
  no effect on mini_site's usage — only a caller that explicitly attaches one gets
  anything from it.
- New `retrievalOverrides` prop — merged into `ai_search_options.retrieval` on every
  request (e.g. `max_num_results`, `match_threshold`). `filters` is never overridable
  this way; the hardcoded `public/`-only retrieval scope always wins (see the
  module's SECURITY note).
- New `onSearchChunks` prop — called with the raw retrieved chunks (score + metadata)
  after each turn, for a caller that wants to inspect/display them beyond the curated
  source cards this component already shows.
- New `ref.resendLastQuery()` — re-sends the last user message as a new turn, so a
  tuning panel can adjust `retrievalOverrides` and replay without the person retyping,
  leaving both attempts visible in the transcript for comparison.

## 0.2.0 — 2026-08-04

First versioned release. Retroactively covers everything shipped since the last
`package.json` bump (`0.1.0`), all previously untracked:

- **Pilot chat-log recording** — `chatLoggingEnabled` / `chatLogEndpoint` props on
  `ChatInterface`; each completed exchange is POSTed fire-and-forget (never awaited,
  `keepalive: true`), so a logging failure can never affect the chat UI.
- **Per-widget logging control** — `chatLoggingEnabled` is resolved entirely by the
  consuming app per widget instance (no implicit region-wide meaning inside this
  package).
- **Chat-logging disclaimer + session opt-out** — when logging is on, the disclaimer
  grows a notice and an opt-out link/modal; confirming sets a session-wide
  `sessionStorage` flag that silences logging for every logging-enabled widget on the
  page for the rest of the browser tab.
- **CMS-configurable extra system prompt** — new `systemPrompt` prop, appended to the
  chat's system message (see `buildSystemMessage`).
- **Language-aware replies** — the system message now asks the model to reply in
  whatever language the person is actually writing in, falling back to `languageName`
  only when that can't be confidently determined (previously always forced
  `languageName`).
- Added the 7 new logging-related strings to all 11 `CHAT_STRINGS` languages plus the
  English `DEFAULT_STRINGS` fallback.
- Exported `SHARED_UI_VERSION` (this changelog's versioning).

## 0.1.0

Baseline — chat UI (streaming, source citations, intake form, conversation starters),
`DynamicContentGrid`, `STARTER_ICONS`, `CHAT_STRINGS`. See git history for the
individual (unversioned) commits that built up to this point.
