const DEMO = FIREBASE_CONFIG.apiKey.startsWith('REPLACE');

let auth, db, messaging, storage;
let currentUser = null;
let userData    = null;
let activeTab   = 'home';

// ── Auth ──────────────────────────────────────────────────────────────────────
const _localSession = sessionStorage.getItem('localUser');
if (_localSession) {
  userData = JSON.parse(_localSession);
  if (userData.role === 'admin')      { window.location.replace('admin.html'); }
  else if (userData.role === 'committee') { window.location.replace('committee.html'); }
  else {
    if (!DEMO) { firebase.initializeApp(FIREBASE_CONFIG); db = firebase.firestore(); storage = firebase.storage(); }
    initUI();
  }
} else if (!DEMO) {
  firebase.initializeApp(FIREBASE_CONFIG);
  auth     = firebase.auth();
  db       = firebase.firestore();
  storage  = firebase.storage();
  auth.onAuthStateChanged(async user => {
    if (!user) { window.location.replace('index.html'); return; }
    currentUser = user;
    const snap = await db.collection('users').doc(user.uid).get();
    if (!snap.exists) { auth.signOut(); return; }
    userData = snap.data();
    if (userData.role === 'admin')      { window.location.replace('admin.html'); return; }
    if (userData.role === 'committee')  { window.location.replace('committee.html'); return; }
    initUI();
    initMessaging();
  });
} else {
  userData = { name: 'ทดสอบ ระบบ', studentId: '6501234567', position: 'เลขานุการ', role: 'member', program: '' };
  initUI();
}

// ── Photo helpers ──────────────────────────────────────────────────────────────
function updateAvatarBtn() {
  const btn = document.getElementById('avatarBtn');
  if (!btn) return;
  if (userData.photoURL) {
    btn.textContent = '';
    btn.style.cssText += ';background-image:url(' + userData.photoURL + ');background-size:cover;background-position:center;';
  } else {
    btn.textContent = (userData.name || userData.studentId || '?')[0].toUpperCase();
    btn.style.backgroundImage = '';
  }
}

async function compressImage(file, maxW = 400, quality = 0.75) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    img.src = url;
  });
}

async function resolveUid(authUid, studentId) {
  if (authUid) return authUid;
  if (!db || !studentId) return null;
  const snap = await db.collection('users').where('studentId', '==', studentId).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function uploadProfilePhoto(file) {
  showToast('กำลังอัปโหลด...');
  try {
    const blob = await compressImage(file);
    const formData = new FormData();
    formData.append('image', blob, 'photo.jpg');
    const res = await fetch('https://api.imgbb.com/1/upload?key=e5f5862b8658d49b78d8ab07fb0700df', { method: 'POST', body: formData });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'ImgBB error');
    const url = json.data.url;
    const uid = await resolveUid(currentUser?.uid, userData?.studentId);
    if (db && uid) await db.collection('users').doc(uid).update({ photoURL: url });
    userData.photoURL = url;
    updateAvatarBtn();
    showToast('อัปโหลดรูปสำเร็จ ✅');
    document.getElementById('avatarBtn').click();
  } catch(e) { showToast('อัปโหลดไม่ได้: ' + e.message); }
}

// Hidden file input for photo upload
const _photoInput = document.createElement('input');
_photoInput.type = 'file'; _photoInput.accept = 'image/*'; _photoInput.style.display = 'none';
_photoInput.onchange = e => { if (e.target.files[0]) uploadProfilePhoto(e.target.files[0]); };
document.body.appendChild(_photoInput);
window.triggerPhotoUpload = () => _photoInput.click();

function initUI() {
  updateAvatarBtn();
  document.getElementById('topbarSub').textContent = userData.position || 'สมาชิก';

  // Inject member card modal if not in HTML (cache-safe fallback)
  if (!document.getElementById('memberCardModal')) {
    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'memberCardModal';
    div.innerHTML = `<div class="modal">
      <div class="modal-handle"></div>
      <div id="memberCardContent"></div>
      <button class="btn btn-ghost w-full mt-12" id="closeMemberCard">ปิด</button>
    </div>`;
    document.body.appendChild(div);
    document.getElementById('closeMemberCard').onclick = () =>
      document.getElementById('memberCardModal').classList.remove('open');
  }

  renderTab('home');
}

async function initMessaging() {
  if (!('Notification' in window) || VAPID_KEY.startsWith('REPLACE')) return;
  try {
    messaging = firebase.messaging();
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    const sw  = await navigator.serviceWorker.register('sw.js');
    const tok = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: sw });
    if (tok) await db.collection('fcmTokens').doc(currentUser.uid).set({ token: tok, updatedAt: new Date() });
  } catch (_) {}
}

// ── Tab routing ───────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTab(btn.dataset.tab);
  });
});

function renderTab(tab) {
  activeTab = tab;
  document.getElementById('mainContent').innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
  ({ home: renderHome, events: renderEvents, history: renderHistory, news: renderNews }[tab] || renderHome)();
}

function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderTab(tab);
}

