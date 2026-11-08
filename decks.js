// Deck lists: built-in starter decks + decks the player builds and saves (kept in this browser).
// Deck format: { id, name, main: { cardId: count }, life: [cardId x5], builtin? }
(function (root) {
  'use strict';
  const KEY = 'tc-duel-decks-v1';
  const MAIN_SIZE = 50, LIFE_SIZE = 5, MAX_COPIES = 4;
  const byId = () => { const m = {}; (root.TC_CARDS || []).forEach(c => { m[c.id] = c; }); return m; };
  // Cards printed with Only #1 that the bottcg data leaves unmarked (kept here so a fresh card import doesn't lose it)
  const ONLY1_FIX = ['BT09-071'];
  (root.TC_CARDS || []).forEach(c => { if (ONLY1_FIX.includes(c.id)) { c.onlyOne = true; c.limit = 1; } });

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
  // Only #1 means one kind of card (Avatar, Magic or Construct): normally 1 copy, but a card's own limit can allow more (พระไตรปิฎก: 3).
  // A deck made of all 50 copies of a "50 per Deck" card may leave out the Only #1 card.
  function validate(deck) {
    const cards = byId();
    const problems = [];
    let total = 0, onlyCopies = 0;
    const perName = {}, nameLimit = {}, onlyNames = new Set();
    Object.entries(deck.main || {}).forEach(([id, n]) => {
      const c = cards[id];
      if (!c || !n) return;
      total += n;
      if (c.onlyOne) { onlyNames.add(c.name); onlyCopies += n; }
      perName[c.name] = (perName[c.name] || 0) + n;
      nameLimit[c.name] = Math.min(nameLimit[c.name] || Infinity, limitOf(c));
    });
    if (total !== MAIN_SIZE) problems.push(`Main Deck ต้องมี ${MAIN_SIZE} ใบพอดี (ตอนนี้ ${total})`);
    const only = onlyNames.size;
    const names = Object.keys(perName);
    const allFifty = total === MAIN_SIZE && names.length === 1 && nameLimit[names[0]] >= MAIN_SIZE;
    if (only > 1) problems.push(`ใส่การ์ด Only #1 ได้แค่ 1 แบบ (ตอนนี้ ${only} แบบ: ${[...onlyNames].join(', ')})`);
    else if (!only && !allFifty) problems.push('ต้องมีการ์ด Only #1 1 ใบ (ตอนนี้ยังไม่มี)');
    Object.entries(perName).forEach(([nm, n]) => { if (n > nameLimit[nm]) problems.push(`"${nm}" ใส่ได้ไม่เกิน ${nameLimit[nm]} ใบ (ตอนนี้ ${n})`); });
    const life = (deck.life || []).filter(id => cards[id]);
    if (life.length !== LIFE_SIZE) problems.push(`LIFE Deck ต้องมี ${LIFE_SIZE} ใบ (ตอนนี้ ${life.length})`);
    if (new Set(life.map(id => cards[id].name)).size !== life.length) problems.push('LIFE Card ต้องมีชื่อไม่ซ้ำกัน');
    return { ok: !problems.length, problems, total, only, onlyCopies, onlyName: [...onlyNames][0] || null, allFifty, lifeCount: life.length };
  }

  // Expand to card objects for the engine
  function expand(deck) {
    const cards = byId();
    const main = [];
    Object.entries(deck.main).forEach(([id, n]) => { for (let k = 0; k < n; k++) if (cards[id]) main.push(cards[id]); });
    return { deck: main, life: deck.life.map(id => cards[id]).filter(Boolean) };
  }

  // Text format used by bottcg.com (and our export):
  //   # Deck name
  //   # Main Deck
  //   2x BT09-006-SR
  //   # Life Cards
  //   1x KD02-022-C
  // The suffix after the card number (-C, -R, -SR, -UR, -SCR, -PR ...) is only the printing, so it maps to the base card id.
  // The full codes are kept in deck.codes so an export gives back the same lines.
  const CODE_RE = /^([A-Z]{2,4}\d{0,2}-\d{3}[A-Z]?)(?:-([A-Z0-9]+))?$/i;
  function baseId(code, cards) {
    code = String(code).trim().toUpperCase();
    if (cards[code]) return code;
    const m = code.match(CODE_RE);
    if (m && cards[m[1]]) return m[1];
    // fall back: drop the last "-XXX" piece until something matches
    const parts = code.split('-');
    while (parts.length > 2) { parts.pop(); if (cards[parts.join('-')]) return parts.join('-'); }
    return null;
  }

  function exportText(deck) {
    const code = id => (deck.codes && deck.codes[id]) || id;
    const order = (a, b) => a.localeCompare(b);
    const main = Object.keys(deck.main || {}).filter(id => deck.main[id] > 0).sort(order).map(id => `${deck.main[id]}x ${code(id)}`);
    const lifeCount = {};
    (deck.life || []).forEach(id => { lifeCount[id] = (lifeCount[id] || 0) + 1; });
    const life = Object.keys(lifeCount).sort(order).map(id => `${lifeCount[id]}x ${code(id)}`);
    return `# ${deck.name || 'Deck'}\n\n# Main Deck\n${main.join('\n')}\n\n# Life Cards\n${life.join('\n')}\n`;
  }

  function parseList(text) {
    const cards = byId();
    let name = null, section = null;
    const main = {}, life = [], codes = {}, missing = [];
    String(text).replace(/\r/g, '').split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      if (line.startsWith('#') || line.startsWith('//')) {
        const h = line.replace(/^(#+|\/\/)\s*/, '').trim();
        const k = h.toLowerCase();
        if (/^main/.test(k) || k === 'deck' || k === 'เด็ค' || k === 'เด็คหลัก') section = 'main';
        else if (/^life/.test(k) || k === 'ไลฟ์') section = 'life';
        else if (name === null && h) name = h;
        return;
      }
      const m = line.match(/^(\d+)\s*[xX×]?\s+(\S+)/) || line.match(/^(\S+)\s+[xX×]?\s*(\d+)$/);
      let n, code;
      if (!m) { n = 1; code = line.split(/\s+/)[0]; }
      else if (/^\d+$/.test(m[1])) { n = +m[1]; code = m[2]; }
      else { code = m[1]; n = +m[2]; }
      const id = baseId(code, cards);
      if (!id) { missing.push(line); return; }
      codes[id] = code.toUpperCase();
      const isLife = section ? section === 'life' : cards[id].type === 'life';
      if (isLife) for (let k = 0; k < n; k++) life.push(id);
      else main[id] = (main[id] || 0) + n;
    });
    if (!Object.keys(main).length && !life.length && !missing.length) throw new Error('ไม่พบรายการการ์ด');
    return { name: (name || 'Deck นำเข้า').slice(0, 60), main, life, codes, missing };
  }

  // Accepts the bottcg text list above, or the older JSON export
  function importText(text) {
    const t = String(text || '').trim();
    if (t.startsWith('{')) {
      const d = JSON.parse(t);
      if (!d || typeof d.main !== 'object' || !Array.isArray(d.life)) throw new Error('รูปแบบไม่ถูกต้อง');
      return { name: String(d.name || 'Deck นำเข้า').slice(0, 60), main: d.main, life: d.life, missing: [] };
    }
    return parseList(t);
  }

  root.TCDecks = { MAIN_SIZE, LIFE_SIZE, MAX_COPIES, all, get, save, remove, validate, expand, exportText, importText, builtins, byId, limitOf };
})(typeof window !== 'undefined' ? window : globalThis);
