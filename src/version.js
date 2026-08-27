// version.js
// Injected at build time from package.json's "version" (see tsup.config.js's `define`
// for __PACKAGE_VERSION__) — deliberately not a second hand-maintained literal. Two
// releases in a row (0.6.2, then this file's own first attempt at 0.6.3) shipped with
// this stuck on an old value because bumping package.json and bumping this string were
// two separate, forgettable steps; now there's only one. Exported so consuming apps
// (admin_client, mini_site) can display exactly which build is actually running — this
// package is consumed as a git-SHA-pinned dependency (see README), not semver-resolved,
// so it's easy for a consumer's pin to go stale after a change here and silently keep
// rendering old behavior. The 'dev' fallback covers importing this file outside a tsup
// build (e.g. a test importing straight from src/), where __PACKAGE_VERSION__ — a global
// esbuild `define` injects at build time — doesn't exist and would otherwise ReferenceError.
export const SHARED_UI_VERSION = typeof __PACKAGE_VERSION__ !== 'undefined' ? __PACKAGE_VERSION__ : 'dev';
