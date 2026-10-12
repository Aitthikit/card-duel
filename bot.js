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

  async function playTurn(state, p, delay, eng) {
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

  function wantMagic(state, p, card) {
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

  root.TCBot = { buildDeck, botAsk, playTurn, pickTarget };
  if (typeof module !== 'undefined') module.exports = root.TCBot;
})(typeof window !== 'undefined' ? window : globalThis);
