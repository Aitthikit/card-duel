// Browser UI: board rendering, player input, modal choices and the bot loop.
(function () {
  'use strict';
  const En = window.TCEngine, Bot = window.TCBot, FX = id => (window.TC_EFFECTS || {})[id];
  const $ = s => document.querySelector(s);
  const ME = 0, BOT = 1;
  const COLOR_TH = { red: 'แดง', blue: 'น้ำเงิน', green: 'เขียว', yellow: 'เหลือง', purple: 'ม่วง', black: 'ดำ', white: 'ขาว', colorless: 'ไร้สี', grey: 'เทา' };
  const TYPE_TH = { avatar: 'Avatar', magic: 'Magic', construct: 'Construct', life: 'LIFE' };

  let G = null;            // game state
  let mode = null;         // {kind:'pay', uid, sel:Set} | {kind:'attack', uid}
  let selected = null;     // {zone, uid}
  let busy = false;
  let botSpeed = 550;
  let imgBase = '../refs/';
  let lastSetup = null;

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
    if (!card) { d.classList.add('back'); return d; }
    d.appendChild(artEl(card));
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
  function artEl(card, cls) {
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
      img.alt = card.name; img.loading = 'lazy';
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
  function initStart() {
    fillDeckSelects();
    try { const saved = JSON.parse(localStorage.getItem('tc-duel-prefs') || '{}'); if (saved.my && Decks.get(saved.my)) $('#myDeck').value = saved.my; if (saved.bot && (saved.bot === 'rand' || Decks.get(saved.bot))) $('#botDeck').value = saved.bot; if (saved.speed) $('#speedSel').value = saved.speed; } catch (e) { /* storage unavailable */ }
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
      try { localStorage.setItem('tc-duel-prefs', JSON.stringify({ my, bot: $('#botDeck').value, speed: $('#speedSel').value })); } catch (e) { /* ignore */ }
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
    $('#battleBtn').onclick = () => act(() => En.goBattle(G, ME));
    $('#endBtn').onclick = () => act(() => En.endTurn(G, ME));
    $('#quitBtn').onclick = async () => {
      const ok = await humanAsk({ title: 'ออกจากการดวลนี้?', options: [{ label: 'ออก', value: 1 }], optional: true });
      if (ok) { G = null; $('#duel').classList.add('hidden'); $('#start').classList.remove('hidden'); }
    };
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
    const dmy = Decks.get(setup.my), dbot = Decks.get(setup.bot);
    const d1 = Decks.expand(dmy), d2 = Decks.expand(dbot);
    let raf = 0;
    G = En.createGame({
      first: setup.first,
      players: [
        { name: 'คุณ', deckName: dmy.name, deck: d1.deck, life: d1.life },
        { name: 'บอท', deckName: dbot.name, isBot: true, deck: d2.deck, life: d2.life },
      ],
      ask: (p, req) => (p === BOT ? Promise.resolve(Bot.botAsk(req)) : humanAsk(req)),
      onChange: () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); },
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

  // ---------- actions ----------
  async function act(fn) {
    if (busy || !G || G.winner != null) return;
    busy = true; mode = null; render();
    let r;
    try { r = await fn(); } catch (e) { console.error(e); r = { ok: false, error: 'เกิดข้อผิดพลาด: ' + e.message }; }
    busy = false; mode = null;
    if (r && r.ok === false) toast(r.error);
    render();
    runBotIfNeeded();
  }

  async function runBotIfNeeded() {
    if (!G || busy || G.winner != null) { if (G && G.winner != null) showGameOver(); return; }
    if (G.active !== BOT || G.phase === 'mulligan') return;
    busy = true; render();
    try { await Bot.playTurn(G, BOT, botSpeed); } catch (e) { console.error(e); toast('บอทเกิดข้อผิดพลาด: ' + e.message); if (G.active === BOT && G.winner == null) await En.endTurn(G, BOT); }
    busy = false; render();
    if (G.winner != null) showGameOver();
  }

  function myTurn(ph) { return G && G.winner == null && !busy && G.active === ME && (!ph || G.phase === ph); }

  // ---------- render ----------
  function render() {
    if (!G) return;
    renderSide(BOT, $('#oppSide'));
    renderSide(ME, $('#meSide'));
    renderHand();
    renderMid();
    renderLog();
    renderDetail();
  }

  function renderSide(p, root) {
    const pl = G.players[p], isMe = p === ME;
    root.innerHTML = '';
    const info = document.createElement('div'); info.className = 'pinfo';
    const up = pl.life.filter(l => l.faceUp).length;
    info.innerHTML = `<div class="pname ${G.active === p ? 'active' : ''}">${esc(pl.name)}</div><div class="dname-s">${esc(pl.deckName || '')}</div>
      <div class="stat"><span>Deck</span><b>${pl.deck.length}</b></div>
      <div class="stat"><span>มือ</span><b>${pl.hand.length}</b></div>
      <div class="stat click" data-z="hell"><span>นรก</span><b>${pl.hell.length}</b></div>
      <div class="stat click" data-z="dark"><span>มิติมืด</span><b>${pl.dark.length}</b></div>
      ${up === 5 ? '<div class="severe">สถานะ "สาหัส"</div>' : ''}`;
    info.querySelectorAll('[data-z]').forEach(el => el.onclick = () => viewZone(p, el.dataset.z));

    const zones = document.createElement('div'); zones.className = 'zones';
    const av = document.createElement('div'); av.className = 'avzone';
    const sub = document.createElement('div'); sub.className = 'subzone';
    const targets = mode && mode.kind === 'attack' && !isMe ? En.attackTargets(G, ME, mode.uid) : [];
    for (let i = 0; i < En.MAX_AVATARS; i++) {
      const a = pl.avatars[i];
      if (!a) { const s = document.createElement('div'); s.className = 'slot'; av.appendChild(s); continue; }
      const eqs = En.attachedTo(G, a);
      let cls = a.rested ? 'rested' : '';
      if (selected && selected.uid === a.uid) cls += ' sel';
      if (targets.some(t => t.kind === 'avatar' && t.uid === a.uid)) cls += ' target';
      if (isMe && mode && mode.kind === 'attack' && mode.uid === a.uid) cls += ' sel';
      if (isMe && myTurn('battle') && !mode && !a.rested && En.attackTargets(G, ME, a.uid).length) cls += ' can';
      if (isMe && myTurn('main') && !mode && En.activatables(G, ME).some(x => x.uid === a.uid)) cls += ' can';
      av.appendChild(cardEl(a.card, { cls, power: En.basePower(G, a), eq: eqs.length || null, onclick: () => clickAvatar(p, a) }));
    }
    pl.constructs.forEach(c => sub.appendChild(chip('🏛 ' + c.card.name + ' (P' + c.card.power + ')', () => { if (mode && mode.kind === 'attack' && !isMe) return doAttack({ kind: 'construct', uid: c.uid }); select('construct', c); }, targets.some(t => t.kind === 'construct' && t.uid === c.uid))));
    pl.magicZone.forEach(m => { const host = En.findAvatar(G, m.attachedTo); sub.appendChild(chip('🔧 ' + m.card.name + (host ? ' → ' + host.card.name : ''), () => select('magic', m))); });
    if (isMe) { zones.appendChild(av); zones.appendChild(sub); } else { zones.appendChild(sub); zones.appendChild(av); }

    const lifebox = document.createElement('div'); lifebox.className = 'lifebox';
    const lifeTarget = targets.some(t => t.kind === 'life');
    if (lifeTarget) { lifebox.classList.add('target'); lifebox.onclick = () => doAttack({ kind: 'life' }); }
    lifebox.innerHTML = `<div class="lbl">LIFE ${5 - up}/5</div>`;
    const ls = document.createElement('div'); ls.className = 'lifes';
    pl.life.forEach(l => {
      const d = document.createElement('div'); d.className = 'life' + (l.faceUp ? ' up' : '');
      d.title = l.faceUp ? l.card.name + ': ' + l.card.text : 'LIFE Card (คว่ำ)';
      if (l.faceUp) d.onclick = e => { if (lifeTarget) return; e.stopPropagation(); select('life', l); };
      ls.appendChild(d);
    });
    lifebox.appendChild(ls);
    root.appendChild(info); root.appendChild(zones); root.appendChild(lifebox);
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
    t.textContent = G.winner != null ? 'จบเกม' : `เทิร์น ${G.turn} · ${G.active === ME ? 'ตาคุณ' : 'ตาบอท'}`;
    pb.appendChild(t);
    ['draw', 'main', 'battle', 'end'].forEach(ph => { const s = document.createElement('span'); s.className = 'ph' + (G.phase === ph ? ' on' : ''); s.textContent = En.PHASE_TH[ph].replace(' Phase', ''); pb.appendChild(s); });
    const lz = $('#landZone'); lz.innerHTML = '<div>Land Magic</div>';
    if (G.land) {
      const can = myTurn('main') && En.activatables(G, ME).some(x => x.kind === 'land');
      lz.appendChild(cardEl(G.land.card, { cls: can ? 'can' : '', onclick: () => select('land', G.land) }));
      const o = document.createElement('div'); o.textContent = (G.land.owner === ME ? 'คุณวางไว้' : 'บอทวางไว้') + ' · ใช้ได้ทั้งสองฝ่าย'; lz.appendChild(o);
    } else { const s = document.createElement('div'); s.className = 'slot'; s.style.cssText = '--cw:58px;width:58px;height:79px'; lz.appendChild(s); }
    $('#battleBtn').disabled = !myTurn('main') || G.turn === 1 || !!mode;
    $('#battleBtn').title = G.turn === 1 ? 'ผู้เล่นที่เริ่มก่อนเข้า Battle Phase ในเทิร์นแรกไม่ได้' : '';
    $('#endBtn').disabled = !(myTurn('main') || myTurn('battle')) || !!mode;
    const hint = $('#hint');
    if (G.winner != null) hint.textContent = G.winner === ME ? '🏆 คุณชนะ!' : 'คุณแพ้…';
    else if (G.active === BOT) hint.textContent = 'บอทกำลังเล่น…';
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
      if (c.type === 'magic') { const r = En.canCast(G, ME, idx); add('ใช้ Magic', () => act(() => En.cast(G, ME, G.players[ME].hand.indexOf(inst))), true, !r.ok); if (!r.ok) note(btns, r.error); }
      En.activatables(G, ME).filter(x => x.kind === 'hand' && x.uid === inst.uid).forEach(x => add(x.label, () => act(() => En.activate(G, ME, x.uid))));
    }
    if ((selected.zone === 'land' || (selected.zone === 'avatar' && inst.owner === ME)) && myTurn()) {
      En.activatables(G, ME).filter(x => x.uid === inst.uid).forEach(x => add(x.label, () => act(() => En.activate(G, ME, x.uid)), true));
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
    if ((inst.card.cost || 0) === 0) return act(() => inst.card.type === 'construct' ? En.build(G, ME, idx, []) : En.summon(G, ME, idx, []));
    const sug = En.findPayment(pl, idx) || [];
    mode = { kind: 'pay', uid: inst.uid, sel: new Set(sug.map(i => pl.hand[i].uid)) };
    selected = { zone: 'hand', uid: inst.uid };
    render();
  }

  function confirmPay() {
    const pl = G.players[ME];
    const inst = findHand(mode.uid);
    const idx = pl.hand.indexOf(inst);
    const pay = [...mode.sel].map(u => pl.hand.findIndex(h => h.uid === u));
    const r = En.checkPayment(inst.card, pay.map(i => pl.hand[i].card));
    if (!r.ok) return toast(r.error);
    selected = null;
    act(() => inst.card.type === 'construct' ? En.build(G, ME, idx, pay) : En.summon(G, ME, idx, pay));
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
    act(() => En.attack(G, ME, uid, target, sups));
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
      const done = v => { m.classList.add('hidden'); resolve(v); };
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
    again.onclick = () => { m.classList.add('hidden'); startGame(lastSetup); };
    const back = document.createElement('button'); back.textContent = 'เปลี่ยน Deck';
    back.onclick = () => { m.classList.add('hidden'); G = null; $('#duel').classList.add('hidden'); $('#start').classList.remove('hidden'); };
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

  // expose for automated testing
  window.TCUI = { get game() { return G; }, startGame, humanAsk, cardEl, artEl, toast, esc, get imgBase() { return imgBase; } };
  initStart();
})();
