// dtcg.js
// Single shared implementation of "DTCG tokens document -> CSS" — replaces three previously
// hand-synced copies (admin_client's designTokens.js/siteFonts.js and mini_site's own
// SiteLayout.astro derivation). Consumed identically by admin_client's live preview
// (BlockEditorPage.jsx) and mini_site's build-time SiteLayout.astro.
//
// A "tokens document" is the shape api_server's `designtoken.tokens` field stores (and
// api_server/design_tokens.js produces): { resolver, sets: { foundation: {...} },
// modifiers: { theme: { dark: {...} }, contrast: { high-contrast: {...} } } }. `resolver`
// mirrors the real DTCG 2025.10 resolver spec (sets + modifiers + contexts + resolutionOrder)
// but its sources are resolved against an in-memory virtual-file map built from the same
// document here, rather than real files on disk — see buildPermutations below and
// api_server/design_tokens.js's matching comment for why (a single Datastore blob, not a
// filesystem, is the actual storage unit).

import { parse, build, defineConfig } from '@terrazzo/parser';
import cssPlugin from '@terrazzo/plugin-css';

// Mirrors api_server/design_tokens.js's virtualFileMapForTokensDoc exactly — filenames must
// match what that file's buildTokensDoc() wrote into the resolver's $refs.
function virtualFileMapForTokensDoc(tokensDoc) {
    const files = { 'file:///foundation.tokens.json': tokensDoc.sets?.foundation ?? {} };
    for (const [modName, contexts] of Object.entries(tokensDoc.modifiers || {})) {
        for (const [ctxName, tree] of Object.entries(contexts || {})) {
            files[`file:///${modName}/${ctxName}.tokens.json`] = tree;
        }
    }
    return files;
}

// One CSS "permutation" per authored modifier context (e.g. modifiers.theme.dark -> a
// `[data-theme="dark"]` block), plus one base permutation using every axis's own default —
// mirrors mini_site's existing data-theme attribute mechanism, extended with one attribute
// per modifier axis (data-theme, data-contrast, ...) rather than combining axes into a single
// selector — DTCG's own "orthogonality" guidance recommends against combinatorial modifier
// blocks unless two axes actually interact, which none of ours do (see the plan's dark /
// high-contrast decision: independent axes, not a 4-way matrix).
function buildPermutations(tokensDoc, rootSelector) {
    const modifiers = tokensDoc.resolver?.modifiers || {};
    const defaultInput = Object.fromEntries(Object.entries(modifiers).map(([name, def]) => [name, def.default]));
    const permutations = [{ input: { ...defaultInput }, selector: rootSelector }];
    for (const [modName, modDef] of Object.entries(modifiers)) {
        for (const ctxName of Object.keys(modDef.contexts || {})) {
            if (ctxName === modDef.default) continue; // already covered by the base permutation
            // data-theme / data-contrast are the two axes this app actually defines; any
            // future axis name falls back to the same data-<axis> convention.
            const attr = `data-${modName}`;
            permutations.push({ input: { ...defaultInput, [modName]: ctxName }, selector: `[${attr}="${ctxName}"]` });
        }
    }
    return permutations;
}

async function parseTokensDoc(tokensDoc, { rootSelector = ':root' } = {}) {
    const virtualFiles = virtualFileMapForTokensDoc(tokensDoc);
    const req = async (url) => {
        const key = url.href;
        if (!(key in virtualFiles)) throw new Error(`Onbekend tokenbestand: ${key}`);
        return JSON.stringify(virtualFiles[key]);
    };
    const permutations = buildPermutations(tokensDoc, rootSelector).map(({ input, selector }) => ({
        input,
        prepare: (contents) => `${selector} {\n${contents}\n}`,
    }));
    const config = defineConfig({ plugins: [cssPlugin({ permutations })] }, { cwd: new URL('file:///') });
    const parseResult = await parse(
        [{ filename: new URL('file:///resolver.json'), src: tokensDoc.resolver }],
        { config, req }
    );
    return { parseResult, config };
}

/**
 * Parses + builds a stored tokens document into ready-to-embed CSS text: a base block (using
 * every modifier's default context) plus one attribute-scoped block per authored override
 * context. `rootSelector` scopes the base block — mini_site uses the real `:root`, while
 * admin_client's live preview scopes it to the preview canvas instead, so the admin's own UI
 * chrome never inherits the previewed site's tokens.
 *
 * @param {object} tokensDoc
 * @param {{ rootSelector?: string }} [options]
 * @returns {Promise<string>} CSS text
 */
export async function buildDesignTokensCss(tokensDoc, { rootSelector = ':root' } = {}) {
    const { parseResult, config } = await parseTokensDoc(tokensDoc, { rootSelector });
    const buildResult = await build(parseResult.tokens, {
        sources: parseResult.sources,
        config,
        resolver: parseResult.resolver,
    });
    const cssFile = buildResult.outputFiles.find((f) => f.filename.endsWith('.css'));
    return cssFile?.contents ?? '';
}

/**
 * Resolves a single mode combination (e.g. { theme: 'dark' }) to the full set of DTCG tokens
 * for that mode — used where the raw resolved values are needed directly (not as CSS text),
 * e.g. reading a single dimension for a non-CSS purpose like the block editor's canvas width.
 * Returns a Map-like plain object keyed by token id (e.g. 'size.content-max'), each entry
 * carrying the normalized `$value` (and, for aliases, the resolved value already substituted
 * in — see @terrazzo/parser's TokenNormalized shape).
 *
 * @param {object} tokensDoc
 * @param {Record<string,string>} [mode] - e.g. { theme: 'dark', contrast: 'high-contrast' };
 *   omitted axes fall back to that axis's own resolver default.
 */
export async function resolveDesignTokens(tokensDoc, mode = {}) {
    const { parseResult } = await parseTokensDoc(tokensDoc);
    const modifiers = tokensDoc.resolver?.modifiers || {};
    const defaultInput = Object.fromEntries(Object.entries(modifiers).map(([name, def]) => [name, def.default]));
    return parseResult.resolver.apply({ ...defaultInput, ...mode });
}

// Mirrors mini_site/src/lib/theme.ts's contrastTextColor exactly (YIQ luminance, threshold
// 128) and api_server/design_tokens.js's identical copy — see that file's comment for why
// api_server can't just import this module instead.
export function contrastTextColor(hex, dark = '#1a1a1a', light = '#ffffff') {
    const match = (hex ?? '').trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!match) return dark;
    const [r, g, b] = [1, 2, 3].map((i) => parseInt(match[i], 16));
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? dark : light;
}
