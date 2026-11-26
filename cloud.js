// 똑똑! 클라우드 연결 (파이어베이스) — 0.4.0
// 학교마다 자기 파이어베이스 프로젝트를 연결해서 써요. 앱 주소는 모든 학교가 같아요.
// 모든 학생 정보는 보건실 비밀번호로 이 기기에서 암호화한 뒤에 올려요.
// 파이어베이스에는 알아볼 수 없는 암호문과 저장 시각만 남아요.
window.CLOUD_LOADED = true;

const FB = '11.10.0';
const KN = window.KNOCK;
const CFG_KEY = 'knock.fb';
const ITER = 310000;               // 비밀번호 → 열쇠 만들기 반복 횟수
const PIECE = 900000;              // 문서 하나에 넣는 암호문 글자 수 (파이어베이스 문서 한도 1MB)
const SINGLE = ['call', 'drugs', 'roster', 'stockLog']; // 따로 저장하는 묶음 (나머지 설정은 meta)
const esc = KN.esc;
const DEMO = !!KN.demo;
const enterDemo = () => { try { localStorage.setItem('knock.demo', '1'); } catch (e) {} location.replace(location.pathname + '#start'); };
const demoBtn = '<button class="btn big ghost" id="cgDemo">비밀번호 없이 둘러보기</button><div class="xs muted" style="margin-top:-4px">둘러보기는 클라우드에 올리지 않고 이 기기에만 잠깐 저장해요. 예시 자료로 화면과 기능을 시험할 수 있어요.</div>';
const bindDemo = () => { const b = document.getElementById('cgDemo'); if (b) b.onclick = enterDemo; };

/* ---------------- 작은 도구 ---------------- */
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) {} };
const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const hash = (str) => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36); };
const rid = () => Math.random().toString(36).slice(2, 10);

/* ---------------- 학교 연결 설정 ---------------- */
function parseConfig(text) {
  const pick = (k) => { const m = String(text).match(new RegExp(k + '["\']?\\s*:\\s*["\']([^"\']+)["\']')); return m ? m[1].trim() : ''; };
  const c = { apiKey: pick('apiKey'), authDomain: pick('authDomain'), projectId: pick('projectId'), storageBucket: pick('storageBucket'), messagingSenderId: pick('messagingSenderId'), appId: pick('appId') };
  if (!c.apiKey || !c.projectId || !c.appId) return null;
  if (!c.authDomain) c.authDomain = c.projectId + '.firebaseapp.com';
  if (!c.messagingSenderId) c.messagingSenderId = (c.appId.split(':')[1] || '');
  return c;
}
function readConfig() { try { const c = JSON.parse(lsGet(CFG_KEY)); return c && c.apiKey && c.projectId && c.appId ? c : null; } catch (e) { return null; } }
function linkOf(c) { const o = { k: c.apiKey, p: c.projectId, a: c.appId }; if (c.authDomain !== c.projectId + '.firebaseapp.com') o.d = c.authDomain; return b64url(JSON.stringify(o)); }
function fromLink(s) { try { const o = JSON.parse(unb64url(s)); if (!o.k || !o.p || !o.a) return null; return { apiKey: o.k, projectId: o.p, appId: o.a, authDomain: o.d || o.p + '.firebaseapp.com', messagingSenderId: o.a.split(':')[1] || '' }; } catch (e) { return null; } }
function forgetLocal() {
  // 다른 학교로 바꿀 때: 이 기기에 남은 기록 사본과 동기화 정보를 지워요
  lsDel(KN.KEY);
  Object.keys(localStorage).filter((k) => k.startsWith('knock.sync')).forEach(lsDel);
  try { sessionStorage.clear(); } catch (e) {}
  KN.setS(KN.blankState());
}
function useConfig(c) {
  const old = readConfig();
  if (old && old.projectId !== c.projectId) forgetLocal();
  lsSet(CFG_KEY, JSON.stringify(c));
}
// QR이나 연결 주소(?fb=…)로 들어오면 그 학교로 연결해요
(() => {
  const q = new URLSearchParams(location.search).get('fb');
  if (!q) return;
  const c = fromLink(q);
  if (c) useConfig(c);
  history.replaceState(null, '', location.pathname + location.hash);
})();
const CFG = readConfig();
const SYNC_KEY = CFG ? 'knock.sync.' + CFG.projectId : '';
if (CFG && !lsGet(SYNC_KEY) && lsGet('knock.sync')) { lsSet(SYNC_KEY, lsGet('knock.sync')); lsDel('knock.sync'); } // 0.3.0판에서 옮겨요

