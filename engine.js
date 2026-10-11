// Battle of Talingchan — rules engine (based on Rule Book ver. 3.2)
// Game state + legal actions. Actions are async because cards can ask a player to choose
// (targets, reactions, Human Shield...). Works in the browser and in Node.
(function (root) {
  'use strict';

  const PHASE_TH = { mulligan: 'เตรียมเกม', draw: 'Draw Phase', main: 'Main Phase', battle: 'Battle Phase', end: 'End Phase', gameover: 'จบเกม' };
  const MAX_AVATARS = 4;
  const MAX_CONSTRUCTS = 3;
  const HAND_LIMIT = 7;
  const EQUIP_NAME = 'อาวุธหุ่นนักรบผู้กล้า';

  let uidSeq = 1;

  // ---------- helpers ----------
  function rng(state) {
    let t = (state.seed = (state.seed + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(state, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng(state) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function gemTotal(card) { return (card.gems || []).reduce((s, g) => s + (g.count || 0), 0); }
  function gemColor(card) { const g = (card.gems || []).find(x => x.count > 0); return g ? g.color : null; }
  function makeInst(card, owner) { return { uid: uidSeq++, card, owner }; }
  function opp(p) { return 1 - p; }
  function hasKw(card, kw) { return Array.isArray(card.keywords) ? card.keywords.includes(kw) : (card.text || '').includes(kw); }
  function named(card, word) { return (card.name || '').includes(word) || (card.alsoNamed || []).some(n => n.includes(word)); }
  function FX(id) { return (root.TC_EFFECTS || {})[id] || null; }

  // ---------- setup ----------
  // opts: { seed, first, players:[{name,isBot,deck:[card],life:[card]}], ask(p, req) -> Promise }
  function createGame(opts) {
    const state = {
      seed: (opts.seed >>> 0) || ((Math.random() * 1e9) >>> 0),
      players: [], turn: 0, active: 0, first: 0, phase: 'mulligan',
      magicUsed: [{}, {}], land: null, winner: null, winReason: '',
      log: [], pendingLife: [[], []], resolving: 0,
    };
    Object.defineProperty(state, 'ask', { value: opts.ask, enumerable: false, writable: true });
    Object.defineProperty(state, 'onChange', { value: opts.onChange || (() => {}), enumerable: false, writable: true });
    for (let p = 0; p < 2; p++) {
      const def = opts.players[p];
      const pl = {
        name: def.name, deckName: def.deckName || '', isBot: !!def.isBot,
        deck: def.deck.map(c => makeInst(c, p)),
        life: def.life.map(c => Object.assign(makeInst(c, p), { faceUp: false })),
        hand: [], avatars: [], magicZone: [], constructs: [], hell: [], dark: [],
        mods: [], mulliganDone: false,
      };
      shuffle(state, pl.deck);
      shuffle(state, pl.life);
      state.players.push(pl);
    }
    for (let p = 0; p < 2; p++) for (let i = 0; i < 5; i++) drawCard(state, p, true);
    state.first = opts.first != null ? opts.first : (rng(state) < 0.5 ? 0 : 1);
    log(state, `${state.players[state.first].name} ได้เริ่มเล่นก่อน`);
    return state;
  }

  async function mulligan(state, p, handIdxs) {
    const pl = state.players[p];
    if (pl.mulliganDone) return err('เปลี่ยนการ์ดไปแล้ว');
    const idxs = [...new Set(handIdxs)].sort((a, b) => b - a);
    const moved = idxs.map(i => pl.hand.splice(i, 1)[0]);
    pl.deck.push(...moved);
    for (let i = 0; i < moved.length; i++) drawCard(state, p, true);
    shuffle(state, pl.deck);
    pl.mulliganDone = true;
    log(state, `${pl.name} เปลี่ยนการ์ดบนมือ ${moved.length} ใบ`);
    if (state.players.every(x => x.mulliganDone)) await startTurn(state, state.first);
    return ok();
  }

  function log(state, msg) { state.log.push({ turn: state.turn, msg }); if (state.onChange) state.onChange(); }
  function ok(extra) { return Object.assign({ ok: true }, extra); }
  function err(msg) { return { ok: false, error: msg }; }

  function lose(state, p, reason) {
    if (state.winner != null) return;
    state.winner = opp(p);
    state.winReason = reason;
    state.phase = 'gameover';
    log(state, `🏁 ${state.players[p].name} แพ้: ${reason}`);
  }

  function drawCard(state, p, setup) {
    const pl = state.players[p];
    if (!pl.deck.length) { if (!setup) lose(state, p, 'การ์ดใน Deck หมด'); return null; }
    const c = pl.deck.shift();
    pl.hand.push(c);
    if (!setup && pl.deck.length === 0) lose(state, p, 'การ์ดใน Deck หมด');
    return c;
  }

  // ---------- turn structure ----------
  async function startTurn(state, p) {
    if (state.winner != null) return;
    state.turn++;
    state.active = p;
    state.magicUsed = [{}, {}];
    const pl = state.players[p];
    pl.mods = pl.mods.filter(m => m.until !== 'myNextTurn');
    state.phase = 'draw';
    log(state, `— เทิร์น ${state.turn}: ${pl.name} —`);
    pl.avatars.forEach(a => { if (a.noUntap) a.noUntap = false; else a.rested = false; });
    // Draw: the starting player's first turn draws 2; otherwise 1. Either way, top the hand up to 3.
    let n = state.turn === 1 ? 2 : 1;
    if (pl.hand.length + n < 3) n = 3 - pl.hand.length;
    for (let i = 0; i < n && state.winner == null; i++) drawCard(state, p);
    log(state, `${pl.name} จั่วการ์ด ${n} ใบ`);
    if (state.winner != null) return;
    state.phase = 'main';
    await resolvePendingLife(state, p);
  }

  async function goBattle(state, p) {
    if (state.phase !== 'main' || state.active !== p) return err('ไม่ใช่ช่วง Main Phase');
    if (state.turn === 1) return err('ผู้เล่นที่เริ่มก่อนเข้า Battle Phase ในเทิร์นแรกไม่ได้');
    state.phase = 'battle';
    log(state, `${state.players[p].name} เข้าสู่ Battle Phase`);
    const pl = state.players[p];
    if (pl.battleBuff) { pl.battleBuff = false; pl.avatars.forEach(a => addMod(state, a, 1, 'endTurn')); log(state, 'LIFE: Avatar ทุกใบ POWER +1'); }
    return ok();
  }

  async function endTurn(state, p) {
    if (state.active !== p || !['main', 'battle'].includes(state.phase)) return err('ยังจบเทิร์นไม่ได้');
    state.phase = 'end';
    const pl = state.players[p];
    // end-phase triggers
    for (const a of pl.avatars.slice()) {
      if (a.destroyAtEnd && onField(state, a)) await destroyAvatar(state, a, 'ความกล้าหาญ — ถูกทำลายใน End Phase');
    }
    for (const a of pl.avatars.slice()) {
      const fx = FX(a.card.id);
      if (fx && fx.endPhase && onField(state, a)) await fx.endPhase(api(state), p, a);
    }
    if (state.winner != null) return ok();
    // discard down to 7 (last action of the turn)
    const over = pl.hand.length - HAND_LIMIT;
    if (over > 0) {
      const picks = await state.ask(p, {
        title: `ทิ้งการ์ดบนมือให้เหลือ ${HAND_LIMIT} ใบ (เลือก ${over} ใบ)`, multi: over,
        options: pl.hand.map((h, i) => ({ label: h.card.name, card: h.card, value: i, score: -cardValue(h.card) })),
      });
      const idxs = (Array.isArray(picks) ? picks : []).slice(0, over);
      while (idxs.length < over) { const left = pl.hand.map((_, i) => i).filter(i => !idxs.includes(i)); idxs.push(left[0]); }
      idxs.sort((a, b) => b - a).forEach(i => pl.hell.push(pl.hand.splice(i, 1)[0]));
      log(state, `${pl.name} ทิ้งการ์ดให้เหลือ ${HAND_LIMIT} ใบ`);
    }
    state.players.forEach(x => { x.mods = x.mods.filter(m => m.until !== 'endTurn'); });
    state.players.forEach(x => x.avatars.forEach(a => { a.lostAbilities = false; a.extraKw = null; }));
    await startTurn(state, opp(p));
    return ok();
  }

  function cardValue(card) {
    if (card.type === 'avatar') return (card.power || 0) * 2 + (FX(card.id) ? 2 : 1);
    if (card.type === 'construct') return 3;
    if (card.type === 'magic') return FX(card.id) && FX(card.id).magic ? 5 : 1;
    return 1;
  }

  // ---------- costs ----------
  function payRestrictOk(payCard, target) {
    const fx = FX(payCard.id);
    return !(fx && fx.payOnlyFor && !fx.payOnlyFor(target));
  }
  // Each paying card needs GEM>0, matching color (colorless pays any), total >= cost,
  // and no card may be redundant (can't keep paying once the cost is covered).
  function checkPayment(card, payCards) {
    const cost = card.cost || 0;
    if (cost === 0) return payCards.length === 0 ? ok({ sum: 0 }) : err('Cost 0 ไม่ต้องจ่าย GEM');
    let sum = 0;
    for (const pc of payCards) {
      const g = gemTotal(pc);
      if (g <= 0) return err(`${pc.name} มี GEM 0 ใช้จ่ายไม่ได้`);
      const col = gemColor(pc);
      if (col && col !== 'colorless' && col !== card.color) return err(`GEM สี ${col} ของ "${pc.name}" ใช้กับการ์ดสี ${card.color} ไม่ได้`);
      if (!payRestrictOk(pc, card)) return err(`"${pc.name}" ใช้จ่ายให้การ์ดนี้ไม่ได้ (กฎประจำตัวการ์ด)`);
      sum += g;
    }
    if (sum < cost) return err(`GEM ไม่พอ (${sum}/${cost})`);
    for (const pc of payCards) if (sum - gemTotal(pc) >= cost) return err('จ่าย GEM เกินจำเป็น (มีการ์ดที่ไม่ต้องใช้)');
    return ok({ sum });
  }

  // Cheapest legal payment from hand (excluding handIdx). Returns hand indices or null.
  function findPayment(pl, handIdx, card) {
    card = card || pl.hand[handIdx].card;
    const cost = card.cost || 0;
    if (cost === 0) return [];
    const cands = pl.hand.map((c, i) => ({ i, c: c.card }))
      .filter(x => x.i !== handIdx && gemTotal(x.c) > 0 && payRestrictOk(x.c, card))
      .filter(x => { const col = gemColor(x.c); return !col || col === 'colorless' || col === card.color; })
      .sort((a, b) => cardValue(a.c) - cardValue(b.c)).slice(0, 12);
    let best = null;
    const n = cands.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      let sum = 0, val = 0; const pick = [];
      for (let b = 0; b < n; b++) if (mask & (1 << b)) { pick.push(cands[b]); sum += gemTotal(cands[b].c); val += cardValue(cands[b].c); }
      if (sum < cost) continue;
      if (pick.some(x => sum - gemTotal(x.c) >= cost)) continue;
      const fxBonus = pick.reduce((s, x) => s - (FX(x.c.id) && FX(x.c.id).onPaidAsCost ? 3 : 0), 0);
      const score = val * 10 + (sum - cost) + fxBonus;
      if (!best || score < best.score) best = { score, idxs: pick.map(x => x.i) };
    }
    return best ? best.idxs : null;
  }

  function takeFromHand(pl, idxs) {
    const sorted = [...idxs].sort((a, b) => b - a);
    const out = {};
    sorted.forEach(i => { out[i] = pl.hand.splice(i, 1)[0]; });
    return idxs.map(i => out[i]);
  }

  // ---------- main phase ----------
  function mainCheck(state, p) {
    if (state.winner != null) return err('เกมจบแล้ว');
    if (state.active !== p || state.phase !== 'main') return err('ทำได้เฉพาะ Main Phase ของตัวเอง');
    if (state.resolving) return err('มีความสามารถกำลังทำงานอยู่');
    return null;
  }

  function canSummon(state, p, handIdx, payIdxs) {
    const e = mainCheck(state, p); if (e) return e;
    const pl = state.players[p];
    const inst = pl.hand[handIdx];
    if (!inst || inst.card.type !== 'avatar') return err('ไม่ใช่การ์ด Avatar');
    const fx = FX(inst.card.id);
    if (fx && fx.noHandSummon) return err('การ์ดนี้อัญเชิญจากบนมือไม่ได้ (กฎประจำตัวการ์ด)');
    if (pl.avatars.length >= MAX_AVATARS) return err(`Avatar Zone เต็ม (สูงสุด ${MAX_AVATARS} ใบ)`);
    if (payIdxs && payIdxs.includes(handIdx)) return err('ใช้การ์ดตัวเองจ่ายไม่ได้');
    if (!payIdxs) return findPayment(pl, handIdx) ? ok() : err('GEM บนมือไม่พอ');
    return checkPayment(inst.card, payIdxs.map(i => pl.hand[i].card));
  }

  async function summon(state, p, handIdx, payIdxs) {
    const c = canSummon(state, p, handIdx, payIdxs); if (!c.ok) return c;
    const pl = state.players[p];
    const [inst, ...paid] = takeFromHand(pl, [handIdx, ...payIdxs]);
    pl.hell.push(...paid);
    log(state, `${pl.name} อัญเชิญ ${inst.card.name} (POWER ${inst.card.power})` + (paid.length ? ` — ทิ้ง ${paid.map(x => x.card.name).join(', ')} เป็น GEM` : ''));
    state.resolving++;
    try {
      await putAvatar(state, p, inst, { jutti: true, paid });
    } finally { state.resolving--; }
    return ok();
  }

  // Put an avatar on the Avatar Zone. Opponent may respond (e.g. อุบัติเหตุ!!!) before จุติ resolves.
  async function putAvatar(state, p, inst, o) {
    o = o || {};
    const pl = state.players[p];
    if (pl.avatars.length >= MAX_AVATARS) { pl.hell.push(inst); log(state, 'Avatar Zone เต็ม — การ์ดถูกส่งลงนรก'); return false; }
    Object.assign(inst, { rested: !!o.rested, summonedTurn: state.turn, owner: p, usedTurn: 0, halved: false, lostAbilities: false });
    pl.avatars.push(inst);
    if (o.paid) for (const pc of o.paid) { const f = FX(pc.card.id); if (f && f.onPaidAsCost) await f.onPaidAsCost(api(state), p, pc, inst); }
    await reactWindow(state, opp(p), 'summon', { avatar: inst });
    if (o.jutti !== false && onField(state, inst)) {
      const fx = FX(inst.card.id);
      if (fx && fx.onSummon) await fx.onSummon(api(state), p, inst);
    }
    return true;
  }

  function canBuild(state, p, handIdx, payIdxs) {
    const e = mainCheck(state, p); if (e) return e;
    const pl = state.players[p];
    const inst = pl.hand[handIdx];
    if (!inst || inst.card.type !== 'construct') return err('ไม่ใช่การ์ด Construct');
    if (pl.constructs.length >= MAX_CONSTRUCTS) return err('Construct Zone เต็ม');
    if (pl.constructs.some(x => x.card.name === inst.card.name)) return err('มี Construct ชื่อนี้อยู่แล้ว');
    if (!payIdxs) return findPayment(pl, handIdx) ? ok() : err('GEM บนมือไม่พอ');
    return checkPayment(inst.card, payIdxs.map(i => pl.hand[i].card));
  }

  async function build(state, p, handIdx, payIdxs) {
    const c = canBuild(state, p, handIdx, payIdxs); if (!c.ok) return c;
    const pl = state.players[p];
    const [inst, ...paid] = takeFromHand(pl, [handIdx, ...payIdxs]);
    pl.hell.push(...paid);
    pl.constructs.push(inst);
    log(state, `${pl.name} ก่อสร้าง ${inst.card.name}`);
    return ok();
  }

  // ----- Magic -----
  function magicType(card) { return card.magicType || 'normal'; }

  function canCast(state, p, handIdx) {
    if (state.winner != null) return err('เกมจบแล้ว');
    const pl = state.players[p];
    const inst = pl.hand[handIdx];
    if (!inst || inst.card.type !== 'magic') return err('ไม่ใช่การ์ด Magic');
    const mt = magicType(inst.card);
    const fx = FX(inst.card.id);
    if (mt === 'react') {
      if (!fx || !fx.magic) return err('React Magic ใบนี้ใช้ได้เมื่อเงื่อนไขเกิดขึ้น (เกมจะถามเอง)');
      if (state.active !== p || !['main', 'battle'].includes(state.phase)) return err('ใช้ได้ในเทิร์นตัวเอง');
    } else {
      const e = mainCheck(state, p); if (e) return e;
    }
    if (state.magicUsed[p][mt]) return err(`ใช้ ${mt} Magic ไปแล้วในเทิร์นนี้ (ประเภทละ 1 ครั้งต่อเทิร์น)`);
    if (!fx || !fx.magic) return err('เอฟเฟกต์ของการ์ดนี้ยังไม่รองรับในเกม — ใช้เป็น GEM ได้');
    if (fx.canUse && !fx.canUse(api(state), p)) return err('เงื่อนไขของการ์ดยังไม่ครบ');
    if (mt === 'modification' && !equipTargets(state, p, inst.card).length) return err('ไม่มี Avatar ที่สวมใส่ได้');
    return ok();
  }

  function equipTargets(state, p, card) {
    const fx = FX(card.id);
    return state.players[p].avatars.filter(a => !fx || !fx.equipOk || fx.equipOk(api(state), a));
  }

  async function cast(state, p, handIdx) {
    const c = canCast(state, p, handIdx); if (!c.ok) return c;
    const pl = state.players[p];
    const inst = pl.hand.splice(handIdx, 1)[0];
    state.resolving++;
    try { await resolveMagic(state, p, inst, {}); } finally { state.resolving--; }
    return ok();
  }

  async function resolveMagic(state, p, inst, ctx) {
    const pl = state.players[p];
    const mt = magicType(inst.card);
    const fx = FX(inst.card.id);
    state.magicUsed[p][mt] = true;
    log(state, `${pl.name} ใช้ ${mt === 'land' ? 'Land' : mt === 'react' ? 'React' : mt === 'modification' ? 'Modification' : 'Normal'} Magic "${inst.card.name}"`);
    let target = null;
    if (mt === 'modification') {
      target = await choose(state, p, `สวมใส่ "${inst.card.name}" ให้ Avatar ใบไหน`, equipTargets(state, p, inst.card).map(a => avOpt(state, a, basePower(state, a))));
    }
    // opponent may counter (ชายจากอนาคต ...)
    const r = await reactWindow(state, opp(p), 'magic', { card: inst, caster: p });
    if (r && r.cancel) { pl.hell.push(inst); log(state, `ผลของ "${inst.card.name}" ถูกยกเลิก`); return { cancelled: true }; }
    if (mt === 'land') {
      if (state.land) { state.players[state.land.owner].hell.push(state.land); log(state, `Land Magic "${state.land.card.name}" ถูกส่งลงนรก`); }
      state.land = inst; inst.owner = p; inst.usedTurn = 0; inst.usedBy = [];
      if (fx.magic !== true) await fx.magic(api(state), p, inst, ctx);
    } else if (mt === 'modification') {
      if (!target || !onField(state, target)) { pl.hell.push(inst); return {}; }
      await attach(state, p, inst, target);
      if (typeof fx.magic === 'function') await fx.magic(api(state), p, inst, target);
    } else {
      const res = await fx.magic(api(state), p, inst, ctx);
      pl.hell.push(inst);
      return res || {};
    }
    return {};
  }

  async function attach(state, p, inst, target) {
    inst.attachedTo = target.uid;
    inst.owner = p;
    state.players[p].magicZone.push(inst);
    log(state, `"${inst.card.name}" สวมใส่ให้ ${target.card.name}`);
    const fx = FX(inst.card.id);
    if (fx && fx.onEquip) await fx.onEquip(api(state), p, inst, target);
    // "when you equip อาวุธหุ่นนักรบผู้กล้า" triggers
    for (const a of state.players[p].avatars.slice()) {
      const f = FX(a.card.id);
      if (f && f.onAnyEquip) await f.onAnyEquip(api(state), p, a, inst);
    }
  }

  // React window: let player `rp` respond to an event with a React Magic in hand.
  async function reactWindow(state, rp, trigger, ctx) {
    if (state.winner != null) return null;
    const pl = state.players[rp];
    const opts = [];
    pl.hand.forEach((h, i) => {
      const fx = FX(h.card.id);
      // React Magic: 1 per turn, except cards with ignoreReactLimit (อย่าให้มีครั้งที่ 2), which have their own once-per-turn-by-name limit
      const free = fx && fx.ignoreReactLimit ? !state.magicUsed[rp]['name:' + h.card.name] : !state.magicUsed[rp].react;
      if (free && h.card.type === 'magic' && magicType(h.card) === 'react' && fx && fx.react && fx.react.on === trigger &&
        (!fx.react.when || fx.react.when(api(state), rp, ctx))) {
        opts.push({ label: `ใช้ "${h.card.name}"`, card: h.card, value: h.uid, score: fx.react.botScore ? fx.react.botScore(api(state), rp, ctx) : 1 });
      }
    });
    if (!opts.length) return null;
    const what = trigger === 'summon' ? `${ctx.avatar.card.name} ถูกอัญเชิญ` : trigger === 'magic' ? `อีกฝ่ายใช้ "${ctx.card.card.name}"` : trigger === 'attack' ? `${ctx.attacker.card.name} กำลังโจมตี` : trigger;
    const pick = await state.ask(rp, { title: `ตอบโต้? (${what})`, options: opts, optional: true, react: true });
    if (pick == null) return null;
    const idx = pl.hand.findIndex(h => h.uid === pick);
    if (idx < 0) return null;
    const inst = pl.hand.splice(idx, 1)[0];
    const fx = FX(inst.card.id);
    if (fx.ignoreReactLimit) state.magicUsed[rp]['name:' + inst.card.name] = true;
    else state.magicUsed[rp].react = true;
    log(state, `⚡ ${pl.name} ตอบโต้ด้วย React Magic "${inst.card.name}"`);
    const counter = await reactWindow(state, opp(rp), 'magic', { card: inst, caster: rp });
    pl.hell.push(inst);
    if (counter && counter.cancel) { log(state, `ผลของ "${inst.card.name}" ถูกยกเลิก`); return null; }
    return (await fx.react.run(api(state), rp, ctx)) || {};
  }

  // ----- activated abilities (สั่งใช้) -----
  function activatables(state, p) {
    const out = [];
    if (mainCheck(state, p)) return out;
    const pl = state.players[p];
    const A = api(state);
    pl.avatars.forEach(a => {
      const fx = FX(a.card.id);
      if (fx && fx.activate && !a.lostAbilities && !(fx.oncePerTurn !== false && a.usedTurn === state.turn) && (!fx.canActivate || fx.canActivate(A, p, a)))
        out.push({ kind: 'avatar', uid: a.uid, label: fx.activateLabel || 'สั่งใช้' });
    });
    // Land Magic is shared: either player may use its ability in their own Main Phase (once per turn each)
    if (state.land) {
      const fx = FX(state.land.card.id);
      if (fx && fx.activate && (state.land.usedBy || [])[p] !== state.turn && (!fx.canActivate || fx.canActivate(A, p, state.land)))
        out.push({ kind: 'land', uid: state.land.uid, label: fx.activateLabel || 'สั่งใช้' });
    }
    pl.hand.forEach(h => {
      const fx = FX(h.card.id);
      if (fx && fx.handActivate && (!fx.canHandActivate || fx.canHandActivate(A, p, h)))
        out.push({ kind: 'hand', uid: h.uid, label: fx.handActivateLabel || 'สั่งใช้จากมือ' });
    });
    return out;
  }

  async function activate(state, p, uid) {
    const act = activatables(state, p).find(x => x.uid === uid);
    if (!act) return err('ใช้ความสามารถนี้ไม่ได้ตอนนี้');
    const pl = state.players[p];
    state.resolving++;
    try {
      if (act.kind === 'hand') {
        const h = pl.hand.find(x => x.uid === uid);
        log(state, `${pl.name} สั่งใช้ "${h.card.name}" จากบนมือ`);
        await FX(h.card.id).handActivate(api(state), p, h);
      } else {
        const src = act.kind === 'land' ? state.land : findAvatar(state, uid);
        if (act.kind === 'land') { src.usedBy = src.usedBy || []; src.usedBy[p] = state.turn; } else src.usedTurn = state.turn;
        log(state, `${pl.name} สั่งใช้ความสามารถของ "${src.card.name}"`);
        await FX(src.card.id).activate(api(state), p, src);
      }
    } finally { state.resolving--; }
    return ok();
  }

  // ---------- power / symbol ----------
  function symbolOf(state, a) {
    let s = a.card.symbol;
    for (const pl of state.players) for (const m of pl.magicZone) {
      const f = FX(m.card.id);
      if (m.attachedTo === a.uid && f && f.equipSymbol) s = f.equipSymbol;
    }
    if (state.land && FX(state.land.card.id) && FX(state.land.card.id).allSymbol) s = FX(state.land.card.id).allSymbol;
    return s;
  }

  function attachedTo(state, a) {
    const out = [];
    state.players.forEach(pl => pl.magicZone.forEach(m => { if (m.attachedTo === a.uid) out.push(m); }));
    return out;
  }

  function basePower(state, a) {
    let pw = a.card.power || 0;
    if (a.halved) pw = Math.floor(pw / 2);
    const A = api(state);
    const fx = FX(a.card.id);
    if (fx && fx.setPower && !a.lostAbilities) pw = fx.setPower(A, a.owner, a);
    if (fx && fx.continuousSelf && !a.lostAbilities) pw += fx.continuousSelf(A, a.owner, a) || 0;
    state.players.forEach((pl, p) => {
      pl.avatars.forEach(src => {
        const sfx = FX(src.card.id);
        if (src !== a && sfx && sfx.aura && !src.lostAbilities) pw += sfx.aura(A, p, src, a) || 0;
      });
    });
    attachedTo(state, a).forEach(m => {
      const mfx = FX(m.card.id);
      if (mfx && mfx.equipPower) pw += typeof mfx.equipPower === 'function' ? mfx.equipPower(A, a, m) : mfx.equipPower;
    });
    if (state.land) {
      const lfx = FX(state.land.card.id);
      if (lfx && lfx.aura) pw += lfx.aura(A, state.land.owner, state.land, a) || 0;
    }
    state.players.forEach(pl => pl.mods.forEach(m => { if (m.uid === a.uid) pw += m.amount; }));
    return Math.max(0, pw);
  }
  function addMod(state, a, amount, until) { state.players[a.owner].mods.push({ uid: a.uid, amount, until: until || 'endTurn' }); }

  function findAvatar(state, uid) {
    for (const pl of state.players) { const a = pl.avatars.find(x => x.uid === uid); if (a) return a; }
    return null;
  }
  function onField(state, a) { return state.players.some(pl => pl.avatars.includes(a)); }
  function hasAbility(state, a, kw) { return !a.lostAbilities && (hasKw(a.card, kw) || (a.extraKw || []).includes(kw)); }

  // ---------- battle ----------
  function attackTargets(state, p, uid) {
    const a = findAvatar(state, uid);
    if (!a || a.owner !== p || a.rested) return [];
    const o = state.players[opp(p)];
    const A = api(state);
    const t = o.avatars.filter(x => { const f = FX(x.card.id); return !(f && f.untargetable && f.untargetable(A, x)); }).map(x => ({ kind: 'avatar', uid: x.uid }));
    o.constructs.forEach(x => t.push({ kind: 'construct', uid: x.uid }));
    if (o.avatars.length === 0 || hasAbility(state, a, 'เตะไข่')) t.push({ kind: 'life' });
    return t;
  }

  function canAttack(state, p, uid, target) {
    if (state.winner != null) return err('เกมจบแล้ว');
    if (state.active !== p || state.phase !== 'battle') return err('โจมตีได้เฉพาะ Battle Phase');
    if (state.resolving) return err('มีความสามารถกำลังทำงานอยู่');
    const a = findAvatar(state, uid);
    if (!a || a.owner !== p) return err('ไม่พบ Avatar');
    if (a.rested) return err('Avatar อยู่ในสภาพนอน');
    if (!target) return attackTargets(state, p, uid).length ? ok() : err('ไม่มีเป้าหมาย');
    const ts = attackTargets(state, p, uid);
    if (!ts.some(t => t.kind === target.kind && (t.kind === 'life' || t.uid === target.uid))) return err('เป้าหมายไม่ถูกต้อง');
    return ok();
  }

  function supportersFor(state, p, uid) {
    return state.players[p].avatars.filter(s => s.uid !== uid && !s.rested && (hasAbility(state, s, 'สามัคคี') || hasAbility(state, s, 'แทงหลัง')));
  }

  async function attack(state, p, uid, target, supporterUids) {
    const c = canAttack(state, p, uid, target); if (!c.ok) return c;
    state.resolving++;
    try { await doAttack(state, p, uid, target, supporterUids || []); } finally { state.resolving--; }
    return ok();
  }

  async function doAttack(state, p, uid, target, supporterUids) {
    const A = api(state);
    const pl = state.players[p], o = state.players[opp(p)];
    const a = findAvatar(state, uid);
    a.rested = true;
    // Step 1: สามัคคี / แทงหลัง
    let bonus = 0; const backstabbers = [];
    for (const sid of supporterUids) {
      const s = findAvatar(state, sid);
      if (!s || s.owner !== p || s.rested || s === a) continue;
      if (hasAbility(state, s, 'สามัคคี')) { const v = basePower(state, s); s.rested = true; bonus += v; log(state, `${s.card.name} สามัคคี: POWER +${v}`); }
      else if (hasAbility(state, s, 'แทงหลัง')) { s.rested = true; bonus += 1; backstabbers.push(s); log(state, `${s.card.name} แทงหลัง: POWER +1`); }
    }
    let tgt = target;
    const tName = t => t.kind === 'life' ? 'LIFE Card Zone' : t.kind === 'construct' ? (o.constructs.find(x => x.uid === t.uid) || {}).card.name : findAvatar(state, t.uid).card.name;
    log(state, `⚔️ ${a.card.name} โจมตี ${tName(tgt)}`);
    // Step 2: snapshot + "when attacks"
    if (bonus) addMod(state, a, bonus, 'endTurn');
    const afx = FX(a.card.id);
    if (afx && afx.onAttack && !a.lostAbilities) await afx.onAttack(A, p, a);
    for (const m of attachedTo(state, a)) { const f = FX(m.card.id); if (f && f.onEquippedAttack) await f.onEquippedAttack(A, p, m, a); }
    if (!onField(state, a)) return;
    // opponent react (ไปเลยมอนตี้, งานจับมือ ...)
    const r = await reactWindow(state, opp(p), 'attack', { attacker: a, target: tgt });
    if (r && r.cancelAttack) { log(state, 'การโจมตีถูกยกเลิก'); return; }
    if (!onField(state, a)) return;
    // Step 3: Human Shield (โล่มนุษย์)
    const shields = o.avatars.filter(x => !x.rested && hasAbility(state, x, 'โล่มนุษย์') && !(tgt.kind === 'avatar' && tgt.uid === x.uid));
    if (shields.length) {
      const pick = await state.ask(opp(p), {
        title: `ใช้โล่มนุษย์รับการโจมตีของ ${a.card.name} (POWER ${basePower(state, a)}) แทน ${tName(tgt)}?`, optional: true,
        options: shields.map(x => avOpt(state, x, (basePower(state, x) > basePower(state, a) ? 5 : basePower(state, x) === basePower(state, a) ? 1 : (tgt.kind === 'life' ? 2 : -5)))),
      });
      if (pick != null) {
        const s = findAvatar(state, pick); s.rested = true; tgt = { kind: 'avatar', uid: s.uid };
        log(state, `🛡️ ${s.card.name} ใช้โล่มนุษย์ รับการโจมตีแทน`);
      }
    }
    // target confirmed triggers
    if (tgt.kind === 'avatar') {
      const d = findAvatar(state, tgt.uid);
      const dfx = d && FX(d.card.id);
      if (dfx && dfx.onTargeted && !d.lostAbilities) await dfx.onTargeted(A, d.owner, d);
    }
    if (!onField(state, a)) return;
    const power = basePower(state, a);

    if (tgt.kind === 'life') {
      log(state, `${a.card.name} (POWER ${power}) โจมตีเข้า LIFE ของ ${o.name}`);
      await damageLife(state, opp(p), power > 0 ? 1 : 0);
    } else if (tgt.kind === 'construct') {
      const cs = o.constructs.find(x => x.uid === tgt.uid);
      if (cs && power > (cs.card.power || 0)) { o.constructs.splice(o.constructs.indexOf(cs), 1); o.hell.push(cs); log(state, `${cs.card.name} ถูกทำลาย`); }
      else log(state, 'POWER ไม่พอ — ไม่มีอะไรเกิดขึ้น');
    } else {
      const d = findAvatar(state, tgt.uid);
      if (!d) { log(state, 'เป้าหมายหายไป — การโจมตีสิ้นสุด'); return; }
      const dp = basePower(state, d);
      log(state, `${a.card.name} (POWER ${power}) ต่อสู้กับ ${d.card.name} (POWER ${dp})`);
      let aDies = false, dDies = false;
      if (power === 0 && dp === 0) log(state, 'POWER 0 ทั้งคู่ — ไม่มีอะไรเกิดขึ้น');
      else if (power > dp) dDies = true;
      else if (dp > power) aDies = true;
      else {
        const al = hasAbility(state, a, 'ลูกฮึด'), dl = hasAbility(state, d, 'ลูกฮึด');
        if (al && !dl) dDies = true; else if (dl && !al) aDies = true; else aDies = dDies = true;
      }
      if (dDies) await destroyAvatar(state, d, 'แพ้การต่อสู้', p);
      if (aDies) await destroyAvatar(state, a, 'แพ้การต่อสู้', opp(p));
      if (dDies && !onField(state, d) && onField(state, a) && afx && afx.onBattleWin && !a.lostAbilities) await afx.onBattleWin(A, p, a);
    }
    // แทงหลัง: after the attack, if the attacker's color differs from the backstabber, destroy the attacker
    for (const s of backstabbers) {
      if (onField(state, a) && a.card.color !== s.card.color) await destroyAvatar(state, a, `แทงหลังของ ${s.card.name} (สีต่างกัน)`);
    }
  }

  async function damageLife(state, p, times) {
    const pl = state.players[p];
    for (let k = 0; k < times && state.winner == null; k++) {
      const next = pl.life.find(l => !l.faceUp);
      if (!next) { lose(state, p, 'ได้รับความเสียหายต่อ LIFE ขณะอยู่ในสถานะ "สาหัส"'); return; }
      next.faceUp = true;
      log(state, `💔 LIFE ของ ${pl.name} ถูกหงาย: "${next.card.name}" (${pl.life.filter(l => !l.faceUp).length} ใบที่เหลือ)`);
      state.pendingLife[p].push(next);
      if (pl.life.every(l => l.faceUp)) log(state, `⚠️ ${pl.name} เข้าสู่สถานะ "สาหัส" — โดนอีกครั้งเดียวแพ้`);
    }
    if (times === 0) log(state, 'POWER 0 — ไม่ทำความเสียหายต่อ LIFE');
  }

  // "หงาย" LIFE by an effect: the LIFE card is turned face up but its ability does not trigger (only damage triggers it)
  function flipLife(state, p, times) {
    const pl = state.players[p];
    let k = 0;
    for (; k < times; k++) {
      const next = pl.life.find(l => !l.faceUp);
      if (!next) break;
      next.faceUp = true;
      log(state, `LIFE ของ ${pl.name} ถูกหงายด้วยเอฟเฟกต์: "${next.card.name}" (ไม่ทำงาน)`);
    }
    if (k && pl.life.every(l => l.faceUp)) log(state, `⚠️ ${pl.name} เข้าสู่สถานะ "สาหัส" — โดนอีกครั้งเดียวแพ้`);
    return k;
  }

  async function resolvePendingLife(state, p) {
    const list = state.pendingLife[p]; state.pendingLife[p] = [];
    for (const l of list) {
      const fx = FX(l.card.id);
      if (fx && fx.life) { log(state, `ความสามารถ LIFE "${l.card.name}" ทำงาน`); await fx.life(api(state), p, l); }
    }
  }

  // ---------- leaving the field ----------
  function removeFromField(state, a) {
    const pl = state.players.find(x => x.avatars.includes(a));
    if (!pl) return false;
    pl.avatars.splice(pl.avatars.indexOf(a), 1);
    state.players.forEach(x => {
      x.magicZone.slice().forEach(m => {
        if (m.attachedTo === a.uid) {
          x.magicZone.splice(x.magicZone.indexOf(m), 1);
          m.attachedTo = null;
          const f = FX(m.card.id);
          if (f && f.moveOnDeath && a._dying) { m._reattach = true; }
          x.hell.push(m);
          log(state, `"${m.card.name}" ที่สวมใส่อยู่ถูกส่งลงนรก`);
        }
      });
      x.mods = x.mods.filter(m => m.uid !== a.uid);
    });
    Object.assign(a, { rested: false, destroyAtEnd: false, extraKw: null, lostAbilities: false, halved: false });
    return true;
  }

  // byP: player whose card/attack causes the destruction (null = own effect)
  async function destroyAvatar(state, a, why, byP) {
    if (!onField(state, a)) return;
    const A = api(state);
    const owner = state.players.findIndex(pl => pl.avatars.includes(a));
    // replacement effects
    const fx = FX(a.card.id);
    if (fx && fx.preventDestroy && !a.lostAbilities && await fx.preventDestroy(A, owner, a)) return;
    for (const m of attachedTo(state, a)) {
      const f = FX(m.card.id);
      if (f && f.preventLeave && byP != null && byP !== owner && await f.preventLeave(A, owner, m, a)) return;
    }
    for (const s of state.players[owner].avatars.slice()) {
      const f = FX(s.card.id);
      if (s !== a && f && f.substitute && f.substitute(A, owner, s, a)) {
        const yes = await state.ask(owner, { title: `ทำลาย "${s.card.name}" แทน "${a.card.name}"?`, optional: true, options: [{ label: 'ใช่', value: 1, score: 1 }] });
        if (yes != null) { await destroyAvatar(state, s, `ถูกทำลายแทน ${a.card.name}`); return; }
      }
    }
    const equips = attachedTo(state, a);
    removeFromField(state, a);
    state.players[a.owner].hell.push(a);
    log(state, `💀 ${a.card.name} ถูกทำลายลงนรก (${why})`);
    // equipped avatars that move to another avatar (วูตาตู)
    for (const m of equips) {
      const f = FX(m.card.id);
      if (f && f.moveOnDeath) {
        const others = state.players[m.owner].avatars;
        if (others.length) {
          const pl = state.players[m.owner];
          pl.hell.splice(pl.hell.indexOf(m), 1);
          const t = await choose(state, m.owner, `ย้าย "${m.card.name}" ไปสวมใส่ให้ใบไหน`, others.map(x => avOpt(state, x, basePower(state, x))));
          await attach(state, m.owner, m, findAvatar(state, t) || others[0]);
        }
      }
    }
    if (fx && fx.lastWill) await fx.lastWill(A, a.owner, a);
  }

  // ---------- choices ----------
  function avOpt(state, a, score) {
    return { label: `${a.card.name} (POWER ${basePower(state, a)})`, card: a.card, value: a.uid, score: score == null ? 0 : score };
  }
  async function choose(state, p, title, options, optional) {
    if (!options.length) return null;
    if (options.length === 1 && !optional) return options[0].value;
    return state.ask(p, { title, options, optional: !!optional });
  }

  // ---------- effect API for card scripts ----------
  function api(state) {
    const A = {
      state,
      log: m => log(state, m),
      opp,
      named,
      hasKw,
      gem: gemTotal,
      symbol: a => symbolOf(state, a),
      power: a => basePower(state, a),
      onField: a => onField(state, a),
      attached: a => attachedTo(state, a),
      avatars: p => state.players[p].avatars,
      hand: p => state.players[p].hand,
      hell: p => state.players[p].hell,
      deck: p => state.players[p].deck,
      choose: (p, title, options, optional) => choose(state, p, title, options, optional),
      avOpt: (a, score) => avOpt(state, a, score),
      cardOpt: (inst, score) => ({ label: inst.card.name, card: inst.card, value: inst.uid, score: score == null ? cardValue(inst.card) : score }),
      draw: (p, n) => { let k = 0; for (let i = 0; i < n && state.winner == null; i++) if (drawCard(state, p)) k++; log(state, `${state.players[p].name} จั่วการ์ด ${k} ใบ`); },
      addPower: (a, amount, until) => { addMod(state, a, amount, until); log(state, `${a.card.name} POWER ${amount >= 0 ? '+' : ''}${amount}`); },
      destroy: (a, why, byP) => destroyAvatar(state, a, why || 'ความสามารถการ์ด', byP),
      bounce: a => { if (removeFromField(state, a)) { state.players[a.owner].hand.push(a); log(state, `${a.card.name} กลับขึ้นมือ`); } },
      banishAvatar: a => { if (removeFromField(state, a)) { state.players[a.owner].dark.push(a); log(state, `${a.card.name} ถูกเนรเทศ`); } },
      sacrifice: async (p, a) => { if (removeFromField(state, a)) { state.players[a.owner].hell.push(a); log(state, `${a.card.name} ถูกเซ่นไหว้ลงนรก`); const f = FX(a.card.id); if (f && f.lastWill) await f.lastWill(A, a.owner, a); } },
      discard: async (p, n, title) => {
        const pl = state.players[p];
        const picks = await state.ask(p, { title: title || `ทิ้งการ์ดบนมือ ${n} ใบ`, multi: n, options: pl.hand.map(h => A.cardOpt(h, -cardValue(h.card))) });
        const uids = (Array.isArray(picks) ? picks : [picks]).filter(x => x != null).slice(0, n);
        uids.forEach(u => { const i = pl.hand.findIndex(h => h.uid === u); if (i >= 0) pl.hell.push(pl.hand.splice(i, 1)[0]); });
        log(state, `${pl.name} ทิ้งการ์ด ${uids.length} ใบ`);
        return uids.length;
      },
      // ธรณีสูบ: top N of deck to hell, with "when milled" triggers
      mill: async (p, n, src) => {
        const pl = state.players[p];
        let extra = 0;
        pl.avatars.forEach(a => { const f = FX(a.card.id); if (f && f.millExtra && (!src || src.card.id !== a.card.id)) extra += f.millExtra; });
        n += extra;
        const milled = [];
        for (let i = 0; i < n && pl.deck.length; i++) { const c = pl.deck.shift(); pl.hell.push(c); milled.push(c); }
        log(state, `${pl.name} ธรณีสูบ ${milled.length} ใบ: ${milled.map(c => c.card.name).join(', ')}`);
        if (!pl.deck.length) { lose(state, p, 'การ์ดใน Deck หมด'); return milled; }
        for (const c of milled) { const f = FX(c.card.id); if (f && f.onMilled && pl.hell.includes(c)) await f.onMilled(A, p, c); }
        return milled;
      },
      // สอดแนม: look at top N, pick up to `max` matching cards to hand, rest to bottom
      scout: async (p, n, pred, title, max, deckOwner) => {
        const dp = deckOwner == null ? p : deckOwner;
        const deck = state.players[dp].deck;
        const seen = deck.splice(0, Math.min(n, deck.length));
        log(state, `${state.players[p].name} สอดแนม ${seen.length} ใบ`);
        const can = seen.filter(c => pred(c.card));
        const got = [];
        for (let k = 0; k < (max || 1) && can.length; k++) {
          const pick = await choose(state, p, title || 'เลือกการ์ดขึ้นมือ', can.map(c => A.cardOpt(c)), true);
          if (pick == null) break;
          const c = can.splice(can.findIndex(x => x.uid === pick), 1)[0];
          seen.splice(seen.indexOf(c), 1);
          got.push(c);
        }
        deck.push(...seen);
        return got;
      },
      toHand: (p, inst) => { state.players[p].hand.push(inst); log(state, `${state.players[p].name} นำ "${inst.card.name}" ขึ้นมือ`); },
      takeFrom: (zone, inst) => { const i = zone.indexOf(inst); if (i >= 0) zone.splice(i, 1); return inst; },
      shuffleDeck: p => shuffle(state, state.players[p].deck),
      // pick from a zone list by predicate (with player choice)
      pickFrom: async (p, zone, pred, title, optional) => {
        const can = zone.filter(c => pred(c.card, c));
        if (!can.length) return null;
        const v = await choose(state, p, title, can.map(c => A.cardOpt(c)), optional);
        return can.find(c => c.uid === v) || null;
      },
      summonFrom: async (p, zone, inst, o) => { A.takeFrom(zone, inst); log(state, `${state.players[p].name} อัญเชิญ ${inst.card.name} (POWER ${inst.card.power})`); return putAvatar(state, p, inst, o || {}); },
      roomFor: p => state.players[p].avatars.length < MAX_AVATARS,
      attach: (p, inst, target) => attach(state, p, inst, target),
      damageLife: (p, times) => damageLife(state, p, times),
      flipLife: (p, times) => flipLife(state, p, times),
      rest: a => { a.rested = true; },
      wake: a => { a.rested = false; },
      dice: () => 1 + Math.floor(rng(state) * 6),
      battleBuff: p => { state.players[p].battleBuff = true; },
      equipTargets: (p, card) => equipTargets(state, p, card),
      magicUsed: (p, t) => !!state.magicUsed[p][t],
    };
    return A;
  }

  // ---------- queries for UI/bot ----------
  function legalSummons(state, p) {
    const pl = state.players[p];
    const out = [];
    if (mainCheck(state, p)) return out;
    pl.hand.forEach((h, i) => {
      if (h.card.type !== 'avatar' || pl.avatars.length >= MAX_AVATARS) return;
      const fx = FX(h.card.id);
      if (fx && fx.noHandSummon) return;
      const pay = findPayment(pl, i);
      if (pay) out.push({ handIdx: i, pay });
    });
    return out;
  }

  const Engine = {
    PHASE_TH, MAX_AVATARS, HAND_LIMIT, EQUIP_NAME,
    createGame, mulligan, goBattle, endTurn, reactWindow,
    canSummon, summon, canBuild, build, canCast, cast, activatables, activate,
    attackTargets, canAttack, attack, supportersFor, basePower, findAvatar, symbolOf, attachedTo,
    checkPayment, findPayment, legalSummons, gemTotal, gemColor, hasKw, named, cardValue, opp, api, magicType,
  };
  root.TCEngine = Engine;
  if (typeof module !== 'undefined') module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
