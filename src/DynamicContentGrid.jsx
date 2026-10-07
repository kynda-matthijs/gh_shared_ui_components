import { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, User as UserIcon, Folder as FolderIcon } from 'lucide-react';
import ActionButtons from './ActionButtons.jsx';
import { readFilterState, writeFilterState, canonicalFilterState } from './filterUrlState.js';
import { valuesByPath, asText, hasValue, parsePick, stableIndex, resolveOptionValue } from './slotValues.js';

// DynamicContentGrid — shared, presentational card-grid + filter bar for the "dynamic
// content" block. Data fetching (which differs per app: admin uses an authenticated
// admin-API call, the site uses the unauthenticated public API) stays in each app's
// thin wrapper — this component only owns rendering, client-side search/filter
// interaction, and layout, given an already-fetched `items` array.

function trunc(s, n = 120) {
    const str = String(s ?? '');
    return str.length > n ? str.slice(0, n) + '…' : str;
}

function fmtDate(v, locale = 'nl-NL') {
    try { return new Date(v).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return String(v); }
}

/**
 * Dot-notation path accessor — supports e.g. "subregion.name" — preferring the
 * `${lastKey}__i18n__${lang}` variant of the final segment when present, same
 * convention/semantics as mini_site's PageBlocks.astro local getByPath (the "fixed
 * blocks" path that already translates correctly) and lib/i18n.ts's `t()`. Items here
 * come straight from the public API (api_server/public_router.js), which never
 * resolves __i18n__ server-side — every language variant is a separate raw top-level
 * key the caller has to pick between, exactly what this does for the current `lang`.
 */
function getByPath(item, path, lang, defaultLang) {
    if (!item || !path) return '';
    const parts = path.split('.');
    let cur = item;
    for (let i = 0; i < parts.length - 1; i++) {
        if (cur == null || typeof cur !== 'object') return '';
        cur = cur[parts[i]];
    }
    if (cur == null || typeof cur !== 'object') return '';
    const lastKey = parts[parts.length - 1];
    if (lang && lang !== defaultLang) {
        const translated = cur[`${lastKey}__i18n__${lang}`];
        if (translated != null && translated !== '') return translated;
    }
    return cur[lastKey] ?? '';
}

// What one slot of the service card shows. `single` slots (the drawing) never join: "all" counts as "first".
function slotValue(item, fieldMap, slot, lang, defaultLang, { single = false } = {}) {
    const path = fieldMap[slot];
    if (!path) return '';
    const values = valuesByPath(item, path, lang, defaultLang);
    const { mode, max } = parsePick(fieldMap[`${slot}Pick`]);
    const filled = values.filter(hasValue);
    switch (single && mode === 'all' ? 'first' : mode) {
        case 'last': return values.length ? (values[values.length - 1] ?? '') : '';
        case 'random': return filled.length ? filled[stableIndex(item, filled.length)] : '';
        case 'all': return filled.slice(0, max ?? undefined).map(asText).filter(Boolean).join(', ');
        default: return values[0] ?? '';
    }
}

// The drawing's URL: a string as it is, or — when the slot points at a whole populated reference — its image.
const imageSource = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? String(v.image ?? v.url ?? '') : '').trim();

// The service card's short description. A value that is already short is shown as it is; a longer one (the
// full description) is cut to its first two sentences. The card clamps what is left to 3 lines.
function summaryText(raw) {
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (text.length <= 140) return text;
    return (text.match(/[^.!?]+(?:[.!?]+|$)\s*/g) ?? [text]).slice(0, 2).join('').trim();
}

