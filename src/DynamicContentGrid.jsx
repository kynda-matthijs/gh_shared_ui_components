import { useState } from 'react';
import { Image as ImageIcon, User as UserIcon, Folder as FolderIcon } from 'lucide-react';
import ActionButtons from './ActionButtons.jsx';

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

// A filter field that targets a reference's raw id (e.g. "subregion.id" — api_server's
// public_router.js populates every Key/ref schema field, so the referenced entity is
// already nested at "subregion") reads as a bare id with no extra fetch needed, but the id
// itself makes a poor dropdown label. Its sibling "subregion.name" is the human-readable
// name of that same already-populated object — reusing this same getByPath (see its own
// docstring, which already cites "subregion.name" as the canonical dot-path example) is all
// that's needed to resolve it, same convention already used for card fieldMap slots.
function getFilterOptionLabel(item, field, lang, defaultLang) {
    if (!field.endsWith('.id')) return null;
    const parentPath = field.slice(0, -'.id'.length);
    const label = getByPath(item, `${parentPath}.name`, lang, defaultLang)
        || getByPath(item, `${parentPath}.title`, lang, defaultLang);
    return label ? String(label) : null;
}

function getUniqueValues(items, field, lang, defaultLang, debug) {
    const counts = {};
    const labels = {};
    for (const item of items) {
        const val = String(getByPath(item, field, lang, defaultLang) ?? '').trim();
        if (!val) continue;
        counts[val] = (counts[val] ?? 0) + 1;
        if (!labels[val]) {
            const label = getFilterOptionLabel(item, field, lang, defaultLang);
            if (label) labels[val] = label;
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
        result = result.filter(item => valSet.has(String(getByPath(item, field, lang, defaultLang) ?? '').toLowerCase()));
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

function PreviewCard({ item, design, fieldMap, collection, detailUrlBuilder, dateLocale, strings, lang, defaultLang }) {
    const g = (slot) => {
        const field = fieldMap[slot];
        return field ? getByPath(item, field, lang, defaultLang) : '';
    };

    switch (design) {
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

function FilterBar({ allItems, filterBar, activeFilters, searchTerm, setActiveFilters, setSearchTerm, strings, lang, defaultLang, debug }) {
    const fb = filterBar ?? {};
    const hasSearch = fb.searchEnabled;
    const sortedFilters = (fb.filters ?? []).filter(f => f.field).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!hasSearch && sortedFilters.length === 0) return null;

    return (
        <div className={`sui-dyn-filterbar sui-dyn-filterbar--${fb.layout ?? 'horizontal'}`}>
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
            {sortedFilters.map(filterDef => {
                const options = getUniqueValues(allItems, filterDef.field, lang, defaultLang, debug);
                if (options.length <= 1) return null;
                const selected = activeFilters[filterDef.field] ?? [];
                const label = filterDef.label || filterDef.field;
                return (
                    <div key={filterDef.id} className="sui-dyn-filter-group">
                        <span className="sui-dyn-filter-label">{label}</span>
                        {filterDef.type === 'select' ? (
                            <select className="sui-dyn-filter-select" value={selected[0] ?? ''}
                                onChange={e => setActiveFilters(prev => ({ ...prev, [filterDef.field]: e.target.value ? [e.target.value] : [] }))}>
                                <option value="">{strings.all}</option>
                                {options.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}{filterDef.showCount ? ` (${o.count})` : ''}</option>
                                ))}
                            </select>
                        ) : (
                            <div className={`sui-dyn-filter-options sui-dyn-filter-options--${filterDef.type ?? 'checkbox'}`}>
                                {options.map(o => (
                                    <label key={o.value} className="sui-dyn-filter-option">
                                        <input
                                            type={filterDef.type === 'radio' ? 'radio' : 'checkbox'}
                                            name={`sui-dyn-filter-${filterDef.id}`}
                                            value={o.value}
                                            checked={filterDef.type === 'radio' ? selected[0] === o.value : selected.includes(o.value)}
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
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

const DEFAULT_STRINGS = {
    noResults: 'No results found.', all: 'All', clearFilters: '× Clear filters', search: 'Search',
    call: 'Call', email: 'Email', website: 'Website', route: 'Directions', moreInfo: 'More info',
};

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
    // Admin-only diagnostic toggle — never set true on the published site. See
    // getUniqueValues' own comment for exactly what it logs and why.
    debug = false,
}) {
    const strings = { ...DEFAULT_STRINGS, ...stringsProp };
    const [activeFilters, setActiveFilters] = useState({});
    const [searchTerm, setSearchTerm] = useState('');

    const displayItems = applyUserFilters(items, activeFilters, searchTerm, filterBarConfig, lang, defaultLang);
    const hasFilterBar = filterBarConfig.enabled && (filterBarConfig.searchEnabled || (filterBarConfig.filters ?? []).some(f => f.field));
    const pos = filterBarConfig.position ?? 'top';
    const hasActive = searchTerm.length > 0 || Object.values(activeFilters).some(v => v.length > 0);

    const buildHref = (item) => detailUrlBuilder ? detailUrlBuilder(item) : defaultDetailUrl(item, fieldMap, collection, lang, defaultLang);

    const gridContent = (
        <>
            {loading && (
                <div className="sui-dyn-grid" style={{ '--sui-dyn-cols': Math.min(cols, 4) }}>
                    {Array.from({ length: Math.min(cols * 2, 6) }).map((_, i) => <div key={i} className="sui-dyn-skeleton" />)}
                </div>
            )}
            {!loading && error && <p className="sui-dyn-error">⚠ {error}</p>}
            {!loading && !error && displayItems.length === 0 && <p className="sui-dyn-no-items">{strings.noResults}</p>}
            {!loading && !error && displayItems.length > 0 && (
                <div className="sui-dyn-grid" style={{ '--sui-dyn-cols': Math.min(cols, 4) }}>
                    {displayItems.map(item => {
                        // contact-card renders its own <a> action buttons — never wrap the
                        // whole card in an outer <a>, that'd nest interactive elements.
                        const href = cardDesign === 'contact-card' ? '' : buildHref(item);
                        const Wrap = href ? 'a' : 'article';
                        return (
                            <Wrap key={item.id ?? item.name} className={`sui-dyn-card sui-dyn-card-${cardDesign}`} {...(href ? { href } : {})}>
                                <PreviewCard item={item} design={cardDesign} fieldMap={fieldMap} collection={collection} detailUrlBuilder={detailUrlBuilder} dateLocale={dateLocale} strings={strings} lang={lang} defaultLang={defaultLang} />
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
                            <div className="sui-dyn-grid-wrap">{gridContent}</div>
                            <FilterBar allItems={items} filterBar={filterBarConfig} activeFilters={activeFilters} searchTerm={searchTerm}
                                setActiveFilters={setActiveFilters} setSearchTerm={setSearchTerm} strings={strings} lang={lang} defaultLang={defaultLang} debug={debug} />
                        </>
                    ) : (
                        <>
                            <FilterBar allItems={items} filterBar={filterBarConfig} activeFilters={activeFilters} searchTerm={searchTerm}
                                setActiveFilters={setActiveFilters} setSearchTerm={setSearchTerm} strings={strings} lang={lang} defaultLang={defaultLang} debug={debug} />
                            <div className="sui-dyn-grid-wrap">{gridContent}</div>
                        </>
                    )}
                    {hasActive && (
                        <button type="button" className="sui-dyn-reset-btn" onClick={() => { setActiveFilters({}); setSearchTerm(''); }}>
                            {strings.clearFilters}
                        </button>
                    )}
                </div>
            ) : gridContent}
        </section>
    );
}
