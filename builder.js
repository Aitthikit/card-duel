// Deck builder: pick cards from the full card pool, check deck rules, save to the deck list.
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const Decks = () => window.TCDecks;
  const UI = () => window.TCUI;
  const TYPE_ORDER = { avatar: 0, construct: 1, magic: 2, life: 3 };
  const MT_TH = { normal: 'Normal', modification: 'Modification', react: 'React', land: 'Land' };
  const COLOR_TH = { red: 'แดง', blue: 'ฟ้า', green: 'เขียว', purple: 'ม่วง', yellow: 'เหลือง' };

  let deck = null;     // working copy
  let onDone = null;
  let preview = null;
  let filters = { set: 'all', type: 'all', color: 'all', q: '' };

  function open(src, cb) {
    onDone = cb;
    deck = src
      ? { id: src.builtin ? null : src.id, name: src.builtin ? src.name.replace(' (Starter)', '') + ' (แก้ไข)' : src.name, main: Object.assign({}, src.main), life: src.life.slice() }
      : { id: null, name: 'Deck ใหม่', main: {}, life: [] };
    preview = null;
    $('#start').classList.add('hidden');
    $('#builder').classList.remove('hidden');
    $('#bName').value = deck.name;
    initFilters();
    renderPool();
    render();
  }

  function close(saved) {
    $('#builder').classList.add('hidden');
    $('#start').classList.remove('hidden');
    if (onDone) onDone(saved);
  }

  function initFilters() {
    const sets = [...new Set(window.TC_CARDS.map(c => c.set))].sort();
    const ss = $('#fSet');
    if (!ss.options.length) {
      ss.innerHTML = '<option value="all">ทุกชุด</option>' + sets.map(s => `<option value="${s}">${s}</option>`).join('');
      $('#fType').innerHTML = '<option value="all">ทุกประเภท</option><option value="avatar">Avatar</option><option value="construct">Construct</option><option value="magic">Magic</option><option value="life">LIFE</option>';
      $('#fColor').innerHTML = '<option value="all">ทุกสี</option>' + Object.keys(COLOR_TH).map(c => `<option value="${c}">สี${COLOR_TH[c]}</option>`).join('');
      ss.onchange = () => { filters.set = ss.value; renderPool(); };
      $('#fType').onchange = () => { filters.type = $('#fType').value; renderPool(); };
      $('#fColor').onchange = () => { filters.color = $('#fColor').value; renderPool(); };
      $('#fQ').oninput = () => { filters.q = $('#fQ').value.trim(); renderPool(); };
      $('#bName').oninput = () => { deck.name = $('#bName').value; };
      $('#bSave').onclick = saveDeck;
      $('#bCancel').onclick = () => close(null);
      $('#bClear').onclick = () => { deck.main = {}; deck.life = []; render(); };
      $('#bFill').onclick = autoFill;
    }
  }

  const byId = () => Decks().byId();
  function nameCount(name) {
    const cards = byId();
    return Object.entries(deck.main).reduce((s, [id, n]) => s + (cards[id] && cards[id].name === name ? n : 0), 0);
  }
  function mainTotal() { return Object.values(deck.main).reduce((a, b) => a + b, 0); }

  function canAdd(c) {
    if (c.type === 'life') {
      if (deck.life.length >= 5) return 'LIFE ครบ 5 ใบแล้ว';
      const cards = byId();
      if (deck.life.some(id => cards[id] && cards[id].name === c.name)) return 'LIFE Card ต้องชื่อไม่ซ้ำกัน';
      return null;
    }
    if (mainTotal() >= 50) return 'Main Deck ครบ 50 ใบแล้ว';
    if (c.onlyOne) {
      const cards = byId();
      if (Object.keys(deck.main).some(id => deck.main[id] && cards[id] && cards[id].onlyOne)) return 'ใส่การ์ด Only #1 ได้แค่ 1 ใบต่อ Deck';
    }
    const lim = Decks().limitOf(c);
    if (nameCount(c.name) >= lim) return `"${c.name}" ใส่ได้ไม่เกิน ${lim} ใบ`;
    return null;
  }

  function add(c) {
    const why = canAdd(c);
    if (why) return UI().toast(why);
    if (c.type === 'life') deck.life.push(c.id);
    else deck.main[c.id] = (deck.main[c.id] || 0) + 1;
    render();
  }
  function removeOne(id) {
    if (deck.main[id]) { deck.main[id]--; if (!deck.main[id]) delete deck.main[id]; }
    else { const i = deck.life.indexOf(id); if (i >= 0) deck.life.splice(i, 1); }
    render();
  }

  // Fill the rest of the main deck with more copies of cards already in it (cheap avatars first), then LIFE from the same sets.
  function autoFill() {
    const cards = byId();
    const ids = Object.keys(deck.main).filter(id => cards[id] && !cards[id].onlyOne).sort((a, b) => (cards[a].type === 'avatar' ? 0 : 1) - (cards[b].type === 'avatar' ? 0 : 1) || (cards[a].cost || 0) - (cards[b].cost || 0));
    let guard = 0;
    while (mainTotal() < 50 && ids.length && guard++ < 500) {
      const id = ids[guard % ids.length];
      if (!canAdd(cards[id])) deck.main[id]++;
      if (ids.every(i => canAdd(cards[i]))) break;
    }
    const sets = new Set(Object.keys(deck.main).map(id => cards[id].set));
    window.TC_CARDS.filter(c => c.type === 'life' && sets.has(c.set)).forEach(c => { if (!canAdd(c)) deck.life.push(c.id); });
    window.TC_CARDS.filter(c => c.type === 'life').forEach(c => { if (!canAdd(c)) deck.life.push(c.id); });
    render();
    if (mainTotal() < 50) UI().toast('เติมได้ไม่ครบ 50 ใบ — เพิ่มการ์ดชื่ออื่นอีก');
  }

  function saveDeck() {
    deck.name = ($('#bName').value || '').trim() || 'Deck ไม่มีชื่อ';
    const v = Decks().validate(deck);
    const saved = Decks().save(deck);
    if (!saved) return UI().toast('บันทึกไม่ได้ (เบราว์เซอร์ปิดการเก็บข้อมูลไว้)');
    deck.id = saved.id;
    UI().toast(v.ok ? 'บันทึก Deck แล้ว' : 'บันทึกแล้ว แต่ Deck ยังไม่ครบตามกฎ — ยังเลือกไปเล่นไม่ได้');
    close(saved);
  }

  function render() { renderStatus(); updatePool(); renderList(); renderPreview(); }

  function renderStatus() {
    const v = Decks().validate(deck);
    $('#bStatus').innerHTML = `<span class="${v.total === 50 ? 'ok' : ''}">Main ${v.total}/50</span><span class="${v.only === 1 ? 'ok' : ''}">Only #1 ${v.only}/1</span><span class="${v.lifeCount === 5 ? 'ok' : ''}">LIFE ${v.lifeCount}/5</span>` +
      (v.ok ? '<span class="ok">✓ พร้อมเล่น</span>' : `<span class="warn">${UI().esc(v.problems[0])}</span>`);
  }

  function poolCards() {
    const q = filters.q.toLowerCase();
    return window.TC_CARDS.filter(c =>
      (filters.set === 'all' || c.set === filters.set) &&
      (filters.type === 'all' || c.type === filters.type) &&
      (filters.color === 'all' || c.color === filters.color) &&
      (!q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || (c.text || '').toLowerCase().includes(q)));
  }

  let poolEls = {};
  function renderPool() {
    const box = $('#bPool'); box.innerHTML = ''; poolEls = {};
    const list = poolCards();
    $('#bPoolCount').textContent = `${list.length} ใบ`;
    list.forEach(c => {
      const w = document.createElement('div'); w.className = 'pcard';
      const el = UI().cardEl(c, { onclick: () => { preview = c; add(c); } });
      el.addEventListener('mouseenter', () => { preview = c; renderPreview(); });
      const b = document.createElement('div'); b.className = 'incount hidden';
      w.append(el, b);
      box.appendChild(w);
      poolEls[c.id] = { el, b, c };
    });
    updatePool();
  }
  function updatePool() {
    Object.values(poolEls).forEach(({ el, b, c }) => {
      const inDeck = c.type === 'life' ? (deck.life.includes(c.id) ? 1 : 0) : (deck.main[c.id] || 0);
      el.classList.toggle('dim', !!canAdd(c) && !inDeck);
      b.classList.toggle('hidden', !inDeck);
      b.textContent = '×' + inDeck;
    });
  }

  function renderList() {
    const cards = byId();
    const box = $('#bList'); box.innerHTML = '';
    const rows = Object.entries(deck.main).filter(([id, n]) => n && cards[id]).map(([id, n]) => ({ c: cards[id], n }))
      .concat(deck.life.filter(id => cards[id]).map(id => ({ c: cards[id], n: 1 })))
      .sort((a, b) => TYPE_ORDER[a.c.type] - TYPE_ORDER[b.c.type] || (a.c.cost || 0) - (b.c.cost || 0) || a.c.name.localeCompare(b.c.name, 'th'));
    let lastType = null;
    rows.forEach(({ c, n }) => {
      if (c.type !== lastType) {
        lastType = c.type;
        const total = rows.filter(r => r.c.type === c.type).reduce((s, r) => s + r.n, 0);
        const h = document.createElement('div'); h.className = 'lhead'; h.textContent = (c.type === 'life' ? 'LIFE' : c.type === 'magic' ? 'Magic' : c.type === 'construct' ? 'Construct' : 'Avatar') + ` (${total})`; box.appendChild(h);
      }
      const r = document.createElement('div'); r.className = 'lrow';
      const cost = c.type === 'avatar' || c.type === 'construct' ? `<b class="lc c-${c.color}">${c.cost}</b>` : `<b class="lc">${c.type === 'magic' ? (MT_TH[c.magicType] || 'M')[0] : 'L'}</b>`;
      r.innerHTML = `${cost}<span class="ln">${UI().esc(c.name)}${c.onlyOne ? ' <i>Only#1</i>' : ''}</span><span class="lx">×${n}</span>`;
      const minus = document.createElement('button'); minus.className = 'small'; minus.textContent = '−'; minus.setAttribute('aria-label', 'เอาออก 1 ใบ'); minus.onclick = e => { e.stopPropagation(); removeOne(c.id); };
      const plus = document.createElement('button'); plus.className = 'small'; plus.textContent = '+'; plus.setAttribute('aria-label', 'เพิ่ม 1 ใบ'); plus.disabled = !!canAdd(c); plus.onclick = e => { e.stopPropagation(); add(c); };
      r.append(minus, plus);
      r.onclick = () => { preview = c; renderPreview(); };
      box.appendChild(r);
    });
    if (!rows.length) box.innerHTML = '<div class="empty">แตะการ์ดทางซ้ายเพื่อใส่ลง Deck<br>ต้องมี Main 50 ใบ (Only #1 1 ใบ, ชื่อเดียวกันไม่เกิน 4) และ LIFE 5 ใบชื่อไม่ซ้ำ</div>';
  }

  function renderPreview() {
    const box = $('#bPreview');
    if (!preview) { box.innerHTML = '<div class="empty">ชี้หรือแตะการ์ดเพื่อดูรายละเอียด</div>'; return; }
    const c = preview;
    const gem = (c.gems || []).map(g => `${g.count} ${g.color === 'colorless' ? 'ไร้สี' : 'สี' + (COLOR_TH[g.color] || g.color)}`).join(', ') || '0';
    box.innerHTML = `<div class="artslot"></div><div class="dname">${UI().esc(c.name)}</div>
      <div class="dmeta">${c.id} · ${c.type === 'magic' ? 'Magic ' + (MT_TH[c.magicType] || '') : c.type === 'life' ? 'LIFE' : (c.type === 'construct' ? 'Construct' : 'Avatar') + ' Cost ' + c.cost + ' · POWER ' + c.power} · GEM ${gem}${c.symbol ? ' · ' + c.symbol : ''}${(c.tags || []).length ? ' · ' + c.tags.join(', ') : ''}</div>
      ${c.text ? `<div class="dtext">${UI().esc(c.text)}</div>` : ''}`;
    box.querySelector('.artslot').replaceWith(UI().artEl(c, 'big'));
  }

  window.TCBuilder = { open };
})();