// One entry of the service card's feature row ("16 tot 27 jaar", "Gratis", "Inloopmogelijkheid"): an enum shows
// its schema label, an array of enums is joined, a true boolean reads as the field's own label (the schema's
// Ja/Nee pair says nothing on a chip), and a false or unset value is not shown at all — "alleen wat bekend is".
function featureText(item, field, fieldLabels, lang, defaultLang) {
    if (!field) return '';
    const raw = getByPath(item, field, lang, defaultLang);
    if (raw === true) {
        const fl = fieldLabels?.[field];
        return String((lang && lang !== defaultLang && fl?.labelI18n?.[lang]) || fl?.label || field);
    }
    if (raw === false || raw == null || raw === '') return '';
    return (Array.isArray(raw) ? raw : [raw])
        .map((el) => resolveOptionValue(el, field, lang, defaultLang, fieldLabels).label)
        .filter(Boolean)
        .join(', ');
}

// Resolves a filter field against one item into a LIST of {value, label} options — zero
// for an unset/empty field, one for a plain scalar field, and one per element for an
// array-typed field (Service.categories/ageGroups) so a multi-value item shows up under
// every one of its own filter options, not collapsed into a single bogus combined value.
function resolveFilterOptions(item, field, lang, defaultLang, fieldLabels) {
    const raw = getByPath(item, field, lang, defaultLang);
    if (Array.isArray(raw)) {
        return raw.map(el => resolveOptionValue(el, field, lang, defaultLang, fieldLabels)).filter(o => o.value);
    }
    if (raw == null || raw === '') return [];
    // A field explicitly pointed at a reference's id (e.g. "subregion.id") already
    // resolves to a scalar via resolveOptionValue — but its sibling "subregion.name" is
    // still recoverable from that same already-populated parent object for a friendlier
    // label. Only meaningful for a genuine non-array leaf, hence handled here rather than
    // inside resolveOptionValue (which also runs per array element, with no such sibling).
    const value = String(raw).trim();
    if (value && field.endsWith('.id')) {
        const parentPath = field.slice(0, -'.id'.length);
        const label = getByPath(item, `${parentPath}.name`, lang, defaultLang)
            || getByPath(item, `${parentPath}.title`, lang, defaultLang);
        if (label) return [{ value, label: String(label) }];
    }
    const resolved = resolveOptionValue(raw, field, lang, defaultLang, fieldLabels);
    return resolved.value ? [resolved] : [];
}

function getUniqueValues(items, field, lang, defaultLang, fieldLabels, debug) {
    const counts = {};
    const labels = {};
    for (const item of items) {
        for (const { value: val, label } of resolveFilterOptions(item, field, lang, defaultLang, fieldLabels)) {
            if (!val) continue;
            counts[val] = (counts[val] ?? 0) + 1;
            if (!labels[val] && label && label !== val) labels[val] = label;
        }
    }
    // Debug mode (see DynamicContentGrid's `debug` prop): the actual mystery this needs
    // to answer is almost always "why didn't a name resolve" — logging the raw top-level
    // value behind the field (e.g. item.subregion) shows immediately whether it's a
    // populated object (nested .name available) or still a bare id/unpopulated reference,
    // without needing to guess from the rendered dropdown alone.
    if (debug) {
        const topKey = field.split('.')[0];
        // eslint-disable-next-line no-console
        console.log(`[DynamicContentGrid debug] filter field "${field}"`, {
            itemCount: items.length,
            sampleRawTopLevelValue: items[0]?.[topKey],
            resolvedOptionValues: Object.keys(counts),
            resolvedLabels: labels,
        });
    }
    return Object.keys(counts).sort().map(v => ({ value: v, count: counts[v], label: labels[v] ?? v }));
}