// ── HOME ──────────────────────────────────────────────────────────────────────
async function renderHome() {
  let eventCount = 0, totalHours = 0, openEvents = 0;
  let recentParts = [];
  let newsHtml = '<div class="empty-state"><span class="empty-icon">📢</span><p class="empty-title">ยังไม่มีข่าวสาร</p></div>';

  let bannersHtml = '';
  if (!DEMO && db) {
    try {
      const uid = currentUser?.uid || '_local_';
      const [partsSnap, newsSnap, evSnap, bannerSnap] = await Promise.all([
        db.collection('participations').where('userId','==',uid).where('status','==','approved').get(),
        db.collection('news').get(),
        db.collection('events').where('status','==','open').get(),
        db.collection('banners').where('active','==',true).get(),
      ]);
      eventCount = partsSnap.size;
      partsSnap.forEach(d => { totalHours += (d.data().hours || 0); });
      openEvents = evSnap.size;
      recentParts = partsSnap.docs.map(d => d.data())
        .sort((a,b) => (b.requestedAt?.seconds||0) - (a.requestedAt?.seconds||0)).slice(0,3);
      const news = newsSnap.docs.map(d => d.data()).sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,3);
      if (news.length) newsHtml = news.map(n => newsCardHtml(n)).join('');
      if (!bannerSnap.empty) {
        bannersHtml = bannerSnap.docs.map(d => {
          const b = d.data();
          return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;box-shadow:var(--shadow-sm);">
            ${b.imageUrl?`<img src="${esc(b.imageUrl)}" style="width:100%;border-radius:8px;max-height:160px;object-fit:cover;display:block;margin-bottom:10px;" onerror="this.style.display='none'">` : ''}
            <div style="font-weight:800;font-size:.92rem;">${esc(b.title||'')}</div>
            ${b.description?`<div style="font-size:.82rem;color:var(--text-2);margin-top:4px;">${esc(b.description)}</div>`:''}
          </div>`;
        }).join('');
      }
    } catch(_) {}
  }

  const now = new Date();
  document.getElementById('mainContent').innerHTML = `
    <div class="fade-in">
      <div class="hero-card">
        <div class="hero-greeting">สวัสดี 👋</div>
        <div class="hero-name">${esc(userData.name || userData.studentId)}</div>
        <div class="hero-time" id="liveClock">${timeStr(now)}</div>
        <div class="hero-date">${now.toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
        ${userData.program ? `<div style="font-size:.78rem;opacity:.7;margin-bottom:12px;">📚 ${esc(userData.program)}</div>` : ''}
        <button class="btn btn-sm" onclick="switchTab('events')"
          style="background:rgba(255,255,255,.2);border:1.5px solid rgba(255,255,255,.4);color:#fff;">
          🎯 ดูกิจกรรมที่เปิดรับ (${openEvents})
        </button>
      </div>

      <div class="stats-grid stagger">
        <div class="stat-card s-indigo" style="cursor:pointer;" onclick="openHoursModal()">
          <span class="stat-icon">🎯</span>
          <div class="stat-value">${eventCount}</div>
          <div class="stat-label">งานที่เข้าร่วม</div>
          <div style="font-size:.68rem;opacity:.7;margin-top:2px;">กดดูชั่วโมง ▶</div>
        </div>
        <div class="stat-card s-cyan" style="cursor:pointer;" onclick="openHoursModal()">
          <span class="stat-icon">⏱️</span>
          <div class="stat-value">${totalHours.toFixed(1)}</div>
          <div class="stat-label">ชั่วโมงสะสม</div>
        </div>
        <div class="stat-card s-green" style="cursor:pointer;" onclick="switchTab('events')">
          <span class="stat-icon">📬</span>
          <div class="stat-value">${openEvents}</div>
          <div class="stat-label">งานเปิดรับ</div>
        </div>
        <div class="stat-card s-plain">
          <span class="stat-icon">🏷️</span>
          <div class="stat-value" style="font-size:.9rem;font-weight:800;">${esc(userData.position||'—')}</div>
          <div class="stat-label">ตำแหน่ง</div>
        </div>
      </div>

      <div class="quick-actions stagger">
        <button class="quick-btn" onclick="switchTab('events')">
          <div class="icon-wrap">🎯</div><span>กิจกรรม</span>
        </button>
        <button class="quick-btn" onclick="openHoursModal()">
          <div class="icon-wrap">⏱️</div><span>ชั่วโมง</span>
        </button>
        <button class="quick-btn" onclick="switchTab('history')">
          <div class="icon-wrap">📋</div><span>ประวัติ</span>
        </button>
        <button class="quick-btn" onclick="document.getElementById('avatarBtn').click()">
          <div class="icon-wrap">👤</div><span>โปรไฟล์</span>
        </button>
        <button class="quick-btn" onclick="window.open('stats.html','_blank')">
          <div class="icon-wrap">📊</div><span>สถิติ</span>
        </button>
      </div>

      ${recentParts.length > 0 ? `
      <div class="section-header mt-4">
        <span class="section-title">✅ เข้าร่วมล่าสุด</span>
        <button class="btn btn-xs btn-ghost" onclick="switchTab('history')">ดูทั้งหมด</button>
      </div>
      <div class="card" style="padding:8px 12px;">
        ${recentParts.map(p => `
          <div class="list-item">
            <div class="list-avatar" style="background:var(--grad-card-c);border-radius:12px;">🎯</div>
            <div class="list-info">
              <div class="list-name">${esc(p.eventTitle||'—')}</div>
              <div class="list-sub">${(p.hours||0).toFixed(1)} ชม.</div>
            </div>
            <span class="badge badge-success">✅</span>
          </div>`).join('')}
      </div>` : ''}

      ${bannersHtml ? `
      <div class="section-header mt-4">
        <span class="section-title">🖼️ ป้ายประกาศ</span>
      </div>
      ${bannersHtml}` : ''}

      <div class="section-header mt-4">
        <span class="section-title">📢 ข่าวสารล่าสุด</span>
        <button class="btn btn-xs btn-ghost" onclick="switchTab('news')">ดูทั้งหมด</button>
      </div>
      ${newsHtml}
    </div>
  `;
  startClock();
}

// ── HOURS MODAL ───────────────────────────────────────────────────────────────
async function openHoursModal() {
  document.getElementById('hoursContent').innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
  document.getElementById('hoursModal').classList.add('open');

  if (!DEMO && db && currentUser) {
    try {
      const snap = await db.collection('participations')
        .where('userId','==',currentUser.uid)
        .where('status','==','approved').get();
      const parts = snap.docs.map(d => d.data())
        .sort((a,b) => (b.requestedAt?.seconds||0) - (a.requestedAt?.seconds||0));
      const totalHours = parts.reduce((s,p) => s+(p.hours||0), 0);

      document.getElementById('hoursContent').innerHTML = `
        <div style="text-align:center;padding:16px 0 20px;">
          <div style="font-size:3rem;font-weight:800;color:var(--c-indigo-600);">${totalHours.toFixed(1)}</div>
          <div style="font-size:.85rem;color:var(--text-3);">ชั่วโมงสะสมทั้งหมด จาก ${parts.length} กิจกรรม</div>
        </div>
        <div class="divider"></div>
        ${parts.length === 0
          ? '<div class="empty-state"><span class="empty-icon">⏱️</span><p class="empty-title">ยังไม่มีชั่วโมงสะสม</p></div>'
          : parts.map(p => `
            <div class="list-item">
              <div class="list-avatar" style="background:var(--grad-card-c);border-radius:12px;font-size:.9rem;">🎯</div>
              <div class="list-info">
                <div class="list-name">${esc(p.eventTitle||'—')}</div>
                <div class="list-sub">${p.requestedAt?.toDate ? p.requestedAt.toDate().toLocaleDateString('th-TH') : '—'}</div>
              </div>
              <span class="badge badge-indigo">${(p.hours||0).toFixed(1)} ชม.</span>
            </div>`).join('')}
      `;
    } catch(ex) {
      document.getElementById('hoursContent').innerHTML = '<p class="text-muted text-sm">ไม่สามารถโหลดข้อมูลได้</p>';
    }
  } else {
    document.getElementById('hoursContent').innerHTML = '<div class="empty-state"><span class="empty-icon">⏱️</span><p class="empty-title">ยังไม่มีชั่วโมงสะสม</p></div>';
  }
}

document.getElementById('closeHours').onclick = () => document.getElementById('hoursModal').classList.remove('open');

// ── EVENTS TAB ────────────────────────────────────────────────────────────────
async function renderEvents() {
  let events = [], myParts = {};

  if (!DEMO && db) {
    try {
      const uid = currentUser?.uid || '';
      const [evSnap, pSnap] = await Promise.all([
        db.collection('events').orderBy('date','desc').get(),
        uid ? db.collection('participations').where('userId','==',uid).get() : Promise.resolve({ docs: [] }),
      ]);
      events = evSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      pSnap.docs.forEach(d => { myParts[d.data().eventId] = { id: d.id, ...d.data() }; });
    } catch(_) {}
  }

  const openEvents   = events.filter(e => e.status === 'open');
  const closedEvents = events.filter(e => e.status !== 'open');

  const eventCard = (ev) => {
    const part = myParts[ev.id];
    const dt = ev.date ? new Date(ev.date).toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'}) : '—';
    let action = '';
    if (part) {
      if (part.status === 'approved') action = '<span class="badge badge-success">✅ เข้าร่วมแล้ว</span>';
      else if (part.status === 'pending') action = `
        <span class="badge badge-warning">⏳ รออนุมัติ</span>
        <button class="btn btn-xs btn-danger" onclick="cancelJoin('${part.id}')">ยกเลิก</button>`;
      else action = '<span class="badge badge-danger">✗ ไม่อนุมัติ</span>';
    } else if (ev.status === 'open') {
      action = `<button class="btn btn-sm btn-primary" onclick="openJoinModal('${ev.id}','${esc(ev.title||'')}',${ev.hours||0})">+ เข้าร่วม</button>`;
    } else {
      action = '<span class="badge" style="background:var(--surface2);color:var(--text-3);">ปิดรับแล้ว</span>';
    }
    return `
      <div class="card" style="padding:14px 16px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:.95rem;">${esc(ev.title||'—')}</div>
            <div style="font-size:.76rem;color:var(--text-3);margin-top:3px;">
              📅 ${dt} &nbsp;⏱ ${ev.hours||0} ชม.${ev.location?` &nbsp;📍 ${esc(ev.location)}`:''}
            </div>
            ${ev.description?`<div style="font-size:.82rem;color:var(--text-2);margin-top:6px;">${esc(ev.description)}</div>`:''}
          </div>
        </div>
        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">${action}</div>
      </div>`;
  };

  document.getElementById('mainContent').innerHTML = `
    <div class="fade-in">
      <div class="section-header">
        <span class="section-title">🎯 กิจกรรมเปิดรับ (${openEvents.length})</span>
      </div>
      ${openEvents.length === 0
        ? '<div class="empty-state"><span class="empty-icon">🎯</span><p class="empty-title">ยังไม่มีกิจกรรมที่เปิดรับ</p><p class="empty-sub">ติดตามประกาศจากประธานได้เลย</p></div>'
        : openEvents.map(eventCard).join('')}

      ${closedEvents.length > 0 ? `
      <div class="section-header mt-12" style="color:var(--text-3);">
        <span class="section-title" style="color:var(--text-3);">กิจกรรมที่ปิดแล้ว</span>
      </div>
      ${closedEvents.map(eventCard).join('')}` : ''}
    </div>
  `;
}

// Join / cancel
let _joinId = '', _joinHours = 0, _joinTitle = '', _joinPositions = [];

window.openJoinModal = async (eventId, title, hours) => {
  _joinId = eventId; _joinHours = parseFloat(hours)||0; _joinTitle = title; _joinPositions = [];
  document.getElementById('joinModalTitle').textContent = `🎯 ${title}`;
  document.getElementById('joinModalContent').innerHTML = '<div class="spinner-wrap" style="padding:20px 0"><div class="spinner"></div></div>';
  document.getElementById('joinModal').classList.add('open');
  try {
    const snap = await db.collection('events').doc(eventId).get();
    _joinPositions = snap.data()?.positions || [];
  } catch(_) { _joinPositions = []; }
  const posHtml = _joinPositions.length ? `
    <div class="form-group" style="margin-top:10px;">
      <label class="form-label" style="font-size:.82rem;">เลือกตำแหน่งที่ต้องการ <span style="color:var(--c-rose)">*</span></label>
      <select class="form-select" id="joinPositionSelect">
        <option value="">— เลือกตำแหน่ง —</option>
        ${_joinPositions.map(p=>`<option value="${esc(p.name)}">${esc(p.name)} (รับ ${p.slots} คน)</option>`).join('')}
      </select>
    </div>` : '';
  document.getElementById('joinModalContent').innerHTML = `
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:14px;line-height:1.75;font-size:.88rem;color:var(--text-2);">
      ยืนยันการส่งคำขอเข้าร่วมกิจกรรมนี้<br>
      ประธานจะตรวจสอบและอนุมัติให้<br>
      <strong>ชั่วโมงที่จะได้รับ: ${hours} ชม.</strong>
    </div>${posHtml}`;
};

document.getElementById('cancelJoin').onclick = () => document.getElementById('joinModal').classList.remove('open');

document.getElementById('confirmJoinBtn').onclick = async () => {
  if (DEMO) { showToast('โหมดทดสอบ — ต้องเชื่อมต่อ Firebase'); return; }
  if (!currentUser) { showToast('กรุณา login ผ่าน Firebase'); return; }
  const positionName = document.getElementById('joinPositionSelect')?.value || '';
  if (_joinPositions.length && !positionName) { showToast('กรุณาเลือกตำแหน่งที่ต้องการ'); return; }
  const btn = document.getElementById('confirmJoinBtn');
  btn.disabled = true; btn.textContent = 'กำลังส่ง…';
  try {
    await db.collection('participations').add({
      eventId:      _joinId,
      eventTitle:   _joinTitle,
      userId:       currentUser.uid,
      studentId:    userData.studentId,
      name:         userData.name || userData.studentId,
      program:      userData.program || '',
      hours:        _joinHours,
      positionName: positionName,
      status:       'pending',
      requestedAt:  firebase.firestore.FieldValue.serverTimestamp(),
    });
    document.getElementById('joinModal').classList.remove('open');
    showToast('ส่งคำขอแล้ว ⏳ รอแอดมินอนุมัติ');
    renderEvents();
  } catch(ex) { showToast('เกิดข้อผิดพลาด: ' + ex.message); }
  btn.disabled = false; btn.textContent = '✅ ยืนยันเข้าร่วม';
};

window.cancelJoin = async (partId) => {
  if (!confirm('ยกเลิกการสมัครเข้าร่วมกิจกรรมนี้?')) return;
  await db.collection('participations').doc(partId).delete();
  showToast('ยกเลิกแล้ว'); renderEvents();
};

// ── HISTORY ───────────────────────────────────────────────────────────────────
async function renderHistory() {
  let parts = [], totalHours = 0;

  if (!DEMO && db) {
    try {
      const uid = currentUser?.uid || '_local_';
      const snap = await db.collection('participations').where('userId','==',uid).get();
      parts = snap.docs.map(d => d.data())
        .sort((a,b) => (b.requestedAt?.seconds||0) - (a.requestedAt?.seconds||0));
      parts.filter(p => p.status==='approved').forEach(p => { totalHours += (p.hours||0); });
    } catch(_) {}
  }

  const approved = parts.filter(p => p.status==='approved');
  const pending  = parts.filter(p => p.status==='pending');

  document.getElementById('mainContent').innerHTML = `
    <div class="fade-in">
      <div class="stats-grid">
        <div class="stat-card s-indigo" style="cursor:pointer;" onclick="openHoursModal()">
          <span class="stat-icon">🎯</span>
          <div class="stat-value">${approved.length}</div>
          <div class="stat-label">งานที่เข้าร่วม</div>
          <div style="font-size:.68rem;opacity:.7;margin-top:2px;">กดดูชั่วโมง ▶</div>
        </div>
        <div class="stat-card s-cyan">
          <span class="stat-icon">⏱️</span>
          <div class="stat-value">${totalHours.toFixed(1)}</div>
          <div class="stat-label">ชั่วโมงสะสม</div>
        </div>
      </div>

      ${pending.length > 0 ? `
      <div class="section-header">
        <span class="section-title">⏳ รออนุมัติ (${pending.length})</span>
      </div>
      <div class="card" style="padding:8px 12px;margin-bottom:14px;">
        ${pending.map(p => `
          <div class="list-item">
            <div class="list-avatar" style="background:var(--grad-card-d);border-radius:12px;">⏳</div>
            <div class="list-info">
              <div class="list-name">${esc(p.eventTitle||'—')}</div>
              <div class="list-sub">${(p.hours||0).toFixed(1)} ชม. · รอการอนุมัติ</div>
            </div>
          </div>`).join('')}
      </div>` : ''}

      <div class="section-header">
        <span class="section-title">✅ ประวัติการเข้าร่วม</span>
      </div>
      <div class="card" style="padding:8px 12px;">
        ${approved.length === 0
          ? '<div class="empty-state"><span class="empty-icon">📋</span><p class="empty-title">ยังไม่มีประวัติ</p><p class="empty-sub">เริ่มสมัครเข้าร่วมกิจกรรมได้เลย</p></div>'
          : approved.map(p => `
            <div class="list-item">
              <div class="list-avatar" style="background:var(--grad-card-c);border-radius:12px;">🎯</div>
              <div class="list-info">
                <div class="list-name">${esc(p.eventTitle||'—')}</div>
                <div class="list-sub">${p.requestedAt?.toDate ? p.requestedAt.toDate().toLocaleDateString('th-TH') : '—'}</div>
              </div>
              <span class="badge badge-indigo">${(p.hours||0).toFixed(1)} ชม.</span>
            </div>`).join('')}
      </div>
    </div>
  `;
}

// ── NEWS ──────────────────────────────────────────────────────────────────────
async function renderNews() {
  let newsHtml = '<div class="empty-state"><span class="empty-icon">📢</span><p class="empty-title">ยังไม่มีข่าวสาร</p></div>';
  if (!DEMO && db) {
    try {
      const snap = await db.collection('news').orderBy('createdAt','desc').limit(30).get();
      if (!snap.empty) newsHtml = snap.docs.map(d => newsCardHtml(d.data())).join('');
    } catch(_) {}
  }
  document.getElementById('mainContent').innerHTML = `
    <div class="fade-in">
      <div class="section-header"><span class="section-title">📢 ข่าวสารและประกาศ</span></div>
      ${newsHtml}
    </div>`;
}

// ── Profile Modal ──────────────────────────────────────────────────────────────
document.getElementById('avatarBtn').onclick = async () => {
  let hrs = 0, count = 0;
  if (!DEMO && db && currentUser) {
    try {
      const snap = await db.collection('participations').where('userId','==',currentUser.uid).where('status','==','approved').get();
      count = snap.size;
      snap.forEach(d => { hrs += (d.data().hours||0); });
    } catch(_) {}
  }
  window._profileHours = hrs; window._profileCount = count;
  const contactInfo = `
    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:6px;font-size:.78rem;color:rgba(255,255,255,.75);">
      <span>📞 ${esc(userData.phone||'—')}</span>
      <span>💬 ${esc(userData.lineId||'—')}</span>
    </div>`;
  const photoHtml = userData.photoURL
    ? `<div style="position:relative;display:inline-block;margin-bottom:10px;">
        <img src="${esc(userData.photoURL)}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid #f0c040;display:block;">
        <button onclick="triggerPhotoUpload()" style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:#f0c040;border:none;cursor:pointer;font-size:.75rem;display:flex;align-items:center;justify-content:center;">📷</button>
      </div>`
    : `<div style="position:relative;display:inline-block;margin-bottom:10px;">
        <div class="profile-av" style="background:rgba(212,160,23,.2);border:2px solid rgba(212,160,23,.4);color:#f0c040;margin:0;">${(userData.name||userData.studentId||'?')[0].toUpperCase()}</div>
        <button onclick="triggerPhotoUpload()" style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:#f0c040;border:none;cursor:pointer;font-size:.75rem;display:flex;align-items:center;justify-content:center;">📷</button>
      </div>`;
  document.getElementById('profileContent').innerHTML = `
    <div class="profile-hero" style="background:linear-gradient(160deg,#0d1f5c,#142470,#1a2d80);">
      <img src="icons/logo.png" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid rgba(212,160,23,.6);background:rgba(255,255,255,.1);margin-bottom:6px;" onerror="this.style.display='none'">
      <div style="font-size:.6rem;letter-spacing:.08em;color:rgba(255,255,255,.5);margin-bottom:8px;">${esc(FACULTY_NAME||'')} · ${esc(UNIVERSITY_NAME||'')}</div>
      ${photoHtml}
      <div style="font-size:1.2rem;font-weight:800;">${esc(userData.name||userData.studentId)}</div>
      <div style="font-size:.82rem;opacity:.75;margin-top:2px;">รหัส: ${esc(userData.studentId||'')}</div>
      ${userData.program?`<div style="font-size:.78rem;opacity:.7;margin-top:2px;">📚 ${esc(userData.program)}</div>`:''}
      <span class="badge mt-8" style="background:rgba(212,160,23,.2);border:1px solid rgba(212,160,23,.5);color:#f0c040;">${esc(userData.position||'สมาชิก')}</span>
      ${contactInfo}
    </div>
    <div class="stats-grid">
      <div class="stat-card s-indigo" style="cursor:pointer;" onclick="document.getElementById('profileModal').classList.remove('open');openHoursModal()">
        <span class="stat-icon">🎯</span>
        <div class="stat-value">${count}</div>
        <div class="stat-label">งานที่เข้าร่วม</div>
      </div>
      <div class="stat-card s-cyan">
        <span class="stat-icon">⏱️</span>
        <div class="stat-value">${hrs.toFixed(1)}</div>
        <div class="stat-label">ชั่วโมงสะสม</div>
      </div>
    </div>
    <button class="btn btn-ghost w-full mt-8" onclick="showMemberCard()">🪪 บัตรสมาชิก</button>
    <button class="btn btn-ghost w-full mt-4" onclick="openEditProfileModal()">✏️ แก้ไขโปรไฟล์</button>`;
  document.getElementById('profileModal').classList.add('open');
};

window.showMemberCard = () => {
  document.getElementById('profileModal').classList.remove('open');
  const hrs  = (window._profileHours||0).toFixed(1);
  const count = window._profileCount||0;
  const roleLabel = {'admin':'ประธาน / แอดมิน','committee':'คณะกรรมการ','member':'สมาชิก'}[userData.role||'member']||'สมาชิก';
  const prog = userData.program||'';
  const shortProg = prog.length > 22 ? prog.slice(0,21)+'…' : prog;
  const initial = (userData.name||userData.studentId||'?')[0].toUpperCase();
  const sid = userData.studentId||'';
  const year = (new Date().getFullYear()+543);

  // Generate barcode bars from student ID digits
  const barcode = sid.split('').map((c,i) => {
    const w = i%3===0 ? 3 : 1;
    const h = (parseInt(c)||1)*2 + 10;
    return `<div style="width:${w}px;height:${h}px;background:#f0c040;display:inline-block;margin:0 0.5px;vertical-align:bottom;"></div>`;
  }).join('') + '<div style="width:2px;height:28px;background:#f0c040;display:inline-block;vertical-align:bottom;margin-left:2px;"></div>';

  const photoBox = userData.photoURL
    ? `<div style="position:relative;width:82px;margin-bottom:6px;">
        <img src="${esc(userData.photoURL)}" style="width:82px;height:100px;object-fit:cover;border-radius:6px;border:2px solid #c8960c;display:block;">
        <button onclick="triggerPhotoUpload()" style="position:absolute;bottom:4px;right:4px;width:22px;height:22px;border-radius:50%;background:#c8960c;border:none;cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;">📷</button>
      </div>`
    : `<div style="position:relative;width:82px;margin-bottom:6px;">
        <div style="width:82px;height:100px;background:linear-gradient(160deg,#0d1f5c,#1a2d80);border-radius:6px;border:2px solid #c8960c;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:2.2rem;font-weight:800;color:#f0c040;">${esc(initial)}</span>
        </div>
        <button onclick="triggerPhotoUpload()" style="position:absolute;bottom:4px;right:4px;width:22px;height:22px;border-radius:50%;background:#c8960c;border:none;cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;">📷</button>
      </div>`;

  document.getElementById('memberCardContent').innerHTML = `
    <!-- Physical ID Card -->
    <div style="border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.4);max-width:360px;margin:0 auto;font-family:inherit;">

      <!-- ── Header bar (Navy) ── -->
      <div style="background:linear-gradient(135deg,#0d1f5c,#1a2d80);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="icons/logo.png" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid #c8960c;background:rgba(255,255,255,.1);flex-shrink:0;" onerror="this.style.display='none'">
          <div>
            <div style="color:#f0c040;font-size:.6rem;font-weight:800;letter-spacing:.06em;line-height:1.4;">${esc(FACULTY_NAME||'คณะมนุษยศาสตร์และสังคมศาสตร์')}</div>
            <div style="color:rgba(255,255,255,.7);font-size:.55rem;letter-spacing:.04em;line-height:1.4;">${esc(UNIVERSITY_NAME||'มหาวิทยาลัยสวนดุสิต')}</div>
          </div>
        </div>
        <span style="background:rgba(212,160,23,.2);border:1px solid #c8960c;border-radius:20px;padding:2px 8px;font-size:.6rem;font-weight:800;color:#f0c040;white-space:nowrap;">${esc(roleLabel)}</span>
      </div>

      <!-- Gold stripe -->
      <div style="height:4px;background:linear-gradient(90deg,#6b4c00,#c8960c,#f0c040,#c8960c,#6b4c00);"></div>

      <!-- ── Card Body (cream) ── -->
      <div style="background:#f2ece0;padding:14px;display:flex;gap:12px;">

        <!-- Photo box -->
        <div style="flex-shrink:0;width:82px;">
          ${photoBox}
          <div style="font-size:.52rem;color:#888;text-align:center;letter-spacing:.03em;">PHOTO</div>
        </div>

        <!-- Info -->
        <div style="flex:1;min-width:0;">
          <div style="margin-bottom:8px;">
            <div style="font-size:.52rem;color:#c8960c;letter-spacing:.1em;font-weight:700;text-transform:uppercase;">NAME</div>
            <div style="font-size:.88rem;font-weight:800;color:#0d1f5c;line-height:1.25;margin-top:1px;">${esc(userData.name||userData.studentId)}</div>
          </div>
          <div style="margin-bottom:7px;">
            <div style="font-size:.52rem;color:#c8960c;letter-spacing:.1em;font-weight:700;text-transform:uppercase;">STUDENT ID</div>
            <div style="font-size:.78rem;font-weight:700;color:#222;font-family:monospace;letter-spacing:.05em;margin-top:1px;">${esc(sid)}</div>
          </div>
          ${shortProg?`<div style="margin-bottom:7px;">
            <div style="font-size:.52rem;color:#c8960c;letter-spacing:.1em;font-weight:700;text-transform:uppercase;">PROGRAM</div>
            <div style="font-size:.68rem;font-weight:600;color:#444;margin-top:1px;line-height:1.3;">${esc(shortProg)}</div>
          </div>`:''}
          ${userData.position?`<div style="margin-bottom:7px;">
            <div style="font-size:.52rem;color:#c8960c;letter-spacing:.1em;font-weight:700;text-transform:uppercase;">POSITION</div>
            <div style="font-size:.72rem;font-weight:800;color:#0d1f5c;margin-top:1px;">${esc(userData.position)}</div>
          </div>`:''}
          <div style="display:flex;gap:12px;">
            ${userData.phone?`<div><div style="font-size:.52rem;color:#c8960c;letter-spacing:.08em;font-weight:700;">PHONE</div><div style="font-size:.65rem;color:#444;">${esc(userData.phone)}</div></div>`:''}
            ${userData.lineId?`<div><div style="font-size:.52rem;color:#c8960c;letter-spacing:.08em;font-weight:700;">LINE</div><div style="font-size:.65rem;color:#444;">${esc(userData.lineId)}</div></div>`:''}
          </div>
        </div>
      </div>

      <!-- ── Footer bar (Navy + Barcode) ── -->
      <div style="background:linear-gradient(135deg,#0d1f5c,#0a1845);padding:8px 14px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:.58rem;color:rgba(255,255,255,.5);letter-spacing:.04em;">ID: ${esc(sid)}</div>
          <div style="font-size:.6rem;color:#f0c040;font-weight:700;margin-top:1px;">⏱ ${hrs} HRS · ปี ${year}</div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:0;">${barcode}</div>
      </div>

    </div>

    <!-- Stats below card -->
    <div class="stats-grid" style="margin-top:14px;">
      <div class="stat-card s-indigo" style="cursor:pointer;" onclick="document.getElementById('memberCardModal').classList.remove('open');openHoursModal()">
        <span class="stat-icon">🎯</span>
        <div class="stat-value">${count}</div>
        <div class="stat-label">งานที่เข้าร่วม</div>
      </div>
      <div class="stat-card s-cyan">
        <span class="stat-icon">⏱️</span>
        <div class="stat-value">${hrs}</div>
        <div class="stat-label">ชั่วโมงสะสม</div>
      </div>
    </div>
  `;
  document.getElementById('memberCardModal').classList.add('open');
};
if (document.getElementById('closeMemberCard')) {
  document.getElementById('closeMemberCard').onclick = () => document.getElementById('memberCardModal').classList.remove('open');
}

// ── Edit Profile Request ───────────────────────────────────────────────────────
window.openEditProfileModal = () => {
  document.getElementById('profileModal').classList.remove('open');
  if (!document.getElementById('editProfileModal')) {
    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'editProfileModal';
    div.innerHTML = `<div class="modal">
      <div class="modal-handle"></div>
      <h2 class="modal-title">✏️ แก้ไขโปรไฟล์</h2>
      <p style="font-size:.82rem;color:var(--text-2);margin-bottom:14px;">กรอกข้อมูลที่ต้องการเปลี่ยน — ประธานหรือกรรมการจะตรวจสอบและอนุมัติ</p>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-weight:700;font-size:.85rem;display:block;margin-bottom:6px;">เบอร์โทรศัพท์</label>
        <input class="form-input" type="tel" id="epPhone" inputmode="tel" placeholder="08x-xxx-xxxx">
      </div>
      <div class="form-group" style="margin-bottom:16px;">
        <label style="font-weight:700;font-size:.85rem;display:block;margin-bottom:6px;">Line ID</label>
        <input class="form-input" type="text" id="epLineId" placeholder="@lineId หรือ lineId">
      </div>
      <div id="epError" style="color:#ef4444;font-size:.82rem;margin-bottom:8px;display:none;"></div>
      <div class="flex gap-8">
        <button class="btn btn-ghost w-full" onclick="document.getElementById('editProfileModal').classList.remove('open')">ยกเลิก</button>
        <button class="btn btn-primary w-full" id="epSubmitBtn" onclick="submitProfileEditRequest()">📤 ส่งคำขอ</button>
      </div>
    </div>`;
    document.body.appendChild(div);
  }
  document.getElementById('epPhone').value  = userData.phone  || '';
  document.getElementById('epLineId').value = userData.lineId || '';
  document.getElementById('epError').style.display = 'none';
  document.getElementById('editProfileModal').classList.add('open');
};

window.submitProfileEditRequest = async () => {
  if (DEMO || !db || !currentUser) { showToast('กรุณา login ผ่าน Firebase'); return; }
  const phone  = document.getElementById('epPhone').value.trim();
  const lineId = document.getElementById('epLineId').value.trim();
  const errEl  = document.getElementById('epError');
  if (phone === (userData.phone||'') && lineId === (userData.lineId||'')) {
    errEl.textContent = 'ไม่มีข้อมูลที่เปลี่ยนแปลง'; errEl.style.display = 'block'; return;
  }
  const btn = document.getElementById('epSubmitBtn');
  btn.disabled = true; btn.textContent = 'กำลังส่ง…';
  try {
    await db.collection('profileRequests').add({
      userId:    currentUser.uid,
      studentId: userData.studentId||'',
      name:      userData.name||userData.studentId||'',
      phone,
      lineId,
      status:    'pending',
      requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    document.getElementById('editProfileModal').classList.remove('open');
    showToast('ส่งคำขอแล้ว ⏳ รอประธาน/กรรมการอนุมัติ');
  } catch(e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  btn.disabled = false; btn.textContent = '📤 ส่งคำขอ';
};

document.getElementById('closeProfile').onclick = () => document.getElementById('profileModal').classList.remove('open');
document.getElementById('logoutBtn').onclick = () => {
  sessionStorage.removeItem('localUser');
  if (!DEMO && auth) auth.signOut();
  window.location.replace('index.html');
};
document.getElementById('profileModal').addEventListener('click', e => {
  if (e.target === document.getElementById('profileModal')) document.getElementById('profileModal').classList.remove('open');
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function newsCardHtml(n) {
  const dt = n.createdAt?.toDate ? n.createdAt.toDate() : new Date();
  const urgent = !!n.urgent;
  return `
    <div class="news-card">
      <div class="news-accent-bar ${urgent?'urgent':''}"></div>
      <div class="news-body">
        <div class="news-tag ${urgent?'urgent':''}">${urgent?'⚠️ ด่วน':'📢 ประกาศ'}</div>
        <div class="news-title">${esc(n.title)}</div>
        <div class="news-content">${esc(n.content||'').replace(/\n/g,'<br>')}</div>
        <div class="news-meta">
          <span>🕐 ${dt.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})}</span>
          ${n.postedBy?`<span>โดย ${esc(n.postedBy)}</span>`:''}
        </div>
      </div>
    </div>`;
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeStr(d) {
  return d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
}

function startClock() {
  clearInterval(window._clockInterval);
  window._clockInterval = setInterval(() => {
    const el = document.getElementById('liveClock');
    if (el) el.textContent = timeStr(new Date());
    else clearInterval(window._clockInterval);
  }, 1000);
}

function showToast(msg, ms = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}