/* ---------------- 화면 (연결 전) ---------------- */
const $app = () => document.getElementById('app');
function gate(inner, wide) {
  $app().innerHTML = `<div class="wrap" style="max-width:${wide ? 640 : 520}px"><div class="card stack" style="margin-top:50px">
    <div class="row">${KN.SYMBOL(48)}<div><h1 style="font-size:26px;font-weight:900">똑똑!</h1><div class="muted b">보건실 접수 도우미</div></div></div>${inner}</div></div>`;
}
const msg = (t) => gate(`<p class="muted" style="margin:0">${t}</p>`);
const errBox = (t) => t ? `<div class="note small" style="color:var(--or-d)">${esc(t)}</div>` : '';

function showConnect(err) {
  gate(`<h2 style="font-size:20px;margin:0">우리 학교 연결하기</h2>
    <p class="muted small" style="margin:0;line-height:1.7">똑똑!은 학교마다 <b>자기 파이어베이스</b>에 기록을 저장해요. 처음 설치하는 학교는 <a href="guide.html" target="_blank" rel="noopener" style="color:var(--teal);font-weight:700">설치 안내</a>를 따라 파이어베이스를 만든 뒤, 받은 <code>firebaseConfig</code>를 아래에 통째로 붙여 넣어요.</p>
    <textarea id="cgCfg" rows="8" placeholder="const firebaseConfig = {&#10;  apiKey: &quot;…&quot;,&#10;  authDomain: &quot;…&quot;,&#10;  projectId: &quot;…&quot;,&#10;  …&#10;};" style="font-family:monospace;font-size:13px"></textarea>
    ${errBox(err)}
    <button class="btn big" id="cgConnect">연결하기</button>${demoBtn}
    <div class="note g small" style="line-height:1.7"><b>우리 학교가 이미 쓰고 있다면</b> 붙여 넣지 않아도 돼요. 선생님 화면 → 설정의 <b>QR</b>을 찍거나 <b>'다른 기기 연결 주소'</b>로 열면 바로 연결돼요.</div>`, true);
  document.getElementById('cgConnect').onclick = () => {
    const c = parseConfig(document.getElementById('cgCfg').value);
    if (!c) { showConnect('설정값을 읽지 못했어요. apiKey, projectId, appId가 들어 있는지 확인해 주세요.'); return; }
    useConfig(c); location.reload();
  };
  bindDemo();
}

