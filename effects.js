// Card effects for the starter decks (KD00–KD04).
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
  E['KD01-010'] = { continuousSelf: (A, p, a) => A.avatars(p).filter(x => A.symbol(x) === 'เทพ').length }; // หนุมาน
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
  E['KD01-019'] = { magic: true, aura: (A, owner, src, a) => (A.symbol(a) === 'เทพ' ? 1 : 0) }; // เขาไกรลาส
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
  E['KD02-019'] = { magic: true, equipPower: (A, a) => (A.symbol(a) === 'นรก' ? 1 : 0) }; // หอกแหลม
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
    canUse: (A, p) => A.roomFor(p) && A.avatars(p).some(a => A.symbol(a) === 'คน' && (a.card.cost || 0) >= 3),
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
  E['KD04-006'] = { substitute: (A, p, self, victim) => victim.card.id === 'KD04-003' }; // แอร์ชิด รีฟลักซ์
  E['KD04-007'] = { // เก๊าท์
    onSummon: async (A, p, self) => {
      if (!A.avatars(p).some(a => a !== self && A.symbol(a) === 'หุ่นยนต์' && A.named(a.card, 'ผู้กล้า'))) return;
      const d = A.deck(A.opp(p)); if (!d.length) return;
      const top = d.shift();
      if (isAvatar(top.card)) { A.hell(A.opp(p)).push(top); A.log(`เก๊าท์สอดแนม: "${top.card.name}" ถูกส่งลงนรก`); }
      else { d.push(top); A.log(`เก๊าท์สอดแนม: "${top.card.name}" ไปไว้ใต้ Deck`); }
    },
  };
  E['KD04-008'] = { equipPower: 1 };
  E['KD04-010'] = { setPower: (A, p) => A.hand(A.opp(p)).length }; // ลูกคนรวย
  E['KD04-013'] = { magic: true, equipOk: (A, a) => A.symbol(a) === 'หุ่นยนต์', equipPower: (A, a) => (A.named(a.card, 'หุ่นนักรบผู้กล้า') ? 3 : 1) };
  E['KD04-014'] = { // ไบโพล่า ชิลด์
    magic: true, equipOk: (A, a) => A.symbol(a) === 'หุ่นยนต์' && A.named(a.card, 'ผู้กล้า'),
    preventLeave: async (A, p, m) => { if (m.usedTurn === A.state.turn) return false; m.usedTurn = A.state.turn; const d = A.dice(); A.log(`ไบโพล่า ชิลด์: ทอยลูกเต๋าได้ ${d}`); return d % 2 === 0; },
  };
  E['KD04-015'] = { magic: true, equipOk: (A, a) => A.symbol(a) === 'หุ่นยนต์' };
  E['KD04-017'] = { // Micro Plaza
    magic: true,
    activateLabel: 'ทิ้ง 1: ค้นหาการ์ดสวมใส่จาก Deck',
    canActivate: (A, p) => A.hand(p).length > 0,
    activate: async (A, p) => { await A.discard(p, 1); const c = await A.pickFrom(p, A.deck(p), c => c.magicType === 'modification', 'นำการ์ดสวมใส่จาก Deck ขึ้นมือ'); if (c) A.toHand(p, A.takeFrom(A.deck(p), c)); A.shuffleDeck(p); },
  };
  E['KD04-018'] = prosper;
  E['KD04-019'] = futureMan;
  E['KD04-021'] = lifeScout5; E['KD04-022'] = { life: async (A, p) => A.battleBuff(p) }; E['KD04-023'] = lifeDraw1; E['KD04-024'] = lifeDraw1; E['KD04-025'] = lifeDraw1;

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

  root.TC_EFFECTS = E;
  if (typeof module !== 'undefined') module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
