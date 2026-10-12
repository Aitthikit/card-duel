// Online play: one player per PC, linked peer-to-peer with PeerJS (its free public server only
// introduces the two browsers; game data then goes directly between them). Room codes are short
// and readable. With ?loop in the URL, two tabs of the same browser talk over a BroadcastChannel
// instead, which is handy for testing without the internet.
(function (root) {
  'use strict';
  const PEERJS = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const PREFIX = 'tcduel-v1-';
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const loop = /[?&]loop\b/.test(root.location ? root.location.search : '');

  const newCode = () => Array.from({ length: 5 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
  const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  let peerjs = null;
  function loadPeerJS() {
    if (root.Peer) return Promise.resolve(root.Peer);
    if (peerjs) return peerjs;
    peerjs = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = PEERJS; s.async = true;
      s.onload = () => (root.Peer ? resolve(root.Peer) : reject(new Error('โหลดระบบออนไลน์ไม่สำเร็จ')));
      s.onerror = () => { peerjs = null; reject(new Error('โหลดระบบออนไลน์ไม่สำเร็จ (เช็กอินเทอร์เน็ต)')); };
      document.head.appendChild(s);
    });
    return peerjs;
  }

  // A link to the other player: send(obj), and the handlers onmessage(obj) / onclose().
  function makeLink(sendRaw, closeRaw) {
    const link = { open: true, onmessage: null, onclose: null };
    link.send = obj => { if (link.open) sendRaw(obj); };
    link.close = () => { if (!link.open) return; link.open = false; try { closeRaw(); } catch (e) { /* already gone */ } };
    link._recv = obj => { if (link.open && link.onmessage) link.onmessage(obj); };
    link._closed = () => { if (!link.open) return; link.open = false; if (link.onclose) link.onclose(); };
    return link;
  }

  function wrapConn(conn, peer) {
    const link = makeLink(o => conn.send(o), () => { conn.close(); peer.destroy(); });
    conn.on('data', d => link._recv(d));
    conn.on('close', () => link._closed());
    conn.on('error', () => link._closed());
    peer.on('disconnected', () => { /* the signalling server dropped; the direct link may still work */ });
    return link;
  }

  // Create a room. onCode(code) fires once the room is listed; resolves with the link when a friend joins.
  async function host(onCode) {
    if (loop) {
      const code = newCode();
      const ch = new BroadcastChannel(PREFIX + code);
      onCode(code);
      return new Promise(resolve => {
        let link = null;
        ch.onmessage = e => {
          const m = e.data;
          if (m && m.__join && !link) { link = makeLink(o => ch.postMessage({ __d: o }), () => { ch.postMessage({ __bye: 1 }); ch.close(); }); ch.postMessage({ __welcome: 1 }); resolve(link); return; }
          if (!link) return;
          if (m.__bye) link._closed(); else if (m.__d) link._recv(m.__d);
        };
      });
    }
    const Peer = await loadPeerJS();
    for (let tries = 0; tries < 4; tries++) {
      const code = newCode();
      const peer = new Peer(PREFIX + code, { debug: 0 });
      const opened = await new Promise(resolve => {
        peer.on('open', () => resolve(true));
        peer.on('error', err => resolve(err && err.type === 'unavailable-id' ? false : err));
      });
      if (opened === false) { peer.destroy(); continue; }
      if (opened !== true) { peer.destroy(); throw new Error('สร้างห้องไม่สำเร็จ: ' + ((opened && opened.type) || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')); }
      onCode(code, () => peer.destroy());
      return new Promise(resolve => {
        peer.on('connection', conn => {
          conn.on('open', () => { if (resolve) { resolve(wrapConn(conn, peer)); resolve = null; } else conn.close(); });
        });
      });
    }
    throw new Error('สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้ง');
  }

  // Join a friend's room by its code.
  async function join(code) {
    code = cleanCode(code);
    if (code.length < 4) throw new Error('รหัสห้องไม่ถูกต้อง');
    if (loop) {
      const ch = new BroadcastChannel(PREFIX + code);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => { ch.close(); reject(new Error('ไม่พบห้องนี้')); }, 4000);
        let link = null;
        ch.onmessage = e => {
          const m = e.data;
          if (m && m.__welcome && !link) { clearTimeout(t); link = makeLink(o => ch.postMessage({ __d: o }), () => { ch.postMessage({ __bye: 1 }); ch.close(); }); resolve(link); return; }
          if (!link) return;
          if (m.__bye) link._closed(); else if (m.__d) link._recv(m.__d);
        };
        ch.postMessage({ __join: 1 });
      });
    }
    const Peer = await loadPeerJS();
    const peer = new Peer({ debug: 0 });
    await new Promise((resolve, reject) => { peer.on('open', resolve); peer.on('error', e => reject(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ' + (e && e.type)))); });
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { peer.destroy(); reject(new Error('ไม่พบห้องนี้ หรือเพื่อนปิดห้องไปแล้ว')); }, 15000);
      peer.on('error', e => { clearTimeout(t); peer.destroy(); reject(new Error(e && e.type === 'peer-unavailable' ? 'ไม่พบห้องนี้ เช็กรหัสอีกครั้ง' : 'เชื่อมต่อไม่สำเร็จ: ' + (e && e.type))); });
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => { clearTimeout(t); resolve(wrapConn(conn, peer)); });
    });
  }

  root.TCNet = { host, join, cleanCode, loop };
})(window);
