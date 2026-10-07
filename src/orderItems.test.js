// orderItems (orderItems.js): the order a dynamic block's author chose. Run with `npm test` (node's own test runner — no dependencies).
import test from 'node:test';
import assert from 'node:assert/strict';
import { orderItems } from './orderItems.js';
import { stableIndex } from './slotValues.js';

const names = (items) => items.map((i) => i.name);
const order = (items, orderBy, fieldMap = { heading: 'name' }, options = {}) => names(orderItems(items, orderBy, fieldMap, options));
const asc = { slot: 'heading', dir: 'asc' };

test('without an order, or without a field behind the slot, the items stay as they are (the very same array)', () => {
    const items = [{ name: 'b' }, { name: 'a' }];
    assert.equal(orderItems(items, undefined, { heading: 'name' }), items);
    assert.equal(orderItems(items, { slot: 'heading', dir: 'asc' }, {}), items);
    assert.equal(orderItems(items, { slot: 'nope' }, { heading: 'name' }), items);
});

test('it never reorders the array it is given', () => {
    const items = [{ name: 'b' }, { name: 'a' }];
    orderItems(items, asc, { heading: 'name' });
    assert.deepEqual(names(items), ['b', 'a']);
});

test('text is alphabetical, ascending and descending', () => {
    const items = [{ name: 'Wijkcentrum' }, { name: 'Inloop' }, { name: 'Voedselbank' }];
    assert.deepEqual(order(items, asc), ['Inloop', 'Voedselbank', 'Wijkcentrum']);
    assert.deepEqual(order(items, { slot: 'heading', dir: 'desc' }), ['Wijkcentrum', 'Voedselbank', 'Inloop']);
});

test('text ignores capitals and accents, in the page\'s language', () => {
    const items = [{ name: 'zebra' }, { name: 'Émile' }, { name: 'Ada' }, { name: 'emile-2' }];
    assert.deepEqual(order(items, asc, { heading: 'name' }, { lang: 'fr' }), ['Ada', 'Émile', 'emile-2', 'zebra']);
    // Swedish puts å after z — the language decides
    assert.deepEqual(order([{ name: 'å' }, { name: 'z' }, { name: 'a' }], asc, { heading: 'name' }, { lang: 'sv' }), ['a', 'z', 'å']);
});

test('capitals and accents alone do not decide: names that differ only in them are equal, and keep their order', () => {
    assert.deepEqual(order([{ name: 'zeta' }, { name: 'Alpha' }, { name: 'alpha' }], asc), ['Alpha', 'alpha', 'zeta']);
    assert.deepEqual(order([{ name: 'résumé' }, { name: 'resume' }, { name: 'Résumé' }], asc, { heading: 'name' }, { lang: 'fr' }), ['résumé', 'resume', 'Résumé']);
});

test('a number is numeric — 9 before 10, not after', () => {
    const items = [{ name: 'x', n: 10 }, { name: 'y', n: 9 }, { name: 'z', n: 100 }];
    const by = { slot: 'number', dir: 'asc', kind: 'number' };
    assert.deepEqual(order(items, by, { number: 'n' }), ['y', 'x', 'z']);
    assert.deepEqual(order(items, { ...by, dir: 'desc' }, { number: 'n' }), ['z', 'x', 'y']);
});

test('the same numbers as text would sort alphabetically — the kind decides', () => {
    const items = [{ name: 'x', n: 10 }, { name: 'y', n: 9 }, { name: 'z', n: 100 }];
    assert.deepEqual(order(items, { slot: 'number', dir: 'asc', kind: 'text' }, { number: 'n' }), ['x', 'z', 'y']);
});

test('numbers that arrive as strings are still numbers when the kind says so', () => {
    const items = [{ name: 'x', n: '10' }, { name: 'y', n: '9' }];
    assert.deepEqual(order(items, { slot: 'number', dir: 'asc', kind: 'number' }, { number: 'n' }), ['y', 'x']);
});

