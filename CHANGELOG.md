# Changelog

All notable changes to this package are logged here, newest first. Bump
`package.json`'s `"version"` whenever you add an entry — `src/version.js`'s
`SHARED_UI_VERSION` is injected from it at build time (see tsup.config.js), not a
second value to remember, so a consuming app can always tell exactly which build
it's actually running (see README "Versioning").

Every consuming app pins this package by git commit SHA, not semver — after
publishing a new version here, remember to bump the pin in **every** consumer
(`mini_site/package.json` AND `admin_client (EKZ/new_admin)/package.json`), not just
the one you're actively working on. Forgetting one leaves it silently rendering a
stale build with no error — check its installed version against this file with
`grep '"version"' node_modules/stappie-shared-ui/package.json`.

## 0.6.6 — 2026-08-27

Two `FilterBar` layout changes, verified visually against real data in the playground:

- The search input now renders **last**, after every user filter — it refines the set
  the filters above have already narrowed down, so it reads as the final, most-specific
  step rather than the first thing shown.
- In horizontal layout, a filter group's own label now sits beside its control
  ("Subregion [dropdown]") instead of stacked above it. Scoped to
  `.sui-dyn-filterbar--horizontal` only — the vertical (sidebar) layout keeps the
  stacked look, and it reverts to stacked again below 480px where there's no room for
  label+control side by side. Mirrored into mini_site's `DynamicBlock.astro` and
  admin_client's `BlockEditorPage.jsx` (its own compact CSS variant) — keep all three in
  sync if this ever changes again.

## 0.6.5 — 2026-08-27

Fixes the actual bug the 0.6.3/0.6.4 filter-label attempts didn't catch: a filterBar
field pointed directly at a populated reference (e.g. bare `"subregion"`, not
`"subregion.id"`) resolved via `getByPath` to the whole nested object, not a scalar —
so the dropdown showed the literal string `"[object Object]"`, and worse,
`applyUserFilters`'s matching logic had the same bug, so selecting an option would
silently never match any item (comparing an id string against `"[object Object]"`).

- New shared `resolveFilterOption(item, field, lang, defaultLang)` — used by both
  `getUniqueValues` (building the option list) and `applyUserFilters` (matching the
  active selection), so the two can no longer disagree. A resolved object's `.id`
  becomes the comparable value, `.name`/`.title` the label.
- Explicitly resolves an unset reference (`null`/`undefined`) and a populated-but-empty
  reference object (`{}`, no id/name/title) to "no option" rather than the literal
  string `"null"`/`"undefined"`, instead of relying on incidental falsy-check fallthrough.
- The `"field.endsWith('.id')"` case from 0.6.3 (a field already pointed at the scalar
  id, recovering its sibling `.name` for the label) is preserved as a second path through
  the same resolver.

## 0.6.4 — 2026-08-27

`SHARED_UI_VERSION` is now injected from `package.json`'s `"version"` at build time
(`tsup.config.js`'s `define`) instead of a second hand-maintained literal in
`src/version.js` — two releases in a row (0.6.2, then 0.6.3's own first attempt) shipped
with that literal stuck on an old value because bumping it was a separate, forgettable
step. There is now only one number to bump.

Adds an opt-in `debug` prop to `DynamicContentGrid` (default `false`, never set true on
the published site): when true, `getUniqueValues` logs the raw top-level value behind
each filterBar field (e.g. `item.subregion`) alongside its resolved option values/labels,
so a filter that isn't showing a resolved reference name can be diagnosed from actual
data shape instead of guessing whether the reference is populated.

## 0.6.3 — 2026-08-27

Dynamic-block filter dropdowns show the referenced entity's name instead of its raw id:

- `getUniqueValues`/`FilterBar` in `DynamicContentGrid.jsx` now resolve a display
  `label` per option — for a filter field ending in `.id` (e.g. `subregion.id`, a
  populated reference — api_server's public API already nests the full referenced
  entity there), it reads the sibling `.name`/`.title` off that same object via the
  existing `getByPath` dot-path accessor. The underlying filter value (and
  `activeFilters` state) is still the raw id — this only changes what's displayed.
- Non-reference filters are unaffected (label falls back to the raw value, same as
  before).

## 0.6.1 — 2026-08-05

Suppresses source cards while the assistant is still asking a clarifying question:

- New `isClarifyingQuestion()` heuristic in `Message` — a turn whose text ends in "?"
  is treated as narrowing-down rather than a final recommendation, so `SourceCard`s
  don't appear until the bot actually gives its answer. Pairs with the CMS-
  configurable instruction (registry.js's `DEFAULT_INSTRUCTIONS`) to ask ONE
  eliminating question instead of listing every retrieved candidate up front — without
  this, all the candidates' contact cards showed up regardless of whether the bot's
  text had narrowed anything down yet.
- No prop/behavior changes for existing consumers — purely internal to `Message`'s
  own rendering.

## 0.6.0 — 2026-08-05

Captures the chat-proxy's internal diagnostics for logging, so the CMS side can see
not just the transcript but how each answer was actually produced:

- `meta` SSE events (previously parsed and discarded) are now merged into a per-turn
  diagnostics object — model actually used, retrieval-confidence bucket, scores, and
  the addendum text the proxy appended, if any. Stored on the assistant message as
  `diag`; stays `undefined` on the direct-to-Cloudflare path, which never sends `meta`.
- `logChatTurn` now also sends `systemPrompt` (the composed base prompt for the most
  recent turn), `settings` (the block's `chatProxySettings` as currently configured),
  and `diagnostics` (one entry per assistant turn, including doc IDs derived from the
  same `chunks` the source cards already render) — all optional, all resent in full
  each turn like `messages` already is. No change for consumers that don't read the
  new fields; the log endpoint (api_server's chatlog_router.js) treats them as
  additive.

## 0.5.0 — 2026-08-04

Graduates the adaptive chat proxy (previously a standalone admin_client experiment)
into a real, opt-in mode of `ChatInterface`:

- New `chatProxyEndpoint`/`chatProxySettings` props — when set, `sendQuery` POSTs to
  the proxy (`{ aiSearchId, messages, systemPrompt, settings }`) instead of calling
  Cloudflare's public `/chat/completions` directly. `null`/unset (the default) is the
  unmodified direct path — zero behavior change for existing consumers.
- The proxy's `status` SSE events (`searching`/`found:N`/`generating`) are now shown
  in place of `strings.thinking` via a new `formatStatus()` helper, so the extra
  retrieval round-trip reads as visible progress rather than a stall. Added
  `statusSearching`/`statusFound`/`statusGenerating` to all 11 `CHAT_STRINGS`
  languages plus `DEFAULT_STRINGS`.
- The proxy's `chunks` event reuses the exact shape/name the direct path already
  emits, so citations (`dedupeSources`/`SourceCard`) work identically either way —
  no changes needed to that code.

## 0.4.0 — 2026-08-04

- New `botName` prop — overrides `strings.assistant` (the speaker label shown next to
  the bot's messages, "Stappie" by default) with a CMS-configurable name. Same
  region-default-overridable-per-block resolution pattern as `systemPrompt`; the
  consuming app resolves the effective name and passes it in.

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