// A filter's option LIST stays stable (always every value seen across allItems, in the
// same order) regardless of what's currently selected elsewhere — only each option's
// COUNT is faceted: recomputed against the items that would remain if every OTHER active
// filter (and the search term) were applied, deliberately excluding this filter's OWN
// active selection from that scoping. Self-exclusion matters for two reasons: a
// multi-select checkbox group needs its own options to stay OR'd against each other
// (picking one shouldn't zero out the others in the SAME group), and a single-select
// (radio/select) field's currently-chosen option would otherwise always show its own
// full post-filter count trivially. An option whose faceted count comes back 0 still
// appears in the list (so a visitor can see it exists and, once they see its "(0)" or
// grayed-out state, understand why) — it's the caller's job (FilterBar below) to gray/
// disable it rather than hiding it, which would make the option list jump around as
// other filters change.
function getFacetedOptions(allItems, filterDef, activeFilters, searchTerm, filterBar, lang, defaultLang, fieldLabels, debug) {
    const stableOptions = getUniqueValues(allItems, filterDef.field, lang, defaultLang, fieldLabels, debug);
    const othersActive  = Object.fromEntries(Object.entries(activeFilters).filter(([f]) => f !== filterDef.field));
    const scopedItems   = applyUserFilters(allItems, othersActive, searchTerm, filterBar, lang, defaultLang);
    const scopedCounts  = getUniqueValues(scopedItems, filterDef.field, lang, defaultLang, fieldLabels);
    const countByValue  = Object.fromEntries(scopedCounts.map(o => [o.value, o.count]));
    return stableOptions.map(o => ({ ...o, count: countByValue[o.value] ?? 0 }));
}

function applyUserFilters(baseItems, activeFilters, searchTerm, filterBar, lang, defaultLang) {
    let result = baseItems;
    if (searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const searchFields = filterBar?.searchFields?.length ? filterBar.searchFields : ['name', 'title', 'description'];
        result = result.filter(item => searchFields.some(f => String(getByPath(item, f, lang, defaultLang) ?? '').toLowerCase().includes(term)));
    }
    for (const [field, values] of Object.entries(activeFilters)) {
        if (!values?.length) continue;
        const valSet = new Set(values.map(v => String(v).toLowerCase()));
        // Same resolver getUniqueValues uses to build the option list. An array-typed
        // field (e.g. categories/ageGroups) matches if ANY of the item's own values is
        // among the selected options — the usual "OR within one filter group" semantics
        // already applied to a scalar field's multi-select checkboxes, just now checked
        // against a set of resolved values per item instead of exactly one.
        result = result.filter(item =>
            resolveFilterOptions(item, field, lang, defaultLang).some(o => valSet.has(o.value.toLowerCase()))
        );
    }
    return result;
}

function Badge({ value }) {
    return value ? <span className="sui-dyn-badge">{value}</span> : null;
}

function CardImage({ src }) {
    if (src) return <img src={src} alt="" loading="lazy" />;
    return <div className="sui-dyn-img-placeholder"><ImageIcon className="sui-dyn-icon" /></div>;
}

function defaultDetailUrl(item, fieldMap, collection, lang, defaultLang) {
    const pattern = fieldMap?.detailUrl ?? '';
    if (pattern) {
        return pattern
            .replace(/\{\{id\}\}/g, String(item.id ?? ''))
            .replace(/\{\{slug\}\}/g, String(item.slug ?? item.id ?? ''));
    }
    const idOrSlug = item.slug ?? item.id;
    if (!collection || !idOrSlug) return '';
    // Matches mini_site's detail-page routing: unprefixed for defaultLang, /<lang>/...
    // for every other supportedLanguage — see [resource]/[id].astro and its sibling
    // [lang]/[resource]/[id].astro / buildDetailAltSlugs (lib/detailPages.ts).
    return lang && lang !== defaultLang ? `/${lang}/${collection}/${idOrSlug}` : `/${collection}/${idOrSlug}`;
}

// moreInfoUrl is a freeText pattern slot (like detailUrl above), not a field-name slot —
// its fieldMap value IS the literal pattern string, so it's resolved separately from g().
function buildMoreInfoUrl(item, fieldMap) {
    const pattern = fieldMap?.moreInfoUrl ?? '';
    if (!pattern) return '';
    return pattern
        .replace(/\{\{id\}\}/g, String(item.id ?? ''))
        .replace(/\{\{slug\}\}/g, String(item.slug ?? item.id ?? ''));
}

