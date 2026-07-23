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

Consumers install this via a git dependency pinned to a commit/tag (see each app's
`package.json`) — bump that pin after building + pushing a change here, then
`npm install` in the consuming app(s) to pick it up. There is no floating "always use
latest" branch dependency; updates are always an explicit, reviewable version bump.
