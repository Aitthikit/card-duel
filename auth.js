// Login gate: the site asks for one ID and password before showing the game. Only a salted
// PBKDF2 hash is stored here, never the password itself. The site is static, so this keeps
// casual visitors out but cannot stop someone who reads the code.
// To change the login, regenerate SALT / ITER / KEY from the new ID and password.
(function (root) {
  'use strict';
  const SALT = 'fe5476a05e72287b70069eaa7227024f';
  const ITER = 200000;
  const KEY = 'a9bde86b486d852d9fc7eee6af8b84809f3c570df20bec33d481ccb789349ad8';
  const STORE = 'tc-duel-auth';
  const doc = root.document;

  let saved = null;
  try { saved = localStorage.getItem(STORE); } catch (e) { /* storage unavailable */ }
  if (saved === KEY) return;

  doc.documentElement.classList.add('tc-locked');
  const css = doc.createElement('style');
  css.textContent = `
.tc-locked #app { display: none !important; }
.tc-login { position: fixed; inset: 0; display: grid; place-items: center; padding: 16px; z-index: 9999; }
.tc-login form { width: min(360px, 100%); display: grid; gap: 12px; padding: 28px 24px; border-radius: 14px;
  background: var(--panel, rgba(12,16,36,.92)); border: 1px solid var(--line, rgba(140,170,255,.25)); color: var(--text, #eef1ff);
  box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.tc-login h1 { margin: 0; font-family: 'Kanit', sans-serif; font-size: 24px; text-align: center; color: var(--gold, #f5c542); }
.tc-login p { margin: 0; text-align: center; color: var(--muted, #9aa6d1); font-size: 14px; }
.tc-login label { display: grid; gap: 4px; font-size: 14px; }
.tc-login input { font: inherit; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line, rgba(140,170,255,.25));
  background: rgba(0,0,0,.35); color: inherit; }
.tc-login button { font: inherit; font-family: 'Kanit', sans-serif; padding: 10px; border: 0; border-radius: 8px; cursor: pointer;
  background: var(--gold, #f5c542); color: #2a1600; font-weight: 600; }
.tc-login button:disabled { opacity: .6; cursor: wait; }
.tc-login .err { min-height: 20px; color: var(--red, #ff5a5f); font-size: 14px; text-align: center; }`;
  doc.head.appendChild(css);

  let en = false;
  try { en = localStorage.getItem('tc-duel-lang') === 'en'; } catch (e) { /* ignore */ }
  const T = en
    ? { sub: 'Sign in to play', id: 'ID', pw: 'Password', go: 'Sign in', bad: 'Wrong ID or password', busy: 'Checking…', nocrypto: 'This browser cannot sign in. Open the site over https.' }
    : { sub: 'เข้าสู่ระบบเพื่อเล่น', id: 'ID', pw: 'รหัสผ่าน', go: 'เข้าสู่ระบบ', bad: 'ID หรือรหัสผ่านไม่ถูกต้อง', busy: 'กำลังตรวจสอบ…', nocrypto: 'เบราว์เซอร์นี้เข้าสู่ระบบไม่ได้ ลองเปิดเว็บผ่าน https' };

  const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  async function derive(id, pw) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(id.trim().toLowerCase() + '\n' + pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ITER }, base, 256);
    return hex(bits);
  }

  function show() {
    const box = doc.createElement('div');
    box.className = 'tc-login';
    box.innerHTML = `<form autocomplete="on">
      <h1>Battle of Talingchan</h1><p>${T.sub}</p>
      <label>${T.id}<input name="username" autocomplete="username" required autocapitalize="none" spellcheck="false"></label>
      <label>${T.pw}<input name="password" type="password" autocomplete="current-password" required></label>
      <div class="err" role="alert"></div>
      <button type="submit">${T.go}</button></form>`;
    doc.body.appendChild(box);
    const form = box.querySelector('form'), err = box.querySelector('.err'), btn = box.querySelector('button');
    form.username.focus();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!(root.crypto && crypto.subtle)) { err.textContent = T.nocrypto; return; }
      btn.disabled = true; btn.textContent = T.busy; err.textContent = '';
      const key = await derive(form.username.value, form.password.value);
      if (key === KEY) {
        try { localStorage.setItem(STORE, KEY); } catch (e2) { /* remembered for this visit only */ }
        box.remove();
        doc.documentElement.classList.remove('tc-locked');
        return;
      }
      btn.disabled = false; btn.textContent = T.go; err.textContent = T.bad;
      form.password.value = ''; form.password.focus();
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', show); else show();
})(window);
