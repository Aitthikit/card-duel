// Thai / English switch. The game itself writes Thai; in English mode every Thai text that appears
// on the page is swapped for English as it is drawn: exact strings, then patterns (game log, prompts,
// errors), then card effect text from cards_en.js. Card names and Symbols stay Thai, as on the cards.
// Anything not covered here simply stays Thai.
(function (root) {
  'use strict';
  const KEY = 'tc-duel-lang';
  const THAI = /[฀-๿]/;
  let lang = 'th';
  try { lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'th'; } catch (e) { /* storage unavailable */ }

  const COLORS = { แดง: 'Red', น้ำเงิน: 'Blue', ฟ้า: 'Blue', เขียว: 'Green', เหลือง: 'Yellow', ม่วง: 'Purple', ดำ: 'Black', ขาว: 'White', ไร้สี: 'Colorless', เทา: 'Grey' };
  const LEVELS = { ง่าย: 'Easy', ปกติ: 'Normal', ยาก: 'Hard', God: 'God' };
  // player names the game uses
  const who = s => {
    s = String(s).trim();
    if (s === 'คุณ') return 'You';
    const m = /^บอท(?: \((.+)\))?$/.exec(s);
    if (m) return 'Bot' + (m[1] ? ` (${LEVELS[m[1]] || m[1]})` : '');
    const p = /^ผู้เล่น (\d)$/.exec(s);
    return p ? 'Player ' + p[1] : s;
  };
  const whose = s => { const w = who(s); return w === 'You' ? 'your' : w + "'s"; };
  const cards = n => `${n} card${+n === 1 ? '' : 's'}`;
  const cap = x => x.replace(/^./, c => c.toUpperCase());

  // ---------- exact strings (UI) ----------
  const EXACT = {
    // start screen
    'DUEL vs BOT': 'DUEL vs BOT',
    'เลือก Deck ของทั้งสองฝ่ายแล้วดวลกับบอท · กฎตาม Rule Book ver. 3.2': 'Pick a Deck for each side and duel the bot · Rules from Rule Book ver. 3.2',
    'Deck ของคุณ': 'Your Deck', 'Deck ของบอท': "Bot's Deck", 'เริ่มก่อน': 'Who goes first',
    'สุ่ม (เป่ายิงฉุบ)': 'Random (rock-paper-scissors)', 'คุณ': 'You', 'บอท': 'Bot',
    'ระดับบอท': 'Bot level', 'ง่าย (บอทเดิม)': 'Easy (original bot)', 'ปกติ': 'Normal', 'ยาก': 'Hard', 'God (เห็นการ์ดทุกใบ)': 'God (sees every card)',
    'ความเร็วบอท': 'Bot speed', 'ช้า': 'Slow', 'เร็ว': 'Fast', 'ลาย Playmat': 'Playmat',
    '+ จัด Deck ใหม่': '+ New Deck', 'แก้ไข Deck ของคุณ': 'Edit your Deck', 'แก้ไข Deck ของบอท': "Edit bot's Deck", 'ลบ Deck': 'Delete Deck', 'นำเข้า / ส่งออก': 'Import / Export',
    'เริ่มดวล': 'Start duel', 'สุ่มจากรายการ': 'Random from the list', 'Deck ที่บันทึกไว้': 'Saved Decks', 'บอทจะสุ่ม Deck ที่พร้อมเล่นจากรายการ': 'The bot picks a random playable Deck',
    'พื้นดำ (ตาราง)': 'Black (grid)', 'รัททาทุย': 'Rattatui', 'อัปโหลดรูปเอง…': 'Upload your own…',
    'วิธีเล่นแบบย่อ': 'How to play (short)', 'ภาษา': 'Language',
    // online
    '🌐 เล่นออนไลน์กับเพื่อน (คนละเครื่อง)': '🌐 Play online with a friend (two devices)',
    'ใช้ "Deck ของคุณ" ด้านบน · คนหนึ่งสร้างห้องแล้วส่งรหัสให้อีกคนกดเข้าห้อง': 'Uses "Your Deck" above · One player creates a room and sends the code; the other joins with it',
    'ชื่อของคุณ': 'Your name', 'เช่น ต้น': 'e.g. Ton', 'สร้างห้อง': 'Create room', 'หรือ': 'or', 'รหัสห้อง': 'Room code', 'เข้าห้อง': 'Join',
    'กำลังสร้างห้อง…': 'Creating room…', 'เพื่อนเข้าห้องแล้ว กำลังเริ่มเกม…': 'Your friend joined. Starting…', 'เข้าห้องแล้ว รอเจ้าของห้องเริ่มเกม…': 'Joined. Waiting for the host to start…',
    'ส่งรหัสนี้ให้เพื่อน แล้วรอเพื่อนเข้าห้อง…': 'Send this code to your friend and wait for them to join…',
    'ใส่รหัสห้องที่เพื่อนส่งมาก่อน': "Enter your friend's room code first", 'เพื่อนออกจากเกมแล้ว': 'Your friend left the game',
    'การเชื่อมต่อกับเพื่อนหลุด': 'Lost the connection to your friend', 'เกมของสองเครื่องไม่ตรงกัน ลองเริ่มเกมใหม่': "The two devices' games differ. Try starting a new game",
    'โหลดระบบออนไลน์ไม่สำเร็จ': 'Could not load online play', 'โหลดระบบออนไลน์ไม่สำเร็จ (เช็กอินเทอร์เน็ต)': 'Could not load online play (check your internet)',
    'สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้ง': 'Could not create a room. Try again', 'รหัสห้องไม่ถูกต้อง': 'Invalid room code', 'ไม่พบห้องนี้': 'Room not found',
    'ไม่พบห้องนี้ หรือเพื่อนปิดห้องไปแล้ว': 'Room not found, or your friend closed it', 'ไม่พบห้องนี้ เช็กรหัสอีกครั้ง': 'Room not found. Check the code',
    'กลับหน้าแรก': 'Back to start', 'ออกจากห้อง': 'Leave room', 'รอเจ้าของห้องเริ่มเกมใหม่': 'Waiting for the host to start a new game',
    // builder
    'ชื่อ Deck': 'Deck name', 'เติมให้ครบ': 'Auto-fill', 'ล้าง': 'Clear', 'ยกเลิก': 'Cancel', 'บันทึก Deck': 'Save Deck', 'ชุดการ์ด': 'Card set', 'ประเภท': 'Type', 'สี': 'Color',
    'ค้นหาชื่อ / รหัส / ข้อความ': 'Search name / code / text', 'ทุกชุด': 'All sets', 'ทุกประเภท': 'All types', 'ทุกสี': 'All colors',
    'Deck ใหม่': 'New Deck', 'LIFE ครบ 5 ใบแล้ว': 'LIFE already has 5 cards', 'LIFE Card ต้องชื่อไม่ซ้ำกัน': 'LIFE Cards must all have different names', 'Main Deck ครบ 50 ใบแล้ว': 'Main Deck already has 50 cards',
    'ใส่การ์ด Only #1 ได้แค่ 1 ใบต่อ Deck': 'Only one Only #1 card per Deck', 'เติมได้ไม่ครบ 50 ใบ — เพิ่มการ์ดชื่ออื่นอีก': "Couldn't fill to 50 — add cards with other names",
    'Deck ไม่มีชื่อ': 'Untitled Deck', 'บันทึกไม่ได้ (เบราว์เซอร์ปิดการเก็บข้อมูลไว้)': "Couldn't save (the browser blocks storage)", 'บันทึก Deck แล้ว': 'Deck saved',
    'บันทึกแล้ว แต่ Deck ยังไม่ครบตามกฎ — ยังเลือกไปเล่นไม่ได้': "Saved, but the Deck doesn't meet the rules yet — it can't be played",
    '✓ พร้อมเล่น': '✓ Ready', 'เอาออก 1 ใบ': 'Remove 1', 'เพิ่ม 1 ใบ': 'Add 1', 'ชี้หรือแตะการ์ดเพื่อดูรายละเอียด': 'Point at or tap a card to see details',
    'แตะการ์ดทางซ้ายเพื่อใส่ลง Deck': 'Tap a card on the left to add it to the Deck',
    'ต้องมี Main 50 ใบ (Only #1 1 ใบ, ชื่อเดียวกันไม่เกิน 4) และ LIFE 5 ใบชื่อไม่ซ้ำ': 'You need 50 Main cards (one Only #1, max 4 of a name) and 5 LIFE cards with different names',
    'ต้องมี Main 50 ใบ (Only #1 1 แบบ, ชื่อเดียวกันไม่เกิน 4) และ LIFE 5 ใบชื่อไม่ซ้ำ': 'You need 50 Main cards (one kind of Only #1, max 4 of a name) and 5 LIFE cards with different names',
    'ต้องมีการ์ด Only #1 1 ใบ (ตอนนี้ยังไม่มี)': 'Needs one Only #1 card (none yet)', 'ยังไม่มีการ์ด Only #1': 'No Only #1 card yet',
    'LIFE Card ต้องมีชื่อไม่ซ้ำกัน': 'LIFE Cards must all have different names', 'รูปแบบไม่ถูกต้อง': 'Invalid format', 'Deck นำเข้า': 'Imported Deck',
    // duel screen
    '⚔️ Battle Phase': '⚔️ Battle Phase', 'จบเทิร์น ▶': 'End turn ▶', '📜 รายละเอียด': '📜 Details', 'รายละเอียดการ์ดและบันทึกการดวล': 'Card details and duel log',
    'แตะการ์ดเพื่อดูรายละเอียด': 'Tap a card to see details', 'บันทึกการดวล': 'Duel log', 'ออกไปหน้าเลือก Deck': 'Back to Deck select',
    'การ์ดบนมือของบอท': "Bot's hand", 'มีการ์ดสวมใส่': 'Has equipped cards', 'มือ': 'Hand', 'มิติมืด': 'Dark Zone', 'นรก': 'Hell', 'สถานะ "สาหัส"': 'Critical',
    'ใช้ได้ทั้งสองฝ่าย': 'Both players can use it', 'Magic ใช้ได้ประเภทละ 1 ครั้งต่อเทิร์น': 'One Magic of each type per turn', 'สูงสุด 3 ใบ': 'max 3',
    'LIFE Card (คว่ำ)': 'LIFE Card (face down)', 'การ์ดบนสุดของ Deck (หงายด้วยฮามดัล)': 'Top card of the Deck (face up by ฮามดัล)',
    'สั่งใช้ความสามารถจากนรก / มิติมืด': 'Activate an ability from Hell / Dark Zone', 'จบเกม': 'Game over', 'ผู้เล่นที่เริ่มก่อนเข้า Battle Phase ในเทิร์นแรกไม่ได้': 'The first player cannot enter the Battle Phase on turn 1',
    '🏆 คุณชนะ!': '🏆 You win!', 'คุณแพ้…': 'You lose…', 'เลือกเป้าหมายการโจมตี (กรอบแดง) — Esc เพื่อยกเลิก': 'Choose an attack target (red frame) — Esc to cancel',
    'Main Phase: อัญเชิญ / ใช้ Magic / สั่งใช้ความสามารถ': 'Main Phase: summon / use Magic / activate abilities', 'Main Phase: อัญเชิญ / ใช้ Magic / สั่งใช้ความสามารถ แล้วเข้า Battle Phase': 'Main Phase: summon / use Magic / activate abilities, then go to the Battle Phase',
    'Battle Phase: กด Avatar ที่ยังตื่นอยู่เพื่อโจมตี': 'Battle Phase: tap a standing Avatar to attack',
    '⚠️ เอฟเฟกต์ของการ์ดนี้ยังไม่ทำงานในเวอร์ชันนี้ (ใช้เป็น GEM / สู้ด้วย POWER ได้ตามปกติ)': "⚠️ This card's effect doesn't work in this version yet (it still works as GEM and fights with its POWER)",
    'ยืนยันจ่าย GEM': 'Confirm GEM payment', 'อัญเชิญ': 'Summon', 'ก่อสร้าง': 'Build', 'ใช้ Magic': 'Use Magic', 'โจมตี': 'Attack', 'การ์ด GEM 0 ใช้จ่ายไม่ได้': 'A GEM 0 card cannot pay',
    'ไม่ใช้': "Don't use", 'ใช้ใบที่เลือก': 'Use the selected', 'ไม่มีการ์ด': 'No cards', 'ยืนยัน': 'Confirm', 'ปิด': 'Close', 'ไม่ตอบโต้': "Don't React", 'ข้าม': 'Skip',
    'ใช้ สามัคคี / แทงหลัง ช่วยโจมตีไหม? (Avatar ที่เลือกจะเปลี่ยนเป็นสภาพนอน)': 'Use Unity / Backstab to help the attack? (the chosen Avatars become rested)',
    'จบการดวล': 'Duel over', 'ชนะ!': 'Win!', 'แพ้': 'Lose', 'ดวลอีกครั้ง': 'Duel again', 'เปลี่ยน Deck': 'Change Deck', 'ดูกระดาน': 'View board',
    'เปลี่ยนใบที่เลือก': 'Replace selected', 'เก็บไว้ทั้งหมด': 'Keep all', 'ออกจากการดวลนี้?': 'Leave this duel?', 'ออก': 'Leave', 'ลบ': 'Delete', 'ลบ Deck แล้ว': 'Deck deleted',
    'นำเข้า / ส่งออก Deck': 'Import / Export Deck', 'คัดลอกข้อความส่งออก': 'Copy export text', 'นำเข้า': 'Import', 'คัดลอกแล้ว': 'Copied', 'กด Ctrl+C เพื่อคัดลอก': 'Press Ctrl+C to copy',
    'นำเข้า Deck แล้ว': 'Deck imported', 'นำเข้าไม่ได้: ข้อความไม่ใช่ Deck ที่ถูกต้อง': "Couldn't import: that text isn't a valid Deck",
    'นำเข้า — วางข้อความ Deck ที่คัดลอกมา แล้วกด "นำเข้า"': 'Import — paste copied Deck text, then press "Import"',
    'เลือก Deck ของบอทก่อน แล้วค่อยกดแก้ไข': "Pick the bot's Deck first, then press edit", 'Starter Deck ลบไม่ได้ — เลือก Deck ที่บันทึกไว้ในช่อง "Deck ของคุณ"': 'Starter Decks cannot be deleted — pick a saved Deck under "Your Deck"',
    'รูปใหญ่เกินกว่าจะจำไว้ในเบราว์เซอร์ ใช้ได้เฉพาะรอบนี้': 'The image is too big to remember in the browser; it is used for this session only', 'เปิดรูปนี้ไม่ได้': "Couldn't open this image",
    'สาหัส!': 'CRITICAL!', 'ตาของคุณ': 'YOUR TURN', 'ตอบโต้! ': 'React! ', 'คำสั่งไม่ถูกต้อง': 'Invalid command',
    // focus strip verbs
    'โจมตี ➜': 'attacks ➜', 'สวมใส่ให้ ➜': 'equips ➜', 'ใช้ ➜': 'uses ➜', 'ใช้': 'Use', 'สั่งใช้ความสามารถ': 'activates an ability', 'ทำลาย': 'destroy', 'คำสั่งเสีย': 'Last Will',
    'ใช่': 'Yes', 'ไม่': 'No',
    // engine errors
    'เกมจบแล้ว': 'The game is over', 'มีความสามารถกำลังทำงานอยู่': 'An ability is still resolving', 'การ์ดใบนี้ใช้ได้แค่เป็น Cost': 'This card can only be used as Cost',
    'GEM บนมือไม่พอ': 'Not enough GEM in hand', 'ไม่ใช่ช่วง Main Phase': "It's not the Main Phase", 'ไม่ใช่การ์ด Magic': 'Not a Magic card', 'ไม่ใช่การ์ด Construct': 'Not a Construct card',
    'ไม่ใช่การ์ด Avatar': 'Not an Avatar card', 'ไม่มีเป้าหมาย': 'No target', 'ไม่มี Avatar ที่สวมใส่ได้': 'No Avatar can equip it', 'ไม่พบ Avatar': 'Avatar not found',
    'ใช้ได้ในเทิร์นตัวเอง': 'Only on your own turn', 'ใช้ความสามารถนี้ไม่ได้ตอนนี้': "This ability can't be used now", 'ใช้การ์ดตัวเองจ่ายไม่ได้': "A card can't pay for itself",
    'ใช้ Land Magic ไม่ได้จนจบเทิร์นนี้ (มิสทรอม่า)': "Land Magic can't be used until end of turn (มิสทรอม่า)", 'โจมตีได้เฉพาะ Battle Phase': 'You can only attack in the Battle Phase',
    'เอฟเฟกต์ของการ์ดนี้ยังไม่รองรับในเกม — ใช้เป็น GEM ได้': "This card's effect isn't supported yet — use it as GEM", 'เป้าหมายไม่ถูกต้อง': 'Invalid target',
    'เปลี่ยนการ์ดไปแล้ว': 'Already replaced cards', 'เทิร์นนี้ใช้ได้แค่ Modification Magic "อาวุธหุ่นนักรบผู้กล้า"': 'This turn you can only use Modification Magic "อาวุธหุ่นนักรบผู้กล้า"',
    'เงื่อนไขของการ์ดยังไม่ครบ': "The card's conditions aren't met", 'อีกฝ่ายทำให้ใช้ Land Magic ไม่ได้': "Your opponent stops you using Land Magic", 'ยังจบเทิร์นไม่ได้': "You can't end the turn yet",
    'มี Construct ชื่อนี้อยู่แล้ว': 'A Construct with this name is already out', 'ทำได้เฉพาะ Main Phase ของตัวเอง': 'Only in your own Main Phase', 'จ่าย GEM เกินจำเป็น (มีการ์ดที่ไม่ต้องใช้)': 'Overpaying GEM (a card is not needed)',
    'การ์ดนี้อัญเชิญจากบนมือไม่ได้ (กฎประจำตัวการ์ด)': "This card can't be summoned from hand (card rule)", 'React Magic ใบนี้ใช้ได้เมื่อเงื่อนไขเกิดขึ้น (เกมจะถามเอง)': 'This React Magic is used when its condition happens (the game will ask)',
    'Cost 0 ไม่ต้องจ่าย GEM': 'Cost 0 needs no GEM', 'Construct Zone เต็ม': 'Construct Zone is full', 'Avatar อยู่ในสภาพนอน': 'The Avatar is rested',
    // log lines without names
    'การโจมตีถูกยกเลิก': 'The attack was cancelled', 'เทิร์นถูกบังคับให้จบทันที': 'The turn was forced to end',
    // common prompts
    'เลือกปฏิบัติ': 'Choose one', 'เลือก Avatar จากนรก': 'Choose an Avatar from Hell', 'เลือก Avatar จาก Deck': 'Choose an Avatar from the Deck', 'ทำลาย Avatar อีกฝ่าย 1 ใบ': "Destroy 1 of your opponent's Avatars",
    'นำการ์ดสวมใส่จาก Deck ขึ้นมือ': 'Add an equip card from the Deck to hand', 'นำ Normal Magic จากนรกขึ้นมือ': 'Add a Normal Magic from Hell to hand', 'เลือก Avatar อีกฝ่าย นำกลับขึ้นมือ': "Choose an opponent's Avatar to return to hand",
    'นำ Land Magic จาก Deck มาเล่น': 'Play a Land Magic from the Deck', 'ทิ้งการ์ด 1 ใบ': 'Discard 1 card',
  };
  const WIN_REASONS = { 'ได้รับความเสียหายต่อ LIFE ขณะอยู่ในสถานะ "สาหัส"': 'took LIFE damage while Critical', 'การ์ดใน Deck หมด': 'ran out of cards in the Deck' };
  const PHASES = { 'Draw Phase': 'Draw Phase', 'Main Phase': 'Main Phase', 'Battle Phase': 'Battle Phase', 'End Phase': 'End Phase' };
  const reactWhat = s => {
    let m;
    if ((m = /^(.+) ถูกอัญเชิญ$/.exec(s))) return `${m[1]} was summoned`;
    if ((m = /^อีกฝ่ายใช้ "(.+)"$/.exec(s))) return `opponent used "${m[1]}"`;
    if ((m = /^(.+) กำลังโจมตี LIFE ของ(.+)$/.exec(s))) return `${m[1]} is attacking ${whose(m[2])} LIFE`;
    if ((m = /^(.+) กำลังโจมตี ?(.*)$/.exec(s))) return `${m[1]} is attacking${m[2] ? ' ' + m[2] : ''}`;
    if ((m = /^(.+) กำลังจะถูกทำลาย$/.exec(s))) return `${m[1]} is about to be destroyed`;
    if ((m = /^(.+) ถูกทำลายจากการต่อสู้$/.exec(s))) return `${m[1]} was destroyed in battle`;
    if ((m = /^(.+) ถูกทำลายโดยอีกฝ่าย$/.exec(s))) return `${m[1]} was destroyed by the opponent`;
    if ((m = /^อีกฝ่ายสั่งใช้ความสามารถของ (.+)$/.exec(s))) return `opponent activated ${m[1]}'s ability`;
    if (s === 'อีกฝ่ายเริ่ม Battle Phase') return 'opponent started the Battle Phase';
    if ((m = /^คำสั่งเสีย ของ (.+)$/.exec(s))) return `Last Will of ${m[1]}`;
    return s;
  };
  const gemList = s => s.split(', ').join(', ');

  // ---------- patterns (log, prompts, errors with values) ----------
  const P = [
    [/^(.+) จั่วการ์ด (\d+) ใบ$/, m => `${who(m[1])} drew ${cards(m[2])}`],
    [/^— เทิร์น (\d+): (.+) —$/, m => `— Turn ${m[1]}: ${who(m[2])} —`],
    [/^💀 (.+) ถูกทำลายลงนรก \((.+)\)$/, m => `💀 ${m[1]} was destroyed (${m[2] === 'แพ้การต่อสู้' ? 'lost the battle' : m[2]})`],
    [/^💀 (.+) ถูกทำลายลงนรก$/, m => `💀 ${m[1]} was destroyed`],
    [/^⚔️ (.+) โจมตี (.+)$/, m => `⚔️ ${m[1]} attacks ${m[2]}`],
    [/^(.+) \(POWER (-?\d+)\) ต่อสู้กับ (.+) \(POWER (-?\d+)\)$/, m => `${m[1]} (POWER ${m[2]}) battles ${m[3]} (POWER ${m[4]})`],
    [/^(.+) เข้าสู่ Battle Phase$/, m => `${who(m[1])} entered the Battle Phase`],
    [/^ความสามารถ LIFE "(.+)" ทำงาน$/, m => `LIFE ability of "${m[1]}" triggers`],
    [/^(.+) สั่งใช้ความสามารถของ "(.+)"$/, m => `${who(m[1])} activated "${m[2]}"`],
    [/^(.+) สั่งใช้ความสามารถที่ได้จาก "(.+)"$/, m => `${who(m[1])} activated the ability from "${m[2]}"`],
    [/^(.+) สั่งใช้ "(.+)" จากบนมือ$/, m => `${who(m[1])} activated "${m[2]}" from hand`],
    [/^(.+) สั่งใช้ "(.+)" จากนรก$/, m => `${who(m[1])} activated "${m[2]}" from Hell`],
    [/^(.+) สั่งใช้ "(.+)" จากมิติมืด$/, m => `${who(m[1])} activated "${m[2]}" from the Dark Zone`],
    [/^⚡ (.+) สั่งใช้ "(.+)" จากบนมือ$/, m => `⚡ ${who(m[1])} activated "${m[2]}" from hand`],
    [/^⚡ (.+) ใช้ความสามารถของ (.+)$/, m => `⚡ ${who(m[1])} used ${m[2]}'s ability`],
    [/^"(.+)" สวมใส่ให้ (.+)$/, m => `"${m[1]}" equipped to ${m[2]}`],
    [/^"(.+)" ย้ายมาสวมใส่ให้ (.+)$/, m => `"${m[1]}" moved to ${m[2]}`],
    [/^(.+) \(POWER (-?\d+)\) โจมตีเข้า LIFE ของ (.+)$/, m => `${m[1]} (POWER ${m[2]}) hits ${whose(m[3])} LIFE`],
    [/^(.+) นำ "(.+)" ขึ้นมือ$/, m => `${who(m[1])} added "${m[2]}" to hand`],
    [/^"(.+)" ที่สวมใส่อยู่ถูกส่งลงนรก$/, m => `Equipped "${m[1]}" was sent to Hell`],
    [/^(.+) ทิ้งการ์ด (\d+) ใบ$/, m => `${who(m[1])} discarded ${cards(m[2])}`],
    [/^💔 LIFE ของ (.+) ถูกหงาย: "(.+)" \((\d+) ใบที่เหลือ\)$/, m => `💔 ${cap(whose(m[1]))} LIFE turned face up: "${m[2]}" (${m[3]} left)`],
    [/^(.+) อัญเชิญ (.+) \(POWER (-?\d+)\) — ทิ้ง (.+) เป็น GEM$/, m => `${who(m[1])} summoned ${m[2]} (POWER ${m[3]}) — paid ${gemList(m[4])} as GEM`],
    [/^(.+) อัญเชิญ (.+) \(POWER (-?\d+)\)$/, m => `${who(m[1])} summoned ${m[2]} (POWER ${m[3]})`],
    [/^(.+) สอดแนม (\d+) ใบ$/, m => `${who(m[1])} scouted ${m[2]}`],
    [/^(.+) ใช้ (Normal|Land|Modification|React) Magic "(.+)"$/, m => `${who(m[1])} used ${m[2]} Magic "${m[3]}"`],
    [/^(.+) วาง Land Magic "(.+)"$/, m => `${who(m[1])} placed Land Magic "${m[2]}"`],
    [/^⚡ (.+) ตอบโต้ด้วย React Magic "(.+)"$/, m => `⚡ ${who(m[1])} reacted with React Magic "${m[2]}"`],
    [/^เทิร์นนี้ใช้ Modification Magic "(.+)" ได้ (\d+) ใบ \(และใช้ใบอื่นไม่ได้\)$/, m => `This turn: up to ${m[2]} Modification Magic "${m[1]}" (and no others)`],
    [/^(.+) เปลี่ยนการ์ดบนมือ (\d+) ใบ$/, m => `${who(m[1])} replaced ${cards(m[2])} in hand`],
    [/^(.+) ได้เริ่มเล่นก่อน$/, m => `${who(m[1])} goes first`],
    [/^(.+) ธรณีสูบ (\d+) ใบ: (.+)$/, m => `${who(m[1])} milled ${m[2]}: ${m[3]}`],
    [/^"(.+)": ทั้งสองฝ่ายธรณีสูบ (\d+) ใบ$/, m => `"${m[1]}": both players mill ${m[2]}`],
    [/^ผลของ "(.+)" ถูกยกเลิก$/, m => `The effect of "${m[1]}" was cancelled`],
    [/^Land Magic "(.+)" ถูกส่งลงนรก$/, m => `Land Magic "${m[1]}" was sent to Hell`],
    [/^Land Magic "(.+)" ถูกทำลาย$/, m => `Land Magic "${m[1]}" was destroyed`],
    [/^⚠️ (.+) เข้าสู่สถานะ "สาหัส" — โดนอีกครั้งเดียวแพ้$/, m => `⚠️ ${who(m[1])} ${who(m[1]) === 'You' ? 'are' : 'is'} Critical — one more hit loses`],
    [/^🏁 (.+) แพ้: (.+)$/, m => `🏁 ${who(m[1])} lost: ${WIN_REASONS[m[2]] || m[2]}`],
    [/^"(.+)" ถูกเนรเทศ$/, m => `"${m[1]}" was banished`],
    [/^(.+) ถูกเนรเทศ$/, m => `${m[1]} was banished`],
    [/^(.+) ถูกส่งลงนรก$/, m => `${m[1]} was sent to Hell`],
    [/^(.+) ถูกเซ่นไหว้ลงนรก$/, m => `${m[1]} was sacrificed`],
    [/^(.+) ไปอยู่ใต้ Deck$/, m => `${m[1]} went to the bottom of the Deck`],
    [/^(.+) กลับขึ้นมือ$/, m => `${m[1]} returned to hand`],
    [/^(.+) กลับมาสภาพตื่น$/, m => `${m[1]} stands up`],
    [/^(.+) สูญเสียความสามารถทั้งหมดจนจบเทิร์น$/, m => `${m[1]} loses all abilities until end of turn`],
    [/^(.+) ก่อสร้าง (.+)$/, m => `${who(m[1])} built ${m[2]}`],
    [/^เป้าหมายการโจมตีเปลี่ยนเป็น (.+)$/, m => `The attack target changed to ${m[1]}`],
    [/^LIFE: Avatar ทุกใบ POWER ([+-]\d+)$/, m => `LIFE: all Avatars POWER ${m[1]}`],
    [/^POWER (\d+) — ไม่ทำความเสียหายต่อ LIFE$/, m => `POWER ${m[1]} — no LIFE damage`],
    // prompts
    [/^ตอบโต้\? \((.+)\)$/, m => `React? (${reactWhat(m[1])})`],
    [/^ทิ้งการ์ดบนมือ (\d+) ใบ$/, m => `Discard ${cards(m[1])} from your hand`],
    [/^ทิ้งการ์ดบนมือให้เหลือ (\d+) ใบ \(เลือก (\d+) ใบ\)$/, m => `Discard down to ${m[1]} cards (choose ${m[2]})`],
    [/^ใช้ "(.+)"$/, m => `Use "${m[1]}"`],
    [/^สวมใส่ "(.+)" ให้(?: Avatar)? ?ใบไหน$/, m => `Equip "${m[1]}" to which Avatar?`],
    [/^(.+): คุณเป็นผู้เลือกเป้าหมายการโจมตี$/, m => `${m[1]}: you choose the attack target`],
    [/^อัญเชิญ "(.+)" จากมือ \(จ่าย Cost\) เพื่อรับการโจมตี\?$/, m => `Summon "${m[1]}" from hand (pay its Cost) to take the attack?`],
    [/^(.+): ย้ายเป้าหมายการโจมตีมาที่การ์ดใบนี้\?$/, m => `${m[1]}: move the attack to this card?`],
    [/^ทำลาย "(.+)" ที่สวมใส่อยู่ แทน "(.+)"\?$/, m => `Destroy equipped "${m[1]}" instead of "${m[2]}"?`],
    [/^ทำลาย "(.+)" แทน "(.+)"\?$/, m => `Destroy "${m[1]}" instead of "${m[2]}"?`],
    [/^นำ "(.+)" ขึ้นมือ$/, m => `Add "${m[1]}" to hand`],
    [/^นำ "(.+)" จาก Deck ขึ้นมือ$/, m => `Add "${m[1]}" from the Deck to hand`],
    [/^อัญเชิญ "(.+)" จากนรก$/, m => `Summon "${m[1]}" from Hell`],
    [/^อัญเชิญ "(.+)" จากมิติมืด$/, m => `Summon "${m[1]}" from the Dark Zone`],
    [/^สวมใส่ "(.+)" จาก Deck$/, m => `Equip "${m[1]}" from the Deck`],
    [/^สวมใส่ "(.+)" จากนรก$/, m => `Equip "${m[1]}" from Hell`],
    [/^จุติ: (.+)$/, m => `Incarnate: ${tr(m[1])}`],
    [/^ส่ง "(.+)" ลงนรก$/, m => `Send "${m[1]}" to Hell`],
    [/^นำ Avatar (\d+) ใบขึ้นมือ$/, m => `Add ${m[1]} Avatar to hand`],
    // start / mulligan / UI with values
    [/^(.+)ได้เริ่มก่อน — เลือกการ์ดที่ต้องการเปลี่ยน \(นำไปไว้ใต้ Deck แล้วจั่วใหม่\) หรือกด "เก็บไว้ทั้งหมด"$/, m => `${m[1].trim() === 'คุณ' ? 'You go' : who(m[1]) + ' goes'} first — choose cards to replace (they go under the Deck and you draw again) or press "Keep all"`],
    [/^รอ (.+) เลือกการ์ด…$/, m => `Waiting for ${who(m[1])} to choose…`],
    [/^รอ (.+) ตัดสินใจ…$/, m => `Waiting for ${who(m[1])} to decide…`],
    [/^(.+) กำลังเล่น…$/, m => `${who(m[1])} is playing…`],
    [/^ตาของ(.+)$/, m => `${who(m[1]).toUpperCase()}'S TURN`],
    [/^เทิร์น (\d+) · ตาคุณ$/, m => `Turn ${m[1]} · Your turn`],
    [/^เทิร์น (\d+) · ตา(.+)$/, m => `Turn ${m[1]} · ${whose(m[2]).replace(/^./, c => c.toUpperCase())} turn`],
    [/^บอท \((.+)\)$/, m => who(m[0])],
    [/^✓ พร้อมเล่น · Main (\d+) · LIFE (\d+)$/, m => `✓ Ready · Main ${m[1]} · LIFE ${m[2]}`],
    [/^ยังเล่นไม่ได้: (.+)$/, m => `Not playable yet: ${tr(m[1])}`],
    [/^Deck (ของคุณ|ของบอท) ยังเล่นไม่ได้: (.+)$/, m => `${m[1] === 'ของคุณ' ? 'Your' : "The bot's"} Deck isn't playable yet: ${tr(m[2])}`],
    [/^Deck ของคุณยังเล่นไม่ได้: (.+)$/, m => `Your Deck isn't playable yet: ${tr(m[1])}`],
    [/^Main Deck ต้องมี (\d+) ใบพอดี \(ตอนนี้ (\d+)\)$/, m => `The Main Deck needs exactly ${m[1]} cards (now ${m[2]})`],
    [/^ต้องมีการ์ด Only #1 1 ใบพอดี \(ตอนนี้ (\d+)\)$/, m => `Needs exactly one Only #1 card (now ${m[1]})`],
    [/^ใส่การ์ด Only #1 ได้แค่ 1 แบบ \(ตอนนี้ (\d+) แบบ: (.+)\)$/, m => `Only one kind of Only #1 card per Deck (now ${m[1]}: ${m[2]})`],
    [/^ใส่การ์ด Only #1 ได้แค่ 1 แบบต่อ Deck \(มี "(.+)" อยู่แล้ว\)$/, m => `Only one kind of Only #1 card per Deck ("${m[1]}" is already in)`],
    [/^Only #1 (\d)\/1 \((\d+) ใบ\)$/, m => `Only #1 ${m[1]}/1 (${cards(m[2])})`],
    [/^เอา (.+) ออก 1 ใบ$/, m => `Remove 1 ${m[1]}`],
    [/^เพิ่ม (.+) 1 ใบ$/, m => `Add 1 ${m[1]}`],
    [/^"(.+)" ใส่ได้ไม่เกิน (\d+) ใบ(?: \(ตอนนี้ (\d+)\))?$/, m => `"${m[1]}": at most ${m[2]}${m[3] ? ` (now ${m[3]})` : ''}`],
    [/^LIFE Deck ต้องมี (\d+) ใบ \(ตอนนี้ (\d+)\)$/, m => `The LIFE Deck needs ${m[1]} cards (now ${m[2]})`],
    [/^(.+) \(ยังไม่ครบ\)$/, m => `${m[1]} (incomplete)`],
    [/^(.+) \(แก้ไข\)$/, m => `${m[1]} (edited)`],
    [/^ลบ Deck "(.+)"\?$/, m => `Delete Deck "${m[1]}"?`],
    [/^ส่งออก Deck "(.*)" — คัดลอกข้อความนี้เก็บไว้ หรือส่งให้เพื่อน$/, m => `Export Deck "${m[1]}" — copy this text to keep it or send it to a friend`],
    [/^(\d+) ใบ$/, m => cards(m[1])],
    [/^สูงสุด (\d+) ใบ$/, m => `max ${m[1]}`],
    [/^นรก (\d+)$/, m => `Hell ${m[1]}`],
    [/^กองจั่ว (\d+)$/, m => `Deck ${m[1]}`],
    [/^สั่งใช้จากนรก\/มิติมืด \((\d+)\)$/, m => `Activate from Hell/Dark Zone (${m[1]})`],
    [/^(.+) \(มิติมืด\): (.+)$/, m => `${m[1]} (Dark Zone): ${tr(m[2])}`],
    [/^(นรก|มิติมืด) ของ (.+) \((\d+) ใบ\)$/, m => `${whose(m[2]).replace(/^./, c => c.toUpperCase())} ${m[1] === 'นรก' ? 'Hell' : 'Dark Zone'} (${cards(m[3])})`],
    [/^ยืนยัน \((\d+)\/(\d+)\)$/, m => `Confirm (${m[1]}/${m[2]})`],
    [/^เลือกการ์ดบนมือเพื่อจ่าย GEM: (\d+)\/(\d+) \(สี(.+)หรือไร้สี\) — แล้วกด "ยืนยัน"$/, m => `Choose cards in hand to pay GEM: ${m[1]}/${m[2]} (${COLORS[m[3]] || m[3]} or Colorless) — then press "Confirm"`],
    [/^(.+) แพ้เพราะ (.+)$/, m => `${who(m[1])} lost because ${who(m[1]) === 'You' ? 'you' : 'they'} ${WIN_REASONS[m[2]] || tr(m[2])}`],
    [/^จบในเทิร์นที่ (\d+)$/, m => `Ended on turn ${m[1]}`],
    [/^LIFE ของ(.+)$/, m => `${whose(m[1]).replace(/^./, c => c.toUpperCase())} LIFE`],
    [/^\((ของคุณ|ของ(.+))\)$/, m => m[1] === 'ของคุณ' ? '(yours)' : `(${whose(m[2])})`],
    [/^(.+) \((ของคุณ|ของ(.+))\)$/, m => `${m[1]} (${m[2] === 'ของคุณ' ? 'yours' : whose(m[3])})`],
    [/^การ์ดบนมือของ(.+)$/, m => `${whose(m[1]).replace(/^./, c => c.toUpperCase())} hand`],
    [/^กำลังเข้าห้อง (.+)…$/, m => `Joining room ${m[1]}…`],
    [/^(.+) เกมนี้จบลงแล้ว$/, m => `${tr(m[1])}. This game is over`],
    [/^สร้างห้องไม่สำเร็จ: (.+)$/, m => `Could not create a room: ${m[1] === 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' ? "can't reach the server" : m[1]}`],
    [/^เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: (.+)$/, m => `Can't reach the server: ${m[1]}`],
    [/^เชื่อมต่อไม่สำเร็จ: (.+)$/, m => `Connection failed: ${m[1]}`],
    [/^เกิดข้อผิดพลาด: (.+)$/, m => `Error: ${m[1]}`],
    [/^บอทเกิดข้อผิดพลาด: (.+)$/, m => `Bot error: ${m[1]}`],
    [/^รหัสห้อง$/, () => 'Room code'],
    // engine errors with values
    [/^ใช้ Land Magic ไม่ได้ \("(.+)"\)$/, m => `Land Magic can't be used ("${m[1]}")`],
    [/^ใช้ (\w+) Magic ไม่ได้ \((.+)\)$/, m => `${m[1]} Magic can't be used (${m[2]})`],
    [/^ใช้ (\w+) Magic ไปแล้วในเทิร์นนี้ \(ประเภทละ 1 ครั้งต่อเทิร์น\)$/, m => `Already used ${m[1]} Magic this turn (one of each type per turn)`],
    [/^GEM ไม่พอ \((\d+)\/(\d+)\)$/, m => `Not enough GEM (${m[1]}/${m[2]})`],
    [/^GEM สี (\w+) ของ "(.+)" ใช้กับการ์ดสี (\w+) ไม่ได้$/, m => `${m[1]} GEM of "${m[2]}" can't pay for a ${m[3]} card`],
    [/^Avatar Zone เต็ม \(สูงสุด (\d+) ใบ\)$/, m => `Avatar Zone is full (max ${m[1]})`],
    [/^(.+) มี GEM 0 ใช้จ่ายไม่ได้$/, m => `${m[1]} has GEM 0 and can't pay`],
    [/^"(.+)" ใช้จ่ายให้การ์ดนี้ไม่ได้ \(กฎประจำตัวการ์ด\)$/, m => `"${m[1]}" can't pay for this card (card rule)`],
    // detail meta: "Avatar · Cost 3 · GEM 1 · สีแดง · Symbol เทพ"
    [/สี(แดง|น้ำเงิน|ฟ้า|เขียว|เหลือง|ม่วง|ดำ|ขาว|เทา)/g, m => COLORS[m[1]], true],
    [/(\d+) ไร้สี/g, m => `${m[1]} Colorless`, true],
  ];

  let cardText = null; // Thai effect text -> English
  function cardEn(s) {
    if (!cardText) {
      cardText = new Map();
      const en = root.TC_CARD_TEXT_EN || { text: [], ids: {} };
      (root.TC_CARDS || []).forEach(c => { const i = en.ids[c.id]; if (c.text && i != null) cardText.set(c.text.trim(), en.text[i]); });
    }
    return cardText.get(s);
  }

  // English for one Thai string (or the string itself when nothing matches)
  function tr(s) {
    if (s == null || !THAI.test(s)) return s;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    const core = s.trim();
    if (EXACT[core] != null) return lead + EXACT[core] + trail;
    const c = cardEn(core); if (c) return lead + c + trail;
    let out = core;
    for (const [re, fn, inline] of P) {
      if (inline) { out = out.replace(re, (...a) => fn(a)); continue; }
      const m = re.exec(out);
      if (m) { out = fn(m); break; }
    }
    if (out !== core && THAI.test(out) && EXACT[out.trim()] != null) out = EXACT[out.trim()];
    return lead + out + trail;
  }
  const t = s => (lang === 'en' ? tr(s) : s);

  // ---------- page translation ----------
  const orig = new WeakMap();      // text node -> Thai original
  const origAttr = new WeakMap();  // element -> {attr: Thai}
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  let busy = false;
  function doNode(n) {
    if (n.nodeType === 3) {
      const v = n.nodeValue;
      if (lang === 'en') {
        if (!THAI.test(v)) return;
        const e = tr(v);
        if (e !== v) { orig.set(n, v); n.nodeValue = e; }
      } else if (orig.has(n)) { n.nodeValue = orig.get(n); orig.delete(n); }
      return;
    }
    if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'TEXTAREA') return;
    if (n.hasAttribute('data-en')) swapHtml(n);
    for (const a of ATTRS) {
      if (!n.hasAttribute(a)) continue;
      const v = n.getAttribute(a), saved = origAttr.get(n) || {};
      if (lang === 'en') { if (THAI.test(v)) { const e = tr(v); if (e !== v) { saved[a] = v; origAttr.set(n, saved); n.setAttribute(a, e); } } }
      else if (saved[a] != null) { n.setAttribute(a, saved[a]); delete saved[a]; }
    }
    for (let c = n.firstChild; c; c = c.nextSibling) doNode(c);
  }
  // blocks with a ready-made English version in data-en (e.g. the how-to list)
  const htmlTh = new WeakMap();
  function swapHtml(el) {
    if (lang === 'en') { if (!htmlTh.has(el)) { htmlTh.set(el, el.innerHTML); el.innerHTML = el.getAttribute('data-en'); } }
    else if (htmlTh.has(el)) { el.innerHTML = htmlTh.get(el); htmlTh.delete(el); }
  }
  function translatePage() { busy = true; try { doNode(document.body); } finally { busy = false; } }
  let obs = null;
  function watch() {
    if (obs || typeof MutationObserver === 'undefined') return;
    obs = new MutationObserver(list => {
      if (busy || lang !== 'en') return;
      busy = true;
      try {
        for (const m of list) {
          if (m.type === 'childList') m.addedNodes.forEach(doNode);
          else if (m.type === 'characterData') { if (THAI.test(m.target.nodeValue)) doNode(m.target); }
          else if (m.type === 'attributes' && ATTRS.includes(m.attributeName)) doNode(m.target.cloneNode ? m.target : m.target);
        }
      } finally { busy = false; }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function setLang(l) {
    lang = l === 'en' ? 'en' : 'th';
    try { localStorage.setItem(KEY, lang); } catch (e) { /* ignore */ }
    document.documentElement.lang = lang;
    document.querySelectorAll('.langsel').forEach(s => { s.value = lang; });
    translatePage();
    listeners.forEach(f => { try { f(lang); } catch (e) { /* ignore */ } });
  }
  const listeners = [];
  function init() {
    document.querySelectorAll('.langsel').forEach(s => { s.value = lang; s.onchange = () => setLang(s.value); });
    watch();
    if (lang === 'en') setLang('en');
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }

  root.TCI18N = { tr, t, setLang, get lang() { return lang; }, onChange: f => listeners.push(f), cardEn: s => cardEn(s) };
})(typeof window !== 'undefined' ? window : globalThis);
