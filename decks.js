// Deck lists: built-in starter decks + decks the player builds and saves (kept in this browser).
// Deck format: { id, name, main: { cardId: count }, life: [cardId x5], builtin? }
(function (root) {
  'use strict';
  const KEY = 'tc-duel-decks-v1';
  const MAIN_SIZE = 50, LIFE_SIZE = 5, MAX_COPIES = 4;
  const byId = () => { const m = {}; (root.TC_CARDS || []).forEach(c => { m[c.id] = c; }); return m; };

  function builtins() {
    return Object.keys(root.TC_DECKS || {}).map(set => {
      const b = root.TCBot.buildDeck(root.TC_CARDS, set);
      return { id: 'starter-' + set, name: root.TC_DECKS[set].name + ' (Starter)', main: Object.assign({}, b.counts), life: b.life.map(c => c.id), builtin: true };
    });
  }
  function loadSaved() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function storeSaved(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  function all() { return builtins().concat(loadSaved()); }
  function get(id) { return all().find(d => d.id === id) || null; }
  function save(deck) {
    const list = loadSaved();
    if (!deck.id || deck.builtin || deck.id.startsWith('starter-')) deck = Object.assign({}, deck, { id: 'deck-' + Date.now().toString(36), builtin: false });
    const i = list.findIndex(d => d.id === deck.id);
    if (i >= 0) list[i] = deck; else list.push(deck);
    return storeSaved(list) ? deck : null;
  }
  function remove(id) { storeSaved(loadSaved().filter(d => d.id !== id)); }

  const limitOf = c => c.limit || (c.onlyOne ? 1 : MAX_COPIES);
  // Rule Book: 50 cards, max 4 per name (or the card's own limit), exactly one "Only #1" card, LIFE 5 with distinct names.
  function validate(deck) {
    const cards = byId();
    const problems = [];
    let total = 0, only = 0;
    const perName = {}, nameLimit = {};
    Object.entries(deck.main || {}).forEach(([id, n]) => {
      const c = cards[id];
      if (!c || !n) return;
      total += n;
      if (c.onlyOne) only += n;
      perName[c.name] = (perName[c.name] || 0) + n;
      nameLimit[c.name] = Math.min(nameLimit[c.name] || Infinity, limitOf(c));
    });
    if (total !== MAIN_SIZE) problems.push(`Main Deck ต้องมี ${MAIN_SIZE} ใบพอดี (ตอนนี้ ${total})`);
    if (only !== 1) problems.push(`ต้องมีการ์ด Only #1 1 ใบพอดี (ตอนนี้ ${only})`);
    Object.entries(perName).forEach(([nm, n]) => { if (n > nameLimit[nm]) problems.push(`"${nm}" ใส่ได้ไม่เกิน ${nameLimit[nm]} ใบ (ตอนนี้ ${n})`); });
    const life = (deck.life || []).filter(id => cards[id]);
    if (life.length !== LIFE_SIZE) problems.push(`LIFE Deck ต้องมี ${LIFE_SIZE} ใบ (ตอนนี้ ${life.length})`);
    if (new Set(life.map(id => cards[id].name)).size !== life.length) problems.push('LIFE Card ต้องมีชื่อไม่ซ้ำกัน');
    return { ok: !problems.length, problems, total, only, lifeCount: life.length };
  }

  // Expand to card objects for the engine
  function expand(deck) {
    const cards = byId();
    const main = [];
    Object.entries(deck.main).forEach(([id, n]) => { for (let k = 0; k < n; k++) if (cards[id]) main.push(cards[id]); });
    return { deck: main, life: deck.life.map(id => cards[id]).filter(Boolean) };
  }

  function exportText(deck) { return JSON.stringify({ name: deck.name, main: deck.main, life: deck.life }); }
  function importText(text) {
    const d = JSON.parse(text);
    if (!d || typeof d.main !== 'object' || !Array.isArray(d.life)) throw new Error('รูปแบบไม่ถูกต้อง');
    return { name: String(d.name || 'Deck นำเข้า').slice(0, 60), main: d.main, life: d.life };
  }

  root.TCDecks = { MAIN_SIZE, LIFE_SIZE, MAX_COPIES, all, get, save, remove, validate, expand, exportText, importText, builtins, byId, limitOf };
})(typeof window !== 'undefined' ? window : globalThis);
