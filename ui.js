// Browser UI: board rendering, player input, modal choices and the bot loop.
(function () {
  'use strict';
  const En = window.TCEngine, Bot = window.TCBot, FX = id => (window.TC_EFFECTS || {})[id];
  const $ = s => document.querySelector(s);
  let ME = 0, BOT = 1;      // BOT = the other side: the bot, or the friend in an online game
  const COLOR_TH = { red: 'แดง', blue: 'น้ำเงิน', green: 'เขียว', yellow: 'เหลือง', purple: 'ม่วง', black: 'ดำ', white: 'ขาว', colorless: 'ไร้สี', grey: 'เทา' };
  const TYPE_TH = { avatar: 'Avatar', magic: 'Magic', construct: 'Construct', life: 'LIFE' };

  let G = null;            // game state
  let mode = null;         // {kind:'pay', uid, sel:Set} | {kind:'attack', uid}
  let selected = null;     // {zone, uid}
  let busy = false;
  let botSpeed = 550;
  let botLevel = 'normal';
  let imgBase = '../refs/';
  let lastSetup = null;
  let focusNow = null;     // react prompt: {from, to} cards highlighted on the board
  let net = null;          // online game: {link, inbox, waiter, role, autoplay}
  const oppName = () => (net && G ? G.players[BOT].name : 'บอท');

  // ---------- images ----------
  (function detectImgBase() {
    const probe = new Image();
    probe.onload = () => { imgBase = 'refs/'; if (G) render(); };
    probe.src = 'refs/KD01-001.png';
  })();

  function cardEl(card, o) {
    o = o || {};
    const d = document.createElement('div');
    d.className = 'card' + (o.cls ? ' ' + o.cls : '');
    if (o.uid) d.dataset.uid = o.uid;
    if (!card) { d.classList.add('back'); return d; }
    d.appendChild(artEl(card, null, o.lazy));
    if (o.power != null) {
      const pw = document.createElement('div');
      pw.className = 'pw' + (o.power > (card.power || 0) ? ' up' : o.power < (card.power || 0) ? ' down' : '');
      pw.textContent = o.power;
      d.appendChild(pw);
    }
    if (o.eq) { const e = document.createElement('div'); e.className = 'eq'; e.textContent = '+' + o.eq; e.title = 'มีการ์ดสวมใส่'; d.appendChild(e); }
    if (o.onclick) d.addEventListener('click', ev => { ev.stopPropagation(); o.onclick(); });
    return d;
  }
  // Card art: sprite sheets in the web build (TC_ATLAS), else the image file in refs/, else a drawn text card
  function artEl(card, cls, lazy) {
    const A = window.TC_ATLAS, at = A && A.map[card.id];
    if (at) {
      const d = document.createElement('div');
      d.className = 'art' + (cls ? ' ' + cls : '');
      d.style.backgroundImage = `url("${A.sheets[at[0]]}")`;
      d.style.backgroundSize = `${A.cols * 100}% ${A.rows * 100}%`;
      d.style.backgroundPosition = `${at[1] * 100 / (A.cols - 1)}% ${at[2] * 100 / (A.rows - 1)}%`;
      d.setAttribute('role', 'img'); d.setAttribute('aria-label', card.name);
      return d;
    }
    if (card.img) {
      const img = document.createElement('img');
      if (cls) img.className = cls;
      img.alt = card.name; if (lazy) img.loading = 'lazy';
      img.src = imgBase + card.img;
      img.onerror = () => img.replaceWith(textCard(card, cls));
      return img;
    }
    return textCard(card, cls);
  }
  function textCard(card, cls) {
    const f = document.createElement('div');
    f.className = 'fallback c-' + (card.color || 'none') + (cls ? ' ' + cls : '');
    const top = card.type === 'magic' ? (card.magicType ? card.magicType[0].toUpperCase() + card.magicType.slice(1) + ' ' : '') + 'Magic' : card.cost != null ? 'Cost ' + card.cost : TYPE_TH[card.type] || card.type;
    const gem = (card.gems || []).reduce((s, g) => s + g.count, 0);
    f.innerHTML = `<b>${esc(top)}</b><span class="fn">${esc(card.name)}</span>${card.symbol ? `<span class="fs">${esc(card.symbol)}</span>` : ''}<b>${card.power != null ? 'POWER ' + card.power : ''}${gem ? ` · GEM ${gem}` : ''}</b>`;
    return f;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- start screen ----------
  const Decks = window.TCDecks;
  function fillDeckSelects() {
    const all = Decks.all();
    ['#myDeck', '#botDeck'].forEach((s, k) => {
      const el = $(s); const prev = el.value; el.innerHTML = '';
      if (k === 1) { const o = document.createElement('option'); o.value = 'rand'; o.textContent = 'สุ่มจากรายการ'; el.appendChild(o); }
      const groups = [['Starter Deck', all.filter(d => d.builtin)], ['Deck ที่บันทึกไว้', all.filter(d => !d.builtin)]];
      groups.forEach(([label, list]) => {
        if (!list.length) return;
        const g = document.createElement('optgroup'); g.label = label;
        list.forEach(d => { const o = document.createElement('option'); o.value = d.id; const v = Decks.validate(d); o.textContent = d.name + (v.ok ? '' : ' (ยังไม่ครบ)'); o.disabled = !v.ok && false; g.appendChild(o); });
        el.appendChild(g);
      });
      if (prev && [...el.options].some(o => o.value === prev)) el.value = prev;
    });
    renderDeckInfo();
  }
  function renderDeckInfo() {
    ['my', 'bot'].forEach(w => {
      const id = $('#' + w + 'Deck').value; const box = $('#' + w + 'Info');
      if (!box) return;
      if (id === 'rand') { box.textContent = 'บอทจะสุ่ม Deck ที่พร้อมเล่นจากรายการ'; return; }
      const d = Decks.get(id); if (!d) { box.textContent = ''; return; }
      const v = Decks.validate(d);
      box.innerHTML = v.ok ? `<span class="okline">✓ พร้อมเล่น · Main ${v.total} · LIFE ${v.lifeCount}</span>` : `<span class="badline">ยังเล่นไม่ได้: ${esc(v.problems[0])}</span>`;
    });
  }
  // ---------- playmat skins: the zone grid always stays, only the art behind it changes ----------
  const MATS = [
    { id: 'black', name: 'พื้นดำ (ตาราง)', bg: 'none' },
    { id: 'rattatui', name: 'รัททาทุย', bg: 'url("mats/rattatui.jpg")' },
    { id: 'custom', name: 'อัปโหลดรูปเอง…' },
  ];
  let matCustom = null;
  try { matCustom = localStorage.getItem('tc-duel-mat-custom'); } catch (e) { /* storage unavailable */ }
  function applyMat(id) {
    let m = MATS.find(x => x.id === id) || MATS[0];
    if (m.id === 'custom' && !matCustom) m = MATS[0];
    document.documentElement.style.setProperty('--mat-bg', m.id === 'custom' ? `url("${matCustom}")` : m.bg);
    ['#matSel', '#matSel2'].forEach(s => { const el = $(s); if (el) el.value = m.id; });
    try { localStorage.setItem('tc-duel-mat', m.id); } catch (e) { /* ignore */ }
  }
  function pickCustomMat() {
    const f = $('#matFile');
    f.value = '';
    f.onchange = () => {
      const file = f.files && f.files[0]; if (!file) return;
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        // shrink to a playmat-sized JPEG so it fits in browser storage
        const w = Math.min(1600, img.width), h = Math.round(img.height * w / img.width);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        matCustom = c.toDataURL('image/jpeg', 0.82);
        URL.revokeObjectURL(url);
        try { localStorage.setItem('tc-duel-mat-custom', matCustom); } catch (e) { toast('รูปใหญ่เกินกว่าจะจำไว้ในเบราว์เซอร์ ใช้ได้เฉพาะรอบนี้'); }
        applyMat('custom');
      };
      img.onerror = () => toast('เปิดรูปนี้ไม่ได้');
      img.src = url;
    };
    f.click();
  }
  function initMats() {
    ['#matSel', '#matSel2'].forEach(s => {
      const el = $(s); if (!el) return;
      el.innerHTML = MATS.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
      el.onchange = () => { if (el.value === 'custom') { applyMat(matCustom ? 'custom' : 'black'); pickCustomMat(); } else applyMat(el.value); };
    });
    let saved = 'black';
    try { saved = localStorage.getItem('tc-duel-mat') || 'black'; } catch (e) { /* ignore */ }
    applyMat(saved);
  }

  function initStart() {
    initMats();
    fillDeckSelects();
    try { const saved = JSON.parse(localStorage.getItem('tc-duel-prefs') || '{}'); if (saved.my && Decks.get(saved.my)) $('#myDeck').value = saved.my; if (saved.bot && (saved.bot === 'rand' || Decks.get(saved.bot))) $('#botDeck').value = saved.bot; if (saved.speed) $('#speedSel').value = saved.speed; if (saved.level && Bot.LEVELS[saved.level]) $('#levelSel').value = saved.level; } catch (e) { /* storage unavailable */ }
    renderDeckInfo();
    $('#myDeck').onchange = renderDeckInfo; $('#botDeck').onchange = renderDeckInfo;
    $('#startBtn').onclick = () => {
      const my = $('#myDeck').value;
      let bot = $('#botDeck').value;
      const ready = Decks.all().filter(d => Decks.validate(d).ok);
      if (bot === 'rand') bot = ready[Math.floor(Math.random() * ready.length)].id;
      const dm = Decks.get(my), db = Decks.get(bot);
      for (const [who, d] of [['ของคุณ', dm], ['ของบอท', db]]) { const v = Decks.validate(d); if (!v.ok) return toast(`Deck ${who} ยังเล่นไม่ได้: ${v.problems[0]}`); }
      const first = $('#firstSel').value;
      botSpeed = +$('#speedSel').value;
      botLevel = $('#levelSel').value;
      try { localStorage.setItem('tc-duel-prefs', JSON.stringify({ my, bot: $('#botDeck').value, speed: $('#speedSel').value, level: $('#levelSel').value })); } catch (e) { /* ignore */ }
      startGame({ my, bot, first: first === 'rand' ? null : +first });
    };
    $('#newDeckBtn').onclick = () => window.TCBuilder.open(null, onBuilderDone);
    $('#editMyBtn').onclick = () => window.TCBuilder.open(Decks.get($('#myDeck').value), onBuilderDone);
    $('#editBotBtn').onclick = () => { const id = $('#botDeck').value; if (id === 'rand') return toast('เลือก Deck ของบอทก่อน แล้วค่อยกดแก้ไข'); window.TCBuilder.open(Decks.get(id), onBuilderDone); };
    $('#deleteBtn').onclick = async () => {
      const d = Decks.get($('#myDeck').value);
      if (!d || d.builtin) return toast('Starter Deck ลบไม่ได้ — เลือก Deck ที่บันทึกไว้ในช่อง "Deck ของคุณ"');
      const ok = await humanAsk({ title: `ลบ Deck "${d.name}"?`, options: [{ label: 'ลบ', value: 1 }], optional: true, skipLabel: 'ยกเลิก' });
      if (ok) { Decks.remove(d.id); fillDeckSelects(); toast('ลบ Deck แล้ว'); }
    };
    $('#ioBtn').onclick = importExport;
    $('#battleBtn').onclick = () => act({ k: 'battle' });
    $('#endBtn').onclick = () => act({ k: 'end' });
    $('#quitBtn').onclick = async () => {
      const ok = await humanAsk({ title: 'ออกจากการดวลนี้?', options: [{ label: 'ออก', value: 1 }], optional: true });
      if (ok) { if (net) net.link.send({ t: 'bye' }); dropOnline(); goHome(); }
    };
    $('#onHost').onclick = hostRoom;
    $('#onJoin').onclick = joinRoom;
    $('#onCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
    try { $('#onName').value = localStorage.getItem('tc-duel-name') || ''; } catch (e) { /* storage unavailable */ }
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && mode) { mode = null; render(); } });
  }

  function onBuilderDone(saved) {
    fillDeckSelects();
    if (saved) { $('#myDeck').value = saved.id; renderDeckInfo(); }
  }

  async function importExport() {
    const d = Decks.get($('#myDeck').value);
    const m = $('#modal');
    $('#modalTitle').textContent = 'นำเข้า / ส่งออก Deck';
    $('#modalBody').innerHTML = `<div class="io"><p>ส่งออก Deck "${esc(d ? d.name : '')}" — คัดลอกข้อความนี้เก็บไว้ หรือส่งให้เพื่อน</p>
      <textarea id="ioOut" readonly rows="4">${esc(d ? Decks.exportText(d) : '')}</textarea>
      <p>นำเข้า — วางข้อความ Deck ที่คัดลอกมา แล้วกด "นำเข้า"</p><textarea id="ioIn" rows="4" placeholder='{"name":"...","main":{...},"life":[...]}'></textarea></div>`;
    const f = $('#modalFoot'); f.innerHTML = '';
    const copy = document.createElement('button'); copy.textContent = 'คัดลอกข้อความส่งออก';
    copy.onclick = () => { const t = $('#ioOut'); navigator.clipboard && navigator.clipboard.writeText(t.value).then(() => toast('คัดลอกแล้ว'), () => { t.select(); toast('กด Ctrl+C เพื่อคัดลอก'); }); if (!navigator.clipboard) t.select(); };
    const imp = document.createElement('button'); imp.className = 'primary'; imp.textContent = 'นำเข้า';
    imp.onclick = () => { try { const nd = Decks.save(Decks.importText($('#ioIn').value)); m.classList.add('hidden'); fillDeckSelects(); if (nd) { $('#myDeck').value = nd.id; renderDeckInfo(); } toast('นำเข้า Deck แล้ว'); } catch (e) { toast('นำเข้าไม่ได้: ข้อความไม่ใช่ Deck ที่ถูกต้อง'); } };
    const close = document.createElement('button'); close.textContent = 'ปิด'; close.onclick = () => m.classList.add('hidden');
    f.append(close, copy, imp);
    m.classList.remove('hidden');
  }

  async function startGame(setup) {
    lastSetup = setup;
    dropOnline();
    ME = 0; BOT = 1;
    const dmy = Decks.get(setup.my), dbot = Decks.get(setup.bot);
    const d1 = Decks.expand(dmy), d2 = Decks.expand(dbot);
    let raf = 0;
    G = En.createGame({
      first: setup.first,
      players: [
        { name: 'คุณ', deckName: dmy.name, deck: d1.deck, life: d1.life },
        { name: `บอท (${Bot.LEVELS[botLevel]})`, deckName: dbot.name, isBot: true, deck: d2.deck, life: d2.life },
      ],
      ask: (p, req) => (p === BOT ? Promise.resolve(Bot.botAsk(req)) : humanAsk(req)),
      onChange: () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); },
      onFx: playFx,
    });
    mode = null; selected = null; busy = false;
    $('#start').classList.add('hidden'); $('#duel').classList.remove('hidden');
    render();
    await En.mulligan(G, BOT, []);
    const firstName = G.first === ME ? 'คุณได้เริ่มก่อน' : 'บอทได้เริ่มก่อน';
    const pick = await humanAsk({
      title: `${firstName} — เลือกการ์ดที่ต้องการเปลี่ยน (นำไปไว้ใต้ Deck แล้วจั่วใหม่) หรือกด "เก็บไว้ทั้งหมด"`,
      anyCount: true, options: G.players[ME].hand.map((h, i) => ({ label: h.card.name, card: h.card, value: i })), confirmLabel: 'เปลี่ยนใบที่เลือก', skipLabel: 'เก็บไว้ทั้งหมด', optional: true,
    });
    await En.mulligan(G, ME, Array.isArray(pick) ? pick : []);
    render();
    runBotIfNeeded();
  }

  // ---------- visual effects (summon / attack / destroy / LIFE damage / magic splash / banners) ----------
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fxSpeed = () => (reduceMotion() ? 0.25 : Math.max(0.55, Math.min(1.3, botSpeed / 550)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function fxLayer() {
    let l = document.getElementById('fx');
    if (!l) { l = document.createElement('div'); l.id = 'fx'; l.setAttribute('aria-hidden', 'true'); document.body.appendChild(l); }
    return l;
  }
  const uidEl = uid => document.querySelector(`#duel .card[data-uid="${uid}"]`);
  const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };
  function spawn(cls, x, y, html, life) {
    const d = document.createElement('div'); d.className = 'fxp ' + cls; d.style.left = x + 'px'; d.style.top = y + 'px';
    if (html != null) d.innerHTML = html;
    fxLayer().appendChild(d); setTimeout(() => d.remove(), life || 1500);
    return d;
  }
  function banner(text, cls, ms) {
    const b = document.createElement('div'); b.className = 'fxbanner ' + (cls || '');
    b.innerHTML = `<div class="stripe"></div><div class="txt">${esc(text)}</div>`;
    fxLayer().appendChild(b);
    b.animate([{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
    b.querySelector('.txt').animate([{ transform: 'translateX(-60px) skewX(-12deg)', letterSpacing: '.5em' }, { transform: 'none', letterSpacing: '.12em', offset: .25 }, { transform: 'translateX(20px)' }], { duration: ms, easing: 'cubic-bezier(.2,.8,.2,1)' });
    setTimeout(() => b.remove(), ms);
    return sleep(ms * .9);
  }
  async function playFx(type, d) {
    if (!G || !document.getElementById('duel') || document.getElementById('duel').classList.contains('hidden')) return;
    const k = fxSpeed();
    render();
    if (type === 'turn') return banner(d.p === ME ? 'ตาของคุณ' : 'ตาของ' + oppName(), d.p === ME ? 'mine' : 'theirs', 1100 * k);
    if (type === 'battle') return banner('BATTLE PHASE', 'battle', 900 * k);
    if (type === 'summon') {
      const el = uidEl(d.uid); if (!el) return;
      const c = center(el);
      spawn('ring c-' + (d.card.color || 'none'), c.x, c.y, null, 900 * k);
      el.animate([{ transform: 'translateY(-60px) scale(1.7)', opacity: 0, filter: 'brightness(3)' }, { transform: 'translateY(6px) scale(.96)', opacity: 1, filter: 'brightness(1.8)', offset: .6 }, { transform: 'none', filter: 'none' }], { duration: 520 * k, easing: 'cubic-bezier(.3,1.4,.5,1)' });
      return sleep(480 * k);
    }
    if (type === 'activate') {
      const el = uidEl(d.uid); if (!el) return;
      const c = center(el); spawn('ring gold', c.x, c.y, null, 800 * k);
      el.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(2.2) drop-shadow(0 0 12px #f5c542)' }, { filter: 'brightness(1)' }], { duration: 600 * k });
      return sleep(450 * k);
    }
    if (type === 'magic') {
      const w = document.createElement('div'); w.className = 'fxsplash ' + (d.p === ME ? 'mine' : 'theirs');
      const art = artEl(d.card, 'big'); w.appendChild(art);
      const lbl = document.createElement('div'); lbl.className = 'lbl';
      lbl.textContent = (d.react ? 'ตอบโต้! ' : '') + (d.card.magicType ? d.card.magicType[0].toUpperCase() + d.card.magicType.slice(1) + ' Magic' : 'Magic');
      w.appendChild(lbl); fxLayer().appendChild(w);
      w.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.4) rotateY(80deg)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.05) rotateY(0)', offset: .3 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .8 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.25)' }], { duration: 1100 * k, easing: 'ease-out' });
      setTimeout(() => w.remove(), 1100 * k);
      return sleep(1000 * k);
    }
    if (type === 'attack') {
      const a = uidEl(d.uid); if (!a) return;
      const opp = d.p === ME ? BOT : ME;
      const tEl = d.target.kind === 'avatar' ? uidEl(d.target.uid) : document.querySelector(`.lifebox[data-p="${opp}"]`) || document.getElementById(opp === BOT ? 'oppSide' : 'meSide');
      if (!tEl) return;
      const A = center(a), T = center(tEl);
      const dx = (T.x - A.x) * .75, dy = (T.y - A.y) * .75;
      a.style.zIndex = 20;
      const anim = a.animate([{ transform: 'none' }, { transform: `translate(${-dx * .08}px,${-dy * .08}px) scale(1.12)`, offset: .25 }, { transform: `translate(${dx}px,${dy}px) scale(1.15)`, offset: .55 }, { transform: 'none' }], { duration: 760 * k, easing: 'cubic-bezier(.5,0,.3,1)' });
      await sleep(420 * k);
      spawn('slash', T.x, T.y, null, 600);
      tEl.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      if (d.targetPower != null) spawn('clash', T.x, T.y - T.r.height * .7, `<b class="${d.power > d.targetPower ? 'win' : d.power < d.targetPower ? 'lose' : ''}">${d.power}</b><i>VS</i><b class="${d.targetPower > d.power ? 'win' : d.targetPower < d.power ? 'lose' : ''}">${d.targetPower}</b>`, 1300 * k);
      await anim.finished.catch(() => {});
      a.style.zIndex = '';
      return sleep(200 * k);
    }
    if (type === 'destroy') {
      const el = uidEl(d.uid); if (!el) return;
      const c = center(el);
      for (let i = 0; i < 10; i++) {
        const s = spawn('shard', c.x, c.y, null, 900);
        const ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 70;
        s.animate([{ transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * dist - 4}px,${Math.sin(ang) * dist - 4}px) rotate(${Math.random() * 540}deg)`, opacity: 0 }], { duration: 750 * k, easing: 'cubic-bezier(.2,.7,.4,1)' });
      }
      await el.animate([{ filter: 'brightness(1)', transform: 'none', opacity: 1 }, { filter: 'brightness(3) saturate(0)', transform: 'scale(1.08) rotate(-3deg)', offset: .3 }, { filter: 'grayscale(1) brightness(.4)', transform: 'scale(.6) rotate(8deg)', opacity: 0 }], { duration: 560 * k, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
      return;
    }
    if (type === 'life') {
      const box = document.querySelector(`.lifebox[data-p="${d.p}"]`);
      const flash = document.createElement('div'); flash.className = 'fxflash' + (d.p === ME ? ' me' : ''); fxLayer().appendChild(flash);
      flash.animate([{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 0 }], { duration: 700 * k }); setTimeout(() => flash.remove(), 700 * k);
      document.getElementById('duel').animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-6px,3px)' }, { transform: 'translate(5px,-4px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'none' }], { duration: 380 });
      if (box) { const c = center(box); spawn('dmg', c.x, c.y, '−1 LIFE', 1200 * k); }
      if (d.severe) return banner('สาหัส!', 'severe', 1000 * k);
      return sleep(650 * k);
    }
  }

  // ---------- actions ----------
  // Every player action is a small plain command, so an online game can send it to the other PC,
  // which runs the same command on its own copy of the game (both copies stay identical).
  function exec(cmd, p) {
    switch (cmd.k) {
      case 'battle': return En.goBattle(G, p);
      case 'end': return En.endTurn(G, p);
      case 'activate': return En.activate(G, p, cmd.uid);
      case 'cast': return En.cast(G, p, cmd.idx);
      case 'summon': return En.summon(G, p, cmd.idx, cmd.pay);
      case 'build': return En.build(G, p, cmd.idx, cmd.pay);
      case 'attack': return En.attack(G, p, cmd.uid, cmd.target, cmd.sups);
    }
    return { ok: false, error: 'คำสั่งไม่ถูกต้อง' };
  }
  function runLocal(cmd) {
    if (net) net.link.send({ t: 'act', a: cmd, h: fingerprint() });
    return exec(cmd, ME);
  }
  async function act(cmd) {
    if (busy || !G || G.winner != null) return;
    busy = true; mode = null; render();
    let r;
    try { r = await runLocal(cmd); } catch (e) { console.error(e); r = { ok: false, error: 'เกิดข้อผิดพลาด: ' + e.message }; }
    busy = false; mode = null;
    if (r && r.ok === false) toast(r.error);
    render();
    runBotIfNeeded();
  }

  async function runBotIfNeeded() {
    if (net) return pumpRemote();
    if (!G || busy || G.winner != null) { if (G && G.winner != null) showGameOver(); return; }
    if (G.active !== BOT || G.phase === 'mulligan') return;
    busy = true; render();
    try { await Bot.playTurn(G, BOT, botSpeed, null, botLevel); } catch (e) { console.error(e); toast('บอทเกิดข้อผิดพลาด: ' + e.message); if (G.active === BOT && G.winner == null) await En.endTurn(G, BOT); }
    busy = false; render();
    if (G.winner != null) showGameOver();
  }

  // ---------- online game (net.js) ----------
  // Both PCs run the same engine from the same seed and decks. Each side sends its own actions and
  // its own answers to the game's questions; the other side waits for them in the same order.
  function netReceive(m) {
    if (!net) return;
    if (m.t === 'start') return startOnline(m);
    if (m.t === 'bye') return netLost('เพื่อนออกจากเกมแล้ว');
    if (m.t === 'act' || m.t === 'ans' || m.t === 'mull') {
      if (net.waiter && net.waiter.t === m.t) { const w = net.waiter; net.waiter = null; w.resolve(m); }
      else { net.inbox.push(m); pumpRemote(); }
    }
  }
  // Next message of type t from the friend (answers to questions and the mulligan)
  function netNext(t) {
    const i = net.inbox.findIndex(m => m.t === t);
    if (i >= 0 && net.inbox.slice(0, i).every(m => m.t !== 'act')) return Promise.resolve(net.inbox.splice(i, 1)[0]);
    return new Promise(resolve => { net.waiter = { t, resolve }; });
  }
  async function pumpRemote() {
    if (!net || !G) return;
    if (G.winner != null) { if (!busy) showGameOver(); return; }
    if (busy || net.waiter || net.mulligan) return;
    if (net.autoplay && G.active === ME) return autoTurn();
    if (!net.inbox.length || net.inbox[0].t !== 'act') return;
    const m = net.inbox.shift();
    if (m.h && m.h !== fingerprint()) { console.warn('desync', m.h, fingerprint()); net.desync = (net.desync || 0) + 1; toast('เกมของสองเครื่องไม่ตรงกัน ลองเริ่มเกมใหม่'); }
    busy = true; render();
    try { const r = await exec(m.a, BOT); if (r && r.ok === false) console.warn('remote action refused', m.a, r.error); } catch (e) { console.error(e); toast('เกิดข้อผิดพลาด: ' + e.message); }
    busy = false; render();
    pumpRemote();
  }
  // Test mode: the local side is played by the bot, through the same commands a person would send
  async function autoTurn() {
    const proxy = Object.assign(Object.create(En), {
      goBattle: () => runLocal({ k: 'battle' }), endTurn: () => runLocal({ k: 'end' }),
      activate: (s, p, uid) => runLocal({ k: 'activate', uid }), cast: (s, p, idx) => runLocal({ k: 'cast', idx }),
      summon: (s, p, idx, pay) => runLocal({ k: 'summon', idx, pay }), build: (s, p, idx, pay) => runLocal({ k: 'build', idx, pay }),
      attack: (s, p, uid, target, sups) => runLocal({ k: 'attack', uid, target, sups }),
    });
    busy = true; render();
    try { await Bot.playTurn(G, ME, 0, proxy); } catch (e) { console.error(e); if (G && G.active === ME && G.winner == null) await runLocal({ k: 'end' }); }
    busy = false; render();
    pumpRemote();
  }
  // The index of the picked option(s) means the same thing on both PCs
  const toIdx = (req, v) => (v == null ? null : Array.isArray(v) ? v.map(x => req.options.findIndex(o => o.value === x)) : req.options.findIndex(o => o.value === v));
  const fromIdx = (req, i) => (i == null ? null : Array.isArray(i) ? i.map(k => req.options[k] && req.options[k].value) : req.options[i] ? req.options[i].value : null);
  function askOnline(p, req) {
    if (!net) return Promise.resolve(null);
    if (p === ME) {
      const a = net.autoplay ? Promise.resolve(Bot.botAsk(req)) : humanAsk(req);
      return a.then(v => { if (net) net.link.send({ t: 'ans', i: toIdx(req, v) }); return v; });
    }
    const w = netNext('ans').then(m => fromIdx(req, m.i));
    render();
    return w.then(v => { render(); return v; });
  }
  // A short summary of the game; both PCs compare it before every action
  function fingerprint() {
    const parts = [G.turn, G.phase, G.active, G.land ? G.land.uid : 0];
    G.players.forEach(pl => parts.push(pl.hand.map(h => h.uid).join('.'), pl.deck.length, pl.deck.length ? pl.deck[0].uid : 0, pl.life.map(l => (l.faceUp ? 1 : 0)).join(''),
      pl.avatars.map(a => a.uid + (a.rested ? 'r' : '')).join('.'), pl.magicZone.map(m => m.uid).join('.'), pl.constructs.map(c => c.uid).join('.'), pl.hell.length, pl.dark.length));
    let h = 5381; const str = parts.join('|');
    for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function netLost(msg) {
    if (!net) return;
    const n = net; net = null;
    n.link.close();
    if (n.waiter) n.waiter.resolve({ i: null, pick: [] });
    busy = false;
    setOnlineStatus('');
    if (G && G.winner == null && !$('#duel').classList.contains('hidden')) {
      G.winner = ME; G.winReason = msg; G._shownOver = true; render();
      humanAsk({ title: msg + ' เกมนี้จบลงแล้ว', options: [{ label: 'กลับหน้าแรก', value: 1 }] }).then(goHome);
    } else toast(msg);
  }
  function goHome() { G = null; $('#modal').classList.add('hidden'); $('#duel').classList.add('hidden'); $('#start').classList.remove('hidden'); }

  // Start screen: create a room or join one
  function setOnlineStatus(html) { const el = $('#onStatus'); if (el) el.innerHTML = html; }
  function myOnlineName() { const v = ($('#onName').value || '').trim().slice(0, 20); try { localStorage.setItem('tc-duel-name', v); } catch (e) { /* ignore */ } return v; }
  function myDeckForOnline() {
    const d = Decks.get($('#myDeck').value), v = Decks.validate(d);
    if (!v.ok) { toast('Deck ของคุณยังเล่นไม่ได้: ' + v.problems[0]); return null; }
    const x = Decks.expand(d);
    return { deckName: d.name, deck: x.deck.map(c => c.id), life: x.life.map(c => c.id) };
  }
  function attachLink(link, role) {
    net = { link, role, inbox: [], waiter: null, autoplay: !!window.TCUI.autoplay };
    link.onmessage = m => { if (net && net.link === link) { if (m.t === 'hello') onHello(m); else netReceive(m); } };
    link.onclose = () => { if (net && net.link === link) netLost('การเชื่อมต่อกับเพื่อนหลุด'); };
  }
  let hostCancel = null;
  function dropOnline() {
    if (hostCancel) { hostCancel(); hostCancel = null; }
    if (net) { const n = net; net = null; n.link.close(); }
  }
  async function hostRoom() {
    const mine = myDeckForOnline(); if (!mine) return;
    dropOnline();
    mine.name = myOnlineName() || 'ผู้เล่น 1';
    setOnlineStatus('กำลังสร้างห้อง…');
    try {
      const link = await window.TCNet.host((code, cancel) => { hostCancel = cancel || null; setOnlineStatus(`รหัสห้อง <b class="code">${code}</b><br>ส่งรหัสนี้ให้เพื่อน แล้วรอเพื่อนเข้าห้อง…`); });
      hostCancel = null;
      attachLink(link, 'host');
      net.mine = mine;
      setOnlineStatus('เพื่อนเข้าห้องแล้ว กำลังเริ่มเกม…');
    } catch (e) { setOnlineStatus(`<span class="badline">${esc(e.message)}</span>`); }
  }
  async function joinRoom() {
    const mine = myDeckForOnline(); if (!mine) return;
    const code = window.TCNet.cleanCode($('#onCode').value);
    if (!code) return toast('ใส่รหัสห้องที่เพื่อนส่งมาก่อน');
    dropOnline();
    mine.name = myOnlineName() || 'ผู้เล่น 2';
    setOnlineStatus('กำลังเข้าห้อง ' + esc(code) + '…');
    try {
      const link = await window.TCNet.join(code);
      attachLink(link, 'guest');
      net.mine = mine;
      link.send({ t: 'hello', player: mine });
      setOnlineStatus('เข้าห้องแล้ว รอเจ้าของห้องเริ่มเกม…');
    } catch (e) { setOnlineStatus(`<span class="badline">${esc(e.message)}</span>`); }
  }
  // Host: the friend has sent their deck, so deal the game and send them the same seed
  function onHello(m) {
    if (!net || net.role !== 'host') return;
    net.theirs = m.player;
    hostNewGame();
  }
  function hostNewGame() {
    const msg = { t: 'start', seed: (Math.random() * 1e9) >>> 0, players: [net.mine, net.theirs] };
    net.link.send(msg);
    startOnline(msg);
  }
  const byId = id => window.TC_CARDS.find(c => c.id === id);
  async function startOnline(m) {
    ME = net.role === 'host' ? 0 : 1; BOT = 1 - ME;
    net.inbox = net.inbox.filter(x => x.t === 'mull'); net.waiter = null; net.mulligan = true;
    const ps = m.players.map(x => ({ name: x.name, deckName: x.deckName, deck: x.deck.map(byId), life: x.life.map(byId) }));
    if (ps[0].name === ps[1].name) ps[1].name += ' (2)';
    let raf = 0;
    G = En.createGame({
      seed: m.seed, players: ps,
      ask: askOnline,
      onChange: () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); },
      onFx: playFx,
    });
    const game = G;
    mode = null; selected = null; busy = false;
    $('#modal').classList.add('hidden');
    $('#start').classList.add('hidden'); $('#duel').classList.remove('hidden');
    $('#oppHand').setAttribute('aria-label', 'การ์ดบนมือของ' + G.players[BOT].name);
    setOnlineStatus('');
    render();
    const pick = net.autoplay ? [] : await humanAsk({
      title: `${G.first === ME ? 'คุณได้เริ่มก่อน' : G.players[BOT].name + ' ได้เริ่มก่อน'} — เลือกการ์ดที่ต้องการเปลี่ยน (นำไปไว้ใต้ Deck แล้วจั่วใหม่) หรือกด "เก็บไว้ทั้งหมด"`,
      anyCount: true, options: G.players[ME].hand.map((h, i) => ({ label: h.card.name, card: h.card, value: i })), confirmLabel: 'เปลี่ยนใบที่เลือก', skipLabel: 'เก็บไว้ทั้งหมด', optional: true,
    });
    if (!net || G !== game) return;
    const mine = Array.isArray(pick) ? pick : [];
    net.link.send({ t: 'mull', pick: mine });
    if (!net.inbox.some(x => x.t === 'mull')) toast('รอ ' + G.players[BOT].name + ' เลือกการ์ด…');
    const theirs = (await netNext('mull')).pick || [];
    if (!net || G !== game) return;
    const picks = []; picks[ME] = mine; picks[BOT] = theirs;
    await En.mulligan(G, 0, picks[0]);
    await En.mulligan(G, 1, picks[1]);
    net.mulligan = false;
    render();
    pumpRemote();
  }

  function myTurn(ph) { return G && G.winner == null && !busy && G.active === ME && (!ph || G.phase === ph); }
  const actTurn = () => myTurn('main') || myTurn('battle'); // some abilities may also be used in our Battle Phase

  // ---------- render ----------
  function render() {
    if (!G) return;
    const oh = $('#oppHand'); if (oh) { oh.innerHTML = ''; G.players[BOT].hand.forEach(() => oh.appendChild(cardEl(null, { cls: 'oh' }))); oh.dataset.n = G.players[BOT].hand.length; }
    renderSide(BOT, $('#oppSide'));
    renderSide(ME, $('#meSide'));
    renderHand();
    renderMid();
    renderLog();
    renderDetail();
  }

  // Each side is drawn as a playmat: Construct / Land / player info on top, LIFE on the left,
  // Avatar + Magic zones in the middle, Hell + Deck on the right. The opponent's mat is turned around.
  function zoneBox(area, label, sub) {
    const z = document.createElement('div'); z.className = 'mz z-' + area;
    z.innerHTML = `<div class="zl">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    const body = document.createElement('div'); body.className = 'zb'; z.appendChild(body);
    return [z, body];
  }
  function renderSide(p, root) {
    const pl = G.players[p], isMe = p === ME;
    root.innerHTML = '';
    root.classList.add('mat');
    const up = pl.life.filter(l => l.faceUp).length;
    const targets = mode && mode.kind === 'attack' && !isMe ? En.attackTargets(G, ME, mode.uid) : [];

    // player info (where the logo sits on the playmat)
    const [infoZ, info] = zoneBox('info', '');
    infoZ.querySelector('.zl').remove();
    info.innerHTML = `<div class="pname ${G.active === p ? 'active' : ''}">${esc(pl.name)}</div><div class="dname-s">${esc(pl.deckName || '')}</div>
      <div class="stats"><span class="stat">มือ <b>${pl.hand.length}</b></span><span class="stat click" data-z="dark">มิติมืด <b>${pl.dark.length}</b></span></div>
      ${up === 5 ? '<div class="severe">สถานะ "สาหัส"</div>' : ''}`;
    info.querySelectorAll('[data-z]').forEach(el => el.onclick = () => viewZone(p, el.dataset.z));

    // Construct Zone
    const [consZ, cons] = zoneBox('cons', 'Construct Zone', 'สูงสุด 3 ใบ');
    pl.constructs.forEach(c => {
      const t = targets.some(x => x.kind === 'construct' && x.uid === c.uid);
      const can = isMe && actTurn() && !mode && En.activatables(G, ME).some(x => x.uid === c.uid);
      const fc = focusNow && focusNow.to && focusNow.to.uid === c.uid ? ' focus-tgt' : '';
      cons.appendChild(cardEl(c.card, { uid: c.uid, cls: 'mini' + fc + (t ? ' target' : '') + (can ? ' can' : '') + (selected && selected.uid === c.uid ? ' sel' : ''), power: En.constructPower(G, c),
        onclick: () => { if (mode && mode.kind === 'attack' && !isMe) return doAttack({ kind: 'construct', uid: c.uid }); select('construct', c); } }));
    });

    // Land Magic Zone (one shared Land; it sits on the mat of whoever placed it)
    const [landZ, land] = zoneBox('land', 'Land Magic', G.land && G.land.owner === p ? 'ใช้ได้ทั้งสองฝ่าย' : '');
    if (G.land && G.land.owner === p) {
      const can = actTurn() && En.activatables(G, ME).some(x => x.kind === 'land');
      land.appendChild(cardEl(G.land.card, { uid: G.land.uid, cls: 'mini' + (can ? ' can' : '') + (selected && selected.uid === G.land.uid ? ' sel' : ''), onclick: () => select('land', G.land) }));
    }

    // LIFE
    const [lifeZ, lifebox] = zoneBox('life', 'Life', `${5 - up}/5`);
    lifeZ.classList.add('lifebox'); lifeZ.dataset.p = p;
    const lifeTarget = targets.some(t => t.kind === 'life');
    if (focusNow && focusNow.to && focusNow.to.life === p) lifeZ.classList.add('focus-tgt');
    if (lifeTarget) { lifeZ.classList.add('target'); lifeZ.onclick = () => doAttack({ kind: 'life' }); }
    pl.life.forEach(l => {
      const d = document.createElement('div'); d.className = 'life' + (l.faceUp ? ' up' : '');
      d.title = l.faceUp ? l.card.name + ': ' + l.card.text : 'LIFE Card (คว่ำ)';
      if (l.faceUp) { d.appendChild(cardEl(l.card, { cls: 'side' })); d.onclick = e => { if (lifeTarget) return; e.stopPropagation(); select('life', l); }; }
      lifebox.appendChild(d);
    });

    // Avatar Zone + Magic Zone: the zone boxes are drawn behind one grid of columns, so each Magic
    // card sits right under (or, on the opponent's mat, above) the Avatar it is attached to
    const avMax = Math.max(En.avatarLimit(G, p), pl.avatars.length);
    const [avZ] = zoneBox('av', 'Avatar Zone', `สูงสุด ${avMax} ใบ`);
    const [magZ] = zoneBox('magic', 'Magic Zone', 'Magic ใช้ได้ประเภทละ 1 ครั้งต่อเทิร์น');
    const cols = document.createElement('div'); cols.className = 'avcols';
    const avRow = isMe ? 1 : 2, mgRow = isMe ? 2 : 1;
    const cell = (cls, col, row) => { const c = document.createElement('div'); c.className = cls; c.style.gridColumn = col; c.style.gridRow = row; cols.appendChild(c); return c; };
    const magicEl = m => {
      const can = isMe && actTurn() && !mode && En.activatables(G, ME).some(x => x.uid === m.uid);
      const el = cardEl(m.card, { uid: m.uid, cls: 'mg' + (can ? ' can' : '') + (selected && selected.uid === m.uid ? ' sel' : ''), onclick: () => select('magic', m) });
      const host = En.findAvatar(G, m.attachedTo); if (host) el.title = m.card.name + ' → ' + host.card.name;
      return el;
    };
    const placed = new Set();
    for (let i = 0; i < avMax; i++) {
      const a = pl.avatars[i], ac = cell('avc', i + 1, avRow);
      if (!a) { const s = document.createElement('div'); s.className = 'slot'; ac.appendChild(s); continue; }
      const eqs = En.attachedTo(G, a);
      let cls = a.rested ? 'rested' : '';
      if (selected && selected.uid === a.uid) cls += ' sel';
      if (targets.some(t => t.kind === 'avatar' && t.uid === a.uid)) cls += ' target';
      if (isMe && mode && mode.kind === 'attack' && mode.uid === a.uid) cls += ' sel';
      if (isMe && myTurn('battle') && !mode && !a.rested && En.attackTargets(G, ME, a.uid).length) cls += ' can';
      if (isMe && actTurn() && !mode && En.activatables(G, ME).some(x => x.uid === a.uid || x.src === a.uid)) cls += ' can';
      if (a.linked) cls += ' linked';
      if (focusNow && focusNow.from && focusNow.from.uid === a.uid) cls += ' focus-src';
      if (focusNow && focusNow.to && focusNow.to.uid === a.uid) cls += ' focus-tgt';
      ac.appendChild(cardEl(a.card, { uid: a.uid, cls, power: En.basePower(G, a), eq: eqs.length || null, onclick: () => clickAvatar(p, a) }));
      const mine = pl.magicZone.filter(m => m.attachedTo === a.uid);
      if (mine.length) { const mc = cell('mgc', i + 1, mgRow); mine.forEach(m => { placed.add(m.uid); mc.appendChild(magicEl(m)); }); }
    }
    // Magic that stays on the field without a host (or whose host is on the other side) gets its own columns
    let col = avMax;
    pl.magicZone.filter(m => !placed.has(m.uid)).forEach(m => cell('mgc', ++col, mgRow).appendChild(magicEl(m)));

    // Hell (top card face up) and Deck (card back)
    const [hellZ, hell] = zoneBox('hell', 'Hell', `นรก ${pl.hell.length}`);
    const top = pl.hell[pl.hell.length - 1];
    if (top) hell.appendChild(cardEl(top.card, { cls: 'mini', onclick: () => viewZone(p, 'hell') }));
    hellZ.onclick = () => viewZone(p, 'hell'); hellZ.classList.add('click');
    // abilities usable from hell (ลุงไนท์, ดาบศักดิ์สิทธิ์ อาลอนไดร์ท ...)
    const hellActs = isMe && actTurn() ? En.activatables(G, ME).filter(x => x.kind === 'hell' || x.kind === 'dark') : [];
    if (hellActs.length) hell.appendChild(chip(`สั่งใช้จากนรก/มิติมืด (${hellActs.length})`, async () => {
      const v = await humanAsk({ title: 'สั่งใช้ความสามารถจากนรก / มิติมืด', optional: true, options: hellActs.map(x => { const h = pl.hell.concat(pl.dark).find(c => c.uid === x.uid); return { label: `${h.card.name}${x.kind === 'dark' ? ' (มิติมืด)' : ''}: ${x.label}`, card: h.card, value: x.uid }; }) });
      if (v != null) act({ k: 'activate', uid: v });
    }, true));
    const [deckZ, deck] = zoneBox('deck', 'Deck', `กองจั่ว ${pl.deck.length}`);
    // ฮามดัล: while it is on the field the top card of both decks is face up
    const reveal = G.players.some(x => x.avatars.some(a => (FX(a.card.id) || {}).revealTop && !a.lostAbilities));
    if (pl.deck.length) { const b = cardEl(reveal ? pl.deck[0].card : null, { cls: 'mini' }); b.dataset.n = pl.deck.length; if (reveal) b.title = 'การ์ดบนสุดของ Deck (หงายด้วยฮามดัล)'; deck.appendChild(b); }

    [consZ, landZ, infoZ, lifeZ, avZ, magZ, cols, hellZ, deckZ].forEach(z => root.appendChild(z));
  }

  function chip(text, onclick, target) {
    const c = document.createElement('span'); c.className = 'chip' + (target ? ' target' : ''); c.textContent = text;
    if (target) c.style.boxShadow = '0 0 0 2px var(--red)';
    c.onclick = e => { e.stopPropagation(); onclick(); };
    return c;
  }

  function renderHand() {
    const h = $('#hand'); h.innerHTML = '';
    const pl = G.players[ME];
    const summonable = new Set(myTurn('main') ? En.legalSummons(G, ME).map(x => pl.hand[x.handIdx].uid) : []);
    pl.hand.forEach((c, i) => {
      let cls = '';
      if (mode && mode.kind === 'pay') {
        if (c.uid === mode.uid) cls = 'sel';
        else if (mode.sel.has(c.uid)) cls = 'sel';
        else if (En.gemTotal(c.card) <= 0) cls = 'dim';
      } else {
        if (selected && selected.uid === c.uid) cls = 'sel';
        else if (summonable.has(c.uid) || (myTurn() && c.card.type === 'magic' && En.canCast(G, ME, i).ok)) cls = 'can';
      }
      h.appendChild(cardEl(c.card, { cls, onclick: () => clickHand(c) }));
    });
    // opponent hand count as backs (small)
  }

  function renderMid() {
    const pb = $('#phaseBar'); pb.innerHTML = '';
    const t = document.createElement('span'); t.className = 'turnlbl';
    t.textContent = G.winner != null ? 'จบเกม' : `เทิร์น ${G.turn} · ${G.active === ME ? 'ตาคุณ' : 'ตา' + oppName()}`;
    pb.appendChild(t);
    ['draw', 'main', 'battle', 'end'].forEach(ph => { const s = document.createElement('span'); s.className = 'ph' + (G.phase === ph ? ' on' : ''); s.textContent = En.PHASE_TH[ph].replace(' Phase', ''); pb.appendChild(s); });
    $('#battleBtn').disabled = !myTurn('main') || G.turn === 1 || !!mode;
    $('#battleBtn').title = G.turn === 1 ? 'ผู้เล่นที่เริ่มก่อนเข้า Battle Phase ในเทิร์นแรกไม่ได้' : '';
    $('#endBtn').disabled = !(myTurn('main') || myTurn('battle')) || !!mode;
    const hint = $('#hint');
    if (G.winner != null) hint.textContent = G.winner === ME ? '🏆 คุณชนะ!' : 'คุณแพ้…';
    else if (net && net.waiter && net.waiter.t === 'ans') hint.textContent = `รอ ${oppName()} ตัดสินใจ…`;
    else if (G.active === BOT) hint.textContent = oppName() + ' กำลังเล่น…';
    else if (mode && mode.kind === 'pay') { const c = findHand(mode.uid); const sum = [...mode.sel].reduce((s, u) => s + En.gemTotal(findHand(u).card), 0); hint.textContent = `เลือกการ์ดบนมือเพื่อจ่าย GEM: ${sum}/${c.card.cost} (สี${COLOR_TH[c.card.color] || c.card.color}หรือไร้สี) — แล้วกด "ยืนยัน"`; }
    else if (mode && mode.kind === 'attack') hint.textContent = 'เลือกเป้าหมายการโจมตี (กรอบแดง) — Esc เพื่อยกเลิก';
    else if (G.phase === 'main') hint.textContent = 'Main Phase: อัญเชิญ / ใช้ Magic / สั่งใช้ความสามารถ' + (G.turn === 1 ? '' : ' แล้วเข้า Battle Phase');
    else if (G.phase === 'battle') hint.textContent = 'Battle Phase: กด Avatar ที่ยังตื่นอยู่เพื่อโจมตี';
    else hint.textContent = '';
  }

  function renderLog() {
    const l = $('#log');
    const atBottom = l.scrollTop + l.clientHeight >= l.scrollHeight - 30;
    l.innerHTML = G.log.slice(-250).map(e => `<div class="${e.msg.startsWith('—') ? 'turnline' : ''}">${esc(e.msg)}</div>`).join('');
    if (atBottom) l.scrollTop = l.scrollHeight;
  }

  function findHand(uid) { return G.players[ME].hand.find(h => h.uid === uid); }
  function findSelected() {
    if (!selected) return null;
    const s = selected;
    if (s.zone === 'hand') return findHand(s.uid);
    if (s.zone === 'avatar') return En.findAvatar(G, s.uid);
    if (s.zone === 'land') return G.land && G.land.uid === s.uid ? G.land : null;
    return s.inst;
  }

  function renderDetail() {
    const box = $('#detail');
    const inst = findSelected();
    if (!inst) { box.innerHTML = '<div class="placeholder">แตะการ์ดเพื่อดูรายละเอียด</div>'; return; }
    const c = inst.card;
    const gems = (c.gems || []).filter(g => g.count).map(g => `${g.count} ${COLOR_TH[g.color] || g.color}`).join(', ') || '0';
    const meta = [TYPE_TH[c.type] + (c.magicType ? ' · ' + c.magicType : ''), c.cost != null ? 'Cost ' + c.cost : null, 'GEM ' + gems,
      c.color ? 'สี' + (COLOR_TH[c.color] || c.color) : null, c.symbol ? 'Symbol ' + c.symbol : null, c.power != null ? 'POWER ' + c.power : null, c.onlyOne ? 'Only #1' : null].filter(Boolean).join(' · ');
    const fx = FX(c.id);
    const impl = !c.text || (fx && Object.keys(fx).length) || /^(โล่มนุษย์|เตะไข่|ลูกฮึด|สามัคคี|แทงหลัง)/.test(c.text);
    box.innerHTML = `<div class="artslot"></div><div class="dname">${esc(c.name)}</div><div class="dmeta">${esc(meta)} · ${c.id}</div>
      ${c.text ? `<div class="dtext">${esc(c.text)}</div>` : ''}
      ${impl ? '' : '<div class="note">⚠️ เอฟเฟกต์ของการ์ดนี้ยังไม่ทำงานในเวอร์ชันนี้ (ใช้เป็น GEM / สู้ด้วย POWER ได้ตามปกติ)</div>'}
      <div class="btns"></div>`;
    box.querySelector('.artslot').replaceWith(artEl(c, 'big'));
    const btns = box.querySelector('.btns');
    const add = (label, fn, primary, disabled, title) => { const b = document.createElement('button'); b.textContent = label; if (primary) b.className = 'primary'; b.disabled = !!disabled; if (title) b.title = title; b.onclick = fn; btns.appendChild(b); return b; };

    if (mode && mode.kind === 'pay' && selected.zone === 'hand' && selected.uid === mode.uid) {
      add('ยืนยันจ่าย GEM', confirmPay, true);
      add('ยกเลิก', () => { mode = null; render(); });
      return;
    }
    if (selected.zone === 'hand' && myTurn()) {
      const idx = G.players[ME].hand.indexOf(inst);
      if (c.type === 'avatar') { const r = En.canSummon(G, ME, idx, null); add('อัญเชิญ', () => beginPay(inst), true, !r.ok); if (!r.ok) note(btns, r.error); }
      if (c.type === 'construct') { const r = En.canBuild(G, ME, idx, null); add('ก่อสร้าง', () => beginPay(inst), true, !r.ok); if (!r.ok) note(btns, r.error); }
      if (c.type === 'magic') { const r = En.canCast(G, ME, idx); add('ใช้ Magic', () => act({ k: 'cast', idx: G.players[ME].hand.indexOf(inst) }), true, !r.ok); if (!r.ok) note(btns, r.error); }
      En.activatables(G, ME).filter(x => x.kind === 'hand' && x.uid === inst.uid).forEach(x => add(x.label, () => act({ k: 'activate', uid: x.uid })));
    }
    if ((selected.zone === 'land' || (['avatar', 'construct', 'magic'].includes(selected.zone) && inst.owner === ME)) && myTurn()) {
      En.activatables(G, ME).filter(x => x.uid === inst.uid || x.src === inst.uid).forEach(x => add(x.label, () => act({ k: 'activate', uid: x.uid }), true));
      if (selected.zone === 'avatar' && G.phase === 'battle' && !inst.rested && En.attackTargets(G, ME, inst.uid).length) add('โจมตี', () => { mode = { kind: 'attack', uid: inst.uid }; render(); }, true);
    }
  }
  function note(btns, text) { const n = document.createElement('div'); n.className = 'note'; n.textContent = text; btns.appendChild(n); }

  function select(zone, inst) { selected = { zone, uid: inst.uid, inst }; render(); }

  function clickHand(c) {
    if (mode && mode.kind === 'pay') {
      if (c.uid === mode.uid) return;
      if (En.gemTotal(c.card) <= 0) return toast('การ์ด GEM 0 ใช้จ่ายไม่ได้');
      mode.sel.has(c.uid) ? mode.sel.delete(c.uid) : mode.sel.add(c.uid);
      return render();
    }
    if (mode) mode = null;
    select('hand', c);
  }

  function clickAvatar(p, a) {
    if (mode && mode.kind === 'attack') {
      if (p === BOT) return doAttack({ kind: 'avatar', uid: a.uid });
      if (a.uid === mode.uid) { mode = null; return render(); }
    }
    select('avatar', a);
    if (p === ME && myTurn('battle') && !a.rested && En.attackTargets(G, ME, a.uid).length) { mode = { kind: 'attack', uid: a.uid }; render(); }
  }

  function beginPay(inst) {
    const pl = G.players[ME];
    const idx = pl.hand.indexOf(inst);
    const ctx = En.payCtx(G, ME, inst.card);
    if (ctx.cost === 0) return act({ k: inst.card.type === 'construct' ? 'build' : 'summon', idx, pay: [] });
    const sug = En.findPayment(pl, idx, null, ctx) || [];
    mode = { kind: 'pay', uid: inst.uid, sel: new Set(sug.map(i => pl.hand[i].uid)) };
    selected = { zone: 'hand', uid: inst.uid };
    render();
  }

  function confirmPay() {
    const pl = G.players[ME];
    const inst = findHand(mode.uid);
    const idx = pl.hand.indexOf(inst);
    const pay = [...mode.sel].map(u => pl.hand.findIndex(h => h.uid === u));
    const r = En.checkPayment(inst.card, pay.map(i => pl.hand[i].card), En.payCtx(G, ME, inst.card));
    if (!r.ok) return toast(r.error);
    selected = null;
    act({ k: inst.card.type === 'construct' ? 'build' : 'summon', idx, pay });
  }

  async function doAttack(target) {
    const uid = mode.uid;
    const sup = En.supportersFor(G, ME, uid);
    let sups = [];
    if (sup.length) {
      const pick = await humanAsk({ title: 'ใช้ สามัคคี / แทงหลัง ช่วยโจมตีไหม? (Avatar ที่เลือกจะเปลี่ยนเป็นสภาพนอน)', anyCount: true, optional: true, skipLabel: 'ไม่ใช้', confirmLabel: 'ใช้ใบที่เลือก',
        options: sup.map(s => ({ label: s.card.name + (En.hasKw(s.card, 'สามัคคี') ? ' (+' + En.basePower(G, s) + ')' : ' (+1)'), card: s.card, value: s.uid })) });
      if (Array.isArray(pick)) sups = pick;
    }
    act({ k: 'attack', uid, target, sups });
  }

  function viewZone(p, z) {
    const list = G.players[p][z];
    humanAsk({ title: `${z === 'hell' ? 'นรก' : 'มิติมืด'} ของ ${G.players[p].name} (${list.length} ใบ)`, view: true, options: list.slice().reverse().map(c => ({ label: c.card.name, card: c.card, value: c.uid })) });
  }

  // ---------- modal (human decisions) ----------
  let modalQueue = Promise.resolve();
  function humanAsk(req) {
    const run = () => new Promise(resolve => {
      const m = $('#modal');
      $('#modalTitle').textContent = req.title;
      const body = $('#modalBody'); body.innerHTML = '';
      const foot = $('#modalFoot'); foot.innerHTML = '';
      const multi = req.multi || (req.anyCount ? 99 : 0);
      const sel = new Set();
      const done = v => { m.classList.add('hidden'); if (req.focus) { focusNow = null; if (G) render(); } resolve(v); };
      if (req.focus) { body.appendChild(focusStrip(req.focus)); focusNow = req.focus; if (G) render(); }
      let confirmBtn = null;
      const refresh = () => {
        body.querySelectorAll('[data-v]').forEach(el => el.querySelector('.card') && el.querySelector('.card').classList.toggle('sel', sel.has(el.dataset.k)));
        if (confirmBtn) confirmBtn.disabled = req.multi ? sel.size !== Math.min(req.multi, req.options.length) : sel.size === 0;
        if (confirmBtn && req.multi) confirmBtn.textContent = `ยืนยัน (${sel.size}/${Math.min(req.multi, req.options.length)})`;
      };
      req.options.forEach((o, k) => {
        const w = document.createElement('div'); w.dataset.v = '1'; w.dataset.k = String(k);
        if (o.card) {
          w.className = 'opt';
          w.appendChild(cardEl(o.card, { onclick: () => {
            if (req.view) { selected = { zone: 'view', uid: 'v', inst: { card: o.card } }; renderDetail(); return; }
            if (multi) { sel.has(String(k)) ? sel.delete(String(k)) : sel.add(String(k)); if (req.multi && sel.size > req.multi) sel.delete([...sel][0]); refresh(); }
            else done(o.value);
          } }));
          const l = document.createElement('div'); l.textContent = o.label; w.appendChild(l);
        } else {
          const b = document.createElement('button'); b.className = 'optbtn primary'; b.textContent = o.label; b.onclick = () => done(o.value); w.appendChild(b);
        }
        body.appendChild(w);
      });
      if (!req.options.length) body.innerHTML = '<div style="color:var(--muted)">ไม่มีการ์ด</div>';
      if (multi) {
        confirmBtn = document.createElement('button'); confirmBtn.className = 'primary'; confirmBtn.textContent = req.confirmLabel || 'ยืนยัน';
        confirmBtn.onclick = () => done([...sel].map(k => req.options[+k].value));
        foot.appendChild(confirmBtn);
      }
      if (req.optional || req.view) {
        const s = document.createElement('button'); s.textContent = req.view ? 'ปิด' : (req.skipLabel || (req.react ? 'ไม่ตอบโต้' : 'ข้าม'));
        s.onclick = () => done(req.anyCount && !req.view ? [] : null); foot.appendChild(s);
      }
      refresh();
      m.classList.remove('hidden');
    });
    const p = modalQueue.then(run);
    modalQueue = p.catch(() => {});
    return p;
  }

  // "X attacks Y" strip at the top of a react prompt, so the player sees what is being targeted
  function focusStrip(f) {
    const w = document.createElement('div'); w.className = 'focus';
    const side = (x, cls) => {
      const d = document.createElement('div'); d.className = 'fside ' + cls;
      if (x && x.life != null) { d.innerHTML = `<div class="flife">LIFE</div><div>LIFE ของ${esc(G.players[x.life].name)}</div>`; return d; }
      if (!x || !x.card) return null;
      const own = x.uid != null && G ? (En.findAvatar(G, x.uid) || {}).owner : null;
      d.appendChild(cardEl(x.card, { onclick: () => { selected = { zone: 'view', uid: 'v', inst: { card: x.card } }; renderDetail(); } }));
      const l = document.createElement('div'); l.textContent = x.card.name + (own != null ? ` (${own === ME ? 'ของคุณ' : 'ของ' + G.players[own].name})` : ''); d.appendChild(l);
      return d;
    };
    const a = side(f.from, 'src'), b = side(f.to, 'tgt');
    if (a) w.appendChild(a);
    const v = document.createElement('div'); v.className = 'fverb'; v.textContent = f.verb + (b ? ' ➜' : ''); w.appendChild(v);
    if (b) w.appendChild(b);
    return w;
  }

  function showGameOver() {
    if (!G || G._shownOver) return;
    G._shownOver = true;
    render();
    const win = G.winner === ME;
    const m = $('#modal');
    $('#modalTitle').textContent = 'จบการดวล';
    $('#modalBody').innerHTML = `<div class="gameover"><div class="big-res" style="color:${win ? 'var(--gold)' : 'var(--red)'}">${win ? 'ชนะ!' : 'แพ้'}</div><div>${esc(G.players[1 - G.winner].name)} แพ้เพราะ ${esc(G.winReason)}</div><div style="color:var(--muted);margin-top:6px">จบในเทิร์นที่ ${G.turn}</div></div>`;
    const f = $('#modalFoot'); f.innerHTML = '';
    const again = document.createElement('button'); again.className = 'primary'; again.textContent = 'ดวลอีกครั้ง';
    again.onclick = () => { m.classList.add('hidden'); if (!net) return startGame(lastSetup); if (net.role === 'host') hostNewGame(); };
    if (net && net.role !== 'host') { again.disabled = true; again.textContent = 'รอเจ้าของห้องเริ่มเกมใหม่'; }
    const back = document.createElement('button'); back.textContent = net ? 'ออกจากห้อง' : 'เปลี่ยน Deck';
    back.onclick = () => { if (net) net.link.send({ t: 'bye' }); dropOnline(); goHome(); };
    const look = document.createElement('button'); look.textContent = 'ดูกระดาน';
    look.onclick = () => m.classList.add('hidden');
    f.append(look, back, again);
    m.classList.remove('hidden');
  }

  let toastT = 0;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  // ----- scaled stage: fill the window at any resolution, phone included -----
  function fitStage() {
    const d = $('#duel'); if (!d) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const portrait = vw < vh * 0.95;
    const minW = portrait ? 780 : 1240, minH = 1180;
    const sc = Math.min(vw / minW, vh / minH);
    d.classList.add('stage'); d.classList.toggle('portrait', portrait);
    d.style.setProperty('--sc', sc); d.style.setProperty('--sw', (vw / sc) + 'px'); d.style.setProperty('--sh', (vh / sc) + 'px');
    if (!portrait) $('#panel').classList.remove('open');
    const btn = $('#panelBtn'), acts = $('#duel .actions'); if (acts && btn.parentNode !== acts) acts.appendChild(btn);
    document.documentElement.style.setProperty('--mz', Math.max(1, Math.min(sc, 1.6)));
  }
  window.addEventListener('resize', fitStage);
  window.addEventListener('orientationchange', () => setTimeout(fitStage, 150));
  $('#panelBtn').onclick = e => { e.stopPropagation(); $('#panel').classList.toggle('open'); };
  $('#duel').addEventListener('click', e => { const p = $('#panel'); if (p.classList.contains('open') && !p.contains(e.target) && e.target.id !== 'panelBtn') p.classList.remove('open'); });
  fitStage();

  // expose for automated testing
  window.TCUI = { get game() { return G; }, get online() { return net; }, startGame, humanAsk, cardEl, artEl, toast, esc, get imgBase() { return imgBase; } };
  initStart();
  if (window.TCI18N) window.TCI18N.onChange(() => { renderDeckInfo(); if (G) render(); });
})();