/* ---------------- 파이어베이스 불러오기 ---------------- */
let fbApp = null, fbAuth = null, fbFs = null;
if (CFG && !DEMO) {
  try {
    [fbApp, fbAuth, fbFs] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FB}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FB}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FB}/firebase-firestore.js`)
    ]);
  } catch (e) { fbApp = null; }
}
const { initializeApp } = fbApp || {};
const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } = fbAuth || {};
const { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, onSnapshot, writeBatch, serverTimestamp, Timestamp } = fbFs || {};

function offlineGate(text) {
  const st = lsGet(SYNC_KEY);
  gate(`<p style="margin:0">${text}</p>
    <div class="row"><button class="btn big" id="cgRetry">다시 연결하기</button>${st ? '<button class="btn big ghost" id="cgLocal">이 기기 자료로 열기</button>' : ''}</div>
    ${st ? '<div class="note g small">이 기기 자료로 열면 마지막으로 받아 둔 기록으로 일할 수 있어요. 다음에 연결되면 그동안 적은 기록을 클라우드에 올려요.</div>' : ''}`);
  document.getElementById('cgRetry').onclick = () => location.reload();
  const l = document.getElementById('cgLocal'); if (l) l.onclick = () => { setStatus('off'); KN.boot(); drawBadge(); };
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
const keyName = (salt) => 'key-' + (CFG ? CFG.projectId : '') + '-' + salt;
const idbGet = (k) => idbDo('readonly', (s) => s.get(k));
const idbPut = (k, v) => idbDo('readwrite', (s) => s.put(v, k));
const idbClear = () => idbDo('readwrite', (s) => s.clear());

/* ---------------- 묶음 나누기 ---------------- */
let SY = null; // { salt, lastU, acked: { p: {}, v: {} } }
let syncTimer = null;
function writeSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => lsSet(SYNC_KEY, JSON.stringify(SY)), 300); }
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
let STATUS = 'ok', USER = null, OWNER = null;
const badge = document.createElement('button');
badge.className = 'noprint';
badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:40;border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.08);display:none';
document.body.appendChild(badge);
const STATUS_TEXT = { ok: '☁ 저장됨', up: '☁ 올리는 중…', off: '⚠ 오프라인 · 이 기기에만 저장 중', err: '⚠ 저장 실패 · 다시 시도할게요' };
function setStatus(s) { STATUS = s; drawBadge(); const el = document.getElementById('cgStatus'); if (el) el.textContent = STATUS_TEXT[s]; }
function drawBadge() {
  const kiosk = KN.route() === 'kiosk';
  badge.style.display = KN.booted() && !kiosk && !DEMO ? 'block' : 'none';
  badge.textContent = STATUS_TEXT[STATUS] || '';
  badge.style.color = STATUS === 'off' || STATUS === 'err' ? 'var(--or-d)' : 'var(--teal-d)';
}
window.addEventListener('hashchange', drawBadge);
badge.onclick = () => {
  const go = () => setTimeout(() => document.getElementById('cloudCard')?.scrollIntoView({ behavior: 'smooth' }), 80);
  if (location.hash === '#config') go(); else { location.hash = 'config'; go(); }
};

/* ---------------- 설정 화면의 '클라우드 연결' 칸 ---------------- */
const isOwner = () => !!(USER && OWNER && OWNER.uid === USER.uid);
function cardHtml() {
  if (!CFG || DEMO) return '';
  const members = (OWNER && OWNER.emails) || [];
  return `<section id="cloudCard" class="card stack"><h2 style="font-size:19px">클라우드 연결</h2>
    <div class="small" style="line-height:1.8">연결된 파이어베이스: <b>${esc(CFG.projectId)}</b><br>
      로그인 계정: <b>${esc(USER ? USER.email : '-')}</b> ${USER ? (isOwner() ? '<span class="tag t">관리 계정</span>' : '<span class="tag">함께 쓰는 계정</span>') : ''}<br>
      상태: <span id="cgStatus">${STATUS_TEXT[STATUS]}</span></div>
    <div class="stack" style="gap:8px"><div class="b small">함께 쓰는 계정</div>
      <div class="xs muted">태블릿 전용 구글 계정이나 다른 보건 선생님 계정을 더하면 그 계정으로도 열 수 있어요. 기록을 보려면 보건실 비밀번호도 알아야 해요.</div>
      ${members.length ? `<div class="chips">${members.map((m) => `<span class="tag">${esc(m)}${isOwner() ? ` <button class="link xs" data-cloud="memberDel" data-email="${esc(m)}" aria-label="${esc(m)} 빼기">빼기</button>` : ''}</span>`).join('')}</div>` : '<div class="xs muted">아직 없어요</div>'}
      ${isOwner() ? `<div class="row" style="flex-wrap:nowrap"><input id="cgMemberIn" type="email" placeholder="더할 구글 계정 (예: knock.tablet@gmail.com)" style="flex:1"><button class="btn line" data-cloud="memberAdd">더하기</button></div>` : '<div class="xs muted">함께 쓰는 계정은 관리 계정만 바꿀 수 있어요.</div>'}
    </div>
    <div class="stack" style="gap:6px"><div class="b small">다른 PC·휴대폰 연결</div>
      <div class="xs muted">이 주소를 다른 기기에서 열면 우리 학교 클라우드로 바로 연결돼요. 학생 화면(태블릿)은 아래 QR을 쓰세요.</div>
      <div class="row"><input type="text" readonly value="${esc(teacherLink())}" style="flex:1 1 260px" onfocus="this.select()"><button class="btn ghost" data-cloud="copyLink">주소 복사</button></div></div>
    <div class="row"><button class="btn ghost" data-cloud="logout">이 기기에서 로그아웃</button><button class="link" style="color:var(--or-d)" data-cloud="disconnect">다른 학교로 연결 바꾸기</button></div>
    <div class="xs muted">로그아웃하면 이 기기에 남은 기록 사본과 보관한 열쇠를 지워요. 클라우드의 기록은 그대로 있어요.</div>
  </section>`;
}
const teacherLink = () => location.origin + location.pathname + '?fb=' + linkOf(CFG) + '#start';
async function leave(alsoConfig) {
  if (STATUS !== 'ok') { const sure = await KN.ask('아직 다 올리지 못했어요', '지금 나가면 올리지 못한 기록이 사라질 수 있어요. 그래도 나갈까요?', '나가기', true); if (!sure) return; }
  lsDel(KN.KEY); Object.keys(localStorage).filter((k) => k.startsWith('knock.sync')).forEach(lsDel);
  if (alsoConfig) lsDel(CFG_KEY);
  await idbClear();
  try { sessionStorage.clear(); } catch (e) {}
  if (auth) await signOut(auth).catch(() => {});
  location.replace(location.pathname);
}
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-cloud]'); if (!el) return;
  const act = el.dataset.cloud;
  if (act === 'copyLink') { try { await navigator.clipboard.writeText(teacherLink()); KN.toast('주소를 복사했어요'); } catch (er) { KN.toast('복사하지 못했어요 · 주소를 직접 골라 복사해 주세요'); } }
  if (act === 'logout') { if (await KN.ask('이 기기에서 로그아웃할까요?', '이 기기에 남은 기록 사본과 보관한 열쇠를 지워요. 다시 쓰려면 구글 로그인과 보건실 비밀번호를 넣어요.', '로그아웃', true)) leave(false); }
  if (act === 'disconnect') { if (await KN.ask('다른 학교로 연결을 바꿀까요?', '이 기기에서 로그아웃하고 연결 설정도 지워요. 지금 학교 클라우드의 기록은 그대로 있어요.', '연결 바꾸기', true)) leave(true); }
  if (act === 'memberAdd') {
    const inp = document.getElementById('cgMemberIn'); const em = (inp.value || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { KN.toast('구글 계정 이메일을 적어 주세요'); return; }
    try { await updateDoc(doc(db, 'meta', 'owner'), { emails: arrayUnion(em) }); OWNER.emails = [...new Set([...(OWNER.emails || []), em])]; KN.toast(em + ' 계정을 더했어요'); KN.refresh(); }
    catch (er) { KN.toast('더하지 못했어요 (' + (er.code || er.message) + ')'); }
  }
  if (act === 'memberDel') {
    const em = el.dataset.email;
    if (!(await KN.ask('이 계정을 뺄까요?', `<b>${esc(em)}</b> 계정은 더 이상 우리 학교 기록을 열 수 없어요.`, '빼기', true))) return;
    try { await updateDoc(doc(db, 'meta', 'owner'), { emails: arrayRemove(em) }); OWNER.emails = (OWNER.emails || []).filter((x) => x !== em); KN.toast('뺐어요'); KN.refresh(); }
    catch (er) { KN.toast('빼지 못했어요 (' + (er.code || er.message) + ')'); }
  }
});

/* ---------------- 시작 ---------------- */
let auth = null, db = null;
let loaded = false, loadedP = false, loadedV = false;
const sent = { p: {}, v: {} };
let partDocs = new Map();
let pushTimer = null, pushing = false, again = false;
let MAXN = 400; // 보안 규칙이 큰 묶음을 막으면 작게 나눠 올려요
window.CLOUD = {
  dirty: () => { if (!loaded) return; clearTimeout(pushTimer); pushTimer = setTimeout(push, 700); setStatus('up'); },
  link: () => CFG && !DEMO ? linkOf(CFG) : '',
  cardHtml
};

if (DEMO) KN.boot();
else if (!CFG) showConnect();
else if (!fbApp) offlineGate('인터넷에 연결되지 않아 클라우드에 접속하지 못했어요.');
else {
  const app = initializeApp(CFG);
  auth = getAuth(app);
  db = getFirestore(app);
  getRedirectResult(auth).catch(() => {});
  let handled = false;
  onAuthStateChanged(auth, (user) => {
    if (handled) { if (!user) location.reload(); return; }
    if (!user) { showLogin(); return; }
    handled = true; USER = user; checkMember();
  });
}

/* ---------------- 로그인 ---------------- */
function showLogin(err) {
  gate(`<p class="muted" style="margin:0;line-height:1.6">보건실 구글 계정으로 로그인해 주세요.<br><span class="xs">연결된 학교 클라우드: ${esc(CFG.projectId)}</span></p>
    <button class="btn big" id="cgLogin">Google 계정으로 로그인</button>${errBox(err)}
    ${demoBtn}<button class="link small" id="cgChange" style="align-self:flex-start;color:var(--muted)">다른 학교로 연결 바꾸기</button>`);
  bindDemo();
  document.getElementById('cgLogin').onclick = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) { signInWithRedirect(auth, new GoogleAuthProvider()); return; }
      if (e.code === 'auth/unauthorized-domain') { showLogin(`파이어베이스에서 이 주소를 허락하지 않았어요. Authentication → 설정 → 승인된 도메인에 ${location.hostname}을 더해 주세요.`); return; }
      if (e.code === 'auth/operation-not-allowed' || e.code === 'auth/configuration-not-found') { showLogin('파이어베이스 Authentication에서 Google 로그인을 아직 켜지 않았어요.'); return; }
      if (e.code !== 'auth/popup-closed-by-user') showLogin('로그인하지 못했어요 (' + e.code + ')');
    }
  };
  document.getElementById('cgChange').onclick = () => leave(true);
}
const rulesHelp = '<div class="note small" style="line-height:1.7">처음 설치 중이라면 파이어베이스 <b>Firestore → 규칙</b>에 <a href="guide.html#rules" target="_blank" rel="noopener" style="color:var(--teal);font-weight:700">설치 안내의 보안 규칙</a>을 붙여 넣고 <b>게시</b>했는지 확인해 주세요.</div>';
function showDenied() {
  gate(`<p style="margin:0;line-height:1.6"><b>${esc(USER.email)}</b> 계정으로는 이 학교 기록을 열 수 없어요.</p>
    <p class="muted small" style="margin:0;line-height:1.6">이 학교 관리 계정으로 로그인하거나, 관리 계정의 설정 화면에서 이 계정을 '함께 쓰는 계정'에 더해 달라고 부탁해 주세요.</p>
    ${rulesHelp}<div class="row"><button class="btn big" id="cgOther">다른 계정으로 로그인</button><button class="btn big ghost" id="cgRe">다시 확인</button></div>`);
  document.getElementById('cgOther').onclick = () => signOut(auth);
  document.getElementById('cgRe').onclick = () => checkMember();
}

/* ---------------- 관리 계정 ---------------- */
async function checkMember() {
  msg('연결하는 중…');
  let snap;
  try { snap = await getDoc(doc(db, 'meta', 'owner')); }
  catch (e) {
    if (e.code === 'permission-denied') { showDenied(); return; }
    offlineGate('클라우드에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); return;
  }
  if (snap.exists()) { OWNER = snap.data(); unlock(); return; }
  gate(`<h2 style="font-size:20px;margin:0">관리 계정 정하기</h2>
    <p class="small" style="margin:0;line-height:1.7">이 학교 클라우드(<b>${esc(CFG.projectId)}</b>)를 처음 여는 계정이에요.<br><b>${esc(USER.email)}</b> 계정을 이 학교 보건실의 <b>관리 계정</b>으로 정할까요?</p>
    <div class="note g small" style="line-height:1.7">관리 계정은 바꿀 수 없어요. 학교 업무용으로 계속 쓸 구글 계정인지 확인해 주세요. 태블릿 전용 계정 같은 다른 계정은 나중에 설정에서 '함께 쓰는 계정'으로 더할 수 있어요.</div>
    <div class="row"><button class="btn big" id="cgClaim">이 계정으로 정하기</button><button class="btn big ghost" id="cgOther">다른 계정으로 로그인</button></div>`);
  document.getElementById('cgOther').onclick = () => signOut(auth);
  document.getElementById('cgClaim').onclick = async () => {
    msg('정하는 중…');
    try {
      const owner = { uid: USER.uid, email: (USER.email || '').toLowerCase(), emails: [], createdAt: serverTimestamp() };
      await setDoc(doc(db, 'meta', 'owner'), owner);
      OWNER = owner; unlock();
    } catch (e) {
      if (e.code === 'permission-denied') { gate(`<p style="margin:0">관리 계정을 정하지 못했어요. 다른 계정이 먼저 정했거나 보안 규칙이 아직 없어요.</p>${rulesHelp}<button class="btn big" id="cgRe">다시 확인</button>`); document.getElementById('cgRe').onclick = () => checkMember(); return; }
      offlineGate('클라우드에 연결하지 못했어요.');
    }
  };
}

/* ---------------- 보건실 비밀번호 ---------------- */
async function unlock() {
  msg('연결하는 중…');
  let cfg;
  try { const s = await getDoc(doc(db, 'meta', 'crypto')); cfg = s.exists() ? s.data() : null; }
  catch (e) {
    if (e.code === 'permission-denied') { showDenied(); return; }
    offlineGate('클라우드에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); return;
  }
  if (!cfg) {
    if (!isOwner()) { gate('<p style="margin:0">아직 관리 계정이 보건실 비밀번호를 만들지 않았어요. 관리 계정으로 먼저 열어 주세요.</p><button class="btn big" id="cgRe">다시 확인</button>'); document.getElementById('cgRe').onclick = () => unlock(); return; }
    showCreate(); return;
  }
  const saved = await idbGet(keyName(cfg.salt));
  if (saved && await keyOk(saved, cfg)) { KEYC = saved; start(cfg, false); return; }
  showEnter(cfg);
}

function showCreate(err) {
  gate(`<h2 style="font-size:20px;margin:0">보건실 비밀번호 만들기</h2>
    <p class="muted small" style="margin:0;line-height:1.6">학생 이름, 증상, 처치 기록은 이 비밀번호로 잠근 뒤에 클라우드에 올려요. 다른 기기에서 처음 열 때도 이 비밀번호를 넣어요.</p>
    <input id="cgPw1" type="password" placeholder="비밀번호 (8자 이상)" autocomplete="new-password">
    <input id="cgPw2" type="password" placeholder="한 번 더" autocomplete="new-password">
    <div class="note small" style="color:var(--or-d);line-height:1.6"><b>꼭 따로 적어 두세요.</b> 비밀번호를 잊으면 아무도(구글도, 만든 사람도) 기록을 되살릴 수 없어요.</div>
    ${errBox(err)}
    <button class="btn big" id="cgMake">만들고 시작하기</button>
    <div class="note g small" style="line-height:1.6">아직 비밀번호를 만들 준비가 안 됐다면 먼저 둘러봐도 돼요.</div>${demoBtn}`);
  bindDemo();
  const go = async () => {
    const a = document.getElementById('cgPw1').value, b = document.getElementById('cgPw2').value;
    if (a.length < 8) { showCreate('8자 이상으로 만들어 주세요'); return; }
    if (a !== b) { showCreate('두 비밀번호가 달라요'); return; }
    msg('잠금 열쇠를 만드는 중…');
    try {
      const again2 = await getDoc(doc(db, 'meta', 'crypto'));
      if (again2.exists()) { showEnter(again2.data(), '다른 기기에서 이미 비밀번호를 만들었어요. 그 비밀번호를 넣어 주세요.'); return; }
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      KEYC = await derive(a, salt, ITER);
      const check = await enc('knock-ok');
      const cfg = { v: 1, salt, iter: ITER, check };
      await setDoc(doc(db, 'meta', 'crypto'), { ...cfg, createdAt: serverTimestamp() });
      await idbPut(keyName(salt), KEYC);
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
    ${errBox(err)}
    <button class="btn big" id="cgOpen">열기</button>`);
  const go = async () => {
    const pw = document.getElementById('cgPw').value; const remember = document.getElementById('cgRemember').checked;
    if (!pw) return;
    msg('비밀번호를 확인하는 중…');
    const key = await derive(pw, cfg.salt, cfg.iter);
    if (!(await keyOk(key, cfg))) { showEnter(cfg, '비밀번호가 달라요'); return; }
    KEYC = key; if (remember) await idbPut(keyName(cfg.salt), key);
    start(cfg, false);
  };
  document.getElementById('cgOpen').onclick = go;
  document.getElementById('cgPw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  setTimeout(() => document.getElementById('cgPw')?.focus(), 30);
}

