// 똑똑! 클라우드 연결 (파이어베이스) — 0.3.0
// 모든 학생 정보는 보건실 비밀번호로 이 기기에서 암호화한 뒤에 올려요.
// 파이어베이스에는 알아볼 수 없는 암호문과 저장 시각만 남아요.
window.CLOUD_LOADED = true;

const FB = '11.10.0';
const firebaseConfig = {
  apiKey: 'AIzaSyBAIL7Cez34XrbVro8_ssDseS6rSxYJTH4',
  authDomain: 'ttokttok-log.firebaseapp.com',
  projectId: 'ttokttok-log',
  storageBucket: 'ttokttok-log.firebasestorage.app',
  messagingSenderId: '585681754255',
  appId: '1:585681754255:web:a5adcf7da691b79b53f8fa'
};
// 로그인할 수 있는 구글 계정 (파이어베이스 보안 규칙에도 같은 계정이 있어야 해요)
const ALLOWED_EMAILS = ['mijinp014@gmail.com'];

const KN = window.KNOCK;
const SYNC_KEY = 'knock.sync';
const ITER = 310000;               // 비밀번호 → 열쇠 만들기 반복 횟수
const PIECE = 900000;              // 문서 하나에 넣는 암호문 글자 수 (파이어베이스 문서 한도 1MB)
const SINGLE = ['call', 'drugs', 'roster', 'stockLog']; // 따로 저장하는 묶음 (나머지 설정은 meta)

/* ---------------- 화면 (연결 전) ---------------- */
const $app = () => document.getElementById('app');
function gate(inner) {
  $app().innerHTML = `<div class="wrap" style="max-width:520px"><div class="card stack" style="margin-top:50px">
    <div class="row">${KN.SYMBOL(48)}<div><h1 style="font-size:26px;font-weight:900">똑똑!</h1><div class="muted b">보건실 접수 도우미</div></div></div>${inner}</div></div>`;
}
const msg = (t) => gate(`<p class="muted" style="margin:0">${t}</p>`);

