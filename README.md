# stappie-shared-ui

Shared, presentational React components used by both:

- **admin_client** (Next.js/vinext) — the CMS's block editor, e.g. `AiChatPreview.jsx` and
  `DynamicBlockPreview.jsx` wrap these components with admin-specific data (authenticated
  API calls, the logged-in session's region config).
- **mini_site** (Astro, via `@astrojs/react`) — the published site mounts these as
  `client:load` islands, wrapped with build-time region/page data and no admin auth.

Both consumers use Vite under the hood (Astro's own Vite pipeline, and vinext), but this
package ships **pre-compiled** output (via `tsup`/esbuild) rather than raw JSX source —
that avoids relying on either consumer's specific JSX-in-`node_modules` handling and
matches how virtually every published React component package works.

## Design principle

Every component here is **props-only**: no `jotai` store access, no Next.js-specific
APIs, no `import.meta.env`, no direct network calls beyond what the component's own job
requires (e.g. `ChatInterface` talks directly to the public Cloudflare AI Search
endpoint — that's the component's actual job, not app-specific plumbing). Anything that
differs per app — authentication, base URLs, i18n string content, which fields exist on
a given region's config — is supplied by the consuming app's own thin wrapper component
via props. This is what makes one file usable in two different apps: the *shared* part
is genuinely shared, and the *different* part never has to be.

## Components

- **`ChatInterface`** — the AI Search chat UI (streaming, source citations as
  call/email/website action cards, optional sessionStorage persistence, optional
  floating-bubble variant). See the security note at the top of `src/ChatInterface.jsx`
  about the hardcoded `public/`-only retrieval filter — that must never become
  configurable via props.
- **`DynamicContentGrid`** — the card-grid + client-side search/filter UI for the
  "dynamic content" block. Data fetching stays in the consuming app (admin uses an
  authenticated admin-API call; the site uses the public API) — this component only
  renders and filters an already-fetched `items` array.

## Developing

```bash
npm install
npm run dev     # tsup --watch
npm run build    # one-off build to dist/
```

`dist/` is committed to this repo (not gitignored, no `prepare`/`postinstall` build
step) — **run `npm run build` and commit the resulting `dist/` alongside any `src/`
change** before pushing. This is deliberate: consumers install this package via a git
dependency (`github:kynda-matthijs/gh_shared_ui_components#<sha>`), and both pnpm (via
its `allowBuilds` git-dependency gate) and npm would otherwise need to run an
install-time build script. Shipping the built output instead means installing this
package never needs a build-script approval — not just for the current pin, but for
every future commit too, with nothing to configure on the consumer side.

Consumers install this via a git dependency pinned to a commit/tag (see each app's
`package.json`) — bump that pin after building + pushing a change here, then
`npm install` in the consuming app(s) to pick it up. There is no floating "always use
latest" branch dependency; updates are always an explicit, reviewable version bump.

**There are two consumers, and both need the pin bump — it's easy to update only the
one you're actively working on and forget the other, which leaves it silently
rendering a stale build with no error:**
- `mini_site/package.json`
- `admin_client (EKZ/new_admin)/package.json`

## Versioning

Bump `package.json`'s `"version"` on every change that ships user-visible behavior,
and add a `CHANGELOG.md` entry describing it — see that file for the format.
`src/version.js`'s `SHARED_UI_VERSION` is injected from `package.json`'s version at
build time (`tsup.config.js`'s `define`), not a second value to remember — this is a
**diagnostic label, not a resolved dependency version** (consumers pin by git SHA, per
above), but it's what lets you answer "am I actually running the build with feature
X?" without digging through `node_modules`:

- Both admin block-editor settings drawers that render a `stappie-shared-ui`
  component (`AiChatBlockEditor.jsx`, `DynamicBlockEditor.jsx` in `admin_client`) show
  a small `SHARED_UI_VERSION` badge in their header for exactly this reason.
- Or check directly: `grep '"version"' node_modules/stappie-shared-ui/package.json` in
  either consumer.

If the badge/grep shows an older version than you expect, the consuming app's pin
wasn't bumped (or `npm install` wasn't re-run) — that's the bug, not this package.