function PreviewCard({ item, design, fieldMap, collection, detailUrlBuilder, dateLocale, strings, lang, defaultLang, fieldLabels }) {
    const g = (slot) => {
        const field = fieldMap[slot];
        return field ? getByPath(item, field, lang, defaultLang) : '';
    };

    switch (design) {
        // The design team's service card: the main category's drawing, the name, "organisation · area", a short
        // description (3 lines at most) and, pinned to the bottom, a row of up to 3 known features. A slot whose path
        // runs through an array shows the value its `<slot>Pick` setting picks (see slotValue); an empty one is left out.
        case 'service-card': {
            const slot = (name, options) => slotValue(item, fieldMap, name, lang, defaultLang, options);
            const drawing = imageSource(slot('image', { single: true }));
            const meta = [slot('meta1'), slot('meta2')].map(asText).filter(Boolean).join(' \u00b7 ');
            const summary = summaryText(asText(slot('summary')));
            const features = ['feature1', 'feature2', 'feature3']
                .map((name) => featureText(item, fieldMap[name], fieldLabels, lang, defaultLang))
                .filter(Boolean).slice(0, 3).join(' \u00b7 ');
            return (
                <>
                    {drawing && <img className="sui-dyn-card-icon" src={drawing} alt="" loading="lazy" />}
                    <h3>{asText(slot('heading')) || item.name || item.title || '\u2014'}</h3>
                    {meta && <div className="sui-dyn-card-meta">{meta}</div>}
                    {summary && <div className="sui-dyn-card-summary">{summary}</div>}
                    {features && <div className="sui-dyn-card-features">{features}</div>}
                </>
            );
        }
        case 'image-card':
            return (
                <>
                    <div className="sui-dyn-img"><CardImage src={g('image')} /></div>
                    <div className="sui-dyn-body">
                        <Badge value={g('badge')} />
                        <h3>{g('heading') || item.name || item.title || '—'}</h3>
                        {g('subheading') && <p className="sui-dyn-sub">{String(g('subheading'))}</p>}
                        {g('body') && <p className="sui-dyn-desc">{trunc(g('body'))}</p>}
                    </div>
                </>
            );
        case 'compact-card':
            return (
                <div className="sui-dyn-body sui-dyn-body-full">
                    <h3>{g('heading') || item.name || item.title || '—'}</h3>
                    {g('subheading') && <p className="sui-dyn-sub">{String(g('subheading'))}</p>}
                    {g('body') && <p className="sui-dyn-desc">{trunc(g('body'), 100)}</p>}
                    {g('date') && <p className="sui-dyn-date">{fmtDate(g('date'), dateLocale)}</p>}
                </div>
            );
        case 'stat-card':
            return (
                <div className="sui-dyn-body sui-dyn-stat-body">
                    <p className="sui-dyn-stat-label">{g('heading') || item.name || '—'}</p>
                    <p className="sui-dyn-stat-value">{String(g('number') || '—')}</p>
                    {g('subheading') && <p className="sui-dyn-sub">{String(g('subheading'))}</p>}
                    <Badge value={g('badge')} />
                </div>
            );
        case 'person-card':
            return (
                <>
                    <div className="sui-dyn-avatar-wrap">
                        {g('image')
                            ? <img src={String(g('image'))} className="sui-dyn-avatar" alt="" />
                            : <div className="sui-dyn-avatar-placeholder"><UserIcon className="sui-dyn-icon" /></div>}
                    </div>
                    <div className="sui-dyn-body sui-dyn-person-body">
                        <h3>{g('heading') || item.name || '—'}</h3>
                        {g('subheading') && <p className="sui-dyn-sub">{String(g('subheading'))}</p>}
                        {g('body') && <p className="sui-dyn-desc">{trunc(g('body'), 100)}</p>}
                    </div>
                </>
            );
        case 'contact-card':
            return (
                <div className="sui-dyn-body sui-dyn-body-full">
                    <h3>{g('heading') || item.name || item.title || '—'}</h3>
                    <ActionButtons
                        tel={g('tel')} email={g('email')} url={g('website')} address={g('address')}
                        moreInfoHref={buildMoreInfoUrl(item, fieldMap)}
                        strings={strings}
                    />
                </div>
            );
        case 'document-card':
            return (
                <>
                    <div className="sui-dyn-doc-icon"><FolderIcon className="sui-dyn-icon" /></div>
                    <div className="sui-dyn-body sui-dyn-body-full">
                        <h3>{g('heading') || item.name || item.title || '—'}</h3>
                        <div className="sui-dyn-doc-meta">
                            <Badge value={g('badge')} />
                            {g('date') && <span className="sui-dyn-date">{fmtDate(g('date'), dateLocale)}</span>}
                        </div>
                        {g('body') && <p className="sui-dyn-desc">{trunc(g('body'), 100)}</p>}
                    </div>
                </>
            );
        default:
            return <div className="sui-dyn-body sui-dyn-body-full"><h3>{item.name ?? item.title ?? String(item.id ?? '—')}</h3></div>;
    }
}

