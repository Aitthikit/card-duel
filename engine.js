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
  // Avatar Zone size: 4, or 6 under พิภพรัททาทุย when every Avatar there (and the new one) is {รัททาทุย}
  function avatarLimit(state, p, card) {
    const lf = state.land && FX(state.land.card.id);
    if (lf && lf.ratWorld && state.land.owner === p && state.players[p].avatars.every(a => symbolOf(state, a) === lf.ratWorld) && (!card || card.symbol === lf.ratWorld)) return 6;
    if (lf && lf.maxAvatars) return lf.maxAvatars;
    return MAX_AVATARS;
  }
  function hasRoom(state, p, card) { return state.players[p].avatars.length < avatarLimit(state, p, card); }
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
  const gemTotalBase = gemTotal;
  function gemColor(card) { const g = (card.gems || []).find(x => x.count > 0); return g ? g.color : null; }
  function makeInst(card, owner) { return { uid: uidSeq++, card, owner }; }
  function opp(p) { return 1 - p; }
  // Battle keywords count only when printed as keywords (a line starting with them), not when an ability merely mentions them
  const BATTLE_KW = ['โล่มนุษย์', 'ลูกฮึด', 'เตะไข่', 'สามัคคี', 'แทงหลัง'];
  function printedKw(card, kw) { return (card.text || '').split('\n').some(l => { const t = l.replace(/["“”]/g, ' ').trim(); return BATTLE_KW.some(b => t.startsWith(b)) && t.split(/\s+/).slice(0, 5).includes(kw); }); }
  function hasKw(card, kw) {
    if (BATTLE_KW.includes(kw)) return printedKw(card, kw);
    return Array.isArray(card.keywords) ? card.keywords.includes(kw) : (card.text || '').includes(kw);
  }
  function named(card, word) { return (card.name || '').includes(word) || (card.alsoNamed || []).some(n => n.includes(word)); }
  // [Link X] / [คู่หู - X]: two Avatars that name each other may be linked (once per turn, owner's action)
  const normName = t => (t || '').replace(/\s+/g, '').replace(/ี/g, 'ิ').replace(/อาวุร/g, 'อาวุธ');
  function linkTags(card) { const out = []; (card.text || '').replace(/\[(?:Link|คู่หู\s*-)\s*([^\]]+)\]/g, (m, n) => { out.push(normName(n)); return m; }); return out; }
  function linkNames(x, y) { const n = normName(y.card.name); return linkTags(x.card).some(t => t && (n.startsWith(t) || t.startsWith(n))); }
  function canLinkPair(x, y) { return x !== y && !x.linked && !y.linked && x.owner === y.owner && (linkNames(x, y) || linkNames(y, x)); }
  function FX(id) { return (root.TC_EFFECTS || {})[id] || null; }

  // ---------- setup ----------
  // opts: { seed, first, players:[{name,isBot,deck:[card],life:[card]}], ask(p, req) -> Promise }
  function createGame(opts) {
    const state = {
      seed: (opts.seed >>> 0) || ((Math.random() * 1e9) >>> 0),
      players: [], turn: 0, active: 0, first: 0, phase: 'mulligan',
      magicUsed: [{}, {}], land: null, winner: null, winReason: '',
      log: [], pendingLife: [[], []], resolving: 0, inBattle: false,
    };
    Object.defineProperty(state, 'ask', { value: opts.ask, enumerable: false, writable: true });
    Object.defineProperty(state, 'onChange', { value: opts.onChange || (() => {}), enumerable: false, writable: true });
    Object.defineProperty(state, 'onFx', { value: opts.onFx || null, enumerable: false, writable: true });
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

  // Visual-effect hook: the UI may return a promise so the game waits for the animation (no-op in tests)
  async function show(state, type, data) {
    if (!state.onFx) return;
    try { await state.onFx(type, data); } catch (e) { /* animation problems never affect the rules */ }
  }

  function log(state, msg) { state.log.push({ turn: state.turn, msg }); if (state.hasTokens) sweepTokens(state); if (state.onChange) state.onChange(); }
  // Tokens stop existing once they leave the field
  function sweepTokens(state) { state.players.forEach(pl => ['hell', 'hand', 'deck', 'dark', 'magicZone'].forEach(z => { if (pl[z].some(x => x.card.token && !(z === 'magicZone' && x.attachedTo))) pl[z] = pl[z].filter(x => !x.card.token || (z === 'magicZone' && x.attachedTo)); })); }
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
    state.attackCount = [0, 0];
    const pl = state.players[p];
    // Land Magic that only stays a set number of turns (มวยทะเลลลลลล)
    if (state.land) {
      const lf = FX(state.land.card.id);
      if (lf && lf.lifetime && state.turn >= (state.land.placedTurn || 0) + lf.lifetime) {
        state.players[state.land.owner].hell.push(state.land);
        log(state, `Land Magic "${state.land.card.name}" ครบ ${lf.lifetime} เทิร์น — ถูกส่งลงนรก`);
        state.land = null;
      }
    }
    pl.mods = pl.mods.filter(m => m.until !== 'myNextTurn');
    state.phase = 'draw';
    log(state, `— เทิร์น ${state.turn}: ${pl.name} —`);
    await show(state, 'turn', { p });
    pl.avatars.forEach(a => { if (a.noUntap) a.noUntap = false; else if (a.heldBy && findAvatar(state, a.heldBy)) { /* stays asleep */ } else { a.heldBy = null; a.rested = false; } });
    // Draw: the starting player's first turn draws 2; otherwise 1. Either way, top the hand up to 3.
    let n = state.turn === 1 ? 2 : 1;
    if (n === 1 && pl.hand.length >= 3 && pl.avatars.some(a => (FX(a.card.id) || {}).superDraw && !a.lostAbilities)) { n = 2; log(state, 'แก๊ง Super Card: จั่ว 2 ใบแทน'); }
    if (pl.skipDraw) { pl.skipDraw = false; n = 0; log(state, `${pl.name} ไม่ได้จั่วการ์ดใน Draw Phase นี้`); }
    if (pl.hand.length + n < 3) n = 3 - pl.hand.length;
    // first Draw Phase: some cards may be taken from the Deck instead of drawing (รัททาทุย นางพญา)
    if (!pl.drawPhases) {
      const tut = pl.deck.filter(c => { const f = FX(c.card.id); return f && f.firstDrawTutor; });
      if (tut.length && n > 0) {
        const v = await choose(state, p, 'Draw Phase แรก: นำการ์ดจาก Deck ขึ้นมือแทนการจั่ว 1 ใบ?', tut.filter((c, i) => tut.findIndex(x => x.card.id === c.card.id) === i).map(c => ({ label: c.card.name, card: c.card, value: c.uid, score: 2 })), true);
        const c = tut.find(x => x.uid === v);
        if (c) { pl.deck.splice(pl.deck.indexOf(c), 1); pl.hand.push(c); n--; shuffle(state, pl.deck); log(state, `${pl.name} นำ "${c.card.name}" จาก Deck ขึ้นมือแทนการจั่ว`); }
      }
    }
    for (const c of pl.constructs.slice()) { const f = FX(c.card.id); if (f && f.drawPhase && n > 0 && pl.constructs.includes(c) && await f.drawPhase(api(state), p, c)) n--; }
    pl.drawPhases = (pl.drawPhases || 0) + 1;
    for (const t of (pl.drawTasks || []).slice()) if (t.at === pl.drawPhases) { pl.drawTasks.splice(pl.drawTasks.indexOf(t), 1); await t.fn(api(state)); }
    const drawnNow = [];
    for (let i = 0; i < n && state.winner == null; i++) { const c = drawCard(state, p); if (c) drawnNow.push(c); }
    log(state, `${pl.name} จั่วการ์ด ${n} ใบ`);
    for (const c of drawnNow) { const f = FX(c.card.id); if (f && f.onDrawPhaseDraw && pl.hand.includes(c) && state.winner == null) await f.onDrawPhaseDraw(api(state), p, c); }
    // "after the normal draw, draw 1 more" (เสามงคล)
    for (const a of pl.avatars.concat(pl.magicZone.filter(m => m.parked && parkedActive(state, p, m)))) { const f = FX(a.card.id); if (f && f.extraDraw && !a.lostAbilities && state.winner == null) { drawCard(state, p); log(state, `${a.card.name}: จั่วเพิ่ม 1 ใบ`); } }
    if (state.winner != null) return;
    state.phase = 'main';
    await resolvePendingLife(state, p);
    for (const u of (pl.darkReturn || []).splice(0)) { const c = pl.dark.find(x => x.uid === u); if (c && hasRoom(state, p, c.card)) { pl.dark.splice(pl.dark.indexOf(c), 1); log(state, `${c.card.name} กลับจากมิติมืดลง Avatar Zone`); await putAvatar(state, p, c, { jutti: false }); } }
    for (const m of pl.magicZone.slice()) if (m.parked && m.returnOnMain) { pl.magicZone.splice(pl.magicZone.indexOf(m), 1); m.parked = false; m.returnOnMain = false; log(state, `${m.card.name} กลับลง Avatar Zone`); await putAvatar(state, p, m, { jutti: false }); }
    if (state.land) { const lf = FX(state.land.card.id); if (lf && lf.landMainStart) await lf.landMainStart(api(state), p, state.land); }
    for (const m of pl.magicZone.slice()) { const f = FX(m.card.id); const h = m.attachedTo && findAvatar(state, m.attachedTo); if (f && f.equipMainStart && h) await f.equipMainStart(api(state), p, m, h); }
    for (const a of pl.avatars.slice()) { const f = FX(a.card.id); if (f && f.mainStart && !a.lostAbilities && onField(state, a)) await f.mainStart(api(state), p, a); }
  }

  async function goBattle(state, p) {
    if (state.phase !== 'main' || state.active !== p) return err('ไม่ใช่ช่วง Main Phase');
    if (state.turn === 1) return err('ผู้เล่นที่เริ่มก่อนเข้า Battle Phase ในเทิร์นแรกไม่ได้');
    state.phase = 'battle';
    log(state, `${state.players[p].name} เข้าสู่ Battle Phase`);
    await show(state, 'battle', { p });
    const pl = state.players[p];
    for (const a of pl.avatars.slice()) { const f = FX(a.card.id); if (f && f.atBattleStart && !a.lostAbilities && onField(state, a)) await f.atBattleStart(api(state), p, a); }
    await reactWindow(state, opp(p), 'battleStart', { p });
    for (const rv of (pl.revive || []).splice(0)) {
      if (state.turn <= rv.after) { pl.revive.push(rv); continue; }
      const c = pl.hell.find(x => x.uid === rv.uid);
      if (c && hasRoom(state, p, c.card)) { pl.hell.splice(pl.hell.indexOf(c), 1); log(state, `${c.card.name} ฟื้นจากนรกใน Battle Phase`); await putAvatar(state, p, c, { jutti: false }); }
    }
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
      if (fx && fx.endPhase && onField(state, a) && !a.lostAbilities) await fx.endPhase(api(state), p, a);
    }
    for (const c of pl.constructs.slice()) { const f = FX(c.card.id); if (f && f.endPhase && pl.constructs.includes(c)) await f.endPhase(api(state), p, c); }
    for (const m of pl.magicZone.slice()) { const f = FX(m.card.id); if (m.parked && f && f.mzEndPhase && pl.magicZone.includes(m)) await f.mzEndPhase(api(state), p, m); }
    if (state.land) { const lf = FX(state.land.card.id); if (lf && lf.landEndPhase) await lf.landEndPhase(api(state), p, state.land); }
    for (const t of (state.endTasks || []).splice(0)) await t(api(state));
    for (const [q, x] of state.players.entries()) for (const h of x.hand.slice()) if (h.costOnly) { x.hand.splice(x.hand.indexOf(h), 1); state.players[h.costOnly.from].hand.push(h); delete h.costOnly; log(state, `"${h.card.name}" กลับคืนให้ ${state.players[h.owner].name}`); void q; }
    for (const a of state.players.flatMap(x => x.avatars.slice())) {
      const f = FX(a.card.id);
      if (f && f.anyEndPhase && !a.lostAbilities && onField(state, a)) await f.anyEndPhase(api(state), a.owner, a);
    }
    for (const x of state.players) for (const m of x.magicZone.slice()) {
      const f = FX(m.card.id);
      const host = findAvatar(state, m.attachedTo);
      if (f && f.wakeAtEnd && host && host.rested) { host.rested = false; log(state, `${host.card.name} กลับมาสภาพตื่น ("${m.card.name}")`); }
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
    for (const x of state.players) for (const a of x.avatars.slice()) {
      if (a.returnAtEnd && a.trueOwner != null) {
        const home = state.players[a.trueOwner];
        if (hasRoom(state, a.trueOwner, a.card)) { x.avatars.splice(x.avatars.indexOf(a), 1); a.owner = a.trueOwner; delete a.trueOwner; home.avatars.push(a); log(state, `${a.card.name} กลับไปอยู่ฝ่าย ${home.name}`); }
      }
      a.returnAtEnd = false;
    }
    state.players.forEach(x => x.avatars.forEach(a => { a.lostAbilities = attachedTo(state, a).some(m => (FX(m.card.id) || {}).silenceHost) || (a.silenceUntil || 0) > state.turn; a.extraKw = null; }));
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
  // ctx (optional): { cost, gem(payCard) } from payCtx — card effects that change the Cost on hand or what counts as GEM
  function payCtx(state, p, card) {
    const A = api(state);
    const fx = FX(card.id);
    const lf = state.land && FX(state.land.card.id);
    let cost = fx && fx.handCost ? Math.max(0, fx.handCost(A, p, card)) : (card.cost || 0);
    if (lf && lf.handCostMod) cost = Math.max(0, cost + lf.handCostMod(A, p, card));
    const anyColor = pc => !!(lf && lf.colorlessGem && lf.colorlessGem(pc)) || state.players[p].avatars.some(a => { const f = FX(a.card.id); return f && f.colorlessGem && !a.lostAbilities && f.colorlessGem(pc); }) || !!((FX(pc.id) || {}).anyColorFor && FX(pc.id).anyColorFor(card));
    if (state.players[p].alienPact && card.type === 'avatar' && /ตัวอะไร[สซ]ักอย่าง/.test(card.name || '')) cost = Math.max(Math.min(cost, 2), cost - 2);
    const gem = pc => { const pf = FX(pc.id); const v = pf && pf.gemAs ? pf.gemAs(A, p, pc, card) : null; return v != null ? v : gemBase(pc); };
    const gemBase = pc => (card.type === 'construct' && (FX(pc.id) || {}).constructGem) ? FX(pc.id).constructGem : (lf && lf.powerAsGem && card.symbol === lf.powerAsGem && pc.type === 'avatar' && pc.symbol === lf.powerAsGem ? Math.max(gemTotal(pc), pc.power || 0) : gemTotal(pc));
    return { cost, gem, anyColor };
  }
  function checkPayment(card, payCards, ctx) {
    const cost = ctx ? ctx.cost : (card.cost || 0);
    const gemTotal = ctx ? ctx.gem : gemTotalBase;
    if (cost === 0) return payCards.length === 0 ? ok({ sum: 0 }) : err('Cost 0 ไม่ต้องจ่าย GEM');
    let sum = 0;
    for (const pc of payCards) {
      const g = gemTotal(pc);
      if (g <= 0) return err(`${pc.name} มี GEM 0 ใช้จ่ายไม่ได้`);
      const col = gemColor(pc);
      if (col && col !== 'colorless' && col !== card.color && !(ctx && ctx.anyColor && ctx.anyColor(pc))) return err(`GEM สี ${col} ของ "${pc.name}" ใช้กับการ์ดสี ${card.color} ไม่ได้`);
      if (!payRestrictOk(pc, card)) return err(`"${pc.name}" ใช้จ่ายให้การ์ดนี้ไม่ได้ (กฎประจำตัวการ์ด)`);
      sum += g;
    }
    if (sum < cost) return err(`GEM ไม่พอ (${sum}/${cost})`);
    for (const pc of payCards) if (sum - gemTotal(pc) >= cost) return err('จ่าย GEM เกินจำเป็น (มีการ์ดที่ไม่ต้องใช้)');
    return ok({ sum });
  }

  // Cheapest legal payment from hand (excluding handIdx). Returns hand indices or null.
  function findPayment(pl, handIdx, card, ctx) {
    card = card || pl.hand[handIdx].card;
    const cost = ctx ? ctx.cost : (card.cost || 0);
    const gemTotal = ctx ? ctx.gem : gemTotalBase;
    if (cost === 0) return [];
    const cands = pl.hand.map((c, i) => ({ i, c: c.card }))
      .filter(x => x.i !== handIdx && gemTotal(x.c) > 0 && payRestrictOk(x.c, card))
      .filter(x => { const col = gemColor(x.c); return !col || col === 'colorless' || col === card.color || (ctx && ctx.anyColor && ctx.anyColor(x.c)); })
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

  // turn-long summon locks: "only {สัตว์} this turn" (เพื่อลูกค้า), names fetched by โรงบาล
  function summonBlock(state, p, card) {
    const pl = state.players[p];
    if (pl.summonOnly && pl.summonOnly.turn === state.turn && card.symbol !== pl.summonOnly.symbol) return `เทิร์นนี้อัญเชิญได้แค่ Avatar {${pl.summonOnly.symbol}}`;
    if (pl.summonOnlyName && pl.summonOnlyName.turn === state.turn && !named(card, pl.summonOnlyName.word)) return `เทิร์นนี้อัญเชิญได้แค่ Avatar "${pl.summonOnlyName.word}"`;
    if (pl.alienPact && card.type === 'avatar' && !(card.color === 'blue' && card.symbol === 'เอเลี่ยน')) return 'เกมนี้อัญเชิญได้แค่ Avatar {เอเลี่ยน} สีฟ้า';
    if (pl.avatars.some(a => (FX(a.card.id) || {}).soloOnly && !a.lostAbilities)) return 'ควบคุม Avatar ใบอื่นไม่ได้ (เนฟิล)';
    if (state.land && (FX(state.land.card.id) || {}).summonCap && pl.summonLog && pl.summonLog.turn === state.turn && pl.summonLog.names.length >= FX(state.land.card.id).summonCap) return `อัญเชิญได้แค่ ${FX(state.land.card.id).summonCap} ครั้งต่อเทิร์น (Land)`;
    { const f = FX(card.id); if (f && f.uniqueOnField && pl.avatars.some(a => a.card.name === card.name)) return `ควบคุม "${card.name}" ได้แค่ 1 ใบ`; }
    for (const src of state.players.flatMap(x => x.avatars)) { const f = FX(src.card.id); const m = f && f.summonRule && !src.lostAbilities && f.summonRule(api(state), src, p, card); if (m) return m; }
    if (pl.locked && pl.locked.turn === state.turn && pl.locked.names.includes(card.name)) return `เทิร์นนี้การ์ดชื่อ "${card.name}" อัญเชิญไม่ได้ (โรงบาล)`;
    return null;
  }
  function isFrozen(state, p, card) { const pl = state.players[p]; return !!(pl.frozen && pl.frozen.turn === state.turn && pl.frozen.names.includes(card.name)); }
  function isLocked(state, p, card) { const pl = state.players[p]; return !!(pl.locked && pl.locked.turn === state.turn && pl.locked.names.includes(card.name)); }

  function canSummon(state, p, handIdx, payIdxs) {
    const e = mainCheck(state, p); if (e) return e;
    const pl = state.players[p];
    const inst = pl.hand[handIdx];
    if (!inst || inst.card.type !== 'avatar') return err('ไม่ใช่การ์ด Avatar');
    const fx = FX(inst.card.id);
    if (fx && fx.noHandSummon) return err('การ์ดนี้อัญเชิญจากบนมือไม่ได้ (กฎประจำตัวการ์ด)');
    const blk = summonBlock(state, p, inst.card); if (blk) return err(blk);
    if (inst.costOnly) return err('การ์ดใบนี้ใช้ได้แค่เป็น Cost');
    if (!hasRoom(state, p, inst.card)) return err(`Avatar Zone เต็ม (สูงสุด ${avatarLimit(state, p, inst.card)} ใบ)`);
    if (payIdxs && payIdxs.includes(handIdx)) return err('ใช้การ์ดตัวเองจ่ายไม่ได้');
    const ctx = payCtx(state, p, inst.card);
    if (!payIdxs) return findPayment(pl, handIdx, null, ctx) ? ok() : err('GEM บนมือไม่พอ');
    return checkPayment(inst.card, payIdxs.map(i => pl.hand[i].card), ctx);
  }

  async function summon(state, p, handIdx, payIdxs) {
    const c = canSummon(state, p, handIdx, payIdxs); if (!c.ok) return c;
    const pl = state.players[p];
    const ctx = payCtx(state, p, pl.hand[handIdx].card);
    const exact = payIdxs.reduce((n, i) => n + ctx.gem(pl.hand[i].card), 0) === ctx.cost;
    const [inst, ...paid] = takeFromHand(pl, [handIdx, ...payIdxs]);
    inst.exact = exact;
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
    if (!hasRoom(state, p, inst.card)) { pl.hell.push(inst); log(state, 'Avatar Zone เต็ม — การ์ดถูกส่งลงนรก'); return false; }
    Object.assign(inst, { exileOnDeath: false, magicImmuneUntil: 0, flipOnWin: 0, fromHell: !!o.fromHell, rested: !!o.rested, summonedTurn: state.turn, owner: p, usedTurn: 0, halved: false, lostAbilities: false, summonedBy: o.by || null });
    if (!o.paid) inst.exact = false;
    pl.avatars.push(inst);
    if (!pl.summonLog || pl.summonLog.turn !== state.turn) pl.summonLog = { turn: state.turn, names: [], cards: [] };
    (pl.everSummoned = pl.everSummoned || []).push(inst.card.name);
    if (pl.pretTurn === state.turn && inst.card.symbol === 'เปรต') { inst.kwUntil = (inst.kwUntil || []).concat({ kw: 'เตะไข่', until: state.turn }); inst.magicImmuneUntil = state.turn; inst.noShieldTurn = state.turn; log(state, `${inst.card.name}: ไม่รับผลจากความสามารถการ์ด และได้รับ เตะไข่ ในเทิร์นนี้`); }
    pl.summonLog.names.push(inst.card.name); (pl.summonLog.cards = pl.summonLog.cards || []).push(inst.card);
    await show(state, 'summon', { p, uid: inst.uid, card: inst.card });
    if (o.paid) for (const pc of o.paid) { const f = FX(pc.card.id); if (f && f.onPaidAsCost) await f.onPaidAsCost(api(state), p, pc, inst); }
    await reactWindow(state, opp(p), 'summon', { avatar: inst });
    { const fx = FX(inst.card.id); if (fx && fx.onEnter && onField(state, inst)) await fx.onEnter(api(state), p, inst); }
    for (const src of pl.avatars.slice()) { const f = FX(src.card.id); if (src !== inst && f && f.onAllyEnter && !src.lostAbilities && onField(state, inst)) await f.onAllyEnter(api(state), p, src, inst); }
    if (o.jutti !== false && onField(state, inst)) {
      const fx = FX(inst.card.id);
      if (fx && fx.onSummon && !suppressed(state, inst, 'jutti')) await fx.onSummon(api(state), p, inst);
      else if (fx && fx.onSummon) log(state, `ความสามารถ จุติ ของ ${inst.card.name} ไม่ทำงาน (Overdose)`);
    }
    for (const src of state.players.flatMap(x => x.avatars.slice())) { const f = FX(src.card.id); if (src !== inst && f && f.onAnySummon && !src.lostAbilities && onField(state, src)) await f.onAnySummon(api(state), src.owner, src, inst); }
    for (const h of state.players[opp(p)].hand.slice()) { const f = FX(h.card.id); if (f && f.onOppSummon && state.players[opp(p)].hand.includes(h) && onField(state, inst)) await f.onOppSummon(api(state), opp(p), h, inst); }
    await sweepZero(state);
    return true;
  }

  // ทรายดูด: Avatars with POWER 0 are destroyed
  async function sweepZero(state) {
    const lf = state.land && FX(state.land.card.id);
    if (!lf || !lf.zeroDies) return;
    for (const a of state.players.flatMap(x => x.avatars.slice())) if (onField(state, a) && basePower(state, a) === 0) await destroyAvatar(state, a, 'POWER 0 (ทรายดูด)');
  }

  function canBuild(state, p, handIdx, payIdxs) {
    const e = mainCheck(state, p); if (e) return e;
    const pl = state.players[p];
    const inst = pl.hand[handIdx];
    if (!inst || inst.card.type !== 'construct') return err('ไม่ใช่การ์ด Construct');
    if (pl.constructs.length >= MAX_CONSTRUCTS) return err('Construct Zone เต็ม');
    if (!(FX(inst.card.id) || {}).multiCopies && pl.constructs.some(x => x.card.name === inst.card.name)) return err('มี Construct ชื่อนี้อยู่แล้ว');
    const ctx = payCtx(state, p, inst.card);
    if (!payIdxs) return findPayment(pl, handIdx, null, ctx) ? ok() : err('GEM บนมือไม่พอ');
    return checkPayment(inst.card, payIdxs.map(i => pl.hand[i].card), ctx);
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
    { const blk = state.players[opp(p)].avatars.find(a => { const f = FX(a.card.id); return f && f.blockOppMagic && !a.lostAbilities && f.blockOppMagic(api(state), a).includes(mt); }); if (blk) return err(`ใช้ ${mt} Magic ไม่ได้ (${blk.card.name})`); }
    if (mt === 'land' && (pl.noLandUntil || 0) >= state.turn) return err('ใช้ Land Magic ไม่ได้จนจบเทิร์นนี้ (มิสทรอม่า)');
    if (mt === 'land' && state.land && (FX(state.land.card.id) || {}).noLand) return err(`ใช้ Land Magic ไม่ได้ ("${state.land.card.name}")`);
    if (mt === 'land' && state.players[opp(p)].avatars.some(a => { const f = FX(a.card.id); return f && f.blockOppLand && !a.lostAbilities && f.blockOppLand(api(state), a); })) return err('อีกฝ่ายทำให้ใช้ Land Magic ไม่ได้');
    if (mt === 'react') {
      if (!fx || !fx.magic) return err('React Magic ใบนี้ใช้ได้เมื่อเงื่อนไขเกิดขึ้น (เกมจะถามเอง)');
      if (state.active !== p || !['main', 'battle'].includes(state.phase)) return err('ใช้ได้ในเทิร์นตัวเอง');
    } else {
      const e = mainCheck(state, p); if (e) return e;
    }
    if (inst.costOnly) return err('การ์ดใบนี้ใช้ได้แค่เป็น Cost');
    const wm = pl.weaponMode === state.turn && mt === 'modification';
    if (wm && !named(inst.card, EQUIP_NAME)) return err('เทิร์นนี้ใช้ได้แค่ Modification Magic "อาวุธหุ่นนักรบผู้กล้า"');
    const extraSpell = (mt === 'normal' && state.magicUsed[p].extraSpell && named(inst.card, 'คาถา')) || (state.magicUsed[p].extraMagic && state.magicUsed[p].extraMagic !== inst.card.name);
    if (!(fx && fx.unlimitedIf && fx.unlimitedIf(api(state), p)) && !extraSpell && (wm ? (state.magicUsed[p].modCount || 0) >= 2 : state.magicUsed[p][mt])) return err(`ใช้ ${mt} Magic ไปแล้วในเทิร์นนี้ (ประเภทละ 1 ครั้งต่อเทิร์น)`);
    if (!fx || !fx.magic) return err('เอฟเฟกต์ของการ์ดนี้ยังไม่รองรับในเกม — ใช้เป็น GEM ได้');
    if (fx.canUse && !fx.canUse(api(state), p)) return err('เงื่อนไขของการ์ดยังไม่ครบ');
    if (mt === 'modification' && !fx.customEquip && !equipTargets(state, p, inst.card).length) return err('ไม่มี Avatar ที่สวมใส่ได้');
    return ok();
  }

  function equipTargets(state, p, card) {
    const fx = FX(card.id);
    const pool = fx && fx.equipAny ? state.players[p].avatars.concat(state.players[opp(p)].avatars) : state.players[p].avatars;
    return pool.filter(a => { const hf = FX(a.card.id) || {}; if (hf.noEquip && !a.lostAbilities) return false; if (hf.equipOnly && !a.lostAbilities && !hf.equipOnly(card)) return false; return !fx || !fx.equipOk || (hf.equipAnything && !a.lostAbilities) || fx.equipOk(api(state), a); });
  }

  async function cast(state, p, handIdx) {
    const c = canCast(state, p, handIdx); if (!c.ok) return c;
    const pl = state.players[p];
    const inst = pl.hand.splice(handIdx, 1)[0];
    state.resolving++;
    try { await resolveMagic(state, p, inst, {}); await sweepZero(state); } finally { state.resolving--; }
    return ok();
  }

  async function resolveMagic(state, p, inst, ctx) {
    const pl = state.players[p];
    const mt = magicType(inst.card);
    const fx = FX(inst.card.id);
    if (mt === 'normal' && state.magicUsed[p].normal && state.magicUsed[p].extraSpell && named(inst.card, 'คาถา')) state.magicUsed[p].extraSpell = false;
    else if (state.magicUsed[p][mt] && state.magicUsed[p].extraMagic) state.magicUsed[p].extraMagic = false;
    state.magicUsed[p][mt] = true;
    if (mt === 'modification') state.magicUsed[p].modCount = (state.magicUsed[p].modCount || 0) + 1;
    log(state, `${pl.name} ใช้ ${mt === 'land' ? 'Land' : mt === 'react' ? 'React' : mt === 'modification' ? 'Modification' : 'Normal'} Magic "${inst.card.name}"`);
    let target = null;
    if (mt === 'modification' && !fx.customEquip) {
      target = findAvatar(state, await choose(state, p, `สวมใส่ "${inst.card.name}" ให้ Avatar ใบไหน`, equipTargets(state, p, inst.card).map(a => avOpt(state, a, fx && fx.equipScore ? fx.equipScore(api(state), p, a) : basePower(state, a)))));
    }
    // opponent may counter (ชายจากอนาคต ...)
    await show(state, 'magic', { p, card: inst.card });
    const r = await reactWindow(state, opp(p), 'magic', { card: inst, caster: p });
    if (r && r.cancel) { pl.hell.push(inst); log(state, `ผลของ "${inst.card.name}" ถูกยกเลิก`); return { cancelled: true }; }
    for (const [q, x] of state.players.entries()) for (const a of x.avatars.slice()) { const f = FX(a.card.id); if (f && f.onAnyMagic && !a.lostAbilities) await f.onAnyMagic(api(state), q, a, inst); }
    for (const [q, x] of state.players.entries()) for (const c of x.constructs.slice()) { const f = FX(c.card.id); if (f && f.onAnyMagic && x.constructs.includes(c)) await f.onAnyMagic(api(state), q, c, inst, p); }
    for (const [q, x] of state.players.entries()) for (const m of x.magicZone.slice()) { const f = FX(m.card.id); const h = m.attachedTo && findAvatar(state, m.attachedTo); if (f && f.onAnyMagicEquip && h) await f.onAnyMagicEquip(api(state), q, m, h, inst); }
    if (mt === 'land') {
      if (state.land) { state.players[state.land.owner].hell.push(state.land); log(state, `Land Magic "${state.land.card.name}" ถูกส่งลงนรก`); }
      state.land = inst; inst.owner = p; inst.usedTurn = 0; inst.usedBy = []; inst.placedTurn = state.turn;
      if (fx.magic !== true) await fx.magic(api(state), p, inst, ctx);
    } else if (mt === 'modification' && fx.customEquip) {
      state.srcMagic = (state.srcMagic || 0) + 1;
      try { await fx.magic(api(state), p, inst); } finally { state.srcMagic--; }
      if (!pl.magicZone.includes(inst)) pl.hell.push(inst);
    } else if (mt === 'modification') {
      if (!target || !onField(state, target)) { pl.hell.push(inst); return {}; }
      await attach(state, p, inst, target);
      if (typeof fx.magic === 'function') await fx.magic(api(state), p, inst, target);
    } else {
      state.srcMagic = (state.srcMagic || 0) + 1;
      let res; try { res = await fx.magic(api(state), p, inst, ctx); } finally { state.srcMagic--; }
      if (!(res && res.stay)) pl.hell.push(inst);
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

  function countHellToDeck(state) {
    state.players.forEach(pl => pl.deck.forEach(c => {
      if (c.leftHellTurn !== state.turn || c.countedBackTurn === state.turn) return;
      c.countedBackTurn = state.turn;
      if (pl.hellToDeckTurn !== state.turn) { pl.hellToDeckTurn = state.turn; pl.hellToDeckN = 0; }
      pl.hellToDeckN++;
    }));
  }

  // React window: let player `rp` respond to an event with a React Magic in hand.
  async function reactWindow(state, rp, trigger, ctx) {
    if (state.winner != null) return null;
    if (state.noReactFor === rp || state.noReactAll) return null;
    const pl = state.players[rp];
    if (pl.noReactTurn === state.turn) return null;
    const reactBlocked = state.players[opp(rp)].avatars.some(a => { const f = FX(a.card.id); return f && f.blockOppMagic && !a.lostAbilities && f.blockOppMagic(api(state), a).includes('react'); });
    const opts = [];
    pl.hand.forEach((h, i) => {
      const fx = FX(h.card.id);
      // React Magic: 1 per turn, except cards with ignoreReactLimit (อย่าให้มีครั้งที่ 2), which have their own once-per-turn-by-name limit
      const extraSkill = magicType(h.card) === 'react' && named(h.card, 'Skill') && !state.magicUsed[rp].skillExtra && !state.magicUsed[rp]['skill:' + h.card.name] && pl.avatars.some(a => (FX(a.card.id) || {}).extraSkillReact && !a.lostAbilities && FX(a.card.id).extraSkillReact(api(state), a));
      const free = (fx && fx.ignoreReactLimit ? !state.magicUsed[rp]['name:' + h.card.name] : !state.magicUsed[rp].react) || extraSkill;
      if (free && !reactBlocked && h.card.type === 'magic' && (magicType(h.card) === 'react' || (fx && fx.react && fx.react.anyType)) && fx && fx.react && fx.react.on === trigger &&
        (!fx.react.when || fx.react.when(api(state), rp, ctx))) {
        opts.push({ label: `ใช้ "${h.card.name}"`, card: h.card, value: h.uid, score: fx.react.botScore ? fx.react.botScore(api(state), rp, ctx) : 1 });
      }
    });
    pl.avatars.forEach(a => {
      const f = FX(a.card.id);
      if (f && f.fieldCounter && !a.lostAbilities && a.counterTurn !== state.turn && f.fieldCounter.on.includes(trigger) && (!f.fieldCounter.when || f.fieldCounter.when(api(state), rp, a, ctx)))
        opts.push({ label: f.fieldCounter.label || `ใช้ความสามารถของ ${a.card.name}`, card: a.card, value: 'fc:' + a.uid, score: f.fieldCounter.botScore ? f.fieldCounter.botScore(api(state), rp, a, ctx) : 1 });
    });
    pl.hand.forEach(h => {
      const f = FX(h.card.id);
      if (f && f.handCounter && f.handCounter.on.includes(trigger) && (!f.handCounter.when || f.handCounter.when(api(state), rp, h, ctx)))
        opts.push({ label: f.handCounter.label || `ใช้ความสามารถของ ${h.card.name} จากบนมือ`, card: h.card, value: 'hc:' + h.uid, score: f.handCounter.botScore ? f.handCounter.botScore(api(state), rp, h, ctx) : 1 });
    });
    if (!opts.length) return null;
    const what = trigger === 'summon' ? `${ctx.avatar.card.name} ถูกอัญเชิญ` : trigger === 'magic' ? `อีกฝ่ายใช้ "${ctx.card.card.name}"` : trigger === 'attack' ? `${ctx.attacker.card.name} กำลังโจมตี` : trigger === 'destroy' ? `${ctx.avatar.card.name} กำลังจะถูกทำลาย` : trigger === 'battleDestroyed' ? `${ctx.avatar.card.name} ถูกทำลายจากการต่อสู้` : trigger === 'destroyedByOpp' ? `${ctx.avatar.card.name} ถูกทำลายโดยอีกฝ่าย` : trigger === 'activate' ? `อีกฝ่ายสั่งใช้ความสามารถของ ${ctx.avatar.card.name}` : trigger === 'battleStart' ? 'อีกฝ่ายเริ่ม Battle Phase' : trigger === 'lastWill' ? `คำสั่งเสีย ของ ${ctx.avatar.card.name}` : trigger === 'constructDestroy' ? `${ctx.construct.card.name} กำลังจะถูกทำลาย` : trigger;
    const pick = await state.ask(rp, { title: `ตอบโต้? (${what})`, options: opts, optional: true, react: true });
    if (pick == null) return null;
    if (typeof pick === 'string' && pick.startsWith('hc:')) {
      const h = pl.hand.find(x => x.uid === +pick.slice(3)); if (!h) return null;
      log(state, `⚡ ${pl.name} สั่งใช้ "${h.card.name}" จากบนมือ`);
      return (await FX(h.card.id).handCounter.run(api(state), rp, h, ctx)) || null;
    }
    if (typeof pick === 'string' && pick.startsWith('fc:')) {
      const a = pl.avatars.find(x => x.uid === +pick.slice(3)); if (!a) return null;
      a.counterTurn = state.turn; log(state, `⚡ ${pl.name} ใช้ความสามารถของ ${a.card.name}`);
      return (await FX(a.card.id).fieldCounter.run(api(state), rp, a, ctx)) || null;
    }
    const idx = pl.hand.findIndex(h => h.uid === pick);
    if (idx < 0) return null;
    const inst = pl.hand.splice(idx, 1)[0];
    const fx = FX(inst.card.id);
    if (fx.ignoreReactLimit) state.magicUsed[rp]['name:' + inst.card.name] = true;
    else if (state.magicUsed[rp].react && named(inst.card, 'Skill')) state.magicUsed[rp].skillExtra = true;
    else state.magicUsed[rp].react = true;
    if (named(inst.card, 'Skill')) state.magicUsed[rp]['skill:' + inst.card.name] = true;
    log(state, `⚡ ${pl.name} ตอบโต้ด้วย React Magic "${inst.card.name}"`);
    await show(state, 'magic', { p: rp, card: inst.card, react: true });
    const counter = await reactWindow(state, opp(rp), 'magic', { card: inst, caster: rp });
    pl.hell.push(inst);
    if (counter && counter.cancel) { log(state, `ผลของ "${inst.card.name}" ถูกยกเลิก`); return null; }
    state.srcMagic = (state.srcMagic || 0) + 1;
    try { return (await fx.react.run(api(state), rp, ctx, inst)) || {}; } finally { state.srcMagic--; }
  }

  // ----- activated abilities (สั่งใช้) -----
  function activatables(state, p) {
    const out = [];
    if (state.winner != null || state.active !== p || state.resolving || (state.phase !== 'main' && state.phase !== 'battle')) return out;
    const pl = state.players[p];
    const A = api(state);
    const okNow = (fx, src) => state.phase === 'main' || !!(fx && fx.battleOk && (fx.battleOk === true || fx.battleOk(A, p, src)));
    if (state.phase === 'main' && pl.linkTurn !== state.turn) pl.avatars.forEach(x => pl.avatars.forEach(y => { if (canLinkPair(x, y)) out.push({ kind: 'link', uid: `link:${x.uid}:${y.uid}`, src: x.uid, label: `จับคู่ [Link] กับ ${y.card.name}` }); }));
    pl.avatars.forEach(a => {
      const fx = FX(a.card.id);
      if (fx && fx.activate && okNow(fx, a) && !a.lostAbilities && !isLocked(state, p, a.card) && !isFrozen(state, p, a.card) && !(fx.oncePerTurn !== false && a.usedTurn === state.turn) && (!fx.canActivate || fx.canActivate(A, p, a)))
        out.push({ kind: 'avatar', uid: a.uid, label: fx.activateLabel || 'สั่งใช้' });
    });
    // Land Magic is shared: either player may use its ability in their own Main Phase (once per turn each)
    if (state.land) {
      const fx = FX(state.land.card.id);
      if (fx && fx.activate && okNow(fx, state.land) && (state.land.usedBy || [])[p] !== state.turn && (!fx.canActivate || fx.canActivate(A, p, state.land)))
        out.push({ kind: 'land', uid: state.land.uid, label: fx.activateLabel || 'สั่งใช้' });
      // a second, separately limited ability on the same Land (โคกอีสานนูน)
      if (fx && fx.activate2 && okNow(fx, state.land) && (state.land.usedBy2 || [])[p] !== state.turn && (!fx.canActivate2 || fx.canActivate2(A, p, state.land)))
        out.push({ kind: 'land', uid: 'land2:' + state.land.uid, src: state.land.uid, label: fx.activateLabel2 || 'สั่งใช้ (ความสามารถที่ 2)' });
    }
    pl.constructs.forEach(c => {
      const fx = FX(c.card.id);
      if (fx && fx.activate && okNow(fx, c) && c.usedTurn !== state.turn && (!fx.canActivate || fx.canActivate(A, p, c)))
        out.push({ kind: 'construct', uid: c.uid, label: fx.activateLabel || 'สั่งใช้' });
    });
    pl.magicZone.forEach(m => {
      const fx = FX(m.grantFx || m.card.id);
      if (m.parked && (m.grantFx || parkedActive(state, p, m)) && fx && fx.activate && okNow(fx, m) && m.usedTurn !== state.turn && (!fx.canActivate || fx.canActivate(A, p, m)))
        out.push({ kind: 'parked', uid: m.uid, label: fx.activateLabel || 'สั่งใช้' });
    });
    pl.hell.forEach(h => {
      const fx = FX(h.card.id);
      if (fx && fx.hellActivate && okNow(fx, h) && h.hellUsed !== state.turn && (!fx.canHellActivate || fx.canHellActivate(A, p, h)))
        out.push({ kind: 'hell', uid: h.uid, label: fx.hellActivateLabel || 'สั่งใช้จากนรก' });
    });
    pl.dark.forEach(h => {
      const fx = FX(h.card.id);
      if (fx && fx.darkActivate && okNow(fx, h) && h.darkUsed !== state.turn && (!fx.canDarkActivate || fx.canDarkActivate(A, p, h)))
        out.push({ kind: 'dark', uid: h.uid, label: fx.darkActivateLabel || 'สั่งใช้จากมิติมืด' });
    });
    pl.magicZone.forEach(m => {
      const fx = FX(m.card.id); const host = m.attachedTo && findAvatar(state, m.attachedTo);
      if (host && host.owner === p && fx && fx.equipActivate && okNow(fx, m) && m.usedTurn !== state.turn && (!fx.canEquipActivate || fx.canEquipActivate(A, p, m, host)))
        out.push({ kind: 'equip', uid: m.uid, src: host.uid, label: fx.equipActivateLabel || 'สั่งใช้' });
    });
    pl.hand.forEach(h => {
      const fx = FX(h.card.id);
      if (fx && fx.handActivate && okNow(fx, h) && !isLocked(state, p, h.card) && (!fx.canHandActivate || fx.canHandActivate(A, p, h)))
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
      if (act.kind === 'link') {
        const [, xu, yu] = uid.split(':'); const x = findAvatar(state, +xu), y = findAvatar(state, +yu);
        x.linked = y.uid; y.linked = x.uid; pl.linkTurn = state.turn;
        log(state, `🔗 ${x.card.name} และ ${y.card.name} เข้าสู่สถานะคู่หู [Link]`);
        await show(state, 'activate', { p, uid: x.uid, card: x.card });
        for (const [s1, s2] of [[x, y], [y, x]]) { const f = FX(s1.card.id); if (f && f.onLink && !s1.lostAbilities && onField(state, s1)) await f.onLink(api(state), p, s1, s2); }
        for (const h of pl.hell.slice()) { const f = FX(h.card.id); if (f && f.onLinkFromHell && pl.hell.includes(h)) await f.onLinkFromHell(api(state), p, h, x, y); }
        return ok();
      }
      if (act.kind === 'land' && String(uid).startsWith('land2:')) {
        const src = state.land; src.usedBy2 = src.usedBy2 || []; src.usedBy2[p] = state.turn;
        log(state, `${pl.name} สั่งใช้ความสามารถที่ 2 ของ "${src.card.name}"`);
        await show(state, 'activate', { p, uid: src.uid, card: src.card });
        state.srcMagic = (state.srcMagic || 0) + 1;
        try { await FX(src.card.id).activate2(api(state), p, src); } finally { state.srcMagic--; }
        return ok();
      }
      if (act.kind === 'hell') {
        const h = pl.hell.find(x => x.uid === uid); h.hellUsed = state.turn;
        log(state, `${pl.name} สั่งใช้ "${h.card.name}" จากนรก`);
        await FX(h.card.id).hellActivate(api(state), p, h);
      } else if (act.kind === 'dark') {
        const h = pl.dark.find(x => x.uid === uid); h.darkUsed = state.turn;
        log(state, `${pl.name} สั่งใช้ "${h.card.name}" จากมิติมืด`);
        await FX(h.card.id).darkActivate(api(state), p, h);
      } else if (act.kind === 'equip') {
        const m = pl.magicZone.find(x => x.uid === uid); m.usedTurn = state.turn;
        log(state, `${pl.name} สั่งใช้ความสามารถที่ได้จาก "${m.card.name}"`);
        await FX(m.card.id).equipActivate(api(state), p, m, findAvatar(state, m.attachedTo));
      } else if (act.kind === 'hand') {
        const h = pl.hand.find(x => x.uid === uid);
        log(state, `${pl.name} สั่งใช้ "${h.card.name}" จากบนมือ`);
        await FX(h.card.id).handActivate(api(state), p, h);
      } else {
        const src = act.kind === 'land' ? state.land : act.kind === 'construct' ? pl.constructs.find(x => x.uid === uid) : act.kind === 'parked' ? pl.magicZone.find(x => x.uid === uid) : findAvatar(state, uid);
        if (act.kind === 'land') { src.usedBy = src.usedBy || []; src.usedBy[p] = state.turn; } else src.usedTurn = state.turn;
        log(state, `${pl.name} สั่งใช้ความสามารถของ "${src.card.name}"`);
        await show(state, 'activate', { p, uid: src.uid, card: src.card });
        if (act.kind === 'avatar') {
          const rr = await reactWindow(state, opp(p), 'activate', { avatar: src });
          if (rr && rr.negate) { src.lostAbilities = true; log(state, `${src.card.name} สูญเสียความสามารถทั้งหมดจนจบเทิร์น`); return ok(); }
        }
        if (act.kind === 'land') state.srcMagic = (state.srcMagic || 0) + 1;
        try { await FX((act.kind === 'parked' && src.grantFx) || src.card.id).activate(api(state), p, src); } finally { if (act.kind === 'land') state.srcMagic--; }
      }
    } finally { state.resolving--; }
    return ok();
  }

  // ---------- power / symbol ----------
  // an Avatar kept in the Magic Zone may use its abilities there while something allows it (เสาซินแสมงคล)
  function parkedActive(state, p, m) {
    return state.players[p].avatars.some(a => { const f = FX(a.card.id); return f && f.parkedAbilities && !a.lostAbilities && f.parkedAbilities(api(state), a, m); });
  }
  function suppressed(state, a, kind) {
    const o = state.players[opp(a.owner)]; if (!o) return false;
    return o.avatars.some(src => { const f = FX(src.card.id); return f && f.suppressOpp && !src.lostAbilities && f.suppressOpp(api(state), src).includes(kind); });
  }
  function symbolOf(state, a) {
    let s = a.card.symbol;
    if (attachedTo(state, a).some(m => (FX(m.card.id) || {}).lockSymbol)) return s;
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
    const guard = attachedTo(state, a).some(m => (FX(m.card.id) || {}).noPowerDown);
    const add = v => { v = v || 0; if (!(guard && v < 0)) pw += v; };
    const fx = FX(a.card.id);
    if (fx && fx.setPower && !a.lostAbilities) pw = fx.setPower(A, a.owner, a);
    if (a.baseZeroTurn === state.turn) pw = 0;
    if (fx && fx.continuousSelf && !a.lostAbilities) add(fx.continuousSelf(A, a.owner, a));
    state.players.forEach((pl, p) => {
      pl.avatars.forEach(src => {
        const sfx = FX(src.card.id);
        if (src !== a && sfx && sfx.aura && !src.lostAbilities) add(sfx.aura(A, p, src, a));
      });
    });
    state.players.forEach((pl, p) => pl.constructs.forEach(src => { const sfx = FX(src.card.id); if (sfx && sfx.aura) add(sfx.aura(A, p, src, a)); }));
    attachedTo(state, a).forEach(m => {
      const mfx = FX(m.card.id);
      if (mfx && mfx.equipPower) add(typeof mfx.equipPower === 'function' ? mfx.equipPower(A, a, m) : mfx.equipPower);
    });
    if (state.land) {
      const lfx = FX(state.land.card.id);
      if (lfx && lfx.aura) add(lfx.aura(A, state.land.owner, state.land, a));
    }
    state.players.forEach(pl => pl.magicZone.forEach(m => { const f = FX(m.card.id); if (f && f.equipAura && m.attachedTo && m.attachedTo !== a.uid) { const h = findAvatar(state, m.attachedTo); if (h) add(f.equipAura(A, h, a)); } }));
    state.players.forEach((pl, q) => pl.magicZone.forEach(m => { const f = FX(m.card.id); if (m.parked && f && f.mzAura) add(f.mzAura(A, q, m, a)); }));
    state.players.forEach(pl => pl.mods.forEach(m => { if (m.uid === a.uid) add(m.amount); }));
    if (state.land && (FX(state.land.card.id) || {}).halveAll) pw = Math.floor(Math.max(0, pw) / 2);
    return Math.max(0, pw);
  }
  // Cost of an Avatar on the field (ทหารอาณาจักรของแพง, ช่างตัดเสื้อ, ขวานไม้เน่าๆเหม็นๆ)
  function costOf(state, a) {
    if (a.costSetTurn === state.turn) return a.costSet;
    let c = (a.card.cost || 0) + (a.costMod || 0);
    const A = api(state);
    attachedTo(state, a).forEach(m => { const f = FX(m.card.id); if (f && f.equipCost) c += f.equipCost; });
    state.players.forEach((pl, q) => pl.avatars.forEach(src => { const f = FX(src.card.id); if (src !== a && f && f.costAura && !src.lostAbilities) c += f.costAura(A, q, src, a) || 0; }));
    state.players.forEach((pl, q) => pl.constructs.forEach(src => { const f = FX(src.card.id); if (f && f.costAura) c += f.costAura(A, q, src, a) || 0; }));
    return Math.max(0, c);
  }
  function constructPower(state, c) { return Math.max(0, (c.card.power || 0) + (c.powerMod || 0)); }
  async function destroyConstruct(state, cs, why, byP) {
    const pl = state.players.find(x => x.constructs.includes(cs)); if (!pl) return false;
    const owner = state.players.indexOf(pl);
    if (why !== 'ถูกโจมตี' && pl.avatars.some(a => (FX(a.card.id) || {}).protectConstructs && !a.lostAbilities)) { log(state, `${cs.card.name} ไม่ถูกทำลายด้วยความสามารถการ์ด`); return false; }
    { const f = FX(cs.card.id); if (f && f.fxProof && why !== 'ถูกโจมตี' && f.fxProof(api(state), cs, owner)) { log(state, `${cs.card.name} ไม่ถูกทำลายด้วยความสามารถการ์ด`); return false; } }
    const rr = await reactWindow(state, owner, 'constructDestroy', { construct: cs, byP });
    if (rr && rr.prevent) { log(state, `${cs.card.name} ไม่ถูกทำลาย`); return false; }
    if (!pl.constructs.includes(cs)) return false;
    pl.constructs.splice(pl.constructs.indexOf(cs), 1); cs.powerMod = 0; pl.hell.push(cs);
    log(state, `${cs.card.name} ถูกทำลาย (${why || 'ความสามารถการ์ด'})`);
    { const f = FX(cs.card.id); if (f && f.onDestroyed) await f.onDestroyed(api(state), owner, cs); }
    return true;
  }
  function addMod(state, a, amount, until) { state.players[a.owner].mods.push({ uid: a.uid, amount, until: until || 'endTurn' }); }

  function findAvatar(state, uid) {
    for (const pl of state.players) { const a = pl.avatars.find(x => x.uid === uid); if (a) return a; }
    return null;
  }
  function onField(state, a) { return state.players.some(pl => pl.avatars.includes(a)); }
  function hasAbility(state, a, kw) {
    if (['โล่มนุษย์', 'ลูกฮึด'].includes(kw) && suppressed(state, a, 'kw:' + kw)) return false;
    if (attachedTo(state, a).some(m => { const f = FX(m.card.id); return f && (typeof f.equipKw === 'function' ? f.equipKw(api(state), a, m) : (f.equipKw || [])).includes(kw); })) return true;
    if (state.land) { const lf = FX(state.land.card.id); if (lf && lf.grantKw && lf.grantKw(api(state), a).includes(kw)) return true; }
    if (state.players[a.owner] && state.players[a.owner].constructs.some(src => { const f = FX(src.card.id); return f && f.kwAura && f.kwAura(api(state), src, a).includes(kw); })) return true;
    if (state.players[a.owner] && state.players[a.owner].avatars.some(src => { const f = FX(src.card.id); return src !== a && f && f.kwAura && !src.lostAbilities && f.kwAura(api(state), src, a).includes(kw); })) return true;
    { const f = FX(a.card.id); if (f && f.condKw) { const on = !a.lostAbilities && f.condKw(api(state), a).includes(kw); if (on) return true; if ((f.condKwOnly || []).includes(kw)) return false; } }
    if ((a.kwUntil || []).some(k => k.kw === kw && k.until >= state.turn)) return true;
    return !a.lostAbilities && (hasKw(a.card, kw) || (a.extraKw || []).includes(kw));
  }

  // ---------- battle ----------
  function attackTargets(state, p, uid) {
    const a = findAvatar(state, uid);
    if (!a || a.owner !== p || a.rested) return [];
    const sf = FX(a.card.id);
    if (sf && sf.cannotAttack && !a.lostAbilities && sf.cannotAttack(api(state), a)) return [];
    const ao = state.players[p].attackOnly;
    if (ao && ao.turn === state.turn && symbolOf(state, a) !== ao.symbol) return [];
    if (state.land && (FX(state.land.card.id) || {}).oneAttackPerTurn && (state.attackCount || [0, 0])[p] >= 1) return [];
    if (isFrozen(state, p, a.card)) return [];
    if (a.noStateTurn === state.turn) return [];
    if (attachedTo(state, a).some(m => (FX(m.card.id) || {}).hostCannotAttack)) return [];
    const o = state.players[opp(p)];
    const A = api(state);
    const t = o.avatars.filter(x => { const f = FX(x.card.id); return !(f && f.untargetable && !x.lostAbilities && f.untargetable(A, x, a)) && !o.avatars.some(src => { const sf2 = FX(src.card.id); return sf2 && sf2.shieldAllies && !src.lostAbilities && sf2.shieldAllies(A, src, x); }); }).map(x => ({ kind: 'avatar', uid: x.uid }));
    o.constructs.forEach(x => { const f = FX(x.card.id); if (!(f && f.untargetableConstruct && f.untargetableConstruct(A, x, opp(p)))) t.push({ kind: 'construct', uid: x.uid }); });
    if ((o.avatars.length === 0 || hasAbility(state, a, 'เตะไข่')) && a.noLifeAttack !== state.turn && !o.constructs.some(c => (FX(c.card.id) || {}).noLifeAttack)) t.push({ kind: 'life' });
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
    const at = findAvatar(state, uid);
    return state.players[p].avatars.filter(s => { const f = FX(s.card.id); return s.uid !== uid && !s.rested && (hasAbility(state, s, 'สามัคคี') || hasAbility(state, s, 'แทงหลัง')) && !(at && f && f.supportOnly && !s.lostAbilities && !f.supportOnly(at)); });
  }

  async function attack(state, p, uid, target, supporterUids) {
    const c = canAttack(state, p, uid, target); if (!c.ok) return c;
    state.resolving++;
    try {
      await doAttack(state, p, uid, target, supporterUids || []);
      { const a = findAvatar(state, uid); const f = a && FX(a.card.id); if (f && f.afterAttack && !a.lostAbilities && state.winner == null) await f.afterAttack(api(state), p, a); }
      for (const x of state.players.flatMap(q => q.avatars.slice())) if (x.destroyAfterBattle) { x.destroyAfterBattle = false; await destroyAvatar(state, x, 'หลังจบการต่อสู้'); }
      await sweepZero(state);
    } finally { state.resolving--; state.noReactFor = null; state.battlePair = null; state.noShield = false; }
    if (state.forceEnd) { state.forceEnd = false; if (state.winner == null && state.active === p) { log(state, 'เทิร์นถูกบังคับให้จบทันที'); await endTurn(state, p); } }
    return ok();
  }

  async function doAttack(state, p, uid, target, supporterUids) {
    const A = api(state);
    const pl = state.players[p], o = state.players[opp(p)];
    const a = findAvatar(state, uid);
    const af0 = FX(a.card.id);
    if (af0 && af0.oppChoosesTarget && !a.lostAbilities) {
      const ts = attackTargets(state, p, uid);
      const severe = o.life.every(l => l.faceUp);
      const v = await state.ask(opp(p), { title: `${a.card.name}: คุณเป็นผู้เลือกเป้าหมายการโจมตี`, options: ts.map(t => t.kind === 'life' ? { label: 'LIFE Card Zone', value: 'life', score: severe ? -99 : 0.5 } : t.kind === 'construct' ? { label: o.constructs.find(x => x.uid === t.uid).card.name, value: t.uid, score: 1 } : avOpt(state, findAvatar(state, t.uid), basePower(state, findAvatar(state, t.uid)) - basePower(state, a))) });
      const t = ts.find(x => (x.kind === 'life' ? 'life' : x.uid) === v);
      if (t) target = t;
    }
    if (!state.fightNoRest) a.rested = true;
    state.attackCount = state.attackCount || [0, 0]; state.attackCount[p]++;
    // Step 1: สามัคคี / แทงหลัง
    let bonus = 0; const backstabbers = [], supported = [];
    for (const sid of supporterUids) {
      const s = findAvatar(state, sid);
      if (!s || s.owner !== p || s.rested || s === a) continue;
      { const f = FX(s.card.id); if (f && f.supportOnly && !s.lostAbilities && !f.supportOnly(a)) continue; }
      if (hasAbility(state, s, 'สามัคคี')) { const v = basePower(state, s); s.rested = true; bonus += v; log(state, `${s.card.name} สามัคคี: POWER +${v}`); supported.push(s); }
      else if (hasAbility(state, s, 'แทงหลัง')) { s.rested = true; bonus += 1; backstabbers.push(s); log(state, `${s.card.name} แทงหลัง: POWER +1`); const f = FX(s.card.id); if (f && f.onBackstab && !s.lostAbilities) await f.onBackstab(A, p, s, a); }
    }
    let tgt = target;
    const tName = t => t.kind === 'life' ? 'LIFE Card Zone' : t.kind === 'construct' ? (o.constructs.find(x => x.uid === t.uid) || {}).card.name : (findAvatar(state, t.uid) || { card: { name: 'เป้าหมายที่หายไป' } }).card.name;
    log(state, `⚔️ ${a.card.name} โจมตี ${tName(tgt)}`);
    // Step 2: snapshot + "when attacks"
    if (bonus) addMod(state, a, bonus, 'endTurn');
    for (const s of supported) {
      { const f = FX(s.card.id); if (f && f.onSupport && !s.lostAbilities) await f.onSupport(A, p, s, a); }
      { const f = FX(a.card.id); if (f && f.onSupported && !a.lostAbilities && onField(state, a)) await f.onSupported(A, p, a, s); }
      for (const src of pl.avatars.slice()) { const f = FX(src.card.id); if (f && f.onAllyKw && !src.lostAbilities) await f.onAllyKw(A, p, src, s, 'สามัคคี'); }
    }
    const afx = FX(a.card.id);
    if (afx && afx.onAttack && !a.lostAbilities) await afx.onAttack(A, p, a, tgt);
    if (a.riceTurn === state.turn && onField(state, a)) { drawCard(state, opp(p)); log(state, `${o.name} จั่ว 1 ใบ (ให้ข้าวฉันถ้าคุณเป็นคนดี)`); }
    for (const src of pl.avatars.slice()) { const f = FX(src.card.id); if (src !== a && f && f.onAllyAttack && !src.lostAbilities && onField(state, a)) await f.onAllyAttack(A, p, src, a, tgt); }
    if (pl.kboTurn === state.turn && (named(a.card, 'เพมมุ') || named(a.card, 'สไปรท์'))) { state.noReactFor = opp(p); log(state, 'K-BO: อีกฝ่ายใช้ React ไม่ได้ในการต่อสู้นี้'); }
    if (state.land) { const lf = FX(state.land.card.id); if (lf && lf.onAnyAttack) await lf.onAnyAttack(A, p, a); }
    if (state.winner != null) return;
    for (const m of attachedTo(state, a)) { const f = FX(m.card.id); if (f && f.onEquippedAttack) await f.onEquippedAttack(A, p, m, a, tgt); }
    if (!onField(state, a)) return;
    // opponent react (ไปเลยมอนตี้, งานจับมือ ...)
    if (o.drawOnOppAttack === state.turn) { drawCard(state, opp(p)); log(state, `${o.name} จั่ว 1 ใบ (กระแสสิริมงคล)`); }
    const r = await reactWindow(state, opp(p), 'attack', { attacker: a, target: tgt });
    if (r && r.cancelAttack) { log(state, 'การโจมตีถูกยกเลิก'); if (r.endTurn) state.forceEnd = true; return; }
    if (r && r.retarget && findAvatar(state, r.retarget)) { tgt = { kind: 'avatar', uid: r.retarget }; log(state, `เป้าหมายการโจมตีเปลี่ยนเป็น ${findAvatar(state, r.retarget).card.name}`); }
    if (!onField(state, a)) return;
    // Step 3: Human Shield (โล่มนุษย์)
    if (attachedTo(state, a).some(m => (FX(m.card.id) || {}).noShieldOnAttack)) state.noShield = true;
    // ambush: reveal from hand and summon by paying Cost, taking the attack (นักรบ ฮอล)
    for (const h of o.hand.slice()) {
      const f = FX(h.card.id);
      if (!f || !f.ambush || !hasRoom(state, opp(p), h.card) || summonBlock(state, opp(p), h.card)) continue;
      const hi = o.hand.indexOf(h);
      const pay = findPayment(o, hi, null, payCtx(state, opp(p), h.card));
      if (!pay) continue;
      const yes = await state.ask(opp(p), { title: `อัญเชิญ "${h.card.name}" จากมือ (จ่าย Cost) เพื่อรับการโจมตี?`, optional: true, options: [{ label: 'อัญเชิญ', value: 1, score: 1 }] });
      if (yes == null) continue;
      const [inst, ...paid] = takeFromHand(o, [hi, ...pay]);
      o.hell.push(...paid);
      log(state, `${o.name} อัญเชิญ ${inst.card.name} ระหว่างการโจมตี`);
      await putAvatar(state, opp(p), inst, { jutti: false, paid });
      if (onField(state, inst)) { tgt = { kind: 'avatar', uid: inst.uid }; log(state, `เป้าหมายการโจมตีเปลี่ยนเป็น ${inst.card.name}`); }
      break;
    }
    if (!onField(state, a)) return;
    for (const x of o.avatars.slice()) {
      const f = FX(x.card.id);
      if (!f || !f.interceptor || x.lostAbilities || x.interceptTurn === state.turn || (tgt.kind === 'avatar' && tgt.uid === x.uid)) continue;
      const yes = await state.ask(opp(p), { title: `${x.card.name}: ย้ายเป้าหมายการโจมตีมาที่การ์ดใบนี้?`, optional: true, options: [avOpt(state, x, basePower(state, x) >= basePower(state, a) ? 2 : -1)] });
      if (yes != null) { x.interceptTurn = state.turn; tgt = { kind: 'avatar', uid: x.uid }; log(state, `เป้าหมายการโจมตีเปลี่ยนเป็น ${x.card.name}`); break; }
    }
    if (a.noShieldTurn === state.turn) state.noShield = true;
    const shields = state.noShield ? [] : o.avatars.filter(x => !x.rested && hasAbility(state, x, 'โล่มนุษย์') && !(tgt.kind === 'avatar' && tgt.uid === x.uid));
    if (shields.length) {
      const pick = await state.ask(opp(p), {
        title: `ใช้โล่มนุษย์รับการโจมตีของ ${a.card.name} (POWER ${basePower(state, a)}) แทน ${tName(tgt)}?`, optional: true,
        options: shields.map(x => avOpt(state, x, (basePower(state, x) > basePower(state, a) ? 5 : basePower(state, x) === basePower(state, a) ? 1 : (tgt.kind === 'life' ? 2 : -5)))),
      });
      if (pick != null) {
        const s = findAvatar(state, pick); s.rested = true; tgt = { kind: 'avatar', uid: s.uid };
        log(state, `🛡️ ${s.card.name} ใช้โล่มนุษย์ รับการโจมตีแทน`);
        for (const src of o.avatars.slice()) { const f = FX(src.card.id); if (f && f.onAllyKw && !src.lostAbilities) await f.onAllyKw(A, opp(p), src, s, 'โล่มนุษย์'); }
      }
    }
    // target confirmed triggers
    if (tgt.kind === 'avatar') {
      const d = findAvatar(state, tgt.uid);
      const dfx = d && FX(d.card.id);
      const tr = dfx && dfx.onTargeted && !d.lostAbilities ? await dfx.onTargeted(A, d.owner, d, a) : null;
      if (tr && tr.cancelAttack) { log(state, 'การโจมตีถูกยกเลิก'); return; }
      for (const x of o.avatars.slice()) { const f = FX(x.card.id); if (d && onField(state, d) && f && f.onAllyTargeted && !x.lostAbilities) { const rr = await f.onAllyTargeted(A, opp(p), x, d, a); if (rr && rr.cancelAttack) { log(state, 'การโจมตีถูกยกเลิก'); return; } } }
    }
    if (!onField(state, a)) return;
    if (tgt.kind === 'avatar') {
      const d = findAvatar(state, tgt.uid);
      if (d) {
        state.battlePair = [a, d];
        for (const [x, y] of [[a, d], [d, a]]) {
          const f = FX(x.card.id); if (f && f.onBattle && !x.lostAbilities && onField(state, x) && onField(state, y)) await f.onBattle(A, x.owner, x, y);
          for (const m of attachedTo(state, x)) { const mf = FX(m.card.id); if (mf && mf.onHostBattle && onField(state, x) && onField(state, y)) await mf.onHostBattle(A, m.owner, m, x, y); }
        }
        for (const [x, y] of [[a, d], [d, a]]) for (const h of state.players[x.owner].hand.slice()) { const f = FX(h.card.id); if (f && f.onAllyBattle && onField(state, x) && onField(state, y) && state.players[x.owner].hand.includes(h)) await f.onAllyBattle(A, x.owner, h, x, y); }
        if (!onField(state, d)) { log(state, 'เป้าหมายหายไป — การโจมตีสิ้นสุด'); return; }
      }
    }
    if (!onField(state, a)) return;
    const power = basePower(state, a);
    await show(state, 'attack', { p, uid: a.uid, target: tgt, power, targetPower: tgt.kind === 'avatar' && findAvatar(state, tgt.uid) ? basePower(state, findAvatar(state, tgt.uid)) : null });

    if (tgt.kind === 'life') {
      log(state, `${a.card.name} (POWER ${power}) โจมตีเข้า LIFE ของ ${o.name}`);
      const hits = afx && afx.lifeHits && !a.lostAbilities ? afx.lifeHits(A, a) : 1;
      const before = state.pendingLife[opp(p)].length;
      await damageLife(state, opp(p), power > 0 ? hits : 0);
      if (afx && afx.lifeNoTrigger && !a.lostAbilities && afx.lifeNoTrigger(A, a) && state.pendingLife[opp(p)].length > before) { state.pendingLife[opp(p)].splice(before); log(state, `ความสามารถของ LIFE ที่ถูกหงายโดย ${a.card.name} ไม่ทำงาน`); }
      for (const src of pl.avatars.slice()) { const f = FX(src.card.id); if (state.pendingLife[opp(p)].length > before && f && f.onAllyLifeHit && !src.lostAbilities && await f.onAllyLifeHit(A, p, src, a)) { state.pendingLife[opp(p)].splice(before); log(state, 'ความสามารถของ LIFE ที่ถูกหงายไม่ทำงาน'); } }
    } else if (tgt.kind === 'construct') {
      const cs = o.constructs.find(x => x.uid === tgt.uid);
      if (cs && power > constructPower(state, cs)) await destroyConstruct(state, cs, 'ถูกโจมตี', p);
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
      state.inBattle = true;
      try {
        if (dDies) await destroyAvatar(state, d, 'แพ้การต่อสู้', p);
        if (aDies) await destroyAvatar(state, a, 'แพ้การต่อสู้', opp(p));
      } finally { state.inBattle = false; }
      if (onField(state, d)) {
        for (const m of attachedTo(state, d)) { const f = FX(m.card.id); if (f && f.afterAttacked) { log(state, `"${m.card.name}" ถูกส่งลงนรกหลังถูกโจมตี`); magicToHell(state, state.players.find(x => x.magicZone.includes(m)), m); } }
        const sf = FX(d.card.id); if (sf && sf.onSurviveAttack && !d.lostAbilities) await sf.onSurviveAttack(A, d.owner, d);
      }
      const dGone = dDies && !onField(state, d), aGone = aDies && !onField(state, a);
      if (dGone && onField(state, a) && afx && afx.onBattleWin && !a.lostAbilities) await afx.onBattleWin(A, p, a, { power, loserPower: dp, loser: d });
      if (dGone && onField(state, a)) for (const m of attachedTo(state, a)) { const f = FX(m.card.id); if (f && f.onEquippedBattleWin) await f.onEquippedBattleWin(A, m.owner, m, a, { power, loserPower: dp, loser: d }); }
      if (dGone && onField(state, a)) for (const src of pl.avatars.slice()) { const f = FX(src.card.id); if (src !== a && f && f.onAllyBattleWin && !src.lostAbilities) await f.onAllyBattleWin(A, p, src, a, d); }
      if (dGone && onField(state, a)) for (const h of pl.hand.slice()) { const f = FX(h.card.id); if (f && f.onAllyBattleWinHand && pl.hand.includes(h) && onField(state, a)) await f.onAllyBattleWinHand(A, p, h, a, d); }
      if (dGone && onField(state, a)) for (const c of pl.constructs.slice()) { const f = FX(c.card.id); if (f && f.onAllyBattleWin && pl.constructs.includes(c)) await f.onAllyBattleWin(A, p, c, a, d); }
      for (const [w, l, lGone] of [[a, d, dGone], [d, a, aGone]]) if (lGone && onField(state, w) && w.flipOnWin === state.turn) { w.flipOnWin = 0; log(state, `${w.card.name} ชนะการต่อสู้ — หงาย LIFE ของอีกฝ่าย`); flipLife(state, opp(w.owner), 1); void l; }
      for (const [x, y, yp] of [[a, d, dp], [d, a, power]]) { const f = FX(x.card.id); if (f && f.afterBattle && onField(state, x) && !x.lostAbilities) await f.afterBattle(A, x.owner, x, y, yp); }
      // React: "when your Avatar is destroyed in battle" (ริกกี้ นักปลอมแปลง)
      if (dGone) await reactWindow(state, opp(p), 'battleDestroyed', { avatar: d });
      if (aGone) await reactWindow(state, p, 'battleDestroyed', { avatar: a });
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
      await show(state, 'life', { p, card: next.card, severe: pl.life.every(l => l.faceUp) });
      if (pl.life.every(l => l.faceUp)) log(state, `⚠️ ${pl.name} เข้าสู่สถานะ "สาหัส" — โดนอีกครั้งเดียวแพ้`);
    }
    if (times === 0) log(state, 'POWER 0 — ไม่ทำความเสียหายต่อ LIFE');
    if (times > 0) for (const a of pl.avatars.slice()) { const f = FX(a.card.id); if (f && f.onLifeFlipped && !a.lostAbilities && onField(state, a) && state.winner == null) await f.onLifeFlipped(api(state), p, a); }
    if (times > 0) for (const cs of pl.constructs.slice()) { const f = FX(cs.card.id); if (f && f.onLifeFlipped && pl.constructs.includes(cs) && state.winner == null) await f.onLifeFlipped(api(state), p, cs); }
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
    if (a.linked) { const b = findAvatar(state, a.linked); if (b) { b.linked = null; log(state, `${b.card.name} หลุดจากสถานะคู่หู`); } a.linked = null; }
    pl.avatars.splice(pl.avatars.indexOf(a), 1);
    state.players.forEach(x => {
      x.magicZone.slice().forEach(m => {
        if (m.attachedTo === a.uid) {
          log(state, `"${m.card.name}" ที่สวมใส่อยู่ถูกส่งลงนรก`);
          magicToHell(state, x, m);
        }
      });
      x.mods = x.mods.filter(m => m.uid !== a.uid);
    });
    Object.assign(a, { rested: false, destroyAtEnd: false, extraKw: null, lostAbilities: false, halved: false, controlChanged: false, costMod: 0, onceTurn: 0 });
    if (a.trueOwner != null) { a.owner = a.trueOwner; delete a.trueOwner; } // a taken Avatar goes back to its owner's zones
    if (a.origCard) { a.card = a.origCard; delete a.origCard; }
    return true;
  }

  // a Modification Magic leaves the Magic Zone for its owner's hell ("เมื่อการ์ดใบนี้ตกลงสู่นรก" triggers)
  function magicToHell(state, holder, m) {
    const host = m.attachedTo;
    holder.magicZone.splice(holder.magicZone.indexOf(m), 1);
    m.attachedTo = null;
    holder.hell.push(m);
    const f = FX(m.card.id);
    if (f && f.onHell) f.onHell(api(state), state.players.indexOf(holder), m, findAvatar(state, host));
  }

  // byP: player whose card/attack causes the destruction (null = own effect)
  async function destroyAvatar(state, a, why, byP) {
    if (!onField(state, a)) return;
    const A = api(state);
    const owner = state.players.findIndex(pl => pl.avatars.includes(a));
    // replacement effects
    const fx = FX(a.card.id);
    if (state.inBattle && state.players[owner].battleSafe === state.turn) { log(state, `${a.card.name} ไม่ถูกทำลายจากการต่อสู้ในเทิร์นนี้`); return; }
    if (state.inBattle && (a.battleSafeUntil || 0) >= state.turn) { log(state, `${a.card.name} ไม่ถูกทำลายจากการต่อสู้`); return; }
    if (a.noDestroyTurn === state.turn) { log(state, `${a.card.name} ไม่ถูกทำลายในเทิร์นนี้`); return; }
    if (state.inBattle) for (const m of attachedTo(state, a)) {
      const f = FX(m.card.id);
      if (f && f.battleShield && !m.shieldUsed) { m.shieldUsed = true; log(state, `${a.card.name} ไม่ถูกทำลาย ("${m.card.name}")`); return; }
    }
    for (const m of attachedTo(state, a)) {
      const f = FX(m.card.id);
      if (f && f.guardHost && f.guardHost(A, a)) {
        const yes = await state.ask(owner, { title: `ทำลาย "${m.card.name}" ที่สวมใส่อยู่ แทน "${a.card.name}"?`, optional: true, options: [{ label: 'ใช่', value: 1, score: 1 }] });
        if (yes != null) { log(state, `"${m.card.name}" ถูกทำลายแทน ${a.card.name}`); magicToHell(state, state.players.find(x => x.magicZone.includes(m)), m); return; }
      }
    }
    if (state.srcMagic && byP != null && byP !== owner && a.magicImmuneUntil >= state.turn) { log(state, `${a.card.name} ไม่รับผลจาก Magic Card ของอีกฝ่าย`); return; }
    if (state.srcMagic && fx && fx.magicImmune && !a.lostAbilities && (typeof fx.magicImmune !== 'function' || fx.magicImmune(A, a))) { log(state, `${a.card.name} ไม่ถูกทำลายด้วยผลของ Magic Card`); return; }
    if (state.srcMagic && !a.rested && attachedTo(state, a).some(m => (FX(m.card.id) || {}).magicShieldAwake)) { log(state, `${a.card.name} ไม่ถูกทำลายด้วยผลของ Magic Card (สภาพตื่น)`); return; }
    if (fx && fx.preventDestroy && !a.lostAbilities && await fx.preventDestroy(A, owner, a, byP)) return;
    if (a.nurseUntil >= state.turn) { a.nurseUntil = 0; log(state, `${a.card.name} ไม่ถูกทำลาย (คุณพยาบาล)`); return; }
    if (!state.inBattle && byP != null && byP !== owner && state.land && (FX(state.land.card.id) || {}).landProtect && FX(state.land.card.id).landProtect(A, a)) { log(state, `${a.card.name} ไม่ถูกนำออกจากสนาม ("${state.land.card.name}")`); return; }
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
    for (const h of state.players[owner].hand.slice()) { const f = FX(h.card.id); if (f && f.onAllyDestroying && state.players[owner].hand.includes(h) && await f.onAllyDestroying(api(state), owner, h, a)) { log(state, `${a.card.name} ไม่ถูกทำลาย`); return; } }
    const rr = await reactWindow(state, owner, 'destroy', { avatar: a, byP });
    if (rr && rr.prevent) { log(state, `${a.card.name} ไม่ถูกทำลาย`); return; }
    if (!onField(state, a)) return;
    await show(state, 'destroy', { uid: a.uid, card: a.card });
    const equips = attachedTo(state, a);
    removeFromField(state, a);
    state.players[a.owner].hell.push(a);
    log(state, `💀 ${a.card.name} ถูกทำลายลงนรก (${why})`);
    a.destroyedBy = byP;
    { const opl = state.players[a.owner]; if (!opl.deaths || opl.deaths.turn !== state.turn) opl.deaths = { turn: state.turn, n: 0 }; opl.deaths.n++; }
    for (const src of state.players[a.owner].avatars.slice()) { const f = FX(src.card.id); if (f && f.onAllyDestroyedField && !src.lostAbilities) await f.onAllyDestroyedField(A, a.owner, src, a, byP); }
    if (a.exileOnDeath) { a.exileOnDeath = false; const hl = state.players[a.owner].hell; hl.splice(hl.indexOf(a), 1); state.players[a.owner].dark.push(a); log(state, `${a.card.name} ถูกเนรเทศ (คำสั่งเสีย)`); }
    // equipped avatars that move to another avatar (วูตาตู)
    for (const m of equips) {
      const f = FX(m.card.id);
      if (f && f.moveOnDeath) {
        const others = state.players[m.owner].avatars;
        if (others.length) {
          const pl = state.players[m.owner];
          pl.hell.splice(pl.hell.indexOf(m), 1);
          const t = await choose(state, m.owner, `ย้าย "${m.card.name}" ไปสวมใส่ให้ใบไหน`, others.map(x => avOpt(state, x, basePower(state, x))));
          m.moving = true; try { await attach(state, m.owner, m, findAvatar(state, t) || others[0]); } finally { m.moving = false; }
        }
      }
    }
    if (fx && fx.lastWill) await runLastWill(state, a);
    if (byP != null && byP !== a.owner) await reactWindow(state, a.owner, 'destroyedByOpp', { avatar: a, byP });
    for (const h of state.players[a.owner].hand.slice()) { const f = FX(h.card.id); if (f && f.onAllyDestroyed && state.players[a.owner].hand.includes(h)) await f.onAllyDestroyed(A, a.owner, h, a); }
  }

  // คำสั่งเสีย: may be suppressed (Overdose) or cancelled by a React (แผนการ : ตอกฝาโลง)
  async function runLastWill(state, a) {
    const fx = FX(a.card.id); if (!fx || !fx.lastWill) return;
    if (state.inBattle && a.noLWTurn === state.turn) { log(state, `คำสั่งเสีย ของ ${a.card.name} ไม่ทำงาน`); return; }
    if (suppressed(state, a, 'lastWill')) { log(state, `คำสั่งเสีย ของ ${a.card.name} ไม่ทำงาน (Overdose)`); return; }
    const rr = await reactWindow(state, opp(a.owner), 'lastWill', { avatar: a });
    if (rr && rr.cancel) { log(state, `คำสั่งเสีย ของ ${a.card.name} ถูกยกเลิก`); return; }
    await fx.lastWill(api(state), a.owner, a);
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
      sacrifice: async (p, a) => { if (removeFromField(state, a)) { state.players[a.owner].hell.push(a); log(state, `${a.card.name} ถูกเซ่นไหว้ลงนรก`); await runLastWill(state, a); } },
      discard: async (p, n, title) => {
        const pl = state.players[p];
        const picks = await state.ask(p, { title: title || `ทิ้งการ์ดบนมือ ${n} ใบ`, multi: n, options: pl.hand.map(h => A.cardOpt(h, -cardValue(h.card))) });
        const uids = (Array.isArray(picks) ? picks : [picks]).filter(x => x != null).slice(0, n);
        uids.forEach(u => { const i = pl.hand.findIndex(h => h.uid === u); if (i >= 0) pl.hell.push(pl.hand.splice(i, 1)[0]); });
        log(state, `${pl.name} ทิ้งการ์ด ${uids.length} ใบ`);
        if (uids.length) for (const h of pl.hell.slice()) { const f = FX(h.card.id); if (f && f.onOwnDiscard && pl.hell.includes(h)) await f.onOwnDiscard(A, p, h); }
        return uids.length;
      },
      // ธรณีสูบ: top N of deck to hell, with "when milled" triggers
      mill: async (p, n, src) => {
        const pl = state.players[p];
        if (src && src.card && src.card.type === 'avatar' && onField(state, src) && suppressed(state, src, 'mill')) { log(state, `ธรณีสูบ ของ ${src.card.name} ไม่ทำงาน (Overdose)`); return []; }
        let extra = 0;
        pl.avatars.forEach(a => { const f = FX(a.card.id); if (f && f.millExtra && (!src || src.card.id !== a.card.id)) extra += f.millExtra; });
        n += extra;
        const milled = [];
        for (let i = 0; i < n && pl.deck.length; i++) { const c = pl.deck.shift(); pl.hell.push(c); milled.push(c); }
        if (milled.length) pl.milledTurn = state.turn;
        log(state, `${pl.name} ธรณีสูบ ${milled.length} ใบ: ${milled.map(c => c.card.name).join(', ')}`);
        if (!pl.deck.length) { lose(state, p, 'การ์ดใน Deck หมด'); return milled; }
        for (const c of milled) { const f = FX(c.card.id); if (f && f.onMilled && pl.hell.includes(c)) await f.onMilled(A, p, c, src); }
        if (milled.length && state.land) { const lf = FX(state.land.card.id); if (lf && lf.onAnyMill) await lf.onAnyMill(A, state.land.owner, p); }
        if (milled.length) for (const src of state.players.flatMap(x => x.avatars.slice())) { const f = FX(src.card.id); if (f && f.onAnyMill && !src.lostAbilities && onField(state, src)) await f.onAnyMill(A, src.owner, src, p); }
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
      takeFrom: (zone, inst) => { const i = zone.indexOf(inst); if (i >= 0) { zone.splice(i, 1); if (state.players.some(q => q.hell === zone)) inst.leftHellTurn = state.turn; } return inst; },
      shuffleDeck: p => { countHellToDeck(state); shuffle(state, state.players[p].deck); },
      hellToDeckThisTurn: p => { countHellToDeck(state); const pl = state.players[p]; return pl.hellToDeckTurn === state.turn ? pl.hellToDeckN : 0; },
      fight: async (p, a, d) => {
        state.fightNoRest = true; state.noReactAll = true; state.noShield = true;
        try { await doAttack(state, p, a.uid, { kind: 'avatar', uid: d.uid }, []); for (const x of state.players.flatMap(q => q.avatars.slice())) if (x.destroyAfterBattle) { x.destroyAfterBattle = false; await destroyAvatar(state, x, 'หลังจบการต่อสู้'); } await sweepZero(state); }
        finally { state.fightNoRest = false; state.noReactAll = false; state.noShield = false; state.battlePair = null; }
      },
      // pick from a zone list by predicate (with player choice)
      pickFrom: async (p, zone, pred, title, optional) => {
        const can = zone.filter(c => pred(c.card, c));
        if (!can.length) return null;
        const v = await choose(state, p, title, can.map(c => A.cardOpt(c)), optional);
        return can.find(c => c.uid === v) || null;
      },
      summonFrom: async (p, zone, inst, o) => {
        const blk = summonBlock(state, p, inst.card); if (blk) { log(state, blk); return false; }
        if (inst.noLeaveHell && state.players.some(x => x.hell === zone)) { log(state, `"${inst.card.name}" ออกจากนรกไม่ได้`); return false; }
        if ((state.players.some(x => x.deck === zone) || inst.fromDeck) && state.players.some(x => x.avatars.some(a => (FX(a.card.id) || {}).noDeckSummon && !a.lostAbilities))) { log(state, 'อัญเชิญ Avatar จาก Deck ไม่ได้ (หุ่นพิฆาต 300%)'); return false; }
        if (inst.parked) inst.parked = false;
        if (state.players.some(x => x.hell === zone)) o = Object.assign({}, o, { fromHell: true });
        if (state.players.some(x => x.hell === zone) && state.players.some(x => x.avatars.some(a => (FX(a.card.id) || {}).noHellSummon && !a.lostAbilities))) { log(state, 'อัญเชิญ Avatar จากนรกไม่ได้ (เจนนี่)'); return false; } A.takeFrom(zone, inst); log(state, `${state.players[p].name} อัญเชิญ ${inst.card.name} (POWER ${inst.card.power})`); return putAvatar(state, p, inst, o || {}); },
      roomFor: (p, card) => hasRoom(state, p, card),
      attach: (p, inst, target) => attach(state, p, inst, target),
      damageLife: (p, times) => damageLife(state, p, times),
      flipLife: (p, times) => flipLife(state, p, times),
      sendToHell: a => { if (removeFromField(state, a)) { state.players[a.owner].hell.push(a); log(state, `${a.card.name} ถูกส่งลงนรก`); } },
      // Magic cards on the field: equipped Modification Magic of both sides + the Land
      fieldMagic: () => { const out = []; state.players.forEach(x => x.magicZone.forEach(m => { if (!m.parked) out.push(m); })); if (state.land) out.push(state.land); return out; },
      destroyMagic: m => {
        if (state.land === m) { state.players[m.owner].hell.push(m); state.land = null; log(state, `Land Magic "${m.card.name}" ถูกทำลาย`); return; }
        const holder = state.players.find(x => x.magicZone.includes(m));
        if (holder) { log(state, `"${m.card.name}" ถูกทำลาย`); magicToHell(state, holder, m); }
      },
      // change control of an Avatar to player p
      takeControl: (a, p, rested, force) => {
        const from = state.players.find(x => x.avatars.includes(a));
        if (!from || state.players.indexOf(from) === p || !hasRoom(state, p, a.card)) return false;
        if (a.linked) { log(state, `${a.card.name} อยู่ในสถานะคู่หู — ยึดการควบคุมไม่ได้`); return false; }
        if (from.constructs.some(c => (FX(c.card.id) || {}).controlGuard)) { log(state, `${a.card.name} ไม่ถูกเปลี่ยนการควบคุม (รูปประจำบ้าน)`); return false; }
        const imm = FX(a.card.id);
        if (((imm && imm.controlImmune && !a.lostAbilities) || attachedTo(state, a).some(m => (FX(m.card.id) || {}).controlImmuneHost)) && !force) { log(state, `${a.card.name} ไม่ถูกเปลี่ยนการควบคุม`); return false; }
        from.avatars.splice(from.avatars.indexOf(a), 1);
        const home = a.trueOwner != null ? a.trueOwner : a.owner;
        if (home === p) delete a.trueOwner; else a.trueOwner = home;
        a.owner = p; a.controlChanged = true; if (rested) a.rested = true;
        state.players[p].avatars.push(a);
        log(state, `${state.players[p].name} ยึด ${a.card.name} มาควบคุม`);
        return true;
      },
      // turn the top face-up LIFE card back face down
      unflipLife: p => {
        const pl = state.players[p];
        if (state.land && (FX(state.land.card.id) || {}).noUnflip) { log(state, 'LIFE เปลี่ยนเป็นสภาพคว่ำไม่ได้ (โรงบาลรัฐ)'); return false; }
        const up = pl.life.filter(l => l.faceUp);
        if (!up.length) return false;
        const l = up[up.length - 1]; l.faceUp = false;
        state.pendingLife[p] = state.pendingLife[p].filter(x => x !== l);
        log(state, `LIFE ของ ${pl.name} กลับมาคว่ำ 1 ใบ`);
        return true;
      },
      toDeckBottom: a => { if (removeFromField(state, a)) { state.players[a.owner].deck.push(a); log(state, `${a.card.name} ไปอยู่ใต้ Deck`); } },
      // put a Land Magic straight onto the Land zone (not counted as using a Land Magic)
      placeLand: async (p, inst) => {
        if (state.land) { state.players[state.land.owner].hell.push(state.land); log(state, `Land Magic "${state.land.card.name}" ถูกส่งลงนรก`); }
        state.land = inst; Object.assign(inst, { owner: p, usedTurn: 0, usedBy: [], placedTurn: state.turn });
        log(state, `${state.players[p].name} วาง Land Magic "${inst.card.name}"`);
        const f = FX(inst.card.id); if (f && typeof f.magic === 'function') await f.magic(A, p, inst, {});
      },
      rand: n => Math.floor(rng(state) * n),
      cost: a => costOf(state, a),
      isSym: (a, sym) => symbolOf(state, a) === sym || (FX(a.card.id) || {}).extraSymbol === sym || (!a.lostAbilities && !!(FX(a.card.id) || {}).allSymbols),
      battleFoe: a => (state.inBattle && state.battlePair && state.battlePair.includes(a) ? state.battlePair.find(x => x !== a) : null),
      blockReact: q => { state.noReactFor = q; },
      queueRevive: (p, a) => { const pl = state.players[p]; (pl.revive = pl.revive || []).push({ uid: a.uid, after: state.turn }); },
      grantKw: (a, kw) => { a.extraKw = (a.extraKw || []).concat(kw); },
      unflipLifeRandom: p => {
        const pl = state.players[p];
        if (state.land && (FX(state.land.card.id) || {}).noUnflip) { log(state, 'LIFE เปลี่ยนเป็นสภาพคว่ำไม่ได้ (โรงบาลรัฐ)'); return false; }
        const up = pl.life.filter(l => l.faceUp);
        if (!up.length) return false;
        const l = up[Math.floor(rng(state) * up.length)]; l.faceUp = false;
        state.pendingLife[p] = state.pendingLife[p].filter(x => x !== l);
        log(state, `LIFE ของ ${pl.name} กลับมาคว่ำ 1 ใบ (สุ่ม)`);
        return true;
      },
      markMagicUsed: (p, t) => { state.magicUsed[p][t] = true; if (t === 'modification') state.magicUsed[p].modCount = (state.magicUsed[p].modCount || 0) + 1; },
      isColor: (card, col) => card.color === col || !!(FX(card.id) || {}).allColors || (FX(card.id) || {}).alsoColor === col,
      atEndOfTurn: fn => { (state.endTasks = state.endTasks || []).push(fn); },
      win: (p, why) => lose(state, opp(p), why),
      putAvatar: (p, inst, o) => putAvatar(state, p, inst, o || {}),
      payCtx: (p, card) => payCtx(state, p, card),
      findPayment: (p, handIdx) => findPayment(state.players[p], handIdx, null, payCtx(state, p, state.players[p].hand[handIdx].card)),
      takeFromHand: (p, idxs) => takeFromHand(state.players[p], idxs),
      restrictAttack: (p, symbol) => { state.players[p].attackOnly = { turn: state.turn, symbol }; },
      restrictSummon: (p, symbol) => { state.players[p].summonOnly = { turn: state.turn, symbol }; },
      lockNames: (p, names) => { const pl = state.players[p]; if (!pl.locked || pl.locked.turn !== state.turn) pl.locked = { turn: state.turn, names: [] }; pl.locked.names.push(...names); },
      rest: a => { a.rested = true; },
      wake: a => { a.rested = false; },
      dice: () => 1 + Math.floor(rng(state) * 6),
      battleBuff: p => { state.players[p].battleBuff = true; },
      equipTargets: (p, card) => equipTargets(state, p, card),
      magicUsed: (p, t) => !!state.magicUsed[p][t],
      constructs: p => state.players[p].constructs,
      constructPower: c => constructPower(state, c),
      destroyConstruct: (c, why, byP) => destroyConstruct(state, c, why, byP),
      freezeNames: (p, names) => { const pl = state.players[p]; if (!pl.frozen || pl.frozen.turn !== state.turn) pl.frozen = { turn: state.turn, names: [] }; pl.frozen.names.push(...names); },
      // keep a card (usually an Avatar) face up in p's Magic Zone; it is no longer on the Avatar Zone
      park: (inst, p, o) => {
        o = o || {};
        const home = inst.trueOwner != null ? inst.trueOwner : inst.owner;
        if (onField(state, inst)) removeFromField(state, inst);
        else state.players.forEach(x => [x.hell, x.deck, x.hand].forEach(z => { const i = z.indexOf(inst); if (i >= 0) z.splice(i, 1); }));
        Object.assign(inst, { parked: true, attachedTo: null, rested: false, owner: p, returnOnMain: !!o.returnOnMain });
        if (home !== p) inst.trueOwner = home; else delete inst.trueOwner;
        if (o.rename) { inst.origCard = inst.origCard || inst.card; inst.card = Object.assign({}, inst.origCard, o.rename); }
        state.players[p].magicZone.push(inst);
        log(state, `${inst.card.name} ไปอยู่ที่ Magic Zone ของ ${state.players[p].name}`);
      },
      parked: p => state.players[p].magicZone.filter(m => m.parked),
      // a parked card leaves the Magic Zone for its real owner's hell
      unparkToHell: inst => {
        const holder = state.players.find(x => x.magicZone.includes(inst)); if (!holder) return;
        holder.magicZone.splice(holder.magicZone.indexOf(inst), 1); inst.parked = false;
        if (inst.trueOwner != null) { inst.owner = inst.trueOwner; delete inst.trueOwner; }
        if (inst.origCard) { inst.card = inst.origCard; delete inst.origCard; }
        state.players[inst.owner].hell.push(inst); log(state, `${inst.card.name} ถูกส่งลงนรก`);
      },
      inMagic: () => !!state.srcMagic,
      grantKwUntil: (a, kw, until) => { a.kwUntil = (a.kwUntil || []).concat({ kw, until }); },
      atDrawPhase: (p, n, fn) => { const pl = state.players[p]; (pl.drawTasks = pl.drawTasks || []).push({ at: (pl.drawPhases || 0) + n, fn }); },
      clearMods: a => { state.players.forEach(pl => { pl.mods = pl.mods.filter(m => m.uid !== a.uid); }); },
      toDeckTop: a => { if (removeFromField(state, a)) { state.players[a.owner].deck.unshift(a); log(state, `${a.card.name} ไปอยู่บนสุดของ Deck`); } },
      lifeFx: id => (FX(id) || {}).life,
      fx: id => FX(id),
      linked: a => (a && a.linked ? findAvatar(state, a.linked) : null),
      dark: p => state.players[p].dark,
      exile: (p, zone, inst) => { A.takeFrom(zone, inst); state.players[p].dark.push(inst); log(state, `"${inst.card.name}" ถูกเนรเทศ`); },
      returnFromDarkOnMain: (p, inst) => { const pl = state.players[p]; (pl.darkReturn = pl.darkReturn || []).push(inst.uid); },
      deathsThisTurn: p => { const d = state.players[p].deaths; return d && d.turn === state.turn ? d.n : 0; },
      findPaymentCut: (p, handIdx, cut) => { const pl = state.players[p]; const ctx = payCtx(state, p, pl.hand[handIdx].card); ctx.cost = Math.max(0, ctx.cost - cut); return findPayment(pl, handIdx, null, ctx); },
      everSummoned: (p, name) => (state.players[p].everSummoned || []).includes(name),
      cardById: id => (root.TC_CARDS || []).find(c => c.id === id) || null,
    };
    return A;
  }

  // ---------- queries for UI/bot ----------
  function legalSummons(state, p) {
    const pl = state.players[p];
    const out = [];
    if (mainCheck(state, p)) return out;
    pl.hand.forEach((h, i) => {
      if (h.card.type !== 'avatar' || !hasRoom(state, p, h.card)) return;
      const fx = FX(h.card.id);
      if (fx && fx.noHandSummon) return;
      if (summonBlock(state, p, h.card)) return;
      if (h.costOnly) return;
      const pay = findPayment(pl, i, null, payCtx(state, p, h.card));
      if (pay) out.push({ handIdx: i, pay });
    });
    return out;
  }

  const Engine = {
    PHASE_TH, MAX_AVATARS, HAND_LIMIT, EQUIP_NAME, avatarLimit, constructPower,
    createGame, mulligan, goBattle, endTurn, reactWindow,
    canSummon, summon, canBuild, build, canCast, cast, activatables, activate,
    attackTargets, canAttack, attack, supportersFor, basePower, costOf, findAvatar, symbolOf, attachedTo,
    checkPayment, findPayment, payCtx, legalSummons, gemTotal, gemColor, hasKw, named, cardValue, opp, api, magicType, hasAbility,
  };
  root.TCEngine = Engine;
  if (typeof module !== 'undefined') module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
