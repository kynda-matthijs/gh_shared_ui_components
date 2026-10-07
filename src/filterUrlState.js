// filterUrlState.js — a dynamic block's filter state <-> the page's URL, so a search can be bookmarked and shared.
//
// Pure functions (no window, no React) — DynamicContentGrid.jsx does the reading on mount and the writing on change.
//
//   ?categories=12&subregion.id=3&ageGroups=adults&ageGroups=seniors&q=taal
//
// One parameter per filter, named after the filter's `field` (stable — a label can be renamed or translated, the field
// cannot); a filter with several chosen values (checkboxes) repeats it; the search term is `q`. Parameters this module
// does not own — the language, a campaign tag, a #hash — are left exactly as they were. `prefix` namespaces all of it
// ("block7.categories") for a page that holds several grids with the same filters.

const SEARCH_PARAM = 'q';
const MAX_SEARCH_LENGTH = 200;

/** Which filters allow only one value (the others allow several). */
const isSingle = (filter) => filter.type === 'select' || filter.type === 'radio';

/**
 * @param search   location.search
 * @param filters  the block's filter definitions ({ field, type, … }) — only those with a `field`
 * @returns { activeFilters: { [field]: string[] }, searchTerm: string } — only what the URL actually says
 */
export function readFilterState(search, filters, { searchEnabled = false, prefix = '' } = {}) {
    const params = new URLSearchParams(search);
    const activeFilters = {};
    for (const filter of filters) {
        if (!filter.field) continue;
        const values = params.getAll(prefix + filter.field).map((v) => v.trim()).filter(Boolean);
        if (values.length) activeFilters[filter.field] = isSingle(filter) ? values.slice(0, 1) : [...new Set(values)];
    }
    const searchTerm = searchEnabled ? (params.get(prefix + SEARCH_PARAM) ?? '').slice(0, MAX_SEARCH_LENGTH) : '';
    return { activeFilters, searchTerm };
}

/**
 * @param href  the current location.href
 * @returns the path + query + hash to put in the address bar: the filter state written over whatever this module owns
 *          there, everything else kept
 */
export function writeFilterState(href, filters, activeFilters, searchTerm, { prefix = '' } = {}) {
    const url = new URL(href);
    for (const filter of filters) if (filter.field) url.searchParams.delete(prefix + filter.field);
    url.searchParams.delete(prefix + SEARCH_PARAM);
    for (const filter of filters) {
        if (!filter.field) continue;
        for (const value of activeFilters[filter.field] ?? []) url.searchParams.append(prefix + filter.field, value);
    }
    if (searchTerm) url.searchParams.set(prefix + SEARCH_PARAM, searchTerm);
    return url.pathname + url.search + url.hash;
}

/**
 * A link can carry a value the data does not (any more) have, or spell a real one in another case. Keep what exists,
 * under its exact spelling (the visible <select> needs the option's own value), and drop the rest — otherwise a stale
 * link would filter the results by a value the dropdown cannot show.
 * @param universe  { [field]: string[] } — every value each filter really offers
 */
export function canonicalFilterState(activeFilters, universe) {
    const out = {};
    for (const [field, values] of Object.entries(activeFilters)) {
        const byLower = new Map((universe[field] ?? []).map((v) => [String(v).toLowerCase(), v]));
        const kept = [...new Set(values.map((v) => byLower.get(String(v).toLowerCase())).filter((v) => v !== undefined))];
        if (kept.length) out[field] = kept;
    }
    return out;
}