function FilterBar({ allItems, filterBar, activeFilters, searchTerm, setActiveFilters, setSearchTerm, hasActive, onReset, strings, lang, defaultLang, fieldLabels, debug }) {
    const fb = filterBar ?? {};
    const hasSearch = fb.searchEnabled;
    const sortedFilters = (fb.filters ?? []).filter(f => f.field).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!hasSearch && sortedFilters.length === 0) return null;

    return (
        <div className={`sui-dyn-filterbar sui-dyn-filterbar--${fb.layout ?? 'horizontal'}`}>
            {sortedFilters.map(filterDef => {
                const options = getFacetedOptions(allItems, filterDef, activeFilters, searchTerm, fb, lang, defaultLang, fieldLabels, debug);
                if (options.length <= 1) return null;
                const selected = activeFilters[filterDef.field] ?? [];
                // filterDef.label / label__i18n__<lang> are the visitor-facing filter
                // labels edited (and swagger-prefilled) in DynamicBlockEditor.jsx's
                // settings drawer — same __i18n__ convention as every other translatable
                // block field (lib/i18n.js's i18nKey), never resolved server-side, so
                // it's picked per the page's current `lang` here same as everything else
                // in this component that's language-aware.
                const label = (lang && lang !== defaultLang && filterDef[`label__i18n__${lang}`])
                    || filterDef.label
                    || filterDef.field;
                return (
                    <div key={filterDef.id} className="sui-dyn-filter-group">
                        <span className="sui-dyn-filter-label">{label}</span>
                        {filterDef.type === 'select' ? (
                            <select className="sui-dyn-filter-select" value={selected[0] ?? ''}
                                onChange={e => setActiveFilters(prev => ({ ...prev, [filterDef.field]: e.target.value ? [e.target.value] : [] }))}>
                                <option value="">{strings.all}</option>
                                {options.map(o => (
                                    // A native <option disabled> already renders grayed-out with no
                                    // extra CSS — never disable the CURRENTLY selected one, or the
                                    // visitor would be stuck unable to pick anything else from this
                                    // <select> (an empty selection isn't possible here the way an
                                    // unchecked checkbox is).
                                    <option key={o.value} value={o.value} disabled={o.count === 0 && selected[0] !== o.value}>
                                        {o.label}{filterDef.showCount ? ` (${o.count})` : ''}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className={`sui-dyn-filter-options sui-dyn-filter-options--${filterDef.type ?? 'checkbox'}`}>
                                {options.map(o => {
                                    const isChecked = filterDef.type === 'radio' ? selected[0] === o.value : selected.includes(o.value);
                                    // Grayed out (not hidden — see getFacetedOptions) once this
                                    // combination would return zero results, unless it's already
                                    // checked: disabling an already-checked box would trap the
                                    // visitor, unable to ever uncheck it again.
                                    const isZero = o.count === 0 && !isChecked;
                                    return (
                                    <label key={o.value} className={`sui-dyn-filter-option${isZero ? ' sui-dyn-filter-option--zero' : ''}`}>
                                        <input
                                            type={filterDef.type === 'radio' ? 'radio' : 'checkbox'}
                                            name={`sui-dyn-filter-${filterDef.id}`}
                                            value={o.value}
                                            checked={isChecked}
                                            disabled={isZero}
                                            onChange={e => {
                                                if (filterDef.type === 'radio') {
                                                    setActiveFilters(prev => ({ ...prev, [filterDef.field]: e.target.checked ? [o.value] : [] }));
                                                } else {
                                                    setActiveFilters(prev => {
                                                        const cur = prev[filterDef.field] ?? [];
                                                        return { ...prev, [filterDef.field]: e.target.checked ? [...cur, o.value] : cur.filter(v => v !== o.value) };
                                                    });
                                                }
                                            }}
                                        />
                                        {' '}{o.label}{filterDef.showCount ? ` (${o.count})` : ''}
                                    </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
            {/* Rendered last, not first — search refines the set the filters above have
                already narrowed down, so it reads as the final, most-specific step. */}
            {hasSearch && (
                <div className="sui-dyn-filter-group">
                    <input
                        type="search"
                        className="sui-dyn-search-input"
                        value={searchTerm}
                        placeholder={(fb.searchLabel || strings.search) + '…'}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            )}
            {/* Last item of the bar, only once something is chosen — the design's "Filters
                wissen" sits at the bar's right end, not below the results. */}
            {hasActive && (
                <button type="button" className="sui-dyn-reset-btn inbar" onClick={onReset}>
                    X {strings.clearFilters}
                </button>
            )}
        </div>
    );
}

const DEFAULT_STRINGS = {
    noResults: 'No results found.', all: 'All', clearFilters: 'Clear filters', search: 'Search',
    call: 'Call', email: 'Email', website: 'Website', route: 'Directions', moreInfo: 'More info',
    // Shown instead of noResults when filterBar.hideUntilFiltered is on and the visitor
    // hasn't searched/filtered yet — a deliberately empty state, not "0 results found".
    startPrompt: 'Start typing or choose a filter to see results.',
    // The line under the filter bar. One template per plural category of the page's language
    // (Intl.PluralRules: one/other for most, plus few/many for Polish/Russian, zero/two/... for
    // Arabic) — `other` is required, it is what any category without its own template falls back to.
    resultCount: { one: '{count} result', other: '{count} results' },
};

// "7 results" / "1 result" in the page's language. Null when the strings carry no template at all.
function resultCountText(count, strings, lang, defaultLang) {
    const templates = strings.resultCount;
    if (!templates || typeof templates !== 'object') return null;
    let category = 'other';
    try { category = new Intl.PluralRules(lang || defaultLang || 'en').select(count); } catch { /* unknown language tag: `other` */ }
    const template = templates[category] ?? templates.other;
    return typeof template === 'string' ? template.replace('{count}', String(count)) : null;
}

export default function DynamicContentGrid({
    items = [],
    loading = false,
    error = null,
    cardDesign = 'image-card',
    fieldMap = {},
    cols = 3,
    filterBar: filterBarConfig = {},
    title,
    collection,
    detailUrlBuilder,
    strings: stringsProp,
    dateLocale = 'nl-NL',
    lang,
    defaultLang,
    // {[field]: {enumLabels, enumLabelsI18n, ...}} — see resolveFilterOption's own comment
    // for the shape/source. Optional: a filter field with no entry here (or no fieldLabels
    // prop passed at all) just keeps showing its raw stored value, today's behavior.
    fieldLabels,
    // Admin-only diagnostic toggle — never set true on the published site. See
    // getUniqueValues' own comment for exactly what it logs and why.
    debug = false,
    // Keep the filter state in the page's URL (?categories=12&q=taal) so a search can be bookmarked and shared, and
    // survives a visit to a card and the way back. Opt-in: the admin's preview must never touch the editor's own URL.
    // `true`, or a string to namespace the parameters of one grid among several on a page. See filterUrlState.js.
    urlState = false,
}) {
    const strings = { ...DEFAULT_STRINGS, ...stringsProp };
    const [activeFilters, setActiveFilters] = useState({});
    const [searchTerm, setSearchTerm] = useState('');

    const hasFilterBar = filterBarConfig.enabled && (filterBarConfig.searchEnabled || (filterBarConfig.filters ?? []).some(f => f.field));
    const pos = filterBarConfig.position ?? 'top';
    const hasActive = searchTerm.length > 0 || Object.values(activeFilters).some(v => v.length > 0);
    const resetFilters = () => { setActiveFilters({}); setSearchTerm(''); };

    // ---- filter state <-> URL ------------------------------------------------------------------------------------
    const urlSync = Boolean(urlState) && hasFilterBar;
    const urlPrefix = typeof urlState === 'string' && urlState ? `${urlState}.` : '';
    const urlFilters = (filterBarConfig.filters ?? []).filter((f) => f.field);
    const [urlRead, setUrlRead] = useState(false);
    const urlWrittenSearch = useRef('');
    const urlCleaned = useRef(false);

    // Read once, after mount (never during the first render: the server rendered the page without the URL's state, and
    // what the browser hydrates must match it).
    useEffect(() => {
        if (!urlSync) return;
        const fromUrl = readFilterState(window.location.search, urlFilters, { searchEnabled: Boolean(filterBarConfig.searchEnabled), prefix: urlPrefix });
        if (Object.keys(fromUrl.activeFilters).length) setActiveFilters(fromUrl.activeFilters);
        if (fromUrl.searchTerm) { setSearchTerm(fromUrl.searchTerm); urlWrittenSearch.current = fromUrl.searchTerm; }
        setUrlRead(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlSync]);

    // Once the data is here: a link can carry a value the data does not have (or spell it in another case) — keep what
    // exists, under its exact spelling, drop the rest.
    useEffect(() => {
        if (!urlSync || !urlRead || urlCleaned.current || loading || !items.length) return;
        urlCleaned.current = true;
        const universe = Object.fromEntries(urlFilters.map((f) => [f.field, getUniqueValues(items, f.field, lang, defaultLang, fieldLabels).map((o) => o.value)]));
        setActiveFilters((prev) => canonicalFilterState(prev, universe));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlSync, urlRead, loading, items]);

    // Write on every change — replaceState, not pushState: typing must not fill the history, and the page that is left
    // (to open a card) already carries the state, so "back" returns to the same search. Typing is debounced.
    useEffect(() => {
        if (!urlSync || !urlRead) return;
        // only a term being TYPED waits: clearing (the box emptied, or "Filters wissen") is written at once
        const typing = searchTerm !== '' && searchTerm !== urlWrittenSearch.current;
        const write = () => {
            urlWrittenSearch.current = searchTerm;
            try {
                const next = writeFilterState(window.location.href, urlFilters, activeFilters, searchTerm, { prefix: urlPrefix });
                if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, '', next);
            } catch { /* a sandboxed frame or an unusual origin may refuse — the filters still work, just not in the URL */ }
        };
        if (!typing) { write(); return undefined; }
        const timer = setTimeout(write, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFilters, searchTerm, urlRead, urlSync]);
    // Opt-in: start with an empty results area instead of showing every item — only
    // meaningful with an actual filter bar to interact with (hideUntilFiltered on a block
    // with no search/filters at all would leave it permanently empty, no way to reveal
    // anything), so hasFilterBar gates it even if the block config sets the flag anyway.
    const hideUntilFiltered = hasFilterBar && filterBarConfig.hideUntilFiltered && !hasActive;
    const displayItems = hideUntilFiltered ? [] : applyUserFilters(items, activeFilters, searchTerm, filterBarConfig, lang, defaultLang);
    // Under the bar, above the results — also at 0 (next to the "no results" message). Not while loading, after an
    // error, or in the deliberately empty "choose a filter first" state, where there is nothing to count yet.
    const countText = hasFilterBar && !loading && !error && !hideUntilFiltered
        ? resultCountText(displayItems.length, strings, lang, defaultLang) : null;

    const buildHref = (item) => detailUrlBuilder ? detailUrlBuilder(item) : defaultDetailUrl(item, fieldMap, collection, lang, defaultLang);

    // role="status": a screen reader announces the new count as the visitor filters or types
    const countLine = countText ? <div className="sui-dyn-result-count" role="status">{countText}</div> : null;

    const gridContent = (
        <>
            {loading && (
                <div className="sui-dyn-grid" style={{ '--sui-dyn-cols': Math.min(cols, 6) }}>
                    {Array.from({ length: Math.min(cols * 2, 12) }).map((_, i) => <div key={i} className="sui-dyn-skeleton" />)}
                </div>
            )}
            {!loading && error && <p className="sui-dyn-error">⚠ {error}</p>}
            {!loading && !error && displayItems.length === 0 && (
                <p className="sui-dyn-no-items">{hideUntilFiltered ? strings.startPrompt : strings.noResults}</p>
            )}
            {!loading && !error && displayItems.length > 0 && (
                <div className="sui-dyn-grid" style={{ '--sui-dyn-cols': Math.min(cols, 6) }}>
                    {displayItems.map(item => {
                        // contact-card renders its own <a> action buttons — never wrap the
                        // whole card in an outer <a>, that'd nest interactive elements.
                        const href = cardDesign === 'contact-card' ? '' : buildHref(item);
                        const Wrap = href ? 'a' : 'article';
                        return (
                            <Wrap key={item.id ?? item.name} className={`sui-dyn-card sui-dyn-card-${cardDesign}`} {...(href ? { href } : {})}>
                                <PreviewCard item={item} design={cardDesign} fieldMap={fieldMap} collection={collection} detailUrlBuilder={detailUrlBuilder} dateLocale={dateLocale} strings={strings} lang={lang} defaultLang={defaultLang} fieldLabels={fieldLabels} />
                            </Wrap>
                        );
                    })}
                </div>
            )}
        </>
    );

    return (
        <section className="sui-dyn-wrap">
            {title && <h2 className="sui-dyn-title">{title}</h2>}

            {hasFilterBar ? (
                <div className={`sui-dyn-layout sui-dyn-layout--${pos}`}>
                    {(pos === 'right' || pos === 'bottom') ? (
                        <>
                            <div className="sui-dyn-grid-wrap">{countLine}{gridContent}</div>
                            <FilterBar allItems={items} filterBar={filterBarConfig} activeFilters={activeFilters} searchTerm={searchTerm}
                                setActiveFilters={setActiveFilters} setSearchTerm={setSearchTerm} hasActive={hasActive} onReset={resetFilters}
                                strings={strings} lang={lang} defaultLang={defaultLang} fieldLabels={fieldLabels} debug={debug} />
                        </>
                    ) : (
                        <>
                            <FilterBar allItems={items} filterBar={filterBarConfig} activeFilters={activeFilters} searchTerm={searchTerm}
                                setActiveFilters={setActiveFilters} setSearchTerm={setSearchTerm} hasActive={hasActive} onReset={resetFilters}
                                strings={strings} lang={lang} defaultLang={defaultLang} fieldLabels={fieldLabels} debug={debug} />
                            <div className="sui-dyn-grid-wrap">{countLine}{gridContent}</div>
                        </>
                    )}
                </div>
            ) : gridContent}
        </section>
    );
}
