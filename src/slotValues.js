// slotValues.js — what a card's slot reads from an item, as pure functions (no React): the path through populated references
// and arrays, which of several values a slot shows ("first", "last", "random", "all"), a reference as text, an enum as its
// translated label. DynamicContentGrid.jsx draws the card from these, and orderItems.js sorts by them — so a list is ordered by
// exactly what its cards show.

export const isIndex = (key) => /^\d+$/.test(key);

/**
 * Every value on a path, in order — the service card's counterpart of getByPath. A path that runs through an ARRAY
 * ("categories.image") yields one value per element; an array that is the value itself ("ageGroups") yields its
 * elements; an explicit index ("categories.0.image") picks that element. A missing value keeps its place (undefined),
 * so "the first category" stays the first category even when it has no drawing.
 */
export function valuesByPath(item, path, lang, defaultLang) {
    if (!item || !path) return [];
    const parts = path.split('.');
    let layer = [item];
    parts.forEach((part, i) => {
        const last = i === parts.length - 1;
        const read = (node) => {
            if (Array.isArray(node)) return isIndex(part) ? [node[Number(part)]] : node.flatMap(read);
            if (node == null || typeof node !== 'object') return [];
            let v = node[part];
            if (last && lang && lang !== defaultLang) {
                const translated = node[`${part}__i18n__${lang}`];
                if (translated != null && translated !== '') v = translated;
            }
            return [v];
        };
        layer = layer.flatMap(read);
    });
    return layer.flatMap((v) => (Array.isArray(v) ? v : [v]));
}

// A populated reference ({id, name, ...}) shown as text: its name/title; anything else as plain text.
export const asText = (v) => (v != null && typeof v === 'object' ? String(v.name ?? v.title ?? '') : String(v ?? '')).trim();

export const hasValue = (v) => v != null && v !== '' && !(typeof v === 'object' && !asText(v) && !v.image && !v.url);

// Which of a slot's values the card shows: fieldMap[`${slot}Pick`] — "first" (the default: a service's first category
// is its main one), "last", "random" (stable: the same card always shows the same one), "all" (joined with commas) or
// "all:3" (at most 3). Anything else is "first".
export function parsePick(raw) {
    const m = /^(first|last|random|all)(?::(\d+))?$/.exec(String(raw ?? ''));
    return m ? { mode: m[1], max: m[2] ? Number(m[2]) : null } : { mode: 'first', max: null };
}

// A number from the item alone, so "random" never changes between renders, reloads or the server and the browser.
export function stableIndex(item, n) {
    const key = String(item?.id ?? item?.name ?? '');
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return h % n;
}

// Resolves ONE already-extracted raw value (never an array itself — resolveFilterOptions,
// below, is what unwraps an array field into one call per element) into its {value, label}
// filter-option shape. Two cases beyond the plain-scalar fallthrough:
//  - A populated reference field/array element (e.g. bare "subregion", or one element of
//    "categories" — api_server's public_router.js nests the referenced entity(ies) under
//    the Key/ref field's own name) resolves via getByPath as an OBJECT, not a scalar.
//    String(object) renders as the useless "[object Object]" — its .id is the actual
//    comparable value, .name/.title the label — preferring that referenced record's own
//    `name__i18n__<lang>`/`title__i18n__<lang>` when present, same precedence/convention
//    getByPath above and lib/i18n.ts's `t()` use for every other __i18n__ read: the public
//    API never resolves __i18n__ server-side, so every language variant sits right there
//    as its own top-level key on the nested object, same as on `item` itself.
//  - A fixed-enum value (scalar or array-of-strings, e.g. a status field or
//    Service.ageGroups) swaps the raw stored value for its swagger-declared, translated
//    label when one's available, same source/precedence (i18n variant first, default label
//    second) resolveSpecValue (registry.js) uses for the specs block's own multi-enum
//    rendering — model_helpers.js emits x-enum-labels/x-enum-labels-i18n identically for a
//    scalar `values` field and an array's `itemValues`, both living directly on the
//    field's own entry, so this needs no array-specific lookup shape.
// fieldLabels (optional — every call that only cares about `.value`, like
// applyUserFilters' matching below, is unaffected by leaving it out) is the same
// {[field]: {enumLabels, enumLabelsI18n, ...}} shape admin_client's registry.js
// buildFieldLabels already produces from a resource's swagger schema properties. Swagger
// is a public endpoint, so both apps can build this the same way; DynamicContentGrid
// itself can't import registry.js's buildFieldLabels directly (separate package), so each
// app's own thin wrapper builds it and passes it in as a prop.
export function resolveOptionValue(raw, field, lang, defaultLang, fieldLabels) {
    if (raw == null || raw === '') return { value: '', label: '' };

    if (typeof raw === 'object' && !Array.isArray(raw)) {
        const id = raw.id ?? raw.name ?? raw.title;
        const translatedLabel = lang && lang !== defaultLang
            ? (raw[`name__i18n__${lang}`] || raw[`title__i18n__${lang}`])
            : null;
        const label = translatedLabel || raw.name || raw.title || id;
        // A populated-but-empty reference object ({} — no id/name/title at all, distinct
        // from the reference being unset entirely) must also resolve to "no option"
        // rather than the value "undefined".
        if (id == null) return { value: '', label: '' };
        const value = String(id);
        return { value, label: label != null ? String(label) : value };
    }
    const value = String(raw).trim();
    const enumLabels = fieldLabels?.[field]?.enumLabels;
    if (value && enumLabels) {
        const i18n = fieldLabels[field].enumLabelsI18n;
        if (lang && lang !== defaultLang && i18n?.[value]?.[lang]) return { value, label: i18n[value][lang] };
        if (enumLabels[value]) return { value, label: enumLabels[value] };
    }
    return { value, label: value };
}

