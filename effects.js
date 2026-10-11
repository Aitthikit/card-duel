// Card effects: starter decks (KD00–KD04), BT01–BT06, and a few single cards.
// Cards not listed here still play by the core rules (summon, GEM, POWER, keywords like
// เตะไข่ / โล่มนุษย์ / ลูกฮึด / สามัคคี / แทงหลัง); their extra text is shown but not executed.
(function (root) {
  'use strict';
  const E = {};
  const isAvatar = c => c.type === 'avatar';
  const notOnly = c => !c.onlyOne;
  const IDOL = 'ไอดอล', OTA = 'โอตะ', NARAI = 'พระนารายณ์', NIRAYA = 'นายนิรยบาล', MIGRAINE = 'ไมเกรน', WEAPON = 'อาวุธหุ่นนักรบผู้กล้า';
  const distinctHellSymbol = (A, p, sym) => new Set(A.hell(p).filter(c => isAvatar(c.card) && c.card.symbol === sym).map(c => c.card.name)).size;

  // ---------- shared building blocks ----------
  const drawN = n => async (A, p) => A.draw(p, n);
  const lifeDraw1 = { life: drawN(1) };
  const lifeDome = { life: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && A.gem(c) >= 3, 'นำ Avatar (GEM 3+) จากนรกขึ้นมือ'); if (c) A.toHand(p, A.takeFrom(A.hell(p), c)); } };
  const lifeScout5 = { life: async (A, p) => { const got = await A.scout(p, 5, isAvatar, 'นำ Avatar 1 ใบขึ้นมือ'); got.forEach(c => A.toHand(p, c)); } };
  const lifeNormalMagic = { life: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), c => c.type === 'magic' && (c.magicType || 'normal') === 'normal', 'นำ Normal Magic จากนรกขึ้นมือ'); if (c) A.toHand(p, A.takeFrom(A.hell(p), c)); } };

  const prosper = { magic: drawN(2) }; // ความเจริญ
  const pickForPoor = { // เลือกมันสำหรับพวก จน !!!
    magic: async (A, p) => {
      const myUp = A.state.players[p].life.filter(l => l.faceUp).length, opUp = A.state.players[A.opp(p)].life.filter(l => l.faceUp).length;
      const both = myUp >= 4 && myUp > opUp;
      const pred = c => isAvatar(c) && (c.cost || 0) <= 5 && notOnly(c);
      let mode = both ? 3 : await A.choose(p, 'เลือกปฏิบัติ', [
        { label: '1) Avatar Cost ≤5 จากนรกขึ้นมือ', value: 1, score: A.hell(p).some(c => pred(c.card)) ? 2 : -1 },
        { label: '2) Avatar Cost ≤5 จาก Deck ขึ้นมือ', value: 2, score: 1 }]);
      if (mode & 1) { const c = await A.pickFrom(p, A.hell(p), pred, 'เลือก Avatar จากนรก'); if (c) A.toHand(p, A.takeFrom(A.hell(p), c)); }
      if (mode & 2) { const c = await A.pickFrom(p, A.deck(p), pred, 'เลือก Avatar จาก Deck'); if (c) A.toHand(p, A.takeFrom(A.deck(p), c)); A.shuffleDeck(p); }
    },
  };
  const accident = { // อุบัติเหตุ!!!
    react: {
      on: 'summon', when: (A, p, ctx) => A.onField(ctx.avatar),
      botScore: (A, p, ctx) => (ctx.avatar.card.power || 0) >= 4 || (ctx.avatar.card.cost || 0) >= 5 ? 3 : -1,
      run: async (A, p, ctx) => { await A.destroy(ctx.avatar, 'อุบัติเหตุ!!!', p); },
    },
  };
  const futureMan = { // ชายจากอนาคต
    react: { on: 'magic', botScore: (A, p, ctx) => ['land', 'react'].includes(ctx.card.card.magicType) || ctx.card.card.onlyOne ? 2 : 0.5, run: async () => ({ cancel: true }) },
  };
  // โอตะ avatars: "turn once — equip this avatar to an ไอดอล"
  const otaEquipSelf = (extra) => Object.assign({
    activateLabel: 'สวมใส่ให้ "ไอดอล"',
    canActivate: (A, p, a) => A.avatars(p).some(x => x !== a && A.named(x.card, IDOL)),
    activate: async (A, p, a) => {
      const t = await A.choose(p, `สวมใส่ "${a.card.name}" ให้ใบไหน`, A.avatars(p).filter(x => x !== a && A.named(x.card, IDOL)).map(x => A.avOpt(x, A.power(x))));
      const target = A.avatars(p).find(x => x.uid === t);
      if (!target) return;
      const pl = A.state.players[p]; pl.avatars.splice(pl.avatars.indexOf(a), 1);
      await A.attach(p, a, target);
    },
  }, extra || {});
  const otaFromZoneToIdol = async (A, p, zone, title) => {
    const idols = A.avatars(p).filter(x => A.named(x.card, IDOL));
    if (!idols.length) return;
    const c = await A.pickFrom(p, zone, c => A.named(c, OTA) && isAvatar(c), title || 'เลือก "โอตะ"');
    if (!c) return;
    const t = await A.choose(p, `สวมใส่ "${c.card.name}" ให้ใบไหน`, idols.map(x => A.avOpt(x, A.power(x))));
    A.takeFrom(zone, c);
    await A.attach(p, c, A.avatars(p).find(x => x.uid === t) || idols[0]);
  };
  const bestOppAvatar = (A, p, pred) => A.avatars(A.opp(p)).filter(pred || (() => true)).map(a => A.avOpt(a, A.power(a) + (a.card.cost || 0)));

  // ================= KD01 (พระนารายณ์ / เทพ) =================
  E['KD01-004'] = { // พระลักษมี
    payOnlyFor: c => c.symbol === 'เทพ',
    onPaidAsCost: async (A, p, pc, summoned) => { if (A.named(summoned.card, NARAI)) A.addPower(summoned, 3, 'endTurn'); },
  };
  E['KD01-005'] = { // พระนารายณ์ เทพผู้พิทักษ์ — halve base power instead of being destroyed (once per summon)
    preventDestroy: async (A, p, a) => { if (a.halved) return false; a.halved = true; A.log(`${a.card.name}: POWER ตั้งต้นลดลงครึ่งหนึ่งแทนการถูกทำลาย`); return true; },
  };
  E['KD01-006'] = { onAttack: async (A, p, a) => A.addPower(a, 2, 'endTurn') }; // พระนารายณ์
  E['KD01-007'] = { // พระอินทร์ เทพขยัน
    onSummon: async (A, p) => { const got = await A.scout(p, 3, c => c.symbol === 'เทพ', 'เลือกการ์ด {เทพ} ขึ้นมือ'); got.forEach(c => A.toHand(p, c)); },
  };
  E['KD01-008'] = { // พระพรหม
    onSummon: async (A, p, self) => {
      const others = A.avatars(p).filter(x => x !== self);
      const valid = others.filter(s => A.hell(p).some(c => isAvatar(c.card) && c.card.symbol === A.symbol(s) && c.card.name !== s.card.name && (c.card.cost || 0) <= 8));
      if (!valid.length) return;
      const v = await A.choose(p, 'จุติ: เซ่นไหว้ Avatar 1 ใบ เพื่ออัญเชิญจากนรก? ', valid.map(x => A.avOpt(x, 5 - A.power(x))), true);
      const s = valid.find(x => x.uid === v); if (!s) return;
      const sym = A.symbol(s), nm = s.card.name;
      await A.sacrifice(p, s);
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && c.symbol === sym && c.name !== nm && (c.cost || 0) <= 8, 'อัญเชิญ จุติ จากนรก');
      if (c) await A.summonFrom(p, A.hell(p), c, { jutti: true });
    },
  };
  E['KD01-009'] = {};
  E['KD01-010'] = { continuousSelf: (A, p, a) => A.avatars(p).filter(x => A.isSym(x, 'เทพ')).length }; // หนุมาน
  E['KD01-013'] = prosper;
  E['KD01-014'] = { // ความกล้าหาญ
    canUse: (A, p) => A.avatars(p).length > 0,
    magic: async (A, p) => {
      const v = await A.choose(p, 'เลือก Avatar: POWER +4 (ถูกทำลายใน End Phase)', A.avatars(p).map(x => A.avOpt(x, A.power(x))));
      const a = A.avatars(p).find(x => x.uid === v); if (!a) return;
      A.addPower(a, 4, 'endTurn'); a.destroyAtEnd = true;
    },
  };
  E['KD01-015'] = pickForPoor;
  E['KD01-016'] = { magic: true, onEquippedAttack: async (A, p, m, a) => A.draw(a.owner, 1) }; // ขวานทอง
  E['KD01-017'] = accident;
  E['KD01-018'] = { // ไปเลยมอนตี้
    react: {
      on: 'attack',
      botScore: (A, p, ctx) => A.power(ctx.attacker) >= 3 ? 2 : 0,
      run: async (A, p, ctx) => {
        const pl = A.state.players[p];
        const n = pl.avatars.length + pl.constructs.length + pl.magicZone.length + pl.hand.length + (A.state.land && A.state.land.owner === p ? 1 : 0);
        A.addPower(ctx.attacker, -2 * n, 'endTurn');
      },
    },
  };
  E['KD01-019'] = { magic: true, aura: (A, owner, src, a) => (A.isSym(a, 'เทพ') ? 1 : 0) }; // เขาไกรลาส
  E['KD01-020'] = { magic: true, allSymbol: 'เทพ' }; // แอสการ์ด (symbol part)
  E['KD01-021'] = lifeDraw1; E['KD01-022'] = lifeDraw1; E['KD01-023'] = lifeDraw1; E['KD01-024'] = lifeDraw1; E['KD01-025'] = lifeDome;

  // ================= KD00 =================
  E['KD00-00D'] = { // ขอมือเธอหน่อย~
    magic: async (A, p) => {
      const ps = A.state.players;
      const most = Math.max(ps[0].hand.length, ps[1].hand.length);
      for (let q = 0; q < 2; q++) if (ps[q].hand.length === most) await A.discard(q, 2, 'ขอมือเธอหน่อย~: ทิ้งการ์ด 2 ใบ');
      for (let q = 0; q < 2; q++) { const n = most - ps[q].hand.length; if (n > 0) A.draw(q, n); }
    },
  };

  // ================= KD02 (นรก / นายนิรยบาล) =================
  E['KD02-001'] = { // เมฟิสโตเฟเลส
    noHandSummon: true,
    handActivateLabel: 'อัญเชิญ (นรก 7 ชื่อ, ทิ้ง 2)',
    canHandActivate: (A, p) => A.roomFor(p) && distinctHellSymbol(A, p, 'นรก') >= 7 && A.hand(p).length >= 3,
    handActivate: async (A, p, h) => {
      A.takeFrom(A.hand(p), h);
      await A.discard(p, 2, 'ทิ้งการ์ด 2 ใบ');
      await A.summonFrom(p, [], h, { jutti: true });
    },
    activateLabel: 'ธรณีสูบ 5: ทำลาย Avatar อื่นทั้งหมด',
    canActivate: (A, p) => A.deck(p).length > 5,
    activate: async (A, p, self) => {
      await A.mill(p, 5, self);
      for (const q of [0, 1]) for (const a of A.avatars(q).slice()) if (a !== self) await A.destroy(a, 'เมฟิสโตเฟเลส', p);
    },
  };
  E['KD02-002'] = { // ลิลิธ
    alsoNamed: [NIRAYA],
    activateLabel: 'เนรเทศ 2 ใบในนรก: นำการ์ด {นรก} ขึ้นมือ',
    canActivate: (A, p) => distinctHellSymbol(A, p, 'นรก') >= 4 && A.hell(p).length >= 3,
    activate: async (A, p) => {
      const pl = A.state.players[p];
      for (let k = 0; k < 2; k++) {
        const c = await A.pickFrom(p, pl.hell, () => true, `เนรเทศการ์ดในนรก (${k + 1}/2)`);
        if (c) { A.takeFrom(pl.hell, c); pl.dark.push(c); }
      }
      const c = await A.pickFrom(p, pl.hell, c => c.symbol === 'นรก', 'นำการ์ด {นรก} จากนรกขึ้นมือ');
      if (c) A.toHand(p, A.takeFrom(pl.hell, c));
    },
  };
  E['KD02-003'] = { // พญายม
    onSummon: async (A, p) => { if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && A.named(c, NIRAYA), 'อัญเชิญ "นายนิรยบาล" จากนรก', true); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); },
  };
  E['KD02-004'] = { // สุวรรณ
    onSummon: async (A, p) => { const got = await A.scout(p, 5, c => isAvatar(c) && (A.named(c, 'พญายม') || A.named(c, NIRAYA) || c.id === 'KD02-001'), 'นำ "พญายม" หรือ "นายนิรยบาล" ขึ้นมือ'); got.forEach(c => A.toHand(p, c)); },
  };
  E['KD02-005'] = { // นายนิรยบาล หมอ
    onSummon: async (A, p, self) => {
      if (!A.hand(p).length) return;
      const yes = await A.choose(p, 'จุติ: ทิ้งการ์ด 1 ใบ เพื่อ ธรณีสูบ 3 และอัญเชิญ {นรก} Cost ≤4 จากนรก?', [{ label: 'ใช้', value: 1, score: 1 }], true);
      if (!yes) return;
      await A.discard(p, 1);
      await A.mill(p, 3, self);
      if (!A.roomFor(p)) return;
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && c.symbol === 'นรก' && (c.cost || 0) <= 4 && !E[c.id]?.noHandSummon, 'อัญเชิญ Avatar {นรก} Cost ≤4 จากนรก', true);
      if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false });
    },
  };
  const jijaTrig = async (A, p, a) => { await A.mill(p, 2, a); if (A.onField(a)) A.addPower(a, 1, 'endTurn'); };
  E['KD02-006'] = { onAttack: jijaTrig, onTargeted: jijaTrig }; // พ่อจีจ้า
  E['KD02-007'] = { // แว่น
    noHandSummon: true,
    onMilled: async (A, p, c) => {
      if (!A.roomFor(p)) return;
      const yes = await A.choose(p, `"${c.card.name}" ถูกธรณีสูบ — อัญเชิญจากนรก?`, [{ label: 'อัญเชิญ', value: 1, score: 1 }], true);
      if (yes) await A.summonFrom(p, A.hell(p), c, { jutti: false });
    },
  };
  E['KD02-008'] = { millExtra: 2 }; // อ้วน
  E['KD02-009'] = { onMilled: async (A, p, c) => { A.log(`"${c.card.name}": ทั้งสองฝ่ายธรณีสูบ 2 ใบ`); await A.mill(p, 2, c); await A.mill(A.opp(p), 2, c); } };
  E['KD02-014'] = { // สัญญาเลือด
    magic: async (A, p, self) => { await A.mill(p, 3, self); A.draw(p, distinctHellSymbol(A, p, 'นรก') >= 5 ? 2 : 1); },
  };
  E['KD02-015'] = { // ร้อนมากก็เปิดหน้าต่างสิว๊ากกกก
    canUse: (A, p) => A.avatars(A.opp(p)).length > 0,
    magic: async (A, p) => { const v = await A.choose(p, 'เลือก Avatar อีกฝ่าย นำกลับขึ้นมือ', bestOppAvatar(A, p)); const a = A.avatars(A.opp(p)).find(x => x.uid === v); if (a) A.bounce(a); },
  };
  E['KD02-016'] = pickForPoor;
  E['KD02-017'] = { // อย่าให้มีครั้งที่ 2: cancel an opponent's React; usable even after another React this turn (once per turn by name)
    ignoreReactLimit: true,
    react: { on: 'magic', when: (A, p, ctx) => ctx.card.card.magicType === 'react', botScore: () => 2, run: async () => ({ cancel: true }) },
  };
  E['KD02-018'] = futureMan;
  E['KD02-019'] = { magic: true, equipPower: (A, a) => (A.isSym(a, 'นรก') ? 1 : 0) }; // หอกแหลม
  E['KD02-020'] = { // ประตูนรก
    magic: true,
    activateLabel: 'ทิ้ง {นรก} จากมือ: อัญเชิญ "นายนิรยบาล" Cost ≤4 จากนรก',
    canActivate: (A, p) => A.roomFor(p) && A.hand(p).some(h => isAvatar(h.card) && h.card.symbol === 'นรก') && A.hell(p).some(c => isAvatar(c.card) && A.named(c.card, NIRAYA) && (c.card.cost || 0) <= 4),
    activate: async (A, p) => {
      const h = await A.pickFrom(p, A.hand(p), c => isAvatar(c) && c.symbol === 'นรก', 'ทิ้ง Avatar {นรก} จากมือ');
      if (!h) return; A.hell(p).push(A.takeFrom(A.hand(p), h));
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && A.named(c, NIRAYA) && (c.cost || 0) <= 4, 'อัญเชิญ "นายนิรยบาล" จากนรก');
      if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false });
    },
  };
  E['KD02-021'] = lifeDraw1; E['KD02-022'] = lifeDome; E['KD02-023'] = lifeScout5; E['KD02-024'] = lifeNormalMagic; E['KD02-025'] = lifeDraw1;

  // ================= KD03 (ไอดอล / โอตะ) =================
  E['KD03-001'] = { // มีมมิจัง ไอดอล No.1 — จุติ part
    onSummon: async (A, p) => {
      if (!A.roomFor(p)) return;
      const idol = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && A.named(c, IDOL), 'จุติ: อัญเชิญ "ไอดอล" จาก Deck', true);
      if (idol) {
        await A.summonFrom(p, A.deck(p), idol, { jutti: false });
        const ota = await A.pickFrom(p, A.deck(p), c => A.named(c, OTA), 'สวมใส่ "โอตะ" จาก Deck', true);
        if (ota && A.onField(idol)) { A.takeFrom(A.deck(p), ota); await A.attach(p, ota, idol); }
      }
      A.shuffleDeck(p);
    },
  };
  E['KD03-002'] = otaEquipSelf({ payOnlyFor: c => (c.name || '').includes(IDOL) || (c.name || '').includes('โปรดิวเซอร์'), equipPower: (A, a) => (A.named(a.card, 'มีมมิ') ? 2 : A.named(a.card, IDOL) ? 1 : 0) });
  E['KD03-003'] = { onSummon: async (A, p, self) => { const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && A.named(c, OTA), 'จุติ: สวมใส่ "โอตะ" จาก Deck', true); if (c) { A.takeFrom(A.deck(p), c); await A.attach(p, c, self); } A.shuffleDeck(p); } };
  E['KD03-004'] = { // แบมบูจัง
    activateLabel: 'ทำลาย "โอตะ" ที่สวมใส่: ทำลายการ์ดบนสนาม 1 ใบ',
    canActivate: (A, p) => A.avatars(A.opp(p)).length > 0 && A.state.players[p].magicZone.some(m => A.named(m.card, OTA) && A.avatars(p).some(x => x.uid === m.attachedTo && A.named(x.card, IDOL))),
    activate: async (A, p) => {
      const pl = A.state.players[p];
      const otas = pl.magicZone.filter(m => A.named(m.card, OTA) && A.avatars(p).some(x => x.uid === m.attachedTo));
      const m = await A.pickFrom(p, otas, () => true, 'ทำลาย "โอตะ" ที่สวมใส่');
      if (!m) return; pl.magicZone.splice(pl.magicZone.indexOf(m), 1); m.attachedTo = null; pl.hell.push(m);
      const v = await A.choose(p, 'ทำลาย Avatar อีกฝ่าย 1 ใบ', bestOppAvatar(A, p));
      const a = A.avatars(A.opp(p)).find(x => x.uid === v); if (a) await A.destroy(a, 'แบมบูจัง', p);
    },
  };
  E['KD03-005'] = { aura: (A, owner, src, a) => (a.owner === owner && a !== src && A.named(a.card, IDOL) && A.attached(a).some(m => A.named(m.card, OTA)) ? 2 : 0) }; // โทมาโทจัง
  E['KD03-006'] = { // มยุราซัง
    activateLabel: 'สวมใส่ "โอตะ" จากนรกให้ "ไอดอล"',
    canActivate: (A, p, a) => A.avatars(p).some(x => x !== a && A.named(x.card, IDOL)) && A.hell(p).some(c => isAvatar(c.card) && A.named(c.card, OTA)),
    activate: async (A, p) => otaFromZoneToIdol(A, p, A.hell(p), 'เลือก "โอตะ" จากนรก'),
  };
  E['KD03-007'] = otaEquipSelf();
  E['KD03-008'] = otaEquipSelf({ lastWill: drawN(1) });
  E['KD03-009'] = { // โอตะตัวกะปอม
    payOnlyFor: c => (c.name || '').includes(IDOL),
    equipPower: 1,
    onPaidAsCost: async (A, p, pc, summoned) => { const pl = A.state.players[p]; A.takeFrom(pl.hell, pc); await A.attach(p, pc, summoned); },
  };
  E['KD03-010'] = Object.assign(otaEquipSelf({ // วูตาตู
    canActivate: (A, p, a) => A.avatars(p).some(x => x !== a),
    activate: async (A, p, a) => {
      const t = await A.choose(p, 'สวมใส่วูตาตูให้ใบไหน', A.avatars(p).filter(x => x !== a).map(x => A.avOpt(x, A.power(x))));
      const target = A.avatars(p).find(x => x.uid === t); if (!target) return;
      const pl = A.state.players[p]; pl.avatars.splice(pl.avatars.indexOf(a), 1);
      await A.attach(p, a, target);
    },
    activateLabel: 'สวมใส่ให้ Avatar (POWER +3)',
  }), { equipPower: 3, equipSymbol: 'ผี', moveOnDeath: true });
  E['KD03-012'] = prosper;
  E['KD03-013'] = { // เยี่ยวรดศาล
    canUse: (A, p) => A.roomFor(p) && A.avatars(p).some(a => A.isSym(a, 'คน') && (a.card.cost || 0) >= 3),
    magic: async (A, p) => { const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && c.symbol === 'ผี' && (c.cost || 0) <= 4, 'อัญเชิญ จุติ {ผี} Cost ≤4 จาก Deck'); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: true }); A.shuffleDeck(p); },
  };
  E['KD03-014'] = { // ตู้โชว์ไอดอล
    canUse: (A, p) => A.avatars(p).some(a => A.named(a.card, IDOL)),
    magic: async (A, p) => { const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && A.named(c, OTA), 'นำ "โอตะ" จาก Deck ขึ้นมือ'); if (c) A.toHand(p, A.takeFrom(A.deck(p), c)); A.shuffleDeck(p); },
  };
  E['KD03-015'] = { // งานจับมือ
    react: {
      on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'avatar' && A.avatars(p).some(a => a.uid === ctx.target.uid && A.named(a.card, IDOL)),
      botScore: () => 3,
      run: async (A, p) => { await otaFromZoneToIdol(A, p, A.hell(p), 'สวมใส่ "โอตะ" จากนรก'); return { cancelAttack: true }; },
    },
  };
  E['KD03-016'] = accident;
  E['KD03-018'] = { magic: true, equipPower: 3, onEquippedAttack: async (A, p, m, a) => { a.noUntap = true; } }; // น้ำซุปชาบู
  E['KD03-019'] = { magic: true, equipOk: (A, a) => A.named(a.card, IDOL), onEquip: async (A, p) => A.draw(p, 1), payOnlyFor: c => (c.name || '').includes(IDOL) || (c.name || '').includes('โปรดิวเซอร์') };
  E['KD03-020'] = { // เวทีแห่งความฝัน (option 2)
    magic: true,
    activateLabel: 'ทิ้ง 1: สอดแนม 7 นำ "ไอดอล" ขึ้นมือ',
    canActivate: (A, p) => A.hand(p).length > 0,
    activate: async (A, p) => { await A.discard(p, 1); const got = await A.scout(p, 7, c => isAvatar(c) && A.named(c, IDOL), 'นำ "ไอดอล" ขึ้นมือ'); got.forEach(c => A.toHand(p, c)); A.shuffleDeck(p); },
  };
  E['KD03-021'] = lifeScout5; E['KD03-022'] = lifeNormalMagic; E['KD03-023'] = lifeDraw1; E['KD03-024'] = lifeDraw1; E['KD03-025'] = lifeDome;

  // ================= KD04 (หุ่นนักรบผู้กล้า / ไมเกรน) =================
  const isWeapon = c => A_named(c, WEAPON) || A_named(c, 'อาวุธนักรบผู้กล้า');
  function A_named(c, w) { return (c.name || '').includes(w); }
  E['KD04-002'] = { // ด็อกเตอร์ เพน
    onSummon: async (A, p) => { const got = await A.scout(p, 5, c => isAvatar(c) && A.named(c, MIGRAINE), 'นำ "ไมเกรน" ขึ้นมือ'); got.forEach(c => A.toHand(p, c)); A.shuffleDeck(p); },
    activateLabel: 'ทิ้ง 1: นำอาวุธจากนรกขึ้นมือ',
    canActivate: (A, p) => A.hand(p).length > 0 && A.hell(p).some(c => isWeapon(c.card)),
    activate: async (A, p) => { await A.discard(p, 1); const c = await A.pickFrom(p, A.hell(p), isWeapon, 'นำอาวุธจากนรกขึ้นมือ'); if (c) A.toHand(p, A.takeFrom(A.hell(p), c)); },
  };
  E['KD04-003'] = { // หุ่นนักรบผู้กล้า : ไมเกรน
    onSummon: async (A, p) => { const got = await A.scout(p, 5, isWeapon, 'นำ "อาวุธหุ่นนักรบผู้กล้า" ขึ้นมือ'); got.forEach(c => A.toHand(p, c)); },
    onAnyEquip: async (A, p, self, m) => { if (isWeapon(m.card) && self.drewTurn !== A.state.turn) { self.drewTurn = A.state.turn; A.draw(p, 1); } },
  };
  E['KD04-004'] = { // โปรโตไมเกรน
    onBattleWin: async (A, p, self) => {
      if (!A.deck(p).some(c => c.card.id === 'KD04-003')) return;
      const yes = await A.choose(p, 'ส่งโปรโตไมเกรนลงนรก แล้วอัญเชิญ "หุ่นนักรบผู้กล้า : ไมเกรน" จาก Deck?', [{ label: 'ใช่', value: 1, score: 2 }], true);
      if (!yes) return;
      const eq = A.attached(self);
      await A.sacrifice(p, self);
      const c = A.deck(p).find(c => c.card.id === 'KD04-003');
      if (c) await A.summonFrom(p, A.deck(p), c, { jutti: true });
      A.shuffleDeck(p);
      void eq;
    },
  };
  E['KD04-005'] = { payOnlyFor: c => c.symbol === 'หุ่นยนต์' && c.color === 'red', onPaidAsCost: async (A, p) => A.draw(p, 1) }; // ไดบาเรีย
  E['KD04-006'] = { substitute: (A, p, self, victim) => A.named(victim.card, 'หุ่นนักรบผู้กล้า : ไมเกรน') }; // แอร์ชิด รีฟลักซ์
  E['KD04-007'] = { // เก๊าท์
    onSummon: async (A, p, self) => {
      if (!A.avatars(p).some(a => a !== self && A.isSym(a, 'หุ่นยนต์') && A.named(a.card, 'ผู้กล้า'))) return;
      const d = A.deck(A.opp(p)); if (!d.length) return;
      const top = d.shift();
      if (isAvatar(top.card)) { A.hell(A.opp(p)).push(top); A.log(`เก๊าท์สอดแนม: "${top.card.name}" ถูกส่งลงนรก`); }
      else { d.push(top); A.log(`เก๊าท์สอดแนม: "${top.card.name}" ไปไว้ใต้ Deck`); }
    },
  };
  E['KD04-008'] = { equipPower: 1 };
  E['KD04-010'] = { setPower: (A, p) => A.hand(A.opp(p)).length }; // ลูกคนรวย
  E['KD04-013'] = { magic: true, equipOk: (A, a) => A.isSym(a, 'หุ่นยนต์'), equipPower: (A, a) => (A.named(a.card, 'หุ่นนักรบผู้กล้า') ? 3 : 1) };
  E['KD04-014'] = { // ไบโพล่า ชิลด์
    magic: true, equipOk: (A, a) => A.isSym(a, 'หุ่นยนต์') && A.named(a.card, 'ผู้กล้า'),
    preventLeave: async (A, p, m) => { if (m.usedTurn === A.state.turn) return false; m.usedTurn = A.state.turn; const d = A.dice(); A.log(`ไบโพล่า ชิลด์: ทอยลูกเต๋าได้ ${d}`); return d % 2 === 0; },
  };
  E['KD04-015'] = { magic: true, equipOk: (A, a) => A.isSym(a, 'หุ่นยนต์') };
  E['KD04-017'] = { // Micro Plaza
    magic: true,
    activateLabel: 'ทิ้ง 1: ค้นหาการ์ดสวมใส่จาก Deck',
    canActivate: (A, p) => A.hand(p).length > 0,
    activate: async (A, p) => { await A.discard(p, 1); const c = await A.pickFrom(p, A.deck(p), c => c.magicType === 'modification', 'นำการ์ดสวมใส่จาก Deck ขึ้นมือ'); if (c) A.toHand(p, A.takeFrom(A.deck(p), c)); A.shuffleDeck(p); },
  };
  E['KD04-018'] = prosper;
  E['KD04-019'] = futureMan;
  E['KD04-021'] = lifeScout5; E['KD04-022'] = { life: async (A, p) => A.battleBuff(p) }; E['KD04-023'] = lifeDraw1; E['KD04-024'] = lifeDraw1; E['KD04-025'] = lifeDraw1;

  // ================= BT01 =================
  const scoutToHand = (pred, title) => async (A, p) => { const got = await A.scout(p, 5, pred, title); got.forEach(c => A.toHand(p, c)); };
  const tutor = (pred, title) => async (A, p) => { const c = await A.pickFrom(p, A.deck(p), pred, title, true); if (c) A.toHand(p, A.takeFrom(A.deck(p), c)); A.shuffleDeck(p); };
  const flipOwnLifeOnHell = (A, p) => { A.log('การ์ดตกลงสู่นรก: หงาย LIFE ใบบนสุด 1 ใบ'); A.flipLife(p, 1); };
  const MANKIND = ['แมลง', 'สัตว์', 'รัททาทุย', 'คน'];
  E['BT01-001'] = { // นนทก นิ้วเพชร: declaring an attack on a {เทพ} Avatar destroys it
    onAttack: async (A, p, a, tgt) => {
      if (!tgt || tgt.kind !== 'avatar') return;
      const d = A.avatars(A.opp(p)).find(x => x.uid === tgt.uid);
      if (d && A.isSym(d, 'เทพ')) await A.destroy(d, 'นนทก นิ้วเพชร', p);
    },
  };
  E['BT01-002'] = { continuousSelf: (A, p) => 2 * A.state.players[p].life.filter(l => l.faceUp).length }; // ปื้ด เด็กเปรต
  E['BT01-003'] = { onSummon: scoutToHand(c => c.type === 'magic' && c.magicType === 'land', 'นำ Land Magic 1 ใบขึ้นมือ') }; // พระเวสสุกรรม
  E['BT01-004'] = { continuousSelf: (A, p) => A.avatars(p).filter(x => A.isSym(x, 'เทพ')).length }; // หนุมาน
  E['BT01-005'] = { // อู๊ดลูกเสือ: when attacked, sacrifice another of your Avatars to cancel the attack (reading of the card text)
    onTargeted: async (A, p, self, attacker) => {
      const others = A.avatars(p).filter(x => x !== self);
      if (!others.length) return null;
      const worth = A.power(attacker) >= A.power(self);
      const v = await A.choose(p, `อู๊ดลูกเสือถูกโจมตี: เซ่นไหว้ Avatar อีก 1 ใบ เพื่อยกเลิกการโจมตี?`, others.map(x => A.avOpt(x, worth ? 3 - A.power(x) : -1)), true);
      const s = others.find(x => x.uid === v);
      if (!s) return null;
      await A.sacrifice(p, s);
      return { cancelAttack: true };
    },
  };
  E['BT01-006'] = { onSummon: tutor(c => c.type === 'magic' && c.magicType === 'modification' && (c.name || '').includes('น้ำ'), 'นำ Modification Magic "น้ำ" จาก Deck ขึ้นมือ') }; // ชาวบ้านขายน้ำ
  E['BT01-007'] = { endPhase: async (A, p, a) => A.addPower(a, 1, 'perm') }; // แม่กบ
  E['BT01-008'] = { firstDrawTutor: true }; // รัททาทุย นางพญา
  E['BT01-009'] = { // รัททาทุย พ่อพันธุ์
    onSummon: async (A, p) => {
      if (!A.avatars(p).some(x => x.card.name === 'รัททาทุย นางพญา')) return;
      let budget = 5;
      while (A.roomFor(p) && budget >= 0) {
        const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && A.named(c, 'รัททาทุย') && (c.cost || 0) <= budget, `อัญเชิญ "รัททาทุย" จาก Deck (Cost รวมเหลือ ${budget})`, true);
        if (!c) break;
        budget -= c.card.cost || 0;
        await A.summonFrom(p, A.deck(p), c, { jutti: false });
      }
      A.shuffleDeck(p);
    },
  };
  E['BT01-011'] = { // แมลงปอเลื่อยยนต์
    onSummon: async (A, p) => {
      const ms = A.fieldMagic();
      if (!ms.length) return;
      const v = await A.choose(p, 'ทำลาย Magic บนสนาม 1 ใบ', ms.map(m => A.cardOpt(m, m.owner === p ? -2 : 2)), true);
      const m = ms.find(x => x.uid === v); if (m) A.destroyMagic(m);
    },
  };
  E['BT01-012'] = { lastWill: async (A, p) => { A.unflipLife(p); } }; // ลูกแม่ศรีนวล
  E['BT01-013'] = { lastWill: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && c.symbol === 'สัตว์' && (c.cost || 0) <= 4, 'นำ Avatar {สัตว์} Cost ≤4 จากนรกขึ้นมือ'); if (c) A.toHand(p, A.takeFrom(A.hell(p), c)); } }; // พ่อบุญใหญ่
  E['BT01-015'] = E['KD02-009']; // นายนิรยบาล "เต๋า"
  E['BT01-016'] = { onSummon: scoutToHand(c => A_named(c, 'พญายม') || A_named(c, NIRAYA), 'นำ "พญายม" หรือ "นายนิรยบาล" ขึ้นมือ') }; // สุวรรณ
  E['BT01-017'] = { // ทศกัณฐ์: take an opponent's Avatar, rested
    onSummon: async (A, p) => {
      if (!A.roomFor(p) || !A.avatars(A.opp(p)).length) return;
      const v = await A.choose(p, 'ยึด Avatar ของอีกฝ่ายมาไว้ฝ่ายเรา (สภาพนอน)', bestOppAvatar(A, p), true);
      const a = A.avatars(A.opp(p)).find(x => x.uid === v); if (a) A.takeControl(a, p, true);
    },
  };
  E['BT01-018'] = { onMilled: async (A, p, c) => { A.takeFrom(A.hell(p), c); A.deck(p).push(c); A.shuffleDeck(p); A.log(`"${c.card.name}" กลับเข้า Deck แล้วสับ`); } }; // นีโม่
  E['BT01-019'] = { onSummon: scoutToHand(c => A_named(c, 'สิมพลีนรก'), 'นำ "สิมพลีนรก" ขึ้นมือ') }; // ยมทูต
  E['BT01-020'] = { // ศาลพระภูมิ
    onSummon: async (A, p) => { if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && c.symbol === 'ผี', 'อัญเชิญ Avatar {ผี} จาก Deck', true); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p); },
    untargetable: (A, x) => A.avatars(x.owner).some(o => o !== x && A.isSym(o, 'ผี')),
  };
  E['BT01-021'] = { onSummon: tutor(c => A_named(c, 'ตำรวจสัมภเวสี'), 'นำ "ตำรวจสัมภเวสี" จาก Deck ขึ้นมือ') }; // สารวัตร ตำรวจสัมภเวสี
  E['BT01-035'] = { magic: async (A, p, self) => { await A.mill(p, 3, self); if (A.state.winner == null) await A.mill(A.opp(p), 3, self); } }; // ประมาทร่วม
  E['BT01-036'] = { // เมตตาระยะยาว
    canUse: (A, p) => A.avatars(A.opp(p)).length > 0,
    magic: async (A, p) => { for (const a of A.avatars(A.opp(p)).slice()) await A.destroy(a, 'เมตตาระยะยาว', p); },
  };
  E['BT01-037'] = { // เพื่อลูกค้า
    canUse: (A, p) => A.avatars(p).some(a => A.isSym(a, 'สัตว์')),
    magic: async (A, p) => {
      const v = await A.choose(p, 'เซ่นไหว้ Avatar {สัตว์} 1 ใบ', A.avatars(p).filter(a => A.isSym(a, 'สัตว์')).map(x => A.avOpt(x, 5 - A.power(x))));
      const a = A.avatars(p).find(x => x.uid === v); if (!a) return;
      await A.sacrifice(p, a);
      A.draw(p, 3);
      A.restrictSummon(p, 'สัตว์'); A.log('เทิร์นนี้อัญเชิญได้แค่ Avatar {สัตว์}');
    },
  };
  E['BT01-038'] = prosper;
  E['BT01-039'] = { // เจ้ากล้าดียังไง
    react: { on: 'attack', botScore: (A, p, ctx) => (A.power(ctx.attacker) >= 3 || ctx.target.kind === 'life' ? 3 : 1), run: async (A, p, ctx) => { A.sendToHell(ctx.attacker); return { cancelAttack: true }; } },
  };
  E['BT01-040'] = { // หมอมาแล้วววว
    react: { on: 'destroy', when: (A, p, ctx) => ctx.avatar.owner === p, botScore: (A, p, ctx) => (A.power(ctx.avatar) >= 4 || (ctx.avatar.card.cost || 0) >= 4 ? 3 : -1), run: async () => ({ prevent: true }) },
  };
  E['BT01-041'] = futureMan;
  E['BT01-042'] = { // ริกกี้ นักปลอมแปลง: take a rested enemy Avatar; this card stays on it as Modification Magic
    react: {
      on: 'battleDestroyed',
      when: (A, p, ctx) => ctx.avatar.owner === p && A.roomFor(p) && A.avatars(A.opp(p)).some(x => x.rested),
      botScore: () => 3,
      run: async (A, p, ctx, inst) => {
        const can = A.avatars(A.opp(p)).filter(x => x.rested);
        const v = await A.choose(p, 'ยึด Avatar สภาพนอนของอีกฝ่าย', can.map(x => A.avOpt(x, A.power(x))));
        const a = can.find(x => x.uid === v); if (!a || !A.takeControl(a, p, false)) return;
        A.takeFrom(A.hell(p), inst);
        await A.attach(p, inst, a);
      },
    },
    onHell: (A, p, m, host) => { if (host && A.onField(host)) { A.bounce(host); } },
  };
  E['BT01-043'] = { magic: true, wakeAtEnd: true }; // น้ำชูกำลัง
  E['BT01-044'] = { magic: true, equipKw: ['โล่มนุษย์'] }; // รั้วของชาติ
  E['BT01-045'] = { magic: true, equipPower: 2, onHell: flipOwnLifeOnHell }; // ตีแม่
  E['BT01-046'] = { // ตีพ่อ
    magic: true, onHell: flipOwnLifeOnHell,
    onEquippedBattleWin: async (A, p, m, a) => { if (m.woke) return; m.woke = true; a.rested = false; A.log(`${a.card.name} กลับมาสภาพตื่น (ตีพ่อ)`); },
  };
  E['BT01-047'] = { magic: true, onAnyAttack: async (A, p, a) => { A.log('เขาไกรลาสเอียง: ฝ่ายที่โจมตี ธรณีสูบ 2'); await A.mill(p, 2); } }; // เขาไกรลาสเอียง
  E['BT01-048'] = { magic: true, aura: (A, owner, src, a) => (MANKIND.includes(A.symbol(a)) ? 1 : 0) }; // ทุ่งนาแดนนี้
  E['BT01-049'] = { magic: true, oneAttackPerTurn: true, lifetime: 4 }; // มวยทะเลลลลลล
  E['BT01-050'] = { // โรงบาล
    magic: true,
    activateLabel: 'ทิ้ง 1: นำ Avatar Cost ≤3 จากนรกขึ้นมือ',
    canActivate: (A, p) => A.hand(p).length > 0 && A.hell(p).some(c => isAvatar(c.card) && (c.card.cost || 0) <= 3),
    activate: async (A, p) => {
      await A.discard(p, 1);
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && (c.cost || 0) <= 3, 'นำ Avatar Cost ≤3 จากนรกขึ้นมือ');
      if (!c) return;
      A.toHand(p, A.takeFrom(A.hell(p), c));
      A.lockNames(p, [c.card.name]); A.log(`เทิร์นนี้ "${c.card.name}" อัญเชิญและใช้ความสามารถไม่ได้`);
    },
  };
  E['BT01-051'] = lifeDraw1; E['BT01-052'] = lifeDraw1; E['BT01-053'] = lifeDraw1; E['BT01-054'] = lifeDraw1; E['BT01-055'] = lifeDraw1;

  // ================= BT02 =================
  const onceTurn = (a, A) => { if (a.onceTurn === A.state.turn) return false; a.onceTurn = A.state.turn; return true; };
  const askYes = (A, p, title, score) => A.choose(p, title, [{ label: 'ใช้', value: 1, score: score == null ? 1 : score }], true);
  const destroyFieldMagic = async (A, p) => {
    const ms = A.fieldMagic(); if (!ms.length) return;
    const v = await A.choose(p, 'ทำลาย Magic บนสนาม 1 ใบ', ms.map(m => A.cardOpt(m, m.owner === p ? -2 : 2)), true);
    const m = ms.find(x => x.uid === v); if (m) A.destroyMagic(m);
  };
  const equipSelfTo = (word, label) => ({
    activateLabel: label,
    canActivate: (A, p, a) => A.avatars(p).some(x => x !== a && A.named(x.card, word)),
    activate: async (A, p, a) => {
      const t = await A.choose(p, `สวมใส่ "${a.card.name}" ให้ใบไหน`, A.avatars(p).filter(x => x !== a && A.named(x.card, word)).map(x => A.avOpt(x, A.power(x))));
      const target = A.avatars(p).find(x => x.uid === t); if (!target) return;
      const pl = A.state.players[p]; pl.avatars.splice(pl.avatars.indexOf(a), 1);
      await A.attach(p, a, target);
    },
  });
  E['BT02-001'] = { // บุญลือ วีรบุรุษเปรต
    onSummon: async (A, p) => { A.flipLife(p, 1); },
    continuousSelf: A => A.state.players.reduce((n, pl) => n + pl.life.filter(l => l.faceUp).length, 0),
  };
  E['BT02-002'] = { onPaidAsCost: async (A, p, pc, s) => { if (s.card.symbol === 'เปรต') { s.noDestroyTurn = A.state.turn; A.log(`${s.card.name} จะไม่ถูกทำลายในเทิร์นนี้`); } } }; // วันชัย พ่อบุญลือ
  E['BT02-003'] = { onPaidAsCost: async (A, p, pc, s) => { if (s.card.symbol === 'เปรต') { A.draw(p, 1); await A.discard(p, 1); } } }; // กัญญา แม่บุญลือ
  E['BT02-004'] = { // พี่เช 10 ล้อท่าอิฐ
    onAttack: async (A, p, a) => {
      if (!A.hand(p).length || a.onceTurn === A.state.turn) return;
      if (!await askYes(A, p, `${a.card.name}: ทิ้งการ์ด 1 ใบ เพื่อ POWER +2?`, A.hand(p).length >= 3 ? 1 : -1)) return;
      onceTurn(a, A); await A.discard(p, 1); A.addPower(a, 2, 'endTurn');
    },
  };
  E['BT02-005'] = { // ตำรวจไซบอร์ค จ่าคอป
    onAttack: async (A, p, a) => {
      if (!A.hand(p).length || a.onceTurn === A.state.turn) return;
      if (!await askYes(A, p, `${a.card.name}: ทิ้งการ์ด 1 ใบ เพื่อสอดแนม 3 หาการ์ด {หุ่นยนต์}?`, A.hand(p).length >= 3 ? 1 : -1)) return;
      onceTurn(a, A); await A.discard(p, 1);
      const got = await A.scout(p, 3, c => c.symbol === 'หุ่นยนต์', 'นำการ์ด {หุ่นยนต์} ขึ้นมือ'); got.forEach(c => A.toHand(p, c));
    },
  };
  E['BT02-007'] = { // อ๊บ
    onSummon: async (A, p, self) => {
      const others = A.avatars(p).filter(x => x !== self); if (!others.length) return;
      const v = await A.choose(p, 'อ๊บ: เซ่นไหว้ Avatar ใบอื่นของเรา 1 ใบ?', others.map(x => A.avOpt(x, -1)), true);
      const s = others.find(x => x.uid === v); if (s) await A.sacrifice(p, s);
    },
  };
  E['BT02-008'] = E['KD01-008']; // พระพรหม
  E['BT02-009'] = E['KD03-003']; // มีมมิจัง ไอดอลหน้าใหม่
  E['BT02-010'] = Object.assign(otaEquipSelf(), { guardHost: (A, host) => A.named(host.card, IDOL) }); // โอตะ รุ่นก่อตั้ง (option 1 + substitute)
  E['BT02-011'] = { onSummon: tutor(c => isAvatar(c) && ['ลูกแม่ศรีนวล', 'พ่อบุญใหญ่'].includes(c.name), 'นำ "ลูกแม่ศรีนวล" หรือ "พ่อบุญใหญ่" จาก Deck ขึ้นมือ') }; // แม่ศรีนวล
  E['BT02-012'] = { // แมลงปอแจ็ค
    onSummon: async (A, p) => {
      if (A.state.land) A.destroyMagic(A.state.land);
      const c = await A.pickFrom(p, A.deck(p), c => c.type === 'magic' && c.magicType === 'land', 'นำ Land Magic จาก Deck มาเล่น', true);
      if (c) await A.placeLand(p, A.takeFrom(A.deck(p), c));
      A.shuffleDeck(p);
    },
  };
  E['BT02-013'] = { lastWill: destroyFieldMagic }; // แมลงปอ เปื้อนรังสี
  E['BT02-014'] = { aura: (A, owner, src, a) => (a.owner === owner && ['กุ่ย', 'ฮอล', 'นาย'].some(w => A.named(a.card, w)) ? 1 : 0) }; // ซันนี่
  E['BT02-015'] = { // เอเลี่ยนแสงสีฟ้า
    onSummon: async (A, p, self) => {
      if (!A.hand(p).length || !A.avatars(A.opp(p)).length) return;
      const v = await A.choose(p, 'ทิ้งการ์ด 1 ใบ แล้วเลือก Avatar อีกฝ่ายเพื่อทอยเหรียญ?', bestOppAvatar(A, p), true);
      const t = A.avatars(A.opp(p)).find(x => x.uid === v); if (!t) return;
      await A.discard(p, 1);
      const heads = A.rand(2) === 0;
      A.log(`ทอยเหรียญ: ${heads ? 'หัว' : 'ก้อย'}`);
      if (heads) await A.destroy(t, 'เอเลี่ยนแสงสีฟ้า', p); else await A.destroy(self, 'เอเลี่ยนแสงสีฟ้า (ก้อย)');
    },
  };
  E['BT02-016'] = { // ฤษี โคบุตร
    onAnyMagic: async (A, p, self, m) => {
      if (m.card.symbol !== 'ฤษี') return;
      const all = A.avatars(p).concat(A.avatars(A.opp(p)));
      const v = await A.choose(p, 'ฤษี โคบุตร: เลือก Avatar POWER +1', all.map(x => A.avOpt(x, x.owner === p ? A.power(x) : -1)));
      const a = all.find(x => x.uid === v); if (a) A.addPower(a, 1, 'endTurn');
    },
  };
  E['BT02-017'] = { endPhase: async (A, p, a) => A.toDeckBottom(a) }; // แรงงานทาสออฟฟิศ
  E['BT02-018'] = { // ธอร์: after winning a battle, destroy an enemy Avatar whose POWER equals the difference
    onBattleWin: async (A, p, a, info) => {
      const x = (info.power || 0) - (info.loserPower || 0);
      const can = A.avatars(A.opp(p)).filter(d => A.power(d) === x);
      if (!can.length) return;
      const v = await A.choose(p, `ธอร์: ทำลาย Avatar อีกฝ่ายที่ POWER ${x}`, can.map(d => A.avOpt(d, 1)));
      const d = can.find(y => y.uid === v); if (d) await A.destroy(d, 'ธอร์', p);
    },
  };
  E['BT02-019'] = { // โอดิน
    onSummon: async (A, p, self) => {
      if (A.deck(p).length <= 9) return;
      if (!await askYes(A, p, 'โอดิน: ธรณีสูบ 9 ใบ เพื่อนำ Avatar {เทพ} จาก Deck ขึ้นมือ?', A.deck(p).length > 25 ? 1 : -1)) return;
      await A.mill(p, 9, self);
      if (A.state.winner == null) await tutor(c => isAvatar(c) && c.symbol === 'เทพ', 'นำ Avatar {เทพ} จาก Deck ขึ้นมือ')(A, p);
    },
  };
  E['BT02-020'] = { mainStart: async (A, p, a) => { const n = A.attached(a).length; if (n) A.draw(p, n); } }; // นินจินแมน
  E['BT02-021'] = { // กัปตัน ไกร
    onSummon: async (A, p) => {
      if (!A.avatars(A.opp(p)).length) return;
      const v = await A.choose(p, 'ทิ้งการ์ดทั้งหมดบนมือ เพื่อนำ Avatar อีกฝ่ายกลับขึ้นมือ?', bestOppAvatar(A, p).map(o => Object.assign(o, { score: A.hand(p).length <= 2 ? o.score : -1 })), true);
      const t = A.avatars(A.opp(p)).find(x => x.uid === v); if (!t) return;
      const pl = A.state.players[p]; const n = pl.hand.length; pl.hell.push(...pl.hand.splice(0)); A.log(`${pl.name} ทิ้งการ์ดทั้งหมด ${n} ใบ`);
      A.bounce(t);
    },
  };
  E['BT02-022'] = { // แบงค์ ผู้รู้ความจริง: look at the top 3 and put them back in any order
    onSummon: async (A, p) => {
      const d = A.deck(p); const top = d.splice(0, Math.min(3, d.length)); const order = [];
      while (top.length > 1) {
        const v = await A.choose(p, `เรียงการ์ด: เลือกใบที่ ${order.length + 1} จากบน`, top.map(c => A.cardOpt(c)));
        order.push(top.splice(Math.max(0, top.findIndex(c => c.uid === v)), 1)[0]);
      }
      d.unshift(...order, ...top);
    },
  };
  E['BT02-023'] = { oppChoosesTarget: true }; // 40ดีกรีแมน
  E['BT02-024'] = { cannotAttack: () => true, extraDraw: true }; // เสามงคล
  E['BT02-025'] = { onSummon: tutor(c => isAvatar(c) && c.name === 'เสามงคล', 'นำ "เสามงคล" จาก Deck ขึ้นมือ') }; // ซินแส
  E['BT02-026'] = { // ชุ่ย โจรสุสาน: each player returns 5 cards from the other's hell to that player's deck
    onSummon: async (A, p) => {
      for (const q of [p, A.opp(p)]) {
        const o = A.opp(q), hell = A.hell(o);
        for (let k = 0; k < 5 && hell.length; k++) {
          const c = await A.pickFrom(q, hell, () => true, `เลือกการ์ดในนรกของอีกฝ่ายกลับเข้า Deck (${k + 1}/5)`);
          if (c) A.deck(o).push(A.takeFrom(hell, c));
        }
        A.shuffleDeck(o);
      }
      A.log('ทั้งสองฝ่ายนำการ์ดจากนรกกลับเข้า Deck แล้วสับ');
    },
  };
  E['BT02-027'] = { onSurviveAttack: async (A, p) => { A.unflipLifeRandom(p); } }; // พยาบาล เอ๋
  E['BT02-028'] = Object.assign(equipSelfTo('รถถัง', 'สวมใส่ให้ "รถถัง"'), { equipPower: (A, a) => (A.named(a.card, 'รถถัง') ? 2 : 0) }); // สตีฟ Tank Ranger
  E['BT02-029'] = { cannotAttack: (A, a) => !A.attached(a).some(m => m.card.type === 'avatar') }; // รถถัง B66
  E['BT02-042'] = { // ประชามติ
    canUse: (A, p) => A.avatars(p).length > 0,
    magic: async (A, p) => {
      A.avatars(p).forEach(a => A.rest(a));
      const x = A.avatars(p).reduce((n, a) => n + A.power(a), 0);
      A.log(`ประชามติ: POWER รวมของ Avatar ที่นอนอยู่ = ${x}`);
      const all = A.avatars(A.opp(p)).concat(A.avatars(p)).filter(a => A.power(a) < x);
      const v = await A.choose(p, `ทำลาย Avatar ที่ POWER ต่ำกว่า ${x}`, all.map(a => A.avOpt(a, a.owner === p ? -5 : A.power(a))));
      const a = all.find(y => y.uid === v); if (a) await A.destroy(a, 'ประชามติ', p);
    },
  };
  const RPS = ['ค้อน', 'กรรไกร', 'กระดาษ'];
  E['BT02-043'] = { // ฉุบสั่งตาย
    canUse: (A, p) => A.avatars(0).length + A.avatars(1).length > 0,
    magic: async (A, p) => {
      let w = null;
      for (let round = 0; round < 10 && w == null; round++) {
        const pick = async q => A.choose(q, 'เป่ายิ้งฉุบ!', RPS.map((r, i) => ({ label: r, value: i, score: A.rand(100) })));
        const a = await pick(p), b = await pick(A.opp(p));
        A.log(`เป่ายิ้งฉุบ: ${RPS[a]} vs ${RPS[b]}`);
        if (a !== b) w = (a + 1) % 3 === b ? p : A.opp(p);
      }
      if (w == null) return;
      A.log(`${A.state.players[w].name} ชนะ`);
      const all = A.avatars(A.opp(w)).concat(A.avatars(w));
      const v = await A.choose(w, 'ผู้ชนะ: เลือกทำลาย Avatar 1 ใบ', all.map(a => A.avOpt(a, a.owner === w ? -5 : A.power(a))));
      const a = all.find(y => y.uid === v); if (a) await A.destroy(a, 'ฉุบสั่งตาย', w);
    },
  };
  E['BT02-044'] = { // ด่านลอย
    canUse: (A, p) => A.hand(A.opp(p)).length > 0,
    magic: async (A, p) => {
      const n = await A.choose(p, 'เลือกค่า Cost (0-9)', Array.from({ length: 10 }, (_, i) => ({ label: `Cost ${i}`, value: i, score: i === 3 ? 1 : 0 })));
      const h = A.hand(A.opp(p)); const c = h[A.rand(h.length)];
      A.log(`ด่านลอย: สุ่มได้ "${c.card.name}"`);
      if (isAvatar(c.card) && (c.card.cost || 0) === n) { A.hell(A.opp(p)).push(A.takeFrom(h, c)); A.log(`"${c.card.name}" ถูกส่งลงนรก`); }
    },
  };
  E['BT02-045'] = E['KD01-014']; // ความกล้าหาญ
  E['BT02-046'] = E['KD02-015']; // ร้อนมากก็เปิดหน้าต่างสิว๊ากกกก
  E['BT02-047'] = { // แมลงปอทอด
    canUse: (A, p) => A.avatars(p).some(a => A.isSym(a, 'แมลง')),
    magic: async (A, p) => {
      const v = await A.choose(p, 'เซ่นไหว้ Avatar {แมลง} 1 ใบ', A.avatars(p).filter(a => A.isSym(a, 'แมลง')).map(x => A.avOpt(x, 5 - A.power(x))));
      const a = A.avatars(p).find(x => x.uid === v); if (!a) return;
      await A.sacrifice(p, a); A.draw(p, 3);
      A.restrictAttack(p, 'แมลง'); A.log('เทิร์นนี้สั่งโจมตีได้แค่ Avatar {แมลง}');
    },
  };
  E['BT02-048'] = { // กระแสอัปมงคล
    canUse: (A, p) => A.avatars(A.opp(p)).length > 0,
    magic: async (A, p) => { A.avatars(A.opp(p)).forEach(a => { a.lostAbilities = true; }); A.log('ความสามารถของ Avatar อีกฝ่ายไร้ผลจนจบเทิร์น'); },
  };
  E['BT02-049'] = { // กระแสสิริมงคล: draw 1 for this attack and every later attack this turn
    react: { on: 'attack', botScore: () => 2, run: async (A, p) => { A.draw(p, 1); A.state.players[p].drawOnOppAttack = A.state.turn; } },
  };
  E['BT02-051'] = { // ถวาย
    react: { on: 'destroy', when: (A, p, ctx) => ctx.avatar.owner === p, botScore: (A, p, ctx) => (A.hand(p).length <= 2 && A.power(ctx.avatar) >= 4 ? 2 : -1), run: async (A, p) => { const pl = A.state.players[p]; pl.hell.push(...pl.hand.splice(0)); A.log(`${pl.name} ทิ้งการ์ดทั้งหมดบนมือ`); return { prevent: true }; } },
  };
  E['BT02-052'] = { // เอากล้วยมานี่ย์ !!!!!!
    react: {
      on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'avatar', botScore: (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); return d && A.power(ctx.attacker) - 2 < A.power(d) && A.power(ctx.attacker) >= A.power(d) ? 3 : -1; },
      run: async (A, p, ctx) => { const v = await A.choose(p, 'เลือก Avatar อีกฝ่าย POWER -2', A.avatars(A.opp(p)).map(x => A.avOpt(x, x === ctx.attacker ? 5 : 0))); const a = A.avatars(A.opp(p)).find(x => x.uid === v); if (a) A.addPower(a, -2, 'endTurn'); },
    },
  };
  E['BT02-053'] = { // ฟ้องครู
    react: {
      on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'avatar' && A.avatars(p).length > 1,
      botScore: (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); return d && A.power(ctx.attacker) >= A.power(d) ? 2 : -1; },
      run: async (A, p, ctx) => {
        const d = A.avatars(p).find(x => x.uid === ctx.target.uid); if (!d) return;
        const others = A.avatars(p).filter(x => x !== d);
        const v = await A.choose(p, `เพิ่ม POWER ให้ ${d.card.name} จาก Avatar ใบไหน`, others.map(x => A.avOpt(x, A.power(x))));
        const s = others.find(x => x.uid === v); if (s) A.addPower(d, A.power(s), 'endTurn');
      },
    },
  };
  E['BT02-054'] = E['KD01-018']; // ไปเลยมอนตี้
  E['BT02-055'] = { magic: true, battleShield: true, afterAttacked: true }; // ประกันชั้นต่ำ
  E['BT02-056'] = { magic: true, equipPower: 2, silenceHost: true, onEquip: async (A, p, m, host) => { host.lostAbilities = true; } }; // ขวานเงิน
  E['BT02-057'] = { magic: true, onEquippedBattleWin: async (A, p, m, a) => { A.flipLife(A.opp(p), 1); } }; // ช็อตกัน นัยนาวุธ
  E['BT02-058'] = E['KD02-020']; // ประตูนรก
  E['BT02-059'] = { magic: true, grantKw: (A, a) => (A.isSym(a, 'แมลง') ? ['สามัคคี'] : []) }; // เทศกาลแมลงปอบุก
  E['BT02-060'] = { // แอสการ์ดคือสถานที่ไม่ใช่ผู้คน
    magic: true, allSymbol: 'เทพ',
    activateLabel: 'ทิ้ง 1: ยืม Avatar สภาพนอนของอีกฝ่าย (Cost ≤3) จนจบเทิร์น',
    canActivate: (A, p) => A.hand(p).length > 0 && A.roomFor(p) && A.avatars(A.opp(p)).some(a => a.rested && (a.card.cost || 0) <= 3),
    activate: async (A, p) => {
      await A.discard(p, 1);
      const can = A.avatars(A.opp(p)).filter(a => a.rested && (a.card.cost || 0) <= 3);
      const v = await A.choose(p, 'เลือก Avatar ที่จะยืมมา', can.map(a => A.avOpt(a, A.power(a))));
      const a = can.find(x => x.uid === v); if (a && A.takeControl(a, p, true)) a.returnAtEnd = true;
    },
  };

  // ================= BT03 =================
  const declareDestroy = sym => async (A, p, a, tgt) => { // "when this declares an attack on a {sym} Avatar: destroy it"
    if (!tgt || tgt.kind !== 'avatar') return;
    const d = A.avatars(A.opp(p)).find(x => x.uid === tgt.uid);
    if (d && A.isSym(d, sym)) await A.destroy(d, 'ความสามารถการ์ด', p);
  };
  const KAPOM = 'กะปอม', RAT = 'รัททาทุย', NIKOLAI = 'ราชาอาณาจักรของแพง';
  const lookTop = async (A, p, n, pred, title, then) => { // look at top n, pick one matching card, rest back into the deck and shuffle
    const d = A.deck(p); const seen = d.splice(0, Math.min(n, d.length));
    A.log(`${A.state.players[p].name} สอดแนม ${seen.length} ใบ`);
    const v = await A.choose(p, title, seen.filter(c => pred(c.card)).map(c => A.cardOpt(c)), true);
    const c = seen.find(x => x.uid === v);
    if (c) seen.splice(seen.indexOf(c), 1);
    d.push(...seen); A.shuffleDeck(p);
    if (c) await then(c);
    return c;
  };
  const allSymbols = () => [...new Set((root.TC_CARDS || []).filter(c => c.type === 'avatar' && c.symbol).map(c => c.symbol))];
  E['BT03-001'] = E['KD01-004']; // พระลักษมี
  E['BT03-002'] = { onAttack: async (A, p) => { A.blockReact(A.opp(p)); A.log('อีกฝ่ายใช้ React Magic ไม่ได้จนจบการต่อสู้'); } }; // นางอัปสร (also named พระนารายณ์)
  E['BT03-003'] = { // อินทรีย์แมน
    onSummon: async (A, p, self) => {
      const c = await A.pickFrom(p, A.deck(p), c => c.type === 'magic' && c.magicType === 'modification' && (!E[c.id] || !E[c.id].equipOk || E[c.id].equipOk(A, self)), 'สวมใส่ Modification Magic จาก Deck ให้อินทรีย์แมน', true);
      if (c) await A.attach(p, A.takeFrom(A.deck(p), c), self);
      A.shuffleDeck(p);
    },
    continuousSelf: A => A.state.players.reduce((n, pl) => n + pl.magicZone.filter(m => m.card.type === 'magic' && m.card.magicType === 'modification').length, 0),
  };
  E['BT03-004'] = E['KD04-003']; E['BT03-005'] = E['KD04-007']; E['BT03-006'] = E['KD04-005']; E['BT03-007'] = E['KD04-006'];
  E['BT03-008'] = { onBattleWin: async (A, p, a) => A.addPower(a, 1, 'perm') }; // กาฬสินธุ์แมน
  E['BT03-009'] = { cannotAttack: (A, a) => A.hand(a.owner).length > 0 }; // จีสัส
  E['BT03-010'] = { // ไดโนกาฬสินธุ์ - ภูเวียงสิรินเน
    onSummon: async (A, p, self) => {
      let n = 0;
      for (; n < 4; n++) {
        const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && c.symbol === KAPOM && (c.cost || 0) <= 3, `นำ Avatar {กะปอม} Cost ≤3 จากนรกกลับเข้า Deck (${n + 1}/4)`, true);
        if (!c) break;
        A.deck(p).push(A.takeFrom(A.hell(p), c));
      }
      A.shuffleDeck(p); A.draw(p, 1);
      if (n && A.onField(self)) A.addPower(self, n, 'endTurn');
    },
  };
  E['BT03-011'] = { onSummon: async (A, p) => { if (A.roomFor(p)) await lookTop(A, p, 5, c => isAvatar(c) && c.symbol === KAPOM && (c.cost || 0) <= 3, 'อัญเชิญ Avatar {กะปอม} Cost ≤3', c => A.summonFrom(p, [], c, { jutti: false })); } }; // กินรีมิมัส
  E['BT03-012'] = { // อิสานโนซอรัส
    payOnlyFor: c => c.symbol === KAPOM,
    onPaidAsCost: async (A, p) => {
      const d = A.deck(p); if (!d.length) return;
      const v = await A.choose(p, `สอดแนม: "${d[0].card.name}" — วางไว้ที่ไหน`, [{ label: 'ไว้บนสุดเหมือนเดิม', value: 0, score: A.cardOpt(d[0]).score > 4 ? 1 : 0 }, { label: 'ไว้ใต้ Deck', value: 1, score: 0.5 }]);
      if (v === 1) d.push(d.shift());
    },
  };
  E['BT03-013'] = { aura: (A, owner, src, a) => (a.owner === owner && A.isSym(a, KAPOM) ? 1 : 0) }; // สัตยาซอรัส
  E['BT03-014'] = E['KD03-008']; // โอตะปุส
  E['BT03-015'] = { // ตุ๊กตารัททาทุย
    payOnlyFor: c => c.symbol === RAT,
    onPaidAsCost: async (A, p, pc, s) => {
      if (!A.named(s.card, RAT) || !A.roomFor(p)) return;
      const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && c.symbol === RAT && c.cost === 1 && A.gem(c) === 1 && c.power === 1, 'อัญเชิญรัททาทุย (Cost 1 GEM 1 POWER 1) จาก Deck', true);
      if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false });
      A.shuffleDeck(p);
    },
  };
  E['BT03-016'] = { aura: (A, owner, src, a) => (a.owner === owner && A.isSym(a, RAT) ? 1 : 0) }; // รัททาทุยแม่วัว
  E['BT03-017'] = { continuousSelf: (A, p) => A.avatars(p).filter(x => A.isSym(x, RAT)).length }; // มนุษย์รัททาทุย
  E['BT03-018'] = { onAttack: declareDestroy('หุ่นยนต์') }; // จ่างู
  E['BT03-019'] = { // ด็อคเตอร์แบงค์
    onSummon: async (A, p) => {
      const shrines = A.avatars(p).filter(a => a.card.name === 'ศาลพระภูมิ');
      if (!shrines.length || !A.hell(p).some(c => isAvatar(c.card) && c.card.symbol === 'ผี')) return;
      const v = await A.choose(p, 'ทำลาย "ศาลพระภูมิ" เพื่ออัญเชิญ Avatar {ผี} จากนรก?', shrines.map(x => A.avOpt(x, 1)), true);
      const sh = shrines.find(x => x.uid === v); if (!sh) return;
      await A.destroy(sh, 'ด็อคเตอร์แบงค์');
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && c.symbol === 'ผี' && c.name !== 'ศาลพระภูมิ', 'อัญเชิญ Avatar {ผี} จากนรก');
      if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false });
    },
  };
  E['BT03-020'] = { // แดรกคูลา
    onSummon: async (A, p, self) => { self.revives = true; A.log('แดรกคูลาได้รับ: ถูกทำลายแล้วฟื้นใน Battle Phase เทิร์นถัดไปของเรา'); },
    lastWill: async (A, p, self) => { if (self.revives) { self.revives = false; A.queueRevive(p, self); } },
  };
  E['BT03-021'] = { // อีแป๋ม ผีกระสือ RGB
    lastWill: async (A, p, self) => {
      if (!A.avatars(A.opp(p)).length || !A.hell(p).includes(self)) return;
      const v = await A.choose(p, 'สวมอีแป๋มให้ Avatar อีกฝ่าย (Symbol {ผี}, POWER -2)', bestOppAvatar(A, p));
      const t = A.avatars(A.opp(p)).find(x => x.uid === v); if (!t) return;
      await A.attach(p, A.takeFrom(A.hell(p), self), t);
    },
    equipPower: -2, equipSymbol: 'ผี',
  };
  E['BT03-022'] = { // แม่นาค พระประแดง
    onEnter: async (A, p) => {
      const c = await A.pickFrom(p, A.hell(A.opp(p)), () => true, 'นำการ์ดในนรกอีกฝ่ายกลับใต้ Deck อีกฝ่าย', true);
      if (!c) return;
      A.deck(A.opp(p)).push(A.takeFrom(A.hell(A.opp(p)), c));
      if (!A.avatars(A.opp(p)).length) return;
      const v = await A.choose(p, 'เลือก Avatar อีกฝ่าย POWER -2', bestOppAvatar(A, p));
      const a = A.avatars(A.opp(p)).find(x => x.uid === v); if (a) A.addPower(a, -2, 'endTurn');
    },
  };
  E['BT03-023'] = { // โลกิ
    anyEndPhase: async (A, p, a) => { A.log('โลกิย้ายข้างสนาม'); A.takeControl(a, A.opp(p), false); },
    cannotAttack: (A, a) => !!a.controlChanged,
  };
  E['BT03-024'] = { // บัลเดอร์
    preventDestroy: async (A, p, a) => {
      if (a.onceTurn === A.state.turn || A.deck(p).length <= 9) return false;
      if (!await askYes(A, p, 'บัลเดอร์: ธรณีสูบ 9 ใบ แทนการถูกทำลาย?', A.deck(p).length > 25 ? 1 : -1)) return false;
      a.onceTurn = A.state.turn; await A.mill(p, 9, a); return A.state.winner == null;
    },
  };
  E['BT03-025'] = { revealTop: true }; // ฮามดัล (shown by the UI)
  E['BT03-026'] = E['KD03-004']; // แบมบูจัง ไอดอลสองขั้ว
  E['BT03-027'] = { // แมลงปอมีพิษ
    lastWill: async (A, p) => {
      const all = A.avatars(A.opp(p)).concat(A.avatars(p)).filter(a => A.cost(a) <= 4);
      if (!all.length) return;
      const v = await A.choose(p, 'ทำลาย Avatar Cost ≤4 บนสนาม 1 ใบ', all.map(a => A.avOpt(a, a.owner === p ? -5 : A.power(a))));
      const a = all.find(x => x.uid === v); if (a) await A.destroy(a, 'แมลงปอมีพิษ', p);
    },
  };
  E['BT03-028'] = { preventDestroy: async (A, p, a) => { const f = A.battleFoe(a); if (f && A.cost(f) < A.cost(a)) { A.log(`${a.card.name} ไม่ถูกทำลายจากการต่อสู้กับ Avatar ที่ Cost น้อยกว่า`); return true; } return false; } }; // นิโคไล
  E['BT03-029'] = { // ทหารอาณาจักรของแพง
    costAura: (A, owner, src, a) => (a.owner !== owner ? -1 : 0),
    setPower: (A, p) => (A.avatars(p).some(a => A.named(a.card, NIKOLAI)) ? 2 : 0),
  };
  E['BT03-030'] = { // ช่างตัดเสื้อ
    onSummon: async (A, p) => {
      const ks = A.avatars(p).filter(a => A.named(a.card, NIKOLAI)); if (!ks.length) return;
      const v = await A.choose(p, 'เลือก "พระเจ้านิโคไล": Cost +1 และ POWER +1', ks.map(x => A.avOpt(x, 1)));
      const k = ks.find(x => x.uid === v); if (!k) return;
      k.costMod = (k.costMod || 0) + 1; A.addPower(k, 1, 'perm');
    },
  };
  E['BT03-031'] = { // จอมเวทย์ดอคู่
    activateLabel: 'ทำลาย Modification Magic 1 ใบ',
    canActivate: A => A.state.players.some(pl => pl.magicZone.length),
    activate: async (A, p) => {
      const ms = A.fieldMagic().filter(m => m !== A.state.land);
      const v = await A.choose(p, 'ทำลาย Modification Magic 1 ใบ', ms.map(m => A.cardOpt(m, m.owner === p ? -2 : 2)));
      const m = ms.find(x => x.uid === v); if (m) A.destroyMagic(m);
    },
  };
  E['BT03-032'] = { extraSymbol: 'แมลง', continuousSelf: A => A.avatars(0).concat(A.avatars(1)).filter(x => A.isSym(x, 'แมลง')).length }; // ตั๊กแตนพันธ์ุ X
  E['BT03-033'] = { // แมลงปอ บรรพบุรุษ
    lastWill: async (A, p) => {
      if (!A.roomFor(p)) return;
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && c.symbol === 'แมลง' && (c.cost || 0) <= 4 && c.name !== 'แมลงปอ บรรพบุรุษ', 'อัญเชิญ จุติ Avatar {แมลง} Cost ≤4 จากนรก', true);
      if (c) await A.summonFrom(p, A.hell(p), c, { jutti: true });
    },
  };
  E['BT03-034'] = { onBattle: async (A, p, self, foe) => { A.addPower(foe, -2, 'endTurn'); A.addPower(self, 2, 'endTurn'); } }; // พาลี
  E['BT03-035'] = { // นางมณโฑ
    onSummon: async (A, p) => {
      if (!A.roomFor(p)) return;
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && c.symbol === 'ยักษ์' && (c.power || 0) <= 3, 'อัญเชิญ Avatar {ยักษ์} POWER ≤3 จากนรก', true);
      if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false });
    },
  };
  E['BT03-041'] = { canUse: (A, p) => !!A.state.land && A.hand(p).length >= 2, magic: async (A, p) => { await A.discard(p, 1); A.draw(p, 2); } }; // เก็บค่าคุ้มครอง
  E['BT03-042'] = E['KD03-014']; // ตู้โชว์ไอดอล
  E['BT03-043'] = { // ผมขอค้าน !!
    canUse: (A, p) => A.hand(A.opp(p)).length > 0,
    magic: async (A, p) => {
      const syms = allSymbols();
      const sym = await A.choose(p, 'ประกาศ Symbol ของ Avatar', syms.map((x, i) => ({ label: x, value: x, score: -i })));
      const h = A.hand(A.opp(p)); const c = h[A.rand(h.length)];
      A.log(`ผมขอค้าน: ประกาศ {${sym}} สุ่มได้ "${c.card.name}"`);
      if (isAvatar(c.card) && c.card.symbol === sym) { A.hell(A.opp(p)).push(A.takeFrom(h, c)); A.log(`"${c.card.name}" ถูกทิ้งลงนรก`); }
    },
  };
  E['BT03-044'] = E['KD03-013']; // เยี่ยวรดศาล
  E['BT03-045'] = { // ซุปเปอร์สแน็ค !!
    canUse: A => A.avatars(0).concat(A.avatars(1)).some(a => A.isSym(a, 'สัตว์')),
    magic: async (A, p) => {
      const all = A.avatars(p).concat(A.avatars(A.opp(p))).filter(a => A.isSym(a, 'สัตว์'));
      const v = await A.choose(p, 'เลือก Avatar {สัตว์}: POWER +6 (ถูกทำลายใน End Phase)', all.map(x => A.avOpt(x, x.owner === p ? A.power(x) : -3)));
      const a = all.find(x => x.uid === v); if (!a) return;
      A.addPower(a, 6, 'endTurn'); a.destroyAtEnd = true;
    },
  };
  E['BT03-046'] = { // จมน้ำ
    canUse: A => A.avatars(0).length + A.avatars(1).length > 0,
    magic: async (A, p) => {
      for (const q of [p, A.opp(p)]) {
        if (!A.avatars(q).length) continue;
        const v = await A.choose(q, 'จมน้ำ: เลือก Avatar ของคุณ 1 ใบ กลับไปใต้ Deck', A.avatars(q).map(x => A.avOpt(x, -A.power(x))));
        const a = A.avatars(q).find(x => x.uid === v); if (a) A.toDeckBottom(a);
      }
    },
  };
  E['BT03-047'] = { react: { on: 'summon', botScore: (A, p, ctx) => (A.power(ctx.avatar) >= 3 ? 2 : -1), run: async (A, p, ctx) => { if (A.onField(ctx.avatar)) { A.rest(ctx.avatar); A.log(`${ctx.avatar.card.name} เปลี่ยนเป็นสภาพนอน`); } } } }; // ไม่เจ้ายังไม่พร้อม
  const shirtSlap = async (A, p) => { // เอาเสื้อมาหมุนๆแล้วตบ
    const h = await A.pickFrom(p, A.hand(p), () => true, 'นำการ์ดบนมือ 1 ใบกลับเข้า Deck');
    if (h) { A.deck(p).push(A.takeFrom(A.hand(p), h)); A.shuffleDeck(p); }
    const bugs = A.avatars(A.opp(p)).filter(a => A.isSym(a, 'แมลง'));
    const v = await A.choose(p, 'ทำลาย Avatar {แมลง} อีกฝ่าย', bugs.map(x => A.avOpt(x, A.power(x))));
    const a = bugs.find(x => x.uid === v); if (a) await A.destroy(a, 'เอาเสื้อมาหมุนๆแล้วตบ', p);
  };
  E['BT03-048'] = {
    canUse: (A, p) => A.hand(p).length >= 2 && A.avatars(A.opp(p)).some(a => A.isSym(a, 'แมลง')),
    magic: shirtSlap,
    react: { on: 'summon', when: (A, p, ctx) => A.hand(p).length >= 1 && A.isSym(ctx.avatar, 'แมลง') && ctx.avatar.owner !== p, botScore: () => 2, run: shirtSlap },
  };
  E['BT03-049'] = { // คว้าปืนมายิงหมี
    react: {
      on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'avatar' && A.hell(p).some(c => c.card.type === 'magic' && c.card.magicType === 'modification'),
      botScore: () => 1.5,
      run: async (A, p, ctx) => {
        const c = await A.pickFrom(p, A.hell(p), c => c.type === 'magic' && c.magicType === 'modification', 'นำ Modification Magic จากนรกขึ้นมือ');
        if (c) A.toHand(p, A.takeFrom(A.hell(p), c));
        if (A.onField(ctx.attacker)) A.addPower(ctx.attacker, -1, 'endTurn');
      },
    },
  };
  E['BT03-050'] = { // งับ
    react: {
      on: 'attack', botScore: (A, p, ctx) => (A.power(ctx.attacker) >= 3 ? 2 : 0.5),
      run: async (A, p, ctx) => {
        const got = await lookTop(A, p, 2, c => isAvatar(c) && c.symbol === KAPOM, 'นำ Avatar {กะปอม} ขึ้นมือ', async c => A.toHand(p, c));
        if (got && A.onField(ctx.attacker)) { await A.destroy(ctx.attacker, 'งับ', p); return { cancelAttack: true }; }
      },
    },
  };
  E['BT03-051'] = E['KD04-013']; // อาวุธ "อีโบล่า ซอร์ด"
  E['BT03-052'] = { // แผนการ : แกงส้มตะปูเสียบ
    magic: true, equipAny: true, equipPower: -2,
    equipScore: (A, p, a) => (a.owner === p ? -5 : (A.power(a) <= 2 ? 6 : A.power(a))),
    onEquip: async (A, p, m, host) => { if (A.onField(host) && A.power(host) === 0) await A.destroy(host, 'แกงส้มตะปูเสียบ', p); },
  };
  E['BT03-053'] = { magic: true, noPowerDown: true }; // ยาแก้ไอน้ำดำ
  E['BT03-054'] = { magic: true, equipCost: -1 }; // ขวานไม้เน่าๆเหม็นๆ
  E['BT03-055'] = E['KD01-016']; // ขวานทอง
  E['BT03-056'] = { // สายฟ้า วัชระ
    magic: true,
    onEquippedAttack: async (A, p, m, a, tgt) => {
      if (!tgt || tgt.kind !== 'avatar') return;
      const d = A.avatars(A.opp(p)).find(x => x.uid === tgt.uid); if (d) await A.destroy(d, 'สายฟ้า วัชระ', p);
    },
  };
  E['BT03-057'] = { // อาณาจักรของแพง
    magic: true,
    activateLabel: 'ทิ้ง 1: นำ "พระเจ้านิโคไล" จาก Deck ขึ้นมือ',
    canActivate: (A, p) => A.hand(p).length > 0 && A.avatars(A.opp(p)).reduce((n, a) => n + A.cost(a), 0) <= 4 && A.deck(p).some(c => A.named(c.card, NIKOLAI)),
    activate: async (A, p) => { await A.discard(p, 1); await tutor(c => isAvatar(c) && A.named(c, NIKOLAI), 'นำ "พระเจ้านิโคไล" ขึ้นมือ')(A, p); },
  };
  E['BT03-058'] = { // ยุคกาฬสินธุ์โซอิค
    magic: true,
    activateLabel: 'ทิ้ง GEM รวม 3+: สอดแนม 5 หา {กะปอม}',
    canActivate: (A, p) => A.hand(p).reduce((n, h) => n + A.gem(h.card), 0) >= 3,
    activate: async (A, p) => {
      let g = 0;
      while (g < 3 && A.hand(p).length) {
        const h = await A.pickFrom(p, A.hand(p), () => true, `ทิ้งการ์ดเป็น GEM (ได้ ${g}/3)`);
        if (!h) break; g += A.gem(h.card); A.hell(p).push(A.takeFrom(A.hand(p), h));
      }
      await lookTop(A, p, 5, c => isAvatar(c) && c.symbol === KAPOM, 'เลือก Avatar {กะปอม}', async c => {
        if ((c.card.cost || 0) <= 3 && A.roomFor(p) && await askYes(A, p, `อัญเชิญ "${c.card.name}" ลงสนามแทนการขึ้นมือ?`, 1)) await A.summonFrom(p, [], c, { jutti: false });
        else A.toHand(p, c);
      });
    },
  };
  E['BT03-059'] = { // ราชธานีสามัคคี
    magic: true,
    activateLabel: 'ให้ Avatar 1 ใบได้รับ สามัคคี จนจบเทิร์น',
    canActivate: (A, p) => A.avatars(p).length > 0,
    activate: async (A, p) => {
      const v = await A.choose(p, 'เลือก Avatar ได้รับ สามัคคี', A.avatars(p).map(x => A.avOpt(x, A.power(x))));
      const a = A.avatars(p).find(x => x.uid === v); if (a) { A.grantKw(a, ['สามัคคี']); A.log(`${a.card.name} ได้รับ สามัคคี จนจบเทิร์น`); }
    },
  };
  E['BT03-060'] = { // ปราสาทแดรก
    magic: true,
    aura: (A, owner, src, a) => (a.card.name === 'แดรกคูลา' ? 1 : 0),
    activateLabel: 'ทิ้ง 1: อัญเชิญแดรกคูลาจากนรก',
    canActivate: (A, p) => A.roomFor(p) && A.hand(p).length > 0 && A.hell(p).some(c => c.card.name === 'แดรกคูลา'),
    activate: async (A, p) => { await A.discard(p, 1); const c = await A.pickFrom(p, A.hell(p), c => c.name === 'แดรกคูลา', 'อัญเชิญแดรกคูลา'); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); },
  };
  (root.TC_CARDS || []).forEach(c => { if (c.id === 'BT03-002' && !c.alsoNamed) c.alsoNamed = [NARAI]; });

  // ================= BT04 =================
  const TRUTH = 'ผู้รู้ความจริง', DOGCAT = c => isAvatar(c) && c.symbol === 'สัตว์' && (A_named(c, 'หมา') || A_named(c, 'แมว'));
  const kapomScout = (A, p, n) => n + A.avatars(p).filter(a => (E[a.card.id] || {}).kapomScoutBonus && !a.lostAbilities).length;
  const topOrBottom = async (A, p, cards) => { // put looked-at cards on top or at the bottom of the deck
    const d = A.deck(p);
    for (const c of cards) {
      const v = await A.choose(p, `วาง "${c.card.name}" ไว้ที่ไหน`, [{ label: 'บนสุดของ Deck', value: 0, score: A.cardOpt(c).score >= 5 ? 1 : 0 }, { label: 'ใต้ Deck', value: 1, score: 0.5 }]);
      if (v === 1) d.push(c); else d.unshift(c);
    }
  };
  const truthLook = async (A, p, n) => { // ผู้รู้ความจริง look: "คนแก่สติเลอะเลือน" seen this way is summoned
    const d = A.deck(p); const seen = d.splice(0, Math.min(n, d.length));
    A.log(`${A.state.players[p].name} สอดแนม ${seen.length} ใบ: ${seen.map(c => c.card.name).join(', ')}`);
    for (const c of seen.slice()) if ((E[c.card.id] || {}).truthSummon && A.roomFor(p, c.card)) { seen.splice(seen.indexOf(c), 1); await A.summonFrom(p, [], c, { jutti: false }); }
    return seen;
  };
  const subsetSum = (vals, x) => { const ok = new Set([0]); for (const v of vals) for (const s of [...ok]) ok.add(s + v); return ok.has(x); };
  E['BT04-001'] = { onBattle: async (A, p, self, foe) => { const d = (foe.card.power || 0) - A.power(foe); if (d) A.addPower(foe, d, 'endTurn'); } }; // จอมหักกระดูก
  E['BT04-002'] = { // ครูสงบ กล้ามโต
    onAttack: async (A, p) => {
      const ms = A.state.players[A.opp(p)].magicZone; if (!ms.length) return;
      const v = await A.choose(p, 'ทำลาย Modification Magic ของอีกฝ่าย 1 ใบ?', ms.map(m => A.cardOpt(m, 2)), true);
      const m = ms.find(x => x.uid === v); if (m) A.destroyMagic(m);
    },
  };
  E['BT04-003'] = { controlImmune: true }; // ไอ้นัท
  E['BT04-004'] = { // อีช่า
    onSummon: async (A, p, self) => {
      const others = A.avatars(p).filter(x => x !== self);
      const prey = A.avatars(A.opp(p)).filter(a => ['คน', 'เทพ', 'นรก'].some(s => A.isSym(a, s)));
      if (!others.length || !prey.length) return;
      const v = await A.choose(p, 'เซ่นไหว้ Avatar ใบอื่น เพื่อยึด Avatar {คน}/{เทพ}/{นรก} ของอีกฝ่าย?', others.map(x => A.avOpt(x, Math.max(...prey.map(y => A.power(y))) - A.power(x))), true);
      const s = others.find(x => x.uid === v); if (!s) return;
      await A.sacrifice(p, s);
      const t = await A.choose(p, 'เลือก Avatar ที่จะยึด', prey.filter(a => A.onField(a)).map(a => A.avOpt(a, A.power(a))));
      const a = prey.find(x => x.uid === t); if (a) A.takeControl(a, p, false, true);
    },
  };
  E['BT04-007'] = { // ราม และ วิโรจน์
    extraSymbol: 'สัตว์',
    activateLabel: 'เลือกปฏิบัติ: POWER +2 / สวม Modification จากนรก',
    activate: async (A, p, a) => {
      const canEq = !A.magicUsed(p, 'modification') && A.hell(p).some(c => c.card.type === 'magic' && c.card.magicType === 'modification');
      const v = await A.choose(p, 'ราม และ วิโรจน์: เลือกปฏิบัติ', [{ label: '1) POWER +2 จนถึง End Phase ต่อไปของอีกฝ่าย', value: 1, score: 1 }].concat(canEq ? [{ label: '2) สวม Modification Magic จากนรก', value: 2, score: 2 }] : []));
      if (v === 2) {
        const c = await A.pickFrom(p, A.hell(p), c => c.type === 'magic' && c.magicType === 'modification', 'เลือก Modification Magic จากนรก');
        if (c) { A.markMagicUsed(p, 'modification'); await A.attach(p, A.takeFrom(A.hell(p), c), a); }
      } else A.addPower(a, 2, 'myNextTurn');
    },
  };
  E['BT04-008'] = E['KD04-010']; // ลูกคนรวย
  E['BT04-009'] = { // โทมาโทจัง ไอดอลเด็กน้อย
    aura: (A, owner, src, a) => (a.owner === owner && a !== src && A.named(a.card, IDOL) && A.attached(a).some(m => A.named(m.card, OTA)) ? 2 : 0),
    untargetable: (A, x) => A.attached(x).some(m => A.named(m.card, OTA)) && A.avatars(x.owner).some(o => o !== x && A.named(o.card, IDOL) && o.card.name !== x.card.name),
  };
  E['BT04-010'] = { // สยามโมไทรันนัส
    onAttack: async (A, p) => {
      const d = A.deck(p); const seen = d.splice(0, Math.min(kapomScout(A, p, 5), d.length));
      A.log(`${A.state.players[p].name} สอดแนม ${seen.length} ใบ`);
      while (A.roomFor(p)) {
        const v = await A.choose(p, 'อัญเชิญ จุติ Avatar {กะปอม} (กี่ใบก็ได้)', seen.filter(c => isAvatar(c.card) && c.card.symbol === KAPOM).map(c => A.cardOpt(c)), true);
        const c = seen.find(x => x.uid === v); if (!c) break;
        seen.splice(seen.indexOf(c), 1); await A.summonFrom(p, [], c, { jutti: true });
      }
      d.push(...seen); A.shuffleDeck(p);
    },
  };
  E['BT04-011'] = { kapomScoutBonus: true }; // เทอราโนดอน
  E['BT04-012'] = { // เอเลี่ยนทูตดาวอังคาร
    activateLabel: 'แสดง Avatar บนมือ: ทำลาย Avatar ที่ POWER = Cost รวม',
    canActivate: (A, p) => { const costs = A.hand(p).filter(h => isAvatar(h.card)).map(h => h.card.cost || 0); return A.avatars(A.opp(p)).some(a => A.power(a) > 0 && subsetSum(costs, A.power(a))); },
    activate: async (A, p) => {
      const costs = A.hand(p).filter(h => isAvatar(h.card)).map(h => h.card.cost || 0);
      const can = A.avatars(A.opp(p)).filter(a => A.power(a) > 0 && subsetSum(costs, A.power(a)));
      const v = await A.choose(p, 'ทำลาย Avatar อีกฝ่าย (แสดง Avatar บนมือที่ Cost รวมเท่ากับ POWER)', can.map(a => A.avOpt(a, A.power(a))));
      const a = can.find(x => x.uid === v); if (!a) return;
      A.log(`แสดง Avatar บนมือ Cost รวม ${A.power(a)}`);
      await A.destroy(a, 'เอเลี่ยนทูตดาวอังคาร', p);
      const h = await A.pickFrom(p, A.hand(p), () => true, 'ให้การ์ดบนมือ 1 ใบแก่อีกฝ่าย');
      if (h) { A.hand(A.opp(p)).push(A.takeFrom(A.hand(p), h)); h.owner = A.opp(p); A.log(`ให้ "${h.card.name}" แก่อีกฝ่าย`); }
    },
  };
  E['BT04-013'] = E['KD03-009']; // โอตะตัวกะปอม
  E['BT04-014'] = { // มาวิน เซียนเบ็ด
    onSummon: async (A, p) => {
      if (!A.roomFor(p) || !A.hell(p).some(c => isAvatar(c.card) && c.card.symbol === 'ปลา')) return;
      const h = await A.pickFrom(p, A.hand(p), c => isAvatar(c) && (c.symbol === 'แมลง' || A_named(c, 'เหยื่อ')), 'ทิ้ง Avatar {แมลง} หรือ "เหยื่อ" เพื่ออัญเชิญ {ปลา} จากนรก', true);
      if (!h) return; A.hell(p).push(A.takeFrom(A.hand(p), h));
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && c.symbol === 'ปลา', 'อัญเชิญ Avatar {ปลา} จากนรก');
      if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false });
    },
  };
  E['BT04-015'] = { // คุณดีไมส์ (ปลาดาบ)
    onBattleWin: async (A, p, a) => {
      if (!A.state.land || !A_named(A.state.land.card, 'บึงทมิฬ') || !A.hand(p).length) return;
      if (!await askYes(A, p, 'ทิ้งการ์ด 1 ใบ เพื่อให้ปลาดาบกลับมาสภาพตื่น?', 1)) return;
      await A.discard(p, 1); A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`);
    },
  };
  E['BT04-017'] = { onSummon: async (A, p) => { if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.deck(p), c => DOGCAT(c) && (c.cost || 0) <= 2, 'อัญเชิญ "หมา" หรือ "แมว" {สัตว์} Cost ≤2 จาก Deck', true); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p); } }; // หมานมเย็น
  E['BT04-018'] = { // รัททาทุย 2 หัว
    preventDestroy: async (A, p, a) => {
      if (!A.battleFoe(a) || a.onceTurn === A.state.turn || A.power(a) <= 1) return false;
      if (!await askYes(A, p, 'รัททาทุย 2 หัว: POWER -1 เพื่อไม่ถูกทำลาย?', 1)) return false;
      a.onceTurn = A.state.turn; A.addPower(a, -1, 'perm'); return true;
    },
  };
  E['BT04-019'] = { truthSummon: true, activateLabel: 'จั่วการ์ด 1 ใบ', activate: async (A, p) => A.draw(p, 1) }; // คนแก่สติเลอะเลือน
  E['BT04-020'] = { // อู๊ด ประธานผู้รู้ความจริง
    onSummon: async (A, p) => {
      const seen = await truthLook(A, p, 2);
      const x = seen.reduce((n, c) => n + (c.card.cost || 0), 0);
      await topOrBottom(A, p, seen);
      const can = A.avatars(A.opp(p)).filter(a => A.cost(a) <= x);
      if (!can.length) return;
      const v = await A.choose(p, `ทำลาย Avatar อีกฝ่ายที่ Cost ≤ ${x}`, can.map(a => A.avOpt(a, A.power(a))));
      const a = can.find(y => y.uid === v); if (a) await A.destroy(a, 'อู๊ด ประธานผู้รู้ความจริง', p);
    },
  };
  E['BT04-021'] = { // น้องสาม ผู้รู้ความจริง
    onAttack: async (A, p, self) => {
      const seen = await truthLook(A, p, 2);
      const bonus = seen.filter(c => isAvatar(c.card) && A_named(c.card, TRUTH)).reduce((n, c) => n + (c.card.power || 0), 0);
      if (bonus && A.onField(self)) A.addPower(self, bonus, 'endTurn');
      const v = await A.choose(p, 'นำ "ผู้รู้ความจริง" ขึ้นมือ?', seen.filter(c => isAvatar(c.card) && A_named(c.card, TRUTH)).map(c => A.cardOpt(c)), true);
      const c = seen.find(x => x.uid === v); if (c) { seen.splice(seen.indexOf(c), 1); A.toHand(p, c); }
      await topOrBottom(A, p, seen);
    },
  };
  E['BT04-022'] = { onSummon: async (A, p) => { A.draw(p, 1); const h = await A.pickFrom(p, A.hand(p), () => true, 'นำการ์ดบนมือ 1 ใบไว้บนสุดของ Deck'); if (h) A.deck(p).unshift(A.takeFrom(A.hand(p), h)); } }; // รปภ
  E['BT04-023'] = { // วิไลวรรณ แม่แบงค์
    onPaidAsCost: async (A, p, pc, s) => {
      if (s.card.color !== 'purple' || !A.deck(p).length) return;
      const c = A.deck(p)[0];
      const v = await A.choose(p, `สอดแนม: "${c.card.name}"`, [{ label: 'ไว้บนสุดของ Deck', value: 0, score: A.cardOpt(c).score >= 5 ? 1 : 0 }, { label: 'ส่งลงนรก', value: 1, score: 0.5 }]);
      if (v === 1) { A.deck(p).shift(); A.hell(p).push(c); A.log(`"${c.card.name}" ถูกส่งลงนรก`); }
    },
  };
  E['BT04-024'] = E['KD02-005']; // นายนิรยบาล หมอ
  const isPrime = n => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
  E['BT04-025'] = { // ครูแกง สอนเลข
    onSummon: async (A, p) => {
      for (const q of [A.opp(p), p]) {
        const sum = A.avatars(q).reduce((n, a) => n + A.power(a), 0);
        A.log(`ผลรวม POWER ฝ่าย ${A.state.players[q].name} = ${sum}${isPrime(sum) ? ' (จำนวนเฉพาะ!)' : ''}`);
        if (isPrime(sum)) for (const a of A.avatars(q).slice()) await A.destroy(a, 'ครูแกง สอนเลข', p);
      }
    },
  };
  E['BT04-026'] = { // ลูกเขยบิ๊ก
    onSummon: async (A, p) => {
      const pred = c => c.type === 'magic' && A_named(c, 'แผนการ');
      const pool = A.deck(p).filter(c => pred(c.card)).concat(A.hell(p).filter(c => pred(c.card)));
      const v = await A.choose(p, 'นำ Magic "แผนการ" จาก Deck หรือนรกขึ้นมือ', pool.map(c => A.cardOpt(c)), true);
      const c = pool.find(x => x.uid === v); if (!c) return;
      const fromDeck = A.deck(p).includes(c);
      A.toHand(p, A.takeFrom(fromDeck ? A.deck(p) : A.hell(p), c)); if (fromDeck) A.shuffleDeck(p);
    },
  };
  E['BT04-027'] = { onSummon: async (A, p) => { A.draw(p, 1); await A.discard(p, 1); } }; // ผู้งมงาย
  E['BT04-028'] = { // พญายักษ์ ทศกัณฑ์
    activateLabel: 'ทิ้ง 1: อัญเชิญ {ยักษ์} POWER 3 จาก Deck',
    canActivate: (A, p) => A.roomFor(p) && A.hand(p).length > 0 && A.deck(p).some(c => isAvatar(c.card) && c.card.symbol === 'ยักษ์' && c.card.power === 3 && !A_named(c.card, 'ทศกัณฑ์')),
    activate: async (A, p) => { await A.discard(p, 1); const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && c.symbol === 'ยักษ์' && c.power === 3 && !A_named(c, 'ทศกัณฑ์'), 'อัญเชิญ {ยักษ์} POWER 3 จาก Deck'); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p); },
  };
  E['BT04-029'] = { // เสามงคล ทรงโรมัน
    cannotAttack: () => true,
    endPhase: async (A, p) => { if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && A_named(c, 'ผู้เจริญ'), 'อัญเชิญ "ผู้เจริญ" จากนรก'); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); },
  };
  E['BT04-030'] = equipSelfTo('รถถัง', 'สวมใส่ให้ "รถถัง"'); // มาติเนซ Tank Ranger (equip part)
  E['BT04-031'] = { activateLabel: 'นำ "ปืนเล็กยาว" จาก Deck ขึ้นมือ', canActivate: (A, p) => A.deck(p).some(c => A_named(c.card, 'ปืนเล็กยาว')), activate: tutor(c => A_named(c, 'ปืนเล็กยาว'), 'นำ "ปืนเล็กยาว" ขึ้นมือ') }; // ทหารเวรคลังแสง
  E['BT04-032'] = { condKwOnly: ['เตะไข่'], condKw: (A, a) => (A.avatars(a.owner).some(x => A.named(x.card, NIKOLAI)) ? ['เตะไข่'] : []) }; // พลปืนอาณาจักรของแพง
  E['BT04-033'] = { // เจ้าของร้านอาบน้ำสัตว์
    activateLabel: 'ทิ้งการ์ด {สัตว์}: Avatar {สัตว์} POWER +1',
    canActivate: (A, p) => A.avatars(p).some(a => A.isSym(a, 'สัตว์')) && A.hand(p).some(h => h.card.symbol === 'สัตว์' || A_named(h.card, 'พนักงานอาบน้ำสัตว์')),
    activate: async (A, p) => {
      const h = await A.pickFrom(p, A.hand(p), c => c.symbol === 'สัตว์' || A_named(c, 'พนักงานอาบน้ำสัตว์'), 'ทิ้งการ์ด'); if (!h) return;
      A.hell(p).push(A.takeFrom(A.hand(p), h));
      const v = await A.choose(p, 'Avatar {สัตว์} POWER +1', A.avatars(p).filter(a => A.isSym(a, 'สัตว์')).map(x => A.avOpt(x, A.power(x))));
      const a = A.avatars(p).find(x => x.uid === v); if (a) A.addPower(a, 1, 'endTurn');
    },
  };
  E['BT04-034'] = { lastWill: async (A, p) => { if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.hell(p), c => DOGCAT(c) && (c.cost || 0) <= 3, 'อัญเชิญ "หมา"/"แมว" {สัตว์} Cost ≤3 จากนรก', true); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); } }; // อนงค์
  E['BT04-035'] = { // แฟรงกี้
    onPaidAsCost: async (A, p, pc, s) => {
      if (!DOGCAT(s.card)) return;
      const v = await A.choose(p, 'Avatar {สัตว์} POWER +2 จนจบเทิร์น', A.avatars(p).filter(a => A.isSym(a, 'สัตว์')).map(x => A.avOpt(x, A.power(x))));
      const a = A.avatars(p).find(x => x.uid === v); if (a) A.addPower(a, 2, 'endTurn');
    },
  };
  E['BT04-042'] = { // Grand Rumble !!!!
    canUse: A => A.avatars(0).length + A.avatars(1).length === 6,
    magic: async (A, p) => {
      const left = A.avatars(p).concat(A.avatars(A.opp(p))); const order = [];
      while (left.length > 1) {
        const v = await A.choose(p, `กำหนดเลข ${order.length + 1} ให้ Avatar`, left.map(a => A.avOpt(a, a.owner === p ? A.power(a) : -A.power(a))));
        order.push(left.splice(Math.max(0, left.findIndex(a => a.uid === v)), 1)[0]);
      }
      order.push(left[0]);
      order.forEach((a, i) => A.log(`เลข ${i + 1}: ${a.card.name}`));
      const d = A.dice(); A.log(`ทอยลูกเต๋าได้ ${d}`);
      for (const [i, a] of order.entries()) if (i + 1 !== d) await A.destroy(a, 'Grand Rumble', p);
    },
  };
  E['BT04-043'] = { // แผนการ : ถอยรถชน
    canUse: (A, p) => A.avatars(p).some(a => A.isSym(a, 'หุ่นยนต์')),
    magic: async (A, p) => {
      const v = await A.choose(p, 'เซ่นไหว้ Avatar {หุ่นยนต์}', A.avatars(p).filter(a => A.isSym(a, 'หุ่นยนต์')).map(x => A.avOpt(x, 5 - A.power(x))));
      const s = A.avatars(p).find(x => x.uid === v); if (!s) return; await A.sacrifice(p, s);
      const all = A.avatars(A.opp(p)).concat(A.avatars(p));
      const t = await A.choose(p, 'ทำลาย Avatar บนสนาม 1 ใบ', all.map(a => A.avOpt(a, a.owner === p ? -5 : A.power(a))));
      const a = all.find(x => x.uid === t); if (a) await A.destroy(a, 'ถอยรถชน', p);
    },
  };
  E['BT04-044'] = { // บีมมมมมมมมมม
    canUse: (A, p) => A.hand(p).length >= 2 && A.avatars(A.opp(p)).length > 0,
    magic: async (A, p) => { await A.discard(p, 1); const v = await A.choose(p, 'ทำลาย Avatar อีกฝ่าย', bestOppAvatar(A, p)); const a = A.avatars(A.opp(p)).find(x => x.uid === v); if (a) await A.destroy(a, 'บีมมมมมมมมมม', p); },
  };
  E['BT04-045'] = { // ใครเจ๋งกว่า !
    magic: async (A, p) => {
      const shown = {};
      for (const q of [p, A.opp(p)]) {
        const hc = A.hand(q).filter(h => h.card.cost != null);
        if (!hc.length) { A.log(`${A.state.players[q].name} ไม่มีการ์ดที่มี Cost — เปิดมือ: ${A.hand(q).map(h => h.card.name).join(', ') || '(ว่าง)'}`); continue; }
        const v = await A.choose(q, 'ใครเจ๋งกว่า: เลือกการ์ดที่มี Cost บนมือมาแสดง', hc.map(h => A.cardOpt(h, h.card.cost)));
        shown[q] = hc.find(h => h.uid === v) || hc[0];
        A.log(`${A.state.players[q].name} แสดง "${shown[q].card.name}" (Cost ${shown[q].card.cost})`);
      }
      const a = shown[p], b = shown[A.opp(p)]; if (!a || !b) return;
      if (a.card.cost === b.card.cost) { for (const [q, c] of [[p, a], [A.opp(p), b]]) { A.deck(q).push(A.takeFrom(A.hand(q), c)); A.shuffleDeck(q); } A.log('Cost เท่ากัน: ทั้งสองฝ่ายนำการ์ดกลับเข้า Deck'); }
      else { const [q, c] = a.card.cost < b.card.cost ? [p, a] : [A.opp(p), b]; A.hell(q).push(A.takeFrom(A.hand(q), c)); A.log(`"${c.card.name}" ถูกทิ้งลงนรก`); }
    },
  };
  E['BT04-046'] = pickForPoor;
  E['BT04-047'] = { // ความจริงงงงงงง
    canUse: (A, p) => A.avatars(p).some(a => A.named(a.card, TRUTH)) && A.deck(p).length > 0,
    magic: async (A, p) => { const c = await A.pickFrom(p, A.deck(p), () => true, 'เลือกการ์ดใน Deck ไว้บนสุด'); if (!c) return; A.takeFrom(A.deck(p), c); A.shuffleDeck(p); A.deck(p).unshift(c); A.log(`แสดง "${c.card.name}" แล้ววางไว้บนสุดของ Deck`); },
  };
  E['BT04-048'] = E['KD03-015']; // งานจับมือ
  E['BT04-049'] = { // เอาไปอยู่ด้วย
    react: { on: 'destroyedByOpp', when: (A, p, ctx) => ctx.avatar.card.symbol === 'ผี' && A.avatars(A.opp(p)).length > 0, botScore: () => 3,
      run: async (A, p) => { const v = await A.choose(p, 'ทำลาย Avatar อีกฝ่าย 1 ใบ', bestOppAvatar(A, p)); const a = A.avatars(A.opp(p)).find(x => x.uid === v); if (a) await A.destroy(a, 'เอาไปอยู่ด้วย', p); } },
  };
  E['BT04-050'] = { react: { on: 'activate', botScore: () => 2, run: async () => ({ negate: true }) } }; // เชาว์ปัญญาลิง
  E['BT04-051'] = { // ลดราคาล้นตลาด
    canUse: A => A.state.players.every(pl => pl.magicZone.length),
    magic: async (A, p) => {
      for (const q of [A.opp(p), p]) {
        const ms = A.state.players[q].magicZone; if (!ms.length) continue;
        const v = await A.choose(p, `ส่ง Modification Magic ของฝ่าย ${A.state.players[q].name} ลงนรก`, ms.map(m => A.cardOpt(m, q === p ? -A.cardOpt(m).score : A.cardOpt(m).score)));
        const m = ms.find(x => x.uid === v); if (m) A.destroyMagic(m);
      }
    },
  };
  E['BT04-052'] = { // กลับหลังหัน !!!
    react: {
      on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'avatar',
      botScore: (A, p, ctx) => ((ctx.attacker.card.cost || 0) < A.power(ctx.attacker) ? 2 : -1),
      run: async (A, p, ctx) => {
        const d = A.avatars(p).find(x => x.uid === ctx.target.uid);
        const pair = [ctx.attacker, d].filter(Boolean);
        const v = await A.choose(p, 'สลับ Cost กับ POWER ของ Avatar ที่ต่อสู้', pair.map(a => A.avOpt(a, a.owner === p ? A.cost(a) - A.power(a) : A.power(a) - A.cost(a))));
        const a = pair.find(x => x.uid === v); if (!a) return;
        A.addPower(a, A.cost(a) - A.power(a), 'endTurn');
      },
    },
  };
  E['BT04-053'] = E['KD04-014']; E['BT04-054'] = E['KD03-019'];
  E['BT04-055'] = { magic: true, equipCost: 2, equipPower: (A, a) => (A.cost(a) >= 6 ? 1 : 0) }; // ดาบพิฆาตสวรรค์
  E['BT04-056'] = { magic: true, equipOk: (A, a) => A.isSym(a, 'คน') && (A.named(a.card, 'ทหาร') || A.named(a.card, 'รด.')), equipPower: 3 }; // ปืนเล็กยาว
  E['BT04-057'] = { // สมาคมผู้รู้ความจริง
    magic: true,
    activateLabel: 'สอดแนม 3 แล้ววางบน/ใต้ Deck',
    canActivate: (A, p) => A.avatars(p).some(a => A.named(a.card, TRUTH)) && A.deck(p).length > 0,
    activate: async (A, p) => { const seen = await truthLook(A, p, 3); await topOrBottom(A, p, seen); },
  };
  E['BT04-058'] = { magic: true, noUnflip: true }; // โรงบาลรัฐ
  E['BT04-059'] = { // พิภพรัททาทุย
    magic: true, ratWorld: RAT,
    onAnyAttack: async (A, p, a) => { if (A.isSym(a, RAT)) A.addPower(a, 2, 'endTurn'); },
  };
  E['BT04-060'] = { magic: true, aura: (A, owner, src, a) => (['ผี', 'เปรต', 'เอเลี่ยน', 'ไดโนเสาร์', KAPOM].some(s => A.isSym(a, s)) ? 1 : 0) }; // Podcast Untitled Case
  E['BT03-011'].onSummon = async (A, p) => { if (A.roomFor(p)) await lookTop(A, p, kapomScout(A, p, 5), c => isAvatar(c) && c.symbol === KAPOM && (c.cost || 0) <= 3, 'อัญเชิญ Avatar {กะปอม} Cost ≤3', c => A.summonFrom(p, [], c, { jutti: false })); };

  // ================= BT05 =================
  const KNIGHT = 'อัศวินโต๊ะกลม', DRAGONFLY = 'แมลงปอ', SUPERAIR = 'Super Air', PLANE = 'เครื่องบิน Super Air', MONKEY = 'วานร';
  const lookTopBottom = async (A, p, n, picks, then) => { // look at top n; each pick = {pred, title}; rest to the bottom
    const d = A.deck(p); const seen = d.splice(0, Math.min(n, d.length));
    A.log(`${A.state.players[p].name} สอดแนม ${seen.length} ใบ`);
    const got = [];
    for (const pk of picks) {
      const v = await A.choose(p, pk.title, seen.filter(c => pk.pred(c.card)).map(c => A.cardOpt(c)), true);
      const c = seen.find(x => x.uid === v); if (!c) continue;
      seen.splice(seen.indexOf(c), 1); got.push(c);
    }
    d.push(...seen);
    for (const c of got) await then(c);
    return got;
  };
  const summonKnightFromLook = async (A, p, c) => A.summonFrom(p, [], c, { jutti: false, by: KNIGHT });
  E['BT05-001'] = { // กุ่ย นักเอาตัวรอด (พอดี)
    preventDestroy: async (A, p, a) => {
      if (!a.exact || !A.hand(p).length) return false;
      if (!await askYes(A, p, 'กุ่ย: ทิ้งการ์ด 1 ใบ เพื่อไม่ถูกทำลาย?', A.hand(p).length >= 2 ? 1 : -1)) return false;
      await A.discard(p, 1); return true;
    },
  };
  E['BT05-002'] = { // แมลงปอนางพญา
    handCost: (A, p, c) => (c.cost || 0) - A.hell(p).filter(h => isAvatar(h.card) && A_named(h.card, DRAGONFLY)).length,
    continuousSelf: (A, p, self) => A.avatars(0).concat(A.avatars(1)).filter(x => x !== self && A.named(x.card, DRAGONFLY)).length,
    activateLabel: 'เซ่นไหว้ "แมลงปอ": อัญเชิญ จุติ "แมลงปอ" ชื่ออื่นจากนรก',
    canActivate: (A, p, a) => A.avatars(p).some(x => x !== a && A.named(x.card, DRAGONFLY)) && A.hell(p).some(c => isAvatar(c.card) && A_named(c.card, DRAGONFLY)),
    activate: async (A, p, a) => {
      const others = A.avatars(p).filter(x => x !== a && A.named(x.card, DRAGONFLY));
      const v = await A.choose(p, 'เซ่นไหว้ "แมลงปอ" 1 ใบ', others.map(x => A.avOpt(x, -A.power(x))));
      const s = others.find(x => x.uid === v); if (!s) return;
      const nm = s.card.name; await A.sacrifice(p, s);
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && A_named(c, DRAGONFLY) && c.name !== nm, 'อัญเชิญ จุติ "แมลงปอ" จากนรก');
      if (c) await A.summonFrom(p, A.hell(p), c, { jutti: true });
    },
  };
  E['BT05-003'] = { // เบดิเวียร์
    onSummon: async (A, p, self) => {
      const sw = A.deck(p).find(c => c.card.type === 'magic' && A_named(c.card, 'ดาบศักดิ์สิทธิ์'));
      if (sw) { A.hell(p).push(A.takeFrom(A.deck(p), sw)); A.log(`"${sw.card.name}" ถูกส่งลงนรก`); }
      A.shuffleDeck(p);
      const k = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && A_named(c, KNIGHT), 'วาง "อัศวินโต๊ะกลม" จากนรกไว้บนสุดของ Deck?', true);
      if (k) { A.deck(p).unshift(A.takeFrom(A.hell(p), k)); A.log(`"${k.card.name}" ไปอยู่บนสุดของ Deck`); }
      if (A.onField(self)) A.addPower(self, 1, 'endTurn');
    },
  };
  E['BT05-004'] = { // ทริสทัน
    onEnter: async (A, p, self) => {
      if (self.summonedBy !== KNIGHT) return;
      const all = A.avatars(A.opp(p)).map(a => A.avOpt(a, A.power(a))).concat(A.state.players[A.opp(p)].magicZone.map(m => A.cardOpt(m, 1)));
      const v = await A.choose(p, 'ทริสทัน: ทำลายการ์ด 1 ใบบนสนามอีกฝ่าย', all, true);
      const a = A.avatars(A.opp(p)).find(x => x.uid === v); if (a) return A.destroy(a, 'ทริสทัน', p);
      const m = A.state.players[A.opp(p)].magicZone.find(x => x.uid === v); if (m) A.destroyMagic(m);
    },
    condKwOnly: ['สามัคคี'], condKw: (A, a) => (A.avatars(a.owner).some(x => x !== a && A.named(x.card, KNIGHT)) ? ['สามัคคี'] : []),
  };
  E['BT05-005'] = { activateLabel: 'นำ "ขวาน" จากนรกขึ้นมือ', canActivate: (A, p) => A.hell(p).some(c => c.card.magicType === 'modification' && A_named(c.card, 'ขวาน')), activate: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), c => c.magicType === 'modification' && A_named(c, 'ขวาน'), 'นำ "ขวาน" ขึ้นมือ'); if (c) A.toHand(p, A.takeFrom(A.hell(p), c)); } }; // เทพารักษ์งมขวาน
  E['BT05-006'] = { continuousSelf: (A, p, self) => (self.rested ? A.avatars(p).filter(x => x !== self && DOGCAT(x.card)).length : 0) }; // หมาแพนดี้
  E['BT05-007'] = { // สหายหุ่นผู้กล้า โฟเบีย
    onSummon: async (A, p, self) => {
      const need = ['เก๊าท์', 'ไดบาเรีย', 'แอร์ซิด'].map(w => A.hell(p).find(c => isAvatar(c.card) && A_named(c.card, w)));
      if (need.some(x => !x) || !A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, 'ไมเกรน') && (c.card.cost || 0) <= 5)) return;
      if (!await askYes(A, p, 'โฟเบีย: นำเก๊าท์ ไดบาเรีย แอร์ซิด จากนรกกลับ Deck เพื่ออัญเชิญ "ไมเกรน"?', 2)) return;
      need.forEach(c => A.deck(p).push(A.takeFrom(A.hell(p), c)));
      const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && A_named(c, 'ไมเกรน') && (c.cost || 0) <= 5, 'อัญเชิญ "ไมเกรน" จาก Deck');
      if (c && A.roomFor(p, c.card) && await A.summonFrom(p, A.deck(p), c, { jutti: false }) && A.onField(c) && A.onField(self)) {
        const pl = A.state.players[p]; pl.avatars.splice(pl.avatars.indexOf(self), 1); await A.attach(p, self, c);
      }
      A.shuffleDeck(p);
    },
    equipPower: 1,
  };
  E['BT05-008'] = { onPaidAsCost: async (A, p, pc, s) => { if (A.isColor(s.card, 'red')) A.addPower(s, 1, 'endTurn'); } }; // โจอี้
  E['BT05-010'] = { // น้องนาว ชู้วันชัย
    handCost: (A, p, c) => (A.avatars(p).some(a => A.isSym(a, 'เปรต')) ? 0 : (c.cost || 0)),
    activateLabel: 'หงาย LIFE ของเราสูงสุด 2 ใบ (คว่ำคืนตอนจบเทิร์น)',
    canActivate: (A, p) => A.state.players[p].life.filter(l => !l.faceUp).length > 1,
    activate: async (A, p) => {
      const n = await A.choose(p, 'หงาย LIFE กี่ใบ', [{ label: '1 ใบ', value: 1, score: 1 }, { label: '2 ใบ', value: 2, score: 2 }]);
      const pl = A.state.players[p]; const flipped = pl.life.filter(l => !l.faceUp).slice(0, Math.min(n, pl.life.filter(l => !l.faceUp).length - 1));
      flipped.forEach(l => { l.faceUp = true; }); A.log(`หงาย LIFE ${flipped.length} ใบชั่วคราว`);
      A.atEndOfTurn(async () => { flipped.forEach(l => { l.faceUp = false; }); A.log(`LIFE ที่หงายด้วยน้องนาวกลับมาคว่ำ`); });
    },
  };
  E['BT05-012'] = { noHellSummon: true }; // เจนนี่
  E['BT05-013'] = { kwAura: (A, src, a) => (A.isSym(a, 'คน') || A.isSym(a, 'ต้นไม้') ? ['สามัคคี'] : []) }; // ผู้เจริญ นาย
  E['BT05-014'] = { // ลานเซลอต
    onSummon: async (A, p) => {
      if (!A.roomFor(p)) return;
      const c = await lookTop(A, p, 2, c => isAvatar(c) && A_named(c, KNIGHT), 'อัญเชิญ "อัศวินโต๊ะกลม"', c => summonKnightFromLook(A, p, c));
      if (!c) return;
      if (A.isColor(c.card, 'red')) A.avatars(p).filter(x => A.named(x.card, KNIGHT)).forEach(x => A.addPower(x, 1, 'endTurn'));
      if (A.isColor(c.card, 'blue')) A.draw(p, 1);
    },
  };
  E['BT05-015'] = { continuousSelf: (A, p) => (A.state.active !== p ? 2 : 0) }; // กาเวน
  E['BT05-016'] = { allColors: true }; // โคลัมบัส
  E['BT05-017'] = { // เจค นักฆ่ามือเก๋า
    uniqueOnField: true,
    onAttack: async (A, p) => {
      if (!A.hell(p).some(c => c.card.name === 'ของขวัญที่เมียทิ้งไว้ให้') || !A.hand(A.opp(p)).length) return;
      const h = A.hand(A.opp(p)); const c = h[A.rand(h.length)]; A.hell(A.opp(p)).push(A.takeFrom(h, c)); A.log(`สุ่มทิ้ง "${c.card.name}" จากมืออีกฝ่าย`);
    },
  };
  E['BT05-018'] = { handCost: (A, p, c) => (A.avatars(p).some(a => a.card.name === 'เจค นักฆ่ามือเก๋า') && !A.avatars(p).some(a => a.card.name === c.name) ? 0 : (c.cost || 0)) }; // ของขวัญที่เมียทิ้งไว้ให้
  E['BT05-019'] = { // บอสทุเรียน
    onPaidAsCost: async (A, p, pc, s) => {
      if (!A.isColor(s.card, 'blue') || !A.deck(p).length) return;
      const c = A.deck(p)[0]; A.log(`บอสทุเรียนสอดแนม: "${c.card.name}"`);
      if (isAvatar(c.card) && c.card.symbol === s.card.symbol) A.toHand(p, A.deck(p).shift());
    },
  };
  E['BT05-020'] = { // คุณเงือกมาวิน
    onSummon: async (A, p, self) => {
      const fish = A.avatars(p).filter(x => x !== self && A.isSym(x, 'ปลา')); if (!fish.length) return;
      const v = await A.choose(p, 'นำ Avatar {ปลา} อีกใบกลับใต้ Deck เพื่อสอดแนม 5?', fish.map(x => A.avOpt(x, 1)), true);
      const f = fish.find(x => x.uid === v); if (!f) return;
      A.toDeckBottom(f);
      const isFish = c => isAvatar(c) && c.symbol === 'ปลา';
      await lookTopBottom(A, p, 5, [{ pred: isFish, title: 'อัญเชิญ {ปลา} (1/2)' }, { pred: isFish, title: 'อัญเชิญ {ปลา} (2/2)' }], async c => { if (A.roomFor(p, c.card)) await A.summonFrom(p, [], c, { jutti: false }); else A.deck(p).push(c); });
    },
  };
  E['BT05-021'] = { onAttack: declareDestroy('นรก') }; // นีโม่ นรกสเลเยอร์
  E['BT05-022'] = { // แมว-น้ำมะลิ
    onSummon: async (A, p) => {
      await lookTop(A, p, 3, DOGCAT, 'นำ "หมา" หรือ "แมว" ขึ้นมือ', async c => { if (c.card.name === 'หมานมเย็น' && A.roomFor(p, c.card)) await A.summonFrom(p, [], c, { jutti: true }); else A.toHand(p, c); });
    },
  };
  E['BT05-023'] = { ambush: true, lastWill: drawN(1) }; // นักรบ ฮอล
  E['BT05-024'] = { onSummon: async (A, p) => { if (A.avatars(p).some(a => a.card.name === 'แดรกคูลา')) await tutor(c => c.name === 'ปราสาทแดรก', 'นำ "ปราสาทแดรก" จาก Deck ขึ้นมือ')(A, p); } }; // มีมมิ ผู้ร่วงหล่น
  const purpleGod = c => isAvatar(c) && c.symbol === 'เทพ' && c.color === 'purple';
  E['BT05-025'] = { // เฟรย่า (พอดี)
    onSummon: async (A, p, self) => {
      if (!self.exact) return;
      for (let k = 0; k < 3; k++) { const c = await A.pickFrom(p, A.hell(p), purpleGod, `นำ Avatar {เทพ} สีม่วงจากนรกกลับ Deck (${k + 1}/3)`); if (!c) break; A.deck(p).push(A.takeFrom(A.hell(p), c)); }
      A.shuffleDeck(p); A.draw(p, 1);
    },
  };
  const milledByGod = src => src && src.card && (purpleGod(src.card) || src.card.type === 'magic');
  E['BT05-026'] = { // เฮล่า
    onMilled: async (A, p, c, src) => {
      if (!src || !purpleGod(src.card) || !A.state.land || A.state.land.card.id !== 'BT02-060' || !A.avatars(p).some(a => purpleGod(a.card)) || !A.roomFor(p, c.card)) return;
      if (await askYes(A, p, 'เฮล่าถูกธรณีสูบ: อัญเชิญลงสนามทันที?', 2)) await A.summonFrom(p, A.hell(p), c, { jutti: false });
    },
    activateLabel: 'ธรณีสูบสูงสุด 5: Avatar {เทพ} สีม่วง POWER +X',
    canActivate: (A, p) => A.deck(p).length > 1,
    activate: async (A, p, self) => {
      const max = Math.min(5, A.deck(p).length - 1);
      const n = await A.choose(p, 'ธรณีสูบกี่ใบ', Array.from({ length: max }, (_, i) => ({ label: `${i + 1} ใบ`, value: i + 1, score: A.deck(p).length > 20 ? i : -i })));
      const milled = await A.mill(p, n, self);
      const gods = A.avatars(p).filter(a => purpleGod(a.card)); if (!gods.length) return;
      const v = await A.choose(p, `Avatar {เทพ} สีม่วง POWER +${milled.length}`, gods.map(x => A.avOpt(x, A.power(x))));
      const g = gods.find(x => x.uid === v); if (g) A.addPower(g, milled.length, 'endTurn');
    },
  };
  E['BT05-027'] = { onMilled: async (A, p, c, src) => { if (milledByGod(src) && A.roomFor(p, c.card) && await askYes(A, p, 'บรุนฮิลด์ถูกธรณีสูบ: อัญเชิญจากนรก?', 2)) await A.summonFrom(p, A.hell(p), c, { jutti: false }); } }; // บรุนฮิลด์
  E['BT05-028'] = { // Ecycle
    activateLabel: 'ทิ้ง 1: การ์ดในนรกกลับใต้ Deck แล้วจั่ว 1',
    canActivate: (A, p) => A.hand(p).length > 0,
    activate: async (A, p) => { await A.discard(p, 1); const c = await A.pickFrom(p, A.hell(p), () => true, 'นำการ์ดในนรกกลับใต้ Deck'); if (c) A.deck(p).push(A.takeFrom(A.hell(p), c)); A.draw(p, 1); },
  };
  E['BT05-029'] = { lastWill: async (A, p) => { const got = await A.scout(p, 5, c => isAvatar(c) && c.symbol === 'คน', 'นำ Avatar {คน} ขึ้นมือ'); got.forEach(c => A.toHand(p, c)); } }; // จาบับวา
  E['BT05-030'] = { // หมาชาไทย
    activateLabel: 'นำ Avatar {สัตว์} อีกใบขึ้นมือ: POWER +2',
    canActivate: (A, p, a) => A.avatars(p).some(x => x !== a && A.isSym(x, 'สัตว์')),
    activate: async (A, p, a) => { const o = A.avatars(p).filter(x => x !== a && A.isSym(x, 'สัตว์')); const v = await A.choose(p, 'นำ Avatar {สัตว์} ขึ้นมือ', o.map(x => A.avOpt(x, -A.power(x)))); const x = o.find(y => y.uid === v); if (x) { A.bounce(x); A.addPower(a, 2, 'endTurn'); } },
  };
  E['BT05-031'] = { // ทัตดนัยซัง (พอดี)
    onSummon: async (A, p, self) => {
      if (!self.exact) return;
      const idols = A.avatars(p).filter(x => A.named(x.card, IDOL));
      if (idols.length && A.avatars(A.opp(p)).length) {
        const v = await A.choose(p, 'เปลี่ยนชื่อ Avatar อีกฝ่ายเป็น "โอตะ" แล้วสวมให้ "ไอดอล"', bestOppAvatar(A, p));
        const t = A.avatars(A.opp(p)).find(x => x.uid === v);
        if (t) {
          const pl = A.state.players[A.opp(p)]; pl.avatars.splice(pl.avatars.indexOf(t), 1);
          A.state.players.forEach(x => x.magicZone.slice().forEach(m => { if (m.attachedTo === t.uid) A.destroyMagic(m); }));
          t.origCard = t.card; t.card = Object.assign({}, t.card, { name: OTA });
          const hv = await A.choose(p, 'สวมให้ "ไอดอล" ใบไหน', idols.map(i => A.avOpt(i, A.power(i))));
          const host = idols.find(x => x.uid === hv) || idols[0];
          await A.attach(p, t, host);
        }
      }
      if (A.avatars(p).some(a => a.card.name === 'มยุราซัง ไอดอลยุค 80')) await tutor(c => isAvatar(c) && A_named(c, IDOL), 'นำ "ไอดอล" จาก Deck ขึ้นมือ')(A, p);
    },
  };
  E['BT05-032'] = { onAttack: async (A, p, a) => A.addPower(a, 3, 'endTurn'), onTargeted: async (A, p, a) => { A.addPower(a, -3, 'endTurn'); } }; // เจ๊หมวย
  E['BT05-033'] = { // ลุงไนท์ ราชาวานร
    onSummon: async (A, p) => { if (A.roomFor(p)) await lookTopBottom(A, p, 5, [{ pred: c => isAvatar(c) && A_named(c, MONKEY) && (c.cost || 0) <= 4, title: 'อัญเชิญ "วานร" Cost ≤4' }], c => A.summonFrom(p, [], c, { jutti: false })); },
    hellActivateLabel: 'ทิ้ง 1: อัญเชิญลุงไนท์จากนรก',
    canHellActivate: (A, p, h) => A.roomFor(p, h.card) && A.hand(p).length > 0 && A.avatars(p).filter(a => A.named(a.card, MONKEY)).length >= 3,
    hellActivate: async (A, p, h) => { await A.discard(p, 1); await A.summonFrom(p, A.hell(p), h, { jutti: false }); },
  };
  E['BT05-034'] = { aura: (A, owner, src, a) => (a.owner === owner && A.named(a.card, MONKEY) ? 1 : 0) }; // วานรช่องแชท
  E['BT05-035'] = { // คุณเชิดชัย Super Air
    onSummon: async (A, p) => {
      await lookTopBottom(A, p, 5, [
        { pred: c => c.name === PLANE || c.name === 'รหัสดำ', title: 'นำ "เครื่องบิน Super Air" หรือ "รหัสดำ" ขึ้นมือ' },
        { pred: c => isAvatar(c) && A_named(c, SUPERAIR) && c.symbol === 'คน', title: 'นำ Avatar "Super Air" {คน} ขึ้นมือ' },
      ], async c => A.toHand(p, c));
    },
  };
  E['BT05-036'] = { activateLabel: 'นำ "ตั๋วยืน" จาก Deck ขึ้นมือ', canActivate: (A, p) => A.deck(p).some(c => c.card.name === 'ตั๋วยืน'), activate: tutor(c => c.name === 'ตั๋วยืน', 'นำ "ตั๋วยืน" ขึ้นมือ') }; // กระเป๋าเครื่องบิน
  const hasPlane = (A, p) => A.avatars(p).some(a => a.card.name === PLANE);
  E['BT05-037'] = { condKwOnly: ['เตะไข่'], condKw: (A, a) => (hasPlane(A, a.owner) ? ['เตะไข่'] : []) }; // หมาเครื่องบิน
  E['BT05-038'] = { substitute: (A, p, self, victim) => victim.card.name === PLANE, untargetable: (A, x) => hasPlane(A, x.owner) }; // ผู้โดยสาร
  E['BT05-039'] = { aura: (A, owner, src, a) => (a.owner !== owner ? -1 : 0) }; // กุมภกรรณ ทดน้ำ
  E['BT05-041'] = Object.assign(equipSelfTo('รถถัง', 'สวมใส่ให้ "รถถัง"'), { // จ่ายุทธ Tank Ranger
    onSummon: async (A, p) => {
      if (!A.avatars(p).some(a => A.named(a.card, 'รถถัง'))) return;
      const all = A.avatars(A.opp(p)).concat(A.avatars(p)).filter(a => A.isSym(a, 'ต่างชาติ')); if (!all.length) return;
      const v = await A.choose(p, 'ทำลาย Avatar {ต่างชาติ} 1 ใบ', all.map(a => A.avOpt(a, a.owner === p ? -5 : A.power(a))));
      const a = all.find(x => x.uid === v); if (a) await A.destroy(a, 'จ่ายุทธ', p);
    },
    onHostBattle: async (A, p, m, host, foe) => { if (A.named(host.card, 'รถถัง') && A.isSym(foe, 'ต่างชาติ')) A.toDeckBottom(foe); },
  });
  E['BT05-043'] = { // มยุราซัง ไอดอลยุค 80
    activateLabel: 'สวม "โอตะ" จากนรก (หรือ Deck) ให้ "ไอดอล"',
    canActivate: (A, p, a) => A.avatars(p).some(x => x !== a && A.named(x.card, IDOL)) && (A.hell(p).some(c => isAvatar(c.card) && A.named(c.card, OTA)) || (A.avatars(p).some(x => x.card.name === 'ทัตดนัยซัง โปรดิวเซอร์มือทอง') && A.deck(p).some(c => isAvatar(c.card) && A.named(c.card, OTA)))),
    activate: async (A, p, a) => {
      const fromDeck = A.avatars(p).some(x => x.card.name === 'ทัตดนัยซัง โปรดิวเซอร์มือทอง') && A.deck(p).some(c => isAvatar(c.card) && A.named(c.card, OTA)) && (!A.hell(p).some(c => isAvatar(c.card) && A.named(c.card, OTA)) || await A.choose(p, 'เลือก "โอตะ" จากไหน', [{ label: 'นรก', value: 0, score: 1 }, { label: 'Deck', value: 1, score: 0 }]) === 1);
      const zone = fromDeck ? A.deck(p) : A.hell(p);
      const idols = A.avatars(p).filter(x => x !== a && A.named(x.card, IDOL));
      const c = await A.pickFrom(p, zone, c => isAvatar(c) && A.named(c, OTA), 'เลือก "โอตะ"'); if (!c) return;
      const t = await A.choose(p, `สวม "${c.card.name}" ให้ใบไหน`, idols.map(x => A.avOpt(x, A.power(x))));
      A.takeFrom(zone, c); await A.attach(p, c, idols.find(x => x.uid === t) || idols[0]);
      if (fromDeck) A.shuffleDeck(p);
    },
  };
  E['BT05-044'] = { onAttack: async (A, p, a) => A.addPower(a, 1, 'endTurn'), interceptor: true }; // อาจารย์หลี
  E['BT05-049'] = { // รับซื้อของโจร
    canUse: (A, p) => A.hand(A.opp(p)).length > 0,
    magic: async (A, p) => { const h = A.hand(A.opp(p)); const c = h[A.rand(h.length)]; A.takeFrom(h, c); c.costOnly = { from: A.opp(p) }; A.hand(p).push(c); A.log(`${A.state.players[p].name} สุ่มหยิบ "${c.card.name}" จากมืออีกฝ่าย (ใช้ได้แค่เป็น Cost)`); },
  };
  E['BT05-050'] = { // พูดไทยได้ 5 คำ
    magic: async (A, p) => {
      await lookTopBottom(A, p, 5, [{ pred: c => isAvatar(c) && c.symbol === 'ต่างชาติ', title: 'นำ Avatar {ต่างชาติ} ขึ้นมือ' }], async c => {
        if ((c.card.cost || 0) <= 2 && A.roomFor(p, c.card) && await askYes(A, p, `อัญเชิญ "${c.card.name}" แทนการขึ้นมือ?`, 1)) await A.summonFrom(p, [], c, { jutti: false }); else A.toHand(p, c);
      });
    },
  };
  E['BT05-051'] = { // ง่วงมากก็ไปนอน !!!
    canUse: A => A.avatars(0).concat(A.avatars(1)).some(a => a.rested),
    magic: async (A, p) => {
      const all = A.avatars(A.opp(p)).concat(A.avatars(p)).filter(a => a.rested);
      const v = await A.choose(p, 'นำ Avatar สภาพนอนกลับเข้า Deck', all.map(a => A.avOpt(a, a.owner === p ? -5 : A.power(a))));
      const a = all.find(x => x.uid === v); if (!a) return;
      const pl = A.state.players.find(x => x.avatars.includes(a)); A.toDeckBottom(a); const q = a.owner; A.shuffleDeck(q); A.draw(q, 1); void pl;
    },
  };
  E['BT05-052'] = { // Jump Scare
    canUse: (A, p) => A.hand(p).length >= 2 && A.deck(p).length > 1,
    magic: async (A, p) => {
      await A.discard(p, 1);
      const d = A.deck(p); const c = d[A.rand(d.length)]; A.log(`อีกฝ่ายสุ่มได้ "${c.card.name}"`);
      if (isAvatar(c.card) && (c.card.cost || 0) <= 5 && A.roomFor(p, c.card)) await A.summonFrom(p, d, c, { jutti: false });
      else if (!isAvatar(c.card)) { A.hell(p).push(A.takeFrom(d, c)); A.log(`"${c.card.name}" ถูกส่งลงนรก`); }
      A.shuffleDeck(p);
    },
  };
  E['BT05-053'] = { canUse: (A, p) => A.avatars(A.opp(p)).length >= 5, magic: async (A, p) => { for (const a of A.avatars(A.opp(p)).slice()) await A.destroy(a, 'บ่อนแตก', p); } }; // บ่อนแตก
  E['BT05-054'] = { // เครื่องบิน Super Air: becomes an Avatar {หุ่นยนต์} Cost 5 GEM 0 POWER 5
    canUse: (A, p) => { const lg = A.state.players[p].summonLog; return A.roomFor(p, { symbol: 'หุ่นยนต์' }) && (!lg || lg.turn !== A.state.turn || lg.names.every(n => n.includes(SUPERAIR))); },
    magic: async (A, p, inst) => {
      inst.origCard = inst.card;
      inst.card = Object.assign({}, inst.card, { type: 'avatar', symbol: 'หุ่นยนต์', cost: 5, power: 5, gems: [], color: inst.card.color || 'green' });
      const placed = await A.putAvatar(p, inst, { jutti: false });
      A.state.players[p].summonOnlyName = { turn: A.state.turn, word: SUPERAIR };
      if (!placed) { inst.card = inst.origCard; delete inst.origCard; return {}; }
      return { stay: true };
    },
  };
  E['BT05-055'] = { // ตั๋วยืน
    canUse: (A, p) => hasPlane(A, p) && A.hand(p).length >= 2,
    magic: async (A, p) => {
      await A.discard(p, 1);
      for (let k = 0; k < 2 && A.roomFor(p); k++) { const c = await A.pickFrom(p, A.deck(p), c => c.name === 'ผู้โดยสาร Super Air', `อัญเชิญ "ผู้โดยสาร Super Air" (${k + 1}/2)`, true); if (!c) break; await A.summonFrom(p, A.deck(p), c, { jutti: false }); }
      A.shuffleDeck(p);
    },
  };
  E['BT05-056'] = { // พลังแห่งการตีพ่อตีแม่
    magic: async (A, p) => {
      const severe = A.state.players[p].life.every(l => l.faceUp);
      const ghosts = A.avatars(p).filter(a => A.isSym(a, 'เปรต'));
      const mode = severe ? 3 : await A.choose(p, 'เลือกปฏิบัติ', [{ label: '1) สวม "ตีพ่อ" และ "ตีแม่" จาก Deck ให้ {เปรต}', value: 1, score: ghosts.length ? 2 : -1 }, { label: '2) นำ {เปรต} จาก Deck ขึ้นมือ', value: 2, score: 1 }]);
      if ((mode & 1) && ghosts.length) {
        const v = await A.choose(p, 'เลือก Avatar {เปรต}', ghosts.map(x => A.avOpt(x, A.power(x)))); const g = ghosts.find(x => x.uid === v) || ghosts[0];
        for (const nm of ['ตีพ่อ', 'ตีแม่']) { const c = A.deck(p).find(x => x.card.name === nm); if (c) await A.attach(p, A.takeFrom(A.deck(p), c), g); }
      }
      if (mode & 2) await tutor(c => isAvatar(c) && c.symbol === 'เปรต', 'นำ Avatar {เปรต} จาก Deck ขึ้นมือ')(A, p);
      A.shuffleDeck(p);
    },
  };
  E['BT05-057'] = { // พระคุ้มครอง
    react: { on: 'battleStart', when: (A, p) => A.avatars(p).length >= 2, botScore: (A, p) => (A.avatars(A.opp(p)).filter(a => !a.rested).length >= 2 ? 1.5 : -1),
      run: async (A, p) => { const v = await A.choose(p, 'ส่ง Avatar 1 ใบลงนรก', A.avatars(p).map(x => A.avOpt(x, -A.power(x)))); const a = A.avatars(p).find(x => x.uid === v); if (a) { A.sendToHell(a); A.state.players[p].battleSafe = A.state.turn; A.log('Avatar ฝ่ายเราจะไม่ถูกทำลายจากการต่อสู้ในเทิร์นนี้'); } } },
  };
  E['BT05-058'] = E['KD02-017']; // อย่าให้มีครั้งที่ 2
  E['BT05-059'] = { // รหัสดำ
    canUse: (A, p) => { const av = A.avatars(p); const air = av.filter(a => A.named(a.card, SUPERAIR) && a.card.name !== PLANE && a.card.name !== 'คุณเชิดชัย Super Air'); return av.some(a => a.card.name === 'คุณเชิดชัย Super Air') && av.some(a => a.card.name === PLANE) && new Set(air.map(a => a.card.name)).size >= 2; },
    magic: async (A, p) => {
      const av = A.avatars(p); const send = [av.find(a => a.card.name === 'คุณเชิดชัย Super Air'), av.find(a => a.card.name === PLANE)];
      const seen = new Set(); for (const a of av) if (A.named(a.card, SUPERAIR) && !send.includes(a) && !seen.has(a.card.name) && seen.size < 2) { seen.add(a.card.name); send.push(a); }
      const o = A.opp(p); const down = A.state.players[o].life.filter(l => !l.faceUp).length;
      send.forEach(a => A.sendToHell(a));
      if (down <= 2) return A.win(p, 'รหัสดำ');
      A.flipLife(o, 3);
    },
  };
  E['BT05-061'] = { // แผนการ : เพดานถล่ม
    react: { on: 'attack', when: (A, p) => A.avatars(A.opp(p)).filter(a => a.rested).length >= 2, botScore: () => 2,
      run: async (A, p) => { const all = A.avatars(A.opp(p)).concat(A.avatars(p)).filter(a => a.rested); const v = await A.choose(p, 'ทำลาย Avatar สภาพนอน 1 ใบ', all.map(a => A.avOpt(a, a.owner === p ? -5 : A.power(a)))); const a = all.find(x => x.uid === v); if (a) await A.destroy(a, 'เพดานถล่ม', p); } },
  };
  E['BT05-062'] = { // ฮึบบบบบบบบบบบบ
    react: { on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'avatar', botScore: (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); return d && A.power(d) === A.power(ctx.attacker) ? 3 : -1; },
      run: async (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); if (d) { A.grantKw(d, ['ลูกฮึด']); A.log(`${d.card.name} ได้รับ ลูกฮึด`); } } },
  };
  E['BT05-063'] = { magic: true, equipOk: (A, a) => A.isSym(a, 'หุ่นยนต์'), lockSymbol: true }; // GHD โคลค
  E['BT05-064'] = { // ดาบศักดิ์สิทธิ์ อาลอนไดร์ท
    magic: true, equipOk: (A, a) => A.named(a.card, KNIGHT), equipPower: 1, noShieldOnAttack: true,
    hellActivateLabel: 'ธรณีสูบ 1: สวมดาบจากนรกให้ "อัศวินโต๊ะกลม"',
    canHellActivate: (A, p) => !A.magicUsed(p, 'modification') && A.deck(p).length > 1 && A.avatars(p).some(a => A.named(a.card, KNIGHT)),
    hellActivate: async (A, p, h) => {
      await A.mill(p, 1);
      const ks = A.avatars(p).filter(a => A.named(a.card, KNIGHT)); if (!ks.length || !A.hell(p).includes(h)) return;
      const v = await A.choose(p, 'สวมดาบให้ใบไหน', ks.map(x => A.avOpt(x, A.power(x))));
      A.markMagicUsed(p, 'modification'); await A.attach(p, A.takeFrom(A.hell(p), h), ks.find(x => x.uid === v) || ks[0]);
    },
  };
  E['BT05-065'] = { // กระบองแสง คทาวุธ
    magic: true,
    onEquippedAttack: async (A, p) => { A.blockReact(A.opp(p)); },
    onEquippedBattleWin: async (A, p, m, a) => { if (A.avatars(A.opp(p)).length) { A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`); } },
  };
  E['BT05-066'] = { // มนุษย์ดัดแปลง
    customEquip: true, magic: true,
    canUse: (A, p) => A.roomFor(p) && A.hand(p).length >= 2 && A.hell(p).some(c => isAvatar(c.card) && (c.card.cost || 0) <= 3),
    equipSymbol: 'หุ่นยนต์',
    onHell: (A, p, m, host) => { if (host && A.onField(host)) A.sendToHell(host); },
  };
  E['BT05-066'].magic = async (A, p, inst) => {
    const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && (c.cost || 0) <= 3, 'เลือก Avatar Cost ≤3 ในนรก'); if (!c) return;
    await A.discard(p, 1);
    if (await A.summonFrom(p, A.hell(p), c, { jutti: false }) && A.onField(c)) await A.attach(p, inst, c);
  };
  E['BT05-067'] = { // Hot Zone
    magic: true,
    activateLabel: 'สวม "Tank Ranger" จากมือให้ "รถถัง"',
    canActivate: (A, p) => A.avatars(p).some(a => A.named(a.card, 'รถถัง')) && A.hand(p).some(h => isAvatar(h.card) && A_named(h.card, 'Tank Ranger') && h.card.symbol === 'คน'),
    activate: async (A, p) => {
      const h = await A.pickFrom(p, A.hand(p), c => isAvatar(c) && A_named(c, 'Tank Ranger') && c.symbol === 'คน', 'เลือก "Tank Ranger" จากมือ'); if (!h) return;
      const tanks = A.avatars(p).filter(a => A.named(a.card, 'รถถัง')); const v = await A.choose(p, 'สวมให้รถถังใบไหน', tanks.map(x => A.avOpt(x, A.power(x))));
      await A.attach(p, A.takeFrom(A.hand(p), h), tanks.find(x => x.uid === v) || tanks[0]);
    },
  };
  E['BT05-068'] = { magic: true, zeroDies: true }; // ทรายดูด
  E['BT05-069'] = { magic: true, powerAsGem: 'ยักษ์' }; // กรุงลงกา
  E['BT05-070'] = { // ฐานหุ่นนักรบผู้กล้า ซีทันยาน
    magic: true,
    activateLabel: 'เทิร์นนี้ใช้ "อาวุธหุ่นนักรบผู้กล้า" ได้ 2 ใบ',
    canActivate: (A, p) => !A.magicUsed(p, 'modification'),
    activate: async (A, p) => { A.state.players[p].weaponMode = A.state.turn; A.log('เทิร์นนี้ใช้ Modification Magic "อาวุธหุ่นนักรบผู้กล้า" ได้ 2 ใบ (และใช้ใบอื่นไม่ได้)'); },
  };
  E['BT05-071'] = lifeNormalMagic; E['BT05-072'] = E['KD04-022']; E['BT05-073'] = lifeScout5; E['BT05-075'] = lifeDome;
  E['BT05-074'] = { // เฮ้ย รัททาทุย ตาย !
    life: async (A, p) => {
      if (!A.roomFor(p)) return;
      const h = await A.pickFrom(p, A.hand(p), c => isAvatar(c) && (c.cost || 0) <= 4 && !(E[c.id] || {}).noHandSummon, 'อัญเชิญ Avatar Cost ≤4 จากมือ (ไม่ต้องจ่าย)', true);
      if (h) await A.summonFrom(p, A.hand(p), h, { jutti: false });
    },
  };

  // ล้มโต๊ะ: both hands back into their decks, shuffle, each draws 4.
  // Owner's ruling: it can't be used unless both sides can draw all 4, and not when both decks would empty together.
  const flipTable = {
    canUse: (A, p) => {
      const left = [0, 1].map(q => A.state.players[q].deck.length + A.state.players[q].hand.length - (q === p ? 1 : 0) - 4);
      return left.every(n => n >= 0) && !left.every(n => n === 0);
    },
    magic: async (A, p) => {
      for (const q of [p, A.opp(p)]) {
        const pl = A.state.players[q];
        pl.deck.push(...pl.hand.splice(0));
        A.shuffleDeck(q);
      }
      A.log('ทั้งสองฝ่ายนำการ์ดบนมือกลับเข้า Deck แล้วสับ');
      A.draw(p, 4); A.draw(A.opp(p), 4);
    },
  };
  E['BT04-041'] = flipTable;

  // ================= BT06 =================
  const NAGA = 'นาค', SWORD = 'ดาบศักดิ์สิทธิ์', R18 = 'มนุษย์ดาว R18', SERVANT = 'ข้ารับใช้ของ มนุษย์ดาว R18', VALKYRIE = 'เทพธิดาแห่งวัลฮัลลา', BANK = 'แบงค์', POLE = 'เสามงคล';
  const isNaga = (A, a) => A.named(a.card, NAGA) && A.isSym(a, 'สัตว์วิเศษ');
  const nagaCard = c => isAvatar(c) && A_named(c, NAGA) && c.symbol === 'สัตว์วิเศษ';
  const severe = (A, p) => A.state.players[p].life.every(l => l.faceUp);
  const makeServant = (A, p, inst) => A.park(inst, p, { rename: { name: SERVANT, symbol: 'เอเลี่ยน' } });
  const servants = (A, p) => A.parked(p).filter(m => m.card.name === SERVANT);
  const bankNames = (A, p) => new Set(A.hell(p).filter(c => isAvatar(c.card) && A_named(c.card, BANK)).map(c => c.card.name)).size;
  const bigAtBattle = { atBattleStart: async (A, p, a) => { if (A.power(a) >= 7) { a.bigTurn = A.state.turn; A.log(`${a.card.name} POWER 7+ ได้รับความสามารถจนจบเทิร์น`); } } };
  E['BT06-001'] = Object.assign({ lifeNoTrigger: (A, a) => a.bigTurn === A.state.turn }, bigAtBattle); // วิรูฬ
  E['BT06-002'] = Object.assign({ lifeHits: (A, a) => (a.bigTurn === A.state.turn ? 2 : 1) }, bigAtBattle); // ฉัพพยา
  E['BT06-003'] = { // เอรา
    onSummon: async (A, p) => {
      const ns = A.avatars(p).filter(x => isNaga(A, x)); if (!ns.length) return;
      const v = await A.choose(p, 'Avatar "นาค" ใบไหน POWER +2', ns.map(x => A.avOpt(x, A.power(x))));
      const a = ns.find(x => x.uid === v); if (a) A.addPower(a, 2, 'forever');
    },
  };
  E['BT06-004'] = { // อนันต์ ราชาแห่งนาค
    activateLabel: 'นาค ใบอื่นมี POWER เท่าใบนี้จนจบเทิร์น',
    canActivate: (A, p, a) => A.avatars(p).some(x => x !== a && isNaga(A, x) && A.power(x) < A.power(a)),
    activate: async (A, p, a) => { const P = A.power(a); A.avatars(p).filter(x => x !== a && isNaga(A, x)).forEach(x => A.addPower(x, P - A.power(x), 'endTurn')); },
    onBattleWin: async (A, p) => { A.flipLife(A.opp(p), 1); },
  };
  E['BT06-005'] = { equipAnything: true }; // รีวิวแมน
  E['BT06-006'] = { // อาเธอร์
    uniqueOnField: true,
    onSummon: async (A, p) => {
      const sw = A.deck(p).filter(c => c.card.type === 'magic' && A_named(c.card, SWORD));
      if (sw.length < 2 || !A.roomFor(p) || !A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, KNIGHT))) return;
      if (!await askYes(A, p, 'อาเธอร์: ส่ง "ดาบศักดิ์สิทธิ์" 2 ใบจาก Deck ลงนรก เพื่ออัญเชิญ "อัศวินโต๊ะกลม"?', 2)) return;
      sw.slice(0, 2).forEach(c => A.hell(p).push(A.takeFrom(A.deck(p), c)));
      A.log(`ส่ง ${sw.slice(0, 2).map(c => c.card.name).join(', ')} ลงนรก`);
      const k = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && A_named(c, KNIGHT), 'อัญเชิญ "อัศวินโต๊ะกลม" จาก Deck');
      if (k) { await A.summonFrom(p, A.deck(p), k, { jutti: false }); A.freezeNames(p, [k.card.name]); A.log(`เทิร์นนี้ "${k.card.name}" โจมตีและใช้ความสามารถไม่ได้`); }
      A.shuffleDeck(p);
    },
  };
  E['BT06-007'] = { // เคย์
    onAllyTargeted: async (A, p, self, d) => {
      if (A.state.active === p || self.onceTurn === A.state.turn || !A.named(d.card, KNIGHT)) return;
      const sw = A.state.players[p].magicZone.filter(m => !m.parked && A_named(m.card, SWORD)); if (!sw.length) return;
      if (!await askYes(A, p, `เคย์: ส่ง "ดาบศักดิ์สิทธิ์" ลงนรก ให้ ${d.card.name} POWER +2?`, 2)) return;
      self.onceTurn = A.state.turn;
      const v = await A.choose(p, 'ส่งดาบใบไหนลงนรก', sw.map(m => A.cardOpt(m, 1)));
      A.destroyMagic(sw.find(m => m.uid === v) || sw[0]);
      if (A.onField(d)) A.addPower(d, 2, 'endTurn');
    },
  };
  E['BT06-008'] = { // ยอดนักบุญ
    onSummon: async (A, p, self) => {
      const ms = A.state.players[p].magicZone.filter(m => !m.parked && m.card.name === 'น้ำใจ' && m.attachedTo && m.attachedTo !== self.uid && A.avatars(p).some(a => a.uid === m.attachedTo));
      ms.forEach(m => { m.attachedTo = self.uid; }); if (ms.length) A.log(`ย้าย "น้ำใจ" ${ms.length} ใบมาสวมใส่ที่ ${self.card.name}`);
    },
    setPower: (A, p, a) => (A.attached(a).filter(m => m.card.name === 'น้ำใจ').length >= 4 ? 10 : (a.card.power || 0)),
  };
  E['BT06-009'] = { // โปรโตไมเกรน
    onBattleWin: async (A, p, self) => {
      const isM = c => isAvatar(c) && c.name === 'หุ่นนักรบผู้กล้า : ไมเกรน';
      if (!A.deck(p).some(c => isM(c.card)) || !await askYes(A, p, 'โปรโตไมเกรน: ส่งใบนี้ลงนรกแล้วอัญเชิญ จุติ "ไมเกรน" จาก Deck?', 2)) return;
      const eq = A.attached(self); eq.forEach(m => { m.attachedTo = null; });
      A.sendToHell(self);
      const c = await A.pickFrom(p, A.deck(p), isM, 'อัญเชิญ "ไมเกรน"');
      const okSum = c && await A.summonFrom(p, A.deck(p), c, { jutti: true }) && A.onField(c);
      eq.forEach(m => { if (okSum) { m.attachedTo = c.uid; A.log(`"${m.card.name}" ย้ายไปสวมใส่ ${c.card.name}`); } else A.destroyMagic(m); });
      A.shuffleDeck(p);
    },
  };
  E['BT06-010'] = { // พระอิศวรปลอม
    onSummon: async (A, p) => {
      const all = A.avatars(A.opp(p)).map(a => A.avOpt(a, A.power(a))).concat(A.avatars(p).map(a => A.avOpt(a, -5)));
      const v = await A.choose(p, 'เลือก Avatar POWER -2 จนจบเทิร์น', all);
      const a = A.avatars(0).concat(A.avatars(1)).find(x => x.uid === v); if (a) A.addPower(a, -2, 'endTurn');
    },
  };
  E['BT06-011'] = { // ไดโนกาฬสินธุ์ - สุธีธรนีซอรัส
    lastWill: async (A, p, self) => {
      if (!A.roomFor(p)) return;
      await lookTop(A, p, 3, c => isAvatar(c) && A_named(c, 'ไดโนกาฬสินธุ์') && (c.cost || 0) <= 3 && c.name !== self.card.name, 'อัญเชิญ "ไดโนกาฬสินธุ์" Cost ≤3',
        async c => { if (A.roomFor(p, c.card)) await A.summonFrom(p, [], c, { jutti: false }); else { A.deck(p).push(c); A.shuffleDeck(p); } });
    },
  };
  E['BT06-012'] = { // กัปตัน 7 สี
    onSummon: async (A, p, self) => {
      const cols = new Set(A.avatars(p).filter(x => x !== self).map(x => x.card.color));
      const opts = [];
      if (cols.has('red')) opts.push({ label: 'แดง: POWER +2', value: 'red', score: 2 });
      if (cols.has('blue')) opts.push({ label: 'ฟ้า: จั่ว 1 ใบ', value: 'blue', score: 3 });
      if (cols.has('purple')) opts.push({ label: 'ม่วง: ธรณีสูบ 1 แล้วนำการ์ดในนรก 1 ใบไว้ใต้ Deck', value: 'purple', score: 1 });
      if (cols.has('green')) opts.push({ label: 'เขียว: ไม่ถูกทำลายจนจบเทิร์น', value: 'green', score: 1.5 });
      const v = await A.choose(p, 'กัปตัน 7 สี: เลือกปฏิบัติ 1 อย่าง', opts, true);
      if (v === 'red' && A.onField(self)) A.addPower(self, 2, 'forever');
      if (v === 'blue') A.draw(p, 1);
      if (v === 'purple') { await A.mill(p, 1, self); const c = await A.pickFrom(p, A.hell(p), () => true, 'นำการ์ดในนรก 1 ใบไว้ใต้ Deck'); if (c) { A.deck(p).push(A.takeFrom(A.hell(p), c)); A.log(`"${c.card.name}" ไปอยู่ใต้ Deck`); } }
      if (v === 'green') { self.noDestroyTurn = A.state.turn; A.log(`${self.card.name} ไม่ถูกทำลายจนจบเทิร์น`); }
    },
  };
  E['BT06-014'] = { // สวีนนีย์ มนุษย์ดาว R18
    onBattleWin: async (A, p, a, r) => { const d = r.loser; if (A.hell(d.owner).includes(d)) makeServant(A, p, d); },
    lastWill: async (A, p) => {
      const ss = servants(A, p); if (!ss.length) return;
      const v = await A.choose(A.opp(p), 'เลือก "ข้ารับใช้" 1 ใบ ส่งลงนรกเจ้าของเดิม', ss.map(m => A.cardOpt(m, 1)));
      A.unparkToHell(ss.find(m => m.uid === v) || ss[0]);
    },
  };
  E['BT06-015'] = { continuousSelf: (A, p) => servants(A, p).length + A.avatars(p).filter(x => x.card.name === SERVANT).length }; // อามัส
  E['BT06-016'] = { // จอย
    activateLabel: 'อัญเชิญ "ข้ารับใช้" จาก Magic Zone จนจบเทิร์น',
    canActivate: (A, p) => servants(A, p).length > 0 && A.roomFor(p),
    activate: async (A, p) => {
      const ss = servants(A, p);
      const v = await A.choose(p, 'อัญเชิญ "ข้ารับใช้" ใบไหน', ss.map(m => A.cardOpt(m, m.card.power || 0)));
      const s = ss.find(m => m.uid === v); if (!s) return;
      if (await A.summonFrom(p, A.state.players[p].magicZone, s, { jutti: false })) A.atEndOfTurn(async () => { if (A.onField(s)) makeServant(A, p, s); });
    },
  };
  E['BT06-017'] = { extraSymbol: 'สัตว์' }; // วิลโล่ ปลาแกะ
  E['BT06-018'] = { // จ่ามะนาวแขนเหล็ก
    onAllyDestroyed: async (A, p, h, a) => {
      if (!A.named(a.card, 'จ่ามะนาว') || (a.card.cost || 0) > 3 || !A.roomFor(p, h.card)) return;
      const hand = A.hand(p);
      if (severe(A, p)) { if (await askYes(A, p, 'อัญเชิญ จ่ามะนาวแขนเหล็ก จากมือ (ไม่ต้องจ่าย Cost)?', 3)) await A.summonFrom(p, hand, h, { jutti: false }); return; }
      const pay = A.findPayment(p, hand.indexOf(h)); if (!pay) return;
      if (!await askYes(A, p, 'อัญเชิญ จ่ามะนาวแขนเหล็ก จากมือ (จ่าย Cost)?', 2)) return;
      const [inst, ...paid] = A.takeFromHand(p, [hand.indexOf(h), ...pay]);
      A.hell(p).push(...paid); A.log(`${A.state.players[p].name} อัญเชิญ ${inst.card.name} — ทิ้ง ${paid.map(x => x.card.name).join(', ')} เป็น GEM`);
      await A.putAvatar(p, inst, { paid });
    },
  };
  E['BT06-019'] = { // ผู้เจริญระดับสูงสุด
    activateLabel: 'นำ "เสามงคล" ไปไว้ที่ Magic Zone',
    canActivate: (A, p) => A.avatars(p).some(x => A.named(x.card, POLE)),
    activate: async (A, p) => {
      const ps = A.avatars(p).filter(x => A.named(x.card, POLE));
      const v = await A.choose(p, 'นำ "เสามงคล" ใบไหนไปที่ Magic Zone', ps.map(x => A.avOpt(x, 1)));
      const x = ps.find(y => y.uid === v); if (x) A.park(x, p);
    },
  };
  E['BT06-020'] = { continuousSelf: (A, p) => A.avatars(p).filter(x => ['กุ่ย', 'ฮอล', 'นาย'].some(w => A.named(x.card, w))).length }; // บอล
  E['BT06-021'] = { constructGem: 5 }; // ฮิฟีสตัส
  E['BT06-022'] = { // แบงค์ผู้พิชิต
    continuousSelf: (A, p) => (bankNames(A, p) >= 5 ? 2 : 0),
    onBattleWin: async (A, p) => { if (bankNames(A, p) >= 7) A.flipLife(A.opp(p), 1); },
    onAttack: async (A, p) => { if (bankNames(A, p) >= 10) { A.blockReact(A.opp(p)); A.log('อีกฝ่ายใช้ React Magic ไม่ได้จนจบการต่อสู้'); } },
    hellActivateLabel: 'ส่ง "แบงค์" 4 ใบลงนรก: อัญเชิญใบนี้จากนรก',
    canHellActivate: (A, p) => A.avatars(p).filter(x => A.named(x.card, BANK)).length >= 4,
    hellActivate: async (A, p, h) => {
      for (let k = 0; k < 4; k++) {
        const bs = A.avatars(p).filter(x => A.named(x.card, BANK));
        const v = await A.choose(p, `ส่ง "แบงค์" ลงนรก (${k + 1}/4)`, bs.map(x => A.avOpt(x, -A.power(x))));
        const b = bs.find(x => x.uid === v); if (b) A.sendToHell(b);
      }
      await A.summonFrom(p, A.hell(p), h, { jutti: false });
    },
  };
  E['BT06-023'] = { // อู๊ด คุณแม่
    activateLabel: 'เซ่นไหว้ + ธรณีสูบ 3: อัญเชิญ "แบงค์" จาก Deck',
    canActivate: (A, p) => A.deck(p).length > 4 && A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, BANK) && notOnly(c.card)),
    activate: async (A, p, a) => {
      await A.sacrifice(p, a); await A.mill(p, 3, a);
      const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && A_named(c, BANK) && notOnly(c), 'อัญเชิญ "แบงค์" จาก Deck');
      if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false });
      A.shuffleDeck(p);
    },
  };
  E['BT06-024'] = { // พี่หน่วง
    activateLabel: 'ทิ้ง 2: นำ Avatar อีกฝ่ายกับใบนี้ไปที่ Magic Zone',
    canActivate: (A, p) => A.hand(p).length >= 2 && A.avatars(A.opp(p)).length > 0,
    activate: async (A, p, self) => {
      await A.discard(p, 2);
      const v = await A.choose(p, 'นำ Avatar อีกฝ่ายใบไหนไปที่ Magic Zone เรา', bestOppAvatar(A, p));
      const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) A.park(d, p);
      if (A.onField(self)) A.park(self, p, { returnOnMain: true });
    },
  };
  E['BT06-025'] = { onBattleWin: async (A, p, a, r) => { const d = r.loser; if (A.hell(d.owner).includes(d)) { A.deck(d.owner).push(A.takeFrom(A.hell(d.owner), d)); A.shuffleDeck(d.owner); A.log(`${d.card.name} กลับเข้า Deck แทนการลงนรก`); } } }; // เลอติ๊ก
  E['BT06-026'] = { // แอชวิค (พอดี)
    onSummon: async (A, p, self) => {
      if (!self.exact || !A.roomFor(p)) return;
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && ['ผี', 'เปรต', 'เอเลี่ยน'].includes(c.symbol) && (c.cost || 0) <= 5, 'อัญเชิญ จุติ {ผี}/{เปรต}/{เอเลี่ยน} Cost ≤5 จากนรก', true);
      if (c) await A.summonFrom(p, A.hell(p), c, { jutti: true });
    },
  };
  E['BT06-027'] = { // สกัลด์
    onMilled: async (A, p, c, src) => {
      if (!milledByGod(src) || !A.roomFor(p)) return;
      const v = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, VALKYRIE) && (x.cost || 0) <= 4 && !A_named(x, 'สกัลด์'), 'สกัลด์: อัญเชิญ "เทพธิดาแห่งวัลฮัลลา" Cost ≤4 จากนรก', true);
      if (v) await A.summonFrom(p, A.hell(p), v, { jutti: false });
    },
  };
  E['BT06-028'] = { onMilled: async (A, p, c, src) => { if (milledByGod(src)) A.toHand(p, A.takeFrom(A.hell(p), c)); } }; // โอลรุน
  E['BT06-029'] = { activateLabel: 'ธรณีสูบ 3: POWER +1', canActivate: (A, p) => A.deck(p).length > 4, activate: async (A, p, a) => { await A.mill(p, 3, a); if (A.onField(a)) A.addPower(a, 1, 'forever'); } }; // ซีกรุน
  E['BT06-030'] = { // อาม่อน No.7
    onMilled: async (A, p, c) => { if (A.roomFor(p, c.card)) await A.summonFrom(p, A.hell(p), c, { jutti: false }); },
    lastWill: async (A, p, self) => { const h = A.hell(self.owner); if (h.includes(self)) { A.deck(self.owner).push(A.takeFrom(h, self)); A.log(`${self.card.name} กลับไปใต้ Deck แทนการลงนรก`); } },
  };
  E['BT06-031'] = { // งี่เง่า และ งอแง
    activateLabel: 'เลือก: เซ่นไหว้จั่ว 2 / ได้เตะไข่',
    activate: async (A, p, a) => {
      const v = await A.choose(p, 'งี่เง่า และ งอแง: เลือกปฏิบัติ', [{ label: 'เซ่นไหว้ใบนี้ จั่ว 2 ใบ', value: 1, score: 2 }, { label: 'ได้รับ เตะไข่ (ถูกทำลายใน End Phase)', value: 2, score: A.state.phase === 'battle' && A.power(a) > 0 && A.avatars(A.opp(p)).length ? 3 : 0 }]);
      if (v === 1) { await A.sacrifice(p, a); A.draw(p, 2); } else { A.grantKw(a, ['เตะไข่']); a.destroyAtEnd = true; A.log(`${a.card.name} ได้รับ เตะไข่`); }
    },
  };
  E['BT06-032'] = Object.assign({ equipPower: 1, equipKw: ['โล่มนุษย์'] }, equipSelfTo(PLANE, 'สวมใส่ให้ "เครื่องบิน Super Air"')); // พีเจี้ยน 3000
  E['BT06-033'] = { // เสาซินแสมงคล
    handActivateLabel: 'ส่ง ซินแส + เสามงคล ลงนรก: อัญเชิญ จุติ ใบนี้',
    canHandActivate: (A, p) => A.state.phase === 'main' && A.avatars(p).some(x => A.named(x.card, 'ซินแส')) && A.avatars(p).some(x => A.named(x.card, POLE)),
    handActivate: async (A, p, h) => {
      for (const w of ['ซินแส', POLE]) {
        const xs = A.avatars(p).filter(x => A.named(x.card, w));
        const v = await A.choose(p, `ส่ง "${w}" ลงนรก`, xs.map(x => A.avOpt(x, -A.power(x))));
        const x = xs.find(y => y.uid === v); if (x) A.sendToHell(x);
      }
      await A.summonFrom(p, A.hand(p), h, { jutti: true });
    },
    onSummon: async (A, p) => {
      for (let k = 0; k < 3; k++) {
        const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && A_named(c, POLE), `นำ "เสามงคล" จากนรกไปที่ Magic Zone (${k + 1}/3)`, true);
        if (!c) break; A.park(c, p);
      }
    },
    parkedAbilities: (A, a, m) => A_named(m.card, POLE),
    preventDestroy: async (A, p, a) => {
      const opts = A.parked(p).filter(m => A_named(m.card, POLE)).concat(A.avatars(p).filter(x => x !== a && A.named(x.card, POLE)));
      if (!opts.length || !await askYes(A, p, 'ส่ง "เสามงคล" ใบอื่นลงนรกแทน เสาซินแสมงคล?', 2)) return false;
      const v = await A.choose(p, 'ส่ง "เสามงคล" ใบไหนลงนรก', opts.map(x => A.cardOpt(x, 1)));
      const x = opts.find(y => y.uid === v) || opts[0];
      if (x.parked) A.unparkToHell(x); else A.sendToHell(x);
      return true;
    },
  };
  E['BT06-034'] = { // เสามงคล ทรงญี่ปุ่น
    cannotAttack: () => true,
    activateLabel: 'อัญเชิญ "ผู้เจริญ" จากมือ (ลงนรกตอนจบเทิร์น)',
    canActivate: (A, p) => A.roomFor(p) && A.hand(p).some(h => isAvatar(h.card) && A_named(h.card, 'ผู้เจริญ')),
    activate: async (A, p) => {
      const c = await A.pickFrom(p, A.hand(p), c => isAvatar(c) && A_named(c, 'ผู้เจริญ'), 'อัญเชิญ "ผู้เจริญ" จากมือ');
      if (!c || !await A.summonFrom(p, A.hand(p), c, { jutti: false }) || !A.onField(c)) return;
      A.addPower(c, 1, 'endTurn');
      A.atEndOfTurn(async () => { if (A.onField(c)) A.sendToHell(c); });
    },
  };
  E['BT06-035'] = { onSummon: async (A, p) => { await lookTopBottom(A, p, 5, [{ pred: c => c.type === 'construct', title: 'นำ Construct ขึ้นมือ' }], async c => A.toHand(p, c)); } }; // จ่านุ้ย ทหารช่าง
  E['BT06-036'] = { // เสนาธิการ อาณาจักรของแพง
    onSummon: async (A, p) => {
      const ks = A.avatars(p).filter(x => A.named(x.card, NIKOLAI)); if (!ks.length) return;
      const kv = await A.choose(p, 'เลือก พระเจ้านิโคไล', ks.map(x => A.avOpt(x, A.cost(x))));
      const k = ks.find(x => x.uid === kv); if (!k) return;
      const v = await A.choose(p, `ทำลาย Avatar อีกฝ่ายที่ Cost น้อยกว่า ${A.cost(k)}`, bestOppAvatar(A, p, x => A.cost(x) < A.cost(k)));
      const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) await A.destroy(d, 'เสนาธิการ', p);
    },
  };
  E['BT06-037'] = { // สว นาโนแมชชีน
    magicImmune: true, controlImmune: true,
    preventDestroy: async (A, p, a) => { const f = A.battleFoe(a); if (f && A.power(f) < 10) { A.log(`${a.card.name} ไม่ถูกทำลายจากการต่อสู้กับ Avatar POWER น้อยกว่า 10`); return true; } return false; },
  };
  E['BT06-038'] = { cannotAttack: () => true, noEquip: true }; // แมมมอธแช่แข็ง
  E['BT06-039'] = { onAttack: declareDestroy(KAPOM) }; // เรนะ นักล่าไดโนเสาร์
  E['BT06-040'] = { // แมวเก็นไมฉะ
    onSummon: async (A, p, self) => {
      const opts = [];
      if (A.roomFor(p) && A.hell(p).some(c => c.card.name === 'แมวมัทฉะ')) opts.push({ label: 'อัญเชิญ แมวมัทฉะ จากนรก', value: 1, score: 2 });
      if (A.avatars(p).filter(x => x !== self && DOGCAT(x.card)).length >= 2 && A.deck(p).some(c => c.card.name === 'คาเฟ่หมาแมว')) opts.push({ label: 'นำ คาเฟ่หมาแมว จาก Deck ขึ้นมือ', value: 2, score: 1 });
      const v = await A.choose(p, 'แมวเก็นไมฉะ: เลือกปฏิบัติ', opts, true);
      if (v === 1) { const c = A.hell(p).find(c => c.card.name === 'แมวมัทฉะ'); await A.summonFrom(p, A.hell(p), c, { jutti: false }); }
      if (v === 2) { const c = A.deck(p).find(c => c.card.name === 'คาเฟ่หมาแมว'); A.toHand(p, A.takeFrom(A.deck(p), c)); A.shuffleDeck(p); }
    },
  };
  E['BT06-045'] = { // งานวิจัยของพระพรหม
    canUse: (A, p) => A.avatars(p).some(a => A.named(a.card, 'พระพรหม')) || A.hand(p).length - 1 >= 3,
    magic: async (A, p) => {
      const n = A.hand(p).length; A.hell(p).push(...A.hand(p).splice(0)); A.log(`ทิ้งการ์ดบนมือทั้งหมด ${n} ใบ`);
      if (A.avatars(p).some(a => A.named(a.card, 'พระพรหม'))) await tutor(() => true, 'เลือกการ์ดจาก Deck ขึ้นมือ')(A, p);
      else if (n >= 3) A.draw(p, 5);
    },
  };
  E['BT06-046'] = { // คำสั่งของพระอิศวร
    canUse: (A, p) => A.avatars(A.opp(p)).length > 0 || A.constructs(A.opp(p)).length > 0,
    magic: async (A, p) => {
      const o = A.opp(p);
      const doAv = async () => { const v = await A.choose(p, 'Avatar อีกฝ่าย POWER -2', bestOppAvatar(A, p)); const a = A.avatars(o).find(x => x.uid === v); if (a) A.addPower(a, -2, 'forever'); };
      const doCs = async () => { const cs = A.constructs(o); const v = await A.choose(p, 'Construct อีกฝ่าย POWER -2', cs.map(c => A.cardOpt(c, 1))); const c = cs.find(x => x.uid === v); if (c) { c.powerMod = (c.powerMod || 0) - 2; A.log(`${c.card.name} POWER -2`); } };
      if (A.avatars(p).some(a => A.named(a.card, 'พระอิศวร'))) { await doAv(); await doCs(); return; }
      const opts = [];
      if (A.avatars(o).length) opts.push({ label: 'Avatar POWER -2', value: 1, score: 2 });
      if (A.constructs(o).length) opts.push({ label: 'Construct POWER -2', value: 2, score: 1 });
      const v = await A.choose(p, 'คำสั่งของพระอิศวร: เลือกปฏิบัติ', opts);
      if (v === 1) await doAv(); else if (v === 2) await doCs();
    },
  };
  E['BT06-047'] = { // จิตมุ่งมั่นของพระนารายณ์
    canUse: (A, p) => A.avatars(p).length > 0,
    magic: async (A, p) => {
      const max = A.avatars(p).some(a => A.named(a.card, 'พระนารายณ์')) ? 3 : 1; const done = [];
      for (let k = 0; k < max; k++) {
        const xs = A.avatars(p).filter(x => !done.includes(x));
        const v = await A.choose(p, `Avatar ฝ่ายเรา POWER +1 (${k + 1}/${max})`, xs.map(x => A.avOpt(x, A.power(x))), k > 0);
        const a = xs.find(x => x.uid === v); if (!a) break; done.push(a); A.addPower(a, 1, 'endTurn');
      }
    },
  };
  E['BT06-048'] = { // เฮือกสุดท้าย
    canUse: (A, p) => severe(A, p) && !A.state.magicUsed[p]['name:เฮือกสุดท้าย'],
    magic: async (A, p) => { A.draw(p, 4); A.state.magicUsed[p].normal = false; A.state.magicUsed[p]['name:เฮือกสุดท้าย'] = true; A.log('เทิร์นนี้ใช้ Normal Magic ได้อีก 1 ใบ'); },
  };
  const GENERAL = 'พลเอก';
  E['BT06-049'] = { // แผนลับของเหล่าพลเอก
    canUse: (A, p) => new Set(A.avatars(p).filter(x => A.named(x.card, GENERAL)).map(x => x.card.name)).size >= 3,
    magic: async (A, p) => {
      const used = [];
      for (let k = 0; k < 3; k++) {
        const xs = A.avatars(p).filter(x => A.named(x.card, GENERAL) && !used.includes(x.card.name));
        const v = await A.choose(p, `ส่ง "พลเอก" ลงนรก (${k + 1}/3)`, xs.map(x => A.avOpt(x, 1)));
        const x = xs.find(y => y.uid === v) || xs[0]; used.push(x.card.name); A.sendToHell(x);
      }
      const o = A.opp(p), op = A.state.players[o];
      op.avatars.slice().forEach(a => A.sendToHell(a));
      op.magicZone.slice().forEach(m => (m.parked ? A.unparkToHell(m) : A.destroyMagic(m)));
      op.constructs.splice(0).forEach(c => op.hell.push(c));
      if (A.state.land && A.state.land.owner === o) A.destroyMagic(A.state.land);
      op.hell.push(...op.hand.splice(0)); A.log(`การ์ดบนสนามและบนมือของ ${op.name} ถูกส่งลงนรกทั้งหมด`);
      const names = [];
      for (let k = 0; k < 3 && A.roomFor(p); k++) {
        const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && (A_named(c, 'ทหาร') || A_named(c, 'รด.')) && !names.includes(c.name), `อัญเชิญ "ทหาร" / "รด." จาก Deck (${k + 1}/3)`, true);
        if (!c) break; names.push(c.card.name); await A.summonFrom(p, A.deck(p), c, { jutti: false });
      }
      A.shuffleDeck(p);
    },
  };
  E['BT06-050'] = { react: { on: 'constructDestroy', botScore: () => 2, run: async () => ({ prevent: true }) } }; // ช่างมาแล้วววว
  E['BT06-051'] = { // ธาตุไฟแตก ๆ
    canUse: (A, p) => A.avatars(p).length > 0 && A.avatars(A.opp(p)).length > 0,
    magic: async (A, p) => {
      const v = await A.choose(p, 'ส่ง Avatar ฝ่ายเราลงนรก', A.avatars(p).map(x => A.avOpt(x, -A.power(x))));
      const x = A.avatars(p).find(y => y.uid === v); if (x) A.sendToHell(x);
      const d = A.dice(); A.log(`🎲 ทอยได้ ${d}`);
      if (d % 2 === 0) for (let k = 0; k < 2 && A.avatars(A.opp(p)).length; k++) { const t = await A.choose(p, `ทำลาย Avatar อีกฝ่าย (${k + 1}/2)`, bestOppAvatar(A, p)); const a = A.avatars(A.opp(p)).find(y => y.uid === t); if (a) await A.destroy(a, 'ธาตุไฟแตก ๆ', p); }
      else if (A.avatars(p).length) { const t = await A.choose(p, 'ทำลาย Avatar ฝ่ายเรา 1 ใบ', A.avatars(p).map(y => A.avOpt(y, -A.power(y)))); const a = A.avatars(p).find(y => y.uid === t); if (a) await A.destroy(a, 'ธาตุไฟแตก ๆ'); }
    },
  };
  E['BT06-052'] = { // เสียงเรียกแห่งวัลฮัลลา
    react: {
      on: 'attack', when: (A, p) => severe(A, p) && A.deck(p).length > 5, botScore: () => 5,
      run: async (A, p, ctx, inst) => {
        await A.mill(p, 5, inst);
        for (let k = 0; k < 4 && A.roomFor(p); k++) {
          const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && A_named(c, VALKYRIE), `อัญเชิญ "เทพธิดาแห่งวัลฮัลลา" จากนรก (${k + 1}/4)`, true);
          if (!c) break; await A.summonFrom(p, A.hell(p), c, { jutti: false });
        }
        return { cancelAttack: true };
      },
    },
    onMilled: async (A, p, c, src) => { if (milledByGod(src)) A.toHand(p, A.takeFrom(A.hell(p), c)); },
  };
  E['BT06-053'] = { // พลังแฝง
    react: {
      on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'avatar',
      botScore: (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); const ap = A.power(ctx.attacker); return d && A.power(d) <= ap && A.power(d) + 2 > ap ? 3 : -1; },
      run: async (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); if (d) A.addPower(d, 2, 'endTurn'); },
    },
  };
  E['BT06-054'] = { magic: true, equipOk: (A, a) => isNaga(A, a), equipPower: 2 }; // ลูกแก้วนาคา
  E['BT06-055'] = { // ไสยเวท ย้อนกลับ
    magic: true,
    onEquippedAttack: async (A, p, m, a) => {
      if (m.useTurn !== A.state.turn) { m.useTurn = A.state.turn; m.uses = 0; }
      if (m.uses >= 4 || A.deck(p).length < 3) return; m.uses++;
      const got = await A.mill(p, 2, m);
      if (got.some(c => c.card.type === 'magic') && A.onField(a)) { A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น (ไสยเวท ย้อนกลับ)`); }
    },
  };
  E['BT06-056'] = { // เท่ระเบิด !!!!
    magic: true, equipOk: (A, a) => A.named(a.card, 'ทหาร') || A.named(a.card, 'รด.'),
    onEquippedAttack: async (A, p, m, a) => { A.addPower(a, 5, 'endTurn'); a.destroyAfterBattle = true; },
  };
  E['BT06-057'] = { magic: true, equipOk: (A, a) => A.isSym(a, 'ฤษี'), onHostBattle: async (A, p, m, x, y) => { A.addPower(y, -1, 'endTurn'); } }; // กองถ่ายฤาษี
  E['BT06-058'] = { // ดาบศักดิ์สิทธิ์ แกลลาติน
    magic: true, equipOk: (A, a) => A.named(a.card, KNIGHT), magicShieldAwake: true,
    hellActivateLabel: E['BT05-064'].hellActivateLabel, canHellActivate: E['BT05-064'].canHellActivate, hellActivate: E['BT05-064'].hellActivate,
  };
  E['BT06-059'] = { // นรกในกรง
    maxAvatars: 3,
    magic: async (A) => {
      for (const q of [0, 1]) while (A.avatars(q).length > 3) {
        const v = await A.choose(q, 'นรกในกรง: ส่ง Avatar ลงนรกจนเหลือ 3 ใบ', A.avatars(q).map(x => A.avOpt(x, -A.power(x))));
        A.sendToHell(A.avatars(q).find(x => x.uid === v) || A.avatars(q)[0]);
      }
    },
  };
  const dogCatAnimal = (A, a) => A.isSym(a, 'สัตว์') && (A.named(a.card, 'หมา') || A.named(a.card, 'แมว'));
  E['BT06-060'] = { // คาเฟ่หมาแมว
    magic: true,
    landEndPhase: async (A, p, land) => {
      if ((land.usedBy || [])[p] === A.state.turn) return;
      const mine = A.avatars(p).filter(x => dogCatAnimal(A, x)); if (!mine.length || !A.deck(p).some(c => DOGCAT(c.card))) return;
      if (!await askYes(A, p, 'คาเฟ่หมาแมว: สลับ "หมา"/"แมว" กับใบใน Deck?', 1)) return;
      land.usedBy = land.usedBy || []; land.usedBy[p] = A.state.turn;
      const v = await A.choose(p, 'นำ "หมา"/"แมว" ใบไหนกลับเข้า Deck', mine.map(x => A.avOpt(x, -A.power(x))));
      const x = mine.find(y => y.uid === v) || mine[0]; const nm = x.card.name;
      if (A.state.players[x.owner].avatars.includes(x)) { const pl = A.state.players[x.owner]; A.toDeckBottom(x); A.shuffleDeck(x.owner); void pl; }
      const c = await A.pickFrom(p, A.deck(p), c => DOGCAT(c) && c.name !== nm, 'อัญเชิญ "หมา"/"แมว" จาก Deck');
      if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false });
      A.shuffleDeck(p);
      const ds = A.avatars(p).filter(y => dogCatAnimal(A, y));
      const t = await A.choose(p, '"หมา"/"แมว" ใบไหน POWER +1', ds.map(y => A.avOpt(y, A.power(y))));
      const d = ds.find(y => y.uid === t); if (d) A.addPower(d, 1, 'forever');
    },
  };
  E['BT06-061'] = { magic: true, handCostMod: (A, p, c) => (isAvatar(c) && A_named(c, BANK) ? -1 : 0), colorlessGem: pc => isAvatar(pc) && A_named(pc, BANK) }; // สภาแบงค์
  E['BT06-062'] = { magic: true, aura: (A, owner, src, a) => (isNaga(A, a) ? 1 : 0) }; // ถ้ำนาคา
  E['BT06-063'] = { // ประตูวัลฮัลลา
    magic: true,
    activateLabel: 'ธรณีสูบ 2: นำ "เทพธิดาแห่งวัลฮัลลา" จากนรกขึ้นมือ',
    canActivate: (A, p) => A.deck(p).length > 3,
    activate: async (A, p, land) => {
      await A.mill(p, 2, land);
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && A_named(c, VALKYRIE), 'นำ "เทพธิดาแห่งวัลฮัลลา" ขึ้นมือ');
      if (c) A.toHand(p, A.takeFrom(A.hell(p), c));
    },
  };
  E['BT06-064'] = { aura: (A, p, src, a) => (a.owner === p && A.state.active === p && A.state.phase === 'battle' ? 1 : 0) }; // เวทีเพื่อชีวิต
  E['BT06-065'] = { // รูปปั้นพระอิศวร
    drawPhase: async (A, p) => {
      if (A.deck(p).length < 3 || !await askYes(A, p, 'รูปปั้นพระอิศวร: สอดแนม 2 ใบ นำการ์ด {เทพ} ขึ้นมือแทนการจั่ว?', 1)) return false;
      await lookTopBottom(A, p, 2, [{ pred: c => c.symbol === 'เทพ', title: 'นำการ์ด {เทพ} ขึ้นมือ' }], async c => A.toHand(p, c));
      return true;
    },
  };
  E['BT06-066'] = { // ยานสำรวจ R18
    activateLabel: 'นำ Avatar Cost 5+ จากนรกอีกฝ่ายมาเป็น "ข้ารับใช้"',
    canActivate: (A, p) => A.avatars(p).some(a => A.named(a.card, R18)) && A.hell(A.opp(p)).some(c => isAvatar(c.card) && (c.card.cost || 0) >= 5),
    activate: async (A, p) => {
      const c = await A.pickFrom(p, A.hell(A.opp(p)), c => isAvatar(c) && (c.cost || 0) >= 5, 'เลือก Avatar ในนรกอีกฝ่าย');
      if (c) makeServant(A, p, c);
    },
  };
  E['BT06-067'] = { kwAura: (A, src, a) => ((a.card.cost || 0) <= 2 ? ['สามัคคี'] : []) }; // กองไฟลูกเสือ
  E['BT06-068'] = { noLifeAttack: true }; // ป้อมยาม
  E['BT06-070'] = { // ตู้วารีบำบัด
    drawPhase: async (A, p, c) => {
      if (!A.state.players[p].life.some(l => l.faceUp) || !await askYes(A, p, 'ตู้วารีบำบัด: ทำลายใบนี้เพื่อคว่ำ LIFE 1 ใบ?', 2)) return false;
      if (await A.destroyConstruct(c, 'ตู้วารีบำบัด')) A.unflipLife(p);
      return false;
    },
  };

  // Reprints (same card name in a later set) use the implementation of the original printing
  (function () {
    const norm = t => String(t || '').replace(/\([^)]*\)/g, '').replace(/#.*$/gm, '').replace(/[\s.,:;!"'“”‘’\-–—]/g, '');
    const byName = {};
    (root.TC_CARDS || []).forEach(c => { if (E[c.id]) (byName[c.name] = byName[c.name] || []).push(c); });
    (root.TC_CARDS || []).forEach(c => {
      if (E[c.id] || !c.text || !byName[c.name]) return;
      const src = byName[c.name].find(o => norm(o.text) === norm(c.text));
      if (src) E[c.id] = E[src.id];
    });
  })();

  root.TC_EFFECTS = E;
  if (typeof module !== 'undefined') module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
