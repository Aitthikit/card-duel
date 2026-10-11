// Card effects: starter decks (KD00–KD04), BT01–BT11, CC01–CC02, promos, and a few single cards.
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

  // ================= BT07 =================
  const GARUDA = 'ครุฑ', FLARE = 'ขนมณี แฟลร์', SNOWMAN = 'ทหารหิมะ', NUANG = 'พี่หน่วง', SHOWSHIP = 'ยานรายการ เถียงทันหน่วง', MAGE = 'จอมเวท', SPELL = 'คาถา', COP = 'ตำรวจ', HOPPER = 'ตั๊กแตน';
  const isGaruda = c => isAvatar(c) && A_named(c, GARUDA) && c.symbol === 'สัตว์วิเศษ';
  const garudaOrFlare = c => isGaruda(c) || c.name === FLARE;
  const hasOnField = (A, p, w) => A.avatars(p).some(a => A.named(a.card, w));
  const hopperish = c => A_named(c, HOPPER) || (c.text || '').includes(HOPPER);
  // a card's own LIFE ability, used right now (วันชัยเปรตรุ่นพ่อ, ตั๊กแตนหยิน)
  const useLifeNow = async (A, p, l) => { const f = A.lifeFx(l.card.id); if (f) { A.log(`ใช้ความสามารถ LIFE "${l.card.name}"`); await f(A, p, l); } else A.log(`"${l.card.name}" ไม่มีความสามารถ LIFE ที่ใช้ได้`); };
  const flipTopOwn = (A, p) => { const l = A.state.players[p].life.find(x => !x.faceUp); if (l && A.flipLife(p, 1)) return l; return null; };
  const garudaCostUsed = async (A, p, c) => { // ครุฑปรเมศวร: used as a cost of a {สัตว์วิเศษ} ability
    if (c.card.id !== 'BT07-016') return;
    const f = A.deck(p).find(x => x.card.name === FLARE); if (!f) return;
    A.toHand(p, A.takeFrom(A.deck(p), f)); A.shuffleDeck(p);
  };
  const summonGarudaFromDeck = async (A, p, title) => {
    const c = await A.pickFrom(p, A.deck(p), c => isGaruda(c) && (c.cost || 0) <= 4, title || 'อัญเชิญ "ครุฑ" Cost ≤4 จาก Deck', true);
    const ok = c && A.roomFor(p, c.card) && await A.summonFrom(p, A.deck(p), c, { jutti: false });
    A.shuffleDeck(p);
    return ok ? c : null;
  };
  const declareTop = async (A, p, q) => { // declare the type of q's top card, then look at it
    const top = A.deck(q)[0]; if (!top) return null;
    const v = await A.choose(p, 'ประกาศประเภทการ์ดใบบนสุดของ Deck อีกฝ่าย', [{ label: 'Avatar', value: 'avatar', score: 2 }, { label: 'Magic', value: 'magic', score: 1 }, { label: 'Construct', value: 'construct', score: 0 }]);
    A.log(`ประกาศ ${v} — การ์ดบนสุดคือ "${top.card.name}" (${top.card.type})`);
    return top.card.type === v ? top : false;
  };
  const toOwnerHand = (A, m) => { // a card in a Magic Zone goes back to its owner's hand
    if (m.parked) { A.unparkToHell(m); A.toHand(m.owner, A.takeFrom(A.hell(m.owner), m)); return; }
    const holder = A.state.players.find(x => x.magicZone.includes(m)); if (!holder) return;
    holder.magicZone.splice(holder.magicZone.indexOf(m), 1); m.attachedTo = null; A.toHand(m.owner, m);
  };
  E['BT07-001'] = { // วันชัยเปรตรุ่นพ่อ
    continuousSelf: A => A.state.players.reduce((n, pl) => n + pl.life.filter(l => l.faceUp).length, 0),
    activateLabel: 'หงาย LIFE ใบบนสุด แล้วใช้ความสามารถของใบนั้น',
    canActivate: (A, p) => A.state.players[p].life.filter(l => !l.faceUp).length > 1,
    activate: async (A, p) => { const l = flipTopOwn(A, p); if (l) await useLifeNow(A, p, l); },
  };
  E['BT07-002'] = { // พระแม่อุมาเทวี
    onSummon: async (A, p) => {
      if (!A.hand(p).length || !A.hell(p).some(c => c.card.symbol === 'เทพ' && notOnly(c.card))) return;
      if (!await askYes(A, p, 'ทิ้ง 1 ใบ เพื่อนำการ์ด {เทพ} จากนรกขึ้นมือ?', 1)) return;
      await A.discard(p, 1);
      const c = await A.pickFrom(p, A.hell(p), c => c.symbol === 'เทพ' && notOnly(c), 'นำการ์ด {เทพ} จากนรกขึ้นมือ'); if (c) A.toHand(p, A.takeFrom(A.hell(p), c));
    },
    activateLabel: 'ส่งลงนรก: อัญเชิญ จุติ เจ้าแม่กาลี',
    canActivate: (A, p) => A.avatars(A.opp(p)).some(a => A.named(a.card, 'พระอิศวร') && a.trueOwner != null) && A.deck(p).concat(A.hand(p)).some(c => c.card.name === 'เจ้าแม่กาลี'),
    activate: async (A, p, self) => {
      A.sendToHell(self);
      const c = await A.pickFrom(p, A.hand(p).concat(A.deck(p)), c => c.name === 'เจ้าแม่กาลี', 'อัญเชิญ จุติ เจ้าแม่กาลี');
      if (!c) return; const fromDeck = A.deck(p).includes(c);
      await A.summonFrom(p, fromDeck ? A.deck(p) : A.hand(p), c, { jutti: true }); if (fromDeck) A.shuffleDeck(p);
    },
  };
  E['BT07-003'] = { // เจ้าแม่กาลี
    onSummon: async (A, p) => {
      const gods = A.avatars(A.opp(p)).filter(a => A.isSym(a, 'เทพ'));
      if (!gods.length) { A.draw(p, 1); return; }
      const v = await A.choose(p, 'ทำลาย Avatar {เทพ} อีกฝ่าย', gods.map(a => A.avOpt(a, A.power(a))));
      await A.destroy(gods.find(a => a.uid === v) || gods[0], 'เจ้าแม่กาลี', p);
    },
  };
  E['BT07-004'] = { // พรีวิวบอย
    activateLabel: 'POWER + POWER ของ Avatar ฝ่ายเรา 1 ใบ',
    canActivate: (A, p, a) => A.avatars(p).some(x => x !== a && A.power(x) > 0),
    activate: async (A, p, a) => { const xs = A.avatars(p).filter(x => x !== a); const v = await A.choose(p, 'เลือก Avatar ฝ่ายเรา', xs.map(x => A.avOpt(x, A.power(x)))); const x = xs.find(y => y.uid === v); if (x) A.addPower(a, A.power(x), 'endTurn'); },
  };
  E['BT07-005'] = { onSummon: async (A, p, self) => { if (self.exact) await tutor(c => c.type === 'magic' && (c.symbol || '').includes('ฤษี'), 'นำ Magic {ฤๅษี} จาก Deck ขึ้นมือ')(A, p); } }; // ฤๅษีพระเจ้าตา (พอดี)
  E['BT07-006'] = { // อนันตวดี ราชินีแห่งนาค
    payOnlyFor: c => c.symbol === 'สัตว์วิเศษ',
    gemAs: (A, p, pc, target) => (target.id === 'BT06-004' ? 6 : null),
    onPaidAsCost: async (A, p, pc, s) => { if (nagaCard(s.card)) A.addPower(s, 3, 'endTurn'); },
  };
  E['BT07-007'] = { gemAs: (A, p) => (new Set(A.hell(p).filter(c => isAvatar(c.card)).map(c => c.card.name)).size >= 10 ? 8 : null) }; // สัตว์ทดลอง #1
  E['BT07-008'] = { // ตำรวจไซบอร์ค จ่านิ่ง
    activateLabel: 'อีกฝ่ายจั่ว 1 แล้ววางการ์ดจากมือ 1 ใบไว้บน Deck',
    canActivate: (A, p) => A.deck(A.opp(p)).length > 1,
    activate: async (A, p) => {
      const o = A.opp(p); A.draw(o, 1); if (!A.hand(o).length) return;
      const v = await A.choose(o, 'แสดงการ์ดบนมือ 1 ใบ วางไว้บนสุดของ Deck', A.hand(o).map(h => A.cardOpt(h, -A.cardOpt(h).score)));
      const h = A.hand(o).find(x => x.uid === v) || A.hand(o)[0]; A.deck(o).unshift(A.takeFrom(A.hand(o), h)); A.log(`"${h.card.name}" ไปอยู่บนสุดของ Deck`);
    },
  };
  const getWeapon = n => async (A, p) => { await lookTopBottom(A, p, n, [{ pred: c => c.name === 'อาวุธชีวภาพ เอ็มตัวเต็ง', title: 'นำ อาวุธชีวภาพ เอ็มตัวเต็ง ขึ้นมือ' }], async c => A.toHand(p, c)); };
  E['BT07-009'] = { onSummon: getWeapon(7), lastWill: getWeapon(3) }; // เจมี่ ขยะสังคม
  E['BT07-010'] = { onAttack: async (A, p, a, tgt) => { const d = tgt && tgt.kind === 'avatar' && A.avatars(A.opp(p)).find(x => x.uid === tgt.uid); if (d && A.power(d) <= 3) await A.destroy(d, 'น้องไอซ์', p); } }; // น้องไอซ์ จี่สมอง
  E['BT07-011'] = { // ไอ้แม๊ก ขยะสังคม
    lastWill: async (A, p) => {
      const ms = A.state.players[A.opp(p)].magicZone; if (!ms.length) return;
      const v = await A.choose(p, 'นำการ์ดใน Magic Zone อีกฝ่าย 1 ใบกลับขึ้นมือเจ้าของ', ms.map(m => A.cardOpt(m, 1)));
      toOwnerHand(A, ms.find(m => m.uid === v) || ms[0]);
    },
  };
  E['BT07-012'] = { // ครุฑสุบรรณ เจ้าเวหา
    activateLabel: 'นำ "ครุฑ"/ขนมณี แฟลร์ สูงสุด 3 ใบกลับ Deck: อัญเชิญ "ครุฑ"',
    canActivate: (A, p) => A.deck(p).some(c => isGaruda(c.card) && (c.card.cost || 0) <= 4),
    activate: async (A, p, self) => {
      let n = 0;
      for (let k = 0; k < 3; k++) {
        const pool = A.avatars(p).filter(x => x !== self && isGaruda(x.card)).concat(A.state.players[p].magicZone.filter(m => !m.parked && m.card.name === FLARE));
        const v = await A.choose(p, `นำ "ครุฑ" หรือ ขนมณี แฟลร์ กลับเข้า Deck (${k + 1}/3)`, pool.map(x => A.cardOpt(x, 1 - k)), k > 0);
        const x = pool.find(y => y.uid === v); if (!x) break;
        if (x.card.type === 'avatar') { A.sendToHell(x); A.deck(p).push(A.takeFrom(A.hell(x.owner), x)); await garudaCostUsed(A, p, x); }
        else { A.destroyMagic(x); A.deck(p).push(A.takeFrom(A.hell(x.owner), x)); }
        A.log(`"${x.card.name}" กลับเข้า Deck`); n++;
      }
      if (!n) return;
      A.shuffleDeck(p);
      const c = await summonGarudaFromDeck(A, p);
      if (c && n === 1) A.atEndOfTurn(async () => { if (A.onField(c)) A.bounce(c); });
      if (c && n === 3) A.addPower(c, 2, 'endTurn');
    },
  };
  E['BT07-013'] = { // ครุฑเวนไตย เจ้ากำลัง
    activateLabel: 'นำ "ครุฑ"/ขนมณี แฟลร์ จากนรกไว้ใต้ Deck: POWER +3',
    canActivate: (A, p, a) => A.hell(p).some(c => garudaOrFlare(c.card) && c.card.name !== a.card.name),
    activate: async (A, p, a) => {
      const c = await A.pickFrom(p, A.hell(p), c => garudaOrFlare(c) && c.name !== a.card.name, 'นำการ์ดจากนรกไว้ใต้ Deck');
      if (c) { A.deck(p).push(A.takeFrom(A.hell(p), c)); A.addPower(a, 3, 'endTurn'); }
    },
  };
  E['BT07-014'] = { // ครุฑวัสสวัส เจ้าโลก
    onSummon: async (A, p) => {
      if (!A.roomFor(p)) return;
      const c = await A.pickFrom(p, A.hell(p), garudaOrFlare, 'นำ "ครุฑ"/ขนมณี แฟลร์ จากนรกไว้ใต้ Deck เพื่ออัญเชิญ "ครุฑ"?', true);
      if (!c) return; A.deck(p).push(A.takeFrom(A.hell(p), c)); await summonGarudaFromDeck(A, p);
    },
  };
  E['BT07-015'] = { // ครุฑสัจจะ เจ้าแห่งแสง
    onSummon: async (A, p) => {
      if (!A.roomFor(p)) return;
      const c = await A.pickFrom(p, A.hand(p), garudaOrFlare, 'ทิ้ง "ครุฑ"/ขนมณี แฟลร์ จากมือ เพื่ออัญเชิญ "ครุฑ"?', true);
      if (!c) return; A.hell(p).push(A.takeFrom(A.hand(p), c)); await garudaCostUsed(A, p, c); await summonGarudaFromDeck(A, p);
    },
  };
  E['BT07-017'] = { lastWill: async (A, p) => { const w = A.hell(p).find(c => A_named(c.card, 'วอเตอร์แมน')); if (w) { A.deck(p).push(A.takeFrom(A.hell(p), w)); A.shuffleDeck(p); } A.draw(p, 1); } }; // คุณตะพาบ
  E['BT07-018'] = { handCost: (A, p, c) => (c.cost || 0) - A.hell(p).filter(h => isAvatar(h.card) && A_named(h.card, SNOWMAN)).length }; // ราชาหิมะ บิง
  E['BT07-019'] = { continuousSelf: (A, p) => 2 * A.avatars(p).filter(x => A.named(x.card, SNOWMAN)).length + 3 * A.avatars(p).filter(x => A.named(x.card, 'ราชาหิมะ')).length }; // ราชินีหิมะ
  (root.TC_CARDS || []).forEach(c => { if (c.id === 'BT07-020' && !c.limit) c.limit = 12; }); // พลทหารหิมะ: up to 12 per deck
  E['BT07-020'] = { deckLimit: 12 };
  E['BT07-021'] = { // อัศวินแบงค์
    setPower: (A, p, a) => (a.altBaseTurn === a.summonedTurn ? 3 : (a.card.power || 0)),
    handActivateLabel: 'ทิ้งการ์ด GEM รวม 3: อัญเชิญ (POWER 3)',
    canHandActivate: (A, p, h) => A.state.phase === 'main' && A.roomFor(p, h.card) && subsetSum(A.hand(p).filter(x => x !== h && A.gem(x.card) > 0).map(x => A.gem(x.card)), 3),
    handActivate: async (A, p, h) => {
      let left = 3;
      while (left > 0) {
        const rest = A.hand(p).filter(x => x !== h && A.gem(x.card) > 0 && A.gem(x.card) <= left && subsetSum(A.hand(p).filter(y => y !== h && y !== x && A.gem(y.card) > 0).map(y => A.gem(y.card)), left - A.gem(x.card)));
        const v = await A.choose(p, `ทิ้งการ์ด (ต้องการ GEM อีก ${left})`, rest.map(x => A.cardOpt(x, -A.cardOpt(x).score)));
        const x = rest.find(y => y.uid === v) || rest[0]; if (!x) return;
        left -= A.gem(x.card); A.hell(p).push(A.takeFrom(A.hand(p), x));
      }
      h.altBaseTurn = A.state.turn; await A.summonFrom(p, A.hand(p), h, { jutti: false });
    },
  };
  E['BT07-022'] = { // ชาช่าจัง ไอดอลคนเก่ง
    cannotAttack: (A, a) => a.canAttackTurn !== A.state.turn, equipOnly: c => A_named(c, OTA),
    activateLabel: 'ทำลาย "โอตะ" ของ "ไอดอล": เทิร์นนี้โจมตีได้',
    canActivate: (A, p) => A.state.players[p].magicZone.some(m => A_named(m.card, OTA) && A.avatars(p).some(a => a.uid === m.attachedTo && A.named(a.card, IDOL))),
    activate: async (A, p, self) => {
      const ms = A.state.players[p].magicZone.filter(m => A_named(m.card, OTA) && A.avatars(p).some(a => a.uid === m.attachedTo && A.named(a.card, IDOL)));
      const v = await A.choose(p, 'ทำลาย "โอตะ" ใบไหน', ms.map(m => A.cardOpt(m, 1)));
      A.destroyMagic(ms.find(m => m.uid === v) || ms[0]); self.canAttackTurn = A.state.turn;
    },
  };
  const hasLastWill = (A, a) => !!(A.fx(a.card.id) || {}).lastWill || (a.card.text || '').includes('คำสั่งเสีย');
  E['BT07-023'] = { // พี่หน่วง พิธีกรผมสวย
    onSummon: async (A, p) => {
      const c = await A.pickFrom(p, A.deck(p).concat(A.hell(p)), c => c.name === SHOWSHIP, 'นำ "ยานรายการ เถียงทันหน่วง" ขึ้นมือ', true);
      if (!c) return; const fromDeck = A.deck(p).includes(c);
      A.toHand(p, A.takeFrom(fromDeck ? A.deck(p) : A.hell(p), c)); if (fromDeck) A.shuffleDeck(p);
    },
    activateLabel: 'ทิ้ง 1: นำ Avatar อีกฝ่าย (สามัคคี/เตะไข่/โล่มนุษย์/คำสั่งเสีย) มาไว้ Magic Zone เรา',
    canActivate: (A, p) => A.hand(p).length > 0 && A.constructs(p).some(c => c.card.name === SHOWSHIP) && A.avatars(A.opp(p)).some(a => ['สามัคคี', 'เตะไข่', 'โล่มนุษย์'].some(k => A.hasKw(a.card, k)) || hasLastWill(A, a)),
    activate: async (A, p) => {
      await A.discard(p, 1);
      const v = await A.choose(p, 'นำ Avatar อีกฝ่ายมาไว้ Magic Zone เรา', bestOppAvatar(A, p, a => ['สามัคคี', 'เตะไข่', 'โล่มนุษย์'].some(k => A.hasKw(a.card, k)) || hasLastWill(A, a)));
      const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) A.park(d, p);
    },
    lastWill: async (A, p) => {
      const ps = A.parked(p).filter(m => isAvatar(m.card) && m.trueOwner != null); if (!ps.length) return;
      const v = await A.choose(A.opp(p), 'เลือก Avatar ใน Magic Zone อีกฝ่าย กลับขึ้นมือเจ้าของ', ps.map(m => A.cardOpt(m, 1)));
      toOwnerHand(A, ps.find(m => m.uid === v) || ps[0]);
    },
  };
  E['BT07-024'] = { // คุณเก่งพลังช้าง
    onSummon: async (A, p, self) => {
      const ps = A.parked(p).filter(m => isAvatar(m.card) && m.trueOwner != null); if (!ps.length) return;
      const v = await A.choose(p, 'ทำลาย Avatar อีกฝ่ายใน Magic Zone เรา เพื่อ POWER +3?', ps.map(m => A.cardOpt(m, 2)), true);
      const m = ps.find(x => x.uid === v); if (!m) return; A.unparkToHell(m); if (A.onField(self)) A.addPower(self, 3, 'forever');
    },
    continuousSelf: (A, p) => (hasOnField(A, p, NUANG) ? 1 : 0),
  };
  E['BT07-025'] = { condKwOnly: ['เตะไข่'], condKw: (A, a) => (hasOnField(A, a.owner, NUANG) ? ['เตะไข่'] : []) }; // ทนายเตะปาก
  E['BT07-026'] = { continuousSelf: (A, p) => (hasOnField(A, p, NUANG) ? 2 : 0) }; // ทนายกิ๊บ
  E['BT07-027'] = { // พี่วัฒน์ BGN (พอดี)
    onSummon: async (A, p, self) => {
      if (!self.exact || A.state.magicUsed[p]['name:พี่วัฒน์']) return; A.state.magicUsed[p]['name:พี่วัฒน์'] = true;
      for (const q of [p, A.opp(p)]) { const n = A.hand(q).length; if (n < 5) A.draw(q, 5 - n); else if (n > 5) await A.discard(q, n - 5); }
      const g = [0, 1].map(q => A.hand(q).reduce((s, h) => s + A.gem(h.card), 0));
      A.log(`GEM บนมือ: ${A.state.players[0].name} ${g[0]} / ${A.state.players[1].name} ${g[1]}`);
      if (g[0] === g[1]) return; const w = g[0] < g[1] ? 0 : 1, o = A.opp(w);
      const v = await A.choose(w, 'พี่วัฒน์ BGN: เลือกปฏิบัติ 1 อย่าง', [
        { label: 'นำการ์ด 2 ใบจากใต้ Deck ขึ้นมือ', value: 1, score: 2 },
        { label: 'Avatar ฝ่ายเราทุกใบ POWER +2', value: 2, score: A.avatars(w).length },
        { label: 'ควบคุม Avatar อีกฝ่าย 1 ใบ', value: 3, score: A.avatars(o).length && A.roomFor(w) ? 3 : -1 }]);
      if (v === 1) for (let k = 0; k < 2 && A.deck(w).length > 1; k++) A.toHand(w, A.deck(w).pop());
      if (v === 2) A.avatars(w).slice().forEach(a => A.addPower(a, 2, 'forever'));
      if (v === 3 && A.avatars(o).length) { const t = await A.choose(w, 'ควบคุม Avatar อีกฝ่าย', bestOppAvatar(A, w)); const a = A.avatars(o).find(x => x.uid === t); if (a && A.takeControl(a, w)) a.returnAtEnd = true; }
    },
  };
  E['BT07-028'] = { // ไอ้ดำ จากนรก
    afterAttack: async (A, p, a) => {
      if (a.onceTurn === A.state.turn || !a.rested) return;
      const xs = A.avatars(p).filter(x => x !== a); if (!xs.length) return;
      const v = await A.choose(p, 'ไอ้ดำ: เซ่นไหว้ Avatar 1 ใบ เพื่อกลับมาสภาพตื่น?', xs.map(x => A.avOpt(x, A.avatars(A.opp(p)).length ? 1 - A.power(x) : -5)), true);
      const x = xs.find(y => y.uid === v); if (!x) return;
      a.onceTurn = A.state.turn; await A.sacrifice(p, x); A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`);
    },
  };
  const isSpell = c => c.type === 'magic' && A_named(c, SPELL);
  E['BT07-029'] = { // จอมเวทย์ กาลู
    activateLabel: 'ทิ้ง 1: นำ "คาถา" จาก Deck หรือนรกขึ้นมือ',
    canActivate: (A, p) => A.hand(p).length > 0 && !A.state.magicUsed[p]['name:กาลู'] && A.deck(p).concat(A.hell(p)).some(c => isSpell(c.card)),
    activate: async (A, p) => {
      A.state.magicUsed[p]['name:กาลู'] = true; await A.discard(p, 1);
      const c = await A.pickFrom(p, A.deck(p).concat(A.hell(p)), isSpell, 'นำ "คาถา" ขึ้นมือ'); if (!c) return;
      const fromDeck = A.deck(p).includes(c); A.toHand(p, A.takeFrom(fromDeck ? A.deck(p) : A.hell(p), c)); if (fromDeck) A.shuffleDeck(p);
    },
    onAnyMagic: async (A, p, a, inst) => { if (isSpell(inst.card) && !A.state.magicUsed[p]['name:กาลูจั่ว']) { A.state.magicUsed[p]['name:กาลูจั่ว'] = true; A.draw(p, 1); } },
  };
  E['BT07-030'] = { // จอมเวทย์ อะปัด
    activateLabel: 'เทิร์นนี้ใช้ Normal Magic "คาถา" เพิ่มได้ 1 ใบ',
    canActivate: (A, p) => !A.state.magicUsed[p]['name:อะปัด'] && A.hand(p).some(h => isSpell(h.card)),
    activate: async (A, p) => { A.state.magicUsed[p]['name:อะปัด'] = true; A.state.magicUsed[p].extraSpell = true; A.log('เทิร์นนี้ใช้ "คาถา" เพิ่มได้ 1 ใบ'); },
  };
  E['BT07-031'] = { // จอมเวทย์ เบล่า
    onSummon: async (A, p, self) => {
      if (A.state.magicUsed[p]['name:เบล่า'] || !A.avatars(p).some(x => x !== self && A.named(x.card, 'จอมเวทย์') && x.card.name !== self.card.name)) return;
      const c = await A.pickFrom(p, A.hell(p), c => isSpell(c) && (c.magicType || 'normal') === 'normal' && E[c.id] && typeof E[c.id].magic === 'function' && (!E[c.id].canUse || E[c.id].canUse(A, p)), 'ใช้ความสามารถของ "คาถา" ในนรก', true);
      if (!c) return; A.state.magicUsed[p]['name:เบล่า'] = true; A.log(`ใช้ความสามารถของ "${c.card.name}" จากนรก`); await E[c.card.id].magic(A, p, c, {});
    },
  };
  E['BT07-032'] = { // อาวุธชีวภาพ เอ็มตัวเต็ง
    cannotAttack: () => true,
    endPhase: async (A, p, a) => {
      if (!A.avatars(A.opp(p)).length && !A.state.players[A.opp(p)].life.some(l => !l.faceUp)) return;
      if (!await askYes(A, p, 'เอ็มตัวเต็ง: ทำลาย Avatar อีกฝ่าย 1 ใบ และทำความเสียหาย LIFE 1 ครั้ง?', 3)) return;
      const t = await A.choose(p, 'ทำลาย Avatar อีกฝ่าย', bestOppAvatar(A, p)); const d = A.avatars(A.opp(p)).find(x => x.uid === t); if (d) await A.destroy(d, 'เอ็มตัวเต็ง', p);
      await A.damageLife(A.opp(p), 1);
    },
  };
  const isButterfly = (A, a) => A.named(a.card, 'ผีเสื้อ') && A.isSym(a, 'สัตว์วิเศษ');
  E['BT07-033'] = { // เดซี่ แห่งสายรุ้ง
    endPhase: async (A, p) => {
      if (!A.roomFor(p)) return;
      const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && A_named(c, 'ผีเสื้อ') && c.symbol === 'สัตว์วิเศษ', 'เดซี่: อัญเชิญ "ผีเสื้อ" จาก Deck', true);
      if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p);
    },
    aura: (A, p, src, a) => (a.owner === p && isButterfly(A, a) ? 1 : 0),
    kwAura: (A, src, a) => (isButterfly(A, a) ? ['โล่มนุษย์'] : []),
  };
  E['BT07-034'] = { // ตำรวจนอกเครื่องแบบ ไซเฮย์
    handActivateLabel: 'ทายการ์ดบนสุดของ Deck อีกฝ่าย: ถูก = อัญเชิญฟรี',
    canHandActivate: (A, p, h) => A.state.phase === 'main' && A.roomFor(p, h.card) && A.deck(A.opp(p)).length > 1 && !A.state.magicUsed[p]['name:ไซเฮย์'],
    handActivate: async (A, p, h) => {
      A.state.magicUsed[p]['name:ไซเฮย์'] = true;
      const r = await declareTop(A, p, A.opp(p));
      if (r) { A.hell(A.opp(p)).push(A.deck(A.opp(p)).shift()); await A.summonFrom(p, A.hand(p), h, { jutti: false }); }
      else { A.hell(p).push(A.takeFrom(A.hand(p), h)); A.log(`ทายผิด — ทิ้ง "${h.card.name}"`); }
    },
  };
  E['BT07-035'] = { // ตำรวจไฟแรง เอนโว่
    onAttack: async (A, p, a, tgt) => {
      if (!tgt || tgt.kind !== 'avatar') return;
      const r = await declareTop(A, p, A.opp(p)); if (!r) return;
      A.hell(A.opp(p)).push(A.deck(A.opp(p)).shift());
      const d = A.avatars(A.opp(p)).find(x => x.uid === tgt.uid); if (d) await A.destroy(d, 'เอนโว่', p);
    },
  };
  const throneOnField = (A, p) => A.constructs(p).some(c => c.card.id === 'BT07-073') || A.state.players[p].magicZone.some(m => m.card.id === 'BT07-073');
  E['BT07-036'] = { // ตั๊กแตนหยิน
    onSummon: async (A, p) => {
      A.flipLife(p, 1);
      const up = A.state.players[p].life.filter(l => l.faceUp); if (!up.length) return;
      const v = await A.choose(p, 'คว่ำ LIFE ของเรา 1 ใบ', up.map((l, i) => ({ label: l.card.name, card: l.card, value: i, score: 1 })));
      const l = up[v == null ? 0 : v]; l.faceUp = false; A.state.pendingLife[p] = A.state.pendingLife[p].filter(x => x !== l); A.log(`LIFE "${l.card.name}" กลับมาคว่ำ`);
    },
    activateLabel: 'ทิ้ง 1: ใช้ความสามารถ LIFE ที่หงายอยู่ 1 ใบ',
    canActivate: (A, p) => throneOnField(A, p) && A.hand(p).length > 0 && A.state.players[p].life.some(l => l.faceUp && A.lifeFx(l.card.id)),
    activate: async (A, p) => {
      await A.discard(p, 1);
      const up = A.state.players[p].life.filter(l => l.faceUp && A.lifeFx(l.card.id));
      const v = await A.choose(p, 'ใช้ความสามารถ LIFE ใบไหน', up.map((l, i) => ({ label: l.card.name, card: l.card, value: i, score: 1 })));
      await useLifeNow(A, p, up[v == null ? 0 : v]);
    },
  };
  E['BT07-037'] = { // ตั๊กแตนหยาง
    continuousSelf: (A, p) => (hasOnField(A, p, 'ตั๊กแตนหยิน') ? A.state.players[p].life.filter(l => l.faceUp).length : 0),
    condKw: (A, a) => (hasOnField(A, a.owner, 'ตั๊กแตนหยิน') && severe(A, a.owner) ? ['ลูกฮึด', 'โล่มนุษย์'] : []),
    equipOnly: c => c.symbol === 'แมลง',
  };
  E['BT07-038'] = { onSummon: async (A, p) => { if (hasOnField(A, p, HOPPER) && A.state.players[p].life.filter(l => l.faceUp).length >= 2) { const c = await A.pickFrom(p, A.hell(p), c => A_named(c, HOPPER), 'นำ "ตั๊กแตน" จากนรกขึ้นมือ', true); if (c) A.toHand(p, A.takeFrom(A.hell(p), c)); } } }; // วาฬทมิฬ ก้า
  E['BT07-039'] = { // ตั๊กแตนหญิง
    onSummon: async (A, p) => {
      if (!A.state.players[p].life.some(l => !l.faceUp) || !A.deck(p).some(c => A_named(c.card, HOPPER))) return;
      if (!await askYes(A, p, 'หงาย LIFE ใบบนสุด เพื่อนำ "ตั๊กแตน" จาก Deck ขึ้นมือ?', A.state.players[p].life.filter(l => !l.faceUp).length > 2 ? 1 : -1)) return;
      A.flipLife(p, 1); await tutor(c => A_named(c, HOPPER), 'นำ "ตั๊กแตน" จาก Deck ขึ้นมือ')(A, p);
    },
  };
  E['BT07-040'] = { // หมอเลิฟ ฟันเหยิน
    onSummon: async (A, p) => {
      const c = await A.pickFrom(p, A.deck(p), () => true, 'หมอเลิฟ: เลือกการ์ดจาก Deck ส่งลงนรก (ขึ้นมือใน Draw Phase ที่ 2)', true);
      if (!c) return; A.hell(p).push(A.takeFrom(A.deck(p), c)); c.noLeaveHell = true; A.shuffleDeck(p); A.log(`แสดง "${c.card.name}" แล้วส่งลงนรก`);
      A.atDrawPhase(p, 2, async A2 => { if (A2.hell(p).includes(c)) { c.noLeaveHell = false; A2.toHand(p, A2.takeFrom(A2.hell(p), c)); } });
    },
  };
  E['BT07-041'] = { // คาบู ช่วยด้วย
    onAllyDestroying: async (A, p, h, a) => {
      if (!A.isSym(a, 'สัตว์') || A.hand(p).length < 2) return false;
      if (!await askYes(A, p, `คาบู: ทิ้ง 1 ใบ อัญเชิญคาบูจากมือ และยกเลิกการทำลาย ${a.card.name}?`, 2)) return false;
      A.takeFrom(A.hand(p), h); await A.discard(p, 1); A.hand(p).push(h);
      const free = A.roomFor(p, h.card); if (free) await A.summonFrom(p, A.hand(p), h, { jutti: false });
      return true;
    },
  };
  E['BT07-042'] = { cannotAttack: (A, a) => !A.avatars(a.owner).some(x => x !== a && A.named(x.card, MONKEY)) }; // บัวนิด
  E['BT07-043'] = { // แมรี่ พนักงานต้อนรับ
    endPhase: async (A, p) => { const n = A.dice(); A.log(`🎲 ทอยได้ ${n}`); await lookTopBottom(A, p, n, [{ pred: isAvatar, title: 'นำ Avatar ขึ้นมือ' }], async c => A.toHand(p, c)); },
  };
  E['BT07-048'] = { // หยุด!! นี่ตำรวจ
    canUse: (A, p) => hasOnField(A, p, COP) && A.hand(p).some(h => A_named(h.card, COP) && h.card.type === 'avatar') && A.avatars(A.opp(p)).length > 0,
    magic: async (A, p) => { const v = await A.choose(p, 'นำ Avatar อีกฝ่ายไปไว้บนสุดของ Deck', bestOppAvatar(A, p)); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) A.toDeckTop(d); },
  };
  const resetPower = async (A, p) => {
    const all = A.avatars(0).concat(A.avatars(1)).filter(a => A.power(a) !== (a.card.power || 0));
    const v = await A.choose(p, 'ปรับ POWER ของ Avatar ให้กลับเป็นค่าตั้งต้น', all.map(a => A.avOpt(a, a.owner === p ? (a.card.power || 0) - A.power(a) : A.power(a) - (a.card.power || 0))));
    const a = all.find(x => x.uid === v); if (a) { A.clearMods(a); A.log(`${a.card.name} POWER กลับเป็นค่าตั้งต้น`); }
  };
  E['BT07-049'] = { // เพ้อเจ้อ
    canUse: A => A.avatars(0).concat(A.avatars(1)).some(a => A.power(a) !== (a.card.power || 0)),
    magic: async (A, p) => resetPower(A, p),
    react: { anyType: true, on: 'attack', when: (A, p, ctx) => hasOnField(A, p, COP) && A.power(ctx.attacker) > (ctx.attacker.card.power || 0), botScore: () => 2, run: async (A, p, ctx) => { A.clearMods(ctx.attacker); A.log(`${ctx.attacker.card.name} POWER กลับเป็นค่าตั้งต้น`); } },
  };
  E['BT07-050'] = { // ราคาชาติที่คุณขาย
    canUse: (A, p) => A.deck(p).filter(c => A_named(c.card, SNOWMAN)).length >= 1,
    magic: async (A, p) => {
      A.deck(p).filter(c => A_named(c.card, SNOWMAN)).slice(0, 2).forEach(c => A.hell(p).push(A.takeFrom(A.deck(p), c)));
      A.shuffleDeck(p); A.log('ส่ง "ทหารหิมะ" จาก Deck ลงนรก');
      if (A.hell(p).filter(c => isAvatar(c.card) && A_named(c.card, 'หิมะ')).length >= 10) A.draw(p, 1);
    },
  };
  E['BT07-051'] = { // คาถา ปลดอาวุสสิวะ
    canUse: (A, p) => hasOnField(A, p, MAGE) && A.avatars(A.opp(p)).length > 0,
    magic: async (A, p) => {
      const v = await A.choose(p, 'Avatar อีกฝ่าย POWER -3', bestOppAvatar(A, p, a => A.power(a) <= 3).concat(bestOppAvatar(A, p, a => A.power(a) > 3).map(o => Object.assign(o, { score: o.score - 10 }))));
      const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (!d) return;
      A.addPower(d, -3, 'forever'); if (A.power(d) === 0) await A.destroy(d, 'คาถา ปลดอาวุสสิวะ', p);
    },
  };
  E['BT07-052'] = { // คาถา สัตตูหลีกปาย
    canUse: (A, p) => A.avatars(p).filter(a => A.named(a.card, MAGE)).length >= 2 && A.avatars(A.opp(p)).some(a => A.power(a) >= 5),
    magic: async (A, p) => { const v = await A.choose(p, 'ส่ง Avatar อีกฝ่าย (POWER 5+) ไป Magic Zone ของเขา', bestOppAvatar(A, p, a => A.power(a) >= 5)); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) A.park(d, A.opp(p)); },
  };
  E['BT07-053'] = { // ชะตาไม่มีวันจบลง
    canUse: (A, p) => severe(A, p) && A.roomFor(p) && A.hell(p).some(c => ['ตั๊กแตนหยิน', 'ตั๊กแตนหยาง'].includes(c.card.name)),
    magic: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), c => ['ตั๊กแตนหยิน', 'ตั๊กแตนหยาง'].includes(c.name), 'อัญเชิญ ตั๊กแตนหยิน/หยาง จากนรก'); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); },
  };
  E['BT07-054'] = { // พลังแห่งควางสิริมงคง
    canUse: (A, p) => A.avatars(p).some(a => a.card.name === 'เสาซินแสมงคล') && A.hand(p).length - 1 >= 7 && A.hell(p).some(c => isAvatar(c.card) && A_named(c.card, POLE)),
    magic: async (A, p) => { await A.discard(p, 7); const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && A_named(c, POLE), 'นำ "เสามงคล" จากนรกไปที่ Magic Zone'); if (c) A.park(c, p); },
  };
  E['BT07-055'] = { // เปลี่ยนเมน
    canUse: (A, p) => A.avatars(p).some(a => A.named(a.card, IDOL) && A.attached(a).some(m => A_named(m.card, OTA))),
    magic: async (A, p) => {
      const xs = A.avatars(p).filter(a => A.named(a.card, IDOL) && A.attached(a).some(m => A_named(m.card, OTA)));
      const v = await A.choose(p, 'เลือก "ไอดอล" ที่สวมใส่ "โอตะ"', xs.map(x => A.avOpt(x, 1)));
      const a = xs.find(x => x.uid === v) || xs[0]; const nm = a.card.name;
      const otas = A.attached(a).filter(m => A_named(m.card, OTA)); otas.forEach(m => { m.attachedTo = null; });
      A.toDeckBottom(a);
      const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && A_named(c, IDOL) && c.name !== nm, 'อัญเชิญ "ไอดอล" ชื่ออื่นจาก Deck');
      const ok = c && await A.summonFrom(p, A.deck(p), c, { jutti: false }) && A.onField(c);
      otas.forEach(m => { if (ok) { m.attachedTo = c.uid; A.log(`"${m.card.name}" ย้ายไปสวมใส่ ${c.card.name}`); } else A.destroyMagic(m); });
      A.shuffleDeck(p);
    },
  };
  E['BT07-056'] = { // กลับบ้านเก่า
    canUse: A => A.avatars(0).concat(A.avatars(1)).some(a => a.fromHell),
    magic: async (A, p) => { for (const a of A.avatars(0).concat(A.avatars(1)).filter(x => x.fromHell)) await A.destroy(a, 'กลับบ้านเก่า', p); },
  };
  E['BT07-057'] = { magic: tutor(c => c.type === 'magic' && A_named(c, 'แผนการ') && c.name !== 'ลิสต์แผนการ', 'นำ Magic "แผนการ" จาก Deck ขึ้นมือ') }; // ลิสต์แผนการ
  E['BT07-058'] = { // แบงค์ Portal
    canUse: (A, p) => hasOnField(A, p, BANK),
    magic: async (A, p) => {
      const isB = c => isAvatar(c) && A_named(c, BANK);
      const d = A.deck(p); const seen = d.splice(0, Math.min(5, d.length)); A.log(`สอดแนม ${seen.length} ใบ`);
      for (const [title, to] of [['ส่ง "แบงค์" ลงนรก', 'hell'], ['นำ "แบงค์" ขึ้นมือ', 'hand']]) {
        const v = await A.choose(p, title, seen.filter(c => isB(c.card)).map(c => A.cardOpt(c, to === 'hand' ? A.cardOpt(c).score : -A.cardOpt(c).score)), true);
        const c = seen.find(x => x.uid === v); if (!c) continue; seen.splice(seen.indexOf(c), 1);
        if (to === 'hell') A.hell(p).push(c); else A.toHand(p, c);
      }
      d.push(...seen); A.shuffleDeck(p);
    },
  };
  E['BT07-059'] = { // พันปักษา
    react: {
      on: 'attack', when: (A, p) => A.avatars(p).some(a => isGaruda(a.card)) && A.avatars(A.opp(p)).length > 0,
      botScore: (A, p) => (A.avatars(A.opp(p)).length >= 2 ? 3 : 0.5),
      run: async (A, p) => {
        const gs = A.avatars(p).filter(a => isGaruda(a.card));
        const v = await A.choose(p, 'ทำลาย "ครุฑ" ฝ่ายเรา 1 ใบ', gs.map(a => A.avOpt(a, -A.power(a)))); await A.destroy(gs.find(a => a.uid === v) || gs[0], 'พันปักษา');
        for (let k = 0; k < 2 && A.avatars(A.opp(p)).length; k++) { const t = await A.choose(p, `ทำลาย Avatar อีกฝ่าย (${k + 1}/2)`, bestOppAvatar(A, p), k > 0); const d = A.avatars(A.opp(p)).find(x => x.uid === t); if (!d) break; await A.destroy(d, 'พันปักษา', p); }
      },
    },
  };
  E['BT07-060'] = { // คาถา สตอปปุ
    react: {
      on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'avatar' && A.avatars(p).some(a => a.uid === ctx.target.uid && A.named(a.card, MAGE)) && A.hell(p).some(c => isSpell(c.card)),
      botScore: () => 3,
      run: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), isSpell, 'นำ "คาถา" จากนรกไว้ใต้ Deck'); if (c) A.deck(p).push(A.takeFrom(A.hell(p), c)); return { cancelAttack: true }; },
    },
  };
  E['BT07-061'] = { // ขอจบรายการแต่เพียงเท่านี้
    react: {
      on: 'destroy', when: (A, p, ctx) => A.named(ctx.avatar.card, NUANG) && A.constructs(p).some(c => c.card.name === SHOWSHIP), botScore: () => 3,
      run: async (A, p, ctx) => { const s = A.constructs(p).find(c => c.card.name === SHOWSHIP); A.constructs(p).splice(A.constructs(p).indexOf(s), 1); A.hell(p).push(s); A.log(`"${s.card.name}" ถูกส่งลงนรก`); A.bounce(ctx.avatar); return { prevent: true }; },
    },
  };
  E['BT07-062'] = { magic: true, equipOk: (A, a) => isGaruda(a.card), guardHost: A => !A.state.inBattle }; // ขนมณี แฟลร์
  E['BT07-063'] = { magic: true, equipOk: (A, a) => A.named(a.card, MAGE), onAnyMagicEquip: async (A, p, m, h, inst) => { if (isSpell(inst.card)) A.addPower(h, 1, 'forever'); } }; // ไม้กายสิทธิ์
  E['BT07-064'] = { // เก้าอี้ เฟิร์สคลาส
    magic: true,
    onEquip: async (A, p, m, h) => { if (!A.named(h.card, SUPERAIR)) { m.renamedHost = h.uid; h.card = Object.assign({}, h.card, { alsoNamed: (h.card.alsoNamed || []).concat(SUPERAIR) }); A.log(`${h.card.name} ได้รับชื่อ "Super Air"`); } },
    onHell: (A, p, m, h) => { if (h && m.renamedHost === h.uid) { const base = (root.TC_CARDS || []).find(c => c.id === h.card.id); if (base) h.card = Object.assign({}, h.card, { alsoNamed: base.alsoNamed }); } m.renamedHost = null; },
  };
  E['BT07-065'] = { magic: true, controlImmuneHost: true }; // ปลอกคอซื่อสัตย์
  E['BT07-066'] = { // อาคารผู้โดยสารชั้นต่ำ
    magic: true,
    activateLabel: 'ทิ้ง 1: อัญเชิญ "ผู้โดยสาร Super Air" จากนรกหรือ Deck',
    canActivate: (A, p) => hasPlane(A, p) && A.hand(p).length > 0 && A.roomFor(p) && A.deck(p).concat(A.hell(p)).some(c => isAvatar(c.card) && A_named(c.card, 'ผู้โดยสาร Super Air')),
    activate: async (A, p) => {
      await A.discard(p, 1);
      const c = await A.pickFrom(p, A.hell(p).concat(A.deck(p)), c => isAvatar(c) && A_named(c, 'ผู้โดยสาร Super Air'), 'อัญเชิญ "ผู้โดยสาร Super Air"'); if (!c) return;
      const fromDeck = A.deck(p).includes(c); await A.summonFrom(p, fromDeck ? A.deck(p) : A.hell(p), c, { jutti: false }); if (fromDeck) A.shuffleDeck(p);
    },
  };
  E['BT07-067'] = { magic: true, halveAll: true }; // หมู่บ้านเห็ด
  E['BT07-068'] = { // ดินแดนหิมะสีเทา
    magic: true,
    activateLabel: 'Avatar "หิมะ" POWER +1 ต่อ "ทหารหิมะ" 2 ใบในนรก',
    canActivate: (A, p) => A.avatars(p).some(a => A.named(a.card, 'หิมะ') && A.isSym(a, 'ต่างชาติ')) && A.hell(p).filter(c => A_named(c.card, SNOWMAN)).length >= 2,
    activate: async (A, p) => {
      const xs = A.avatars(p).filter(a => A.named(a.card, 'หิมะ') && A.isSym(a, 'ต่างชาติ'));
      const v = await A.choose(p, 'เลือก Avatar "หิมะ"', xs.map(x => A.avOpt(x, A.power(x))));
      const a = xs.find(x => x.uid === v); if (a) A.addPower(a, Math.floor(A.hell(p).filter(c => A_named(c.card, SNOWMAN)).length / 2), 'endTurn');
    },
  };
  E['BT07-069'] = { // สถานีตำรวจ
    magic: true,
    aura: (A, owner, src, a) => (A.named(a.card, COP) && A.isSym(a, 'คน') ? 2 : 0),
    grantKw: (A, a) => (!A.named(a.card, COP) ? [] : A.isSym(a, 'หุ่นยนต์') ? ['สามัคคี'] : A.isSym(a, 'ผี') ? ['โล่มนุษย์'] : []),
  };
  E['BT07-070'] = { magic: true, aura: (A, owner, src, a) => (A.hasKw(a.card, 'โดนใจ') ? 1 : 0) }; // งานเลี้ยงโดนใจ หัวใจโดนเธอ
  E['BT07-071'] = { kwAura: () => ['ลูกฮึด'] }; // เสาธง
  E['BT07-072'] = { // ยานรายการ เถียงทันหน่วง
    handCost: (A, p, c) => (hasOnField(A, p, NUANG) ? 0 : (c.cost || 0)),
    endPhase: async (A, p) => { if (hasOnField(A, p, NUANG) && A.parked(p).some(m => isAvatar(m.card) && m.trueOwner != null)) A.draw(p, 1); },
    activateLabel: 'Avatar 1 ใบได้รับ โล่มนุษย์ จนจบเทิร์นถัดไปของอีกฝ่าย',
    activate: async (A, p) => {
      const all = A.avatars(p).map(a => A.avOpt(a, A.power(a))).concat(A.avatars(A.opp(p)).map(a => A.avOpt(a, -5)));
      const v = await A.choose(p, 'ให้ โล่มนุษย์ กับ Avatar ใบไหน', all); const a = A.avatars(0).concat(A.avatars(1)).find(x => x.uid === v);
      if (a) { A.grantKwUntil(a, 'โล่มนุษย์', A.state.turn + 1); A.log(`${a.card.name} ได้รับ โล่มนุษย์`); }
    },
  };
  E['BT07-073'] = { // บัลลังก์ตั๊กแตนศตวรรษ
    activateLabel: 'สวมใส่ให้ "ตั๊กแตน"',
    canActivate: (A, p) => A.avatars(p).some(a => hopperish(a.card)),
    activate: async (A, p, c) => {
      const xs = A.avatars(p).filter(a => hopperish(a.card));
      const v = await A.choose(p, 'สวมใส่ให้ใบไหน', xs.map(x => A.avOpt(x, A.power(x))));
      const t = xs.find(x => x.uid === v) || xs[0];
      A.constructs(p).splice(A.constructs(p).indexOf(c), 1); await A.attach(p, c, t);
    },
    equipPower: 2, hostCannotAttack: true,
    equipAura: (A, host, a) => (a.owner === host.owner && hopperish(a.card) ? 1 : 0),
  };
  E['BT07-074'] = { life: async (A, p) => { if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && (c.cost || 0) <= 2, 'อัญเชิญ Avatar Cost ≤2 จากนรก', true); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); } }; // ไม่นะ มณโท !
  E['BT07-075'] = lifeDraw1; // ไม่นะ พี่หน่วง !

  // ================= BT08 =================
  const GENERAL3 = 'ขุนพล', FOREIGN = 'ต่างชาติ';
  (root.TC_CARDS || []).forEach(c => {
    if ((c.text || '').includes('ถือว่ามีชื่อ "ขุนพล') && !(c.alsoNamed || []).includes(GENERAL3)) c.alsoNamed = (c.alsoNamed || []).concat(GENERAL3);
    if (c.id === 'BT08-009' && !c.limit) c.limit = 50; // เอเจ้นท์สมูท
  });
  const isGeneral = (A, a, col) => A.named(a.card, GENERAL3) && A.isSym(a, FOREIGN) && (!col || A.isColor(a.card, col));
  const generalCard = (c, col) => isAvatar(c) && A_named(c, GENERAL3) && c.symbol === FOREIGN && (!col || c.color === col);
  const destroyAnyFieldCard = async (A, p) => {
    const o = A.opp(p);
    const opts = A.avatars(o).map(a => A.avOpt(a, A.power(a) + 2)).concat(A.fieldMagic().map(m => A.cardOpt(m, m.owner === p ? -3 : 2)), A.constructs(o).map(c => A.cardOpt(c, 1)), A.avatars(p).map(a => A.avOpt(a, -5)));
    const v = await A.choose(p, 'ทำลายการ์ดบนสนาม 1 ใบ', opts);
    const av = A.avatars(0).concat(A.avatars(1)).find(x => x.uid === v); if (av) return A.destroy(av, 'ความสามารถการ์ด', p);
    const m = A.fieldMagic().find(x => x.uid === v); if (m) return A.destroyMagic(m);
    const c = A.constructs(o).find(x => x.uid === v); if (c) await A.destroyConstruct(c, 'ความสามารถการ์ด', p);
  };
  E['BT08-001'] = { // อีวิลไมเกรน
    onSummon: async (A, p) => {
      if (A.deck(p).length < 7 || !await askYes(A, p, 'ธรณีสูบ 5 เพื่อนำ "อาวุธหุ่นนักรบผู้กล้า" จากนรกขึ้นมือ?', 1)) return;
      await A.mill(p, 5); const c = await A.pickFrom(p, A.hell(p), c => A_named(c, WEAPON), 'นำ "อาวุธหุ่นนักรบผู้กล้า" ขึ้นมือ'); if (c) A.toHand(p, A.takeFrom(A.hell(p), c));
    },
    onAnyEquip: async (A, p, a, inst) => {
      if (!A_named(inst.card, WEAPON) || a.onceTurn === A.state.turn) return; const o = A.opp(p); const top = A.deck(o)[0]; if (!top) return;
      a.onceTurn = A.state.turn; A.deck(o).shift(); A.log(`สอดแนม Deck อีกฝ่าย: "${top.card.name}"`);
      if (top.card.type === 'magic') A.hell(o).push(top); else A.deck(o).push(top);
    },
  };
  E['BT08-004'] = { aura: (A, p, src, a) => (a.owner !== p ? 0 : ((a.card.text || '').includes('ค่ายบางระจัน') ? 1 : 0) + A.attached(a).filter(m => (m.card.text || '').includes('ค่ายบางระจัน')).length) }; // น้าเอี๊ยด
  E['BT08-005'] = { // ซุนกวน
    activateLabel: 'นำ "ง่อก๊ก"/"พลเดินทัพ" 2 ใบจากนรกไว้ใต้ Deck: ทำลายการ์ดบนสนาม 1 ใบ',
    canActivate: (A, p) => A.hell(p).filter(c => isAvatar(c.card) && (A_named(c.card, 'ง่อก๊ก') || A_named(c.card, 'พลเดินทัพ'))).length >= 2,
    activate: async (A, p) => {
      for (let k = 0; k < 2; k++) { const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && (A_named(c, 'ง่อก๊ก') || A_named(c, 'พลเดินทัพ')), `นำการ์ดจากนรกไว้ใต้ Deck (${k + 1}/2)`); if (c) A.deck(p).push(A.takeFrom(A.hell(p), c)); }
      await destroyAnyFieldCard(A, p);
    },
  };
  E['BT08-006'] = { // จิวยี่
    onSummon: async (A, p) => {
      await lookTopBottom(A, p, 5, [{ pred: c => c.name === 'เรือรบโบราณ', title: 'ก่อสร้าง "เรือรบโบราณ"' }], async c => { if (A.constructs(p).length < 3) { A.constructs(p).push(c); A.log(`ก่อสร้าง "${c.card.name}"`); } else A.deck(p).push(c); });
    },
  };
  E['BT08-007'] = { // จิวท่าย
    onAllyDestroying: async (A, p, h, a) => {
      if (A.state.inBattle || !isGeneral(A, a, 'red')) return false;
      if (!await askYes(A, p, `ทิ้งจิวท่ายจากมือ เพื่อไม่ให้ ${a.card.name} ออกจากสนาม?`, 2)) return false;
      A.hell(p).push(A.takeFrom(A.hand(p), h)); if (a.card.id === 'BT08-005') A.draw(p, 1);
      return true;
    },
  };
  const swordsOnField = (A, p) => A.state.players[p].magicZone.filter(m => !m.parked && A_named(m.card, SWORD));
  E['BT08-008'] = { // กาลาฮัด
    handCost: (A, p, c) => (swordsOnField(A, p).length >= 2 ? 4 : (c.cost || 0)),
    continuousSelf: (A, p) => new Set(swordsOnField(A, p).map(m => m.card.name)).size,
  };
  E['BT08-009'] = { // เอเจ้นท์สมูท
    lastWill: async (A, p, self) => { await lookTopBottom(A, p, 3, [{ pred: c => c.name === self.card.name, title: 'นำ เอเจ้นท์สมูท ขึ้นมือ' }], async c => A.toHand(p, c)); },
    setPower: (A, p, a) => (A.state.active === p && A.state.phase === 'battle' ? Math.floor(A.hell(p).filter(c => c.card.name === a.card.name).length / 2) : (a.card.power || 0)),
  };
  E['BT08-010'] = { // เซอร์นัท
    onSummon: async (A, p, self) => { const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && A_named(c, 'ไอ้นัท'), 'นำ "ไอ้นัท" จากนรกมาสวมใส่', true); if (c && A.onField(self)) await A.attach(p, A.takeFrom(A.hell(p), c), self); },
    onBattle: async (A, p, self, foe) => { if (A.isColor(foe.card, 'purple')) A.addPower(self, 3, 'endTurn'); },
    aura: (A, p, src, a) => (a.owner === p && a.card.name === 'เลอติ๊ก เด็กไม่ชอบแดรคคูลา' ? 2 : 0),
  };
  E['BT08-011'] = { uniqueOnField: true, handCost: (A, p, c) => (A.avatars(A.opp(p)).some(a => a.card.name === 'เจค นักฆ่ามือเก๋า') ? 0 : (c.cost || 0)) }; // ซาบะริว
  E['BT08-012'] = { // หมอเสริมศักดิ์
    onSummon: async (A, p) => { await lookTop(A, p, 5, c => c.name === 'หมอมาแล้วววว', 'นำ "หมอมาแล้วววว" ขึ้นมือ', async c => A.toHand(p, c)); },
    lastWill: async (A, p) => { if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && ((c.cost || 0) <= 2 || c.name === 'พยาบาล เอ๋') && c.id !== 'BT08-012', 'อัญเชิญ Avatar Cost ≤2 หรือ พยาบาล เอ๋ จากนรก', true); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); },
  };
  E['BT08-013'] = { // เปรตรัททาทุย
    onEnter: async (A, p, self) => {
      const q = ['รัททาทุย นางพญา', 'รัททาทุย พ่อพันธุ์'];
      const xs = A.avatars(p).filter(a => q.includes(a.card.name)); if (!xs.length || !A.hell(p).some(c => isAvatar(c.card) && c.card.symbol === RAT && !q.includes(c.card.name))) return;
      const v = await A.choose(p, 'เซ่นไหว้ นางพญา/พ่อพันธุ์ เพื่ออัญเชิญ {รัททาทุย} จากนรก?', xs.map(x => A.avOpt(x, 1)), true);
      const x = xs.find(y => y.uid === v); if (!x) return; await A.sacrifice(p, x);
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && c.symbol === RAT && !q.includes(c.name) && c.id !== 'BT08-013', 'อัญเชิญ {รัททาทุย} จากนรก'); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false });
    },
    continuousSelf: (A, p) => A.state.players[p].life.filter(l => l.faceUp).length,
  };
  const RICKY = 'ริกกี้';
  const rickySwap = async (A, p, self, jutti) => {
    const nm = self.card.name; A.sendToHell(self);
    const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && A_named(c, RICKY) && c.symbol === 'แมลง' && c.name !== nm, 'อัญเชิญ "ริกกี้" ชื่ออื่นจาก Deck');
    if (c) await A.summonFrom(p, A.deck(p), c, { jutti, by: self.card.id }); A.shuffleDeck(p);
  };
  E['BT08-014'] = { onBattleWin: async (A, p, self) => { if (A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, RICKY) && c.card.symbol === 'แมลง' && c.card.name !== self.card.name) && await askYes(A, p, 'ส่งริกกี้ลงนรก เพื่ออัญเชิญ จุติ "ริกกี้" ชื่ออื่นจาก Deck?', 2)) await rickySwap(A, p, self, true); } }; // ริกกี้ ฆาตกรถลกหนัง
  E['BT08-015'] = { onSummon: async (A, p) => { const v = await A.choose(p, 'Avatar อีกฝ่าย POWER -2', bestOppAvatar(A, p)); const a = A.avatars(A.opp(p)).find(x => x.uid === v); if (a) A.addPower(a, -2, 'forever'); } }; // ริกกี้ เชฟ
  E['BT08-016'] = { onBattleWin: async (A, p) => { if (A.deck(p).some(c => c.card.name === 'หนังมนุษย์ ชุดแก้แค้น')) await tutor(c => c.name === 'หนังมนุษย์ ชุดแก้แค้น', 'นำ "หนังมนุษย์ ชุดแก้แค้น" ขึ้นมือ')(A, p); } }; // ริกกี้ คุณหมอ
  E['BT08-017'] = { // มอเดรด
    onAnyEquip: async (A, p, self, inst) => {
      if (inst.attachedTo !== self.uid || !A_named(inst.card, SWORD) || self.onceTurn === A.state.turn) return;
      const xs = A.avatars(p).filter(x => x !== self); if (!xs.length || !A.hell(p).some(c => isAvatar(c.card) && A_named(c.card, KNIGHT) && c.card.color === 'blue')) return;
      const v = await A.choose(p, 'มอเดรด: เซ่นไหว้ Avatar เพื่ออัญเชิญ จุติ "อัศวินโต๊ะกลม" สีฟ้าจากนรก?', xs.map(x => A.avOpt(x, 1 - A.power(x))), true);
      const x = xs.find(y => y.uid === v); if (!x) return; self.onceTurn = A.state.turn; await A.sacrifice(p, x);
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && A_named(c, KNIGHT) && c.color === 'blue', 'อัญเชิญ จุติ "อัศวินโต๊ะกลม" สีฟ้า'); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: true });
    },
  };
  E['BT08-018'] = { // โจโฉ
    onSummon: async (A, p) => { if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.hand(p), c => generalCard(c, 'blue'), 'อัญเชิญ จุติ "ขุนพล" สีฟ้า จากมือ', true); if (c) await A.summonFrom(p, A.hand(p), c, { jutti: true }); },
    onAllyTargeted: async (A, p, self, d) => {
      if (!isGeneral(A, d, 'blue') || !A.state.players[p].life.some(l => !l.faceUp)) return;
      if (!await askYes(A, p, `โจโฉ: หงาย LIFE ใบบนสุด เพื่อยกเลิกการโจมตี ${d.card.name}?`, A.state.players[p].life.filter(l => !l.faceUp).length > 2 ? 2 : -1)) return;
      A.flipLife(p, 1); return { cancelAttack: true };
    },
    onLifeFlipped: async (A, p, self) => {
      if (self.onceTurn === A.state.turn || !A.roomFor(p)) return; self.onceTurn = A.state.turn;
      const n = A.state.players[p].life.filter(l => l.faceUp).length;
      await lookTop(A, p, n, c => isAvatar(c) && A_named(c, 'วุยก๊ก'), 'อัญเชิญ "วุยก๊ก"', async c => { if (A.roomFor(p, c.card)) await A.summonFrom(p, [], c, { jutti: false, by: self.card.id }); else { A.deck(p).push(c); A.shuffleDeck(p); } });
    },
  };
  E['BT08-020'] = { onSummon: async (A, p) => { await lookTop(A, p, 5, c => generalCard(c) && (c.color === 'blue' || c.color === 'purple'), 'นำ "ขุนพล" สีฟ้า/ม่วง ขึ้นมือ', async c => A.toHand(p, c)); } }; // เตียวเลี้ยว
  E['BT08-021'] = equipSelfTo(IDOL, 'สวมใส่ให้ "ไอดอล"'); // โอตะท๊อปโดเนท
  E['BT08-022'] = { handCost: (A, p, c) => (c.cost || 0) - (A.hell(p).filter(h => A_named(h.card, SNOWMAN)).length >= 10 ? 2 : 0) }; // นายพลทหารหิมะ หลินอัน
  E['BT08-023'] = { // มฤตยูเทวี
    onSummon: async (A, p, self) => {
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && c.symbol === 'นรก' && c.cost === 5, 'เลือก Avatar {นรก} Cost 5 ในนรก เพื่อรับความสามารถ', true);
      if (!c) return; self.copied = c.card.id; A.log(`${self.card.name} ได้รับความสามารถของ "${c.card.name}"`);
      const f = E[c.card.id]; if (f && f.onSummon) await f.onSummon(A, p, self);
    },
    continuousSelf: (A, p, a) => { const f = a.copied && E[a.copied]; return f && f.continuousSelf ? f.continuousSelf(A, p, a) : 0; },
  };
  const ISAN = 'โคกอีสานนูน', SLINGER = 'อีสานสลิงเกอร์';
  const isanLand = A => A.state.land && A.state.land.card.name === ISAN;
  E['BT08-024'] = { // อีสานสลิงเกอร์ ปิ๊ก
    onSummon: async (A, p) => {
      if (A.deck(p).length < 5 || !A.deck(p).concat(A.hell(p)).some(c => c.card.name === ISAN) || !await askYes(A, p, 'ธรณีสูบ 3 เพื่อนำ โคกอีสานนูน ขึ้นมือ?', 1)) return;
      await A.mill(p, 3);
      const c = await A.pickFrom(p, A.deck(p).concat(A.hell(p)), c => c.name === ISAN, 'นำ โคกอีสานนูน ขึ้นมือ'); if (!c) return;
      const fromDeck = A.deck(p).includes(c); A.toHand(p, A.takeFrom(fromDeck ? A.deck(p) : A.hell(p), c)); if (fromDeck) A.shuffleDeck(p);
    },
  };
  E['BT08-025'] = { // อีสานสลิงเกอร์ ปิ่น
    onAttack: async (A, p, a, tgt) => {
      if (!isanLand(A) || !tgt || tgt.kind === 'life' || A.deck(p).length < 5 || !await askYes(A, p, 'ธรณีสูบ 3 แล้วย้ายเป้าหมายไปที่ LIFE อีกฝ่าย?', 2)) return;
      await A.mill(p, 3); tgt.kind = 'life'; delete tgt.uid; A.log('เป้าหมายการโจมตีเปลี่ยนเป็น LIFE Card Zone');
    },
  };
  E['BT08-026'] = { activateLabel: 'ธรณีสูบ 3: POWER +2', canActivate: (A, p) => isanLand(A) && A.deck(p).length > 4, activate: async (A, p, a) => { await A.mill(p, 3); if (A.onField(a)) A.addPower(a, 2, 'endTurn'); } }; // เปอร์
  E['BT08-027'] = { blockOppLand: A => !!A.state.land && A.state.land.card.name === 'โรงเรียนเวทย์มนต์' }; // กัฟแดน
  E['BT08-028'] = { // พี่ไท่ น้องเฟิง
    onSummon: async (A, p) => {
      const pl = A.state.players[p]; if (pl.taiFengUsed || (pl.drawPhases || 0) > 1 || A.hand(p).length < 2 || !A.roomFor(p)) return;
      if (!await askYes(A, p, 'ทิ้ง 2 ใบ เพื่ออัญเชิญ Avatar Cost ≤1 Symbol ต่างกันจาก Deck 3 ใบ?', 2)) return;
      pl.taiFengUsed = true; await A.discard(p, 2); const syms = [];
      for (let k = 0; k < 3 && A.roomFor(p); k++) { const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && (c.cost || 0) <= 1 && !syms.includes(c.symbol), `อัญเชิญ Avatar Cost ≤1 (${k + 1}/3)`, true); if (!c) break; syms.push(c.card.symbol); await A.summonFrom(p, A.deck(p), c, { jutti: false }); }
      A.shuffleDeck(p);
    },
  };
  E['BT08-030'] = { // เต่า
    onSummon: async (A, p, self) => {
      const l = A.state.players[p].life.find(x => x.card.name === 'อ่อ กระต่ายตาย'); if (!l) return;
      if (!l.faceUp) { l.faceUp = true; A.log('หงาย LIFE "อ่อ กระต่ายตาย"'); }
      const opts = [];
      if (A.avatars(A.opp(p)).some(a => A.power(a) < A.power(self))) opts.push({ label: 'ทำลาย Avatar อีกฝ่ายที่ POWER น้อยกว่า', value: 1, score: 3 });
      if (A.deck(p).some(c => c.card.name === 'เนยถั่ว')) opts.push({ label: 'สวมใส่ เนยถั่ว จาก Deck', value: 2, score: 1 });
      const v = await A.choose(p, 'เต่า: เลือกปฏิบัติ', opts);
      if (v === 1) { const t = await A.choose(p, 'ทำลาย Avatar อีกฝ่าย', bestOppAvatar(A, p, a => A.power(a) < A.power(self))); const d = A.avatars(A.opp(p)).find(x => x.uid === t); if (d) await A.destroy(d, 'เต่า', p); }
      if (v === 2 && A.onField(self)) { const c = A.deck(p).find(x => x.card.name === 'เนยถั่ว'); await A.attach(p, A.takeFrom(A.deck(p), c), self); A.shuffleDeck(p); }
    },
  };
  const overdose = (A, a) => A.state.players[a.owner].life.filter(l => l.faceUp).length >= 3;
  const hasJuttiOrWill = c => !!(E[c.id] && (E[c.id].onSummon || E[c.id].lastWill)) || /จุติ|คำสั่งเสีย/.test(c.text || '');
  E['BT08-031'] = { suppressOpp: (A, src) => (overdose(A, src) ? ['jutti', 'lastWill'] : []), onBattleWin: async (A, p, a, r) => { if (hasJuttiOrWill(r.loser.card)) A.unflipLifeRandom(p); } }; // พูรินอล Overdose
  E['BT08-032'] = { suppressOpp: (A, src) => (overdose(A, src) ? ['mill', 'scout'] : []), onBattleWin: async (A, p, a, r) => { if (/ธรณีสูบ|สอดแนม/.test(r.loser.card.text || '')) A.avatars(p).filter(x => A.named(x.card, 'Overdose')).forEach(x => A.addPower(x, 1, 'forever')); } }; // ชาโค่ล Overdose
  E['BT08-033'] = { condKwOnly: ['โล่มนุษย์', 'ลูกฮึด'], condKw: () => [], suppressOpp: (A, src) => (overdose(A, src) ? ['kw:โล่มนุษย์', 'kw:ลูกฮึด'] : []), onBattleWin: async (A, p, a, r) => { if (A.hasKw(r.loser.card, 'โล่มนุษย์') || A.hasKw(r.loser.card, 'ลูกฮึด')) A.flipLife(A.opp(p), 1); } }; // เซตาม่อน Overdose
  E['BT08-034'] = { onSummon: async (A, p) => { await lookTop(A, p, 7, c => A.hasKw(c, 'โดนใจ'), 'นำการ์ด โดนใจ ขึ้นมือ', async c => A.toHand(p, c)); } }; // ฮากลิ้ง วานรกับหมา
  E['BT08-035'] = { // เล่าปี่
    aura: (A, p, src, a) => (a.owner === p && A.named(a.card, 'จ๊กก๊ก') ? 1 : 0),
    untargetable: (A, x) => A.avatars(x.owner).some(y => y !== x && isGeneral(A, y, 'green')),
  };
  E['BT08-037'] = { // จูล่ง
    onSummon: async (A, p, self) => { if (A.avatars(p).some(x => x !== self)) return; const c = await A.pickFrom(p, A.hell(p), c => generalCard(c, 'green') && c.id !== 'BT08-037', 'อัญเชิญ "ขุนพล" สีเขียว จากนรก', true); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); },
    onAllyDestroyed: async (A, p, h, a) => {
      if (!A.named(a.card, 'จ๊กก๊ก') || !A.roomFor(p, h.card)) return;
      const hand = A.hand(p); const pay = A.findPayment(p, hand.indexOf(h)); if (!pay || !await askYes(A, p, 'อัญเชิญ จุติ จูล่ง จากมือ (จ่าย Cost)?', 2)) return;
      const [inst, ...paid] = A.takeFromHand(p, [hand.indexOf(h), ...pay]); A.hell(p).push(...paid); await A.putAvatar(p, inst, { paid, jutti: true });
    },
  };
  E['BT08-038'] = { // มณโฑ
    extraSymbol: 'ยักษ์',
    activateLabel: 'เซ่นไหว้ {ยักษ์}: อัญเชิญ {ยักษ์} POWER เท่ากันจากนรก',
    canActivate: (A, p) => A.avatars(p).some(x => A.isSym(x, 'ยักษ์') && A.hell(p).some(c => isAvatar(c.card) && c.card.symbol === 'ยักษ์' && c.card.power === A.power(x) && c.card.name !== x.card.name)),
    activate: async (A, p) => {
      const xs = A.avatars(p).filter(x => A.isSym(x, 'ยักษ์') && A.hell(p).some(c => isAvatar(c.card) && c.card.symbol === 'ยักษ์' && c.card.power === A.power(x) && c.card.name !== x.card.name));
      const v = await A.choose(p, 'เซ่นไหว้ {ยักษ์}', xs.map(x => A.avOpt(x, 1))); const x = xs.find(y => y.uid === v) || xs[0];
      const pw = A.power(x), nm = x.card.name; await A.sacrifice(p, x);
      const c = await A.pickFrom(p, A.hell(p), c => isAvatar(c) && c.symbol === 'ยักษ์' && c.power === pw && c.name !== nm, 'อัญเชิญ {ยักษ์} จากนรก');
      if (c && await A.summonFrom(p, A.hell(p), c, { jutti: false }) && A.onField(c)) A.addPower(c, 2, 'endTurn');
    },
  };
  const soldierCard = c => isAvatar(c) && (A_named(c, 'ทหาร') || A_named(c, 'รด.'));
  E['BT08-039'] = { // ราชา รด.
    onAllyEnter: async (A, p, self, inst) => { if (soldierCard(inst.card)) A.addPower(self, 1, 'forever'); },
    activateLabel: 'สอดแนม 2: อัญเชิญ "ทหาร"/"รด."',
    canActivate: (A, p) => A.roomFor(p),
    activate: async (A, p) => { await lookTop(A, p, 2, c => soldierCard(c) && c.symbol === 'คน' && c.name !== 'ราชา รด.', 'อัญเชิญ "ทหาร"/"รด."', async c => { if (A.roomFor(p, c.card)) await A.summonFrom(p, [], c, { jutti: false }); else { A.deck(p).push(c); A.shuffleDeck(p); } }); },
  };
  E['BT08-041'] = { endPhase: async (A, p) => { if (A.avatars(p).filter(x => A.named(x.card, MONKEY)).length >= 3 && !A.state.magicUsed[p]['name:ศาสตราจารย์วานร']) { A.state.magicUsed[p]['name:ศาสตราจารย์วานร'] = true; A.draw(p, 2); } } }; // ศาสตราจารย์วานร
  E['BT08-042'] = { // ปีศาจวานร
    onBattleWin: async (A, p, self) => {
      if (self.onceTurn === A.state.turn || !A.hand(p).length || !A.avatars(p).some(x => x !== self && A.named(x.card, MONKEY))) return;
      if (!await askYes(A, p, 'ทิ้ง 1 ใบ ให้ปีศาจวานรกลับมาสภาพตื่น?', A.avatars(A.opp(p)).length ? 2 : 0)) return;
      self.onceTurn = A.state.turn; await A.discard(p, 1); A.wake(self); A.log(`${self.card.name} กลับมาสภาพตื่น`);
    },
  };
  E['BT08-043'] = { cannotAttack: (A, a) => A.attached(a).filter(m => isAvatar(m.card)).length < 2, equipOnly: c => A_named(c, 'Tank Ranger') }; // รถถังเฟืองเหล็ก
  E['BT08-048'] = { canUse: (A, p) => A.hand(p).some(h => h.card.type === 'magic' && h.card.magicType === 'modification'), magic: async (A, p) => { const c = await A.pickFrom(p, A.hand(p), c => c.type === 'magic' && c.magicType === 'modification', 'ทิ้ง Modification Magic 1 ใบ'); if (!c) return; A.hell(p).push(A.takeFrom(A.hand(p), c)); A.draw(p, 2); } }; // ขายแดก !!!
  E['BT08-049'] = { // แหมกำบ่อ้าย
    canUse: (A, p) => A.deck(p).length <= 15 && A.hell(p).length > 0,
    magic: async (A, p, inst) => { for (let k = 0; k < 5; k++) { const c = await A.pickFrom(p, A.hell(p), c => c.name !== 'แหมกำบ่อ้าย', `นำการ์ดจากนรกกลับเข้า Deck (${k + 1}/5)`, true); if (!c) break; A.deck(p).push(A.takeFrom(A.hell(p), c)); } A.shuffleDeck(p); void inst; },
  };
  E['BT08-050'] = { // ขอดูดดดดดด
    canUse: (A, p) => A.avatars(p).length > 0 || A.avatars(A.opp(p)).length > 0,
    magic: async (A, p) => {
      if (A.avatars(A.opp(p)).length) { const v = await A.choose(p, 'Avatar อีกฝ่าย POWER -1', bestOppAvatar(A, p)); const a = A.avatars(A.opp(p)).find(x => x.uid === v); if (a) A.addPower(a, -1, 'endTurn'); }
      if (A.avatars(p).length) { const v = await A.choose(p, 'Avatar ฝ่ายเรา POWER +1', A.avatars(p).map(x => A.avOpt(x, A.power(x)))); const a = A.avatars(p).find(x => x.uid === v); if (a) A.addPower(a, 1, 'endTurn'); }
    },
  };
  const rickyRevenge = async (A, p) => { const xs = A.avatars(p).filter(a => A.named(a.card, RICKY)); const v = await A.choose(p, 'ส่ง "ริกกี้" ลงนรก', xs.map(x => A.avOpt(x, 1))); const x = xs.find(y => y.uid === v) || xs[0]; if (x) await rickySwap(A, p, x, true); };
  E['BT08-051'] = { // หนังมนุษย์ ชุดแก้แค้น
    canUse: (A, p) => A.avatars(p).some(a => A.named(a.card, RICKY)) && A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, RICKY)),
    magic: async (A, p) => rickyRevenge(A, p),
    react: { anyType: true, on: 'attack', when: (A, p) => A.avatars(p).some(a => A.named(a.card, RICKY)) && A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, RICKY)), botScore: () => 0.5, run: async (A, p) => rickyRevenge(A, p) },
  };
  E['BT08-052'] = { // Overdose
    canUse: (A, p) => A.state.players[p].life.filter(l => !l.faceUp).length > 2 && A.roomFor(p),
    magic: async (A, p) => { A.flipLife(p, 2); const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && A_named(c, 'Overdose') && (c.cost || 0) <= 5, 'อัญเชิญ "Overdose" จาก Deck', true); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p); },
  };
  E['BT08-053'] = { // การสละชีพของเทพธิดา
    canUse: (A, p) => A.avatars(p).some(a => A.named(a.card, VALKYRIE)) && A.avatars(A.opp(p)).length > 0,
    magic: async (A, p) => {
      const xs = A.avatars(p).filter(a => A.named(a.card, VALKYRIE)); const v = await A.choose(p, 'ทำลาย "เทพธิดาแห่งวัลฮัลลา" ของเรา', xs.map(x => A.avOpt(x, -A.power(x)))); await A.destroy(xs.find(x => x.uid === v) || xs[0], 'การสละชีพของเทพธิดา');
      const t = await A.choose(p, 'ทำลาย Avatar อีกฝ่าย', bestOppAvatar(A, p)); const d = A.avatars(A.opp(p)).find(x => x.uid === t); if (d) await A.destroy(d, 'การสละชีพของเทพธิดา', p);
    },
    onMilled: async (A, p, c, src) => { if (!milledByGod(src) || !A.roomFor(p)) return; const v = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, VALKYRIE), 'อัญเชิญ "เทพธิดาแห่งวัลฮัลลา" จากนรก', true); if (v) await A.summonFrom(p, A.hell(p), v, { jutti: false }); },
  };
  E['BT08-054'] = { // โจมตีตัวฉันให้โดนถ้าหากเธอทำได้
    react: {
      on: 'attack', when: (A, p) => A.avatars(p).length > 0,
      botScore: (A, p, ctx) => (A.avatars(p).some(x => A.power(x) > A.power(ctx.attacker)) ? 3 : -1),
      run: async (A, p, ctx) => { const v = await A.choose(p, 'เปลี่ยนเป้าหมายการโจมตีไปที่ใบไหน', A.avatars(p).map(x => A.avOpt(x, A.power(x) - A.power(ctx.attacker)))); return { retarget: v }; },
    },
  };
  E['BT08-055'] = { react: { on: 'lastWill', botScore: () => 1.5, run: async () => ({ cancel: true }) } }; // แผนการ : ตอกฝาโลง
  E['BT08-056'] = { // ลุ้นเยี่ยวเหนียว
    react: {
      on: 'attack', when: (A, p) => A.avatars(p).length > 0 && A.avatars(A.opp(p)).length > 0,
      botScore: (A, p) => (A.avatars(A.opp(p)).length > A.avatars(p).length ? 1 : -1),
      run: async (A, p) => {
        const d = [A.dice(), A.dice()]; A.log(`🎲 ${A.state.players[p].name} ${d[0]} / ${A.state.players[A.opp(p)].name} ${d[1]}`);
        if (d[0] === d[1]) return; const lo = d[0] < d[1] ? p : A.opp(p);
        A.avatars(lo).slice().forEach(a => A.toDeckBottom(a));
        if (lo === A.opp(p)) return { cancelAttack: true };
      },
    },
  };
  E['BT08-057'] = { react: { on: 'attack', botScore: (A, p, ctx) => (ctx.target.kind === 'life' || A.power(ctx.attacker) >= 5 ? 2 : 0.5), run: async () => ({ cancelAttack: true }) } }; // แหม่อ้ายก็~~~
  E['BT08-058'] = { // รัททาทุยเกาะหน้า
    react: {
      on: 'destroyedByOpp', when: (A, p, ctx) => ctx.avatar.card.symbol === RAT, botScore: () => 3,
      run: async (A, p) => {
        const v = await A.choose(p, 'ทำลาย Avatar อีกฝ่าย Cost ≤5', bestOppAvatar(A, p, a => A.cost(a) <= 5)); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) await A.destroy(d, 'รัททาทุยเกาะหน้า', p);
        if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.deck(p), c => isAvatar(c) && c.symbol === RAT && c.cost === 1 && c.power === 1 && A.gem(c) === 1, 'อัญเชิญ {รัททาทุย} Cost 1 จาก Deck', true);
        if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p);
      },
    },
  };
  E['BT08-059'] = { // ดาบศักดิ์สิทธิ์ คาเรนต์
    magic: true, equipOk: (A, a) => A.named(a.card, KNIGHT),
    equipKw: (A, a) => (A.named(a.card, 'มอเดรด') ? ['เตะไข่'] : []),
    onEquippedBattleWin: async (A, p) => { const ms = A.fieldMagic().filter(m => m.owner !== p); if (!ms.length) return; const v = await A.choose(p, 'ทำลาย Magic บนสนามอีกฝ่าย', ms.map(m => A.cardOpt(m, 1))); const m = ms.find(x => x.uid === v); if (m) A.destroyMagic(m); },
    hellActivateLabel: E['BT05-064'].hellActivateLabel, canHellActivate: E['BT05-064'].canHellActivate, hellActivate: E['BT05-064'].hellActivate,
  };
  const ARTHUR = 'อาเธอร์ ราชาแห่งอัศวินโต๊ะกลม';
  E['BT08-060'] = { // เอกซ์คาลิเบอร์
    magic: true, equipOk: (A, a) => a.card.name === ARTHUR, equipPower: 2, guardHost: () => true,
    hellActivateLabel: 'สวมเอกซ์คาลิเบอร์จากนรกให้ อาเธอร์',
    canHellActivate: (A, p) => !A.magicUsed(p, 'modification') && A.avatars(p).some(a => a.card.name === ARTHUR),
    hellActivate: async (A, p, h) => { const t = A.avatars(p).find(a => a.card.name === ARTHUR); if (!t) return; A.markMagicUsed(p, 'modification'); await A.attach(p, A.takeFrom(A.hell(p), h), t); },
  };
  E['BT08-061'] = { // ขวาน 7 สี
    magic: true,
    equipKw: (A, a) => (A.isColor(a.card, 'green') ? ['ลูกฮึด'] : []),
    onEquippedAttack: async (A, p, m, a) => {
      if (A.isColor(a.card, 'red')) A.addPower(a, 2, 'endTurn');
      if (A.isColor(a.card, 'blue')) A.draw(p, 1);
      if (A.isColor(a.card, 'purple')) { await A.mill(p, 1, m); if (A.onField(a)) A.addPower(a, 1, 'endTurn'); }
    },
  };
  E['BT08-062'] = { magic: true, equipOk: (A, a) => a.card.name === 'เต่า', onHostBattle: async (A, p, m, x, y) => { A.addPower(y, -1, 'endTurn'); } }; // เนยถั่ว
  E['BT08-063'] = { // บิฟร็อสต์ สะพานสายรุ้ง
    magic: true,
    onAnyMill: async (A, owner) => { const xs = A.avatars(owner); if (!xs.length) return; const v = await A.choose(owner, 'บิฟร็อสต์: Avatar ฝ่ายเราได้รับ สามัคคี', xs.map(x => A.avOpt(x, A.power(x)))); const a = xs.find(x => x.uid === v); if (a) A.grantKw(a, ['สามัคคี']); },
    onMilled: async (A, p, c, src) => { if (milledByGod(src)) A.toHand(p, A.takeFrom(A.hell(p), c)); },
  };
  E['BT08-065'] = { // โคกอีสานนูน
    magic: true,
    activateLabel: 'นำการ์ดในนรก 6 ใบกลับ Deck: จั่ว 1',
    canActivate: (A, p) => A.avatars(p).some(a => A.named(a.card, SLINGER)) && A.hell(p).filter(c => c.card.type !== 'magic').length + Math.min(2, A.hell(p).filter(c => c.card.type === 'magic').length) >= 6,
    activate: async (A, p) => {
      let mg = 0;
      for (let k = 0; k < 6; k++) { const c = await A.pickFrom(p, A.hell(p), c => c.type !== 'magic' || mg < 2, `นำการ์ดจากนรกกลับเข้า Deck (${k + 1}/6)`); if (!c) break; if (c.card.type === 'magic') mg++; A.deck(p).push(A.takeFrom(A.hell(p), c)); }
      A.shuffleDeck(p); A.draw(p, 1);
    },
  };
  E['BT08-066'] = { // เรือรบโบราณ
    multiCopies: true,
    activateLabel: 'เลือก: สอดแนม 5 หา "พลเดินทัพ"/"ขุนพล" / คืน "พลเดินทัพ" เข้า Deck',
    activate: async (A, p) => {
      const opts = [{ label: 'สอดแนม 5 หา "พลเดินทัพ"/"ขุนพล" POWER ≤2', value: 1, score: 2 }];
      if (A.hell(p).some(c => A_named(c.card, 'พลเดินทัพ'))) opts.push({ label: 'นำ "พลเดินทัพ" จากนรกกลับเข้า Deck', value: 2, score: 0.5 });
      const v = await A.choose(p, 'เรือรบโบราณ: เลือกปฏิบัติ', opts);
      if (v === 2) { const c = A.hell(p).find(c => A_named(c.card, 'พลเดินทัพ')); A.deck(p).push(A.takeFrom(A.hell(p), c)); A.shuffleDeck(p); return; }
      await lookTopBottom(A, p, 5, [{ pred: c => isAvatar(c) && (A_named(c, 'พลเดินทัพ') || A_named(c, GENERAL3)) && c.symbol === FOREIGN && (c.power || 0) <= 2, title: 'เลือก "พลเดินทัพ"/"ขุนพล"' }], async c => {
        if (A.roomFor(p, c.card) && await askYes(A, p, `อัญเชิญ ${c.card.name} (ไม่เลือก = ขึ้นมือ)?`, 1)) await A.summonFrom(p, [], c, { jutti: false }); else A.toHand(p, c);
      });
    },
  };
  E['BT08-067'] = { aura: (A, p, src, a) => (a.owner === p && (a.card.cost || 0) === 0 ? 1 : 0) }; // สนามของนักวิ่งตัวจริง
  E['BT08-068'] = { // ยิมทมิฬ
    aura: (A, p, src, a) => (A.named(a.card, 'บึงทมิฬ People') ? 1 : 0),
    kwAura: (A, src, a) => (A.named(a.card, 'บึงทมิฬ People') ? ['สามัคคี'] : []),
    untargetableConstruct: (A, c, owner) => A.avatars(owner).some(a => a.card.name === 'วอเตอร์แมน'),
  };
  E['BT08-069'] = { // บัลลังก์โอดิน
    aura: (A, p, src, a) => (a.owner === p && A.state.active === p && A.state.phase === 'battle' && A.isSym(a, 'เทพ') && A.isColor(a.card, 'purple') ? (A.named(a.card, 'โอดิน') ? 3 : 1) : 0),
    activateLabel: 'ทำลายใบนี้: นำ "โอดิน" จากนรกขึ้นมือ',
    canActivate: (A, p) => A.hell(p).some(c => isAvatar(c.card) && A_named(c.card, 'โอดิน')),
    activate: async (A, p, c) => { if (!await A.destroyConstruct(c, 'บัลลังก์โอดิน')) return; const o = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, 'โอดิน'), 'นำ "โอดิน" ขึ้นมือ'); if (o) A.toHand(p, A.takeFrom(A.hell(p), o)); },
    onMilled: async (A, p, c) => { if (A.constructs(p).length < 3 && !A.constructs(p).some(x => x.card.name === c.card.name)) { A.constructs(p).push(A.takeFrom(A.hell(p), c)); A.log(`ก่อสร้าง "${c.card.name}" จากการถูกธรณีสูบ`); } },
  };
  E['BT08-070'] = lifeDraw1; // อ่อ กระต่ายตาย


  // ================= BT09 =================
  const POLY = /โพล[ิี]กอน/, isPoly = c => POLY.test(c.name || '') || (c.alsoNamed || []).some(n => POLY.test(n));
  const CULT = 'แห่หัว', POJI = 'BT09-017', FRUIT = 'ภูติผลไม้', JUNGLE = 'ป่าพงไพร เผ่าพงศ์พันธุ์', STORY = 'เรื่องราว', STORYTELLER = 'นักท่องเรื่องราว';
  const PEMMU = 'เพมมุ', PEMMU_GUN = /อาวุ[ธร]ของเพมมุ/, SPRITE = 'สไปรท์', MAY = 'เมย์ แวมไพร์โกธิค', VALK9 = VALKYRIE;
  (root.TC_CARDS || []).forEach(c => {
    if (c.id === 'BT09-015' && !(c.alsoNamed || []).includes(SNOWMAN)) c.alsoNamed = (c.alsoNamed || []).concat(SNOWMAN);
    if (c.id === 'BT09-031' && !(c.alsoNamed || []).includes('จอมเวทย์')) c.alsoNamed = (c.alsoNamed || []).concat('จอมเวทย์');
  });
  const byCard = (A, a, word) => { const c = a.summonedBy && A.cardById(a.summonedBy); return !!(c && A_named(c, word)); };
  const jungleLand = A => !!A.state.land && A.state.land.card.name === JUNGLE;
  const hellMagic = (A, p) => A.hell(p).filter(c => c.card.type === 'magic').length;
  const destroyOppByCost = async (A, p, max) => {
    const v = await A.choose(p, `ทำลาย Avatar อีกฝ่าย Cost ≤${max}`, bestOppAvatar(A, p, a => A.cost(a) <= max), true);
    const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (!d) return false; await A.destroy(d, 'ความสามารถการ์ด', p); return true;
  };
  E['BT09-001'] = { // พระอิศวร วีลแชร์
    setPower: (A, p, a) => (a.setBase != null ? a.setBase : (a.card.power || 0)),
    onEnter: async (A, p, self) => { delete self.setBase; },
    onAllyDestroyed: async (A, p, h, a) => {
      if (!A.named(a.card, 'พระอิศวร') || !A.hell(p).includes(a) || !A.roomFor(p, h.card) || !await askYes(A, p, 'อัญเชิญ พระอิศวร วีลแชร์ จากมือ?', 2)) return;
      if (!await A.summonFrom(p, A.hand(p), h, { jutti: false }) || !A.onField(h)) return;
      const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, 'พระอิศวร'), 'เลือก "พระอิศวร" ในนรก (POWER ตั้งต้น = ครึ่งหนึ่ง)');
      if (c) { h.setBase = Math.floor((c.card.power || 0) / 2); A.log(`${h.card.name} POWER ตั้งต้นเป็น ${h.setBase}`); }
      const v = await A.choose(p, `Avatar อีกฝ่าย POWER -${A.power(h)}`, bestOppAvatar(A, p)); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d && A.power(h)) A.addPower(d, -A.power(h), 'forever');
    },
  };
  E['BT09-002'] = { aura: (A, p, src, a) => (a.owner === p && A.named(a.card, CULT) ? (src.summonedBy === POJI ? 2 : 1) : 0) }; // เนอร์เกิ้ล เนียร์
  E['BT09-003'] = { // นางฟ้าลูกซอง
    hellActivateLabel: 'เนรเทศจากนรก: Avatar ฝ่ายเรา POWER +2',
    canHellActivate: (A, p) => A.avatars(p).length > 0,
    hellActivate: async (A, p, h) => { A.exile(p, A.hell(p), h); const v = await A.choose(p, 'Avatar ฝ่ายเรา POWER +2 จนจบเทิร์น', A.avatars(p).map(x => A.avOpt(x, A.power(x)))); const a = A.avatars(p).find(x => x.uid === v); if (a) A.addPower(a, 2, 'endTurn'); },
  };
  E['BT09-004'] = { // DJ ปีโป้
    onAllyLifeHit: async (A, p) => {
      A.log(`🎤 ${A.state.players[p].name}: "ขอโทษ"`);
      if (A.state.players[p].forgiveTurn === A.state.turn) { A.log('ได้รับการยกโทษ (ขอโทษสังคม)'); return true; }
      const v = await A.choose(A.opp(p), 'DJ ปีโป้ ขอโทษ — ยกโทษให้ไหม? (ถ้ายกโทษ ความสามารถของ LIFE ใบนั้นจะไม่ทำงาน)', [{ label: 'ยกโทษให้', value: 1, score: -1 }], true);
      if (v) A.log('ได้รับการยกโทษ'); else A.log('ไม่ยกโทษให้');
      return !!v;
    },
  };
  E['BT09-005'] = { // กัณหา นาคเกล็ดดำ
    atBattleStart: async (A, p, self) => { if (A.power(self) >= 7) { self.kanhaTurn = A.state.turn; A.log(`${self.card.name} ได้รับความสามารถจนจบเทิร์น`); } },
    onBattleWin: async (A, p, self) => {
      if (self.kanhaTurn !== A.state.turn || !A.roomFor(p)) return;
      const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, 'นาค') && x.cost === 3 && x.symbol === 'สัตว์วิเศษ', 'อัญเชิญ "นาค" Cost 3 {สัตว์วิเศษ} จาก Deck', true);
      if (c) await A.summonFrom(p, A.deck(p), c, { jutti: true }); A.shuffleDeck(p);
    },
  };
  E['BT09-006'] = { // ลูเซีย โพลีกอน
    alsoColor: 'purple',
    activateLabel: 'นำ Avatar {เทพ}/{นรก}/"โพลิกอน" Cost ≤5 จาก Deck ไว้บนสุด',
    canActivate: (A, p) => A.deck(p).some(c => isAvatar(c.card) && (c.card.cost || 0) <= 5 && !c.card.onlyOne && (['เทพ', 'นรก'].includes(c.card.symbol) || isPoly(c.card))),
    activate: async (A, p) => {
      const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && (x.cost || 0) <= 5 && !x.onlyOne && (['เทพ', 'นรก'].includes(x.symbol) || isPoly(x)), 'เลือก Avatar แสดงให้อีกฝ่ายดู แล้ววางบนสุดของ Deck');
      if (!c) return; A.takeFrom(A.deck(p), c); A.shuffleDeck(p); A.deck(p).unshift(c); A.log(`แสดง "${c.card.name}" แล้ววางไว้บนสุดของ Deck`);
    },
  };
  E['BT09-007'] = { // โฮคุ โพลีกอน
    extraSymbol: 'สัตว์',
    continuousSelf: (A, p, a) => (A.avatars(0).concat(A.avatars(1)).some(x => x !== a) ? 1 : 0),
    onLink: async (A, p) => {
      const xs = A.avatars(A.opp(p)); if (!xs.length) return; const top = Math.max(...xs.map(x => A.power(x)));
      const v = await A.choose(p, 'ทำลาย Avatar POWER สูงสุดของอีกฝ่าย', xs.filter(x => A.power(x) === top).map(x => A.avOpt(x, A.cost(x)))); const d = xs.find(x => x.uid === v); if (d) await A.destroy(d, 'โฮคุ โพลีกอน', p);
    },
    shieldAllies: (A, src, x) => !!A.linked(src) && x !== src,
  };
  E['BT09-008'] = { // เพมมุ ยอดมนุษย์
    equipOnly: c => PEMMU_GUN.test(c.name || ''),
    continuousSelf: (A, p, a) => (A.attached(a).some(m => m.card.type === 'magic') ? 2 : 0),
    activateLabel: '"IKUZO AIBOU": สวมใส่ "อาวุธของเพมมุ" จาก Deck',
    canActivate: (A, p, a) => !!A.linked(a) && !A.magicUsed(p, 'modification') && A.deck(p).some(c => PEMMU_GUN.test(c.card.name)),
    activate: async (A, p, a) => {
      A.log(`📣 ${A.state.players[p].name}: "IKUZO AIBOU!"`);
      const c = await A.pickFrom(p, A.deck(p), x => PEMMU_GUN.test(x.name), 'สวมใส่ "อาวุธของเพมมุ"'); if (!c) return;
      A.markMagicUsed(p, 'modification'); await A.attach(p, A.takeFrom(A.deck(p), c), a); A.shuffleDeck(p);
    },
  };
  E['BT09-009'] = { // สไปรท์ ยอดสุนัข
    condKw: (A, a) => (A.linked(a) ? ['โล่มนุษย์', 'ลูกฮึด', 'สามัคคี'] : []), condKwOnly: ['โล่มนุษย์', 'ลูกฮึด', 'สามัคคี'],
    endPhase: async (A, p, a) => { if (!A.linked(a)) return; if (a.rested) { A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`); } A.addPower(a, 2, 'myNextTurn'); },
  };
  E['BT09-010'] = { // เมย์ แวมไพร์โกธิค
    setPower: (A, p, a) => (A.linked(a) ? 5 : (a.card.power || 0)),
    shieldAllies: (A, src, x) => !!A.linked(src) && x.card.name === 'เจ้าหญิงรวงข้าว',
    onAllyBattle: async (A, p, h, x) => {
      if (!(A.named(x.card, PEMMU) || A.named(x.card, SPRITE)) || A.dark(p).some(c => c.card.name === MAY)) return;
      if (!await askYes(A, p, `เนรเทศ เมย์ จากมือ: ${x.card.name} POWER +4?`, 2)) return;
      A.exile(p, A.hand(p), h); A.addPower(x, 4, 'endTurn');
    },
  };
  E['BT09-011'] = { // เจ้าหญิงรวงข้าว
    onSummon: async (A, p) => {
      const pool = A.dark(p).filter(c => c.card.name === MAY).concat(A.hell(p).filter(c => PEMMU_GUN.test(c.card.name)));
      const v = await A.choose(p, 'นำ เมย์ (มิติมืด) หรือ "อาวุธของเพมมุ" (นรก) กลับเข้า Deck', pool.map(c => A.cardOpt(c)), true); const c = pool.find(x => x.uid === v); if (!c) return;
      A.takeFrom(A.dark(p).includes(c) ? A.dark(p) : A.hell(p), c); A.deck(p).push(c); A.shuffleDeck(p); A.draw(p, 1);
    },
    aura: (A, p, src, a) => (a.owner === p && A.state.active === p && A.linked(a) && (A.named(a.card, PEMMU) || A.named(a.card, SPRITE) || a.card.name === MAY) ? 2 : 0),
  };
  const handsome = c => ['กุ่ย', 'ฮอล', 'นาย'].some(n => A_named(c, n));
  const hero6 = c => isAvatar(c) && A_named(c, 'วีรบุรุษ') && c.cost === 6;
  E['BT09-012'] = { anyColorFor: handsome, onSummon: async (A, p, self) => { if (self.exact) await lookTop(A, p, 7, hero6, 'นำ "วีรบุรุษ" Cost 6 ขึ้นมือ', async c => A.toHand(p, c)); } }; // กุ่ย หน้าตาดี
  E['BT09-013'] = { // ฮอล หน้าตาดี
    anyColorFor: handsome,
    onSummon: async (A, p, self) => { if (!self.exact) return; const c = await A.pickFrom(p, A.hell(p), hero6, 'นำ "วีรบุรุษ" Cost 6 จากนรกกลับเข้า Deck', true); if (!c) return; A.deck(p).push(A.takeFrom(A.hell(p), c)); A.shuffleDeck(p); A.draw(p, 1); },
  };
  E['BT09-014'] = { // นาย หน้าตาดี
    anyColorFor: handsome,
    onSummon: async (A, p, self) => { if (!self.exact || !A.roomFor(p)) return; const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && (A_named(x, 'กุ่ย') || A_named(x, 'ฮอล')), 'อัญเชิญ "กุ่ย"/"ฮอล" จากนรก', true); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); },
  };
  E['BT09-015'] = { // เพนกวินหิมะ เหลียง
    extraSymbol: 'ต่างชาติ',
    gemAs: (A, p, pc, target) => (A_named(target, 'ราชินีหิมะ') ? 4 : null),
    activateLabel: 'เซ่นไหว้ใบนี้: อัญเชิญ "ทหารหิมะ" POWER 2 จาก Deck 2 ใบ',
    canActivate: (A, p) => A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, SNOWMAN) && c.card.power === 2),
    activate: async (A, p, self) => {
      await A.sacrifice(p, self);
      const royal = A.hell(p).filter(c => isAvatar(c.card) && A_named(c.card, SNOWMAN)).length >= 12 && A.deck(p).some(c => c.card.name === 'ราชาหิมะ บิง') && A.deck(p).some(c => c.card.name === 'ราชินีหิมะ ชีหลิง');
      if (royal && await askYes(A, p, 'อัญเชิญ ราชาหิมะ บิง และ ราชินีหิมะ ชีหลิง แทน?', 3)) {
        for (const n of ['ราชาหิมะ บิง', 'ราชินีหิมะ ชีหลิง']) { const c = A.deck(p).find(x => x.card.name === n); if (c && A.roomFor(p, c.card)) await A.summonFrom(p, A.deck(p), c, { jutti: false }); }
      } else for (let k = 0; k < 2 && A.roomFor(p); k++) { const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, SNOWMAN) && x.power === 2, `อัญเชิญ "ทหารหิมะ" POWER 2 (${k + 1}/2)`); if (!c) break; await A.summonFrom(p, A.deck(p), c, { jutti: false }); }
      A.shuffleDeck(p);
    },
  };
  // pick hand cards whose GEM adds up to exactly n (smallest value first)
  const exactGems = (A, p, h, n) => {
    const cs = A.hand(p).filter(x => x !== h && A.gem(x.card) > 0).slice(0, 10); let best = null;
    for (let m = 1; m < (1 << cs.length); m++) { const pick = cs.filter((_, i) => m & (1 << i)); if (pick.reduce((s, x) => s + A.gem(x.card), 0) !== n) continue; if (!best || pick.length < best.length) best = pick; }
    return best;
  };
  E['BT09-016'] = { // รัททาทุย นินจา
    onAllyDestroyed: async (A, p, h, a) => {
      if (!(a.card.symbol === RAT || A.named(a.card, 'นินจา')) || !A.roomFor(p, h.card)) return;
      const pay = exactGems(A, p, h, 3); if (!pay || !await askYes(A, p, `อัญเชิญ รัททาทุย นินจา โดยทิ้ง ${pay.map(x => x.card.name).join(', ')} (GEM 3)?`, 2)) return;
      pay.forEach(x => A.hell(p).push(A.takeFrom(A.hand(p), x))); await A.summonFrom(p, A.hand(p), h, { jutti: false });
    },
  };
  const CULTISTS = [['avatar', 'เนอร์เกิ้ล'], ['magic', 'แมวดำ สมาชิกลัทธิแห่หัว'], ['construct', 'ปอนด์ สมาชิกลัทธิแห่หัว']];
  E['BT09-017'] = { // พี่โปจิ เจ้าลัทธิแห่หัว
    activateLabel: 'เนรเทศการ์ดจาก Deck: อัญเชิญสมาชิกลัทธิแห่หัว',
    canActivate: (A, p) => A.roomFor(p) && CULTISTS.some(([t, n]) => A.deck(p).some(c => c.card.type === t) && A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, n))),
    activate: async (A, p, self) => {
      const ok = CULTISTS.map(([t, n], i) => ({ t, n, i })).filter(o => A.deck(p).some(c => c.card.type === o.t) && A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, o.n)));
      const v = await A.choose(p, 'พี่โปจิ: เลือกปฏิบัติ', ok.map(o => ({ label: `เนรเทศ ${o.t === 'avatar' ? 'Avatar' : o.t === 'magic' ? 'Magic' : 'Construct'} จาก Deck → อัญเชิญ ${o.n}`, value: o.i, score: 3 - o.i })));
      const o = ok.find(x => x.i === v) || ok[0];
      const c = await A.pickFrom(p, A.deck(p), x => x.type === o.t && !(isAvatar(x) && A_named(x, o.n)), `เนรเทศ ${o.t} 1 ใบจาก Deck`); if (c) A.exile(p, A.deck(p), c);
      const s = A.deck(p).find(x => isAvatar(x.card) && A_named(x.card, o.n)); if (s) await A.summonFrom(p, A.deck(p), s, { jutti: false, by: self.card.id });
      A.shuffleDeck(p);
    },
  };
  E['BT09-018'] = { lastWill: async (A, p) => { A.state.players[p].alienPact = true; A.log('เกมนี้อัญเชิญได้แค่ Avatar {เอเลี่ยน} สีฟ้า และ "ตัวอะไรสักอย่าง" บนมือ Cost -2'); } }; // ตัวอะไรสักอย่างที่เป็นมิตรและพูดมาก
  E['BT09-019'] = { // หมาป่าเดียวดาย
    onSummon: async (A, p) => {
      let left = 5;
      while (A.roomFor(p)) { const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && x.symbol === 'สัตว์' && (x.cost || 0) <= left, `อัญเชิญ {สัตว์} จาก Deck (Cost รวมเหลือ ${left})`, true); if (!c) break; left -= c.card.cost || 0; await A.summonFrom(p, A.deck(p), c, { jutti: false }); }
      A.shuffleDeck(p);
    },
    onAttack: async (A, p, a) => { const n = A.avatars(p).filter(x => x !== a && A.isSym(x, 'สัตว์')).length + A.constructs(p).filter(c => c.card.symbol === 'สัตว์').length; if (n) A.addPower(a, n, 'endTurn'); },
  };
  E['BT09-020'] = { // กัล มนุษย์ดาว R18
    setPower: (A, p, a) => (a.card.power || 0) + 3 * (a.r18Bonus || 0),
    onEnter: async (A, p, self) => { self.r18Bonus = self.r18Pending || 0; delete self.r18Pending; },
    handActivateLabel: 'ส่ง "ข้ารับใช้" ลงนรก: อัญเชิญ จุติ ใบนี้',
    canHandActivate: (A, p, h) => A.roomFor(p, h.card) && servants(A, p).length > 0,
    handActivate: async (A, p, h) => {
      let n = 0;
      for (let k = 0; k < 2; k++) { const xs = servants(A, p); const v = await A.choose(p, `ส่ง "ข้ารับใช้" ลงนรก (${k + 1}/2)`, xs.map(m => A.cardOpt(m, 1)), k > 0); const m = xs.find(x => x.uid === v); if (!m) break; A.unparkToHell(m); n++; }
      h.r18Pending = n; await A.summonFrom(p, A.hand(p), h, { jutti: true });
    },
    onSummon: async (A, p, self) => {
      const v = await A.choose(p, 'ยึด Avatar อีกฝ่ายที่ POWER น้อยกว่า ไปไว้ที่ Magic Zone ฝ่ายเรา', A.avatars(A.opp(p)).filter(a => A.power(a) < A.power(self)).map(a => A.avOpt(a, A.power(a) + A.cost(a) + 1)), true);
      const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (!d) return;
      if (d.linked) { A.log(`${d.card.name} อยู่ในสถานะคู่หู — ยึดไม่ได้`); return; }
      makeServant(A, p, d);
    },
  };
  E['BT09-021g'] = { activateLabel: 'ทิ้ง 2 ใบ: อัญเชิญจาก Magic Zone', canActivate: (A, p, m) => A.hand(p).length >= 2 && A.roomFor(p, m.card), activate: async (A, p, m) => { await A.discard(p, 2); const pl = A.state.players[p]; pl.magicZone.splice(pl.magicZone.indexOf(m), 1); delete m.grantFx; await A.summonFrom(p, [], m, { jutti: false }); } };
  E['BT09-021'] = { // คราเค่น ปลาหมึกปีศาจ
    activateLabel: 'ทิ้ง 1 ใบ: ส่ง Avatar อีกฝ่าย POWER ≥8 ไปที่ Magic Zone',
    canActivate: (A, p) => A.hand(p).length > 0 && A.avatars(A.opp(p)).some(x => A.power(x) >= 8),
    activate: async (A, p) => {
      await A.discard(p, 1); const v = await A.choose(p, 'ส่ง Avatar POWER ≥8 ไปที่ Magic Zone ของอีกฝ่าย', bestOppAvatar(A, p, x => A.power(x) >= 8)); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (!d) return;
      const o = d.owner; A.park(d, o); d.grantFx = 'BT09-021g';
    },
  };
  E['BT09-022'] = { // โซน่า โพลีกอน
    extraSymbol: 'ปลา',
    onSummon: async (A, p) => {
      let got = null;
      await lookTop(A, p, 3, c => isAvatar(c) && (c.symbol === 'ไซเบอร์' || c.symbol === 'ปลา') && (c.cost || 0) <= 5, 'อัญเชิญ {ไซเบอร์}/{ปลา} Cost ≤5', async c => { if (A.roomFor(p, c.card)) { got = c; await A.summonFrom(p, [], c, { jutti: false }); } else { A.deck(p).push(c); A.shuffleDeck(p); } });
      if (got && POLY.test(got.card.name) && got.card.name.startsWith('โฮคุ')) A.draw(p, 1);
    },
    activateLabel: 'นอน: จั่ว 1 ใบ', canActivate: (A, p, a) => !!A.linked(a) && !a.rested, activate: async (A, p, a) => { A.rest(a); A.draw(p, 1); },
  };
  E['BT09-023'] = { onSummon: async (A, p) => { const v = await A.choose(p, 'ยึด Avatar POWER 0 ของอีกฝ่าย', A.avatars(A.opp(p)).filter(a => A.power(a) === 0).map(a => A.avOpt(a, A.cost(a) + 1)), true); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d && A.takeControl(d, p)) A.addPower(d, 1, 'forever'); } }; // ริน บันนี่เกิร์ล
  const thorMax = (A, p) => 3 + Math.floor(A.hell(p).length / 10);
  E['BT09-024'] = { // ธอร์ บุตรแห่งโอดิน
    onBattleWin: async (A, p, self) => { if (!A.linked(self)) return; const max = thorMax(A, p); if (!A.avatars(A.opp(p)).some(x => A.cost(x) <= max) || !await destroyOppByCost(A, p, max)) A.flipLife(A.opp(p), 1); },
  };
  E['BT09-025'] = { // โลกิ เจ้าชายยักษ์น้ำแข็ง
    cannotAttack: () => true, supportOnly: at => A_named(at.card, 'ธอร์'),
    activateLabel: 'POWER +1 (+1 ต่อการ์ดในนรกทุก 5 ใบ)', canActivate: (A, p, a) => !!A.linked(a),
    activate: async (A, p, a) => A.addPower(a, 1 + Math.floor(A.hell(p).length / 5), 'endTurn'),
  };
  E['BT09-026'] = { // แมวดำ สมาชิกลัทธิแห่หัว
    activateLabel: 'อีกฝ่าย ธรณีสูบ 1 / เนรเทศการ์ดล่างสุดในนรกอีกฝ่าย',
    canActivate: (A, p, a) => (a.summonedBy === POJI ? A.hell(A.opp(p)).length > 0 : A.deck(A.opp(p)).length > 1),
    activate: async (A, p, a) => { const o = A.opp(p); if (a.summonedBy === POJI) { const c = A.hell(o)[0]; if (c) A.exile(o, A.hell(o), c); } else await A.mill(o, 1, a); },
  };
  E['BT09-027'] = { // มิสเตอร์โบโบ้
    onSummon: async (A, p, self) => {
      if (!self.exact || !A.deck(p).length) return; const c = A.deck(p)[0]; A.log(`สอดแนม: "${c.card.name}"`);
      if (isAvatar(c.card) && c.card.symbol === 'เทพ' && A.roomFor(p, c.card)) await A.summonFrom(p, A.deck(p), c, { jutti: true }); else { A.hell(p).push(A.takeFrom(A.deck(p), c)); A.log(`"${c.card.name}" ถูกทิ้งลงนรก`); }
    },
  };
  E['BT09-028'] = { // แบงค์ ตัวแดง
    untargetable: (A, x, at) => !!at && A.isColor(at.card, 'red'),
    onAttack: async (A, p, a, tgt) => { if (!A.linked(a) || !tgt || tgt.kind !== 'avatar') return; const d = A.avatars(A.opp(p)).find(x => x.uid === tgt.uid); if (d && A.isColor(d.card, 'red')) A.sendToHell(d); },
  };
  E['BT09-029'] = { untargetable: (A, x, at) => !!at && A.isColor(at.card, 'green') }; // สตางค์น้องชายแบงค์ ตัวเขียว
  E['BT09-030'] = { // ลาพิเน่ โพลีกอน
    extraSymbol: 'สัตว์วิเศษ',
    onOwnDiscard: async (A, p, h) => {
      if (A.deck(p).length < 5 || !await askYes(A, p, 'เนรเทศ ลาพิเน่ จากนรก + ธรณีสูบ 3: จั่ว 1 ใบ?', 2)) return;
      A.exile(p, A.hell(p), h); const milled = await A.mill(p, 3); A.draw(p, 1);
      const c = await A.pickFrom(p, milled.filter(x => A.hell(p).includes(x)), x => isPoly(x), 'นำ "โพลิกอน" จากที่ธรณีสูบขึ้นมือ', true); if (!c) return;
      if (c.card.name.startsWith('ลูเซเน่') && A.roomFor(p, c.card) && await askYes(A, p, 'อัญเชิญ ลูเซเน่ แทนการนำขึ้นมือ?', 2)) await A.summonFrom(p, A.hell(p), c, { jutti: false });
      else A.toHand(p, A.takeFrom(A.hell(p), c));
    },
  };
  const castableHellMagic = (A, p) => c => c.type === 'magic' && !c.onlyOne && (c.magicType || 'normal') === 'normal' && E[c.id] && typeof E[c.id].magic === 'function' && (!E[c.id].canUse || E[c.id].canUse(A, p));
  E['BT09-031'] = { // ลูเซเน่ โพลีกอน
    continuousSelf: (A, p, a) => (A.avatars(p).some(x => x !== a && isPoly(x.card)) ? 2 : A.avatars(p).some(x => x !== a && A.named(x.card, 'จอมเวท')) ? 1 : 0),
    activateLabel: 'ทิ้ง 1 ใบ: เนรเทศ Magic ในนรก แล้วใช้ความสามารถของใบนั้น',
    canActivate: (A, p) => A.hand(p).length > 0 && A.hell(p).some(c => castableHellMagic(A, p)(c.card)),
    activate: async (A, p) => {
      await A.discard(p, 1); const c = await A.pickFrom(p, A.hell(p), castableHellMagic(A, p), 'เนรเทศ Magic ในนรก แล้วใช้ความสามารถ'); if (!c) return;
      A.exile(p, A.hell(p), c); A.state.srcMagic = (A.state.srcMagic || 0) + 1; try { await E[c.card.id].magic(A, p, c, {}); } finally { A.state.srcMagic--; }
    },
  };
  E['BT09-032'] = { // วินดิโก้
    noHandSummon: true,
    onOppSummon: async (A, p, h) => {
      const o = A.opp(p); const log = A.state.players[o].summonLog;
      if (!log || log.turn !== A.state.turn || log.names.length < 3 || !A.roomFor(p, h.card) || !await askYes(A, p, 'อีกฝ่ายอัญเชิญเป็นใบที่ 3 แล้ว — อัญเชิญ วินดิโก้ จากมือ?', 3)) return;
      await A.summonFrom(p, A.hand(p), h, { jutti: false });
    },
    onEnter: async (A, p) => {
      const o = A.opp(p); const xs = A.avatars(o); if (xs.length < 2) return;
      const v = await A.choose(o, 'วินดิโก้: เลือก Avatar ของคุณ 1 ใบที่จะเหลือไว้ (ใบอื่นลงนรกทั้งหมด)', xs.map(x => A.avOpt(x, A.power(x) + A.cost(x))));
      xs.slice().forEach(x => { if (x.uid !== v) A.sendToHell(x); });
    },
  };
  E['BT09-033'] = { // สกินวอคเกอร์
    activateLabel: 'คัดลอก ชื่อ/Cost/GEM/Symbol/POWER ของ Avatar อีกฝ่าย',
    canActivate: (A, p, a) => a.exact && A.avatars(A.opp(p)).length > 0,
    activate: async (A, p, a) => {
      const v = await A.choose(p, 'เลือก Avatar อีกฝ่ายที่จะคัดลอก', bestOppAvatar(A, p)); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (!d) return;
      const pw = A.power(d), orig = a.origCard || a.card; a.origCard = orig;
      a.card = Object.assign({}, orig, { name: d.card.name, cost: d.card.cost, gems: d.card.gems, symbol: d.card.symbol, power: pw });
      A.log(`${orig.name} กลายเป็น "${d.card.name}" (POWER ${pw}) จนจบเทิร์น`);
      const t = A.state.turn; A.atEndOfTurn(async () => { if (a.origCard === orig && A.state.turn === t) { a.card = orig; delete a.origCard; } });
    },
  };
  E['BT09-034'] = { // ปอนด์ สมาชิกลัทธิแห่หัว
    activateLabel: 'เนรเทศการ์ดในนรก: "แห่หัว" ได้รับ ลูกฮึด + โล่มนุษย์',
    canActivate: (A, p) => A.hell(p).length > 0 && A.avatars(p).some(x => A.named(x.card, CULT)),
    activate: async (A, p, self) => {
      const c = await A.pickFrom(p, A.hell(p), () => true, 'เนรเทศการ์ดในนรก 1 ใบ'); if (c) A.exile(p, A.hell(p), c);
      const xs = A.avatars(p).filter(x => A.named(x.card, CULT)); const v = await A.choose(p, 'เลือก "แห่หัว"', xs.map(x => A.avOpt(x, A.power(x)))); const a = xs.find(x => x.uid === v); if (!a) return;
      A.grantKwUntil(a, 'ลูกฮึด', A.state.turn + 1); A.grantKwUntil(a, 'โล่มนุษย์', A.state.turn + 1);
      if (self.summonedBy === POJI) a.magicImmuneUntil = A.state.turn + 1;
    },
  };
  E['BT09-035'] = { // เนฟิล ยักษ์ตัวสุดท้าย
    soloOnly: true, noEquip: true,
    onEnter: async (A, p, self) => { A.avatars(p).slice().forEach(x => { if (x !== self) A.sendToHell(x); }); },
    afterBattle: async (A, p, self, foe, foePower) => { if (!foePower) return; A.addPower(self, -foePower, 'forever'); if (A.power(self) <= 0) await A.destroy(self, 'POWER เหลือ 0'); },
    lastWill: async (A, p) => { A.flipLife(p, 1); },
  };
  E['BT09-036'] = { condKw: A => (jungleLand(A) ? ['โล่มนุษย์'] : []) }; // ภูติผลไม้ มะม่วง
  E['BT09-037'] = { // ภูติผลไม้ มะเหมี่ยว
    lastWill: async (A, p, self) => {
      if (!jungleLand(A)) return;
      if (A.roomFor(p)) { const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && A_named(x, FRUIT) && x.name !== self.card.name, 'อัญเชิญ "ภูติผลไม้" จากมือ', true); if (c) await A.summonFrom(p, A.hand(p), c, { jutti: true }); }
      A.draw(p, 1);
    },
  };
  E['BT09-038'] = { condKw: (A, a) => (jungleLand(A) && A.state.players[A.opp(a.owner)].life.some(l => !l.faceUp) ? ['เตะไข่'] : []) }; // ภูติผลไม้ มะเฟือง
  E['BT09-039'] = { // ภูติผลไม้ มะขาม
    onSummon: async (A, p) => {
      const c = await A.pickFrom(p, A.deck(p).concat(A.hell(p)), x => x.name === JUNGLE, `นำ ${JUNGLE} ขึ้นมือ`, true); if (!c) return;
      const fromDeck = A.deck(p).includes(c); A.toHand(p, A.takeFrom(fromDeck ? A.deck(p) : A.hell(p), c)); if (fromDeck) A.shuffleDeck(p);
    },
  };
  E['BT09-040'] = { onAttack: async (A, p, a, tgt) => { if (!tgt || tgt.kind !== 'avatar') return; const d = A.avatars(A.opp(p)).find(x => x.uid === tgt.uid); if (d && A.isSym(d, 'ต่างชาติ')) await A.destroy(d, 'จ่ายุทธ ทหารรักชาติ', p); } }; // จ่ายุทธ ทหารรักชาติ
  E['BT09-041'] = { // ท้าวเวสสุวรรณ
    onAllyDestroyed: async (A, p, h, a) => {
      if (a.card.symbol !== 'ยักษ์' || a.destroyedBy == null || a.destroyedBy === p || !A.roomFor(p, h.card) || !await askYes(A, p, 'อัญเชิญ ท้าวเวสสุวรรณ จากมือ?', 3)) return;
      if (!await A.summonFrom(p, A.hand(p), h, { jutti: false }) || !A.onField(h)) return;
      const v = await A.choose(p, 'ทำลาย Avatar อีกฝ่าย 1 ใบ', bestOppAvatar(A, p), true); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) await A.destroy(d, 'ท้าวเวสสุวรรณ', p);
    },
    continuousSelf: (A, p) => (A.state.phase === 'battle' ? 2 : 0),
    aura: (A, p, src, a) => (a.owner === p && A.state.phase === 'battle' && A.isSym(a, 'ยักษ์') ? 2 : 0),
  };
  E['BT09-042'] = { // นักท่องเรื่องราว ขวัญตา
    activateLabel: 'แสดง "เรื่องราว" Cost 6 จากมือ: เนรเทศใบนี้แล้วอัญเชิญใบที่แสดง',
    canActivate: (A, p) => A.hand(p).some(h => isAvatar(h.card) && A_named(h.card, STORY) && h.card.cost === 6),
    activate: async (A, p, self) => {
      const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && A_named(x, STORY) && x.cost === 6, 'แสดง "เรื่องราว" Cost 6'); if (!c) return;
      A.banishAvatar(self); A.draw(p, 1); await A.summonFrom(p, A.hand(p), c, { jutti: false, by: self.card.id });
    },
  };
  const isSkill = c => c.type === 'magic' && A_named(c, 'Skill');
  E['BT09-043'] = { // ขวัญตา เรื่องราว ราชาแห่งนาค
    continuousSelf: (A, p, a) => (byCard(A, a, STORYTELLER) ? Math.floor(hellMagic(A, p) / 2) : 0),
    activateLabel: 'ทิ้ง 1 ใบ: นำ Magic "Skill" จากนรกขึ้นมือ',
    canActivate: (A, p, a) => byCard(A, a, STORYTELLER) && A.hand(p).length > 0 && A.hell(p).some(c => isSkill(c.card)),
    activate: async (A, p) => { await A.discard(p, 1); const c = await A.pickFrom(p, A.hell(p), isSkill, 'นำ "Skill" ขึ้นมือ'); if (c) A.toHand(p, A.takeFrom(A.hell(p), c)); },
  };
  E['BT09-044'] = { // ขวัญตา เรื่องราว ครุฑเจ้าเวหา
    extraSkillReact: (A, a) => byCard(A, a, STORYTELLER),
    onAttack: async (A, p, a) => { if (!byCard(A, a, STORYTELLER)) return; const c = await A.pickFrom(p, A.deck(p), isSkill, 'นำ "Skill" จาก Deck ลงนรก', true); if (c) { A.hell(p).push(A.takeFrom(A.deck(p), c)); A.shuffleDeck(p); A.log(`"${c.card.name}" ลงนรก`); } },
  };
  E['BT09-049'] = { payOnlyFor: c => c.name === 'DJ ปีโป้', magic: async (A, p) => { A.state.players[p].forgiveTurn = A.state.turn; A.log('เทิร์นนี้การขอโทษของ DJ ปีโป้ จะได้รับการยกโทษเสมอ'); } }; // ขอโทษสังคม
  E['BT09-050'] = { // บลัดดี้แมรี่
    magic: async (A, p, inst) => { A.park(inst, p); inst.grantFx = 'BT09-050'; inst.maryWin = 0; return { stay: true }; },
    activateLabel: 'ทอยเต๋า 2 ครั้ง: ถ้าคู่ทั้งสองครั้ง เนรเทศ วิญญาณร้าย จากนรก',
    canActivate: (A, p) => A.hell(p).some(c => c.card.name === 'วิญญาณร้าย'),
    activate: async (A, p, m) => {
      const d = [A.dice(), A.dice()]; A.log(`🎲 ${d[0]} / ${d[1]}`); if (d[0] % 2 || d[1] % 2) return;
      const c = A.hell(p).find(x => x.card.name === 'วิญญาณร้าย'); if (!c) return; A.exile(p, A.hell(p), c); m.maryWin = (m.maryWin || 0) + 1;
      if (m.maryWin >= 3) A.win(p, 'บลัดดี้แมรี่: วิญญาณร้ายครบ 3 ใบในมิติมืด');
    },
  };
  E['BT09-051'] = { // ไม้กวาดปีกปักษา
    canUse: (A, p) => A.state.players[A.opp(p)].magicZone.length > 0,
    magic: async (A, p) => {
      const ms = A.state.players[A.opp(p)].magicZone.slice(); let n = 0;
      for (const m of ms) { if (!A.state.players[A.opp(p)].magicZone.includes(m)) continue; if (m.parked) A.unparkToHell(m); else A.destroyMagic(m); n++; }
      if (n >= 2) A.draw(p, Math.floor(n / 2));
    },
  };
  E['BT09-052'] = { // ผจญภัยด้วยกัน
    canUse: (A, p) => A.roomFor(p) && ((A.avatars(p).some(x => A.named(x.card, PEMMU)) && A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, SPRITE))) || (A.avatars(p).some(x => A.named(x.card, SPRITE)) && A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, PEMMU)))),
    magic: async (A, p) => {
      const opts = [];
      if (A.avatars(p).some(x => A.named(x.card, PEMMU)) && A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, SPRITE))) opts.push({ label: 'อัญเชิญ "สไปรท์" จาก Deck', value: SPRITE, score: 1 });
      if (A.avatars(p).some(x => A.named(x.card, SPRITE)) && A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, PEMMU))) opts.push({ label: 'อัญเชิญ "เพมมุ" จาก Deck', value: PEMMU, score: 1 });
      const w = await A.choose(p, 'ผจญภัยด้วยกัน: เลือกปฏิบัติ', opts); const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, w), `อัญเชิญ "${w}"`);
      if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p);
    },
  };
  E['BT09-053'] = { canUse: (A, p) => A.avatars(p).some(x => A.isSym(x, 'ฤษี')) && A.avatars(A.opp(p)).length > 0, magic: async (A, p) => { const v = await A.choose(p, 'นำ Avatar อีกฝ่ายกลับขึ้นมือ', bestOppAvatar(A, p)); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) A.bounce(d); } }; // ขอให้ตีนไม่ติดพื้น
  E['BT09-054'] = { // แผนการตู้เย็นทับ
    canUse: (A, p) => A.constructs(p).some(c => A.avatars(A.opp(p)).some(x => A.power(x) <= A.constructPower(c))),
    magic: async (A, p) => {
      const top = Math.max(...A.constructs(p).map(c => A.constructPower(c)));
      const v = await A.choose(p, `ทำลาย Avatar อีกฝ่าย POWER ≤${top}`, bestOppAvatar(A, p, x => A.power(x) <= top)); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) await A.destroy(d, 'แผนการตู้เย็นทับ', p);
    },
  };
  E['BT09-055'] = { // คาถา เสกควายเข้าท้อง
    canUse: (A, p) => A.avatars(p).some(x => A.named(x.card, 'จอมเวท')),
    magic: async (A, p) => {
      const pl = A.state.players[p], o = A.opp(p);
      if ((pl.kwaiKills || 0) >= 3) {
        const fs = A.avatars(o).map(a => A.avOpt(a, A.power(a) + 2)).concat(A.state.players[o].magicZone.map(m => A.cardOpt(m, 1)), A.constructs(o).map(c => A.cardOpt(c, 1)));
        const v = await A.choose(p, 'เนรเทศการ์ดบนสนามอีกฝ่าย', fs, true);
        const av = A.avatars(o).find(x => x.uid === v); if (av) A.banishAvatar(av);
        const m = A.state.players[o].magicZone.find(x => x.uid === v); if (m) { A.state.players[o].magicZone.splice(A.state.players[o].magicZone.indexOf(m), 1); m.attachedTo = null; A.dark(o).push(m); A.log(`"${m.card.name}" ถูกเนรเทศ`); }
        const cs = A.constructs(o).find(x => x.uid === v); if (cs) A.exile(o, A.constructs(o), cs);
        const h = await A.pickFrom(p, A.hell(o), () => true, 'เนรเทศการ์ดในนรกอีกฝ่าย', true); if (h) A.exile(o, A.hell(o), h);
        if (A.hand(o).length) A.exile(o, A.hand(o), A.hand(o)[A.rand(A.hand(o).length)]);
        return;
      }
      let left = 4;
      while (true) { const v = await A.choose(p, `ทำลาย Avatar อีกฝ่าย (POWER รวมเหลือ ${left})`, bestOppAvatar(A, p, x => A.power(x) <= left), true); const d = A.avatars(o).find(x => x.uid === v); if (!d) break; left -= A.power(d); await A.destroy(d, 'คาถา เสกควายเข้าท้อง', p); if (!A.onField(d)) pl.kwaiKills = (pl.kwaiKills || 0) + 1; }
    },
  };
  const storyFetch = (A, p) => A.deck(p).concat(A.hell(p)).some(c => isAvatar(c.card) && A_named(c.card, STORY));
  E['BT09-056'] = { // Skill : Full Drive
    canUse: storyFetch,
    magic: async (A, p) => {
      const c = await A.pickFrom(p, A.deck(p).concat(A.hell(p)), x => isAvatar(x) && A_named(x, STORY), 'นำ "เรื่องราว" ขึ้นมือ (จาก Deck หรือนรก)'); if (!c) return;
      const fromDeck = A.deck(p).includes(c); A.toHand(p, A.takeFrom(fromDeck ? A.deck(p) : A.hell(p), c)); if (fromDeck) A.shuffleDeck(p);
      if (hellMagic(A, p) >= 8) A.draw(p, 1);
    },
  };
  const typhoon = async (A, p) => {
    const ms = A.state.players[A.opp(p)].magicZone.map(m => A.cardOpt(m, 2)).concat(A.state.land ? [A.cardOpt(A.state.land, A.state.land.owner === p ? -2 : 1.5)] : []);
    const v = await A.choose(p, 'ไต้ฝุ่น: ทำลาย Magic Zone อีกฝ่าย หรือ Land', ms); const m = A.state.players[A.opp(p)].magicZone.find(x => x.uid === v);
    if (m) { if (m.parked) A.unparkToHell(m); else A.destroyMagic(m); } else if (A.state.land && A.state.land.uid === v) A.destroyMagic(A.state.land);
  };
  E['BT09-057'] = { // ไต้ฝุ่น
    canUse: (A, p) => A.state.players[A.opp(p)].magicZone.length > 0 || !!A.state.land,
    magic: async (A, p) => typhoon(A, p),
    react: { anyType: true, on: 'attack', when: (A, p) => A.state.players[A.opp(p)].magicZone.length > 0, botScore: () => 0.8, run: async (A, p) => typhoon(A, p) },
  };
  E['BT09-058'] = { // Ah-ah, ah!
    canUse: (A, p) => A.deck(p).length > 6 && A.roomFor(p) && ((A.avatars(p).some(x => A.named(x.card, 'ธอร์')) && A.hell(p).some(c => isAvatar(c.card) && A_named(c.card, 'โลกิ'))) || (A.avatars(p).some(x => A.named(x.card, 'โลกิ')) && A.hell(p).some(c => isAvatar(c.card) && A_named(c.card, 'ธอร์')))),
    magic: async (A, p) => {
      await A.mill(p, 5);
      const opts = [];
      if (A.avatars(p).some(x => A.named(x.card, 'ธอร์')) && A.hell(p).some(c => isAvatar(c.card) && A_named(c.card, 'โลกิ'))) opts.push({ label: 'อัญเชิญ "โลกิ" จากนรก', value: 'โลกิ', score: 1 });
      if (A.avatars(p).some(x => A.named(x.card, 'โลกิ')) && A.hell(p).some(c => isAvatar(c.card) && A_named(c.card, 'ธอร์'))) opts.push({ label: 'อัญเชิญ "ธอร์" จากนรก', value: 'ธอร์', score: 1 });
      const w = await A.choose(p, 'Ah-ah, ah!: เลือกปฏิบัติ', opts); if (!w) return;
      const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, w), `อัญเชิญ "${w}" จากนรก`); if (c && A.roomFor(p, c.card)) await A.summonFrom(p, A.hell(p), c, { jutti: false });
    },
  };
  const allStory = (A, p) => A.avatars(p).length > 0 && A.avatars(p).every(x => A.named(x.card, STORY));
  E['BT09-059'] = { // Skill : Hypersense
    react: {
      on: 'activate', when: (A, p) => allStory(A, p), botScore: () => 2,
      run: async (A, p, ctx) => { if (hellMagic(A, p) >= 8 && A.onField(ctx.avatar)) { await A.destroy(ctx.avatar, 'Skill : Hypersense', p); return {}; } return { negate: true }; },
    },
  };
  E['BT09-060'] = { // Skill : Second Energy
    react: {
      on: 'destroy', when: (A, p, ctx) => ctx.avatar.owner === p && A.named(ctx.avatar.card, STORY) && ctx.byP != null && ctx.byP !== p, botScore: () => 3,
      run: async (A, p) => { if (hellMagic(A, p) >= 8) { const o = A.opp(p); const c = await A.pickFrom(o, A.hell(o), () => true, 'เลือกการ์ดในนรกของคุณ 1 ใบเพื่อเนรเทศ'); if (c) A.exile(o, A.hell(o), c); } return { prevent: true }; },
    },
  };
  E['BT09-061'] = { // ทะลุบ้านทะลุโกศ
    react: {
      on: 'attack', when: (A, p, ctx) => { const d = ctx.target.kind === 'avatar' && A.avatars(p).find(x => x.uid === ctx.target.uid); return !!d && A.power(d) >= 8; },
      botScore: (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); return d && A.power(d) > A.power(ctx.attacker) ? 2 : -1; },
      run: async (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); if (d) { d.flipOnWin = A.state.turn; A.log(`ถ้า ${d.card.name} ชนะการต่อสู้ จะหงาย LIFE ของอีกฝ่าย`); } },
    },
  };
  E['BT09-062'] = { // ตัดเน็ต
    react: {
      on: 'battleStart', botScore: (A, p) => A.avatars(A.opp(p)).filter(x => E[x.card.id]).length - A.avatars(p).filter(x => E[x.card.id]).length - 0.5,
      run: async (A) => { A.avatars(0).concat(A.avatars(1)).forEach(a => { a.lostAbilities = true; a.extraKw = null; a.kwUntil = []; }); A.log('Avatar ทุกใบสูญเสียความสามารถทั้งหมดจนจบเทิร์น'); },
    },
  };
  E['BT09-063'] = { // ลงกาโพรเทคชั่น
    react: {
      on: 'attack', when: (A, p, ctx) => { const d = ctx.target.kind === 'avatar' && A.avatars(p).find(x => x.uid === ctx.target.uid); return !!d && A.isSym(d, 'ยักษ์') && A.avatars(p).some(x => x !== d && !x.rested && A.isSym(x, 'ยักษ์')); },
      botScore: () => 2,
      run: async (A, p, ctx) => {
        const d = A.avatars(p).find(x => x.uid === ctx.target.uid); if (!d) return; const xs = A.avatars(p).filter(x => x !== d && !x.rested && A.isSym(x, 'ยักษ์'));
        const v = await A.choose(p, 'เลือก {ยักษ์} ที่จะเปลี่ยนเป็นสภาพนอน', xs.map(x => A.avOpt(x, A.power(x)))); const x = xs.find(y => y.uid === v); if (!x) return;
        A.rest(x); A.addPower(d, A.power(x), 'endTurn');
      },
    },
  };
  E['BT09-064'] = { // ค้อนโยเนียร์
    magic: true, equipOk: (A, a) => A.named(a.card, 'ธอร์'), equipPower: 1,
    onLinkFromHell: async (A, p, h, x, y) => {
      if (![x, y].some(a => A.named(a.card, 'ธอร์') || A.named(a.card, 'โลกิ')) || A.state.players[p].mjolnirTurn === A.state.turn) return;
      const max = thorMax(A, p); if (!A.avatars(A.opp(p)).some(d => A.cost(d) <= max) || !await askYes(A, p, `นำ ค้อนโยเนียร์ จากนรกไว้ใต้ Deck: ทำลาย Avatar อีกฝ่าย Cost ≤${max}?`, 2)) return;
      A.state.players[p].mjolnirTurn = A.state.turn; A.deck(p).push(A.takeFrom(A.hell(p), h)); await destroyOppByCost(A, p, max);
    },
  };
  E['BT09-065'] = { // กระสอบ
    magic: true, equipAny: true, hostCannotAttack: true,
    equipScore: (A, p, a) => (a.owner === p ? -5 : A.power(a)),
    onEquip: async (A, p, m) => {
      m.sackEnds = 0;
      const tick = async A2 => { const holder = A2.state.players.find(x => x.magicZone.includes(m)); if (!holder) return; m.sackEnds++; if (m.sackEnds >= 4) { A2.log('กระสอบ ครบ 4 End Phase'); A2.destroyMagic(m); } else A2.atEndOfTurn(tick); };
      A.atEndOfTurn(tick);
    },
  };
  E['BT09-066'] = { // หอกศักดิ์สิทธิ์ เอ็ดดา
    magic: true, equipOk: (A, a) => A.named(a.card, VALK9), equipPower: 1,
    onMilled: async (A, p, c) => { const xs = A.avatars(p).filter(a => A.named(a.card, VALK9)); if (!xs.length || !await askYes(A, p, 'สวมใส่ หอกศักดิ์สิทธิ์ เอ็ดดา ที่ถูกธรณีสูบให้ "เทพธิดาแห่งวัลฮัลลา"?', 2)) return; const v = await A.choose(p, 'สวมใส่ให้ใบไหน', xs.map(x => A.avOpt(x, A.power(x)))); await A.attach(p, A.takeFrom(A.hell(p), c), xs.find(x => x.uid === v) || xs[0]); },
  };
  E['BT09-067'] = { // อาวุธของเพมมุ ปืนพกรุ่น 19
    magic: true, equipOk: (A, a) => A.named(a.card, PEMMU),
    onEquippedBattleWin: async (A, p, m, a, r) => { if (r && A.state.active === p && A.power(a) - r.loserPower >= 2) A.flipLife(A.opp(p), 1); },
  };
  E['BT09-068'] = { // กระบองตำรวจ
    magic: true, equipOk: (A, a) => A.named(a.card, COP),
    onEquippedBattleWin: async (A, p) => { const o = A.opp(p); const c = await A.pickFrom(p, A.hell(o), () => true, 'นำการ์ดในนรกอีกฝ่ายไว้บนสุดของ Deck อีกฝ่าย'); if (c) { A.deck(o).unshift(A.takeFrom(A.hell(o), c)); A.log(`"${c.card.name}" ไปอยู่บนสุดของ Deck อีกฝ่าย`); } },
  };
  E['BT09-069'] = { magic: true, summonCap: 2 }; // ด่านตรวจเข้าเมือง
  E['BT09-070'] = { magic: true, noLand: true, lifetime: 4 }; // สวนกล้วยหนีภาษี
  E['BT09-071'] = { // ป่าพงไพร เผ่าพงศ์พันธุ์
    magic: true,
    aura: (A, p, src, a) => (A.named(a.card, FRUIT) ? 2 : 0),
    grantKw: (A, a) => (A.named(a.card, FRUIT) ? ['สามัคคี'] : []),
    activateLabel: 'เนรเทศการ์ดบนสุดของ Deck: อัญเชิญ "ภูติผลไม้" จากนรก',
    canActivate: (A, p) => A.deck(p).length > 1 && A.roomFor(p) && A.hell(p).some(c => isAvatar(c.card) && A_named(c.card, FRUIT)),
    activate: async (A, p) => {
      A.exile(p, A.deck(p), A.deck(p)[0]);
      const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, FRUIT), 'อัญเชิญ "ภูติผลไม้" จากนรก'); if (c && await A.summonFrom(p, A.hell(p), c, { jutti: false }) && A.onField(c)) c.exileOnDeath = true;
    },
  };
  E['BT09-072'] = { // โพเดียมสมาคมผู้รู้ความจริง
    activateLabel: 'สลับการ์ดบนมือกับการ์ดบนสุดของ Deck',
    canActivate: (A, p) => A.avatars(p).some(x => A.named(x.card, TRUTH)) && A.hand(p).length > 0 && A.deck(p).length > 0,
    activate: async (A, p) => { const c = await A.pickFrom(p, A.hand(p), () => true, 'เลือกการ์ดบนมือที่จะสลับกับการ์ดบนสุดของ Deck'); if (!c) return; const top = A.deck(p).shift(); A.deck(p).unshift(A.takeFrom(A.hand(p), c)); A.hand(p).push(top); A.log('สลับการ์ดบนมือกับการ์ดบนสุดของ Deck'); },
  };
  E['BT09-073'] = { onAnyMagic: async (A, q, src, inst, caster) => { if (caster === q && inst.card.symbol === 'ฤษี') A.draw(q, 1); } }; // สำนักภฤคุ
  E['BT09-074'] = { // ตู้เสื้อผ้าของริกกี้
    onAllyBattleWin: async (A, p, c, a) => {
      if (!A.named(a.card, RICKY) || c.usedWin === A.state.turn) return; const h = A.hell(p).find(x => x.card.name === 'หนังมนุษย์ ชุดแก้แค้น'); if (!h) return;
      c.usedWin = A.state.turn; A.deck(p).push(A.takeFrom(A.hell(p), h)); A.shuffleDeck(p); A.log('นำ "หนังมนุษย์ ชุดแก้แค้น" กลับเข้า Deck');
    },
  };
  E['BT09-075'] = { costAura: (A, q, src, a) => (a.owner !== q ? -1 : 0) }; // ห้างโรงเกลือ


  // ================= BT10 =================
  const GANG = 'แก๊งขยะ', SEED = 'พี่ซี๊ด แก๊งขยะ', NINJA = 'นินจา', SEWAGE = 'สิ่งปฏิกูล', MANGO = 'มะม่วง', TREE = 'ต้นมะม่วง', WIZ = 'จอมเวท';
  (root.TC_CARDS || []).forEach(c => { if (c.id === 'BT10-068' && !(c.alsoNamed || []).includes('ตั๊กแตน')) c.alsoNamed = (c.alsoNamed || []).concat('ตั๊กแตน'); });
  const byNamed = (A, a, word) => { const c = a.summonedBy && A.cardById(a.summonedBy); return !!(c && A.named(c, word)); };
  const supportedBySeed = s => s.card.name === SEED;
  const isMango = c => isAvatar(c) && A_named(c, MANGO) && c.symbol === 'ต้นไม้';
  const parkMango = (A, p, inst) => { A.park(inst, p); if (inst.card.id === 'BT10-039') inst.grantFx = 'BT10-039p'; };
  const mangoInMZ = (A, p) => A.parked(p).filter(m => isMango(m.card));
  const mangoLastWill = async (A, p, self) => { if (self.destroyedBy != null && self.destroyedBy !== p && A.hell(p).includes(self)) parkMango(A, p, self); };
  // declare the type of the opponent's top card, then look at it
  const declareTopCard = async (A, p) => {
    const o = A.opp(p), top = A.deck(o)[0]; if (!top) return null;
    const t = await A.choose(p, 'ประกาศประเภทของการ์ดใบบนสุดของ Deck อีกฝ่าย', [{ label: 'Avatar', value: 'avatar', score: 3 }, { label: 'Magic', value: 'magic', score: 2 }, { label: 'Construct', value: 'construct', score: 0 }]);
    const hit = top.card.type === t; A.log(`ประกาศ ${t} — การ์ดคือ "${top.card.name}" (${hit ? 'ถูก' : 'ไม่ถูก'})`);
    if (hit) A.hell(o).push(A.deck(o).shift());
    return hit;
  };
  // "return a ninja to hand and summon this card" from hand, once per turn per name
  const ninjaSwap = (n, label, after) => ({
    handActivateLabel: label,
    canHandActivate: (A, p, h) => !A.state.magicUsed[p]['ninja:' + h.card.name] && A.avatars(p).filter(a => A.named(a.card, NINJA) && a.card.name !== h.card.name).length >= n,
    handActivate: async (A, p, h) => {
      A.state.magicUsed[p]['ninja:' + h.card.name] = true;
      for (let k = 0; k < n; k++) { const xs = A.avatars(p).filter(a => A.named(a.card, NINJA) && a.card.name !== h.card.name); const v = await A.choose(p, `นำ "นินจา" กลับขึ้นมือ (${k + 1}/${n})`, xs.map(x => A.avOpt(x, -A.power(x)))); const x = xs.find(y => y.uid === v) || xs[0]; if (x) A.bounce(x); }
      if (await A.summonFrom(p, A.hand(p), h, { jutti: false, by: h.card.id }) && A.onField(h) && after) await after(A, p, h);
    },
  });
  E['BT10-001'] = { // พระพิฆเนศ
    fieldCounter: {
      on: ['magic', 'activate'], label: 'พระพิฆเนศ: เซ่นไหว้ {เทพ} เพื่อยกเลิก',
      when: (A, p, a) => A.avatars(p).some(x => x !== a && A.isSym(x, 'เทพ')),
      botScore: (A, p, a, ctx) => (ctx.avatar || (ctx.card && ctx.card.card.type === 'magic') ? 1.5 : 0),
      run: async (A, p, a) => { const xs = A.avatars(p).filter(x => x !== a && A.isSym(x, 'เทพ')); const v = await A.choose(p, 'เซ่นไหว้ {เทพ}', xs.map(x => A.avOpt(x, -A.power(x)))); const x = xs.find(y => y.uid === v) || xs[0]; await A.sacrifice(p, x); return { cancel: true, negate: true }; },
    },
  };
  E['BT10-002'] = { // พระอิศวร นักเต้น
    onSummon: async (A, p) => { await lookTopBottom(A, p, 3, [{ pred: c => (A_named(c, 'พระแม่อุมาเทวี') || A_named(c, 'พระอิศวร')) && !c.onlyOne, title: 'นำ "พระแม่อุมาเทวี"/"พระอิศวร" ขึ้นมือ' }], async c => A.toHand(p, c)); },
    activateLabel: 'จั่ว 1 ใบ แล้วให้อีกฝ่ายควบคุมใบนี้', canActivate: (A, p) => A.roomFor(A.opp(p)),
    activate: async (A, p, a) => { A.draw(p, 1); A.takeControl(a, A.opp(p), false, true); },
  };
  E['BT10-003'] = { // พี่บูม แก๊งขยะ
    handCost: (A, p, c) => (c.cost || 0) - (A.state.players[p].boomTurn === A.state.turn ? 1 : 0),
    activateLabel: 'ทิ้ง 1 ใบ: นำ พี่ซี๊ด / เบรกเกต จาก Deck ขึ้นมือ',
    canActivate: (A, p) => A.hand(p).length > 0 && A.deck(p).some(c => ['พี่ซี๊ด แก๊งขยะ', 'เบรกเกต แก๊งขยะ'].includes(c.card.name)),
    activate: async (A, p) => { await A.discard(p, 1); await tutor(c => ['พี่ซี๊ด แก๊งขยะ', 'เบรกเกต แก๊งขยะ'].includes(c.name), 'นำ พี่ซี๊ด / เบรกเกต ขึ้นมือ')(A, p); },
    onSupported: async (A, p, a, s) => { if (supportedBySeed(s)) A.avatars(p).filter(x => A.named(x.card, GANG)).forEach(x => A.addPower(x, 1, 'endTurn')); },
  };
  E['BT10-004'] = Object.assign(ninjaSwap(2, 'นำ "นินจา" 2 ใบกลับขึ้นมือ: อัญเชิญใบนี้'), { // โกเอมอน
    onAllyLifeHit: async (A, p, src, a) => {
      if (src !== a || src.summonedBy !== src.card.id) return false;
      const c = await A.pickFrom(p, A.hell(A.opp(p)), x => x.type === 'magic', 'นำ Magic จากนรกอีกฝ่ายขึ้นมือเรา', true);
      if (c) { A.toHand(p, A.takeFrom(A.hell(A.opp(p)), c)); c.owner = p; await A.discard(p, 1); }
      return false;
    },
  });
  E['BT10-005'] = Object.assign(ninjaSwap(1, 'นำ "นินจา" กลับขึ้นมือ: อัญเชิญใบนี้', async (A, p) => { const xs = A.avatars(p).filter(a => A.named(a.card, NINJA)); const v = await A.choose(p, '"นินจา" ได้รับ เตะไข่ จนจบเทิร์น', xs.map(x => A.avOpt(x, A.power(x)))); const x = xs.find(y => y.uid === v); if (x) A.grantKw(x, ['เตะไข่']); }), { // ฮันโซ
    onSummon: tutor(c => A_named(c, 'วิชานินจา'), 'นำ "วิชานินจา" ขึ้นมือ'),
  });
  E['BT10-006'] = ninjaSwap(1, 'นำ "นินจา" กลับขึ้นมือ: อัญเชิญใบนี้', async (A, p) => { const v = await A.choose(p, 'Avatar อีกฝ่าย POWER -3 จนจบเทิร์น', bestOppAvatar(A, p)); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) A.addPower(d, -3, 'endTurn'); }); // ชิโยเมะ
  E['BT10-007'] = { // ตำรวจเอไอ มุเค
    activateLabel: 'ประกาศประเภทการ์ดบนสุดของ Deck อีกฝ่าย', canActivate: (A, p) => A.deck(A.opp(p)).length > 1,
    activate: async (A, p, a) => {
      const hit = await declareTopCard(A, p); if (hit == null) return;
      if (hit) { const v = await A.choose(p, 'Avatar อีกฝ่าย POWER -2', bestOppAvatar(A, p)); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) A.addPower(d, -2, 'endTurn'); } else A.addPower(a, -2, 'endTurn');
    },
  };
  E['BT10-008'] = { onAttack: async (A, p, a) => { if (a.onceTurn === A.state.turn) return; a.onceTurn = A.state.turn; A.draw(p, 1); } }; // ไอ้นัท - คนบ้าจั่ว
  const pemmuWeapons = (A, p) => A.state.players[p].magicZone.filter(m => !m.parked && /อาวุ[ธร]ของเพมมุ/.test(m.card.name));
  E['BT10-009'] = { // K-BO ยอดหุ่นยนต์
    handActivateLabel: 'ส่ง "อาวุธของเพมมุ" ลงนรก: อัญเชิญใบนี้',
    canHandActivate: (A, p, h) => A.roomFor(p, h.card) && pemmuWeapons(A, p).length > 0,
    handActivate: async (A, p, h) => { const ms = pemmuWeapons(A, p); const v = await A.choose(p, 'ส่ง "อาวุธของเพมมุ" ลงนรก', ms.map(m => A.cardOpt(m, 1))); A.destroyMagic(ms.find(m => m.uid === v) || ms[0]); await A.summonFrom(p, A.hand(p), h, { jutti: false, by: h.card.id }); },
    activateLabel: 'เนรเทศใบนี้: เพมมุ/สไปรท์ โจมตีแล้วอีกฝ่ายใช้ React ไม่ได้',
    canActivate: (A, p, a) => a.summonedBy === a.card.id,
    activate: async (A, p, a) => { A.state.players[p].kboTurn = A.state.turn; A.banishAvatar(a); },
  };
  E['BT10-010'] = { onAllyKw: async (A, p, src, user) => { if (!A.linked(user) || src.kwTurn === A.state.turn || !user.rested || !A.onField(user)) return; src.kwTurn = A.state.turn; A.wake(user); A.log(`ซัลลี่วอดก้า: ${user.card.name} กลับมาสภาพตื่น`); } }; // ซัลลี่วอดก้า
  E['BT10-011'] = { alsoColor: 'green', onSummon: async (A, p) => { await lookTop(A, p, 5, c => isAvatar(c) && A_named(c, GENERAL3) && c.symbol === FOREIGN && ['red', 'green'].includes(c.color), 'นำ "ขุนพล" {ต่างชาติ} สีแดง/เขียว ขึ้นมือ', async c => A.toHand(p, c)); } }; // ซุนฮูหยิน
  E['BT10-012'] = { // บ่าวแสม ซามูไรปักษ์ใต้
    extraSymbol: 'หุ่นยนต์',
    onAttack: async (A, p, a) => {
      if (a.onceTurn === A.state.turn || !A.deck(p).length) return; a.onceTurn = A.state.turn;
      A.exile(p, A.deck(p), A.deck(p)[0]); const n = A.dark(p).length, o = A.opp(p);
      const opts = [{ label: 'POWER +1', value: 1, score: 1 }];
      if (n >= 2) opts.push({ label: 'เปลี่ยนเป็นสภาพตื่น', value: 2, score: 2 });
      if (n >= 3 && A.hand(o).length) opts.push({ label: 'สุ่มทิ้งการ์ดบนมืออีกฝ่าย 1 ใบ', value: 3, score: 2.5 });
      const v = await A.choose(p, 'บ่าวแสม: เลือกทำผล 1 อย่าง', opts);
      if (v === 1) A.addPower(a, 1, 'endTurn'); if (v === 2) { A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`); }
      if (v === 3) { const h = A.hand(o)[A.rand(A.hand(o).length)]; A.hell(o).push(A.takeFrom(A.hand(o), h)); A.log(`สุ่มทิ้ง "${h.card.name}" จากมืออีกฝ่าย`); }
    },
  };
  E['BT10-013'] = { // พี่เจมส์ แก๊งขยะ
    onSummon: async (A, p) => { await tutor(c => c.name === 'พี่บูม แก๊งขยะ', 'นำ พี่บูม แก๊งขยะ ขึ้นมือ')(A, p); A.state.players[p].boomTurn = A.state.turn; },
    onSupported: async (A, p, a, s) => {
      if (!supportedBySeed(s)) return; const used = [a.card.name];
      for (let k = 0; k < 2 && A.roomFor(p); k++) { const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, GANG) && !used.includes(x.name), `อัญเชิญ "แก๊งขยะ" จากนรก (${k + 1}/2)`, k > 0); if (!c) break; used.push(c.card.name); await A.summonFrom(p, A.hell(p), c, { jutti: false }); }
    },
  };
  E['BT10-014'] = { onLink: async (A, p, self, partner) => { const f = E[partner.card.id]; if (A.named(partner.card, 'วอเตอร์แมน') && f && f.onSummon) { A.log(`ลิขวิดบอย: ${partner.card.name} ทำงาน จุติ อีกครั้ง`); await f.onSummon(A, p, partner); } } }; // ลิขวิดบอย
  E['BT10-015'] = { // ริกกี้ แท็กซี่ตีนแมลงสาบ
    setPower: (A, p, a) => (byNamed(A, a, 'หนังมนุษย์ ชุดแก้แค้น') || byNamed(A, a, RICKY) ? 5 : (a.card.power || 0)),
    onBattleWin: async (A, p, a, r) => { const o = A.opp(p); if (r.loser && A.hell(o).includes(r.loser)) { A.dark(o).push(A.takeFrom(A.hell(o), r.loser)); A.log(`${r.loser.card.name} ถูกเนรเทศแทนการลงนรก`); } },
  };
  E['BT10-016'] = { // ตัวอะไรสักอย่างที่คล้ายกระรอกและนิสัยไม่ดี
    handActivateLabel: 'อัญเชิญใบนี้ (อัญเชิญ {เอเลี่ยน} สีฟ้า Cost 5+ แล้วในเทิร์นนี้)',
    canHandActivate: (A, p, h) => { const lg = A.state.players[p].summonLog; return A.roomFor(p, h.card) && !A.state.magicUsed[p]['squirrel'] && !!lg && lg.turn === A.state.turn && (lg.cards || []).some(c => c.color === 'blue' && c.symbol === 'เอเลี่ยน' && (c.cost || 0) >= 5); },
    handActivate: async (A, p, h) => { A.state.magicUsed[p]['squirrel'] = true; await A.summonFrom(p, A.hand(p), h, { jutti: false }); },
  };
  const sewage = c => isAvatar(c) && A_named(c, SEWAGE);
  E['BT10-017'] = { // สิ่งปฏิกูลมีชีวิต
    lastWill: async (A, p) => {
      const d = A.deck(p); const seen = d.splice(0, Math.min(3, d.length)); A.log(`สอดแนม ${seen.length} ใบ`);
      const v = await A.choose(p, 'เลือก "สิ่งปฏิกูล"', seen.filter(c => sewage(c.card)).map(c => A.cardOpt(c)), true); const c = seen.find(x => x.uid === v);
      seen.filter(x => x !== c).forEach(x => A.hell(p).push(x));
      if (!c) return; if (A.state.active === p && A.roomFor(p, c.card)) await A.summonFrom(p, [], c, { jutti: false, by: 'BT10-017' }); else A.toHand(p, c);
    },
  };
  E['BT10-018'] = { lastWill: async (A, p) => { const n = A.state.active === p ? 3 : 1; const v = await A.choose(p, `Avatar อีกฝ่าย POWER -${n}`, bestOppAvatar(A, p)); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) A.addPower(d, -n, 'forever'); } }; // สิ่งปฏิกูลสีเงิน
  const sewageKing = async (A, p) => {
    if (A.hell(p).filter(c => A_named(c.card, SEWAGE)).length < 5) return;
    const v = await A.choose(p, 'เปลี่ยน Avatar อีกฝ่ายเป็น "สิ่งปฏิกูล" POWER 1', bestOppAvatar(A, p)); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (!d) return;
    d.origCard = d.origCard || d.card; d.card = Object.assign({}, d.card, { name: SEWAGE, symbol: 'สัตว์วิเศษ', power: 1 }); A.clearMods(d); A.log(`${d.origCard.name} กลายเป็น "สิ่งปฏิกูล" POWER 1`);
  };
  E['BT10-019'] = { // ราชาสิ่งปฏิกูล
    onSummon: async (A, p, self) => { if (self.exact && !byNamed(A, self, SEWAGE)) await sewageKing(A, p); },
    onEnter: async (A, p, self) => { if (byNamed(A, self, SEWAGE)) await sewageKing(A, p); },
    activateLabel: 'ทำลาย "สิ่งปฏิกูล": สุ่มทิ้งการ์ดบนมืออีกฝ่าย',
    canActivate: (A, p) => A.avatars(0).concat(A.avatars(1)).some(x => A.named(x.card, SEWAGE)),
    activate: async (A, p) => {
      const xs = A.avatars(0).concat(A.avatars(1)).filter(x => A.named(x.card, SEWAGE)); const v = await A.choose(p, 'ทำลาย "สิ่งปฏิกูล"', xs.map(x => A.avOpt(x, x.owner === p ? -1 : 2))); const x = xs.find(y => y.uid === v) || xs[0];
      await A.destroy(x, 'ราชาสิ่งปฏิกูล', p); const o = A.opp(p); if (!A.onField(x) && A.hand(o).length) { const h = A.hand(o)[A.rand(A.hand(o).length)]; A.hell(o).push(A.takeFrom(A.hand(o), h)); A.log(`สุ่มทิ้ง "${h.card.name}" จากมืออีกฝ่าย`); }
    },
  };
  E['BT10-020'] = { // เตียวคับ
    shieldAllies: (A, src, x) => x !== src && A.named(x.card, 'วุยก๊ก'),
    onEnter: async (A, p, self) => { if (byNamed(A, self, GENERAL3)) { A.addPower(self, 2, 'forever'); self.cao2 = true; } else self.cao2 = false; },
    lifeHits: (A, a) => (a.cao2 ? 2 : 1),
  };
  E['BT10-021'] = { // แบงค์ ชาวดาวพฤหัส
    activateLabel: 'ทิ้ง 1 ใบ: หา "แบงค์" จาก Deck', canActivate: (A, p) => A.hand(p).length > 0 && A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, BANK)),
    activate: async (A, p) => {
      await A.discard(p, 1); const v = await A.choose(p, 'เลือกปฏิบัติ', [{ label: 'นำ "แบงค์" ขึ้นมือ', value: 1, score: 2 }, { label: 'ส่ง "แบงค์" ลงนรก', value: 2, score: 1 }]);
      const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, BANK) && (v === 2 || !x.onlyOne), v === 1 ? 'นำ "แบงค์" ขึ้นมือ' : 'ส่ง "แบงค์" ลงนรก');
      if (c) { if (v === 1) A.toHand(p, A.takeFrom(A.deck(p), c)); else { A.hell(p).push(A.takeFrom(A.deck(p), c)); A.log(`"${c.card.name}" ลงนรก`); } } A.shuffleDeck(p);
    },
  };
  E['BT10-022'] = { alsoColor: 'red', onTargeted: async (A, p, d, a) => { A.addPower(a, -2, 'endTurn'); } }; // เดออง
  E['BT10-023'] = { // ไมค์วิสกี้
    onSummon: async (A, p) => {
      if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && (x.cost || 0) <= 4 && /\[(Link|คู่หู)/.test(x.text || ''), 'อัญเชิญ Avatar ที่มี [Link] Cost ≤4 จากมือ', true);
      if (c && await A.summonFrom(p, A.hand(p), c, { jutti: false }) && c.card.name === 'ซัลลี่วอดก้า') A.draw(p, 1);
    },
  };
  E['BT10-024'] = { onAllyAttack: async (A, p, src, a) => A.addPower(a, 1, 'endTurn') }; // ฯลฯ กระบือชาวร๊อค
  E['BT10-025'] = { // จอมเวทย์ โกลเด้น
    onLink: async (A, p) => {
      if (A.constructs(p).length >= 3) return; const c = await A.pickFrom(p, A.deck(p).concat(A.hell(p)), x => x.type === 'construct' && A_named(x, WIZ) && !A.constructs(p).some(y => y.card.name === x.name), 'ก่อสร้าง Construct "จอมเวทย์"', true); if (!c) return;
      const fromDeck = A.deck(p).includes(c); A.constructs(p).push(A.takeFrom(fromDeck ? A.deck(p) : A.hell(p), c)); c.owner = p; A.log(`ก่อสร้าง "${c.card.name}"`); if (fromDeck) A.shuffleDeck(p);
    },
    substitute: (A, p, s, a) => A.named(a.card, WIZ),
  };
  E['BT10-026'] = { // จอมเวทย์ เดสสึหวา
    onSummon: async (A, p) => { const c = await A.pickFrom(p, A.hand(p), x => (x.type === 'magic' && A_named(x, 'คาถา')) || (isAvatar(x) && A_named(x, WIZ)), 'ทิ้ง "คาถา" หรือ "จอมเวทย์" เพื่อจั่ว 2 ใบ', true); if (!c) return; A.hell(p).push(A.takeFrom(A.hand(p), c)); A.draw(p, 2); },
    onAnyMagic: async (A, q, a, inst) => { if (!A_named(inst.card, 'คาถา')) return; const xs = A.avatars(q).filter(x => A.named(x.card, WIZ)); const v = await A.choose(q, '"จอมเวทย์" POWER +1', xs.map(x => A.avOpt(x, A.power(x)))); const x = xs.find(y => y.uid === v); if (x) A.addPower(x, 1, 'forever'); },
    shieldAllies: (A, src, x) => !!A.linked(src) && x !== src,
    onTargeted: async (A, p, d) => { if (!A.linked(d) || d.drawTurn === A.state.turn) return; d.drawTurn = A.state.turn; A.draw(p, 1); },
  };
  E['BT10-027'] = { // นายนิรยบาล นิมมา
    onSummon: async (A, p, self) => { await A.mill(p, 2, self); A.draw(p, 1); },
    onAttack: async (A, p, a) => { if (!A.linked(a) || a.onceTurn === A.state.turn || A.deck(p).length < 3) return; a.onceTurn = A.state.turn; await A.mill(p, 1, a); if (A.onField(a)) A.addPower(a, A.avatars(p).filter(x => A.isSym(x, 'นรก')).length, 'endTurn'); },
  };
  E['BT10-028'] = { // นายนิรยบาล ดาร์กช็อก
    activateLabel: 'นำการ์ดในนรกกลับใต้ Deck', canActivate: (A, p) => A.state.players[p].milledTurn === A.state.turn && A.hell(p).some(c => !c.card.onlyOne),
    activate: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), x => !x.onlyOne, 'นำการ์ดในนรกกลับใต้ Deck'); if (c) A.deck(p).push(A.takeFrom(A.hell(p), c)); },
  };
  E['BT10-029'] = { // ซีเกิร์ด
    aura: (A, p, src, a) => (a.owner === p && A.named(a.card, VALKYRIE) ? (A.named(a.card, 'บรุนฮิลด์') ? 2 : 1) : 0),
    activateLabel: 'คืน "เทพธิดาแห่งวัลฮัลลา" จากนรก + ธรณีสูบ 3: ทำลาย Avatar อีกฝ่าย',
    canActivate: (A, p) => A.hell(p).some(c => isAvatar(c.card) && A_named(c.card, VALKYRIE)) && A.deck(p).length > 6,
    activate: async (A, p, a) => {
      for (let k = 0; k < 3; k++) { const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, VALKYRIE), `นำ "เทพธิดาแห่งวัลฮัลลา" กลับเข้า Deck (${k + 1}/3)`, k > 0); if (!c) break; A.deck(p).push(A.takeFrom(A.hell(p), c)); }
      A.shuffleDeck(p); const milled = await A.mill(p, 3, a); let left = 2 + milled.filter(c => A_named(c.card, VALKYRIE)).length; const o = A.opp(p);
      while (true) { const v = await A.choose(p, `ทำลาย Avatar อีกฝ่าย (Cost รวมเหลือ ${left})`, bestOppAvatar(A, p, x => A.cost(x) <= left), true); const d = A.avatars(o).find(x => x.uid === v); if (!d) break; left -= A.cost(d); await A.destroy(d, 'ซีเกิร์ด', p); }
    },
    hellActivateLabel: 'ธรณีสูบ 9: อัญเชิญ ซีเกิร์ด จากนรก',
    canHellActivate: (A, p) => A.avatars(p).some(x => A.named(x.card, 'บรุนฮิลด์')) && A.deck(p).length > 12 && A.roomFor(p),
    hellActivate: async (A, p, h) => { await A.mill(p, 9); if (A.hell(p).includes(h)) await A.summonFrom(p, A.hell(p), h, { jutti: false }); },
  };
  E['BT10-030'] = { // ยอดมนุษย์หัวยางลบ
    activateLabel: 'Avatar อีกฝ่ายสูญเสียความสามารถถึงจบเทิร์นถัดไปของอีกฝ่าย', canActivate: (A, p, a) => a.exact && A.avatars(A.opp(p)).length > 0,
    activate: async (A, p) => { const v = await A.choose(p, 'เลือก Avatar อีกฝ่าย', A.avatars(A.opp(p)).map(x => A.avOpt(x, (E[x.card.id] ? 3 : 0) + A.power(x)))); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (!d) return; d.lostAbilities = true; d.silenceUntil = A.state.turn + 1; A.log(`${d.card.name} สูญเสียความสามารถทั้งหมด`); },
  };
  const NUANG2 = ['คุณเก่ง', 'ทนาย', 'พี่หน่วง'];
  E['BT10-031'] = { // พี่หน่วงเพชรฆาตโซเชียล
    activateLabel: 'เนรเทศ Avatar อีกฝ่ายใน Magic Zone เรา: เลือกปฏิบัติ',
    canActivate: (A, p) => A.parked(p).some(m => isAvatar(m.card) && m.trueOwner === A.opp(p)),
    activate: async (A, p) => {
      const ms = A.parked(p).filter(m => isAvatar(m.card) && m.trueOwner === A.opp(p)); const v0 = await A.choose(p, 'เนรเทศ Avatar อีกฝ่ายใน Magic Zone', ms.map(m => A.cardOpt(m, 1))); const m = ms.find(x => x.uid === v0) || ms[0];
      const pl = A.state.players[p]; pl.magicZone.splice(pl.magicZone.indexOf(m), 1); m.parked = false; if (m.origCard) { m.card = m.origCard; delete m.origCard; } m.owner = m.trueOwner; delete m.trueOwner; A.dark(m.owner).push(m); A.log(`"${m.card.name}" ถูกเนรเทศ`);
      const o = A.opp(p); const opts = [{ label: 'สอดแนม 5 หา "คุณเก่ง"/"ทนาย"/"พี่หน่วง"', value: 1, score: 1 }]; if (A.hell(o).some(c => isAvatar(c.card))) opts.push({ label: 'นำ Avatar ในนรกอีกฝ่ายมาไว้ที่ Magic Zone เรา', value: 2, score: 1.5 });
      const v = await A.choose(p, 'เลือกปฏิบัติ', opts);
      if (v === 2) { const c = await A.pickFrom(p, A.hell(o), isAvatar, 'นำ Avatar ในนรกอีกฝ่ายมาไว้ที่ Magic Zone เรา'); if (c) A.park(c, p); }
      else await lookTopBottom(A, p, 5, [{ pred: c => NUANG2.some(n => A_named(c, n)), title: 'นำ "คุณเก่ง"/"ทนาย"/"พี่หน่วง" ขึ้นมือ' }], async c => A.toHand(p, c));
    },
  };
  E['BT10-032'] = { // พี่ซี๊ด แก๊งขยะ
    hellActivateLabel: 'ทิ้ง 1 ใบ: อัญเชิญ พี่ซี๊ด จากนรก',
    canHellActivate: (A, p) => { const lg = A.state.players[p].summonLog; return A.hand(p).length > 0 && A.roomFor(p) && !!lg && lg.turn === A.state.turn && lg.names.some(n => n.includes(GANG)) && !A.avatars(p).some(x => x.card.name === SEED); },
    hellActivate: async (A, p, h) => { await A.discard(p, 1); await A.summonFrom(p, A.hell(p), h, { jutti: false }); },
  };
  E['BT10-033'] = { onAllyBattle: async (A, p, h, x) => { if (!A.named(x.card, SLINGER) || !await askYes(A, p, `ทิ้ง พระอีสาน จากมือ: ${x.card.name} POWER +1?`, 1)) return; A.hell(p).push(A.takeFrom(A.hand(p), h)); A.addPower(x, 1, 'endTurn'); } }; // พระอีสาน
  E['BT10-034'] = { // ตำรวจสัมภเวสี ทาย
    onSummon: async (A, p) => {
      const o = A.opp(p); if (!A.hand(p).some(h => A_named(h.card, COP)) || A.deck(o).length < 2) return;
      const two = A.deck(o).slice(0, 2); A.log(`แสดง "ตำรวจ" และสอดแนม Deck อีกฝ่าย 2 ใบ: ${two.map(c => c.card.name).join(', ')}`);
      const v = await A.choose(p, 'ทิ้งใบไหนลงนรก (อีกใบไว้บนสุด)', two.map(c => A.cardOpt(c))); const c = two.find(x => x.uid === v) || two[0];
      A.hell(o).push(A.takeFrom(A.deck(o), c));
    },
  };
  E['BT10-035'] = { superDraw: true }; // แก๊ง Super Card
  E['BT10-036'] = { // เนโกะเมะ ยูริ
    activateLabel: 'จั่วทุกครั้งที่มีการใช้ Land / Modification (ถึงจบเทิร์นถัดไปของอีกฝ่าย)',
    activate: async (A, p, a) => { const v = await A.choose(p, 'เลือกปฏิบัติ', [{ label: 'ทุกครั้งที่ใช้ Land: จั่ว 1', value: 'land', score: 1 }, { label: 'ทุกครั้งที่ใช้ Modification: จั่ว 1', value: 'modification', score: 2 }]); a.yuri = { t: v, until: A.state.turn + 1 }; },
    onAnyMagic: async (A, q, a, inst) => { if (a.yuri && a.yuri.until >= A.state.turn && (inst.card.magicType || 'normal') === a.yuri.t) A.draw(q, 1); },
  };
  E['BT10-037'] = { onAllyBattleWin: async (A, p, src, a) => { if (A.linked(src) && a.card.name.startsWith('ลิโป้') && A.state.active === p) A.flipLife(A.opp(p), 1); } }; // ตันก๋ง
  E['BT10-038'] = { // แบงค์ Miner
    onAttack: async (A, p) => { if (bankNames(A, p) < 4) return; const o = A.opp(p); for (let k = 0; k < 2 && A.deck(o).length > 1; k++) A.exile(o, A.deck(o), A.deck(o)[0]); },
    magicImmune: (A, a) => bankNames(A, a.owner) >= 8,
  };
  E['BT10-039p'] = { // มาโกะ on the Magic Zone
    activateLabel: 'ส่ง "มะม่วง" 5 ใบใน Magic Zone ลงนรก: อัญเชิญ จุติ มาโกะ',
    canActivate: (A, p, m) => mangoInMZ(A, p).filter(x => x !== m).length >= 5 && A.roomFor(p, m.card),
    activate: async (A, p, m) => {
      for (let k = 0; k < 5; k++) { const xs = mangoInMZ(A, p).filter(x => x !== m); const v = await A.choose(p, `ส่ง "มะม่วง" ลงนรก (${k + 1}/5)`, xs.map(x => A.cardOpt(x, -A.gem(x.card)))); A.unparkToHell(xs.find(x => x.uid === v) || xs[0]); }
      const pl = A.state.players[p]; pl.magicZone.splice(pl.magicZone.indexOf(m), 1); delete m.grantFx; await A.summonFrom(p, [], m, { jutti: true });
    },
  };
  E['BT10-039'] = { // มาโกะ
    onSummon: async (A, p) => { const names = new Set(mangoInMZ(A, p).map(m => m.card.name)); for (const c of A.hell(p).slice()) if (isMango(c.card) && !names.has(c.card.name) && c.card.id !== 'BT10-039') { names.add(c.card.name); parkMango(A, p, c); } },
    continuousSelf: (A, p) => A.parked(p).filter(m => m.card.name === TREE).length,
    activateLabel: 'อัญเชิญ จุติ "มะม่วง" จาก Magic Zone',
    canActivate: (A, p) => A.roomFor(p) && mangoInMZ(A, p).length > 0,
    activate: async (A, p) => { const xs = mangoInMZ(A, p); const v = await A.choose(p, 'อัญเชิญ จุติ "มะม่วง" จาก Magic Zone', xs.map(x => A.cardOpt(x))); const m = xs.find(x => x.uid === v) || xs[0]; const pl = A.state.players[p]; pl.magicZone.splice(pl.magicZone.indexOf(m), 1); delete m.grantFx; await A.summonFrom(p, [], m, { jutti: true }); },
  };
  E['BT10-040'] = { // ผู้คุมกฎแห่งภาคีมะม่วง
    onSummon: async (A, p) => {
      const c = await A.pickFrom(p, A.deck(p), x => isMango(x) && !x.onlyOne, 'นำ "มะม่วง" {ต้นไม้} จาก Deck ไว้ที่ Magic Zone', true); if (!c) return;
      parkMango(A, p, c);
      if (c.card.name === TREE) { const d = await A.pickFrom(p, A.deck(p).concat(A.hell(p)), isMango, 'นำ "มะม่วง" อีก 1 ใบ (Deck/นรก) ไว้ที่ Magic Zone', true); if (d) parkMango(A, p, d); }
      A.shuffleDeck(p);
    },
    lastWill: mangoLastWill,
  };
  E['BT10-041'] = { // นักรบทองแห่งภาคีมะม่วง
    endPhase: async (A, p, a) => { if (!A.parked(p).some(m => m.card.name === TREE)) return; if (a.rested) { A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`); } A.addPower(a, 2, 'myNextTurn'); },
    lastWill: mangoLastWill,
  };
  E['BT10-042'] = { lastWill: mangoLastWill }; // ผู้พิทักษ์แห่งภาคีมะม่วง
  E['BT10-043'] = { // ไมยราพ
    onSummon: async (A, p) => {
      for (let k = 0; k < 2 && A.roomFor(p); k++) { const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && x.symbol === 'ยักษ์' && (x.cost || 0) <= 3 && !(x.text || '').trim(), `อัญเชิญ {ยักษ์} Cost ≤3 ไม่มี Text (${k + 1}/2)`, true); if (!c) break; await A.summonFrom(p, A.deck(p), c, { jutti: false }); }
      A.shuffleDeck(p);
    },
  };
  const THRONE = 'บัลลังก์ตั๊กแตนศตวรรษ';
  const useFaceUpLife = async (A, p, title) => {
    const ls = A.state.players[p].life.filter(l => l.faceUp && A.lifeFx(l.card.id)); const v = await A.choose(p, title, ls.map(l => A.cardOpt(l)), true); const l = ls.find(x => x.uid === v);
    if (l) { A.log(`ใช้ความสามารถ LIFE "${l.card.name}"`); await A.lifeFx(l.card.id)(A, p, l); }
  };
  E['BT10-044'] = { // ราชันย์ตั๊กแตนศตวรรษ
    onSummon: async (A, p, self) => {
      const opts = []; if (A.hell(p).some(c => c.card.name === THRONE)) opts.push({ label: `นำ ${THRONE} จากนรกมาสวมใส่`, value: 1, score: 2 });
      if (A.deck(p).some(c => c.card.name === THRONE) && A.state.players[p].life.some(l => !l.faceUp)) opts.push({ label: `หงาย LIFE 1 ใบ: นำ ${THRONE} จาก Deck ขึ้นมือ`, value: 2, score: 1 });
      const v = await A.choose(p, 'เลือกปฏิบัติ', opts, true);
      if (v === 1 && A.onField(self)) { const c = A.hell(p).find(x => x.card.name === THRONE); await A.attach(p, A.takeFrom(A.hell(p), c), self); }
      if (v === 2) { A.flipLife(p, 1); await tutor(c => c.name === THRONE, `นำ ${THRONE} ขึ้นมือ`)(A, p); }
    },
    mainStart: async (A, p, a) => { if (A.attached(a).some(m => m.card.name === THRONE)) await useFaceUpLife(A, p, 'เลือก LIFE ที่หงายอยู่ เพื่อใช้ความสามารถ'); },
  };
  E['BT10-045'] = { // นักข่าวสาว เดย์วัน
    gemAs: (A, p, pc, target) => (A_named(target, COP) ? 5 : null), anyColorFor: c => A_named(c, COP),
    onPaidAsCost: async (A, p, pc, inst) => { if (!A.named(inst.card, COP)) return; const t = A.deck(A.opp(p))[0]; if (t) A.log(`สอดแนม Deck อีกฝ่าย: "${t.card.name}" (วางไว้ที่เดิม)`); },
    untargetable: (A, x) => A.avatars(x.owner).some(y => y !== x && A.named(y.card, COP)),
  };
  E['BT10-046'] = { afterAttack: async (A, p, a) => { if (a.onceTurn === A.state.turn || !A.deck(A.opp(p)).length) return; a.onceTurn = A.state.turn; if (await declareTopCard(A, p) && A.onField(a)) { A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`); } } }; // ตำรวจพ่อลูกอ่อน คามุ
  E['BT10-047'] = { onSupported: async (A, p, a, s) => { if (supportedBySeed(s)) { A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`); } } }; // เบรกเกต แก๊งขยะ
  E['BT10-048'] = { // เซนเซไฮ
    onSupport: async (A, p, s, a) => { a.flipOnWin = A.state.turn; A.log(`${a.card.name}: ถ้าทำลาย Avatar อีกฝ่ายจากการต่อสู้ หงาย LIFE อีกฝ่าย 1 ใบ`); },
    lastWill: async (A, p) => {
      const v = await A.choose(p, 'เซนเซไฮ คำสั่งเสีย: เลือก', [{ label: 'ทิ้งการ์ดบนมือ 3 ใบ', value: 1, score: A.hand(p).length <= 2 ? 2 : -1 }, { label: 'หงาย LIFE ใบบนสุดของเรา 1 ใบ', value: 2, score: A.state.players[p].life.filter(l => !l.faceUp).length > 2 ? 1 : -2 }]);
      if (v === 2 && A.flipLife(p, 1)) return; const n = Math.min(3, A.hand(p).length); if (n) await A.discard(p, n);
    },
  };
  E['BT10-049'] = { // ม้าเฉียว
    onBattle: async (A, p, a) => { if (a.onceTurn === A.state.turn) return; a.onceTurn = A.state.turn; A.addPower(a, 2, 'endTurn'); },
    endPhase: async (A, p, a) => { if (!A.avatars(p).some(x => x !== a && A.named(x.card, GENERAL3) && A.isColor(x.card, 'green') && A.isSym(x, FOREIGN))) A.bounce(a); },
  };
  E['BT10-050'] = { // ชิบาตะ โบตัน
    activateLabel: 'สลับ Cost กับ POWER ตั้งต้นของ Avatar 1 ใบ', canActivate: (A, p, a) => a.exact,
    activate: async (A, p) => {
      const xs = A.avatars(0).concat(A.avatars(1)); const v = await A.choose(p, 'สลับ Cost กับ POWER ตั้งต้น', xs.map(x => A.avOpt(x, x.owner === p ? (x.card.cost || 0) - (x.card.power || 0) : (x.card.power || 0) - (x.card.cost || 0))));
      const x = xs.find(y => y.uid === v); if (!x) return; const orig = x.origCard || x.card; const cur = x.card; x.origCard = orig;
      x.card = Object.assign({}, cur, { cost: cur.power || 0, power: cur.cost || 0 }); A.log(`${x.card.name}: Cost ${x.card.cost} / POWER ตั้งต้น ${x.card.power} จนจบเทิร์น`);
      const t = A.state.turn; A.atEndOfTurn(async () => { if (x.origCard === orig && A.state.turn === t) { x.card = orig; delete x.origCard; } });
    },
  };
  E['BT10-053'] = { canUse: (A, p) => A.avatars(p).some(x => A.named(x.card, 'พระพิฆเนศ')) && A.roomFor(p) && A.hell(p).some(c => isAvatar(c.card) && c.card.symbol === 'เทพ' && (c.card.cost || 0) <= 4 && !c.card.onlyOne), magic: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && x.symbol === 'เทพ' && (x.cost || 0) <= 4 && !x.onlyOne, 'อัญเชิญ {เทพ} Cost ≤4 จากนรก'); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); } }; // การเลือกสรรของ พระพิฆเนศ
  E['BT10-054'] = { // เหนือฟ้าใต้หล้า ข้าคือมหาจอมเวทย์
    canUse: (A, p) => A.hand(p).length > 0,
    magic: async (A, p, inst) => { await A.discard(p, 1); await tutor(c => c.type === 'magic' && A_named(c, 'คาถา'), 'นำ "คาถา" ขึ้นมือ')(A, p); if (A.avatars(p).some(x => A.named(x.card, WIZ))) { A.state.magicUsed[p].extraMagic = inst.card.name; A.log('เทิร์นนี้ใช้ Magic ได้อีก 1 ใบ'); } },
  };
  E['BT10-055'] = { payOnlyFor: c => A_named(c, WIZ), canUse: (A, p) => A.avatars(p).some(x => A.named(x.card, WIZ)) && A.roomFor(p), magic: async (A, p) => { await lookTopBottom(A, p, 5, [{ pred: c => isAvatar(c) && A_named(c, WIZ), title: 'อัญเชิญ จุติ "จอมเวทย์"' }], async c => { if (A.roomFor(p, c.card)) await A.summonFrom(p, [], c, { jutti: true }); else A.deck(p).push(c); }); } }; // คาถา เฟรนลี่คัม
  const exactJutti = a => /พอดี\s*จุต[ิี]/.test(a.card.text || '') && E[a.card.id] && E[a.card.id].onSummon;
  E['BT10-056'] = { // ชีวิตที่พอดี
    canUse: (A, p) => A.hand(p).length >= 3 && A.avatars(p).some(exactJutti),
    magic: async (A, p) => {
      await A.discard(p, 2); const xs = A.avatars(p).filter(exactJutti); const v = await A.choose(p, 'ทำ จุติ ของ Avatar อีกครั้ง', xs.map(x => A.avOpt(x, 1))); const x = xs.find(y => y.uid === v) || xs[0]; if (!x) return;
      const was = x.exact; x.exact = true; try { await E[x.card.id].onSummon(A, p, x); } finally { x.exact = was; }
    },
  };
  E['BT10-057'] = { // 1 - 2 - 2
    canUse: (A, p) => { const lg = A.state.players[p].summonLog; return !['normal', 'modification', 'react', 'land'].some(t => A.magicUsed(p, t)) && !(lg && lg.turn === A.state.turn); },
    magic: async (A, p) => { A.draw(p, 3); A.state.players[p].skipDraw = true; A.log('Draw Phase ถัดไปจะไม่ได้จั่วการ์ด'); },
  };
  E['BT10-058'] = { // พายุหิมะเริงระบำ
    canUse: (A, p) => A.avatars(p).some(x => A.named(x.card, 'ราชินีหิมะ')) && A.hell(p).filter(c => isAvatar(c.card) && A_named(c.card, SNOWMAN)).length >= 8 && A.roomFor(p),
    magic: async (A, p) => {
      let left = 6; const got = [];
      while (A.roomFor(p)) { const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, SNOWMAN) && (x.cost || 0) <= left, `อัญเชิญ "ทหารหิมะ" (Cost รวมเหลือ ${left})`, true); if (!c) break; left -= c.card.cost || 0; if (await A.summonFrom(p, A.deck(p), c, { jutti: false })) got.push(c); }
      A.shuffleDeck(p);
      A.atEndOfTurn(async A2 => { got.forEach(c => { if (A2.onField(c)) A2.sendToHell(c); }); if (!A2.roomFor(p)) return; const k = await A2.pickFrom(p, A2.deck(p), x => isAvatar(x) && A_named(x, 'ราชาหิมะ'), 'อัญเชิญ "ราชาหิมะ" จาก Deck', true); if (k) await A2.summonFrom(p, A2.deck(p), k, { jutti: false }); A2.shuffleDeck(p); });
    },
  };
  E['BT10-059'] = { // ศิลาหยินหยาง
    canUse: (A, p) => A.roomFor(p) && A.deck(p).some(c => ['ตั๊กแตนหยิน', 'ตั๊กแตนหยาง'].includes(c.card.name)),
    magic: async (A, p) => {
      if (A.state.players[p].life.some(l => !l.faceUp)) A.flipLife(p, 1);
      const opts = ['ตั๊กแตนหยิน', 'ตั๊กแตนหยาง'].filter(n => A.deck(p).some(c => c.card.name === n)).map(n => ({ label: `อัญเชิญ ${n}`, value: n, score: 1 }));
      const n = await A.choose(p, 'ศิลาหยินหยาง: เลือกปฏิบัติ', opts); const c = A.deck(p).find(x => x.card.name === n); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p);
    },
  };
  E['BT10-060'] = { // ผู้มาเยือน
    canUse: (A, p) => A.roomFor(p) && A.hand(p).some(h => h.card.symbol === 'เอเลี่ยน') && A.deck(p).some(c => isAvatar(c.card) && c.card.symbol === 'เอเลี่ยน' && (c.card.cost || 0) <= 4),
    magic: async (A, p, inst) => {
      const h = await A.pickFrom(p, A.hand(p), x => x.symbol === 'เอเลี่ยน', 'ทิ้งการ์ด {เอเลี่ยน} 1 ใบ'); if (h) A.hell(p).push(A.takeFrom(A.hand(p), h));
      const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && x.symbol === 'เอเลี่ยน' && (x.cost || 0) <= 4, 'อัญเชิญ {เอเลี่ยน} Cost ≤4 จาก Deck'); A.shuffleDeck(p);
      if (!c || !await A.summonFrom(p, A.deck(p), c, { jutti: false }) || !A.onField(c)) return;
      await A.attach(p, inst, c); return { stay: true };
    },
    onHell: (A, p, m, host) => { if (host && A.onField(host)) A.sendToHell(host); },
  };
  E['BT10-061'] = { canUse: (A, p) => A.hand(p).length > 0, magic: async (A, p) => { await A.discard(p, 1); await lookTopBottom(A, p, 3, [{ pred: c => isAvatar(c) && A_named(c, 'นารายณ์') && c.symbol === 'เทพ' && (c.cost || 0) <= 6, title: 'นำ "นารายณ์" {เทพ} ขึ้นมือ' }], async c => A.toHand(p, c)); } }; // นารายณ์ 10 ปาง
  E['BT10-062'] = { canUse: (A, p) => A.avatars(p).some(x => A.named(x.card, SEWAGE)), magic: async (A, p) => { const xs = A.avatars(p).filter(x => A.named(x.card, SEWAGE)); const v = await A.choose(p, 'เซ่นไหว้ "สิ่งปฏิกูล"', xs.map(x => A.avOpt(x, 1))); await A.sacrifice(p, xs.find(x => x.uid === v) || xs[0]); A.draw(p, 3); await A.discard(p, 1); } }; // ทะลวงส้วม
  const mangoRoots = async (A, p) => { const xs = A.avatars(p).filter(x => isMango(x.card)); const v = await A.choose(p, 'ทำลาย "มะม่วง" ของเรา', xs.map(x => A.avOpt(x, -A.power(x)))); const x = xs.find(y => y.uid === v) || xs[0]; if (!x) return; await A.destroy(x, 'ไปคุยกับรากมะม่วง'); await destroyAnyFieldCard(A, p); };
  E['BT10-063'] = { magic: mangoRoots, canUse: (A, p) => A.avatars(p).some(x => isMango(x.card)), react: { on: 'attack', when: (A, p) => A.avatars(p).some(x => isMango(x.card)), botScore: () => 0.5, run: mangoRoots } }; // ไปคุยกับรากมะม่วง
  const onlyNinjas = (A, p) => A.avatars(p).length > 0 && A.avatars(p).every(x => A.named(x.card, NINJA));
  E['BT10-064'] = { // วิชานินจา ผนึกเงา
    react: { on: 'battleStart', when: (A, p) => onlyNinjas(A, p) && A.avatars(A.opp(p)).length > 0, botScore: () => 2, run: async (A, p) => { const v = await A.choose(p, 'Avatar อีกฝ่ายไม่สามารถเปลี่ยนสภาพได้จนจบเทิร์น', A.avatars(A.opp(p)).filter(x => !x.rested).map(x => A.avOpt(x, A.power(x)))); const d = A.avatars(A.opp(p)).find(x => x.uid === v); if (d) { d.noStateTurn = A.state.turn; A.log(`${d.card.name} เปลี่ยนสภาพไม่ได้จนจบเทิร์น`); } } },
  };
  const ninjaHide = async (A, p, x) => { A.banishAvatar(x); A.atEndOfTurn(async A2 => { if (A2.dark(p).includes(x) && A2.roomFor(p, x.card)) { A2.takeFrom(A2.dark(p), x); A2.log(`${x.card.name} กลับจากมิติมืด`); await A2.putAvatar(p, x, { jutti: false }); } }); };
  E['BT10-065'] = { // วิชานินจา รุกรับพลิกผัน
    canUse: onlyNinjas,
    magic: async (A, p) => { const xs = A.avatars(p); const v = await A.choose(p, '"นินจา" ได้รับ เตะไข่ จนจบเทิร์น', xs.map(x => A.avOpt(x, A.power(x)))); const x = xs.find(y => y.uid === v); if (x) A.grantKw(x, ['เตะไข่']); },
    react: { on: 'attack', when: (A, p, ctx) => onlyNinjas(A, p) && ctx.target.kind === 'avatar' && A.avatars(p).some(x => x.uid === ctx.target.uid), botScore: (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); return d && A.power(d) < A.power(ctx.attacker) ? 2 : -1; }, run: async (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); if (d) await ninjaHide(A, p, d); return { cancelAttack: true }; } },
  };
  E['BT10-066'] = { // คาถา โปเตกโต้
    react: { on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'avatar' && A.avatars(p).some(x => x.uid === ctx.target.uid && A.named(x.card, WIZ)) && A.hell(p).some(c => A_named(c.card, 'คาถา')), botScore: () => 2, run: async (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); if (d) A.addPower(d, 2 * A.hell(p).filter(c => c.card.type === 'magic' && A_named(c.card, 'คาถา')).length, 'endTurn'); } },
  };
  E['BT10-067'] = { // ศาสตราวุธศักดิ์สิทธิ์ โวลุสปา
    magic: true, equipOk: (A, a) => A.named(a.card, VALKYRIE), guardHost: () => true,
    onMilled: async (A, p, c) => { const xs = A.avatars(p).filter(a => A.named(a.card, VALKYRIE)); if (!xs.length || A.magicUsed(p, 'modification') || !await askYes(A, p, 'ใช้ โวลุสปา จากนรก (สวมใส่ "เทพธิดาแห่งวัลฮัลลา")?', 2)) return; const v = await A.choose(p, 'สวมใส่ให้ใบไหน', xs.map(x => A.avOpt(x, A.power(x)))); A.markMagicUsed(p, 'modification'); await A.attach(p, A.takeFrom(A.hell(p), c), xs.find(x => x.uid === v) || xs[0]); },
  };
  E['BT10-068'] = { magic: true, equipOk: (A, a) => ['ตั๊กแตนหยิน', 'ตั๊กแตนหยาง'].some(n => A.named(a.card, n)), onEquippedBattleWin: async (A, p) => { if (A.state.active === p) await useFaceUpLife(A, p, 'หยินหยางทอร์นาโด: ใช้ความสามารถ LIFE ที่หงายอยู่'); } }; // หยินหยางทอร์นาโด
  E['BT10-069'] = { // อาวุธของเพมมุ ดาบมารไร้พ่าย
    magic: true, equipOk: (A, a) => A.named(a.card, PEMMU), equipPower: 1,
    onEquippedBattleWin: async (A, p, m, a, r) => {
      if (A.state.active !== p || !r) return; const o = A.opp(p);
      const v = await A.choose(p, `ทำลาย Avatar อีกฝ่าย POWER ตั้งต้น ≤${r.loserPower}`, bestOppAvatar(A, p, x => (x.card.power || 0) <= r.loserPower), true); const d = A.avatars(o).find(x => x.uid === v); if (d) await A.destroy(d, 'ดาบมารไร้พ่าย', p);
      const ps = A.avatars(p).filter(x => A.named(x.card, PEMMU) && x.rested);
      if (ps.length && A.state.players.some(x => x.magicZone.includes(m)) && await askYes(A, p, 'ทำลาย ดาบมารไร้พ่าย เพื่อให้ "เพมมุ" กลับมาสภาพตื่น?', 1)) { A.destroyMagic(m); A.wake(ps[0]); A.log(`${ps[0].card.name} กลับมาสภาพตื่น`); }
    },
  };
  E['BT10-070'] = { magic: true, landProtect: (A, a) => A.avatars(a.owner).some(x => (A.named(x.card, PEMMU) || A.named(x.card, SPRITE)) && A.linked(x)) && (A.named(a.card, PEMMU) || (a.card.text || '').includes(PEMMU)) }; // ดินแดนยุติธรรม
  const ATTRS = [['power', 'POWER', a => a.power], ['symbol', 'Symbol', a => a.symbol], ['cost', 'Cost', a => a.cost], ['gem', 'จำนวน GEM', null], ['color', 'สี', a => a.color]];
  E['BT10-071'] = { // Myth Universe Podcast
    magic: true,
    activateLabel: 'แสดง Avatar บนมือ: Avatar ที่มีข้อมูลเดียวกัน POWER +2',
    canActivate: (A, p) => A.hand(p).some(h => isAvatar(h.card)) && A.avatars(p).length > 0,
    activate: async (A, p) => {
      const val = (k, c) => (k === 'gem' ? A.gem(c) : k === 'power' ? null : ATTRS.find(x => x[0] === k)[2](c));
      const match = (k, c, a) => (k === 'power' ? (c.power || 0) === A.power(a) : k === 'symbol' ? A.isSym(a, c.symbol) : k === 'color' ? A.isColor(a.card, c.color) : val(k, c) === val(k, a.card));
      const opts = [];
      A.hand(p).filter(h => isAvatar(h.card)).forEach(h => ATTRS.forEach(([k, lbl]) => { const n = A.avatars(p).filter(a => match(k, h.card, a)).length; if (n) opts.push({ label: `แสดง ${h.card.name} — ${lbl}`, value: `${h.uid}|${k}`, score: Math.min(n, 2) * 2 - (h.card.cost || 0) / 10 }); }));
      const v = await A.choose(p, 'เลือก Avatar ที่จะแสดงและข้อมูล', opts); if (!v) return; const [hu, k] = v.split('|'); const h = A.hand(p).find(x => x.uid === +hu); if (!h) return;
      const xs = A.avatars(p).filter(a => match(k, h.card, a));
      for (let i = 0; i < 2; i++) { const left = xs.filter(x => !x.podTurn || x.podTurn !== A.state.turn); const w = await A.choose(p, `Avatar POWER +2 (${i + 1}/2)`, left.map(x => A.avOpt(x, A.power(x))), i > 0); const x = left.find(y => y.uid === w); if (!x) break; x.podTurn = A.state.turn; A.addPower(x, 2, 'endTurn'); }
      A.exile(p, A.hand(p), h);
    },
  };
  E['BT10-072'] = { activateLabel: 'เทิร์นนี้ใช้ Magic "คาถา" เพิ่มได้ 1 ใบ', activate: async (A, p) => { A.state.magicUsed[p].extraSpell = true; A.log('เทิร์นนี้ใช้ "คาถา" ได้เพิ่ม 1 ใบ'); }, untargetableConstruct: (A, c, owner) => A.avatars(owner).some(a => A.named(a.card, WIZ)) }; // หอสมุดจอมเวทย์
  const bangrajan = a => (a.card.text || '').includes('ค่ายบางระจัน');
  E['BT10-073'] = { aura: (A, p, src, a) => (bangrajan(a) ? 1 : 0), kwAura: (A, src, a) => (bangrajan(a) ? ['โล่มนุษย์'] : []), fxProof: (A, c, owner) => A.avatars(owner).some(bangrajan) }; // ดวงจันทร์วันเพ็ญ
  E['BT10-074'] = { handCost: (A, p, c) => (new Set(A.avatars(p).filter(a => A.named(a.card, GANG)).map(a => a.card.name)).size >= 2 ? 0 : (c.cost || 0)), kwAura: (A, src, a) => (A.named(a.card, GANG) ? ['ลูกฮึด'] : []) }; // ZeedZad Server
  E['BT10-075'] = { life: async (A, p) => { if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && x.color === 'purple' && (x.cost || 0) <= 4, 'อัญเชิญ Avatar สีม่วง Cost ≤4 จากมือ', true); if (c) await A.summonFrom(p, A.hand(p), c, { jutti: false }); } }; // ไม่นะ เตียวเสียน!

  // ================= BT11 =================
  const NUT = 'ไอ้นัท', SIRNUT = 'เซอร์นัท', TKNIGHT = 'อัศวินตลิ่งชัน', GUN = 'มือปืนนคร', CITYW = 'อาวุธนคร', CITY = 'นครทิเนนทอล', XVI = 'หน่วยรบ XVI', VIRUS = 'ไวรัส', SMC = 'สมาชม', APPL = 'เครื่องใช้ไฟฟ้า';
  const SAIYU = ['พระถังซัมจั๋ง', 'ซุนหงอคง', 'ตือโป๊ยก่าย', 'ซัวเจ๋ง'], SUTRA = 'พระไตรปิฎก';
  (root.TC_CARDS || []).forEach(c => {
    if (['BT11-028', 'BT11-029', 'BT11-030', 'BT11-031'].includes(c.id) && !(c.alsoNamed || []).includes(SMC)) c.alsoNamed = (c.alsoNamed || []).concat(SMC);
    if (c.id === 'BT11-033' && !(c.alsoNamed || []).includes('เลอร์ติ๊ก เด็กไม่ชอบแดรคคูลา')) c.alsoNamed = (c.alsoNamed || []).concat('เลอร์ติ๊ก เด็กไม่ชอบแดรคคูลา');
  });
  const pickAv = async (A, p, xs, title, score, optional) => { if (!xs.length) return null; const v = await A.choose(p, title, xs.map(x => A.avOpt(x, score ? score(x) : A.power(x))), optional); return xs.find(x => x.uid === v) || (optional ? null : xs[0]); };
  const nutHost = a => A_named(a.card, NUT) || A_named(a.card, SIRNUT);
  const hasCity = (A, p) => A.constructs(p).some(c => c.card.name === CITY);
  const isXVI = c => isAvatar(c) && A_named(c, XVI);
  const isVirus = c => isAvatar(c) && A_named(c, VIRUS);
  const smcCount = (A, p) => A.avatars(p).filter(a => A.named(a.card, SMC)).length;
  const saiyuOn = (A, p, name) => A.avatars(p).some(a => a.card.name === name);
  const sutras = (A, p) => A.state.players[p].magicZone.filter(m => m.card.name === SUTRA).length;
  const saiyuPower = (A, p) => sutras(A, p);
  const fromMZ = (A, p) => A.state.players[p].magicZone;
  // หน่วยรบ XVI: look at the top 3, summon one non-Only "หน่วยรบ XVI"
  const xviLook = (rest, jutti) => async (A, p) => {
    const d = A.deck(p); const seen = d.splice(0, Math.min(3, d.length)); A.log(`${A.state.players[p].name} สอดแนม ${seen.length} ใบ`);
    const can = A.roomFor(p) ? seen.filter(c => isXVI(c.card) && !c.card.onlyOne) : [];
    const v = await A.choose(p, 'อัญเชิญ "หน่วยรบ XVI" จากที่สอดแนม', can.map(c => A.cardOpt(c)), true); const c = seen.find(x => x.uid === v);
    if (c) seen.splice(seen.indexOf(c), 1);
    if (rest === 'hell') A.hell(p).push(...seen); else d.push(...seen);
    if (c) await A.summonFrom(p, [], c, { jutti: !!jutti });
  };
  const xviAura = (A, p, src, a) => (a.owner === p && A.named(a.card, XVI) ? 1 : 0);
  // ไวรัส: every player mills n, count the Avatars milled
  const virusMill = async (A, p, n, src) => { let k = 0; for (const q of [p, A.opp(p)]) { if (A.state.winner != null) break; const m = await A.mill(q, n, src); k += m.filter(c => isAvatar(c.card)).length; } return k; };
  const virusBase = {
    onMilled: async (A, p, c, src) => { if (src && A.named(src.card, VIRUS) && A.hell(p).includes(c)) A.exile(p, A.hell(p), c); },
    darkActivateLabel: 'ทิ้ง 2 ใบ: อัญเชิญใบนี้จากมิติมืด',
    canDarkActivate: (A, p, h) => A.dark(p).filter(c => isVirus(c.card)).length >= 5 && A.hand(p).length >= 2 && A.roomFor(p, h.card),
    darkActivate: async (A, p, h) => { await A.discard(p, 2); await A.summonFrom(p, A.dark(p), h, { jutti: false }); },
  };
  const exileVirusFromHell = async (A, p, n) => { for (let k = 0; k < n; k++) { const c = await A.pickFrom(p, A.hell(p), x => isVirus(x) && !x.onlyOne, `เนรเทศ "ไวรัส" ในนรก (${k + 1}/${n})`); if (!c) return false; A.exile(p, A.hell(p), c); } return true; };
  // เครื่องใช้ไฟฟ้า: kept face up in the Magic Zone
  const parkAppliance = (A, p, inst) => { A.park(inst, p); if (E[inst.card.id + 'p']) inst.grantFx = inst.card.id + 'p'; };
  const applianceLastWill = async (A, p, self) => { if (self.destroyedBy != null && self.destroyedBy !== p && A.hell(p).includes(self)) parkAppliance(A, p, self); };
  const applianceFromMZ = id => ({
    activateLabel: 'ทิ้ง 2 ใบ: อัญเชิญใบนี้จาก Magic Zone',
    canActivate: (A, p, m) => A.hand(p).length >= 2 && A.roomFor(p, m.card),
    activate: async (A, p, m) => { await A.discard(p, 2); delete m.grantFx; await A.summonFrom(p, fromMZ(A, p), m, { jutti: false }); void id; },
  });
  // เบเซอร์ โหมด: send the two named cards from our Magic Zone back into the Deck
  const modeParts = (A, p, other) => { const pz = A.parked(p); const b = pz.find(m => m.card.name === 'มนุษย์เครื่องใช้ไฟฟ้า เบเซอร์'), o = pz.find(m => m.card.name === other); return b && o ? [b, o] : null; };
  const modeSwap = async (A, p, h, other) => {
    const parts = modeParts(A, p, other); if (!parts) return false;
    parts.forEach(m => { const z = fromMZ(A, p); z.splice(z.indexOf(m), 1); m.parked = false; delete m.grantFx; if (m.trueOwner != null) { m.owner = m.trueOwner; delete m.trueOwner; } A.deck(m.owner).push(m); }); A.shuffleDeck(p);
    A.log(`นำ เบเซอร์ และ ${other} กลับเข้า Deck`);
    return A.summonFrom(p, A.hand(p), h, { jutti: false, by: h.card.id });
  };
  const sendOta = async (A, p, n, optional) => { // send "โอตะ" cards from either field to hell
    let k = 0;
    for (; k < n; k++) {
      const avs = A.avatars(0).concat(A.avatars(1)).filter(x => A.named(x.card, OTA));
      const ms = fromMZ(A, 0).concat(fromMZ(A, 1)).filter(m => A_named(m.card, OTA));
      const opts = avs.map(x => A.avOpt(x, x.owner === p ? -A.power(x) : A.power(x) + 2)).concat(ms.map(m => A.cardOpt(m, 0)));
      const v = await A.choose(p, `ส่งการ์ด "โอตะ" บนสนามลงนรก (${k + 1}/${n})`, opts, optional || k > 0); if (v == null) break;
      const x = avs.find(y => y.uid === v); if (x) { A.sendToHell(x); continue; }
      const m = ms.find(y => y.uid === v); if (m) { if (m.parked) A.unparkToHell(m); else A.destroyMagic(m); }
    }
    return k;
  };

  E['BT11-001'] = { // ฤาษีอังคต
    onAnyMagic: async (A, q, a, inst) => {
      if (A.state.active !== q || inst.card.symbol !== 'ฤษี' || a.onceTurn === A.state.turn) return;
      const xs = A.avatars(0).concat(A.avatars(1)).filter(x => A.isSym(x, 'สัตว์')); if (!xs.length) return; a.onceTurn = A.state.turn;
      const x = await pickAv(A, q, xs, 'ฤาษีอังคต: เลือก Avatar {สัตว์}', y => (y.owner === q ? 1 : A.power(y) + 5));
      if (x.owner !== q) await A.destroy(x, 'ฤาษีอังคต', q); else { A.addPower(x, 2, 'endTurn'); A.grantKw(x, ['สามัคคี']); }
    },
  };
  E['BT11-002'] = { // ไอ้นัท คนข้ามเวลา
    activateLabel: 'นำ "ไอ้นัท" จากนรกมาสวมใส่', canActivate: (A, p, a) => A.hell(p).some(c => isAvatar(c.card) && A_named(c.card, NUT) && c.card.name !== a.card.name),
    activate: async (A, p, a) => { const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, NUT) && x.name !== a.card.name, 'นำ "ไอ้นัท" จากนรกมาสวมใส่'); if (c) await A.attach(p, A.takeFrom(A.hell(p), c), a); },
  };
  E['BT11-003'] = { // เซอร์นัท ผู้นำแห่งอัศวินตลิ่งชัน
    onSummon: async (A, p, self) => { const c = await A.pickFrom(p, A.hell(p), x => A_named(x, NUT), 'นำ "ไอ้นัท" จากนรกมาสวมใส่', true); if (c) await A.attach(p, A.takeFrom(A.hell(p), c), self); },
    continuousSelf: (A, p, a) => A.attached(a).length,
    fieldCounter: {
      on: ['magic', 'activate'], label: 'เซอร์นัท: เนรเทศการ์ดที่สวมใส่ 2 ใบเพื่อยกเลิก',
      when: (A, p, a) => A.attached(a).length >= 2 && A.avatars(p).every(x => A.named(x.card, TKNIGHT) || A.named(x.card, SIRNUT) || A.named(x.card, NUT)),
      botScore: () => 1.5,
      run: async (A, p, a) => {
        for (let k = 0; k < 2; k++) { const ms = A.attached(a); const v = await A.choose(p, `เนรเทศการ์ดที่สวมใส่ (${k + 1}/2)`, ms.map(m => A.cardOpt(m, -1))); const m = ms.find(x => x.uid === v) || ms[0]; m.attachedTo = null; A.exile(m.owner, fromMZ(A, m.owner), m); }
        return { cancel: true, negate: true };
      },
    },
    onAttack: async (A, p, a, tgt) => { for (const m of A.attached(a)) { const f = E[m.card.id]; if (isAvatar(m.card) && A_named(m.card, NUT) && f && f.onAttack && A.onField(a)) await f.onAttack(A, p, a, tgt); } },
  };
  const cityWeapon = (bonus, extra) => Object.assign({
    equipOk: (A, a) => A.named(a.card, GUN),
    onEquippedAttack: async (A, p, m, a) => { if (bonus) A.addPower(a, bonus, 'endTurn'); },
  }, extra || {});
  E['BT11-004'] = { // มือปืนนคร บ่าวจุ้ย
    uniqueOnField: true,
    afterAttack: async (A, p, a) => {
      if (a.onceTurn === A.state.turn || !hasCity(A, p) || !A.onField(a)) return;
      const ws = A.attached(a).filter(m => A_named(m.card, CITYW)); if (!ws.length) return;
      const pool = A.dark(p).filter(c => A_named(c.card, CITYW)); if (!pool.length || !pool.some(c => ws.some(w => w.card.name !== c.card.name))) return;
      if (await askYes(A, p, 'บ่าวจุ้ย: เปลี่ยน "อาวุธนคร" เพื่อกลับมาสภาพตื่น?', 2) == null) return; a.onceTurn = A.state.turn;
      const v = await A.choose(p, 'เนรเทศ "อาวุธนคร" ที่สวมใส่', ws.map(m => A.cardOpt(m, 0))); const w = ws.find(x => x.uid === v) || ws[0];
      w.attachedTo = null; A.exile(p, fromMZ(A, w.owner), w);
      const c = await A.pickFrom(p, A.dark(p), x => A_named(x, CITYW) && x.name !== w.card.name && !A.attached(a).some(m => m.card.name === x.name), 'นำ "อาวุธนคร" จากมิติมืดมาสวมใส่');
      if (c) await A.attach(p, A.takeFrom(A.dark(p), c), a);
      A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`);
    },
  };
  E['BT11-005'] = { onSummon: async (A, p) => { if (!hasCity(A, p)) return; const c = await A.pickFrom(p, A.deck(p), x => A_named(x, CITYW), 'เนรเทศ "อาวุธนคร" จาก Deck ไปมิติมืด', true); if (c) A.exile(p, A.deck(p), c); A.shuffleDeck(p); } }; // ชานน
  E['BT11-006'] = { // มือปืนนคร นายหัว
    onSummon: async (A, p) => {
      if (hasCity(A, p) || A.constructs(p).length >= 3) return;
      const c = await A.pickFrom(p, A.deck(p).concat(A.hell(p)), x => x.name === CITY, 'ก่อสร้าง นครทิเนนทอล', true); if (!c) return;
      const fromDeck = A.deck(p).includes(c); A.constructs(p).push(A.takeFrom(fromDeck ? A.deck(p) : A.hell(p), c)); c.owner = p; A.log(`ก่อสร้าง "${c.card.name}"`); if (fromDeck) A.shuffleDeck(p);
    },
    activateLabel: 'เนรเทศ "อาวุธนคร" จากมือ: จั่ว 2 ใบ', canActivate: (A, p) => hasCity(A, p) && A.hand(p).some(h => A_named(h.card, CITYW)),
    activate: async (A, p) => { const c = await A.pickFrom(p, A.hand(p), x => A_named(x, CITYW), 'เนรเทศ "อาวุธนคร" จากมือ'); if (!c) return; A.exile(p, A.hand(p), c); A.draw(p, 2); },
  };
  E['BT11-007'] = { // กิมมิคแมน
    onSummon: async (A, p) => {
      const d = A.deck(p); const seen = d.splice(0, Math.min(3, d.length)); if (!seen.length) return;
      const c = seen[A.rand(seen.length)]; A.log(`อีกฝ่ายสุ่มเลือก "${c.card.name}"`); seen.splice(seen.indexOf(c), 1);
      A.toHand(p, c); d.push(...seen); A.shuffleDeck(p);
    },
  };
  E['BT11-008'] = { // ออส่วนบอย
    onAllyDestroyedField: async (A, p, src, a) => { if (A.named(a.card, 'กิมมิคแมน') && A.state.active !== p && !src.base6) { src.base6 = true; A.log(`${src.card.name}: POWER ตั้งต้นเป็น 6`); } },
    onEnter: async (A, p, self) => { self.base6 = false; },
    setPower: (A, p, a) => (a.base6 ? 6 : (a.card.power || 0)),
    shieldAllies: (A, src, x) => !!A.linked(src) && A.avatars(src.owner).some(g => A.named(g.card, 'กิมมิคแมน')) && !A.named(x.card, 'กิมมิคแมน'),
  };
  E['BT11-009'] = { // นักฆ่าแม่เหล็ก มอนซี
    activateLabel: 'ทิ้ง Avatar {หุ่นยนต์}: Avatar อีกฝ่าย POWER -4', canActivate: (A, p) => A.hand(p).some(h => isAvatar(h.card) && h.card.symbol === 'หุ่นยนต์') && A.avatars(A.opp(p)).length > 0,
    activate: async (A, p) => { const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && x.symbol === 'หุ่นยนต์', 'ทิ้ง Avatar {หุ่นยนต์}'); if (!c) return; A.hell(p).push(A.takeFrom(A.hand(p), c)); const d = await pickAv(A, p, A.avatars(A.opp(p)), 'Avatar อีกฝ่าย POWER -4'); if (d) A.addPower(d, -4, 'endTurn'); },
    preventDestroy: async (A, p, a) => { if (A.state.inBattle && A.avatars(p).some(x => x !== a && A.isSym(x, 'หุ่นยนต์') && x.card.name !== a.card.name)) { A.log(`${a.card.name} ไม่ถูกทำลายจากการต่อสู้`); return true; } return false; },
  };
  E['BT11-010'] = Object.assign(ninjaSwap(1, 'นำ "นินจา" กลับขึ้นมือ: อัญเชิญใบนี้', async (A, p, h) => { A.addPower(h, 3, 'forever'); h.fuma = A.state.turn; }), { // ฟูมะ
    endPhase: async (A, p, a) => { if (!a.fuma) return; a.fuma = 0; A.banishAvatar(a); A.returnFromDarkOnMain(p, a); },
  });
  E['BT11-011'] = { // มิสทรอม่า
    onSummon: async (A, p) => {
      const o = A.opp(p);
      if (A.state.land && A.state.land.owner === o) A.destroyMagic(A.state.land);
      const c = await A.pickFrom(p, A.deck(p), x => x.name === 'ดินแดนยุติธรรม', 'ใช้ "ดินแดนยุติธรรม" จาก Deck', true); if (c) await A.placeLand(p, A.takeFrom(A.deck(p), c)); A.shuffleDeck(p);
      A.state.players[o].noLandUntil = A.state.turn + 1; A.log(`${A.state.players[o].name} ใช้ Land Magic ไม่ได้จนจบเทิร์นถัดไป`);
    },
    continuousSelf: (A, p) => { const ls = A.avatars(p).filter(x => A.linked(x)); if (!ls.length) return 0; return ls.some(x => A.named(x.card, 'เพมมุ') && A.named(A.linked(x).card, 'สไปรท์')) ? 2 : 1; },
  };
  E['BT11-012'] = { onSummon: async (A, p, self) => { const x = await pickAv(A, p, A.avatars(p).filter(a => A.named(a.card, 'กบ') && A.isSym(a, 'สัตว์')), 'เลือก "กบ" POWER +1 สามครั้ง', null, true); if (x) for (let k = 0; k < 3; k++) A.addPower(x, 1, 'forever'); void self; } }; // น้ากบ
  E['BT11-013'] = { continuousSelf: (A, p) => (saiyuOn(A, p, SAIYU[0]) ? 2 : 0) + saiyuPower(A, p) }; // ซุนหงอคง
  E['BT11-014'] = { onSummon: async (A, p) => { await lookTopBottom(A, p, 3, [{ pred: c => !c.onlyOne && (isXVI(c) || (c.type === 'magic' && c.symbol === 'ทหาร')), title: 'นำ "หน่วยรบ XVI" หรือ Magic {ทหาร} ขึ้นมือ' }], async c => A.toHand(p, c)); }, aura: xviAura, continuousSelf: () => 1 }; // มิเรีย
  E['BT11-015'] = { onSummon: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), x => x.type === 'magic' && x.symbol === 'ทหาร', 'นำ Magic {ทหาร} จากนรกขึ้นมือ', true); if (c) A.toHand(p, A.takeFrom(A.hell(p), c)); }, aura: xviAura, continuousSelf: () => 1 }; // ฮินะ
  E['BT11-016'] = { // คาร์ร่า
    activateLabel: 'สอดแนม 3: อัญเชิญ "หน่วยรบ XVI"', canActivate: (A, p) => A.deck(p).length > 3 && A.roomFor(p), activate: async (A, p) => xviLook('hell', true)(A, p),
    kwAura: (A, src, a) => (A.state.active !== src.owner && A.named(a.card, XVI) ? ['โล่มนุษย์'] : []),
    condKw: (A, a) => (A.state.active !== a.owner ? ['โล่มนุษย์'] : []),
  };
  E['BT11-017'] = { onAttack: async (A, p) => { if (A.deck(p).length > 3) await xviLook('hell', false)(A, p); }, aura: xviAura, continuousSelf: () => 1 }; // เอริ
  E['BT11-018'] = { onAttack: async (A, p, a) => { const n = A.avatars(p).filter(x => A.named(x.card, NUT) || A.named(x.card, SIRNUT)).length + fromMZ(A, p).filter(m => isAvatar(m.card) && (A_named(m.card, NUT) || A_named(m.card, SIRNUT))).length; if (n) A.addPower(a, n, 'endTurn'); } }; // ชาช่า
  E['BT11-019'] = { // มีมมิ นักเรียนดีเด่น
    hellActivateLabel: 'สวมใส่ให้ "ไอ้นัท"/"เซอร์นัท" (นับเป็น Modification Magic)',
    canHellActivate: (A, p) => !A.magicUsed(p, 'modification') && A.avatars(p).some(nutHost),
    hellActivate: async (A, p, h) => { const t = await pickAv(A, p, A.avatars(p).filter(nutHost), 'สวมใส่ มีมมิ ให้ใบไหน'); if (!t) return; A.markMagicUsed(p, 'modification'); await A.attach(p, A.takeFrom(A.hell(p), h), t); },
    onHostBattle: async (A, p, m, x, y) => {
      if (y.card.color === 'purple') return; const orig = y.card; y.origCard = y.origCard || y.card; y.card = Object.assign({}, y.card, { color: 'purple' }); A.log(`${y.card.name} กลายเป็นสีม่วงจนจบการต่อสู้`);
      A.atEndOfTurn(() => { if (y.card !== orig && y.origCard === orig) { y.card = orig; delete y.origCard; } });
    },
  };
  E['BT11-020'] = Object.assign({}, virusBase, { // บลาสเตอร์
    lastWill: async (A, p, self) => {
      const k = await virusMill(A, p, 2, self); if (k < 3) return; const used = [];
      for (let i = 0; i < 2 && A.roomFor(p); i++) { const c = await A.pickFrom(p, A.dark(p), x => isVirus(x) && !used.includes(x.name), `อัญเชิญ "ไวรัส" จากมิติมืด (${i + 1}/2)`, true); if (!c) break; used.push(c.card.name); await A.summonFrom(p, A.dark(p), c, { jutti: false }); }
    },
  });
  E['BT11-021'] = Object.assign({}, virusBase, { // โทรจัน
    onEnter: async (A, p, self) => {
      const k = await virusMill(A, p, 3, self); if (k < 4 || !A.onField(self)) return;
      const d = await pickAv(A, p, A.avatars(A.opp(p)), 'Avatar อีกฝ่าย POWER -2', null, true); if (d) A.addPower(d, -2, 'endTurn');
      const x = await pickAv(A, p, A.avatars(p).filter(y => A.named(y.card, VIRUS)), '"ไวรัส" POWER +2', null, true); if (x) A.addPower(x, 2, 'endTurn');
    },
  });
  E['BT11-022'] = Object.assign({}, virusBase, { // ครีปเปอร์
    onAttack: async (A, p, a) => {
      if (a.onceTurn === A.state.turn) return; a.onceTurn = A.state.turn;
      const k = await virusMill(A, p, 3, a); if (k < 4) return;
      const d = await pickAv(A, p, A.avatars(A.opp(p)), 'Avatar อีกฝ่ายเสียความสามารถและ POWER ตั้งต้นเป็น 0', null, true);
      if (d) { d.lostAbilities = true; d.baseZeroTurn = A.state.turn; A.log(`${d.card.name} เสียความสามารถทั้งหมด POWER ตั้งต้นเป็น 0`); }
    },
  });
  E['BT11-023'] = { // ตัวอะไรสักอย่างที่สุดเท่และเป็นนักดาบ
    activateLabel: 'POWER + ครึ่งหนึ่งของ "ตัวอะไรสักอย่าง" อีกใบ', canActivate: (A, p, a) => A.avatars(p).some(x => x !== a && A.named(x.card, 'ตัวอะไรสักอย่าง')),
    activate: async (A, p, a) => { const x = await pickAv(A, p, A.avatars(p).filter(y => y !== a && A.named(y.card, 'ตัวอะไรสักอย่าง')), 'เลือก "ตัวอะไรสักอย่าง"', y => y.card.power || 0); if (x) A.addPower(a, Math.floor((x.card.power || 0) / 2), 'endTurn'); },
  };
  E['BT11-024'] = { // เพนกวิ้น ฮัท
    handCounter: {
      on: ['attack'], label: 'เพนกวิ้น ฮัท: "ขอเทิร์นนึง" ยกเลิกการโจมตีและจบเทิร์นอีกฝ่าย', botScore: () => 9,
      when: (A, p, h, ctx) => ctx.target && ctx.target.kind === 'life' && A.state.players[p].life.every(l => l.faceUp),
      run: async (A, p, h) => { A.log('"ขอเทิร์นนึง"'); A.exile(p, A.hand(p), h); return { cancelAttack: true, endTurn: true }; },
    },
  };
  E['BT11-025'] = { // ซัวเจ๋ง
    continuousSelf: (A, p) => saiyuPower(A, p),
    hellActivateLabel: 'ทิ้ง 1 ใบ: อัญเชิญใบนี้จากนรก',
    canHellActivate: (A, p, h) => SAIYU.slice(0, 3).filter(n => saiyuOn(A, p, n)).length >= 2 && A.hand(p).length > 0 && A.roomFor(p, h.card),
    hellActivate: async (A, p, h) => { await A.discard(p, 1); if (A.hell(p).includes(h)) await A.summonFrom(p, A.hell(p), h, { jutti: false }); },
  };
  E['BT11-026'] = { // ลุกซุเรีย โปรดิวเซอร์ปีศาจ
    handActivateLabel: 'ส่ง "โอตะ" บนสนามลงนรก: อัญเชิญใบนี้',
    canHandActivate: (A, p, h) => A.roomFor(p, h.card) && (A.avatars(0).concat(A.avatars(1)).some(x => A.named(x.card, OTA)) || fromMZ(A, 0).concat(fromMZ(A, 1)).some(m => A_named(m.card, OTA))),
    handActivate: async (A, p, h) => { const n = await sendOta(A, p, 3); if (!n) return; if (await A.summonFrom(p, A.hand(p), h, { jutti: false }) && A.onField(h)) A.addPower(h, n, 'forever'); },
    activateLabel: 'ส่ง "โอตะ" ลงนรก: POWER +2', canActivate: (A, p, a) => A.avatars(0).concat(A.avatars(1)).some(x => x !== a && A.named(x.card, OTA)) || fromMZ(A, 0).concat(fromMZ(A, 1)).some(m => A_named(m.card, OTA)),
    activate: async (A, p, a) => { if (await sendOta(A, p, 1) && A.onField(a)) A.addPower(a, 2, 'endTurn'); },
    onAttack: async (A, p, a) => { if (a.onceTurn === A.state.turn) return; const c = await A.pickFrom(p, A.hell(p), x => A_named(x, OTA), 'นำ "โอตะ" จากนรกมาสวมใส่', true); if (!c) return; a.onceTurn = A.state.turn; await A.attach(p, A.takeFrom(A.hell(p), c), a); },
  };
  E['BT11-027'] = { // เจ้าแห่งความมืด
    handActivateLabel: 'ส่ง Avatar อีกฝ่ายลงนรก: อัญเชิญใบนี้',
    canHandActivate: (A, p, h) => A.avatars(A.opp(p)).length >= 4 && A.roomFor(p, h.card),
    handActivate: async (A, p, h) => { const d = await pickAv(A, p, A.avatars(A.opp(p)), 'ส่ง Avatar อีกฝ่ายลงนรก', x => A.power(x) + (x.card.cost || 0)); if (d) A.sendToHell(d); await A.summonFrom(p, A.hand(p), h, { jutti: false }); },
    onEnter: async (A, p, self) => { self.darkHalf = 0; },
    setPower: (A, p, a) => Math.floor((a.card.power || 0) / Math.pow(2, a.darkHalf || 0)),
    endPhase: async (A, p, a) => { a.darkHalf = (a.darkHalf || 0) + 1; A.log(`${a.card.name}: POWER ตั้งต้นลดลงครึ่งหนึ่ง`); },
  };
  const summonSmc = async (A, p) => { if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A.named(x, SMC) && !A.avatars(p).some(a => a.card.name === x.name && (E[x.id] || {}).uniqueOnField), 'อัญเชิญ "สมาชม" จาก Deck', true); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p); };
  E['BT11-028'] = { // YaiMakMak
    uniqueOnField: true, onSummon: summonSmc,
    activateLabel: 'ทำลาย Avatar อีกฝ่าย Cost ≤4 ตามจำนวน "สมาชม"', canActivate: (A, p) => smcCount(A, p) >= 2 && A.avatars(A.opp(p)).some(x => A.cost(x) <= 4),
    activate: async (A, p, a) => {
      const n = A.avatars(p).filter(x => x !== a && A.named(x.card, SMC)).length;
      for (let i = 0; i < n; i++) { const lim = 4 - i; const d = await pickAv(A, p, A.avatars(A.opp(p)).filter(x => A.cost(x) <= lim), `ทำลาย Avatar อีกฝ่าย Cost ≤${lim}`, x => A.power(x) + A.cost(x), true); if (!d) break; await A.destroy(d, 'YaiMakMak', p); }
    },
  };
  E['BT11-029'] = { // แอชลีย์
    uniqueOnField: true,
    activateLabel: 'ทิ้ง 1 ใบ: อัญเชิญ Avatar จากนรกอีกฝ่าย (อีกฝ่ายเลือก)', canActivate: (A, p) => smcCount(A, p) >= 2 && A.hand(p).length > 0 && A.roomFor(p) && A.hell(A.opp(p)).some(c => isAvatar(c.card)),
    activate: async (A, p) => {
      await A.discard(p, 1); const o = A.opp(p); const xs = A.hell(o).filter(c => isAvatar(c.card)); if (!xs.length) return;
      const v = await A.choose(o, 'เลือก Avatar ในนรกของคุณ ให้อีกฝ่ายอัญเชิญ', xs.map(c => A.cardOpt(c, -(c.card.power || 0)))); const c = xs.find(x => x.uid === v) || xs[0];
      if (!await A.summonFrom(p, A.hell(o), c, { jutti: false }) || !A.onField(c)) return;
      c.trueOwner = o; c.lostAbilities = true; c.silenceUntil = A.state.turn + 1; A.log(`${c.card.name} เปลี่ยนความสามารถเป็น "End Phase: ส่งลงนรก"`);
      A.atEndOfTurn(async () => { if (A.onField(c)) A.sendToHell(c); });
    },
  };
  E['BT11-030'] = { // น้าแมน
    uniqueOnField: true,
    activateLabel: 'เปลี่ยนสภาพ Avatar เรา 1 ใบ และอีกฝ่าย 1 ใบ', canActivate: (A, p) => smcCount(A, p) >= 2 && A.avatars(A.opp(p)).length > 0,
    activate: async (A, p) => {
      const mine = await pickAv(A, p, A.avatars(p), 'เลือก Avatar เรา (เปลี่ยนสภาพ)', x => (x.rested ? 3 : -1)); const theirs = await pickAv(A, p, A.avatars(A.opp(p)), 'เลือก Avatar อีกฝ่าย (เปลี่ยนสภาพ)', x => (x.rested ? -1 : A.power(x)));
      for (const x of [mine, theirs]) if (x) { x.rested = !x.rested; A.log(`${x.card.name} เปลี่ยนเป็นสภาพ${x.rested ? 'นอน' : 'ตื่น'}`); }
    },
  };
  E['BT11-031'] = { // คุณคำดี
    uniqueOnField: true, onSummon: summonSmc,
    onAttack: async (A, p, a) => { if (smcCount(A, p) < 2) return; const n = Math.floor(A.hell(p).filter(c => isAvatar(c.card)).length / 2); if (n) A.addPower(a, n, 'endTurn'); },
    aura: (A, p, src, a) => (a.owner === p ? -1 : 0), continuousSelf: () => -1,
  };
  E['BT11-032'] = { // ไมค์ตี้ทอยแมน
    onSummon: async (A, p) => {
      const eq = A.fieldMagic().filter(m => m.attachedTo);
      const v = await A.choose(p, 'ไมค์ตี้ทอยแมน: เลือกปฏิบัติ', [eq.length ? { label: 'ทำลายการ์ดที่สวมใส่อยู่ 1 ใบ', value: 1, score: eq.some(m => m.owner !== p) ? 2 : -1 } : null, { label: 'สอดแนม 5: นำ Modification Magic ขึ้นมือ', value: 2, score: 1 }].filter(Boolean));
      if (v === 1) { const u = await A.choose(p, 'ทำลายการ์ดที่สวมใส่อยู่', eq.map(m => A.cardOpt(m, m.owner === p ? -2 : 2))); const w = eq.find(m => m.uid === u); if (w) A.destroyMagic(w); }
      else await lookTopBottom(A, p, 5, [{ pred: c => c.type === 'magic' && c.magicType === 'modification', title: 'นำ Modification Magic ขึ้นมือ' }], async c => A.toHand(p, c));
    },
  };
  E['BT11-033'] = { onSummon: async (A, p) => { await lookTop(A, p, 5, c => isAvatar(c) && (A_named(c, NUT) || A_named(c, SIRNUT) || A_named(c, TKNIGHT)), 'นำ "ไอ้นัท"/"เซอร์นัท"/"อัศวินตลิ่งชัน" ขึ้นมือ', async c => A.toHand(p, c)); } }; // เลอร์ติ๊ก
  E['BT11-034'] = { lastWill: async (A, p) => { if (!A.roomFor(p)) return; await lookTop(A, p, 7, c => c.name === 'ยูนิคอร์นขี้เมา', 'อัญเชิญ ยูนิคอร์นขี้เมา', async c => A.summonFrom(p, [], c, { jutti: false })); } }; // ยูนิคอร์นขี้เมา
  E['BT11-035'] = { // ตือโป๊ยก่าย
    continuousSelf: (A, p) => saiyuPower(A, p),
    onAnyMagic: async (A, q, a) => { if (A.state.active !== q || a.onceTurn === A.state.turn) return; a.onceTurn = A.state.turn; A.avatars(q).filter(x => SAIYU.includes(x.card.name)).forEach(x => A.addPower(x, 1, 'myNextTurn')); },
  };
  const FOREST = 'ป่าพงไพร เผ่าพงศ์พันธุ์';
  E['BT11-036'] = { // ภูติผลไม้ แตงกวา
    continuousSelf: (A, p) => (A.state.land && A.state.land.card.name === FOREST ? A.dark(p).filter(c => A_named(c.card, FRUIT)).length : 0),
    lastWill: async (A, p) => { if (!A.state.land || A.state.land.card.name !== FOREST) return; const c = await A.pickFrom(p, A.dark(p), x => A_named(x, FRUIT), 'นำ "ภูติผลไม้" จากมิติมืดกลับเข้า Deck', true); if (c) { A.deck(p).push(A.takeFrom(A.dark(p), c)); A.shuffleDeck(p); } },
  };
  E['BT11-037'] = { // มนุษย์เครื่องใช้ไฟฟ้า เบเซอร์
    onSummon: async (A, p) => { const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, APPL) && x.id !== 'BT11-037', 'นำ "เครื่องใช้ไฟฟ้า" จาก Deck ไปวางที่ Magic Zone', true); if (c) parkAppliance(A, p, c); A.shuffleDeck(p); },
    activateLabel: 'นำ "เครื่องใช้ไฟฟ้า" จากมือไปวาง Magic Zone แล้วจั่ว 1', canActivate: (A, p) => A.hand(p).some(h => isAvatar(h.card) && A_named(h.card, APPL)),
    activate: async (A, p) => { const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && A_named(x, APPL), 'นำ "เครื่องใช้ไฟฟ้า" ไปวาง Magic Zone'); if (!c) return; parkAppliance(A, p, c); A.draw(p, 1); },
    lastWill: applianceLastWill,
  };
  E['BT11-038'] = { lastWill: applianceLastWill }; // เครื่องใช้ไฟฟ้า เฟเธอร์
  E['BT11-038p'] = applianceFromMZ('BT11-038');
  E['BT11-039'] = { lastWill: applianceLastWill }; // เครื่องใช้ไฟฟ้า ฟรีซเซอร์
  E['BT11-039p'] = applianceFromMZ('BT11-039');
  E['BT11-040'] = { // เบเซอร์ โหมด เฟเธอร์
    handActivateLabel: 'นำ เบเซอร์ + เฟเธอร์ ใน Magic Zone กลับเข้า Deck: อัญเชิญใบนี้',
    canHandActivate: (A, p, h) => A.roomFor(p, h.card) && !!modeParts(A, p, 'เครื่องใช้ไฟฟ้า เฟเธอร์'),
    handActivate: async (A, p, h) => { if (await modeSwap(A, p, h, 'เครื่องใช้ไฟฟ้า เฟเธอร์') && A.onField(h)) { h.featherMode = true; A.grantKwUntil(h, 'ลูกฮึด', 99999); } },
    onEnter: async (A, p, self) => { if (self.summonedBy !== self.card.id) { self.featherMode = false; self.kwUntil = []; } },
    onAttack: async (A, p, a, tgt) => { if (!a.featherMode || !tgt || tgt.kind !== 'avatar') return; const d = A.avatars(A.opp(p)).find(x => x.uid === tgt.uid); if (d && A.power(d) - A.power(a) >= 3) A.addPower(a, 5, 'endTurn'); },
  };
  E['BT11-041'] = { // เบเซอร์ โหมด ฟรีซเซอร์
    handCounter: {
      on: ['battleStart'], label: 'เบเซอร์ โหมด ฟรีซเซอร์: อัญเชิญใบนี้', botScore: () => 3,
      when: (A, p, h) => A.roomFor(p, h.card) && !!modeParts(A, p, 'เครื่องใช้ไฟฟ้า ฟรีซเซอร์'),
      run: async (A, p, h) => { if (await modeSwap(A, p, h, 'เครื่องใช้ไฟฟ้า ฟรีซเซอร์') && A.onField(h)) { h.freezeMode = true; A.grantKwUntil(h, 'โล่มนุษย์', 99999); } },
    },
    onEnter: async (A, p, self) => { if (self.summonedBy !== self.card.id) { self.freezeMode = false; self.kwUntil = []; } },
    shieldAllies: (A, src, x) => !!src.freezeMode && src.rested && x !== src && x.card.name !== src.card.name,
  };
  const isGiant = (A, x) => A.isSym(x, 'ยักษ์');
  E['BT11-042'] = { // อาเมอร์ ทศกัณท์
    onSummon: async (A, p) => { if (!A.roomFor(p)) return; await lookTop(A, p, 5, c => isAvatar(c) && ((c.symbol === 'ยักษ์' && c.power === 3) || A_named(c, 'ทศกัณฐ์')), 'อัญเชิญ {ยักษ์} POWER 3 หรือ "ทศกัณฐ์"', async c => A.summonFrom(p, [], c, { jutti: false })); },
    continuousSelf: (A, p, a) => (A.avatars(p).some(x => x !== a && (isGiant(A, x) || A.named(x.card, 'มณโฑ'))) ? 2 : -2),
  };
  E['BT11-043'] = { // พิเภก
    activateLabel: 'นำ {ยักษ์} POWER 3 จากนรกเข้า Deck: จั่ว 1', canActivate: (A, p) => A.hell(p).some(c => isAvatar(c.card) && c.card.symbol === 'ยักษ์' && c.card.power === 3),
    activate: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && x.symbol === 'ยักษ์' && x.power === 3, 'นำ {ยักษ์} POWER 3 กลับเข้า Deck'); if (!c) return; A.deck(p).push(A.takeFrom(A.hell(p), c)); A.shuffleDeck(p); A.draw(p, 1); },
  };
  E['BT11-044'] = { protectConstructs: true }; // มาดามทาบิ
  E['BT11-045'] = { colorlessGem: pc => isAvatar(pc) && A_named(pc, BANK) }; // โคลัมแบงค์
  E['BT11-046'] = { // ดยุกแห่งภาคีมะม่วง
    onSummon: async (A, p) => { const lim = 2 + mangoInMZ(A, p).length; const d = await pickAv(A, p, A.avatars(A.opp(p)).filter(x => A.cost(x) <= lim), `ทำลาย Avatar อีกฝ่าย Cost ≤${lim}`, x => A.power(x) + A.cost(x), true); if (d) await A.destroy(d, 'ดยุกแห่งภาคีมะม่วง', p); },
    lastWill: mangoLastWill,
  };
  E['BT11-047'] = { // พระถังซัมจั๋ง
    continuousSelf: (A, p) => saiyuPower(A, p),
    untargetable: (A, x) => A.avatars(x.owner).some(y => y.card.name === SAIYU[1] && !y.lostAbilities),
    onSummon: async (A, p) => {
      if (!A.roomFor(p) || !A.deck(p).some(c => SAIYU.slice(1).includes(c.card.name))) return;
      const c0 = await A.pickFrom(p, A.hand(p), isAvatar, 'ทิ้ง Avatar 1 ใบ เพื่ออัญเชิญ ซุนหงอคง/ตือโป๊ยก่าย/ซัวเจ๋ง', true); if (!c0) return; A.hell(p).push(A.takeFrom(A.hand(p), c0));
      const c = await A.pickFrom(p, A.deck(p), x => SAIYU.slice(1).includes(x.name), 'อัญเชิญ ซุนหงอคง/ตือโป๊ยก่าย/ซัวเจ๋ง จาก Deck'); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p);
    },
    activateLabel: 'นำ พระไตรปิฎก จาก Deck/นรก ขึ้นมือ', canActivate: (A, p) => SAIYU.slice(1).every(n => saiyuOn(A, p, n)) && A.deck(p).concat(A.hell(p)).some(c => c.card.name === SUTRA),
    activate: async (A, p) => { const c = await A.pickFrom(p, A.deck(p).concat(A.hell(p)), x => x.name === SUTRA, 'นำ พระไตรปิฎก ขึ้นมือ'); if (!c) return; const fromDeck = A.deck(p).includes(c); A.toHand(p, A.takeFrom(fromDeck ? A.deck(p) : A.hell(p), c)); if (fromDeck) A.shuffleDeck(p); },
    mainStart: async (A, p) => { if (sutras(A, p) >= 3 && SAIYU.every(n => saiyuOn(A, p, n))) A.win(p, 'พระไตรปิฎก 3 ใบ และคณะเดินทางครบ 4'); },
  };
  E['BT11-048'] = { // นักท่องเรื่องราว มายา
    activateLabel: 'แสดง "เรื่องราว" Cost 6 จากมือ: เนรเทศใบนี้แล้วอัญเชิญใบนั้น', canActivate: (A, p) => A.hand(p).some(h => isAvatar(h.card) && A_named(h.card, 'เรื่องราว') && h.card.cost === 6),
    activate: async (A, p, a) => {
      const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && A_named(x, 'เรื่องราว') && x.cost === 6, 'แสดง "เรื่องราว" Cost 6'); if (!c) return; A.log(`แสดง "${c.card.name}"`);
      A.banishAvatar(a); if (await A.summonFrom(p, A.hand(p), c, { jutti: false, by: 'BT11-048' }) && A.onField(c)) A.addPower(c, 1, 'forever');
    },
  };
  E['BT11-049'] = { // มายา เรื่องราว เทพเจ้าสายฟ้า
    onEnter: async (A, p, self) => { self.storyMode = byNamed(A, self, 'นักท่องเรื่องราว'); if (self.storyMode) await tutor(c => c.type === 'magic' && A_named(c, 'Skill'), 'นำ Magic "Skill" ขึ้นมือ')(A, p); },
    onAnyMagic: async (A, q, a) => { if (!a.storyMode || A.state.active !== q || a.onceTurn === A.state.turn) return; a.onceTurn = A.state.turn; A.addPower(a, 1, 'forever'); },
  };
  E['BT11-052'] = { magic: async (A, p) => { if (A.deck(p).length > 3) await xviLook('bottom', true)(A, p); } }; // โอเปอเรชั่น : สเกาท์
  E['BT11-053'] = { // โอเปอเรชั่น : รอยัล
    canUse: (A, p) => A.avatars(p).filter(x => A.named(x.card, XVI) && !x.rested).length >= 2 && A.avatars(A.opp(p)).length > 0,
    magic: async (A, p) => {
      for (let k = 0; k < 2; k++) { const x = await pickAv(A, p, A.avatars(p).filter(y => A.named(y.card, XVI) && !y.rested), `เปลี่ยน "หน่วยรบ XVI" เป็นสภาพนอน (${k + 1}/2)`, y => -A.power(y)); if (x) A.rest(x); }
      const d = await pickAv(A, p, A.avatars(A.opp(p)), 'ทำลาย Avatar อีกฝ่าย', x => A.power(x) + (x.card.cost || 0)); if (d) await A.destroy(d, 'โอเปอเรชั่น : รอยัล', p);
    },
  };
  const TCEngine_named = (c, w) => (c.name || '').includes(w) || (c.alsoNamed || []).some(n => n.includes(w));
  const smcNames = zone => new Set(zone.filter(c => isAvatar(c.card) && TCEngine_named(c.card, SMC)).map(c => c.card.name));
  E['BT11-054'] = { // แยกกันไปแตก
    canUse: (A, p) => smcNames(A.avatars(p)).size >= 4 && smcNames(A.hell(p)).size >= 4,
    magic: async (A, p) => {
      const used = []; for (let k = 0; k < 4; k++) { const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A.named(x, SMC) && !used.includes(x.name), `เนรเทศ "สมาชม" ในนรก (${k + 1}/4)`); if (!c) return; used.push(c.card.name); A.exile(p, A.hell(p), c); }
      const o = A.opp(p); const v = await A.choose(p, 'แยกกันไปแตก: เลือกปฏิบัติ', [{ label: 'อีกฝ่ายทิ้งการ์ดบนมือทั้งหมด', value: 1, score: A.hand(o).length }, { label: 'ทำลาย Avatar อีกฝ่ายทั้งหมด', value: 2, score: A.avatars(o).length * 2 }]);
      if (v === 1) { const n = A.hand(o).length; A.hell(o).push(...A.hand(o).splice(0)); A.log(`${A.state.players[o].name} ทิ้งการ์ดบนมือ ${n} ใบ`); }
      else for (const d of A.avatars(o).slice()) await A.destroy(d, 'แยกกันไปแตก', p);
    },
  };
  E['BT11-055'] = { // Cross Vaccine
    canUse: (A, p) => A.avatars(p).some(x => A.named(x.card, 'Overdose')),
    magic: async (A, p) => {
      await A.damageLife(p, 1); if (A.state.winner != null) return;
      const x = await pickAv(A, p, A.avatars(p).filter(y => A.named(y.card, 'Overdose')), 'นำ "Overdose" กลับเข้า Deck', y => -A.power(y)); if (!x) return; const name = x.card.name; A.toDeckBottom(x);
      const c = await A.pickFrom(p, A.deck(p), y => isAvatar(y) && A_named(y, 'Overdose') && y.name !== name && !y.onlyOne, 'อัญเชิญ "Overdose" ชื่ออื่นจาก Deck', true);
      if (c && await A.summonFrom(p, A.deck(p), c, { jutti: false }) && A.onField(c)) { A.addPower(c, 2, 'endTurn'); c.magicImmuneUntil = A.state.turn; } A.shuffleDeck(p);
    },
  };
  E['BT11-056'] = { // พระไตรปิฎก
    canUse: (A, p) => saiyuOn(A, p, SAIYU[0]),
    magic: async (A, p, inst) => { A.draw(p, 1); A.park(inst, p); return { stay: true }; },
  };
  E['BT11-057'] = { // สู่โลกอันเปล่งประกาย!
    canUse: (A, p) => A.avatars(p).some(nutHost) && A.roomFor(p),
    magic: async (A, p) => {
      const x = await pickAv(A, p, A.avatars(p).filter(nutHost), 'เลือก "ไอ้นัท"/"เซอร์นัท"', y => A.cost(y)); if (!x) return; const lim = A.cost(x);
      const c = await A.pickFrom(p, A.hell(p), y => isAvatar(y) && A_named(y, TKNIGHT) && (y.cost || 0) <= lim, `อัญเชิญ "อัศวินตลิ่งชัน" Cost ≤${lim} จากนรก`, true); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false });
      if (A.avatars(p).some(y => A.named(y.card, 'ชาช่า') || A.named(y.card, 'มีมมิ')) || fromMZ(A, p).some(m => A_named(m.card, 'ชาช่า') || A_named(m.card, 'มีมมิ'))) A.draw(p, 1);
    },
  };
  E['BT11-058'] = { // ระเบิดความเกลียดชัง
    canUse: A => A.avatars(0).length + A.avatars(1).length >= 10,
    magic: async A => {
      for (const q of [0, 1]) for (const a of A.avatars(q).slice()) A.sendToHell(a);
      for (const q of [0, 1]) for (const m of fromMZ(A, q).slice()) { if (m.parked) A.unparkToHell(m); else A.destroyMagic(m); }
      for (const q of [0, 1]) for (const c of A.constructs(q).slice()) { A.hell(c.owner != null ? c.owner : q).push(A.takeFrom(A.constructs(q), c)); A.log(`${c.card.name} ถูกส่งลงนรก`); }
      if (A.state.land) A.destroyMagic(A.state.land);
    },
  };
  E['BT11-059'] = { // อินสตอล บึ้มทั้งไดรฟ์
    canUse: (A, p) => A.hell(p).filter(c => isVirus(c.card) && !c.card.onlyOne).length >= 2,
    magic: async (A, p) => {
      if (!await exileVirusFromHell(A, p, 2)) return;
      if (A.dark(p).filter(c => isVirus(c.card)).length >= 5 && A.roomFor(p)) { const c = await A.pickFrom(p, A.dark(p), isVirus, 'อัญเชิญ "ไวรัส" จากมิติมืด', true); if (c) await A.summonFrom(p, A.dark(p), c, { jutti: false }); }
    },
  };
  E['BT11-060'] = { // ไฮแจ็ค ไฮรีเทิร์น
    react: {
      on: 'attack', when: (A, p) => A.hell(p).some(c => isVirus(c.card) && !c.card.onlyOne),
      botScore: (A, p, ctx) => (ctx.target.kind === 'life' || A.power(ctx.attacker) >= 3 ? 2 : 0),
      run: async (A, p, ctx) => { if (!await exileVirusFromHell(A, p, 1)) return; const a = ctx.attacker; if (A.onField(a)) { a.baseZeroTurn = A.state.turn; A.log(`${a.card.name} POWER ตั้งต้นเป็น 0`); } },
    },
  };
  E['BT11-061'] = { // ให้ข้าวฉันถ้าคุณเป็นคนดี
    react: {
      on: 'battleStart', when: (A, p) => A.avatars(A.opp(p)).length > 0, botScore: (A, p) => (A.avatars(A.opp(p)).some(x => !x.rested) ? 1 : 0),
      run: async (A, p) => { const d = await pickAv(A, p, A.avatars(A.opp(p)), 'เลือก Avatar อีกฝ่าย: เมื่อโจมตี เราจั่ว 1 ใบ'); if (d) { d.riceTurn = A.state.turn; A.log(`${d.card.name}: เมื่อโจมตี อีกฝ่ายจั่ว 1 ใบ`); } },
    },
  };
  E['BT11-062'] = { // เหตุผลที่ยังหายใจ
    react: {
      on: 'destroyedByOpp', when: (A, p) => A.deathsThisTurn(p) === 2 && A.hell(p).length > 0 && A.avatars(p).length > 0, botScore: () => 2,
      run: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), () => true, 'เนรเทศการ์ดในนรก 1 ใบ'); if (!c) return; A.exile(p, A.hell(p), c); const x = await pickAv(A, p, A.avatars(p), 'Avatar เรา POWER +8'); if (x) A.addPower(x, 8, 'endTurn'); },
    },
  };
  const hasLinkText = c => /\[(Link|คู่หู)/.test((c && c.text) || '');
  E['BT11-063'] = { // ทำไมถึงเอาแต่ดูละครับ ?!
    gemAs: (A, p, pc, target) => (hasLinkText(target) ? 4 : null), anyColorFor: hasLinkText,
    react: {
      on: 'attack', when: (A, p) => A.avatars(p).some(x => A.linked(x)),
      botScore: (A, p, ctx) => { const best = Math.max(...A.avatars(p).filter(x => A.linked(x)).map(x => A.power(x) + 3)); return best > A.power(ctx.attacker) ? 3 : 0; },
      run: async (A, p) => { const x = await pickAv(A, p, A.avatars(p).filter(y => A.linked(y)), 'ย้ายเป้าหมายการโจมตีมาที่ Avatar [Link]'); if (!x) return; A.addPower(x, 3, 'endTurn'); return { retarget: x.uid }; },
    },
  };
  E['BT11-064'] = { // ดาบแห่งแสงอรุณ & นัทคาลิเบอร์
    magic: true, equipOk: (A, a) => nutHost(a),
    equipActivateLabel: 'เซ่นไหว้ "ไอ้นัท" + ทิ้ง 1 ใบ: อัญเชิญ จุติ "เซอร์นัท" จาก Deck',
    canEquipActivate: (A, p, m, h) => A.named(h.card, NUT) && !A.named(h.card, SIRNUT) && A.hand(p).length > 0 && A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, SIRNUT)),
    equipActivate: async (A, p, m, h) => { await A.sacrifice(p, h); await A.discard(p, 1); const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, SIRNUT), 'อัญเชิญ จุติ "เซอร์นัท" จาก Deck'); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: true }); A.shuffleDeck(p); },
    equipAura: (A, h, a) => (A.named(h.card, SIRNUT) && a.owner === h.owner && A.named(a.card, TKNIGHT) ? 1 : 0),
  };
  const oneWeapon = (A, a, name) => !A.attached(a).some(m => m.card.name === name);
  E['BT11-065'] = Object.assign(cityWeapon(1), { equipOk: (A, a) => A.named(a.card, GUN) && oneWeapon(A, a, 'อาวุธนคร ปืนพกงูเห่า'), magic: true, onHostBattle: async (A, p, m, x, y) => { y.noLWTurn = A.state.turn; } }); // ปืนพกงูเห่า
  E['BT11-066'] = Object.assign(cityWeapon(2), { equipOk: (A, a) => A.named(a.card, GUN) && oneWeapon(A, a, 'อาวุธนคร ลูกซองจุ้ย'), magic: true, onEquippedBattleWin: async (A, p, m, a) => { await A.damageLife(A.opp(p), 1); } }); // ลูกซองจุ้ย
  E['BT11-067'] = Object.assign(cityWeapon(0), { equipOk: (A, a) => A.named(a.card, GUN) && oneWeapon(A, a, 'อาวุธนคร ดินสอ 5H'), magic: true, onEquippedAttack: async (A, p) => { A.blockReact(A.opp(p)); A.log('อีกฝ่ายใช้ React Magic ไม่ได้จนจบการต่อสู้'); } }); // ดินสอ 5H
  E['BT11-068'] = { // หนึ่งเดียวเพื่อทุกอย่าง
    magic: true, moveOnDeath: true,
    equipPower: (A, a, m) => 1 + (m.moves || 0),
    onEquip: async (A, p, inst) => { inst.moves = inst.moving ? (inst.moves || 0) + 1 : 0; },
  };
  E['BT11-069'] = { // มัลแวร์โซน
    magic: true, activateLabel: 'เนรเทศ "ไวรัส" ในนรก: อีกฝ่าย ธรณีสูบ 1', canActivate: (A, p) => A.hell(p).some(c => isVirus(c.card) && !c.card.onlyOne),
    activate: async (A, p) => { if (await exileVirusFromHell(A, p, 1)) await A.mill(A.opp(p), 1); },
  };
  E['BT11-070'] = { // มะม่วงดราชิลด์
    magic: true,
    aura: (A, p, land, a) => (a.owner === p && mangoInMZ(A, p).length >= 2 && A.named(a.card, MANGO) && A.isSym(a, 'ต้นไม้') ? 1 : 0),
    activateLabel: 'นำ "มะม่วง" {ต้นไม้} จากนรกไปวาง Magic Zone', canActivate: (A, p) => mangoInMZ(A, p).length >= 4 && A.hell(p).some(c => isMango(c.card)),
    activate: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), isMango, 'นำ "มะม่วง" จากนรกไปวาง Magic Zone'); if (c) parkMango(A, p, c); },
  };
  E['BT11-071'] = { // โรงเรียนฝึกหน่วยรบ
    magic: true,
    onAnyAttack: async (A, p, a) => { if (A.named(a.card, XVI)) A.addPower(a, 1, 'endTurn'); },
    activateLabel: 'ทิ้ง 1 ใบ: นำ "หน่วยรบ XVI" จากนรกไว้ใต้ Deck', canActivate: (A, p) => A.hand(p).length > 0 && A.hell(p).some(c => isXVI(c.card)),
    activate: async (A, p) => { await A.discard(p, 1); const c = await A.pickFrom(p, A.hell(p), isXVI, 'นำ "หน่วยรบ XVI" ไว้ใต้ Deck'); if (c) A.deck(p).push(A.takeFrom(A.hell(p), c)); },
  };
  E['BT11-072'] = { // นครทิเนนทอล
    fxProof: () => true,
    activateLabel: 'นครทิเนนทอล: เนรเทศ / สวมใส่ "อาวุธนคร"',
    canActivate: (A, p) => A.deck(p).length > 5 || (A.dark(p).some(c => A_named(c.card, CITYW)) && !A.magicUsed(p, 'modification') && A.avatars(p).some(x => A.named(x.card, GUN))),
    activate: async (A, p) => {
      const canEquip = A.dark(p).some(c => A_named(c.card, CITYW)) && !A.magicUsed(p, 'modification') && A.avatars(p).some(x => A.named(x.card, GUN));
      const v = await A.choose(p, 'นครทิเนนทอล: เลือกความสามารถ', [{ label: 'สอดแนม 5: เนรเทศ "อาวุธนคร"', value: 1, score: 1 }, canEquip ? { label: 'นำ "อาวุธนคร" จากมิติมืดไปสวมใส่ "มือปืนนคร" (+2)', value: 2, score: 3 } : null].filter(Boolean));
      if (v === 2) {
        const c = await A.pickFrom(p, A.dark(p), x => A_named(x, CITYW), 'เลือก "อาวุธนคร" ในมิติมืด'); if (!c) return;
        const t = await pickAv(A, p, A.avatars(p).filter(x => A.named(x.card, GUN) && oneWeapon(A, x, c.card.name)), `สวมใส่ "${c.card.name}" ให้ใบไหน`); if (!t) return;
        A.markMagicUsed(p, 'modification'); await A.attach(p, A.takeFrom(A.dark(p), c), t); A.addPower(t, 2, 'endTurn');
      } else await lookTop(A, p, 5, c => c.type === 'magic' && A_named(c, CITYW), 'เนรเทศ "อาวุธนคร" ไปมิติมืด', async c => { A.dark(p).push(c); A.log(`"${c.card.name}" ถูกเนรเทศ`); });
    },
  };
  E['BT11-073'] = { controlGuard: true }; // รูปประจำบ้าน
  E['BT11-074'] = { // แป้นสกุล อิเล็กทรอนิกส์
    activateLabel: 'สอดแนม 5: วาง "เครื่องใช้ไฟฟ้า" ที่ Magic Zone', canActivate: (A, p) => A.deck(p).length > 5,
    activate: async (A, p) => { await lookTop(A, p, 5, c => isAvatar(c) && A_named(c, APPL), 'วาง "เครื่องใช้ไฟฟ้า" ที่ Magic Zone', async c => parkAppliance(A, p, c)); },
    untargetableConstruct: (A, x, owner) => { const up = q => A.state.players[q].life.filter(l => l.faceUp).length; return up(owner) > up(A.opp(owner)); },
  };
  E['BT11-075'] = { life: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), x => x.type === 'magic' && x.magicType === 'modification', 'นำ Modification Magic จากนรกขึ้นมือ', true); if (c) A.toHand(p, A.takeFrom(A.hell(p), c)); } }; // อ่อ เปอร์ลา

  // ================= CC01 / CC02 =================
  const TANK = 'รถถัง', RANGER = 'Tank Ranger', SWAMP = 'บึงทมิฬ';
  (root.TC_CARDS || []).forEach(c => { if (c.id === 'CC02-050' && !(c.alsoNamed || []).includes(SWAMP)) c.alsoNamed = (c.alsoNamed || []).concat(SWAMP); });
  const allAvatars = A => A.avatars(0).concat(A.avatars(1));
  const fromAnyHell = (A, pred) => A.hell(0).concat(A.hell(1)).filter(c => pred(c.card, c));
  const hellOf = (A, c) => (A.hell(0).includes(c) ? A.hell(0) : A.hell(1));
  // reveal an Avatar of a color from hand (หมี)
  const revealColor = async (A, p, color) => { const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && x.color === color, `แสดง Avatar สี${{ red: 'แดง', blue: 'ฟ้า', purple: 'ม่วง', green: 'เขียว' }[color]} จากบนมือ`, true); if (c) A.log(`แสดง "${c.card.name}"`); return !!c; };
  // summon any number of Avatars from a pool with a total Cost cap
  const summonUpTo = async (A, p, pool, cap, title, o) => {
    let left = cap; const used = [];
    while (A.roomFor(p)) {
      const cs = pool().filter(c => (c.card.cost || 0) <= left && !used.includes(c));
      const v = await A.choose(p, `${title} (Cost รวมเหลือ ${left})`, cs.map(c => A.cardOpt(c)), true); const c = cs.find(x => x.uid === v); if (!c) break;
      used.push(c); left -= c.card.cost || 0; await A.summonFrom(p, A.hell(0).includes(c) ? A.hell(0) : A.hell(1).includes(c) ? A.hell(1) : A.deck(p), c, o || { jutti: false });
    }
  };

  E['CC01-001'] = { onSummon: async (A, p) => destroyAnyFieldCard(A, p), activateLabel: 'ทำลายการ์ดบนสนาม 1 ใบ', canActivate: A => allAvatars(A).length + A.fieldMagic().length + A.constructs(0).length + A.constructs(1).length > 1, activate: async (A, p) => destroyAnyFieldCard(A, p) }; // พระอิศวร เทพผู้ทำลาย
  E['CC01-003'] = { // พระพรหม เทพผู้สร้าง
    onSummon: async (A, p) => {
      if (new Set(A.hell(p).filter(c => isAvatar(c.card)).map(c => c.card.name)).size < 5) return;
      const d = A.deck(p); const seen = d.splice(0, Math.min(7, d.length)); A.log(`สอดแนม ${seen.length} ใบ`);
      while (A.roomFor(p)) {
        const names = A.avatars(p).map(a => a.card.name);
        const cs = seen.filter(c => isAvatar(c.card) && !names.includes(c.card.name));
        const v = await A.choose(p, 'อัญเชิญ Avatar ชื่อไม่ซ้ำ จากที่สอดแนม', cs.map(c => A.cardOpt(c)), true); const c = cs.find(x => x.uid === v); if (!c) break;
        seen.splice(seen.indexOf(c), 1); await A.summonFrom(p, [], c, { jutti: false });
      }
      d.push(...seen); A.shuffleDeck(p);
    },
  };
  E['CC01-005'] = { continuousSelf: (A, p) => A.state.players[p].life.filter(l => !l.faceUp).length, lastWill: async (A, p) => { A.flipLife(p, 1); } }; // ปื๊ดเปรตกังฟู
  E['CC01-006'] = { // ไตรตัน เจ้าสมุทร
    onSummon: async (A, p) => summonUpTo(A, p, () => A.hell(p).filter(c => isAvatar(c.card) && c.card.symbol === 'ปลา'), 7, 'อัญเชิญ {ปลา} จากนรก'),
    aura: (A, p, src, a) => (a.owner === p && A.isSym(a, 'ปลา') ? 1 : 0),
    kwAura: (A, src, a) => (A.isSym(a, 'ปลา') ? ['สามัคคี'] : []),
  };
  const HERO3 = ['กุ่ย', 'ฮอล', 'นาย'];
  const heroParts = (A, a) => HERO3.every(n => A.attached(a).some(m => A_named(m.card, n)));
  E['CC01-007'] = { // วีรบุรุษสุดซอย
    onSummon: async (A, p, self) => { for (const n of HERO3) { const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, n), `นำ "${n}" จากนรกมาสวมใส่`, true); if (c) await A.attach(p, A.takeFrom(A.hell(p), c), self); } },
    afterAttack: async (A, p, a) => {
      if (!heroParts(A, a)) return; const pool = A.hand(p).concat(A.deck(p)).filter(c => c.card.name === 'วีรบุรุษปากซอย'); if (!pool.length) return;
      if (await askYes(A, p, 'ส่ง วีรบุรุษสุดซอย ลงนรก เพื่ออัญเชิญ วีรบุรุษปากซอย?', 2) == null) return;
      A.sendToHell(a); const c = pool.find(x => A.hand(p).includes(x)) || pool[0]; const z = A.hand(p).includes(c) ? A.hand(p) : A.deck(p);
      await A.summonFrom(p, z, c, { jutti: true }); if (z === A.deck(p)) A.shuffleDeck(p);
    },
  };
  E['CC01-008'] = { onSummon: tutor(c => A_named(c, 'แมลงปอทอด'), 'นำ "แมลงปอทอด" ขึ้นมือ') }; // คนอีสาน ยุคครีเตเชียส
  E['CC01-009'] = { onEnter: async (A, p, self) => { if (!A.everSummoned(p, 'รัททาทุย นางพญา')) return; self.origCard = self.origCard || self.card; self.card = Object.assign({}, self.card, { alsoNamed: (self.card.alsoNamed || []).concat('รัททาทุย นางพญา') }); A.log(`${self.card.name} นับเป็น "รัททาทุย นางพญา"`); } }; // ชู้รักรัททาทุย
  E['CC01-010'] = { onSummon: tutor(c => c.type === 'magic' && A_named(c, 'สมชายห้องเช่า'), 'นำ "สมชายห้องเช่า" ขึ้นมือ') }; // ลุงบุญโชค
  E['CC01-011'] = { // พญายม With The Shotgun
    activateLabel: 'อัญเชิญ "นายนิรยบาล" จากนรก', canActivate: (A, p) => A.roomFor(p) && A.hell(p).some(c => isAvatar(c.card) && (A_named(c.card, NIRAYA) || c.card.symbol === 'นรก')),
    activate: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && (A_named(x, NIRAYA) || x.symbol === 'นรก'), 'อัญเชิญ "นายนิรยบาล" จากนรก'); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); },
  };
  E['CC01-012'] = { lastWill: async (A, p) => { A.draw(p, 2); const c = await A.pickFrom(p, A.hand(p), () => true, 'นำการ์ดบนมือ 1 ใบไว้ใต้ Deck'); if (c) A.deck(p).push(A.takeFrom(A.hand(p), c)); } }; // เฟรนชี่
  E['CC01-013'] = { // เจนนี่ (CC)
    cannotAttack: () => true,
    anyEndPhase: async (A, p, a) => {
      const d = A.dice(); A.log(`เจนนี่ทอยลูกเต๋าได้ ${d}`);
      if (d === 4) { const owner = a.owner; await A.destroy(a, 'เจนนี่ทอยได้ 4'); A.flipLife(owner, 1); } else A.takeControl(a, A.opp(a.owner), false, true);
    },
  };
  E['CC01-015'] = { // HR ผู้รู้ความจริง
    onSummon: async (A, p) => {
      const d = A.deck(p); const seen = d.splice(0, Math.min(2, d.length)); if (!seen.length) return;
      const v = await A.choose(p, 'นำการ์ด 1 ใบขึ้นมือ', seen.map(c => A.cardOpt(c))); const c = seen.find(x => x.uid === v) || seen[0]; A.toHand(p, c); seen.splice(seen.indexOf(c), 1);
      if (seen.length) { const w = await A.choose(p, `"${seen[0].card.name}" ไว้บนสุดหรือล่างสุดของ Deck`, [{ label: 'บนสุด', value: 1, score: A.state.players[p].isBot ? cardValue_(seen[0].card) : 0 }, { label: 'ล่างสุด', value: 2, score: 1 }]); if (w === 1) d.unshift(seen[0]); else d.push(seen[0]); }
    },
  };
  const cardValue_ = c => (isAvatar(c) ? (c.power || 0) / 2 : 1);
  E['CC01-016'] = { onAnySummon: async (A, p, src) => { if (src.onceTurn === A.state.turn) return; src.onceTurn = A.state.turn; A.takeControl(src, A.opp(src.owner), false, true); } }; // แมวนิค
  E['CC01-018'] = { // เสามงคล ทรงจีน
    cannotAttack: () => true,
    onSummon: async (A, p) => { if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, 'ผู้เจริญ'), 'อัญเชิญ "ผู้เจริญ" จาก Deck', true); A.shuffleDeck(p); if (c && await A.summonFrom(p, A.deck(p).includes(c) ? A.deck(p) : [], c, { jutti: false })) A.atEndOfTurn(async () => { if (A.onField(c)) A.bounce(c); }); },
  };
  E['CC01-019'] = { // หมวดเงียบ ทหารรับจ้าง
    activateLabel: 'Avatar อีกฝ่ายเป็นสภาพนอนจนกว่าใบนี้จะออกจากสนาม', canActivate: (A, p) => A.avatars(A.opp(p)).some(x => !x.rested),
    activate: async (A, p, a) => { const d = await pickAv(A, p, A.avatars(A.opp(p)).filter(x => !x.rested), 'เลือก Avatar อีกฝ่ายที่ตื่นอยู่'); if (!d) return; A.rest(d); d.heldBy = a.uid; A.log(`${d.card.name} เป็นสภาพนอนจนกว่า ${a.card.name} จะออกจากสนาม`); },
  };
  E['CC01-020'] = { allSymbols: true }; // ผู้กองอึ่งอ่าง
  E['CC01-033'] = Object.assign(equipSelfTo(TANK, 'สวมใส่ให้ "รถถัง"'), { // จ่ามะนาว Tank Ranger
    onSummon: async (A, p) => { if (A.avatars(p).some(x => A.named(x.card, TANK))) A.unflipLifeRandom(p); },
    guardHost: (A, a) => A.named(a.card, TANK),
  });
  E['CC01-034'] = Object.assign(equipSelfTo(TANK, 'สวมใส่ให้ "รถถัง"'), { // จ่าแดงเดือด Tank Ranger
    equipPower: (A, a) => (A.named(a.card, TANK) ? 1 : 0),
    onEquippedBattleWin: async (A, p, m, a) => { if (!a.rested || await askYes(A, p, `ทำลาย ${m.card.name} เพื่อให้ ${a.card.name} กลับมาสภาพตื่น?`, 2) == null) return; A.destroyMagic(m); A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`); },
  });
  E['CC01-042'] = { // พรของอิศวร
    magic: async (A, p) => {
      const o = A.opp(p);
      const v = await A.choose(p, 'พรของอิศวร: เลือกปฏิบัติ', [{ label: 'จั่วให้มีการ์ดบนมือครบ 5 ใบ', value: 1, score: 5 - A.hand(p).length }, { label: 'ทำลาย Avatar อีกฝ่ายไม่เกิน 2 ใบ', value: 2, score: Math.min(2, A.avatars(o).length) * 2 }, { label: 'นำการ์ดจากนรกขึ้นมือ 2 ใบ', value: 3, score: Math.min(2, A.hell(p).length) * 1.2 }]);
      if (v === 1) { const n = 5 - A.hand(p).length; if (n > 0) A.draw(p, n); }
      if (v === 2) for (let k = 0; k < 2; k++) { const d = await pickAv(A, p, A.avatars(o), `ทำลาย Avatar อีกฝ่าย (${k + 1}/2)`, x => A.power(x) + (x.card.cost || 0), k > 0); if (!d) break; await A.destroy(d, 'พรของอิศวร', p); }
      if (v === 3) for (let k = 0; k < 2; k++) { const c = await A.pickFrom(p, A.hell(p), () => true, `นำการ์ดจากนรกขึ้นมือ (${k + 1}/2)`, k > 0); if (!c) break; A.toHand(p, A.takeFrom(A.hell(p), c)); }
    },
  };
  E['CC01-043'] = { // รู้สึกเหมือนโดนแย่งเมีย
    canUse: A => allAvatars(A).some(a => a.trueOwner != null),
    magic: async A => { for (const a of allAvatars(A).filter(x => x.trueOwner != null)) { const b = A.linked(a); if (b) b.linked = null; a.linked = null; A.takeControl(a, a.trueOwner, false, true); } },
  };
  const tank3 = c => isAvatar(c) && A_named(c, TANK) && c.cost === 3, ranger3 = c => isAvatar(c) && A_named(c, RANGER) && c.cost === 3;
  E['CC01-044'] = { // ซ่อมบำรุงประจำปี
    canUse: (A, p) => !A.avatars(p).length && A.avatars(A.opp(p)).length > 0 && A.hell(p).some(c => tank3(c.card)) && A.hell(p).some(c => ranger3(c.card)),
    magic: async (A, p) => { const t = await A.pickFrom(p, A.hell(p), tank3, 'อัญเชิญ "รถถัง" Cost 3 จากนรก'); const r = await A.pickFrom(p, A.hell(p), ranger3, 'เลือก "Tank Ranger" Cost 3'); if (t && await A.summonFrom(p, A.hell(p), t, { jutti: false }) && r && A.onField(t)) await A.attach(p, A.takeFrom(A.hell(p), r), t); },
  };
  E['CC01-045'] = { // กฎร้าน
    canUse: (A, p) => A.avatars(p).length > 0 && A.avatars(A.opp(p)).length > 0,
    magic: async (A, p) => {
      const o = A.opp(p); const bc = q => { const d = A.deck(q), c = d[d.length - 1]; return c && isAvatar(c.card) ? (c.card.cost || 0) : 0; };
      const mine = bc(p), theirs = bc(o); A.log(`กฎร้าน: Cost ใบล่างสุด ${mine} ต่อ ${theirs}`); if (mine === theirs) return;
      const w = mine > theirs ? p : o, l = A.opp(w);
      const v = await A.choose(w, 'กฎร้าน: เลือกปฏิบัติ', [A.avatars(l).length ? { label: 'ส่ง Avatar อีกฝ่าย 1 ใบลงนรก', value: 1, score: 2 } : null, { label: 'นำ Avatar บนสนาม 1 ใบกลับเข้า Deck เจ้าของ', value: 2, score: 1 }].filter(Boolean));
      if (v === 1) { const d = await pickAv(A, w, A.avatars(l), 'ส่ง Avatar อีกฝ่ายลงนรก', x => A.power(x)); if (d) A.sendToHell(d); }
      else { const d = await pickAv(A, w, allAvatars(A), 'นำ Avatar กลับเข้า Deck เจ้าของ', x => (x.owner === w ? -A.power(x) : A.power(x))); if (d) { const q = d.trueOwner != null ? d.trueOwner : d.owner; A.toDeckBottom(d); A.shuffleDeck(q); } }
    },
  };
  E['CC01-046'] = { react: { on: 'attack', botScore: (A, p, ctx) => (ctx.target.kind === 'avatar' ? 2 : 0), run: async (A, p, ctx) => { const xs = [ctx.attacker].concat(ctx.target.kind === 'avatar' ? A.avatars(p).filter(x => x.uid === ctx.target.uid) : []); const x = await pickAv(A, p, xs.filter(y => A.onField(y)), 'เลือก Avatar ที่กำลังต่อสู้: POWER ตั้งต้นเป็น 0', y => (y.owner === p ? -5 : A.power(y))); if (x) { x.baseZeroTurn = A.state.turn; A.log(`${x.card.name} POWER ตั้งต้นเป็น 0`); } } } }; // ขอให้ทั้งตัวมีแต่---
  E['CC01-047'] = { magic: true, equipPower: 2 }; // ตุ๊กตางูพันคอ
  E['CC01-050'] = { // SD Plaza สายเหนือเก่า
    magic: true, activateLabel: 'SD Plaza: เลือกปฏิบัติ',
    canActivate: (A, p) => A.hand(p).length > 0 || (A.parked(p).some(m => isAvatar(m.card)) && A.roomFor(p)),
    activate: async (A, p) => {
      const pz = A.parked(p).filter(m => isAvatar(m.card));
      const v = await A.choose(p, 'SD Plaza: เลือกปฏิบัติ', [A.hand(p).length ? { label: 'ทิ้ง 1 ใบ: สอดแนม 3 วาง Avatar ที่ Magic Zone', value: 1, score: 1 } : null, pz.length && A.roomFor(p) ? { label: 'อัญเชิญ Avatar จาก Magic Zone', value: 2, score: 2 } : null].filter(Boolean));
      if (v === 1) { await A.discard(p, 1); await lookTopBottom(A, p, 3, [{ pred: isAvatar, title: 'วาง Avatar ที่ Magic Zone' }], async c => A.park(c, p)); }
      if (v === 2) { const m = await A.pickFrom(p, pz, () => true, 'อัญเชิญ Avatar จาก Magic Zone'); if (m) { delete m.grantFx; await A.summonFrom(p, A.state.players[p].magicZone, m, { jutti: false }); } }
    },
  };
  E['CC01-051'] = { // สมชายห้องเช่าพันล้าน
    magic: true, activateLabel: 'ทิ้ง 1 ใบ: อัญเชิญ "เสามงคล" จาก Deck', canActivate: (A, p) => A.hand(p).length > 0 && A.roomFor(p) && A.deck(p).some(c => isAvatar(c.card) && A_named(c.card, POLE)),
    activate: async (A, p) => { await A.discard(p, 1); const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, POLE), 'อัญเชิญ "เสามงคล" จาก Deck'); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p); },
    landMainStart: async (A, p) => { const n = A.avatars(p).filter(a => A.named(a.card, POLE)).length; if (n) A.draw(p, n); },
  };
  E['CC01-053'] = { magic: true, equipKw: ['เตะไข่'] }; // ไม้เกาหลัง
  E['CC01-054'] = { // รถถังลงถนน
    magic: async (A, p) => {
      const o = A.opp(p);
      if (A.roomFor(p)) { const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, TANK) && (x.cost || 0) <= 5, 'อัญเชิญ "รถถัง" Cost ≤5 จาก Deck', true); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p); }
      if (A.roomFor(o)) { const c = await A.pickFrom(o, A.deck(o), x => isAvatar(x) && (x.cost || 0) <= 5, 'อัญเชิญ Avatar Cost ≤5 จาก Deck ของคุณ', true); if (c) await A.summonFrom(o, A.deck(o), c, { jutti: false }); A.shuffleDeck(o); }
    },
  };
  E['CC01-055'] = { magic: true, equipMainStart: async (A, p, m, h) => { const head = A.rand(2) === 0; A.log(`ถาดหลุม: ทอยเหรียญได้${head ? 'หัว' : 'ก้อย'}`); A.addPower(h, head ? 2 : -2, 'endTurn'); } }; // ถาดหลุม
  E['CC02-001'] = { // มหาราชาสีนิล
    onBattle: async (A, p, a) => A.addPower(a, 2, 'endTurn'),
    preventDestroy: async (A, p, a) => {
      const ms = A.attached(a).filter(m => m.card.type === 'magic'); if (!A.state.inBattle || !ms.length) return false;
      if (await askYes(A, p, `ส่ง Modification ที่สวมใส่ทั้งหมดลงนรก เพื่อไม่ให้ ${a.card.name} ถูกทำลาย?`, 2) == null) return false;
      ms.forEach(m => A.destroyMagic(m)); A.log(`${a.card.name} ไม่ถูกทำลาย`); return true;
    },
    lastWill: async (A, p) => A.avatars(p).forEach(x => A.addPower(x, 1, 'forever')),
  };
  E['CC02-002'] = { // บัมเบิ้ลแบงค์
    hellActivateLabel: 'ทิ้ง 1 ใบ: อัญเชิญใบนี้จากนรก', canHellActivate: (A, p, h) => A.hand(p).length > 0 && A.roomFor(p, h.card) && !A.avatars(p).some(a => a.card.name === h.card.name),
    hellActivate: async (A, p, h) => { await A.discard(p, 1); if (A.hell(p).includes(h)) await A.summonFrom(p, A.hell(p), h, { jutti: false }); },
  };
  E['CC02-003'] = { // คุณโดม ผู้จัดการทีมการ์ด
    activateLabel: 'ทอยลูกเต๋า: POWER + ผลลูกเต๋า', activate: async (A, p, a) => { const d = A.dice(); A.log(`ทอยได้ ${d}`); A.addPower(a, d, 'endTurn'); },
    lastWill: async (A, p, self) => { if (A.hell(p).includes(self)) { A.deck(p).push(A.takeFrom(A.hell(p), self)); A.shuffleDeck(p); A.log(`${self.card.name} กลับเข้า Deck`); } },
  };
  E['CC02-004'] = { extraSymbol: 'หุ่นยนต์', onSurviveAttack: async (A, p) => { const d = await pickAv(A, p, A.avatars(A.opp(p)), 'ทำลาย Avatar อีกฝ่าย 1 ใบ', x => A.power(x) + (x.card.cost || 0)); if (d) await A.destroy(d, 'นักดาบตะวันแดง', p); } }; // นักดาบตะวันแดง
  E['CC02-005'] = { // หมีบราซิล
    onSummon: async (A, p) => {
      if (!await revealColor(A, p, 'red')) return;
      const v = await A.choose(p, 'หมีบราซิล: เลือกปฏิบัติ', [{ label: 'Avatar เรา 1 ใบ POWER +2', value: 1, score: 1 }, { label: 'จั่ว 2 ใบ ทิ้ง 1 ใบ', value: 2, score: 1.5 }]);
      if (v === 1) { const x = await pickAv(A, p, A.avatars(p), 'Avatar เรา POWER +2'); if (x) A.addPower(x, 2, 'forever'); } else { A.draw(p, 2); await A.discard(p, 1); }
    },
  };
  E['CC02-006'] = { onSummon: async (A, p) => { for (let k = 0; k < 2; k++) { const c = await A.pickFrom(p, A.deck(p), () => true, `เลือกการ์ดจาก Deck ขึ้นมือ (${k + 1}/2)`); if (c) A.toHand(p, A.takeFrom(A.deck(p), c)); } A.shuffleDeck(p); } }; // ซุส
  E['CC02-007'] = { // ไอ้ชนหมา
    onSummon: async (A, p, self) => {
      const x = await pickAv(A, p, A.avatars(p).filter(y => y !== self && A.isSym(y, 'สัตว์')), 'เซ่นไหว้ Avatar {สัตว์} เพื่อสอดแนม 7', y => 1 - A.power(y), true); if (!x) return; await A.sacrifice(p, x);
      const d = A.deck(p); const seen = d.splice(0, Math.min(7, d.length)); A.log(`สอดแนม ${seen.length} ใบ`);
      const v = await A.choose(p, 'นำ Avatar Cost ≤5 ขึ้นมือ (Cost ≤2 อัญเชิญได้)', seen.filter(c => isAvatar(c.card) && (c.card.cost || 0) <= 5).map(c => A.cardOpt(c)), true); const c = seen.find(y => y.uid === v);
      if (c) seen.splice(seen.indexOf(c), 1); d.push(...seen); A.shuffleDeck(p); if (!c) return;
      if ((c.card.cost || 0) <= 2 && A.roomFor(p, c.card) && await askYes(A, p, `อัญเชิญ ${c.card.name} แทนการนำขึ้นมือ?`, 1) != null) await A.summonFrom(p, [], c, { jutti: false }); else A.toHand(p, c);
    },
  };
  E['CC02-008'] = { onSummon: async (A, p, self) => { if (!self.exact) return; A.draw(p, 3); for (let k = 0; k < 2; k++) { const c = await A.pickFrom(p, A.hand(p), () => true, `นำการ์ดบนมือกลับเข้า Deck (${k + 1}/2)`); if (c) A.deck(p).push(A.takeFrom(A.hand(p), c)); } A.shuffleDeck(p); } }; // ลุงน้อย
  E['CC02-009'] = { // บึงทมิฬ People - คุณปลาชด
    summonRule: (A, src, p, card) => (A.state.land && A.named(A.state.land.card, SWAMP) && isAvatar(card) && card.symbol !== 'ปลา' && A.avatars(p).some(a => a.card.symbol !== 'ปลา') ? 'ควบคุม Avatar ที่ไม่ใช่ {ปลา} ได้แค่ 1 ใบ (บึงทมิฬ)' : null),
  };
  E['CC02-010'] = { // หมีขาว
    onSummon: async (A, p) => {
      if (!await revealColor(A, p, 'blue')) return;
      const v = await A.choose(p, 'หมีขาว: เลือกปฏิบัติ', [{ label: 'สอดแนม 5: อัญเชิญ Avatar Cost ≤3', value: 1, score: A.roomFor(p) ? 2 : 0 }, { label: 'สอดแนม 5: นำ Avatar ขึ้นมือ', value: 2, score: 1 }]);
      if (v === 1) await lookTop(A, p, 5, c => isAvatar(c) && (c.cost || 0) <= 3, 'อัญเชิญ Avatar Cost ≤3', async c => A.summonFrom(p, [], c, { jutti: false }));
      else await lookTop(A, p, 5, isAvatar, 'นำ Avatar ขึ้นมือ', async c => A.toHand(p, c));
    },
  };
  E['CC02-011'] = { // ตุตันคาเมน ฟาโรห์ทองคำ
    onEnter: async (A, p, self) => { self.noLeaveHell = true; },
    onSummon: async (A, p) => {
      const v = await A.choose(p, 'ตุตันคาเมน: เลือกปฏิบัติ', [{ label: 'อัญเชิญ จุติ Avatar (ไม่ใช่ Only) จากนรกใครก็ได้ Cost รวม ≤8', value: 1, score: 2 }, { label: 'อัญเชิญ จุติ Avatar 1 ใบ จากนรกใครก็ได้', value: 2, score: 1 }]);
      if (v === 1) await summonUpTo(A, p, () => fromAnyHell(A, c => isAvatar(c) && !c.onlyOne), 8, 'อัญเชิญ จุติ จากนรก', { jutti: true });
      else if (A.roomFor(p)) { const cs = fromAnyHell(A, isAvatar); const u = await A.choose(p, 'อัญเชิญ จุติ Avatar จากนรกใครก็ได้', cs.map(c => A.cardOpt(c)), true); const c = cs.find(x => x.uid === u); if (c) await A.summonFrom(p, hellOf(A, c), c, { jutti: true }); }
    },
  };
  const purpleGeneral = (A, x) => A.named(x.card, GENERAL3) && x.card.color === 'purple' && A.isSym(x, FOREIGN);
  E['CC02-012'] = { // เตียวเสียน
    untargetable: (A, x) => A.avatars(x.owner).some(y => y !== x && purpleGeneral(A, y)),
    activateLabel: 'เปลี่ยน Avatar อีกฝ่ายทั้งหมดเป็นสภาพตื่น', canActivate: (A, p) => A.avatars(A.opp(p)).some(x => x.rested),
    activate: async (A, p) => { A.avatars(A.opp(p)).forEach(x => { x.rested = false; }); A.log('Avatar อีกฝ่ายทั้งหมดกลับมาสภาพตื่น'); },
  };
  E['CC02-013'] = { // ตั๋งโต๊ะ ขุนพลฮ่องเต้ทรราช
    onSummon: async (A, p, self) => {
      const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, GENERAL3) && x.color === 'purple' && x.symbol === FOREIGN && x.name !== self.card.name, 'นำ "ขุนพล" สีม่วงจากนรกขึ้นมือ (Cost -3 เทิร์นนี้)', true); if (!c) return;
      A.toHand(p, A.takeFrom(A.hell(p), c)); const orig = c.card; c.card = Object.assign({}, orig, { cost: Math.max(0, (orig.cost || 0) - 3) });
      A.atEndOfTurn(() => { if (c.card !== orig && c.card.name === orig.name) c.card = orig; });
    },
  };
  E['CC02-014'] = { onAnyMill: async (A, p, src) => { if (src.onceTurn === A.state.turn) return; src.onceTurn = A.state.turn; A.draw(p, 1); } }; // แร้งทึ้งศพ
  E['CC02-015'] = { // หมีดำ
    onSummon: async (A, p, self) => {
      if (!await revealColor(A, p, 'purple')) return;
      const v = await A.choose(p, 'หมีดำ: เลือกปฏิบัติ', [{ label: 'ธรณีสูบ 2: อัญเชิญ Avatar POWER ≤2 จากนรก', value: 1, score: A.roomFor(p) ? 2 : 0 }, { label: 'ธรณีสูบ 2: นำการ์ดในนรกกลับใต้ Deck', value: 2, score: 1 }]);
      await A.mill(p, 2, self);
      if (v === 1) { const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && (x.power || 0) <= 2 && !x.onlyOne, 'อัญเชิญ Avatar POWER ≤2 จากนรก', true); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); }
      else { const c = await A.pickFrom(p, A.hell(p), x => !x.onlyOne, 'นำการ์ดในนรกกลับใต้ Deck', true); if (c) A.deck(p).push(A.takeFrom(A.hell(p), c)); }
    },
  };
  E['CC02-016'] = { // อินาริ โอคามิ
    onSummon: async (A, p, self) => { A.park(self, p); },
    aura: (A, p, src, a) => (a.owner === p ? 1 + Math.floor(A.hell(p).length / 15) : 0),
    mzAura: (A, p, m, a) => (a.owner === p ? 1 + Math.floor(A.hell(p).length / 15) : 0),
    endPhase: async (A, p) => A.draw(p, 1 + Math.floor(A.hell(p).length / 15)),
    mzEndPhase: async (A, p) => A.draw(p, 1 + Math.floor(A.hell(p).length / 15)),
  };
  E['CC02-017'] = { // มอร์ฟีน Overdose
    blockOppMagic: (A, a) => (new Set(A.avatars(a.owner).filter(x => A.named(x.card, 'Overdose')).map(x => x.card.name)).size >= 4 ? ['react', 'normal'] : []),
    activateLabel: 'หงาย LIFE เรา 1 ใบ: อัญเชิญ Avatar จากนรกใครก็ได้ให้เจ้าของ', canActivate: (A, p) => A.state.players[p].life.some(l => !l.faceUp) && fromAnyHell(A, isAvatar).length > 0,
    activate: async (A, p) => {
      A.flipLife(p, 1); const cs = fromAnyHell(A, isAvatar).filter(c => A.roomFor(A.hell(0).includes(c) ? 0 : 1, c.card));
      const u = await A.choose(p, 'อัญเชิญ Avatar จากนรกใครก็ได้ ลงฝั่งเจ้าของ', cs.map(c => A.cardOpt(c, A.hell(p).includes(c) ? (c.card.power || 0) : -(c.card.power || 0)))); const c = cs.find(x => x.uid === u); if (!c) return;
      const q = A.hell(0).includes(c) ? 0 : 1; if (await A.summonFrom(q, A.hell(q), c, { jutti: false }) && q !== p && A.onField(c)) { c.lostAbilities = true; A.log(`${c.card.name} สั่งใช้ความสามารถไม่ได้`); }
    },
  };
  E['CC02-018'] = { noDeckSummon: true }; // หุ่นพิฆาต 300%
  E['CC02-019'] = { // ราชาใบก้อน
    activateLabel: 'Cost -1: ทำลาย Avatar อีกฝ่ายที่ Cost ≤ ใบนี้', canActivate: (A, p, a) => A.cost(a) > 0 && A.avatars(A.opp(p)).some(x => A.cost(x) <= A.cost(a) - 1),
    activate: async (A, p, a) => { a.costMod = (a.costMod || 0) - 1; const lim = A.cost(a); const d = await pickAv(A, p, A.avatars(A.opp(p)).filter(x => A.cost(x) <= lim), `ทำลาย Avatar อีกฝ่าย Cost ≤${lim}`, x => A.power(x) + A.cost(x)); if (d) await A.destroy(d, 'ราชาใบก้อน', p); },
  };
  E['CC02-020'] = { // หมีเหลือง
    onSummon: async (A, p) => {
      if (!await revealColor(A, p, 'green')) return;
      const v = await A.choose(p, 'หมีเหลือง: เลือกปฏิบัติ', [{ label: 'Avatar 1 ใบไม่ถูกทำลายจากการต่อสู้', value: 1, score: 2 }, { label: 'Avatar 1 ใบไม่รับผล Magic อีกฝ่าย', value: 2, score: 1 }]);
      const x = await pickAv(A, p, A.avatars(p), 'เลือก Avatar'); if (!x) return;
      if (v === 1) { x.battleSafeUntil = A.state.turn + 1; A.log(`${x.card.name} ไม่ถูกทำลายจากการต่อสู้จนจบเทิร์นถัดไปของอีกฝ่าย`); } else { x.magicImmuneUntil = A.state.turn + 1; A.log(`${x.card.name} ไม่รับผล Magic ของอีกฝ่ายจนจบเทิร์นถัดไปของอีกฝ่าย`); }
    },
  };
  E['CC02-022'] = { // คนรวย
    fieldCounter: {
      on: ['magic', 'activate'], label: 'คนรวย: ให้การ์ดบนมือ 1 ใบกับอีกฝ่ายเพื่อยกเลิก (นับเป็น React)',
      when: (A, p) => A.hand(p).length > 0 && !A.magicUsed(p, 'react'), botScore: () => 1.2,
      run: async (A, p) => { A.markMagicUsed(p, 'react'); const c = await A.pickFrom(p, A.hand(p), () => true, 'เลือกการ์ดให้อีกฝ่าย'); if (c) { A.hand(A.opp(p)).push(A.takeFrom(A.hand(p), c)); A.log(`ให้ "${c.card.name}" กับอีกฝ่าย`); } return { cancel: true, negate: true }; },
    },
  };
  E['CC02-029'] = { magicImmune: true }; // ริกกี้ คุณตาใจดี
  E['CC02-039'] = { // พญายักษ์ ทศกัณฐ์
    activateLabel: 'ทิ้ง 1 ใบ: อัญเชิญ {ยักษ์} POWER 3 จาก Deck', canActivate: (A, p) => A.hand(p).length > 0 && A.roomFor(p) && A.deck(p).some(c => isAvatar(c.card) && c.card.symbol === 'ยักษ์' && c.card.power === 3 && !A_named(c.card, 'ทศกัณฐ์')),
    activate: async (A, p) => { await A.discard(p, 1); const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && x.symbol === 'ยักษ์' && x.power === 3 && !A_named(x, 'ทศกัณฐ์'), 'อัญเชิญ {ยักษ์} POWER 3 จาก Deck'); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p); },
  };
  E['CC02-040'] = { onPaidAsCost: async (A, p, pc, summoned) => { if (summoned.card.color === 'green') { summoned.magicImmuneUntil = A.state.turn + 1; A.log(`${summoned.card.name} ไม่รับผล Magic ของอีกฝ่ายจนจบเทิร์นถัดไปของอีกฝ่าย`); } } }; // วีรชนชีวภาพ
  // the four colored "scroll" Magics: look 2, then wait in the Magic Zone to cheat an Avatar out
  const scroll = (color, th) => ({
    magic: async (A, p, inst) => {
      await lookTopBottom(A, p, 2, [{ pred: c => c.color === color, title: `นำการ์ดสี${th} ขึ้นมือ` }], async c => A.toHand(p, c));
      A.park(inst, p); inst.grantFx = inst.card.id + 'p'; inst.parkedTurn = A.state.turn; return { stay: true };
    },
  });
  const scrollUse = color => ({
    activateLabel: 'ทำลายใบนี้: อัญเชิญ Avatar จากมือ (Cost -2)',
    canActivate: (A, p, m) => m.parkedTurn < A.state.turn && A.hand(p).some((h, i) => isAvatar(h.card) && h.card.color === color && A.roomFor(p, h.card) && A.findPaymentCut(p, i, 2)),
    activate: async (A, p, m) => {
      const cs = A.hand(p).filter((h, i) => isAvatar(h.card) && h.card.color === color && A.roomFor(p, h.card) && A.findPaymentCut(p, i, 2));
      const v = await A.choose(p, 'อัญเชิญ Avatar จากมือ (Cost -2)', cs.map(c => A.cardOpt(c, c.card.power || 0))); const c = cs.find(x => x.uid === v) || cs[0]; if (!c) return;
      A.unparkToHell(m);
      const pay = A.findPaymentCut(p, A.hand(p).indexOf(c), 2); if (!pay) return;
      const paid = pay.map(i => A.hand(p)[i]); paid.forEach(x => A.hell(p).push(A.takeFrom(A.hand(p), x)));
      await A.summonFrom(p, A.hand(p), c, { jutti: true });
    },
  });
  E['CC02-041'] = scroll('red', 'แดง'); E['CC02-041p'] = scrollUse('red'); // มรดกของพระอิศวร
  E['CC02-042'] = scroll('blue', 'ฟ้า'); E['CC02-042p'] = scrollUse('blue'); // หนังสือเอาตัวรอดของกุ่ย
  E['CC02-043'] = scroll('purple', 'ม่วง'); E['CC02-043p'] = scrollUse('purple'); // หมอนข้างมฤตยูเทวี
  E['CC02-044'] = scroll('green', 'เขียว'); E['CC02-044p'] = scrollUse('green'); // ใบรับสมัครพนักงานลงกา
  E['CC02-045'] = { // สิงสู่เพื่อสู่สม
    canUse: (A, p) => A.avatars(p).some(a => A.cost(a) >= 3) && A.avatars(A.opp(p)).length > 0,
    magic: async (A, p, inst) => {
      const x = await pickAv(A, p, A.avatars(p).filter(a => A.cost(a) >= 3), 'เซ่นไหว้ Avatar Cost 3 ขึ้นไป', a => -A.power(a)); if (!x) return; await A.sacrifice(p, x);
      const o = A.opp(p); const ds = A.avatars(o); if (!ds.length) return;
      const v = await A.choose(o, 'เลือก Avatar ของคุณ 1 ใบ ให้อีกฝ่ายยึด', ds.map(d => A.avOpt(d, -A.power(d)))); const d = ds.find(y => y.uid === v) || ds[0];
      if (!A.takeControl(d, p, false, true)) return;
      inst.origCard = inst.card; inst.card = Object.assign({}, inst.card, { magicType: 'modification' }); await A.attach(p, inst, d); return { stay: true };
    },
    onHell: (A, p, m, host) => { if (m.origCard) { m.card = m.origCard; delete m.origCard; } if (host && host.trueOwner != null) A.takeControl(host, host.trueOwner, false, true); },
  };
  E['CC02-047'] = { react: { on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'life' && A.deathsThisTurn(p) > 0, botScore: () => 3, run: async () => ({ cancelAttack: true }) } }; // เราจะตายแล้วท่านหยุดเถอะ
  E['CC02-048'] = { // ปืนจักรวุทธ
    magic: true,
    onEquippedAttack: async (A, p, m, a) => A.addPower(a, 4, 'endTurn'),
    onEquippedBattleWin: async (A, p, m, a) => { if (m.wakeTurn === A.state.turn) return; m.wakeTurn = A.state.turn; A.wake(a); a.noUntap = true; A.log(`${a.card.name} กลับมาสภาพตื่น (ปืนจักรวุทธ)`); },
    equipActivateLabel: 'นำ ปืนจักรวุทธ ขึ้นมือ และปลุก Avatar ที่สวมใส่',
    equipActivate: async (A, p, m, h) => { const pl = A.state.players[p]; pl.magicZone.splice(pl.magicZone.indexOf(m), 1); m.attachedTo = null; A.toHand(p, m); if (h) { A.wake(h); h.noUntap = false; } },
  };
  E['CC02-049'] = { magic: true, aura: (A, p, land, a) => { const xs = A.avatars(a.owner); return xs.length >= 2 && new Set(xs.map(x => x.card.symbol)).size === xs.length ? 1 : 0; } }; // ดินแดนแห่งความหลากหลาย
  E['CC02-050'] = { // วิหารเจ้าสมุทร
    magic: true, activateLabel: 'นอน {ปลา}: สอดแนม 3 นำ {ปลา} ขึ้นมือ', canActivate: (A, p) => A.avatars(p).some(a => A.isSym(a, 'ปลา') && !a.rested),
    activate: async (A, p) => {
      const x = await pickAv(A, p, A.avatars(p).filter(a => A.isSym(a, 'ปลา') && !a.rested), 'เปลี่ยน {ปลา} เป็นสภาพนอน', a => -A.power(a)); if (!x) return; A.rest(x);
      const d = A.deck(p); const seen = d.splice(0, Math.min(3, d.length)); const v = await A.choose(p, 'นำ {ปลา} ขึ้นมือ', seen.filter(c => c.card.symbol === 'ปลา').map(c => A.cardOpt(c)), true); const c = seen.find(y => y.uid === v);
      if (c) { seen.splice(seen.indexOf(c), 1); A.toHand(p, c); } A.hell(p).push(...seen);
    },
  };
  E['CC02-051'] = { magic: async (A, p) => { A.flipLife(p, 5); A.state.players[p].pretTurn = A.state.turn; A.log('Avatar {เปรต} ที่อัญเชิญในเทิร์นนี้ ไม่รับผลจากความสามารถการ์ด และได้รับ เตะไข่'); } }; // ช่วยโลกใบนี้ไว้

  // ================= promos, ODY1 and leftovers =================
  const chewFriend = { // เคี้ยวเพื่อนเธอซะ
    react: {
      on: 'summon', when: (A, p) => A.avatars(p).length > 0 && A.hand(p).some(h => isAvatar(h.card)), botScore: () => 0.5,
      run: async (A, p) => {
        let gems = 0;
        while (A.avatars(p).length) { const x = await pickAv(A, p, A.avatars(p), `เซ่นไหว้ Avatar เรา (GEM รวม ${gems})`, y => (A.gem(y.card) >= 2 ? 1 : -1), true); if (!x) break; gems += A.gem(x.card); await A.sacrifice(p, x); }
        while (A.roomFor(p)) { const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && (x.cost || 0) <= gems, `อัญเชิญ Avatar จากมือ (GEM เหลือ ${gems})`, true); if (!c) break; gems -= c.card.cost || 0; await A.summonFrom(p, A.hand(p), c, { jutti: false }); }
      },
    },
  };
  E['BT02-050'] = chewFriend; E['ODY1-087'] = chewFriend;
  E['BT04-005'] = { // ยายกบ 1954
    noHandSummon: true,
    handActivateLabel: 'ส่ง "กบ" ที่ได้รับ POWER +3 ขึ้นไปลงนรก: อัญเชิญใบนี้',
    canHandActivate: (A, p, h) => A.avatars(p).some(x => A.named(x.card, 'กบ') && A.power(x) - (x.card.power || 0) >= 3),
    handActivate: async (A, p, h) => { const x = await pickAv(A, p, A.avatars(p).filter(y => A.named(y.card, 'กบ') && A.power(y) - (y.card.power || 0) >= 3), 'ส่ง "กบ" ลงนรก'); if (!x) return; const pw = A.power(x); A.sendToHell(x); if (await A.summonFrom(p, A.hand(p), h, { jutti: false }) && A.onField(h)) A.addPower(h, pw, 'forever'); },
  };
  E['BT04-016'] = { magicImmune: true }; // ริกกี้ คุณตา
  E['BT05-009'] = { onPaidAsCost: async (A, p, pc, summoned) => { if (summoned.card.symbol === 'เปรต') summoned.magicImmuneUntil = A.state.turn + 1; } }; // น้องส้ม ชู้วันชัย
  E['BT06-013'] = { // บึงทมิฬ People - คุณบลูลอบสเตอร์
    onDrawPhaseDraw: async (A, p, c) => {
      if (!A.state.land || !A.named(A.state.land.card, SWAMP) || !A.roomFor(p, c.card)) return; A.log(`แสดง "${c.card.name}" แล้วอัญเชิญ`);
      if (await A.summonFrom(p, A.hand(p), c, { jutti: false, by: c.card.id }) && A.onField(c)) { const d = await pickAv(A, p, A.avatars(A.opp(p)), 'ทำลาย Avatar อีกฝ่าย', x => A.power(x) + (x.card.cost || 0)); if (d) await A.destroy(d, c.card.name, p); }
    },
  };
  E['BT06-069'] = {}; // หุบเขา 3 พลเอก (changes ใบดำใบแดง, see PRMO-021)
  const valley = (A, p) => A.constructs(p).some(c => c.card.id === 'BT06-069');
  E['PRMO-021'] = { // ใบดำใบแดง
    unlimitedIf: valley,
    magic: async (A, p) => {
      if (valley(A, p)) { if (A.roomFor(p)) await lookTopBottom(A, p, 3, [{ pred: c => isAvatar(c) && c.symbol === 'คน' && c.color === 'green' && (c.cost || 0) <= 4, title: 'อัญเชิญ Avatar {คน} สีเขียว Cost ≤4' }], async c => A.summonFrom(p, [], c, { jutti: false })); return; }
      const c = A.deck(p)[0]; if (!c) return; A.log(`สอดแนม "${c.card.name}"`);
      if (isAvatar(c.card) && c.card.symbol === 'คน' && (c.card.cost || 0) <= 3 && A.roomFor(p, c.card)) { A.deck(p).shift(); await A.summonFrom(p, [], c, { jutti: false }); } else A.deck(p).push(A.deck(p).shift());
    },
  };
  E['BT08-003'] = { // เณรคู
    activateLabel: 'ทิ้ง 1 ใบ: อีกฝ่ายใช้ React Magic ไม่ได้จนจบเทิร์น', canActivate: (A, p) => A.hand(p).length > 0 && A.constructs(p).some(c => A_named(c.card, 'ค่ายบางระจัน')),
    activate: async (A, p) => { await A.discard(p, 1); A.state.players[A.opp(p)].noReactTurn = A.state.turn; A.log('Avatar "ค่ายบางระจัน" ไม่รับผล React Magic ของอีกฝ่ายจนจบเทิร์น'); },
  };
  E['BT08-029'] = { // เนียจัง
    onSummon: async (A, p) => {
      if (!(A.state.players[p].life.filter(l => l.faceUp).length >= 3 || A.avatars(p).some(a => A.named(a.card, 'มยุราซัง'))) || !A.roomFor(p)) return;
      const c = await A.pickFrom(p, A.hand(p).concat(A.deck(p)), x => isAvatar(x) && A_named(x, 'ทัตดนัยซัง'), 'อัญเชิญ "ทัตดนัยซัง" จากมือหรือ Deck', true); if (!c) return;
      const z = A.hand(p).includes(c) ? A.hand(p) : A.deck(p); await A.summonFrom(p, z, c, { jutti: true, paid: [] }); if (z === A.deck(p)) A.shuffleDeck(p);
    },
    oncePerTurn: false,
    activateLabel: 'ทำลาย "โอตะ" ที่สวมใส่ไอดอล 2 ใบ: เปลี่ยน Avatar อีกฝ่ายเป็น "โอตะ" มาสวมใส่',
    canActivate: (A, p, a) => ((a.otaUses || {})[A.state.turn] || 0) < (A.avatars(p).some(x => A.named(x.card, 'ทัตดนัยซัง')) ? 2 : 1) && A.avatars(A.opp(p)).length > 0 && A.avatars(p).filter(x => A.named(x.card, IDOL)).flatMap(x => A.attached(x)).filter(m => A_named(m.card, OTA)).length >= 2,
    activate: async (A, p, a) => {
      a.otaUses = { [A.state.turn]: ((a.otaUses || {})[A.state.turn] || 0) + 1 };
      for (let k = 0; k < 2; k++) { const ms = A.avatars(p).filter(x => A.named(x.card, IDOL)).flatMap(x => A.attached(x)).filter(m => A_named(m.card, OTA)); const v = await A.choose(p, `ทำลาย "โอตะ" ที่สวมใส่ (${k + 1}/2)`, ms.map(m => A.cardOpt(m, 0))); const m = ms.find(x => x.uid === v) || ms[0]; if (m) A.destroyMagic(m); }
      const d = await pickAv(A, p, A.avatars(A.opp(p)), 'เปลี่ยน Avatar อีกฝ่ายเป็น "โอตะ" แล้วสวมใส่ให้ เนียจัง', x => A.power(x)); if (!d || !A.onField(a)) return;
      const pl = A.state.players[d.owner]; A.takeFrom(pl.avatars, d); d.origCard = d.origCard || d.card; d.card = Object.assign({}, d.card, { name: 'โอตะ (' + d.origCard.name + ')' }); await A.attach(p, d, a);
    },
  };
  E['BT08-036'] = { // ขงเบ้ง
    fieldCounter: {
      on: ['magic'], label: 'ขงเบ้ง: ทิ้ง 1 ใบ เพื่อยกเลิก Magic',
      when: (A, p, a) => A.hand(p).length > 0 && !A.magicUsed(p, 'kongming') && A.avatars(p).some(x => x.card.name === 'เล่าปี่ ผู้นำคุณธรรมแห่งจ๊กก๊ก') && A.avatars(p).every(x => x === a || x.card.name === 'เล่าปี่ ผู้นำคุณธรรมแห่งจ๊กก๊ก' || (A.named(x.card, GENERAL3) && x.card.color === 'green' && A.isSym(x, FOREIGN))),
      botScore: () => 1.5, run: async (A, p) => { A.markMagicUsed(p, 'kongming'); await A.discard(p, 1); return { cancel: true }; },
    },
  };
  const naraiAvatar = x => A_named(x.card, NARAI) && isAvatar(x.card);
  const naraiForm = (after, endBack) => ({
    noHandSummon: false,
    onAllyBattleWinHand: async (A, p, h, a) => {
      if (!naraiAvatar(a) || A.state.magicUsed[p]['form:' + h.card.name] || !A.avatars(p).some(naraiAvatar)) return;
      if (await askYes(A, p, `ส่ง "พระนารายณ์" ลงนรก เพื่ออัญเชิญ ${h.card.name}?`, 2) == null) return; A.state.magicUsed[p]['form:' + h.card.name] = true;
      const x = await pickAv(A, p, A.avatars(p).filter(naraiAvatar), 'ส่ง "พระนารายณ์" ลงนรก', y => -A.power(y)); if (!x) return; A.sendToHell(x);
      if (await A.summonFrom(p, A.hand(p), h, { jutti: false, by: h.card.id }) && A.onField(h)) { h.formTurn = A.state.turn; await after(A, p, h); }
    },
    endPhase: endBack ? async (A, p, a) => {
      if (a.formTurn !== A.state.turn) return; const name = a.card.name; A.sendToHell(a);
      const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, NARAI) && x.name !== name, 'อัญเชิญ "พระนารายณ์" ชื่ออื่นจากนรก', true); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false });
    } : undefined,
  });
  E['KD01-001'] = naraiForm(async (A, p) => { // พระนารายณ์ เทพผดุงธรรม
    const d = A.deck(p); const seen = d.splice(0, Math.min(2, d.length)); const sum = seen.reduce((s, c) => s + (c.card.cost || 0), 0); seen.forEach(c => A.toHand(p, c));
    const x = await pickAv(A, p, A.avatars(A.opp(p)).filter(y => A.cost(y) <= sum), `เนรเทศ Avatar อีกฝ่าย Cost ≤${sum}`, y => A.power(y) + A.cost(y), true); if (x) A.banishAvatar(x);
  });
  E['KD01-002'] = naraiForm(async (A, p) => { const x = await pickAv(A, p, A.avatars(A.opp(p)).filter(y => A.cost(y) <= 4), 'ทำลาย Avatar อีกฝ่าย Cost ≤4', y => A.power(y) + A.cost(y), true); if (x) await A.destroy(x, 'นรสิงห์', p); }, true); // นรสิงห์
  E['KD01-003'] = naraiForm(async (A, p) => { const x = await pickAv(A, p, A.avatars(p).filter(y => y.rested && A.isSym(y, 'เทพ')), 'เปลี่ยน {เทพ} เป็นสภาพตื่น', y => A.power(y), true); if (x) { A.wake(x); A.log(`${x.card.name} กลับมาสภาพตื่น`); } }, true); // เกษียรสมุทร
  E['KD04-001'] = { // คริติคอล ไมเกรน
    controlImmune: true,
    activateLabel: 'เนรเทศ "ไมเกรน" 3 ชื่อจากนรก: เลือกปฏิบัติ', canActivate: (A, p) => new Set(A.hell(p).filter(c => isAvatar(c.card) && A_named(c.card, MIGRAINE)).map(c => c.card.name)).size >= 3,
    activate: async (A, p, a) => {
      const used = []; for (let k = 0; k < 3; k++) { const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, MIGRAINE) && !used.includes(x.name), `เนรเทศ "ไมเกรน" (${k + 1}/3)`); if (!c) return; used.push(c.card.name); A.exile(p, A.hell(p), c); }
      const v = await A.choose(p, 'คริติคอล ไมเกรน: เลือกปฏิบัติ', [{ label: 'สวมใส่ "อาวุธหุ่นนักรบผู้กล้า" จากนรก (สูงสุด 2)', value: 1, score: A.hell(p).some(c => isWeapon(c.card)) ? 2 : 0 }, { label: 'ชนะการต่อสู้: ทำความเสียหาย LIFE อีกฝ่าย 1 ครั้ง (จนจบเทิร์น)', value: 2, score: 1 }]);
      if (v === 1) { for (let k = 0; k < 2; k++) { const c = await A.pickFrom(p, A.hell(p), x => isWeapon(x) && x.type === 'magic', `สวมใส่ "อาวุธหุ่นนักรบผู้กล้า" (${k + 1}/2)`, true); if (!c) break; await A.attach(p, A.takeFrom(A.hell(p), c), a); } } else a.critTurn = A.state.turn;
    },
    onBattleWin: async (A, p, a) => { if (a.critTurn === A.state.turn) await A.damageLife(A.opp(p), 1); },
  };
  E['KD04-012'] = { // สุดยอดท่าไม้ตายผู้กล้า THE END (the attack-everything part is not supported)
    canUse: (A, p) => A.avatars(p).some(a => A.named(a.card, MIGRAINE)),
    magic: async (A, p) => { const x = await pickAv(A, p, A.avatars(p).filter(a => A.named(a.card, MIGRAINE)), 'เลือก "ไมเกรน"'); if (x) { A.addPower(x, 2, 'endTurn'); A.log('THE END: (ผลโจมตีทุกใบพร้อมกันยังไม่รองรับ — ได้ POWER +2 แทน)'); } },
    hellActivateLabel: 'เนรเทศใบนี้: สวมใส่ "อาวุธหุ่นนักรบผู้กล้า" ชื่อต่างกันจากนรก',
    canHellActivate: (A, p) => A.avatars(p).some(a => A.named(a.card, MIGRAINE)) && A.hell(p).some(c => isWeapon(c.card) && c.card.type === 'magic'),
    hellActivate: async (A, p, h) => {
      A.exile(p, A.hell(p), h); const x = await pickAv(A, p, A.avatars(p).filter(a => A.named(a.card, MIGRAINE)), 'เลือก "ไมเกรน"'); if (!x) return; const used = [];
      while (true) { const c = await A.pickFrom(p, A.hell(p), y => isWeapon(y) && y.type === 'magic' && !used.includes(y.name), 'สวมใส่ "อาวุธหุ่นนักรบผู้กล้า"', true); if (!c) break; used.push(c.card.name); await A.attach(p, A.takeFrom(A.hell(p), c), x); }
    },
    onMilled: async (A, p, c, src) => { if (src && A.named(src.card, MIGRAINE) && A.hell(p).includes(c)) A.toHand(p, A.takeFrom(A.hell(p), c)); },
  };
  const TAKO = 'ทาโกะ';
  E['ODY1-001'] = { onSummon: tutor(c => c.name === 'ทาโกะซัง สูตรมนุษย์', 'นำ ทาโกะซัง สูตรมนุษย์ ขึ้นมือ') };
  E['ODY1-002'] = { onSummon: tutor(c => c.name === 'ทาโกะซัง สูตรนรก', 'นำ ทาโกะซัง สูตรนรก ขึ้นมือ') };
  E['ODY1-003'] = { onSummon: tutor(c => c.name === 'ทาโกะซัง สูตรสวรรค์', 'นำ ทาโกะซัง สูตรสวรรค์ ขึ้นมือ') };
  E['ODY1-004'] = { onSummon: async (A, p) => { if (new Set(A.hell(p).filter(c => A_named(c.card, 'ทาโกะซัง')).map(c => c.card.name)).size < 3) return; const used = []; for (let k = 0; k < 3; k++) { const c = await A.pickFrom(p, A.hell(p), x => A_named(x, 'ทาโกะซัง') && !used.includes(x.name), `นำ "ทาโกะซัง" กลับเข้า Deck (${k + 1}/3)`); used.push(c.card.name); A.deck(p).push(A.takeFrom(A.hell(p), c)); } A.shuffleDeck(p); A.draw(p, 1); } }; // ทาโกะจัง
  E['ODY1-005'] = { cannotAttack: (A, a) => !A.avatars(a.owner).some(x => A.named(x.card, TAKO)) }; // โอเดนย่ากาย
  const shiva4 = { onSummon: async (A, p) => { const x = await pickAv(A, p, allAvatars(A), 'เลือก Avatar POWER -4', y => (y.owner === p ? -5 : A.power(y))); if (x) A.addPower(x, -4, 'endTurn'); } };
  const indra3 = { onSummon: async (A, p) => { const x = await pickAv(A, p, allAvatars(A), 'เลือก Avatar POWER +3', y => (y.owner === p ? A.power(y) : -5)); if (x) A.addPower(x, 3, 'endTurn'); } };
  ['ODY1-006', 'PRMO-009', 'SL01-003'].forEach(id => { E[id] = shiva4; }); // พระอิศวร
  ['ODY1-015', 'PRMO-022', 'SL01-005'].forEach(id => { E[id] = indra3; }); // พระอินทร์
  E['ODY1-016'] = { aura: (A, p, src, a) => (a.owner === p && A.isSym(a, 'เทพ') ? 1 : 0) }; // นนทก
  E['ODY1-026'] = { onSummon: async (A, p) => { for (let k = 0; k < 3; k++) { const c = await A.pickFrom(p, A.hell(p), x => HERO3.some(n => A_named(x, n)), `นำ "กุ่ย"/"ฮอล"/"นาย" จากนรกเข้า Deck (${k + 1}/3)`, true); if (!c) break; A.deck(p).push(A.takeFrom(A.hell(p), c)); } A.shuffleDeck(p); A.draw(p, 1); } }; // ริกกี้ เพื่อนรัก
  E['ODY1-028'] = { onSummon: async (A, p) => { const d = await pickAv(A, p, A.avatars(A.opp(p)), 'ยึด Avatar อีกฝ่ายมาในสภาพนอน', x => A.power(x), true); if (d) A.takeControl(d, p, true); } }; // ทศกัณฑ์ยักษ์ที่---เมียพระอิศวร
  E['ODY1-063'] = { // เอาแค่การ์ด !!!
    canUse: (A, p) => A.hand(p).some(h => A_named(h.card, 'โอเดนย่า') || A_named(h.card, TAKO)) && allAvatars(A).length > 0,
    magic: async (A, p) => { const c = await A.pickFrom(p, A.hand(p), x => A_named(x, 'โอเดนย่า') || A_named(x, TAKO), 'ทิ้ง "โอเดนย่า"/"ทาโกะ"'); if (!c) return; A.hell(p).push(A.takeFrom(A.hand(p), c)); const x = await pickAv(A, p, allAvatars(A), 'นำ Avatar กลับขึ้นมือเจ้าของ', y => (y.owner === p ? -3 : A.power(y))); if (x) A.bounce(x); },
  };
  E['ODY1-064'] = { react: { on: 'attack', anyType: true, when: (A, p, ctx) => ctx.target.kind === 'avatar' && A.avatars(p).some(x => x.uid === ctx.target.uid && A.named(x.card, TAKO)), botScore: () => 2, run: async (A, p, ctx) => { const x = A.avatars(p).find(y => y.uid === ctx.target.uid); if (x) A.addPower(x, 2, 'endTurn'); } } }; // โอเดนย่า อร่อยมัก
  E['ODY1-066'] = { canUse: A => allAvatars(A).some(x => A.named(x.card, TAKO)), magic: async A => { allAvatars(A).filter(x => A.named(x.card, TAKO)).forEach(x => A.addPower(x, 1, 'forever')); } }; // ดาว O.D.Y 88
  E['ODY1-075'] = { magic: true, equipPower: 1 }; // น้ำแดง
  E['PRE0-001-2'] = { magic: true, equipPower: 0 }; // น้ำใจ
  E['ODY1-088'] = { canUse: (A, p) => A.hand(p).some(h => isAvatar(h.card) && h.card.symbol === 'เทพ'), magic: async (A, p) => { const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && x.symbol === 'เทพ', 'ทิ้ง Avatar {เทพ}'); if (!c) return; A.hell(p).push(A.takeFrom(A.hand(p), c)); A.draw(p, 2); } }; // ความยุติธรรมสำหรับนนทก
  E['ODY1-089'] = { canUse: (A, p) => A.hand(p).some(h => isAvatar(h.card) && HERO3.some(n => A_named(h.card, n))), magic: async (A, p) => { const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && HERO3.some(n => A_named(x, n)), 'ส่ง "กุ่ย"/"ฮอล"/"นาย" จากมือลงนรก'); if (!c) return; A.hell(p).push(A.takeFrom(A.hand(p), c)); A.draw(p, 2); } }; // บำเพ็ญประโยชน์
  E['ODY1-090'] = { // กระทะทองแดง
    magic: true, activateLabel: 'ส่ง Avatar {นรก} จากมือลงนรก: ธรณีสูบ 2 จั่ว 2', canActivate: (A, p) => A.hand(p).some(h => isAvatar(h.card) && h.card.symbol === 'นรก') && A.deck(p).length > 4,
    activate: async (A, p) => { const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && x.symbol === 'นรก', 'ส่ง Avatar {นรก} จากมือลงนรก'); if (!c) return; A.hell(p).push(A.takeFrom(A.hand(p), c)); await A.mill(p, 2); A.draw(p, 2); },
  };
  E['PRE0-005'] = { continuousSelf: (A, p) => (new Set(A.hell(p).filter(c => isAvatar(c.card)).map(c => c.card.name)).size >= 10 ? 2 : 0) }; // ผู้เล่นมั่ว
  E['PRE0-005-2'] = { onSummon: async (A, p, self) => { const d = await pickAv(A, p, A.avatars(A.opp(p)).filter(x => A.power(x) < A.power(self)), 'นำ Avatar อีกฝ่ายมาไว้ที่ Magic Zone เรา', x => A.power(x), true); if (d) A.park(d, p); } }; // ผู้เล่นโซเชียล
  E['PRMO-018'] = { magic: async (A, p) => { A.unflipLifeRandom(p); } }; // ไอ นีด เมดิก
  E['PRMO-030'] = { onAttack: async (A, p, a) => A.addPower(a, allAvatars(A).filter(x => x.rested).length, 'endTurn'), onTargeted: async (A, p, d) => A.addPower(d, allAvatars(A).filter(x => x.rested).length, 'endTurn') }; // CEO คุณจิระ
  E['PRMO-038'] = E['BT02-029']; // รถถัง "Tank Ranger"
  E['PRMO-040'] = { onSummon: async (A, p) => A.draw(p, 3) }; // เมียพระอิศวร
  E['PRMO-051'] = { canUse: (A, p) => A.avatars(p).some(a => !a.rested), magic: async (A, p) => { const x = await pickAv(A, p, A.avatars(p).filter(a => !a.rested), 'เปลี่ยน Avatar เราเป็นสภาพนอน', a => -A.power(a)); if (x) { A.rest(x); A.draw(p, 1); } } }; // บึงทมิฬ
  E['PRMO-052'] = { onEnter: async (A, p) => { const o = A.opp(p); const c = await A.pickFrom(p, A.hell(o), () => true, 'นำการ์ดในนรกอีกฝ่ายกลับใต้ Deck', true); if (!c) return; A.deck(o).push(A.takeFrom(A.hell(o), c)); const d = await pickAv(A, p, A.avatars(o), 'Avatar อีกฝ่าย POWER -2'); if (d) A.addPower(d, -2, 'endTurn'); } }; // แม่นาค พระปะแดง
  E['PRMO-058'] = { onBattleWin: async (A, p, a) => { if (!A.state.land || !A.named(A.state.land.card, SWAMP) || !A.hand(p).length) return; if (await askYes(A, p, 'ทิ้ง 1 ใบ เพื่อกลับมาสภาพตื่น?', 1) == null) return; await A.discard(p, 1); A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`); } }; // คุณดีไมส์
  E['PRMO-063'] = E['KD01-004']; // นางลักษมี
  E['PRMO-065'] = { onSummon: tutor(c => isAvatar(c) && c.name === 'ฮอล', 'นำ "ฮอล" ขึ้นมือ') }; // กุ่ย
  E['PRMO-066'] = { onSummon: tutor(c => isAvatar(c) && c.name === 'นาย', 'นำ "นาย" ขึ้นมือ') }; // ฮอล
  E['PRMO-067'] = { onSummon: tutor(c => isAvatar(c) && c.name === 'กุ่ย', 'นำ "กุ่ย" ขึ้นมือ') }; // นาย
  E['PRMO-075'] = E['BT02-012']; // แมลงปอแจ๊ค
  E['PRMO-078'] = { // หุ่นนักรบผู้กล้า ไมเกรน
    onSummon: async (A, p) => { await lookTopBottom(A, p, 5, [{ pred: isWeapon, title: 'นำ "อาวุธหุ่นนักรบผู้กล้า" ขึ้นมือ' }], async c => A.toHand(p, c)); },
    onAnyMagic: async (A, q, a, inst) => { if (A.state.active !== q || !isWeapon(inst.card) || a.onceTurn === A.state.turn) return; a.onceTurn = A.state.turn; A.draw(q, 1); },
  };
  const drawLife = { life: async (A, p) => A.draw(p, 1) };
  ['PRMO-080', 'PRMO-097', 'PRMO-098', 'PRMO-099'].forEach(id => { E[id] = drawLife; });
  E['PRMO-091'] = { controlImmune: true }; // กวนอู
  E['PRMO-092'] = { onAttack: async (A, p, a) => A.addPower(a, 1, 'endTurn') }; // เตียวหุย
  E['PRMO-102'] = { onBackstab: async (A, p, s, a) => { if (a.card.color !== 'red' || s.backTurn === A.state.turn) return; s.backTurn = A.state.turn; A.wake(s); A.log(`${s.card.name} กลับมาสภาพตื่น`); } }; // ซุนเซ็ก
  const camp = a => (a.card.text || '').includes('ค่ายบางระจัน');
  E['PRMO-104'] = { // ค่ายบางระจัน
    aura: (A, p, src, a) => (a.owner === p && camp(a) ? 1 : 0),
    kwAura: (A, src, a) => (camp(a) ? ['โล่มนุษย์', 'สามัคคี'] : []),
    onDestroyed: async (A, p) => { for (const a of A.avatars(p).slice()) A.sendToHell(a); },
  };
  E['PRMO-105'] = { onAttack: async (A, p, a) => A.addPower(a, 2, 'endTurn') }; // ทองเหม็น ขวานคลั่ง
  E['PRMO-110'] = { react: { on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'avatar', botScore: (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); return d && A.power(d) < A.power(ctx.attacker) ? 2 : 0; }, run: async (A, p, ctx) => { const d = A.avatars(p).find(x => x.uid === ctx.target.uid); if (d) A.bounce(d); } } }; // หนีคือยอดกลยุทธ์
  E['PRMO-116'] = { // ครุฑ เกล
    onSummon: async (A, p) => {
      if (!A.roomFor(p)) return; const c0 = await A.pickFrom(p, A.hand(p), x => (isAvatar(x) && A_named(x, 'ครุฑ')) || A_named(x, 'ขนมณี แฟลร์'), 'ทิ้ง "ครุฑ"/"ขนมณี แฟลร์" เพื่ออัญเชิญ "ครุฑ" จาก Deck', true); if (!c0) return; A.hell(p).push(A.takeFrom(A.hand(p), c0));
      const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, 'ครุฑ') && (x.cost || 0) <= 4, 'อัญเชิญ "ครุฑ" Cost ≤4 จาก Deck', true); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p);
    },
  };
  E['PRMO-136'] = { onBattle: async (A, p, a, foe) => A.addPower(foe, -1, 'endTurn') }; // รัททาทุย พาหะ
  E['SL02-006'] = { // งี่เง่ากับงอแง
    activateLabel: 'เลือกปฏิบัติ: เซ่นไหว้จั่ว 2 / ได้ เตะไข่',
    activate: async (A, p, a) => {
      const v = await A.choose(p, 'งี่เง่ากับงอแง: เลือกปฏิบัติ', [{ label: 'เซ่นไหว้ใบนี้ จั่ว 2 ใบ', value: 1, score: 1 }, { label: 'ได้รับ เตะไข่ แล้วถูกทำลายใน End Phase', value: 2, score: A.avatars(A.opp(p)).length ? 1.5 : 0 }]);
      if (v === 1) { await A.sacrifice(p, a); A.draw(p, 2); } else { A.grantKw(a, ['เตะไข่']); a.destroyAtEnd = true; }
    },
  };
  // ================= starter decks SD01–SD09 =================
  ['SD01-025', 'SD02-021', 'SD02-022', 'SD02-023', 'SD02-024', 'SD02-025', 'SD03-021', 'SD03-022', 'SD03-024', 'SD04-024', 'SD05-021', 'SD05-022', 'SD05-023', 'SD05-024', 'SD05-025',
    'SD06-021', 'SD06-025', 'SD07-024', 'SD07-025', 'SD08-023', 'SD08-024', 'SD08-025', 'SD09-021', 'SD09-022', 'SD09-025'].forEach(id => { E[id] = lifeDraw1; });
  E['SD01-019'] = { canUse: (A, p) => A.avatars(p).some(a => A.isSym(a, 'เทพ')), magic: async (A, p) => { const x = await pickAv(A, p, A.avatars(p).filter(a => A.isSym(a, 'เทพ')), 'Avatar {เทพ} POWER +2'); if (x) A.addPower(x, 2, 'endTurn'); } }; // ฮ่า ฮ่า ฮ่า ผมได้เลื่อนขั้น
  // --- SD02 กุ่ย ฮอล นาย
  const hero3 = c => isAvatar(c) && HERO3.some(n => A_named(c, n));
  const payHero = async (A, p, names) => { // send one of each name from hand and/or field to hell
    for (const n of names) {
      const opts = A.hand(p).filter(h => isAvatar(h.card) && A_named(h.card, n)).concat(A.avatars(p).filter(a => A.named(a.card, n)));
      const v = await A.choose(p, `ส่ง "${n}" จากมือหรือสนามลงนรก`, opts.map(x => A.cardOpt(x, A.hand(p).includes(x) ? 1 : 0))); const x = opts.find(y => y.uid === v) || opts[0]; if (!x) return false;
      if (A.hand(p).includes(x)) A.hell(p).push(A.takeFrom(A.hand(p), x)); else A.sendToHell(x);
    }
    return true;
  };
  const heroAvail = (A, p, n) => A.hand(p).some(h => isAvatar(h.card) && A_named(h.card, n)) || A.avatars(p).some(a => A.named(a.card, n));
  E['SD02-005'] = { onSummon: async (A, p) => { for (let k = 0; k < 3; k++) { const c = await A.pickFrom(p, A.hell(p), hero3, `นำ "กุ่ย"/"ฮอล"/"นาย" จากนรกขึ้นมือ (${k + 1}/3)`, true); if (!c) break; A.toHand(p, A.takeFrom(A.hell(p), c)); } } }; // วีรบุรุษปากซอย
  E['SD02-016'] = { // ระเบิดVery Fat Man
    react: { on: 'attack', anyType: true, when: (A, p) => HERO3.every(n => heroAvail(A, p, n)) && A.avatars(A.opp(p)).length >= 2, botScore: (A, p) => A.avatars(A.opp(p)).length - 1, run: async (A, p, ctx) => { if (!(await payHero(A, p, HERO3))) return; for (const a of A.avatars(A.opp(p)).slice()) await A.destroy(a, 'ระเบิดVery Fat Man', p); return A.onField(ctx.attacker) ? null : { cancelAttack: true }; } },
  };
  E['SD02-019'] = { // สละเพื่อนเพื่อช่วยเพื่อน
    react: { on: 'attack', anyType: true, when: (A, p) => HERO3.some(n => heroAvail(A, p, n)), botScore: (A, p, ctx) => (A.power(ctx.attacker) >= 5 ? 2 : 0), run: async (A, p, ctx) => {
      const n = HERO3.find(x => heroAvail(A, p, x)); if (!(await payHero(A, p, [n]))) return; const x = await pickAv(A, p, allAvatars(A), 'นำ Avatar กลับขึ้นมือ', y => (y === ctx.attacker ? 9 : y.owner === p ? -3 : A.power(y))); if (x) A.bounce(x); return A.onField(ctx.attacker) ? null : { cancelAttack: true };
    } },
  };
  E['SD02-020'] = { magic: true, onAnyAttack: async (A, p, a) => { if (HERO3.some(n => A.named(a.card, n))) A.addPower(a, 2, 'endTurn'); } }; // สมชาย ห้องเช่าถูกๆ
  // --- SD03 นรก
  E['SD03-005'] = { continuousSelf: (A, p) => new Set(A.hell(p).filter(c => isAvatar(c.card) && A_named(c.card, NIRAYA)).map(c => c.card.name)).size }; // สุวาน
  E['SD03-017'] = { magic: async (A, p) => { const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, NIRAYA) && (x.cost || 0) <= 4, 'นำ "นายนิรยบาล" Cost ≤4 ขึ้นมือ', true); if (c) A.toHand(p, A.takeFrom(A.deck(p), c)); A.shuffleDeck(p); } }; // บัญชีหนังหมา
  E['SD03-018'] = Object.assign({}, E['BT09-066'] || {}, { magic: true, equipOk: (A, a) => A.isSym(a, 'นรก'), equipPower: 1 }); // หอกแหลมแทงทุกวัน
  E['SD03-019'] = { magic: true, aura: (A, p, src, a) => (A.isSym(a, 'นรก') ? 1 : 0) }; // สิมพลีนรก (Land: both sides)
  E['SD03-020'] = { // จิ้มมันเลย จิ้ม!
    react: { on: 'summon', anyType: true, when: (A, p, ctx) => ctx.avatar.owner !== p && A.hand(p).some(h => isAvatar(h.card) && h.card.symbol === 'นรก' && (h.card.cost || 0) >= A.cost(ctx.avatar)), botScore: (A, p, ctx) => (A.power(ctx.avatar) >= 4 ? 2 : 0.5), run: async (A, p, ctx) => {
      const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && x.symbol === 'นรก' && (x.cost || 0) >= A.cost(ctx.avatar), 'ทิ้ง Avatar {นรก} จากมือ'); if (!c) return; A.hell(p).push(A.takeFrom(A.hand(p), c)); await A.mill(p, 2); if (A.onField(ctx.avatar)) await A.destroy(ctx.avatar, 'จิ้มมันเลย จิ้ม!', p);
    } },
  };
  E['SD03-016'] = { canUse: (A, p) => A.hand(p).some(h => isAvatar(h.card) && h.card.symbol === 'นรก'), magic: async (A, p) => { const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && x.symbol === 'นรก', 'ส่ง Avatar {นรก} จากมือลงนรก'); if (!c) return; A.hell(p).push(A.takeFrom(A.hand(p), c)); await A.mill(p, 2); A.draw(p, 2); } }; // กระทะทองแดง (normal)
  // --- SD04 Tank Ranger
  const tankOf = (A, p) => A.avatars(p).filter(a => A.named(a.card, TANK));
  E['SD04-001'] = { // กัปตันแบงค์ Tank Ranger
    onSummon: async (A, p) => { const ts = tankOf(A, p); if (!ts.length) { await lookTopBottom(A, p, 5, [], async () => {}); return; } await lookTopBottom(A, p, 5, [{ pred: c => c.name === 'จ่ามะนาว' || c.name === 'จ่าแดงเดือด' || A_named(c, 'จ่ามะนาว') || A_named(c, 'จ่าแดงเดือด'), title: 'สวม "จ่ามะนาว"/"จ่าแดงเดือด" ให้รถถัง' }], async c => { const t = await pickAv(A, p, tankOf(A, p), 'เลือกรถถัง'); if (t) await A.attach(p, c, t); else A.deck(p).push(c); }); },
    activateLabel: 'สวมใส่ใบนี้ให้ "รถถัง"', canActivate: (A, p, a) => tankOf(A, p).some(t => t !== a),
    activate: async (A, p, a) => { const t = await pickAv(A, p, tankOf(A, p).filter(x => x !== a), 'สวมใส่ให้ "รถถัง"'); if (t) { A.takeFrom(A.state.players[p].avatars, a); await A.attach(p, a, t); } },
  };
  E['SD04-005'] = { onSummon: async (A, p, self) => { const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, RANGER), 'สวม "Tank Ranger" จาก Deck ให้ใบนี้', true); if (c) await A.attach(p, A.takeFrom(A.deck(p), c), self); A.shuffleDeck(p); } }; // MEGA ROR.DOR
  (root.TC_CARDS || []).forEach(c => { if (c.id === 'SD04-005' && !(c.alsoNamed || []).includes(TANK)) c.alsoNamed = (c.alsoNamed || []).concat(TANK); });
  E['SD04-017'] = { react: { on: 'attack', anyType: true, when: (A, p) => tankOf(A, p).length > 0 && A.avatars(A.opp(p)).length > 0, botScore: (A, p) => A.avatars(A.opp(p)).length - 1, run: async (A, p) => { const t = await pickAv(A, p, tankOf(A, p), 'ทำลาย "รถถัง" ของเรา', x => -A.power(x)); if (!t) return; await A.destroy(t, 'เพื่อชาติ', p); for (const a of A.avatars(A.opp(p)).slice()) await A.destroy(a, 'เพื่อชาติ', p); return { cancelAttack: true }; } } }; // เพื่อชาติ
  E['SD04-018'] = { // ขึ้นมาเร็ว ไอ้ลูกลิง !!
    react: { on: 'attack', anyType: true, when: (A, p, ctx) => ctx.target.kind === 'avatar' && tankOf(A, p).some(t => t.uid === ctx.target.uid), botScore: () => 2, run: async (A, p, ctx) => {
      let done = false; await lookTopBottom(A, p, 5, [{ pred: c => isAvatar(c) && c.symbol === 'คน' && A_named(c, RANGER), title: 'สวม "Tank Ranger" ให้รถถัง' }], async c => { const t = await pickAv(A, p, tankOf(A, p), 'เลือกรถถัง'); if (t) { await A.attach(p, c, t); done = true; } else A.deck(p).push(c); });
      if (done && A.onField(ctx.attacker)) { await A.destroy(ctx.attacker, 'ขึ้นมาเร็ว ไอ้ลูกลิง !!', p); return { cancelAttack: true }; }
    } },
  };
  E['SD04-020'] = { // เขาชนไก่
    magic: true, activateLabel: 'เปลี่ยน {คน} ของเราเป็นสภาพนอน: สอดแนม 1 ใบ', canActivate: (A, p) => A.avatars(p).some(a => !a.rested && a.card.symbol === 'คน') && A.deck(p).length > 0,
    activate: async (A, p) => { const x = await pickAv(A, p, A.avatars(p).filter(a => !a.rested && a.card.symbol === 'คน'), 'เปลี่ยนเป็นสภาพนอน', a => -A.power(a)); if (!x) return; A.rest(x); const c = A.deck(p)[0]; if (!c) return; const v = await A.choose(p, `สอดแนม "${c.card.name}"`, [{ label: 'ไว้บนสุดของ Deck', value: 1, score: isAvatar(c.card) ? 1 : 0 }, { label: 'ไว้ล่างสุดของ Deck', value: 2, score: isAvatar(c.card) ? 0 : 1 }]); if (v === 2) A.deck(p).push(A.deck(p).shift()); },
  };
  // --- SD05 บึงทมิฬ People
  const PEOPLE = 'บึงทมิฬ People';
  const people = (A, a) => A.named(a.card, PEOPLE);
  (root.TC_CARDS || []).forEach(c => { if (c.id === 'SD05-006' && !(c.alsoNamed || []).includes(PEOPLE)) c.alsoNamed = (c.alsoNamed || []).concat(PEOPLE); });
  const swampLand = A => A.state.land && A.named(A.state.land.card, SWAMP);
  E['SD05-002'] = { afterAttack: async (A, p, a) => { if (!A.onField(a) || a.diceTurn === A.state.turn || !A.avatars(p).some(x => x !== a && people(A, x))) return; a.diceTurn = A.state.turn; const d = A.dice(); A.log(`${a.card.name}: ทอยลูกเต๋าได้ ${d}`); if (d % 2) { A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`); } } }; // คุณเค้นท์
  E['SD05-003'] = { onSummon: async (A, p) => { const n = allAvatars(A).filter(x => x.rested).length; if (!n) return; const d = A.deck(p); const seen = d.splice(Math.max(0, d.length - n)); A.log(`แสดงการ์ดล่างสุดของ Deck ${seen.length} ใบ`); const v = await A.choose(p, 'นำ Avatar {ปลา} ขึ้นมือ', seen.filter(c => isAvatar(c.card) && c.card.symbol === 'ปลา').map(c => A.cardOpt(c)), true); const c = seen.find(x => x.uid === v); if (c) { seen.splice(seen.indexOf(c), 1); A.toHand(p, c); } d.push(...seen); A.shuffleDeck(p); } }; // คุณฮาร์วี่
  E['SD05-004'] = { onAllyKw: async (A, p, src, s, kw) => { if (s === src && kw === 'โล่มนุษย์') A.addPower(src, 2, 'endTurn'); } }; // คุณอังคณา
  E['SD05-005'] = { // คุณพยาบาล
    activateLabel: 'นอน: Avatar "บึงทมิฬ People" ใบอื่นไม่ถูกทำลาย 1 ครั้ง', canActivate: (A, p, a) => !a.rested && A.avatars(p).some(x => x !== a && people(A, x)),
    activate: async (A, p, a) => { A.rest(a); const x = await pickAv(A, p, A.avatars(p).filter(y => y !== a && people(A, y)), 'เลือก "บึงทมิฬ People"'); if (x) { x.nurseUntil = A.state.turn + 1; A.log(`${x.card.name} จะไม่ถูกทำลาย 1 ครั้ง`); } },
  };
  E['SD05-006'] = { // วอเตอร์แมน
    extraSymbol: 'ปลา',
    onSummon: async (A, p) => { for (let k = 0; k < 2 && A.roomFor(p); k++) { const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && A_named(x, PEOPLE), `อัญเชิญ "บึงทมิฬ People" จาก Deck (${k + 1}/2)`, true); if (!c) break; if (await A.summonFrom(p, A.deck(p), c, { jutti: false }) && A.onField(c) && !swampLand(A)) A.rest(c); } A.shuffleDeck(p); },
  };
  E['SD05-015'] = { canUse: (A, p) => A.roomFor(p) && A.hell(p).some(c => isAvatar(c.card) && c.card.symbol === 'ปลา'), magic: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && x.symbol === 'ปลา', 'อัญเชิญ Avatar {ปลา} จากนรก'); if (c && await A.summonFrom(p, A.hell(p), c, { jutti: false }) && A.onField(c) && !swampLand(A)) A.rest(c); } }; // กำเนิดจากน้ำ
  E['SD05-016'] = { react: { on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'avatar' && A.avatars(p).some(x => x.uid === ctx.target.uid && people(A, x)), botScore: () => 2, run: async (A, p, ctx) => { allAvatars(A).filter(x => x !== ctx.attacker).forEach(x => { x.rested = !x.rested; }); A.log('เปลี่ยนสภาพ Avatar ทุกใบยกเว้นใบที่โจมตี'); return { cancelAttack: true }; } } }; // น้ำวนชักโครก
  E['SD05-017'] = { magic: true, equipOk: (A, a) => people(A, a), onEquippedAttack: async (A, p, m, a, tgt) => { const d = tgt.kind === 'avatar' && allAvatars(A).find(x => x.uid === tgt.uid); if (d && d.rested) { A.addPower(a, 1, 'endTurn'); A.addPower(d, -1, 'endTurn'); } } }; // ปืนฉมวก
  E['SD05-018'] = { // ตรีศูล ไตรตัน
    magic: true, equipOk: (A, a) => people(A, a),
    equipActivateLabel: 'ส่งใบนี้ลงนรก: วาง "บึงทมิฬ" จาก Deck', canEquipActivate: (A, p) => !A.magicUsed(p, 'land') && A.deck(p).some(c => c.card.type === 'magic' && c.card.magicType === 'land' && A_named(c.card, SWAMP)),
    equipActivate: async (A, p, m) => { A.destroyMagic(m); const c = await A.pickFrom(p, A.deck(p), x => x.type === 'magic' && x.magicType === 'land' && A_named(x, SWAMP), 'วาง "บึงทมิฬ"'); if (c) { A.markMagicUsed(p, 'land'); await A.placeLand(p, A.takeFrom(A.deck(p), c)); } A.shuffleDeck(p); },
  };
  // --- SD06 ค่ายบางระจัน
  const CAMP = 'ค่ายบางระจัน';
  const hasCamp = (A, p) => A.constructs(p).some(c => A_named(c.card, CAMP));
  const campTxt = c => (c.text || '').includes(CAMP);
  E['SD06-001'] = { controlImmune: true, continuousSelf: (A, p) => (A.state.players[p].life.every(l => l.faceUp) ? 1 : 0), lastWill: async (A, p, a) => { if (!hasCamp(A, p) || !A.hell(p).includes(a)) return; A.deck(p).push(A.takeFrom(A.hell(p), a)); A.shuffleDeck(p); A.draw(p, 1); } }; // จัน หนวดเขี้ยว
  E['SD06-002'] = { continuousSelf: (A, p) => (hasCamp(A, p) ? 2 : 0), onAttack: async (A, p, a, tgt) => { if (tgt.kind !== 'life' || !A.avatars(A.opp(p)).length) return; const x = await pickAv(A, p, A.avatars(p), 'ทำลาย Avatar ฝ่ายเรา 1 ใบ (เตะไข่)', y => (y === a ? -9 : -A.power(y))); if (x) await A.destroy(x, 'อิน สไนเปอร์', p); } }; // อิน สไนเปอร์ (approx.)
  E['SD06-004'] = { onSummon: async (A, p) => { if (A.hand(p).length < 2 || A.constructs(p).length >= 3 || !A.deck(p).some(c => A_named(c.card, CAMP) && c.card.type === 'construct')) return; if (await askYes(A, p, 'ทิ้ง 2 ใบ เพื่อก่อสร้าง "ค่ายบางระจัน"?', 2) == null) return; await A.discard(p, 2); const c = await A.pickFrom(p, A.deck(p), x => x.type === 'construct' && A_named(x, CAMP), 'ก่อสร้าง "ค่ายบางระจัน"'); if (c) { A.constructs(p).push(A.takeFrom(A.deck(p), c)); A.log(`ก่อสร้าง "${c.card.name}"`); } A.shuffleDeck(p); } }; // เมือง ช่างใหญ่
  E['SD06-005'] = { continuousSelf: (A, p) => (A.state.active !== p ? 2 : 0), substitute: (A, p, self, victim) => hasCamp(A, p) && victim !== self && campTxt(victim.card) }; // พันเรือง
  E['SD06-006'] = { lastWill: async (A, p) => { await lookTop(A, p, 5, c => isAvatar(c) && campTxt(c) && c.name !== 'พ่อแท่น ผู้นำอาวุโส', 'นำ Avatar "ค่ายบางระจัน" ขึ้นมือ', async c => A.toHand(p, c)); } }; // พ่อแท่น
  E['SD06-007'] = { // อาจารย์ธรรมโชติ
    handCounter: { on: ['constructDestroy'], when: (A, p, h, ctx) => A_named(ctx.construct.card, CAMP), label: 'อาจารย์ธรรมโชติ: ใบนี้ไปใต้ Deck แทน', botScore: () => 2, run: async (A, p, h) => { A.deck(p).push(A.takeFrom(A.hand(p), h)); return { prevent: true }; } },
    fieldCounter: { on: ['constructDestroy'], when: (A, p, a, ctx) => A_named(ctx.construct.card, CAMP), label: 'อาจารย์ธรรมโชติ: ใบนี้ไปใต้ Deck แทน', botScore: () => 2, run: async (A, p, a) => { A.takeFrom(A.state.players[p].avatars, a); A.deck(p).push(a); A.log(`${a.card.name} ไปใต้ Deck`); return { prevent: true }; } },
  };
  E['SD06-008'] = Object.assign({}, { // บุญช่วย ควายรักชาติ
    activateLabel: 'สวมใส่ใบนี้ให้ Avatar ใบอื่นของเรา', canActivate: (A, p, a) => A.avatars(p).some(x => x !== a),
    activate: async (A, p, a) => { const t = await pickAv(A, p, A.avatars(p).filter(x => x !== a), 'สวมใส่ให้ Avatar ใบไหน'); if (t) { A.takeFrom(A.state.players[p].avatars, a); await A.attach(p, a, t); } },
    equipPower: (A, host) => (hasCamp(A, host.owner) ? 2 : 1),
  });
  E['SD06-012'] = { canUse: (A, p) => A.hand(p).length >= 3, magic: async (A, p) => { await A.discard(p, 2); await tutor(c => isAvatar(c) && campTxt(c), 'นำ Avatar "ค่ายบางระจัน" ขึ้นมือ')(A, p); } }; // ผู้นำของเหล่าวีรชน
  E['SD06-013'] = { canUse: (A, p) => A.hand(p).length >= 2 && A.roomFor(p) && A.hell(p).some(c => isAvatar(c.card) && campTxt(c.card)), magic: async (A, p) => { await A.discard(p, 1); const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && campTxt(x), 'อัญเชิญ จุติ Avatar "ค่ายบางระจัน" จากนรก'); if (c && await A.summonFrom(p, A.hell(p), c, { jutti: true, fromHell: true }) && A.onField(c)) { const t = A.state.turn + 1; A.atEndOfTurn(function f(A2) { if (A2.state.turn < t) { A2.atEndOfTurn(f); return; } if (A2.onField(c)) A2.sendToHell(c); }); } } }; // วิญญาณวีรชน
  E['SD06-015'] = { react: { on: 'summon', when: (A, p, ctx) => ctx.avatar.owner !== p && A.avatars(p).some(a => campTxt(a.card)), botScore: (A, p, ctx) => (A.power(ctx.avatar) >= 5 ? 2 : 0), run: async (A, p, ctx) => { const x = await pickAv(A, p, A.avatars(p).filter(a => campTxt(a.card)), 'ทำลาย Avatar "ค่ายบางระจัน" ของเรา', a => -A.power(a)); const d = await pickAv(A, p, A.avatars(A.opp(p)), 'ทำลาย Avatar อีกฝ่าย', a => (a === ctx.avatar ? 99 : A.power(a))); if (x) await A.destroy(x, 'ปืนใหญ่ไทยประดิษฐ์', p); if (d) await A.destroy(d, 'ปืนใหญ่ไทยประดิษฐ์', p); } } }; // ปืนใหญ่ไทยประดิษฐ์
  E['SD06-016'] = { magic: true, equipOk: (A, a) => campTxt(a.card), equipKw: ['ลูกฮึด'] }; // ยันต์ผ้าประเจียด
  E['SD06-017'] = { magic: true, equipOk: (A, a) => campTxt(a.card), onEquippedBattleWin: async (A, p) => A.draw(p, 1) }; // ดาบใบข้าว X
  E['SD06-019'] = {}; // วัดคู่บ้านคู่เมือง (only matters for Construct สอดแนม, none implemented)
  E['SD06-020'] = { onLifeFlipped: async (A, p, cs) => { if (A.avatars(p).length || cs.lifeTurn === A.state.turn || !A.hand(p).length) return; cs.lifeTurn = A.state.turn; if (await askYes(A, p, 'กำแพงด่านสุดท้าย: ทิ้ง 1 ใบ เพื่อสอดแนม 1 ใบ?', 1) == null) return; await A.discard(p, 1); const c = A.deck(p).shift(); if (!c) return; A.log(`สอดแนม "${c.card.name}"`); if (isAvatar(c.card) && campTxt(c.card) && (c.card.cost || 0) <= 4 && A.roomFor(p, c.card)) await A.summonFrom(p, [], c, { jutti: false }); else A.toHand(p, c); } }; // กำแพงด่านสุดท้าย
  E['SD06-022'] = { life: async (A, p) => { A.constructs(p).forEach(c => { c.powerMod = (c.powerMod || 0) + 1; }); A.log('Construct ฝ่ายเรา POWER +1'); } }; // ไม่นะ ทองเหม็น!
  E['SD06-023'] = { life: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), x => x.type === 'construct', 'นำ Construct จากนรกขึ้นมือ', true); if (c) A.toHand(p, A.takeFrom(A.hell(p), c)); } }; // ไม่นะ บุญช่วย!
  E['SD06-024'] = { life: async (A, p) => { await lookTopBottom(A, p, 5, [{ pred: c => c.type === 'construct', title: 'นำ Construct ขึ้นมือ' }], async c => A.toHand(p, c)); } }; // ท่านผู้นำตายแล้ว!
  // --- SD07 สามก๊ก
  const isGen = (A, a) => A.named(a.card, GENERAL3) && A.isSym(a, FOREIGN);
  const genCard = c => isAvatar(c) && A_named(c, GENERAL3) && (c.symbol === FOREIGN);
  const byGeneral = (A, a) => { const s = a.summonedBy && A.cardById ? A.cardById(a.summonedBy) : null; return !!(s && A_named(s, GENERAL3) && s.symbol === FOREIGN); };
  E['SD07-003'] = { onEnter: async (A, p, a) => { if (byGeneral(A, a)) await destroyAnyFieldCard(A, p, 'แฮหัวตุ้น'); } }; // แฮหัวตุ้น
  E['SD07-004'] = { onEnter: async (A, p, a) => { if (byGeneral(A, a)) A.draw(p, 1); } }; // แฮหัวเอี๋ยน
  E['SD07-005'] = { lastWill: async (A, p) => { const x = await pickAv(A, p, A.avatars(p).filter(a => isGen(A, a)), 'Avatar "ขุนพล" POWER +2', null, true); if (x) A.addPower(x, 2, 'myNextTurn'); } }; // ซุนเกี๋ยน
  E['SD07-007'] = {}; // ลิโป้ (forced โล่มนุษย์ is not supported yet)
  E['SD07-008'] = { onSummon: async (A, p, self) => { await lookTop(A, p, 3, genCard, 'นำ "ขุนพล" {ต่างชาติ} ขึ้นมือ', async c => { if (c.card.color === 'blue' && A.roomFor(p, c.card) && await askYes(A, p, `อัญเชิญ ${c.card.name} แทน?`, 2) != null) await A.summonFrom(p, [], c, { jutti: false, by: self.card.id }); else A.toHand(p, c); }); } }; // อ้วนเสี้ยว
  E['SD07-013'] = { // คำสาบานสวนท้อ
    canUse: (A, p) => A.avatars(p).some(a => isGen(A, a)),
    magic: async (A, p) => {
      const gens = A.avatars(p).filter(a => isGen(A, a)); const pairColor = ['red', 'blue', 'green', 'purple', 'yellow', 'white', 'black'].find(col => new Set(gens.filter(g => g.card.color === col).map(g => g.card.name)).size >= 2);
      const v = pairColor ? await A.choose(p, 'คำสาบานสวนท้อ: เลือกปฏิบัติ', [{ label: '1) นำ "ขุนพล" สีเดียวกันคนละชื่อ ขึ้นมือ', value: 1, score: 1 }, { label: '2) นำ "ขุนพล" {Only#1} สีเดียวกัน ขึ้นมือ', value: 2, score: 2 }]) : 1;
      if (v === 2) { await tutor(c => genCard(c) && c.onlyOne && c.color === pairColor, 'นำ "ขุนพล" {Only#1} ขึ้นมือ')(A, p); return; }
      const g = await pickAv(A, p, gens, 'เลือก "ขุนพล" บนสนาม'); if (g) await tutor(c => genCard(c) && !c.onlyOne && c.color === g.card.color && c.name !== g.card.name, 'นำ "ขุนพล" ขึ้นมือ')(A, p);
    },
  };
  E['SD07-014'] = { canUse: (A, p) => A.avatars(p).some(a => isGen(A, a)) && A.hand(p).length >= 2 && A.avatars(A.opp(p)).some(d => A.attached(d).some(m => m.owner === d.owner && m.card.magicType === 'modification')), magic: async (A, p) => { await A.discard(p, 1); const d = await pickAv(A, p, A.avatars(A.opp(p)).filter(x => A.attached(x).some(m => m.owner === x.owner && m.card.magicType === 'modification')), 'ยึด Avatar อีกฝ่ายจนจบเทิร์น'); if (d) { A.takeControl(d, p, false); d.rested = false; d.noLifeAttack = A.state.turn; const home = A.opp(p); A.atEndOfTurn(A2 => { if (A2.onField(d) && d.owner === p) A2.takeControl(d, home, d.rested, true); }); } } }; // ยืมมือสังหาร
  E['SD07-015'] = { magic: async (A, p) => { if (A.avatars(p).filter(a => isGen(A, a)).length >= 2) A.draw(p, 2); else { A.draw(p, 1); A.draw(A.opp(p), 1); } } }; // เสบียงหลวง
  E['SD07-018'] = { magic: true, equipOk: (A, a) => isGen(A, a), equipPower: (A, a) => (A.named(a.card, 'กวนอู') ? 2 : 1) }; // ง้าวมังกรเขียว
  E['SD07-019'] = { magic: true, aura: (A, p, src, a) => (new Set(A.avatars(a.owner).map(x => x.card.color).filter(Boolean)).size >= 4 ? 2 : 0) }; // เมืองลกเอี๋ยง
  E['SD07-020'] = { aura: (A, p, src, a) => (a.owner === p && A.named(a.card, GENERAL3) && a.card.color === 'purple' ? 1 : 0) }; // ด่านเฮาโลก๋วน (สามัคคี lock not supported)
  const lifeSummonColor = col => ({ life: async (A, p) => { if (!A.roomFor(p)) return; const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && x.color === col && (x.cost || 0) <= 4, 'อัญเชิญ Avatar Cost ≤4 จากมือ', true); if (c) await A.summonFrom(p, A.hand(p), c, { jutti: false }); } });
  E['SD07-021'] = lifeSummonColor('green'); E['SD07-022'] = lifeSummonColor('blue'); E['SD07-023'] = lifeSummonColor('red');
  // --- SD08 รัททาทุย
  const rat111 = (A, c) => isAvatar(c) && c.symbol === RAT && (c.cost || 0) === 1 && (c.power || 0) === 1 && A.gem(c) === 1;
  const summonRat111 = async (A, p, zones, self) => {
    if (!A.roomFor(p)) return false; const pool = zones.flatMap(z => z); const c = await A.pickFrom(p, pool, x => rat111(A, x), 'อัญเชิญ {รัททาทุย} Cost 1 GEM 1 POWER 1', true); if (!c) return false;
    const z = zones.find(zz => zz.includes(c)); const ok = await A.summonFrom(p, z, c, { jutti: false, by: self && self.card.id }); if (z === A.deck(p)) A.shuffleDeck(p); return ok;
  };
  E['SD08-001'] = { // ไพรมอล รัททาทุย
    activateLabel: 'อัญเชิญ {รัททาทุย} 1/1/1 จาก Deck หรือนรก', canActivate: (A, p) => A.roomFor(p) && A.deck(p).concat(A.hell(p)).some(c => rat111(A, c.card)),
    activate: async (A, p, a) => { await summonRat111(A, p, [A.deck(p), A.hell(p)], a); },
    preventDestroy: async (A, p, a) => { if (a.primalTurn === A.state.turn) return false; const rs = A.hell(p).filter(c => c.card.symbol === RAT); if (rs.length < 5 || await askYes(A, p, 'เนรเทศ {รัททาทุย} 5 ใบในนรก เพื่อไม่ออกจากสนาม?', 2) == null) return false; a.primalTurn = A.state.turn; for (let k = 0; k < 5; k++) { const c = await A.pickFrom(p, A.hell(p), x => x.symbol === RAT, `เนรเทศ {รัททาทุย} (${k + 1}/5)`); if (c) A.exile(p, A.hell(p), c); } return true; },
    afterAttack: async (A, p, a) => { if (!A.onField(a) || !a.rested) return; const xs = A.avatars(p).filter(x => x !== a && x.card.symbol === RAT); if (!xs.length) return; const x = await pickAv(A, p, xs, 'เซ่นไหว้ {รัททาทุย} เพื่อให้ไพรมอลกลับมาสภาพตื่น', y => (A.avatars(A.opp(p)).length ? 1 - A.power(y) : -9), true); if (x) { await A.sacrifice(p, x); A.wake(a); A.log(`${a.card.name} กลับมาสภาพตื่น`); } },
  };
  E['SD08-003'] = { activateLabel: 'เซ่นไหว้ใบนี้: ก่อสร้าง Construct {รัททาทุย} จากมือ', canActivate: (A, p) => A.constructs(p).length < 3 && A.hand(p).some(h => h.card.type === 'construct' && h.card.symbol === RAT), activate: async (A, p, a) => { const c = await A.pickFrom(p, A.hand(p), x => x.type === 'construct' && x.symbol === RAT, 'ก่อสร้าง Construct {รัททาทุย}'); if (!c) return; await A.sacrifice(p, a); A.constructs(p).push(A.takeFrom(A.hand(p), c)); A.log(`ก่อสร้าง "${c.card.name}"`); const f = A.fx(c.card.id); if (f && f.onBuild) await f.onBuild(A, p, c); } }; // โดมรัททาทุย
  E['SD08-005'] = { activateLabel: 'เนรเทศ {รัททาทุย} ชื่อต่างกันในนรก: POWER +1 ต่อใบ', canActivate: (A, p) => A.hell(p).some(c => isAvatar(c.card) && c.card.symbol === RAT), activate: async (A, p, a) => { const used = []; while (true) { const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && x.symbol === RAT && !used.includes(x.name), `เนรเทศ {รัททาทุย} (${used.length} ใบ)`, true); if (!c) break; used.push(c.card.name); A.exile(p, A.hell(p), c); } if (used.length) A.addPower(a, used.length, 'endTurn'); } }; // รัททาทุยกินซาก
  E['SD08-006'] = { lastWill: async (A, p, a) => { await summonRat111(A, p, [A.deck(p)], a); } }; // รัททาทุย พาราไซท์
  E['SD08-007'] = { onSummon: async (A, p) => { const c = await A.pickFrom(p, A.hell(p), x => x.type === 'construct' && x.symbol === RAT, 'นำ Construct {รัททาทุย} จากนรกขึ้นมือ', true); if (c) A.toHand(p, A.takeFrom(A.hell(p), c)); } }; // รัทาทุย หัวค้อน
  E['SD08-012'] = { canUse: (A, p) => A.constructs(p).length < 3 && A.hell(p).some(c => c.card.type === 'construct' && !c.card.onlyOne && (c.card.cost || 0) <= 5), magic: async (A, p) => { let left = 5; for (let k = 0; k < 2 && A.constructs(p).length < 3; k++) { const c = await A.pickFrom(p, A.hell(p), x => x.type === 'construct' && !x.onlyOne && (x.cost || 0) <= left, `ก่อสร้าง Construct จากนรก (Cost เหลือ ${left})`, k > 0); if (!c) break; left -= c.card.cost || 0; A.constructs(p).push(A.takeFrom(A.hell(p), c)); A.log(`ก่อสร้าง "${c.card.name}"`); } } }; // กรุงโรมใน 1 วัน
  E['SD08-014'] = { canUse: (A, p) => A.roomFor(p) && A.hand(p).some(h => isAvatar(h.card) && h.card.symbol === RAT && h !== undefined), magic: async (A, p) => { let sum = 0; while (true) { const c = await A.pickFrom(p, A.hand(p), x => isAvatar(x) && x.symbol === RAT, `ทิ้ง {รัททาทุย} (Cost รวม ${sum})`, sum > 0); if (!c) break; sum += c.card.cost || 0; A.hell(p).push(A.takeFrom(A.hand(p), c)); } const c = await A.pickFrom(p, A.deck(p), x => isAvatar(x) && x.symbol === RAT && (x.cost || 0) <= sum, `อัญเชิญ {รัททาทุย} Cost ≤${sum} จาก Deck`, true); if (c) await A.summonFrom(p, A.deck(p), c, { jutti: false }); A.shuffleDeck(p); } }; // แพร่พันธ์ุทันใจ
  E['SD08-015'] = { react: { on: 'battleDestroyed', when: (A, p, ctx) => ctx.avatar.owner === p && ctx.avatar.card.symbol === RAT && A.roomFor(p) && A.deck(p).some(c => rat111(A, c.card)), botScore: () => 2, run: async (A, p) => { for (let k = 0; k < 2; k++) if (!(await summonRat111(A, p, [A.deck(p)]))) break; } } }; // รัททาท่วม
  E['SD08-016'] = { magic: true, equipOk: (A, a) => a.card.symbol === RAT, equipPower: (A, a) => A.avatars(a.owner).filter(x => x.card.symbol === RAT).length }; // นวมรัททาทุย
  E['SD08-018'] = { onBuild: async (A, p, cs) => { await summonRat111(A, p, [A.deck(p)], cs); }, activateLabel: 'อัญเชิญ {รัททาทุย} 1/1/1 จาก Deck', canActivate: (A, p) => A.roomFor(p) && A.deck(p).some(c => rat111(A, c.card)), activate: async (A, p, cs) => { await summonRat111(A, p, [A.deck(p)], cs); } }; // รังรักรัททาทุย
  E['SD08-019'] = { aura: (A, p, src, a) => (a.owner === p && rat111(A, a.card) ? 1 : 0) }; // วงล้อรัททาทุย
  E['SD08-020'] = { // บ่อหมัก รัททาทุย
    onPaidAsCost: async (A, p, pc, summoned) => { if (summoned.card.symbol !== RAT || A.constructs(p).length >= 3 || !A.hell(p).includes(pc)) return; A.constructs(p).push(A.takeFrom(A.hell(p), pc)); A.log(`ก่อสร้าง "${pc.card.name}"`); },
    onAllyDestroyedField: async (A, p, src, a) => { if (a.card.symbol !== RAT || src.drawTurn === A.state.turn) return; src.drawTurn = A.state.turn; A.draw(p, 1); },
  };
  // --- SD09 วานร
  let tokenSeq = 1e7;
  const monkeyCard = { id: 'TOKEN-MONKEY', set: 'TOKEN', name: 'Token วานร', type: 'avatar', color: 'green', cost: 1, gems: [], symbol: 'สัตว์', power: 1, keywords: [], tags: [], text: '', token: true };
  const monkeyToken = async (A, p, n) => { for (let k = 0; k < (n || 1) && A.roomFor(p, monkeyCard); k++) { const t = { uid: tokenSeq++, card: monkeyCard, owner: p }; A.state.hasTokens = true; await A.summonFrom(p, [], t, { jutti: false }); } };
  const isMonkey = (A, a) => A.named(a.card, MONKEY);
  const monkeysInHell = (A, p) => A.hell(p).filter(c => isAvatar(c.card) && A_named(c.card, MONKEY) && !c.card.token).length;
  const monkeyHandSummon = {
    noHandSummon: false, handActivateLabel: 'ทำลาย "วานร" 2 ใบของเรา: อัญเชิญใบนี้', canHandActivate: (A, p) => A.avatars(p).filter(a => isMonkey(A, a)).length >= 2,
    handActivate: async (A, p, h) => { for (let k = 0; k < 2; k++) { const x = await pickAv(A, p, A.avatars(p).filter(a => isMonkey(A, a)), `ทำลาย "วานร" (${k + 1}/2)`, a => -A.power(a)); if (x) await A.destroy(x, h.card.name, p); } if (A.roomFor(p, h.card)) await A.summonFrom(p, A.hand(p), h, { jutti: false }); },
  };
  E['SD09-001'] = Object.assign({}, monkeyHandSummon, { // หนุมาน วานรวายุ
    onBattle: async (A, p, a) => A.addPower(a, 1, 'endTurn'),
    preventDestroy: async (A, p, a, byP) => { if (byP == null || byP === p || a.hanuTurn === A.state.turn) return false; a.hanuTurn = A.state.turn; const c = A.deck(p).shift(); if (!c) return false; A.log(`สอดแนม "${c.card.name}"`); A.hell(p).push(c); return isAvatar(c.card) && A_named(c.card, MONKEY); },
  });
  E['SD09-002'] = Object.assign({}, monkeyHandSummon, { onLink: async (A, p) => monkeyToken(A, p, 2), continuousSelf: (A, p) => A.avatars(p).filter(a => a.card.token).length }); // นิลพัท
  E['SD09-003'] = { mainStart: async (A, p) => { const xs = A.avatars(A.opp(p)); if (xs.length < 2) return; const a = await pickAv(A, p, xs, 'เลือก Avatar อีกฝ่ายใบแรก', x => A.cost(x)); const b = await pickAv(A, p, xs.filter(x => x !== a), 'เลือก Avatar อีกฝ่ายใบที่สอง', x => A.cost(x)); if (!a || !b) return; const lo = Math.min(A.cost(a), A.cost(b)); [a, b].forEach(x => { x.costSetTurn = A.state.turn; x.costSet = lo; }); A.log(`Cost ของ ${a.card.name} และ ${b.card.name} เป็น ${lo} จนจบเทิร์น`); } }; // สุครีพ
  const killLowest = async (A, p) => { const xs = A.avatars(A.opp(p)); if (!xs.length) return; const lo = Math.min(...xs.map(x => A.cost(x))); for (const x of xs.filter(y => A.cost(y) === lo)) if (A.onField(x)) await A.destroy(x, 'พาลี', p); };
  E['SD09-004'] = { onSummon: killLowest, mainStart: killLowest }; // พาลี
  E['SD09-005'] = { onSummon: async (A, p) => { if (monkeysInHell(A, p) || A.hand(p).some(h => isAvatar(h.card) && A_named(h.card, MONKEY))) await monkeyToken(A, p, 1); } }; // คิงคา
  E['SD09-006'] = { lastWill: async (A, p) => { if (monkeysInHell(A, p) >= 4) await monkeyToken(A, p, 1); } }; // วานรกินซาก
  E['SD09-007'] = { onPaidAsCost: async (A, p, pc, summoned) => { if (A_named(summoned.card, MONKEY)) await monkeyToken(A, p, 1); } }; // วานรถลกหนัง
  E['SD09-008'] = { kwAura: (A, src, a) => (a.owner === src.owner && A.named(a.card, MONKEY) ? ['ลูกฮึด'] : []) }; // วานรหมวกเหล็ก
  E['SD09-009'] = { activateLabel: 'เซ่นไหว้ {สัตว์} 2 ใบ: อัญเชิญ "พาลี" จากนรก', canActivate: (A, p) => A.avatars(p).filter(a => A.isSym(a, 'สัตว์')).length >= 2 && A.hell(p).some(c => isAvatar(c.card) && A_named(c.card, 'พาลี')), activate: async (A, p) => { for (let k = 0; k < 2; k++) { const x = await pickAv(A, p, A.avatars(p).filter(a => A.isSym(a, 'สัตว์')), `เซ่นไหว้ {สัตว์} (${k + 1}/2)`, a => -A.power(a)); if (x) await A.sacrifice(p, x); } const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && A_named(x, 'พาลี'), 'อัญเชิญ "พาลี"'); if (c) await A.summonFrom(p, A.hell(p), c, { jutti: false }); } }; // ดารา นางชั่ว
  E['SD09-010'] = { lastWill: async (A, p) => { await lookTopBottom(A, p, 3, [{ pred: c => isAvatar(c) && A_named(c, MONKEY) && (c.cost || 0) <= 4, title: 'อัญเชิญ "วานร" Cost ≤4' }], async c => { if (A.roomFor(p, c.card)) await A.summonFrom(p, [], c, { jutti: false }); else A.deck(p).push(c); }); } }; // วานร ซีซ่าสลัด
  E['SD09-013'] = { canUse: (A, p) => A.avatars(A.opp(p)).length > 0 && A.hand(p).some(h => A_named(h.card, MONKEY) && h.card.id !== 'SD09-013'), magic: async (A, p) => { const c = await A.pickFrom(p, A.hand(p), x => A_named(x, MONKEY), 'ทิ้ง "วานร" จากมือ'); if (!c) return; A.hell(p).push(A.takeFrom(A.hand(p), c)); const d = await pickAv(A, p, A.avatars(A.opp(p)), 'ทำลาย Avatar อีกฝ่าย', x => A.power(x) + A.cost(x)); if (d) await A.destroy(d, 'หนุมานถวายแหวน', p); } }; // หนุมานถวายแหวน
  E['SD09-014'] = { canUse: (A, p) => A.avatars(p).some(a => isMonkey(A, a)), magic: async (A, p) => { const x = await pickAv(A, p, A.avatars(p).filter(a => isMonkey(A, a)), 'เซ่นไหว้ "วานร"', a => -A.power(a)); if (!x) return; await A.sacrifice(p, x); await lookTop(A, p, 7, c => isAvatar(c) && A_named(c, MONKEY) && (c.cost || 0) <= 5, 'เลือก "วานร" Cost ≤5', async c => { if (c.card.name === 'คิงคา วานรเจ้าป่า' && A.roomFor(p, c.card) && await askYes(A, p, 'อัญเชิญ จุติ คิงคา แทน?', 2) != null) await A.summonFrom(p, [], c, { jutti: true }); else A.toHand(p, c); }); } }; // เลือกตั้งเจ้าป่า
  E['SD09-015'] = { magic: async (A, p) => { for (const q of [p, A.opp(p)]) { const c = await A.pickFrom(q, A.hell(q), x => isAvatar(x) && (x.cost || 0) <= 4 && !x.onlyOne && !x.token, 'วาง Avatar Cost ≤4 จากนรกไว้บนสุดของ Deck', true); if (c) A.deck(q).unshift(A.takeFrom(A.hell(q), c)); } } }; // เตรียมเสบียง
  E['SD09-016'] = { react: { on: 'attack', when: (A, p) => A.avatars(p).some(a => isMonkey(A, a)), botScore: (A, p, ctx) => (A.power(ctx.attacker) >= 4 ? 2 : 0), run: async (A, p) => { const x = await pickAv(A, p, A.avatars(p).filter(a => isMonkey(A, a)), 'นำ "วานร" ไปบนสุดของ Deck', a => -A.power(a)); if (!x) return; A.toDeckTop(x); return { cancelAttack: true }; } } }; // ชีวิตเหนือหน้าที่
  E['SD09-017'] = { react: { on: 'attack', when: (A, p, ctx) => ctx.target.kind === 'avatar' && A.avatars(p).some(a => a.uid === ctx.target.uid && isMonkey(A, a)) && A.avatars(p).some(a => a.uid !== ctx.target.uid && isMonkey(A, a)), botScore: () => 1.5, run: async (A, p, ctx) => { const d = A.avatars(p).find(a => a.uid === ctx.target.uid); const x = await pickAv(A, p, A.avatars(p).filter(a => a !== d && isMonkey(A, a)), 'เซ่นไหว้ "วานร" ใบอื่น', a => -A.power(a)); if (!x) return; await A.sacrifice(p, x); if (d && A.onField(d)) A.addPower(d, 2, 'endTurn'); } } }; // วานรร้อนรัก (defending side only)
  E['SD09-018'] = { magic: true, equipOk: (A, a) => isMonkey(A, a), equipActivateLabel: 'ทำลาย Avatar ที่สวมใส่: อัญเชิญ "หนุมาน"/"นิลพัท" จากนรก', canEquipActivate: (A, p) => A.hell(p).some(c => isAvatar(c.card) && (A_named(c.card, 'หนุมาน') || A_named(c.card, 'นิลพัท'))), equipActivate: async (A, p, m, host) => { host = host || allAvatars(A).find(x => x.uid === m.attachedTo); if (host) await A.destroy(host, 'ตรีเพชร', p); const c = await A.pickFrom(p, A.hell(p), x => isAvatar(x) && (A_named(x, 'หนุมาน') || A_named(x, 'นิลพัท')), 'อัญเชิญ "หนุมาน"/"นิลพัท"'); if (c && A.roomFor(p, c.card)) await A.summonFrom(p, A.hell(p), c, { jutti: false }); } }; // ตรีเพชร
  E['SD09-019'] = { magic: true, equipOk: (A, a) => isMonkey(A, a), equipPower: 2 }; // ดาบพระขรรค์
  E['SD09-020'] = { magic: true, activateLabel: 'เซ่นไหว้ "วานร": จั่ว 1 ใบ', canActivate: (A, p) => A.avatars(p).some(a => isMonkey(A, a)), activate: async (A, p) => { const x = await pickAv(A, p, A.avatars(p).filter(a => isMonkey(A, a)), 'เซ่นไหว้ "วานร"', a => (a.card.token ? 5 : -A.power(a))); if (x) { await A.sacrifice(p, x); A.draw(p, 1); } } }; // ป่าแห่งเมืองขีดขิน
  const lifeMonkey = { life: async (A, p) => { if (monkeysInHell(A, p) >= 4) await monkeyToken(A, p, 1); } };
  E['SD09-023'] = lifeMonkey; E['SD09-024'] = lifeMonkey;
  // Reprints (same card name in a later set) use the implementation of the original printing
  (function () {
    const norm = t => String(t || '').replace(/\([^)]*\)/g, '').replace(/#.*$/gm, '').replace(/[\s.,:;!"'“”‘’\-–—]/g, '');
    const byName = {};
    (root.TC_CARDS || []).forEach(c => { if (E[c.id]) (byName[c.name] = byName[c.name] || []).push(c); });
    (root.TC_CARDS || []).forEach(c => {
      if (E[c.id] || !c.text || !byName[c.name]) return;
      // reprints often only reword the text ("ตัว" → "ใบ", reminder text), so fall back to the first implemented printing
      const src = byName[c.name].find(o => norm(o.text) === norm(c.text)) || byName[c.name][0];
      if (src) E[c.id] = E[src.id];
    });
  })();

  root.TC_EFFECTS = E;
  if (typeof module !== 'undefined') module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