/* ---------------- 파이어베이스 불러오기 ---------------- */
let fbApp, fbAuth, fbFs;
try {
  [fbApp, fbAuth, fbFs] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FB}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FB}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FB}/firebase-firestore.js`)
  ]);
} catch (e) {
  offlineGate('인터넷에 연결되지 않아 클라우드에 접속하지 못했어요.');
}

const { initializeApp } = fbApp || {};
const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } = fbAuth || {};
const { getFirestore, doc, getDoc, setDoc, collection, query, where, onSnapshot, writeBatch, serverTimestamp, Timestamp } = fbFs || {};

function offlineGate(text) {
  const st = readSync();
  gate(`<p style="margin:0">${text}</p>
    <div class="row"><button class="btn big" id="cgRetry">다시 연결하기</button>${st ? '<button class="btn big ghost" id="cgLocal">이 기기 자료로 열기</button>' : ''}</div>
    ${st ? '<div class="note g small">이 기기 자료로 열면 마지막으로 받아 둔 기록으로 일할 수 있어요. 다음에 연결되면 그동안 적은 기록을 클라우드에 올려요.</div>' : ''}`);
  document.getElementById('cgRetry').onclick = () => location.reload();
  const l = document.getElementById('cgLocal'); if (l) l.onclick = () => { setStatus('off'); KN.boot(); };
}

/* ---------------- 암호화 ---------------- */
const te = new TextEncoder(), td = new TextDecoder();
const b64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
async function derive(pw, salt, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(salt), iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
let KEYC = null;
async function enc(str) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, KEYC, te.encode(str)); return { iv: b64(iv), d: b64(ct) }; }
async function decWith(key, iv, d) { return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(d))); }
async function keyOk(key, cfg) { try { return (await decWith(key, cfg.check.iv, cfg.check.d)) === 'knock-ok'; } catch (e) { return false; } }

// 열쇠는 꺼낼 수 없는 형태로 이 기기 안(IndexedDB)에만 보관해요
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('knock-cloud', 1); r.onupgradeneeded = () => r.result.createObjectStore('keys'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbDo(mode, fn) { try { const d = await idb(); return await new Promise((res) => { const q = fn(d.transaction('keys', mode).objectStore('keys')); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); }); } catch (e) { return null; } }
const idbGet = (k) => idbDo('readonly', (s) => s.get(k));
const idbPut = (k, v) => idbDo('readwrite', (s) => s.put(v, k));
const idbClear = () => idbDo('readwrite', (s) => s.clear());

/* ---------------- 작은 도구 ---------------- */
const hash = (str) => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36); };
const rid = () => Math.random().toString(36).slice(2, 10);
function readSync() { try { return JSON.parse(localStorage.getItem(SYNC_KEY)); } catch (e) { return null; } }
let SY = null; // { salt, lastU, acked: { p: {}, v: {} } }
let syncTimer = null;
function writeSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(SY)); } catch (e) {} }, 300); }

function partsOf(S) {
  const out = {}; const meta = {};
  for (const k of Object.keys(S)) if (k !== 'visits' && k !== 'archives' && !SINGLE.includes(k)) meta[k] = S[k];
  out.meta = meta;
  for (const k of SINGLE) out[k] = S[k] ?? null;
  for (const a of (S.archives || [])) out['archive-' + a.year] = a;
  return out;
}
function applyPart(name, val, del) {
  const S = KN.getS();
  if (name === 'meta') { if (!del) Object.assign(S, val); }
  else if (name.startsWith('archive-')) {
    const y = Number(name.slice(8));
    S.archives = (S.archives || []).filter((a) => a.year !== y);
    if (!del) S.archives.push(val);
    S.archives.sort((a, b) => a.year - b.year);
  } else if (SINGLE.includes(name)) S[name] = del ? KN.blankState()[name] : val;
}

/* ---------------- 상태 표시 ---------------- */
let STATUS = 'ok', USER = null;
const badge = document.createElement('button');
badge.className = 'noprint';
badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:40;border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.08);display:none';
document.body.appendChild(badge);
const STATUS_TEXT = { ok: '☁ 저장됨', up: '☁ 올리는 중…', off: '⚠ 오프라인 · 이 기기에만 저장 중', err: '⚠ 저장 실패 · 다시 시도할게요' };
function setStatus(s) { STATUS = s; drawBadge(); }
function drawBadge() {
  const kiosk = KN.route() === 'kiosk';
  badge.style.display = KN.booted() && !kiosk ? 'block' : 'none';
  badge.textContent = STATUS_TEXT[STATUS] || '';
  badge.style.color = STATUS === 'off' || STATUS === 'err' ? 'var(--or-d)' : 'var(--teal-d)';
}
window.addEventListener('hashchange', drawBadge);
badge.onclick = async () => {
  const body = `${USER ? `로그인 계정: <b>${KN.esc(USER.email)}</b><br>` : ''}상태: ${STATUS_TEXT[STATUS]}<br><br>
    이 기기에서 로그아웃하면 이 기기에 남은 기록 사본과 보관한 열쇠도 지워요. 다음에 쓰려면 다시 로그인하고 보건실 비밀번호를 넣어야 해요.`;
  const ok = await KN.ask('클라우드 연결', body, '이 기기에서 로그아웃', true);
  if (!ok) return;
  if (STATUS !== 'ok') { const sure = await KN.ask('아직 다 올리지 못했어요', '지금 로그아웃하면 올리지 못한 기록이 사라질 수 있어요. 그래도 로그아웃할까요?', '로그아웃', true); if (!sure) return; }
  try { localStorage.removeItem(KN.KEY); localStorage.removeItem(SYNC_KEY); } catch (e) {}
  await idbClear();
  try { sessionStorage.clear(); } catch (e) {}
  if (fbAuth) await signOut(auth).catch(() => {});
  location.replace(location.pathname);
};

/* ---------------- 로그인 ---------------- */
let auth, db;
if (fbApp) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  getRedirectResult(auth).catch(() => {});
  let handled = false;
  onAuthStateChanged(auth, (user) => {
    if (handled) { if (!user) location.reload(); return; }
    if (!user) { showLogin(); return; }
    if (!ALLOWED_EMAILS.includes((user.email || '').toLowerCase())) { showWrong(user.email); return; }
    handled = true; USER = user; unlock();
  });
}

function showLogin(err) {
  gate(`<p class="muted" style="margin:0;line-height:1.6">보건실 구글 계정으로 로그인해 주세요. 태블릿(학생 화면)과 선생님 PC 모두 같은 계정으로 로그인해요.</p>
    <button class="btn big" id="cgLogin">Google 계정으로 로그인</button>${err ? `<div class="note small" style="color:var(--or-d)">${KN.esc(err)}</div>` : ''}`);
  document.getElementById('cgLogin').onclick = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) { signInWithRedirect(auth, new GoogleAuthProvider()); return; }
      if (e.code !== 'auth/popup-closed-by-user') showLogin('로그인하지 못했어요 (' + e.code + ')');
    }
  };
}
function showWrong(email) {
  gate(`<p style="margin:0"><b>${KN.esc(email)}</b> 계정은 이 보건실 기록을 열 수 없어요.</p><button class="btn big" id="cgOther">다른 계정으로 로그인</button>`);
  document.getElementById('cgOther').onclick = () => signOut(auth);
}

/* ---------------- 보건실 비밀번호 ---------------- */
async function unlock() {
  msg('연결하는 중…');
  let cfg;
  try { const s = await getDoc(doc(db, 'meta', 'crypto')); cfg = s.exists() ? s.data() : null; }
  catch (e) {
    if (e.code === 'permission-denied') { gate(`<p style="margin:0">클라우드가 이 계정을 막고 있어요. 파이어베이스 Firestore 보안 규칙의 이메일이 <b>${KN.esc(USER.email)}</b>인지 확인해 주세요.</p>`); return; }
    offlineGate('클라우드에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); return;
  }
  if (!cfg) { showCreate(); return; }
  const saved = await idbGet('key-' + cfg.salt);
  if (saved && await keyOk(saved, cfg)) { KEYC = saved; start(cfg, false); return; }
  showEnter(cfg);
}

function showCreate(err) {
  gate(`<h2 style="font-size:20px;margin:0">보건실 비밀번호 만들기</h2>
    <p class="muted small" style="margin:0;line-height:1.6">학생 이름, 증상, 처치 기록은 이 비밀번호로 잠근 뒤에 클라우드에 올려요. 다른 기기에서 처음 열 때도 이 비밀번호를 넣어요.</p>
    <input id="cgPw1" type="password" placeholder="비밀번호 (8자 이상)" autocomplete="new-password">
    <input id="cgPw2" type="password" placeholder="한 번 더" autocomplete="new-password">
    <div class="note small" style="color:var(--or-d);line-height:1.6"><b>꼭 따로 적어 두세요.</b> 비밀번호를 잊으면 아무도(구글도, 만든 사람도) 기록을 되살릴 수 없어요.</div>
    ${err ? `<div class="small" style="color:var(--or-d)">${KN.esc(err)}</div>` : ''}
    <button class="btn big" id="cgMake">만들고 시작하기</button>`);
  const go = async () => {
    const a = document.getElementById('cgPw1').value, b = document.getElementById('cgPw2').value;
    if (a.length < 8) { showCreate('8자 이상으로 만들어 주세요'); return; }
    if (a !== b) { showCreate('두 비밀번호가 달라요'); return; }
    msg('잠금 열쇠를 만드는 중…');
    try {
      const again = await getDoc(doc(db, 'meta', 'crypto'));
      if (again.exists()) { showEnter(again.data(), '다른 기기에서 이미 비밀번호를 만들었어요. 그 비밀번호를 넣어 주세요.'); return; }
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      KEYC = await derive(a, salt, ITER);
      const check = await enc('knock-ok');
      const cfg = { v: 1, salt, iter: ITER, check };
      await setDoc(doc(db, 'meta', 'crypto'), { ...cfg, createdAt: serverTimestamp() });
      await idbPut('key-' + salt, KEYC);
      start(cfg, true);
    } catch (e) { showCreate('만들지 못했어요 (' + (e.code || e.message) + ')'); }
  };
  document.getElementById('cgMake').onclick = go;
  document.getElementById('cgPw2').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

function showEnter(cfg, err) {
  gate(`<h2 style="font-size:20px;margin:0">보건실 비밀번호</h2>
    <p class="muted small" style="margin:0">이 기기에서 처음 열 때 한 번 넣어요.</p>
    <input id="cgPw" type="password" placeholder="보건실 비밀번호" autocomplete="current-password">
    <label class="row small" style="gap:8px;cursor:pointer"><input id="cgRemember" type="checkbox" checked style="width:auto"> 이 기기에서 기억하기 (다음부터 묻지 않아요)</label>
    ${err ? `<div class="small" style="color:var(--or-d)">${KN.esc(err)}</div>` : ''}
    <button class="btn big" id="cgOpen">열기</button>`);
  const go = async () => {
    const pw = document.getElementById('cgPw').value; const remember = document.getElementById('cgRemember').checked;
    if (!pw) return;
    msg('비밀번호를 확인하는 중…');
    const key = await derive(pw, cfg.salt, cfg.iter);
    if (!(await keyOk(key, cfg))) { showEnter(cfg, '비밀번호가 달라요'); return; }
    KEYC = key; if (remember) await idbPut('key-' + cfg.salt, key);
    start(cfg, false);
  };
  document.getElementById('cgOpen').onclick = go;
  document.getElementById('cgPw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  setTimeout(() => document.getElementById('cgPw')?.focus(), 30);
}

/* ---------------- 동기화 ---------------- */
let loaded = false, loadedP = false, loadedV = false;
const sent = { p: {}, v: {} };
let partDocs = new Map(); // 지금 클라우드에 있는 parts 문서들

function start(cfg, created) {
  const prev = readSync();
  if (prev && prev.salt === cfg.salt) SY = prev;
  else {
    SY = { salt: cfg.salt, lastU: 0, acked: { p: {}, v: {} } };
    const S = KN.getS();
    const hasLocal = !!(S.school && S.school.name) || (S.visits || []).length > 0;
    if (!created && hasLocal) {
      // 이 기기에 있던 0.2.0판 자료는 지우지 않고 따로 보관해요
      try { localStorage.setItem(KN.KEY + '.before-cloud', JSON.stringify(S)); } catch (e) {}
      KN.setS(KN.blankState());
    }
  }
  sent.p = { ...SY.acked.p }; sent.v = { ...SY.acked.v };
  msg('기록을 받는 중…');

  onSnapshot(collection(db, 'parts'), (snap) => {
    partDocs = new Map(snap.docs.map((d) => [d.id, d]));
    const names = new Set(snap.docChanges().filter((c) => c.type !== 'removed').map((c) => c.doc.data().name).filter(Boolean));
    queueWork(() => applyParts(names, snap.metadata.fromCache)).then(() => { if (!snap.metadata.fromCache) { loadedP = true; ready(); } });
  }, (e) => listenErr(e));

  const since = Timestamp.fromMillis(Math.max(0, (SY.lastU || 0) - 10 * 60 * 1000));
  onSnapshot(query(collection(db, 'visits'), where('u', '>', since)), (snap) => {
    const ch = snap.docChanges().filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites).map((c) => c.doc);
    queueWork(() => applyVisits(ch)).then(() => { if (!snap.metadata.fromCache) { loadedV = true; ready(); } });
  }, (e) => listenErr(e));

  // 오래 걸리면: 이 기기에서 쓰던 자료가 있으면 그것으로 먼저 열어요
  setTimeout(() => {
    if (loaded || KN.booted()) return;
    if (prev && prev.salt === cfg.salt) { setStatus('off'); KN.boot(); drawBadge(); }
    else offlineGate('클라우드에서 기록을 받지 못했어요. 인터넷 연결을 확인해 주세요.');
  }, 12000);
}

let work = Promise.resolve();
function queueWork(fn) { work = work.then(fn).catch((e) => console.error('[똑똑 동기화]', e)); return work; }

async function applyParts(names) {
  let changed = false;
  for (const name of names) {
    const main = partDocs.get(name); if (!main || main.metadata.hasPendingWrites) continue;
    const m = main.data();
    if (m.del) {
      if (sent.p[name] !== 'DEL') { applyPart(name, null, true); changed = true; }
      SY.acked.p[name] = sent.p[name] = 'DEL'; continue;
    }
    let d = m.d || '';
    let whole = true;
    for (let i = 1; i < (m.k || 1); i++) { const p = partDocs.get(`${name}~${i}`); const pd = p && p.data(); if (!pd || pd.rev !== m.rev) { whole = false; break; } d += pd.d; }
    if (!whole) continue; // 나머지 조각이 오면 다시 해요
    let json;
    try { json = await decWith(KEYC, m.iv, d); } catch (e) { console.error('[똑똑] 풀지 못한 묶음', name); continue; }
    const h = hash(json);
    const local = partsOf(KN.getS())[name];
    if (local === undefined || hash(JSON.stringify(local)) !== h) { applyPart(name, JSON.parse(json), false); changed = true; }
    SY.acked.p[name] = sent.p[name] = h;
  }
  afterApply(changed);
}

async function applyVisits(docs) {
  if (!docs.length) return;
  const S = KN.getS();
  const idx = new Map(S.visits.map((v, i) => [v.id, i]));
  let changed = false, maxU = SY.lastU || 0;
  const drop = new Set();
  for (const dref of docs) {
    const m = dref.data(); const id = dref.id;
    if (m.u && m.u.toMillis) maxU = Math.max(maxU, m.u.toMillis());
    if (m.x) { if (idx.has(id)) { drop.add(id); changed = true; } SY.acked.v[id] = sent.v[id] = 'DEL'; continue; }
    let json; try { json = await decWith(KEYC, m.iv, m.d); } catch (e) { console.error('[똑똑] 풀지 못한 기록', id); continue; }
    const h = hash(json);
    if (idx.has(id)) {
      const i = idx.get(id);
      if (hash(JSON.stringify(S.visits[i])) !== h) { S.visits[i] = JSON.parse(json); changed = true; }
    } else { S.visits.push(JSON.parse(json)); idx.set(id, S.visits.length - 1); changed = true; }
    SY.acked.v[id] = sent.v[id] = h;
  }
  if (drop.size) S.visits = S.visits.filter((v) => !drop.has(v.id));
  SY.lastU = maxU;
  afterApply(changed);
}

function afterApply(changed) {
  writeSync();
  if (!changed) return;
  KN.saveLocal();
  KN.refresh();
}

function ready() {
  if (loaded || !loadedP || !loadedV) return;
  loaded = true; writeSync();
  if (!KN.booted()) KN.boot();
  setStatus('ok');
  push(); // 이 기기에만 있던 기록을 올려요
}

function listenErr(e) {
  console.error('[똑똑 연결]', e);
  if (e.code === 'permission-denied') { gate('<p style="margin:0">클라우드가 이 계정을 막고 있어요. 파이어베이스 보안 규칙을 확인해 주세요.</p>'); return; }
  setStatus('off');
}

/* ---------------- 올리기 ---------------- */
let pushTimer = null, pushing = false, again = false;
window.CLOUD = { dirty: () => { if (!loaded) return; clearTimeout(pushTimer); pushTimer = setTimeout(push, 700); setStatus('up'); } };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pushTimer) { clearTimeout(pushTimer); pushTimer = null; push(); } });

async function push() {
  pushTimer = null;
  if (!loaded) return;
  if (pushing) { again = true; return; }
  pushing = true;
  const done = []; // [kind, id, hash]
  try {
    const S = KN.getS();
    const ops = []; // { ref, data | null, size, mark }
    // 1) 설정·명단·약품·지난 학년도 묶음
    const parts = partsOf(S);
    for (const name of new Set([...Object.keys(parts), ...Object.keys(sent.p)])) {
      const oldK = (partDocs.get(name)?.data()?.k) || 1;
      if (!(name in parts)) {
        if (sent.p[name] === 'DEL') continue;
        for (let i = 1; i < oldK; i++) ops.push({ ref: doc(db, 'parts', `${name}~${i}`), data: null, size: 100 });
        ops.push({ ref: doc(db, 'parts', name), data: { name, k: 0, del: true, rev: rid(), u: serverTimestamp() }, size: 200 });
        sent.p[name] = 'DEL'; done.push(['p', name, 'DEL']); continue;
      }
      const json = JSON.stringify(parts[name]); const h = hash(json);
      if (sent.p[name] === h) continue;
      const e = await enc(json); const rev = rid();
      const pieces = []; for (let i = 0; i < e.d.length; i += PIECE) pieces.push(e.d.slice(i, i + PIECE)); if (!pieces.length) pieces.push('');
      for (let i = 1; i < pieces.length; i++) ops.push({ ref: doc(db, 'parts', `${name}~${i}`), data: { name, i, rev, d: pieces[i] }, size: pieces[i].length + 200 });
      for (let i = pieces.length; i < oldK; i++) ops.push({ ref: doc(db, 'parts', `${name}~${i}`), data: null, size: 100 });
      ops.push({ ref: doc(db, 'parts', name), data: { name, k: pieces.length, rev, iv: e.iv, d: pieces[0], u: serverTimestamp() }, size: pieces[0].length + 300 });
      sent.p[name] = h; done.push(['p', name, h]);
    }
    // 2) 방문 기록 (한 건씩)
    const ids = new Set();
    for (const v of S.visits) {
      ids.add(v.id);
      const json = JSON.stringify(v); const h = hash(json);
      if (sent.v[v.id] === h) continue;
      const e = await enc(json);
      ops.push({ ref: doc(db, 'visits', v.id), data: { iv: e.iv, d: e.d, x: false, u: serverTimestamp() }, size: e.d.length + 200 });
      sent.v[v.id] = h; done.push(['v', v.id, h]);
    }
    for (const id of Object.keys(sent.v)) {
      if (ids.has(id) || sent.v[id] === 'DEL') continue;
      ops.push({ ref: doc(db, 'visits', id), data: { x: true, u: serverTimestamp() }, size: 100 });
      sent.v[id] = 'DEL'; done.push(['v', id, 'DEL']);
    }
    if (!ops.length) { setStatus('ok'); return; }
    setStatus('up');
    // 3) 묶어서 올리기 (한 번에 400개·8MB까지)
    let batch = writeBatch(db), n = 0, bytes = 0;
    for (const op of ops) {
      if (n >= 400 || bytes + op.size > 8e6) { await batch.commit(); batch = writeBatch(db); n = 0; bytes = 0; }
      if (op.data) batch.set(op.ref, op.data); else batch.delete(op.ref);
      n++; bytes += op.size;
    }
    if (n) await batch.commit();
    for (const [k, id, h] of done) if (sent[k][id] === h) SY.acked[k][id] = h;
    writeSync();
    setStatus('ok');
  } catch (e) {
    console.error('[똑똑 올리기]', e);
    for (const [k, id] of done) { if (SY.acked[k][id] === undefined) delete sent[k][id]; else sent[k][id] = SY.acked[k][id]; }
    setStatus('err');
    setTimeout(() => window.CLOUD.dirty(), 10000);
  } finally {
    pushing = false;
    if (again) { again = false; push(); }
  }
}