/* ---------------- 받기 ---------------- */
function start(cfg, created) {
  let prev = null; try { prev = JSON.parse(lsGet(SYNC_KEY)); } catch (e) {}
  if (prev && prev.salt === cfg.salt) SY = prev;
  else {
    SY = { salt: cfg.salt, lastU: 0, acked: { p: {}, v: {} } };
    const S = KN.getS();
    const hasLocal = !!(S.school && S.school.name) || (S.visits || []).length > 0;
    if (!created && hasLocal) {
      // 이 기기에 있던 자료는 지우지 않고 따로 보관해요
      lsSet(KN.KEY + '.before-cloud', JSON.stringify(S));
      KN.setS(KN.blankState());
    }
  }
  sent.p = { ...SY.acked.p }; sent.v = { ...SY.acked.v };
  msg('기록을 받는 중…');

  onSnapshot(collection(db, 'parts'), (snap) => {
    partDocs = new Map(snap.docs.map((d) => [d.id, d]));
    const names = new Set(snap.docChanges().filter((c) => c.type !== 'removed').map((c) => c.doc.data().name).filter(Boolean));
    queueWork(() => applyParts(names)).then(() => { if (!snap.metadata.fromCache) { loadedP = true; ready(); } });
  }, listenErr);

  const since = Timestamp.fromMillis(Math.max(0, (SY.lastU || 0) - 10 * 60 * 1000));
  onSnapshot(query(collection(db, 'visits'), where('u', '>', since)), (snap) => {
    const ch = snap.docChanges().filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites).map((c) => c.doc);
    queueWork(() => applyVisits(ch)).then(() => { if (!snap.metadata.fromCache) { loadedV = true; ready(); } });
  }, listenErr);

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
    let d = m.d || ''; let whole = true;
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

