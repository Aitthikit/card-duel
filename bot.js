// Deck building + a simple bot that only plays legal moves.
(function (root) {
  'use strict';
  const E = () => root.TCEngine;
  const FX = id => (root.TC_EFFECTS || {})[id];

  // Starter decks: 50 main-deck cards (Only #1 = 1 copy, max 4 per name) + 5 LIFE cards.
  function buildDeck(cards, setId) {
    const pool = cards.filter(c => c.id.startsWith(setId));
    const main = pool.filter(c => c.type !== 'life');
    const life = pool.filter(c => c.type === 'life').slice(0, 5);
    const n = {};
    main.forEach(c => {
      const fx = FX(c.id);
      if (c.onlyOne) n[c.id] = 1;
      else if (c.type === 'avatar') n[c.id] = fx && fx.noHandSummon ? 2 : 3;
      else n[c.id] = fx && (fx.magic || fx.react) ? 2 : 1;
    });
    const total = () => Object.values(n).reduce((a, b) => a + b, 0);
    const avatars = main.filter(c => c.type === 'avatar' && !c.onlyOne && !(FX(c.id) && FX(c.id).noHandSummon)).sort((a, b) => (a.cost || 0) - (b.cost || 0));
    let i = 0;
    while (total() < 50 && i < 400) { const c = avatars[i++ % avatars.length]; if (n[c.id] < 4) n[c.id]++; }
    const trim = main.filter(c => c.type === 'magic' && !(FX(c.id) && (FX(c.id).magic || FX(c.id).react))).concat(avatars.slice().reverse());
    i = 0;
    while (total() > 50 && i < 400) { const c = trim[i++ % trim.length]; if (n[c.id] > 1) n[c.id]--; }
    const deck = [];
    main.forEach(c => { for (let k = 0; k < n[c.id]; k++) deck.push(c); });
    return { deck, life, counts: n };
  }

  // Bot answers to engine questions: take the option with the highest score.
  function botAsk(req) {
    const opts = req.options || [];
    if (!opts.length) return null;
    const sorted = opts.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    if (req.multi) return sorted.slice(0, req.multi).map(o => o.value);
    if (req.optional && (sorted[0].score || 0) <= 0) return null;
    return sorted[0].value;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // How much the bot wants to keep a card in hand rather than pay it as GEM.
  // React Magic (and hand counters) are held for the opponent's turn, other working Magic is
  // worth a play, and a second copy of the same Magic is cheaper to give up than the first.
  function keepValue(state, p) {
    const En = E();
    const pl = state.players[p], o = state.players[1 - p];
    const copies = {};
    pl.hand.forEach(h => { copies[h.card.id] = (copies[h.card.id] || 0) + 1; });
    return card => {
      const fx = FX(card.id);
      let v;
      if (card.type === 'magic') {
        if (fx && (fx.react || fx.handCounter)) v = 7 + (fx.react && fx.react.on === 'attack' && o.avatars.length ? 1 : 0);
        else if (fx && fx.magic) v = En.magicType(card) === 'land' && state.land && state.land.owner === p && state.land.card.id === card.id ? 2 : 5;
        else v = 0.5; // no effect in the game: only good as GEM
        if (copies[card.id] > 1) v -= 1;
      } else v = En.cardValue(card);
      return v;
    };
  }
  // Cheapest payment by the bot's own idea of value (falls back to the engine's choice)
  function payFor(state, p, handIdx) {
    const En = E(), pl = state.players[p];
    const ctx = En.payCtx(state, p, pl.hand[handIdx].card);
    return En.findPayment(pl, handIdx, null, ctx, keepValue(state, p));
  }

  // "บอทปกติ": keeps React / working Magic in hand, pays GEM with the cards it needs least,
  // and only summons when the Avatar is worth what it costs
  async function playTurnSmart(state, p, delay, eng) {
    const En = eng || E(); // eng: an engine whose actions are routed elsewhere (online test mode)
    const wait = async () => { if (delay) await sleep(delay); };
    const pl = state.players[p];
    const alive = () => state.winner == null && state.active === p;

    // 1) activated abilities (hand + field + land), each tried once
    const tried = new Set();
    for (let guard = 0; guard < 10 && alive(); guard++) {
      const acts = En.activatables(state, p).filter(a => !tried.has(a.uid));
      if (!acts.length) break;
      tried.add(acts[0].uid);
      await En.activate(state, p, acts[0].uid); await wait();
    }

    // 2) magic: land first, then normal, then modification
    for (const kind of ['land', 'normal', 'modification']) {
      if (!alive()) return;
      if (kind === 'land' && state.land && state.land.owner === p) continue;
      const idx = pl.hand.findIndex((h, i) => h.card.type === 'magic' && En.magicType(h.card) === kind && En.canCast(state, p, i).ok && wantMagic(state, p, h.card));
      if (idx >= 0) { await En.cast(state, p, idx); await wait(); }
    }

    // 3) summon the strongest avatars we can pay for, paying with the cards we need least
    for (let guard = 0; guard < 6 && alive(); guard++) {
      const opts = En.legalSummons(state, p);
      if (!opts.length) break;
      const val = keepValue(state, p);
      let best = null;
      opts.forEach(o => {
        const c = pl.hand[o.handIdx].card;
        const mine = payFor(state, p, o.handIdx);
        if (mine && En.checkPayment(c, mine.map(i => pl.hand[i].card), En.payCtx(state, p, c)).ok) o = { ...o, pay: mine };
        const payVal = o.pay.reduce((s, i) => s + val(pl.hand[i].card), 0);
        const left = pl.hand.length - 1 - o.pay.length;
        let v = (c.power || 0) * 3 + (FX(c.id) ? 2 : 0) - payVal * 0.6 - o.pay.length * 0.5;
        if (!pl.avatars.length) v += 4;                                   // an empty board needs a blocker
        else if (state.players[1 - p].avatars.length > pl.avatars.length) v += 2;
        if (left < 2 && pl.avatars.length >= 2) v -= 3; // don't empty the hand when the board is already up
        if (!best || v > best.v) best = { ...o, v };
      });
      if (!best || best.v < 0) break;
      const r = await En.summon(state, p, best.handIdx, best.pay);
      if (!r.ok) break;
      await wait();
      // activated abilities that just became available
      for (const a of En.activatables(state, p)) if (!tried.has(a.uid) && alive()) { tried.add(a.uid); await En.activate(state, p, a.uid); await wait(); }
    }
    if (!alive()) return;

    // 3b) build Constructs we can pay for
    for (let guard = 0; guard < 3 && alive(); guard++) {
      const pay = k => payFor(state, p, k);
      const i = pl.hand.findIndex((h, k) => h.card.type === 'construct' && pay(k) && En.canBuild(state, p, k, pay(k)).ok);
      if (i < 0) break;
      const r = await En.build(state, p, i, pay(i));
      if (!r.ok) break;
      await wait();
    }
    if (!alive()) return;

    // 4) battle
    if (state.turn !== 1) await En.goBattle(state, p);
    if (state.phase === 'battle') {
      await wait();
      for (let guard = 0; guard < 8 && alive(); guard++) {
        const ready = pl.avatars.filter(a => !a.rested).sort((a, b) => En.basePower(state, b) - En.basePower(state, a));
        let did = false;
        for (const a of ready) {
          const t = pickTarget(state, p, a);
          if (!t) continue;
          await En.attack(state, p, a.uid, t, []);
          await wait();
          did = true;
          break;
        }
        if (!did) break;
      }
    }
    if (alive()) await En.endTurn(state, p);
  }

  function wantMagic(state, p, card) {
    const o = state.players[1 - p];
    // removal with nothing to remove: keep it for later
    if (/ทำลาย[^。]*Avatar[^。]*อีกฝ่าย|Avatar[^。]*อีกฝ่าย[^。]*ทำลาย/.test(card.text || '') && !o.avatars.length) return false;
    if (card.id === 'BT01-037') return state.players[p].hand.length <= 4; // เพื่อลูกค้า: only when the hand is low
    if (card.id.endsWith('-014')) return state.players[p].avatars.some(a => !a.rested) && o.avatars.length > 0 && state.turn > 1; // ความกล้าหาญ
    return true;
  }


  // ---------- "บอทยาก" / "บอท God": try each move on a copy of the game and keep the best ----------
  // Hard plays without knowing the opponent's hand (it assumes no React from them).
  // God sees everything: the real hands and deck order, and it also plays out the opponent's next turn.
  let cardSet = null;
  function cloneState(state, ask) {
    if (!cardSet) cardSet = new Set(root.TC_CARDS || []);
    const memo = new Map();
    const cp = v => {
      if (v === null || typeof v !== 'object' || cardSet.has(v)) return v;
      if (memo.has(v)) return memo.get(v);
      const out = Array.isArray(v) ? [] : {};
      memo.set(v, out);
      for (const k of Object.keys(v)) out[k] = k === 'log' && v === state ? [] : cp(v[k]);
      return out;
    };
    const c = cp(state);
    Object.defineProperty(c, 'ask', { value: ask, enumerable: false, writable: true });
    Object.defineProperty(c, 'onChange', { value: () => {}, enumerable: false, writable: true });
    Object.defineProperty(c, 'onFx', { value: null, enumerable: false, writable: true });
    return c;
  }
  const isReact = card => { const f = FX(card.id); return card.type === 'magic' && !!(f && (f.react || f.handCounter)); };
  // Board value from p's point of view
  function evalState(st, p) {
    if (st.winner != null) return st.winner === p ? 1e4 : -1e4;
    const En = E();
    const side = q => {
      const pl = st.players[q];
      let s = 0;
      pl.avatars.forEach(a => { s += 3 + Math.max(0, En.basePower(st, a)) * 1.5 + (a.rested ? 0 : 0.5); });
      s += pl.constructs.length * 2 + pl.magicZone.length;
      const down = pl.life.filter(l => !l.faceUp).length;
      s += down * 4 + (down === 0 ? -15 : 0);
      s += Math.min(pl.hand.length, 8) * 1.2 + pl.hand.filter(h => isReact(h.card)).length * 1.5;
      if (pl.deck.length < 6) s -= (6 - pl.deck.length) * 3;
      return s;
    };
    return side(p) - side(1 - p);
  }
  async function playTurnSearch(state, p, delay, eng, god) {
    const En = eng || E(), Sim = E();
    const wait = async () => { if (delay) await sleep(delay); };
    const pl = state.players[p];
    const alive = () => state.winner == null && state.active === p;
    const simAsk = (q, req) => Promise.resolve(!god && q !== p && req.react ? null : botAsk(req));
    // value of doing `move` now and then playing on with the normal bot
    const score = async move => {
      const c = cloneState(state, simAsk);
      try {
        const r = await move(c);
        if (r && r.ok === false) return -Infinity;
        let guard = 0;
        if (c.winner == null && c.active === p) await playTurnSmart(c, p, 0);
        if (god) while (c.winner == null && c.active !== p && guard++ < 2) await playTurnSmart(c, c.active, 0);
      } catch (e) { if (root.TC_BOT_DEBUG) root.TC_BOT_DEBUG(e); return -Infinity; }
      return evalState(c, p);
    };
    const best = async moves => {
      let top = null;
      for (const m of moves) { const v = await score(m.sim); if (!top || v > top.v) top = { ...m, v }; }
      return top;
    };
    // Main Phase: activate / cast / summon / build, one move at a time, until going to battle is best
    for (let step = 0; step < 12 && alive() && state.phase === 'main'; step++) {
      const moves = [];
      Sim.activatables(state, p).forEach(a => moves.push({ sim: c => Sim.activate(c, p, a.uid), run: () => En.activate(state, p, a.uid) }));
      pl.hand.forEach((h, i) => {
        if (h.card.type === 'magic' && Sim.canCast(state, p, i).ok) moves.push({ sim: c => Sim.cast(c, p, i), run: () => En.cast(state, p, i) });
        if (h.card.type === 'construct') { const pay = payFor(state, p, i); if (pay && Sim.canBuild(state, p, i, pay).ok) moves.push({ sim: c => Sim.build(c, p, i, pay), run: () => En.build(state, p, i, pay) }); }
      });
      Sim.legalSummons(state, p).forEach(o => {
        const mine = payFor(state, p, o.handIdx);
        [o.pay].concat(mine && mine.join() !== o.pay.join() ? [mine] : []).forEach(pay =>
          moves.push({ sim: c => Sim.summon(c, p, o.handIdx, pay), run: () => En.summon(state, p, o.handIdx, pay) }));
      });
      const stay = { stop: true, sim: c => (state.turn === 1 ? Sim.endTurn(c, p) : Sim.goBattle(c, p)) };
      const top = await best(moves.concat([stay]));
      if (!top || top.stop) break;
      const r = await top.run(); await wait();
      if (r && r.ok === false) break;
    }
    if (!alive()) return;
    if (state.turn !== 1 && state.phase === 'main') { await En.goBattle(state, p); await wait(); }
    // Battle Phase: pick the attack (or stop) that leads to the best board
    for (let step = 0; step < 10 && alive() && state.phase === 'battle'; step++) {
      const moves = [];
      Sim.activatables(state, p).forEach(a => moves.push({ sim: c => Sim.activate(c, p, a.uid), run: () => En.activate(state, p, a.uid) }));
      pl.avatars.filter(a => !a.rested).forEach(a => Sim.attackTargets(state, p, a.uid).forEach(t =>
        moves.push({ sim: c => Sim.attack(c, p, a.uid, t, []), run: () => En.attack(state, p, a.uid, t, []) })));
      if (!moves.length) break;
      const top = await best(moves.concat([{ stop: true, sim: c => Sim.endTurn(c, p) }]));
      if (!top || top.stop) break;
      const r = await top.run(); await wait();
      if (r && r.ok === false) break;
    }
    if (alive()) await En.endTurn(state, p);
  }

  // ---------- "บอทง่าย": the original bot, kept as it was ----------
  async function playTurnEasy(state, p, delay, eng) {
    const En = eng || E(); // eng: an engine whose actions are routed elsewhere (online test mode)
    const wait = async () => { if (delay) await sleep(delay); };
    const pl = state.players[p];
    const alive = () => state.winner == null && state.active === p;

    // 1) activated abilities (hand + field + land), each tried once
    const tried = new Set();
    for (let guard = 0; guard < 10 && alive(); guard++) {
      const acts = En.activatables(state, p).filter(a => !tried.has(a.uid));
      if (!acts.length) break;
      tried.add(acts[0].uid);
      await En.activate(state, p, acts[0].uid); await wait();
    }

    // 2) magic: land first, then normal, then modification
    for (const kind of ['land', 'normal', 'modification']) {
      if (!alive()) return;
      if (kind === 'land' && state.land && state.land.owner === p) continue;
      const idx = pl.hand.findIndex((h, i) => h.card.type === 'magic' && En.magicType(h.card) === kind && En.canCast(state, p, i).ok && wantMagicEasy(state, p, h.card));
      if (idx >= 0) { await En.cast(state, p, idx); await wait(); }
    }

    // 3) summon the strongest avatars we can pay for
    for (let guard = 0; guard < 6 && alive(); guard++) {
      const opts = En.legalSummons(state, p);
      if (!opts.length) break;
      let best = null;
      opts.forEach(o => {
        const c = pl.hand[o.handIdx].card;
        const payVal = o.pay.reduce((s, i) => s + En.cardValue(pl.hand[i].card), 0);
        const v = (c.power || 0) * 3 + (FX(c.id) ? 2 : 0) - payVal * 0.6 - o.pay.length * 0.5;
        if (!best || v > best.v) best = { ...o, v };
      });
      if (!best || best.v < 0 && pl.avatars.length >= 2) break;
      const r = await En.summon(state, p, best.handIdx, best.pay);
      if (!r.ok) break;
      await wait();
      // activated abilities that just became available
      for (const a of En.activatables(state, p)) if (!tried.has(a.uid) && alive()) { tried.add(a.uid); await En.activate(state, p, a.uid); await wait(); }
    }
    if (!alive()) return;

    // 3b) build Constructs we can pay for
    for (let guard = 0; guard < 3 && alive(); guard++) {
      const payFor = k => En.findPayment(pl, k, null, En.payCtx(state, p, pl.hand[k].card));
      const i = pl.hand.findIndex((h, k) => h.card.type === 'construct' && payFor(k) && En.canBuild(state, p, k, payFor(k)).ok);
      if (i < 0) break;
      const r = await En.build(state, p, i, payFor(i));
      if (!r.ok) break;
      await wait();
    }
    if (!alive()) return;

    // 4) battle
    if (state.turn !== 1) await En.goBattle(state, p);
    if (state.phase === 'battle') {
      await wait();
      for (let guard = 0; guard < 8 && alive(); guard++) {
        const ready = pl.avatars.filter(a => !a.rested).sort((a, b) => En.basePower(state, b) - En.basePower(state, a));
        let did = false;
        for (const a of ready) {
          const t = pickTarget(state, p, a);
          if (!t) continue;
          await En.attack(state, p, a.uid, t, []);
          await wait();
          did = true;
          break;
        }
        if (!did) break;
      }
    }
    if (alive()) await En.endTurn(state, p);
  }

  function wantMagicEasy(state, p, card) {
    const o = state.players[1 - p];
    if (card.id === 'BT01-037') return state.players[p].hand.length <= 4; // เพื่อลูกค้า: only when the hand is low
    if (card.id.endsWith('-014')) return state.players[p].avatars.some(a => !a.rested) && o.avatars.length > 0 && state.turn > 1; // ความกล้าหาญ
    return true;
  }

  function pickTarget(state, p, a) {
    const En = E();
    const ts = En.attackTargets(state, p, a.uid);
    if (!ts.length) return null;
    const my = En.basePower(state, a);
    const life = ts.find(t => t.kind === 'life');
    const o = state.players[1 - p];
    const kills = ts.filter(t => t.kind === 'avatar').map(t => ({ t, d: En.findAvatar(state, t.uid) }))
      .map(x => ({ ...x, dp: En.basePower(state, x.d) }));
    if (life && my > 0) {
      // finishing blow or no blockers: go face
      if (o.avatars.length === 0 || o.life.every(l => l.faceUp)) return life;
      const bestKill = kills.filter(k => k.dp < my).sort((x, y) => y.dp - x.dp)[0];
      if (bestKill && bestKill.dp >= 4) return bestKill.t;
      return life;
    }
    const win = kills.filter(k => k.dp < my).sort((x, y) => (y.dp + (y.d.card.cost || 0)) - (x.dp + (x.d.card.cost || 0)))[0];
    if (win) return win.t;
    const trade = kills.filter(k => k.dp === my && ((k.d.card.cost || 0) >= (a.card.cost || 0))).sort((x, y) => (y.d.card.cost || 0) - (x.d.card.cost || 0))[0];
    if (trade && my > 0) return trade.t;
    const cs = ts.find(t => t.kind === 'construct' && o.constructs.some(c => c.uid === t.uid && my > En.constructPower(state, c)));
    if (cs) return cs;
    return null;
  }

  const LEVELS = { easy: 'ง่าย', normal: 'ปกติ', hard: 'ยาก', god: 'God' };
  function playTurn(state, p, delay, eng, level) {
    if (level === 'easy') return playTurnEasy(state, p, delay, eng);
    if (level === 'hard' || level === 'god') return playTurnSearch(state, p, delay, eng, level === 'god');
    return playTurnSmart(state, p, delay, eng);
  }

  root.TCBot = { buildDeck, botAsk, playTurn, pickTarget, LEVELS };
  if (typeof module !== 'undefined') module.exports = root.TCBot;
})(typeof window !== 'undefined' ? window : globalThis);