test('a date is its moment in time, not its text', () => {
    const items = [
        { name: 'late', d: '2026-10-07T09:00:00.000Z' },
        { name: 'early', d: '2025-01-31T23:59:00.000Z' },
        { name: 'mid', d: '2026-02-01' },
    ];
    const by = { slot: 'date', dir: 'asc', kind: 'date' };
    assert.deepEqual(order(items, by, { date: 'd' }), ['early', 'mid', 'late']);
    assert.deepEqual(order(items, { ...by, dir: 'desc' }, { date: 'd' }), ['late', 'mid', 'early']);
});

test('without a kind it is read off the values: all numbers, all dates, else text', () => {
    assert.deepEqual(order([{ name: 'x', n: 10 }, { name: 'y', n: 9 }], { slot: 'number', dir: 'asc' }, { number: 'n' }), ['y', 'x']);
    assert.deepEqual(order([{ name: 'a', d: '2026-03-01' }, { name: 'b', d: '2026-02-01' }], { slot: 'date', dir: 'asc' }, { date: 'd' }), ['b', 'a']);
    assert.deepEqual(order([{ name: 'a', t: '10' }, { name: 'b', t: 'x9' }, { name: 'c', t: '9' }], { slot: 'text', dir: 'asc' }, { text: 't' }), ['a', 'c', 'b']);
});

test('an item with nothing to order by comes last, ascending or descending', () => {
    const items = [{ name: 'none', n: null }, { name: 'two', n: 2 }, { name: 'missing' }, { name: 'one', n: 1 }, { name: 'blank', n: '' }];
    const by = { slot: 'number', dir: 'asc', kind: 'number' };
    assert.deepEqual(order(items, by, { number: 'n' }), ['one', 'two', 'none', 'missing', 'blank']);
    assert.deepEqual(order(items, { ...by, dir: 'desc' }, { number: 'n' }), ['two', 'one', 'none', 'missing', 'blank']);
});

test('what is no number or no date has nothing to order by either', () => {
    const items = [{ name: 'text', n: 'abc' }, { name: 'five', n: 5 }, { name: 'ref', n: { id: 1, name: 'x' } }];
    assert.deepEqual(order(items, { slot: 'number', dir: 'asc', kind: 'number' }, { number: 'n' }), ['five', 'text', 'ref']);
    assert.deepEqual(order([{ name: 'bad', d: 'not a date' }, { name: 'ok', d: '2026-01-01' }], { slot: 'date', dir: 'asc', kind: 'date' }, { date: 'd' }), ['ok', 'bad']);
});

test('equal items keep the order they came in, both ways', () => {
    const items = [{ name: 'first', n: 1 }, { name: 'second', n: 1 }, { name: 'third', n: 1 }];
    const by = { slot: 'number', dir: 'asc', kind: 'number' };
    assert.deepEqual(order(items, by, { number: 'n' }), ['first', 'second', 'third']);
    assert.deepEqual(order(items, { ...by, dir: 'desc' }, { number: 'n' }), ['first', 'second', 'third']);
});

test('a populated reference is ordered by its name, in the page\'s language when it has one', () => {
    const items = [
        { name: 'a', organisation: { id: 1, name: 'Zuid', name__i18n__en: 'South' } },
        { name: 'b', organisation: { id: 2, name: 'Noord', name__i18n__en: 'North' } },
        { name: 'c', organisation: { id: 3, name: 'Oost', name__i18n__en: 'Aardvark' } },
    ];
    const map = { meta1: 'organisation' };
    assert.deepEqual(order(items, { slot: 'meta1', dir: 'asc' }, map, { lang: 'nl', defaultLang: 'nl' }), ['b', 'c', 'a']);
    assert.deepEqual(order(items, { slot: 'meta1', dir: 'asc' }, map, { lang: 'en', defaultLang: 'nl' }), ['c', 'b', 'a']);
});