function afterApply(changed) { writeSync(); if (!changed) return; KN.saveLocal(); KN.refresh(); }

function ready() {
  if (loaded || !loadedP || !loadedV) return;
  loaded = true; writeSync();
  if (!KN.booted()) KN.boot(); else KN.refresh();
  setStatus('ok'); drawBadge();
  push(); // 이 기기에만 있던 기록을 올려요
}

function listenErr(e) {
  console.error('[똑똑 연결]', e);
  if (e.code === 'permission-denied') { showDenied(); badge.style.display = 'none'; return; }
  setStatus('off');
}

/* ---------------- 올리기 ---------------- */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pushTimer) { clearTimeout(pushTimer); pushTimer = null; push(); } });

async function push() {
  pushTimer = null;
  if (!loaded) return;
  if (pushing) { again = true; return; }
  pushing = true;
  const done = []; // [kind, id, hash]
  try {
    const S = KN.getS();
    const ops = []; // { ref, data | null, size }
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
      if (n >= MAXN || bytes + op.size > 8e6) { await batch.commit(); batch = writeBatch(db); n = 0; bytes = 0; }
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
    if (e.code === 'permission-denied' && MAXN > 5) { MAXN = 5; again = true; }
    else { setStatus('err'); setTimeout(() => window.CLOUD.dirty(), 10000); }
  } finally {
    pushing = false;
    if (again) { again = false; push(); }
  }
}
