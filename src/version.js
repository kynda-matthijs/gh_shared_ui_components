// version.js
// Bump this alongside package.json's "version" on every change that ships
// user-visible behavior. Exported so consuming apps (admin_client, mini_site) can
// display exactly which build is actually running — this package is consumed as a
// git-SHA-pinned dependency (see README), not semver-resolved, so it's easy for a
// consumer's pin to go stale after a change here and silently keep rendering old
// behavior. Comparing this value against CHANGELOG.md is the fast way to tell.
export const SHARED_UI_VERSION = '0.5.0';