test('a path through a reference ("organisation.name") and through an array ("categories.name") both work', () => {
    const items = [
        { name: 'a', organisation: { name: 'Zuid' }, categories: [{ name: 'Werk' }, { name: 'Eten' }] },
        { name: 'b', organisation: { name: 'Noord' }, categories: [{ name: 'Geld' }] },
    ];
    assert.deepEqual(order(items, { slot: 'meta1', dir: 'asc' }, { meta1: 'organisation.name' }), ['b', 'a']);
    assert.deepEqual(order(items, { slot: 'meta1', dir: 'asc' }, { meta1: 'categories.name' }), ['b', 'a']);                        // the first category by default: Geld, Werk
    assert.deepEqual(order(items, { slot: 'meta1', dir: 'asc' }, { meta1: 'categories.name', meta1Pick: 'last' }), ['a', 'b']);   // the last: Eten, Geld
});

test('a list is ordered by the value the card shows for it — "first", "last", "all"', () => {
    const items = [
        { name: 'a', categories: [{ name: 'B' }, { name: 'Z' }] },
        { name: 'b', categories: [{ name: 'C' }, { name: 'A' }] },
    ];
    const by = { slot: 'meta1', dir: 'asc' };
    assert.deepEqual(order(items, by, { meta1: 'categories.name', meta1Pick: 'first' }), ['a', 'b']);   // B, C
    assert.deepEqual(order(items, by, { meta1: 'categories.name', meta1Pick: 'last' }), ['b', 'a']);    // A, Z
    assert.deepEqual(order(items, by, { meta1: 'categories.name', meta1Pick: 'all:3' }), ['a', 'b']);   // the first stands for all: B, C
});

test('"first" is positional: a first category without a value counts as empty, as on the card', () => {
    const items = [{ name: 'a', categories: [{ id: 1 }, { name: 'A' }] }, { name: 'b', categories: [{ name: 'M' }] }];
    assert.deepEqual(order(items, { slot: 'meta1', dir: 'asc' }, { meta1: 'categories.name' }), ['b', 'a']);
});

test('random is the card\'s random: ordered by the very value the card shows, and the same every time', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `n${i}`, categories: [{ name: 'B' }, { name: 'A' }, { name: 'C' }] }));
    const shown = (item) => ['B', 'A', 'C'][stableIndex(item, 3)];     // what the card's "random" shows for this item
    const expected = items.map((item, index) => ({ item, index, key: shown(item) }))
        .sort((x, y) => x.key.localeCompare(y.key) || x.index - y.index).map((e) => e.item.name);
    const by = { slot: 'meta1', dir: 'asc' };
    const once = names(orderItems(items, by, { meta1: 'categories.name', meta1Pick: 'random' }));
    assert.deepEqual(once, expected);
    assert.notDeepEqual(once, names(orderItems(items, by, { meta1: 'categories.name', meta1Pick: 'first' })));   // it is not the first one
    assert.deepEqual(names(orderItems(items, by, { meta1: 'categories.name', meta1Pick: 'random' })), once);
});

test('an enum is ordered by its label in the page\'s language, not its stored code', () => {
    const fieldLabels = { cost: { enumLabels: { free: 'Zonder kosten', paid: 'Betaald' }, enumLabelsI18n: { free: { en: 'Free' }, paid: { en: 'Paid' } } } };
    const items = [{ name: 'a', cost: 'free' }, { name: 'b', cost: 'paid' }];
    const by = { slot: 'feature1', dir: 'asc' };
    assert.deepEqual(order(items, by, { feature1: 'cost' }, { lang: 'nl', defaultLang: 'nl', fieldLabels }), ['b', 'a']);   // Betaald < Zonder kosten (code order would be free < paid)
    assert.deepEqual(order(items, by, { feature1: 'cost' }, { lang: 'en', defaultLang: 'nl', fieldLabels }), ['a', 'b']);   // Free < Paid
});

test('a nonsense language tag does not break the order', () => {
    assert.deepEqual(order([{ name: 'b' }, { name: 'a' }], asc, { heading: 'name' }, { lang: 'not a tag!' }), ['a', 'b']);
});
