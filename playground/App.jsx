import { useState } from 'react';
// Imported straight from source, not dist/ — Vite's dev server + React Fast Refresh
// picks up edits to src/*.jsx instantly, no `npm run build` / git push / dependency
// re-pin / reinstall loop needed just to see whether a change fixes something.
import { DynamicContentGrid, SHARED_UI_VERSION } from '../src/index.js';

const LS_KEY = 'sui-playground-config';

function loadSaved() {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
    } catch {
        return {};
    }
}

const NO_VALUE_OPS = new Set(['is_empty', 'is_not_empty', 'is_true', 'is_false']);

// Finds the first 'dynamic' block in a page's blocks[], descending into any 'layout'
// block's cells (same shape admin_client/mini_site's registry.js layout block uses).
function findDynamicBlock(blocks) {
    for (const b of blocks ?? []) {
        if (b.type === 'dynamic') return b;
        if (b.type === 'layout') {
            for (const cell of b.cells ?? []) {
                const found = findDynamicBlock(cell.blocks);
                if (found) return found;
            }
        }
    }
    return null;
}

// Mirrors mini_site's DynamicBlockClient.jsx / admin_client's DynamicBlockPreview.jsx
// query-building exactly, so items fetched here match what either app would actually
// send to the public API for this same block config.
function buildItemsUrl(apiBase, region, collection, filters, maxItems) {
    const params = new URLSearchParams();
    for (const f of filters ?? []) {
        if (!f.field || !f.op) continue;
        if (NO_VALUE_OPS.has(f.op)) params.set(`filter[${f.field}][${f.op}]`, '1');
        else if (f.value !== '' && f.value != null) params.set(`filter[${f.field}][${f.op}]`, String(f.value));
    }
    params.set('maxItems', String(maxItems ?? 50));
    return `${apiBase}/public/v1/${region}/${collection}/?${params.toString()}`;
}

const STRINGS = { noResults: 'No results.', all: 'All', clearFilters: '× Clear filters', search: 'Search' };

// Same set api_server/model_helpers.js's AVAILABLE_LANGUAGES covers (mirrored in
// DynamicBlockClient.jsx's STRINGS/DATE_LOCALES) — items from the public API carry
// translated fields as flat `field__i18n__<lang>` keys (see getByPath's own docstring),
// so switching this doesn't refetch anything, it just changes which key
// DynamicContentGrid prefers when rendering/label-resolving the SAME already-fetched items.
const LANGS = ['nl', 'en', 'fr', 'de', 'es', 'pt', 'pl', 'tr', 'ru', 'ar', 'zh'];

