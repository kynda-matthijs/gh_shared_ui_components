// orderItems.js — put the items of a dynamic block in the order its author chose.
//
// The author picks one of the card's connected fields (a slot: "Naam", "Onderregel — wijk", "Kenmerk 1" …) as the field to order by,
// ascending or descending: block.orderBy = { slot, dir: 'asc' | 'desc', kind: 'text' | 'number' | 'date' }. The key an item is
// ordered by is the value its card SHOWS for that slot — the same path through populated references and arrays, the same
// "which one" (`<slot>Pick`) and, for text, the same translated label (slotValues.js) — so the list reads in the order it is sorted.
//
//   number, date   in numeric order (a date is its moment in time, a true/false is 1/0)
//   text           alphabetically, by the page's language ("é" next to "e", capitals ignored)
//
// An item with nothing to order by comes last, whichever way it is going; items that compare equal keep the order they came in.
// `kind` says how to compare — the editor knows it from the field's type in the schema. Without it, it is read off the values:
// all numbers, all dates, or else text.
import { valuesByPath, hasValue, parsePick, stableIndex, resolveOptionValue } from './slotValues.js';

export const ORDER_KINDS = ['text', 'number', 'date'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}.*)?$/;

// The value of the slot for one item, before it is turned into something to compare: the one the card shows. A card shows ONE of
// a list's values ("first" by default, or "last", or a stable random one); "all" of them has no single value, so the first with
// a value stands for it.
function slotRaw(item, path, pick, lang, defaultLang) {
    const values = valuesByPath(item, path, lang, defaultLang);
    const filled = values.filter(hasValue);
    switch (pick.mode) {
        case 'last': return values[values.length - 1];
        case 'random': return filled.length ? filled[stableIndex(item, filled.length)] : undefined;
        case 'all': return filled[0];
        default: return values[0];
    }
}

const isDateLike = (v) => v instanceof Date || (typeof v === 'string' && ISO_DATE.test(v.trim()) && !Number.isNaN(Date.parse(v)));

function inferKind(raws) {
    const filled = raws.filter(hasValue);
    if (filled.length === 0) return 'text';
    if (filled.every((v) => typeof v === 'number' || typeof v === 'boolean')) return 'number';
    if (filled.every(isDateLike)) return 'date';
    return 'text';
}

// What to compare, or null when there is nothing (an empty value, or one that is no number / no date).
function sortKey(raw, kind, path, lang, defaultLang, fieldLabels) {
    if (raw == null || raw === '') return null;
    if (kind === 'number') {
        if (typeof raw === 'object') return null;
        const n = Number(raw);   // a boolean is 1 or 0
        return Number.isNaN(n) ? null : n;
    }
    if (kind === 'date') {
        const t = raw instanceof Date ? raw.getTime() : (typeof raw === 'object' ? NaN : Date.parse(String(raw)));
        return Number.isNaN(t) ? null : t;
    }
    const label = resolveOptionValue(raw, path, lang, defaultLang, fieldLabels).label;
    return label ? label : null;
}

function collatorFor(lang) {
    try { return new Intl.Collator(lang || undefined, { sensitivity: 'base' }); }
    catch { return new Intl.Collator(undefined, { sensitivity: 'base' }); }   // not a language tag
}

/**
 * @param {object[]} items
 * @param {{slot: string, dir?: 'asc'|'desc', kind?: 'text'|'number'|'date'}} [order] - block.orderBy; none: the items as they are
 * @param {Record<string,string>} fieldMap - the block's slot → field path map (and its `<slot>Pick` settings)
 * @param {{lang?: string, defaultLang?: string, fieldLabels?: object}} [options]
 * @returns {object[]} a new array (never the one given, unless there is nothing to order by)
 */
export function orderItems(items, order, fieldMap, { lang, defaultLang, fieldLabels } = {}) {
    const slot = order?.slot;
    const path = slot ? fieldMap?.[slot] : null;
    if (!Array.isArray(items) || !path) return items;

    const pick = parsePick(fieldMap[`${slot}Pick`]);
    const raws = items.map((item) => slotRaw(item, path, pick, lang, defaultLang));
    const kind = ORDER_KINDS.includes(order.kind) ? order.kind : inferKind(raws);
    const direction = order.dir === 'desc' ? -1 : 1;
    const collator = collatorFor(lang || defaultLang);
    const compare = kind === 'text' ? (a, b) => collator.compare(a, b) : (a, b) => a - b;

    return items
        .map((item, index) => ({ item, index, key: sortKey(raws[index], kind, path, lang, defaultLang, fieldLabels) }))
        .sort((x, y) => {
            if (x.key == null || y.key == null) return x.key == null && y.key == null ? x.index - y.index : x.key == null ? 1 : -1;   // empty last
            return direction * compare(x.key, y.key) || x.index - y.index;
        })
        .map((entry) => entry.item);
}