export default function App() {
    const saved = loadSaved();
    // http://localhost:8081 matches mini_site's/admin_client's own local-dev env files
    // (.env.development's PUBLIC_API_URL, .env.local.gmh.8081's NEXT_PUBLIC_API_SERVER) —
    // a locally-running api_server, not the public internet. api.kynda.one is a different
    // (admin-only, auth-gated) gateway and 401s on /public/v1 — don't default to it here.
    const [apiBase, setApiBase]   = useState(saved.apiBase   ?? 'http://localhost:8081');
    const [region, setRegion]     = useState(saved.region    ?? 'ROTTERDAM');
    const [pageSlug, setPageSlug] = useState(saved.pageSlug  ?? '');
    const [collection, setCollection] = useState(saved.collection ?? 'service');

    const [filterBarText, setFilterBarText] = useState(saved.filterBarText ?? JSON.stringify({
        enabled: true, layout: 'horizontal', position: 'top', searchEnabled: false, searchFields: [],
        filters: [{ id: 'f1', field: 'subregion', label: 'Subregion', type: 'select', showCount: true, order: 0 }],
    }, null, 2));
    const [filtersText, setFiltersText] = useState(saved.filtersText ?? '[]');
    const [lang, setLang]               = useState(saved.lang        ?? 'nl');
    const [defaultLang, setDefaultLang] = useState(saved.defaultLang ?? 'nl');

    const [foundBlock, setFoundBlock] = useState(null);
    const [items, setItems]           = useState([]);
    const [status, setStatus]         = useState('');
    const [error, setError]           = useState('');

    function persist(patch) {
        localStorage.setItem(LS_KEY, JSON.stringify({
            apiBase, region, pageSlug, collection, filterBarText, filtersText, lang, defaultLang, ...patch,
        }));
    }

    async function fetchPageConfig() {
        setError(''); setStatus('Pagina ophalen…');
        try {
            const res = await fetch(`${apiBase}/public/v1/${region}/page/?slug=${encodeURIComponent(pageSlug)}`);
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            const page = await res.json();
            const block = findDynamicBlock(page.blocks);
            if (!block) throw new Error('Geen dynamic-block gevonden op deze pagina.');
            setFoundBlock(block);
            setCollection(block.collection ?? collection);
            setFilterBarText(JSON.stringify(block.filterBar ?? {}, null, 2));
            setFiltersText(JSON.stringify(block.filters ?? [], null, 2));
            setStatus(`Dynamic-block gevonden: collectie "${block.collection}".`);
            persist({ collection: block.collection ?? collection, filterBarText: JSON.stringify(block.filterBar ?? {}, null, 2), filtersText: JSON.stringify(block.filters ?? [], null, 2) });
        } catch (err) {
            setError(String(err.message ?? err));
            setStatus('');
        }
    }

    async function fetchItems() {
        setError(''); setStatus('Items ophalen…');
        try {
            const filters = JSON.parse(filtersText || '[]');
            const url = buildItemsUrl(apiBase, region, collection, filters, 50);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.items ?? []);
            setItems(list);
            setStatus(`${list.length} item(s) opgehaald van ${url}`);
            persist({});
        } catch (err) {
            setError(String(err.message ?? err));
            setStatus('');
        }
    }

    let filterBar = {};
    let filterBarError = '';
    try { filterBar = JSON.parse(filterBarText || '{}'); } catch (e) { filterBarError = String(e.message ?? e); }

    return (
        <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1000, margin: '0 auto', padding: '1.5rem', color: '#1a1a1a' }}>
            <h1 style={{ fontSize: '1.25rem' }}>stappie-shared-ui playground <span style={{ fontWeight: 400, color: '#888' }}>— SHARED_UI_VERSION {SHARED_UI_VERSION}</span></h1>
            <p style={{ color: '#555', fontSize: '0.9rem' }}>
                Renders <code>DynamicContentGrid</code> directly from <code>src/</code> (not <code>dist/</code>) against
                real data from the public API — edit <code>src/DynamicContentGrid.jsx</code> and this page hot-reloads
                with the change, no build/publish/reinstall cycle needed.
            </p>

            <fieldset style={{ marginTop: '1rem', padding: '0.75rem', border: '1px solid #ddd', borderRadius: 6 }}>
                <legend>1. Haal een echte paginaconfiguratie op (optioneel)</legend>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label>API base <input value={apiBase} onChange={e => setApiBase(e.target.value)} onBlur={() => persist({})} style={{ width: 220 }} /></label>
                    <label>Region <input value={region} onChange={e => setRegion(e.target.value)} onBlur={() => persist({})} style={{ width: 120 }} /></label>
                    <label>Pagina-slug <input value={pageSlug} onChange={e => setPageSlug(e.target.value)} onBlur={() => persist({})} placeholder="bijv. diensten" style={{ width: 160 }} /></label>
                    <button onClick={fetchPageConfig} disabled={!pageSlug}>Pagina ophalen</button>
                </div>
                {foundBlock && (
                    <details style={{ marginTop: '0.5rem' }}>
                        <summary>Gevonden block (ruw)</summary>
                        <pre style={{ maxHeight: 200, overflow: 'auto', background: '#f7f7f7', padding: '0.5rem' }}>{JSON.stringify(foundBlock, null, 2)}</pre>
                    </details>
                )}
            </fieldset>

            <fieldset style={{ marginTop: '1rem', padding: '0.75rem', border: '1px solid #ddd', borderRadius: 6 }}>
                <legend>2. Collectie + filters (bewerk vrij, geen CMS-save nodig)</legend>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                    Collectie <input value={collection} onChange={e => setCollection(e.target.value)} onBlur={() => persist({})} style={{ width: 160 }} />
                </label>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                    Server-side filters (JSON array — <code>public_router.js</code>'s <code>filter[field][op]=value</code>)
                    <textarea value={filtersText} onChange={e => setFiltersText(e.target.value)} onBlur={() => persist({})} rows={3} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }} />
                </label>
                <label style={{ display: 'block' }}>
                    filterBar (JSON — the interactive client-side filter/search config)
                    <textarea value={filterBarText} onChange={e => setFilterBarText(e.target.value)} onBlur={() => persist({})} rows={8} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }} />
                    {filterBarError && <div style={{ color: '#c00' }}>Ongeldige JSON: {filterBarError}</div>}
                </label>
                <button onClick={fetchItems} style={{ marginTop: '0.5rem' }}>Items ophalen</button>
            </fieldset>

            {status && <p style={{ color: '#555' }}>{status}</p>}
            {error && <p style={{ color: '#c00' }}>⚠ {error}</p>}

            <h2 style={{ fontSize: '1.05rem', marginTop: '1.5rem' }}>Live rendering ({items.length} items)</h2>
            <p style={{ fontSize: '0.8rem', color: '#888' }}>Debug mode is always on here — open the devtools console.</p>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label>Taal (lang)
                    {' '}<select value={lang} onChange={e => { setLang(e.target.value); persist({ lang: e.target.value }); }}>
                        {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                </label>
                <label>Standaardtaal (defaultLang)
                    {' '}<select value={defaultLang} onChange={e => { setDefaultLang(e.target.value); persist({ defaultLang: e.target.value }); }}>
                        {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                </label>
                <span style={{ fontSize: '0.78rem', color: '#888' }}>
                    Geen herfetch nodig — schakelt alleen welke <code>field__i18n__&lt;lang&gt;</code>-variant al opgehaalde items gebruiken.
                </span>
            </div>
            <div style={{ border: '1px dashed #ccc', padding: '1rem', borderRadius: 6 }}>
                <DynamicContentGrid
                    items={items}
                    filterBar={filterBar}
                    collection={collection}
                    strings={STRINGS}
                    lang={lang}
                    defaultLang={defaultLang}
                    debug
                />
            </div>

            {items[0] && (
                <details style={{ marginTop: '1rem' }}>
                    <summary>Eerste item (ruw, van de public API)</summary>
                    <pre style={{ maxHeight: 300, overflow: 'auto', background: '#f7f7f7', padding: '0.5rem' }}>{JSON.stringify(items[0], null, 2)}</pre>
                </details>
            )}
        </div>
    );
}
