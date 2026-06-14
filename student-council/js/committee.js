const DEMO = FIREBASE_CONFIG.apiKey.startsWith('REPLACE');

let auth, db, storage;
let currentUser = null;
let userData    = null;
let activeTab   = 'overview';
let myProgram   = '';

// ── Auth ──────────────────────────────────────────────────────────────────────
const _localSession = sessionStorage.getItem('localUser');
if (_localSession) {
  userData = JSON.parse(_localSession);
  if (userData.role !== 'committee') { window.location.replace('index.html'); }
  else {
    myProgram = userData.program || '';
    if (!DEMO) { firebase.initializeApp(FIREBASE_CONFIG); db = firebase.firestore(); storage = firebase.storage(); }
    document.getElementById('committeeSubtitle').textContent = userData.name || userData.studentId;
    renderTab('overview');
  }
} else if (!DEMO) {
  firebase.initializeApp(FIREBASE_CONFIG);
  auth    = firebase.auth();
  db      = firebase.firestore();
  storage = firebase.storage();
  auth.onAuthStateChanged(async user => {
    if (!user) { window.location.replace('index.html'); return; }
    const snap = await db.collection('users').doc(user.uid).get();
    if (!snap.exists || snap.data().role !== 'committee') { window.location.replace('index.html'); return; }
    currentUser = user;
    userData    = snap.data();
    myProgram   = userData.program || '';
    document.getElementById('committeeSubtitle').textContent = userData.name || userData.studentId;
    renderTab('overview');
  });
} else {
  userData  = { name: 'กรรมการ ทดสอบ', studentId: '0000000000', role: 'committee', program: PROGRAMS[0] };
  myProgram = userData.program;
  document.getElementById('committeeSubtitle').textContent = userData.name;
  renderTab('overview');
}

document.getElementById('logoutBtn').onclick = () => {
  sessionStorage.removeItem('localUser');
  if (!DEMO && auth) auth.signOut();
  window.location.replace('index.html');
};

// ── Photo helpers ──────────────────────────────────────────────────────────────
async function compressImage(file, maxW = 400, quality = 0.75) {
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale; canvas.height = img.height * scale;
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

async function uploadCommitteePhoto(file) {
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
    showToast('อัปโหลดรูปสำเร็จ ✅');
    showProfile();
  } catch(e) { showToast('อัปโหลดไม่ได้: ' + e.message); }
}

const _cPhotoInput = document.createElement('input');
_cPhotoInput.type = 'file'; _cPhotoInput.accept = 'image/*'; _cPhotoInput.style.display = 'none';
_cPhotoInput.onchange = e => { if (e.target.files[0]) uploadCommitteePhoto(e.target.files[0]); };
document.body.appendChild(_cPhotoInput);
window.triggerCommitteePhotoUpload = () => _cPhotoInput.click();

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
  ({ overview: renderOverview, team: renderTeam, events: renderEvents, board: renderBoard }[tab] || renderOverview)();
}

function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderTab(tab);
}

// ── OVERVIEW ──────────────────────────────────────────────────────────────────
async function renderOverview() {
  let teamCount = 0, totalHours = 0, eventCount = 0, pendingCount = 0;

  if (!DEMO && db && myProgram) {
    try {
      const [teamSnap, partsSnap, evSnap] = await Promise.all([
        db.collection('users').where('program','==',myProgram).get(),
        db.collection('participations').where('program','==',myProgram).where('status','==','approved').get(),
        db.collection('events').where('status','==','open').get(),
      ]);
      teamCount  = teamSnap.size;
      partsSnap.forEach(d => { totalHours += (d.data().hours || 0); });
      eventCount = evSnap.size;

      const pendingSnap = await db.collection('participations').where('program','==',myProgram).where('status','==','pending').get();
      pendingCount = pendingSnap.size;
    } catch(_) {}
  }

  document.getElementById('mainContent').innerHTML = `
    <div class="fade-in">
      <div class="hero-card" style="background:linear-gradient(135deg,#065f46,#059669,#34d399);">
        <div class="hero-greeting">สวัสดี 👋</div>
        <div class="hero-name">${esc(userData.name || userData.studentId)}</div>
        <div style="font-size:.82rem;opacity:.8;margin-top:4px;">คณะกรรมการ · ${esc(myProgram||'ไม่ระบุหลักสูตร')}</div>
      </div>

      <div class="stats-grid stagger">
        <div class="stat-card s-green" style="cursor:pointer;" onclick="switchTab('team')">
          <span class="stat-icon">👥</span>
          <div class="stat-value">${teamCount}</div>
          <div class="stat-label">สมาชิกในทีม</div>
        </div>
        <div class="stat-card s-cyan">
          <span class="stat-icon">⏱️</span>
          <div class="stat-value">${totalHours.toFixed(0)}</div>
          <div class="stat-label">ชม.สะสมรวม</div>
        </div>
        <div class="stat-card s-indigo" style="cursor:pointer;" onclick="switchTab('events')">
          <span class="stat-icon">🎯</span>
          <div class="stat-value">${eventCount}</div>
          <div class="stat-label">งานที่เปิดรับ</div>
        </div>
        <div class="stat-card s-amber" style="cursor:pointer;" onclick="switchTab('events')">
          <span class="stat-icon">⏳</span>
          <div class="stat-value">${pendingCount}</div>
          <div class="stat-label">รออนุมัติ</div>
        </div>
      </div>

      <div class="quick-actions stagger">
        <button class="quick-btn" onclick="switchTab('team')">
          <div class="icon-wrap">👥</div><span>ทีมฉัน</span>
        </button>
        <button class="quick-btn" onclick="switchTab('events')">
          <div class="icon-wrap">🎯</div><span>กิจกรรม</span>
        </button>
        <button class="quick-btn" onclick="switchTab('report')">
          <div class="icon-wrap">📄</div><span>รายงาน</span>
        </button>
        <button class="quick-btn" onclick="showProfile()">
          <div class="icon-wrap">👤</div><span>โปรไฟล์</span>
        </button>
      </div>
    </div>
  `;
}

// ── TEAM ──────────────────────────────────────────────────────────────────────
async function renderTeam() {
  let members = [];

  if (!DEMO && db && myProgram) {
    try {
      const snap = await db.collection('users').where('program','==',myProgram).get();
      const uids = snap.docs.map(d => d.id);

      // ดึง participations ของทุกคนในทีม
      let hoursByUid = {};
      let countByUid = {};
      if (uids.length > 0) {
        const pSnap = await db.collection('participations')
          .where('program','==',myProgram)
          .where('status','==','approved').get();
        pSnap.forEach(d => {
          const p = d.data();
          hoursByUid[p.userId] = (hoursByUid[p.userId]||0) + (p.hours||0);
          countByUid[p.userId] = (countByUid[p.userId]||0) + 1;
        });
      }

      members = snap.docs.map(d => ({
        ...d.data(), _id: d.id,
        totalHours: hoursByUid[d.id] || 0,
        eventCount: countByUid[d.id] || 0,
      })).sort((a,b) => b.totalHours - a.totalHours);
    } catch(_) {}
  }

  document.getElementById('mainContent').innerHTML = `
    <div class="fade-in">
      <div class="section-header">
        <span class="section-title">👥 ทีม: ${esc(myProgram||'ของฉัน')} (${members.length} คน)</span>
      </div>
      ${members.length === 0
        ? '<div class="empty-state"><span class="empty-icon">👥</span><p class="empty-title">ยังไม่มีสมาชิก</p><p class="empty-sub">สมาชิกในหลักสูตรของคุณจะปรากฏที่นี่</p></div>'
        : `<div class="card" style="padding:8px 12px;">
            ${members.map((m, i) => `
              <div class="list-item">
                <div class="rank-badge" style="width:28px;height:28px;border-radius:8px;font-size:.85rem;">${i+1}</div>
                <div class="list-info">
                  <div class="list-name">${esc(m.name||m.studentId)}</div>
                  <div class="list-sub">${esc(m.studentId||'')} · ${esc(m.position||'สมาชิก')}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:800;font-size:.9rem;color:var(--c-indigo-600);">${m.eventCount} งาน</div>
                  <div style="font-size:.72rem;color:var(--text-3);">${m.totalHours.toFixed(1)} ชม.</div>
                </div>
              </div>`).join('')}
          </div>`}
    </div>
  `;
}

// ── EVENTS ────────────────────────────────────────────────────────────────────
async function renderEvents() {
  let events = [];
  let myParts = {}; // eventId -> participation

  if (!DEMO && db) {
    try {
      const uid = currentUser?.uid || userData?.studentId || '';
      const [evSnap, pSnap] = await Promise.all([
        db.collection('events').orderBy('date','desc').get(),
        db.collection('participations').where('userId','==', currentUser?.uid || '').get(),
      ]);
      events = evSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      pSnap.docs.forEach(d => { myParts[d.data().eventId] = { id: d.id, ...d.data() }; });
    } catch(_) {}
  }

  const openEvents   = events.filter(e => e.status === 'open');
  const closedEvents = events.filter(e => e.status !== 'open');

  const eventHtml = (ev) => {
    const part = myParts[ev.id];
    const dt = ev.date ? new Date(ev.date).toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'}) : '—';
    const posCount = (ev.positions||[]).length;
    let actionHtml = '';
    if (part) {
      const badge = part.status === 'approved'
        ? '<span class="badge badge-success">✅ เข้าร่วมแล้ว</span>'
        : part.status === 'pending'
        ? '<span class="badge badge-warning">⏳ รออนุมัติ</span>'
        : '<span class="badge badge-danger">✗ ไม่อนุมัติ</span>';
      actionHtml = badge;
      if (part.status === 'pending') {
        actionHtml += `<button class="btn btn-xs btn-danger mt-4" onclick="cancelParticipation('${part.id}')">ยกเลิก</button>`;
      }
    } else if (ev.status === 'open') {
      actionHtml = `<button class="btn btn-xs btn-primary" onclick="openJoinModal('${ev.id}','${esc(ev.title||'')}','${ev.hours||0}')">+ เข้าร่วม</button>`;
    } else {
      actionHtml = '<span class="badge badge-danger">ปิดรับแล้ว</span>';
    }

    const posBadge = posCount ? `<span class="badge badge-indigo" style="font-size:.68rem;">📌 ${posCount} ตำแหน่ง</span>` : '';
    return `
      <div class="card" style="padding:14px 16px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:.92rem;">${esc(ev.title||'—')}</div>
            <div style="font-size:.76rem;color:var(--text-3);margin-top:3px;">📅 ${dt} &nbsp;⏱ ${ev.hours||0} ชม.${ev.location?` &nbsp;📍 ${esc(ev.location)}`:''}</div>
            ${ev.description?`<div style="font-size:.8rem;color:var(--text-2);margin-top:5px;">${esc(ev.description)}</div>`:''}
            ${posBadge ? `<div style="margin-top:5px;">${posBadge}</div>` : ''}
          </div>
        </div>
        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${actionHtml}
          ${ev.status === 'open' ? `<button class="btn btn-xs btn-ghost" onclick="openAddPosition('${ev.id}','${esc(ev.title||'')}')">📌 เพิ่มตำแหน่ง</button>` : ''}
        </div>
      </div>`;
  };

  document.getElementById('mainContent').innerHTML = `
    <div class="fade-in">
      <div class="section-header">
        <span class="section-title">🎯 กิจกรรมเปิดรับ (${openEvents.length})</span>
      </div>
      ${openEvents.length === 0
        ? '<div class="empty-state"><span class="empty-icon">🎯</span><p class="empty-title">ยังไม่มีกิจกรรมที่เปิดรับ</p></div>'
        : openEvents.map(eventHtml).join('')}

      ${closedEvents.length > 0 ? `
      <div class="section-header mt-12">
        <span class="section-title" style="color:var(--text-3);">กิจกรรมที่ปิดแล้ว</span>
      </div>
      ${closedEvents.map(eventHtml).join('')}` : ''}
    </div>
  `;
}

// ── Add Position (committee can add, not edit/delete) ─────────────────────────
window.openAddPosition = async (eventId, title) => {
  document.getElementById('addPosEventId').value = eventId;
  document.getElementById('addPositionEventName').textContent = `📌 กิจกรรม: ${title}`;
  document.getElementById('newPosName').value = '';
  document.getElementById('newPosSlots').value = '1';
  // Load existing positions (read-only display)
  try {
    const snap = await db.collection('events').doc(eventId).get();
    const existing = snap.data()?.positions || [];
    document.getElementById('existingPositions').innerHTML = existing.length
      ? `<div style="margin-bottom:8px;"><div style="font-size:.75rem;color:var(--text-3);margin-bottom:4px;">ตำแหน่งที่มีอยู่แล้ว:</div>
          ${existing.map(p=>`<div style="display:flex;justify-content:space-between;background:var(--surface2);border-radius:6px;padding:6px 10px;margin-bottom:4px;font-size:.82rem;">
            <span>${esc(p.name)}</span><span style="color:var(--text-3)">รับ ${p.slots} คน</span>
          </div>`).join('')}
        </div>`
      : '<div style="font-size:.78rem;color:var(--text-3);margin-bottom:8px;">ยังไม่มีตำแหน่ง</div>';
  } catch(_) {}
  document.getElementById('addPositionModal').classList.add('open');
};

document.getElementById('cancelAddPos').onclick = () => document.getElementById('addPositionModal').classList.remove('open');
document.getElementById('confirmAddPos').onclick = async () => {
  const eventId = document.getElementById('addPosEventId').value;
  const name  = document.getElementById('newPosName').value.trim();
  const slots = parseInt(document.getElementById('newPosSlots').value)||1;
  if (!name) { showToast('กรุณากรอกชื่อตำแหน่ง'); return; }
  try {
    const snap = await db.collection('events').doc(eventId).get();
    const existing = snap.data()?.positions || [];
    if (existing.find(p=>p.name===name)) { showToast('มีตำแหน่งนี้แล้ว'); return; }
    existing.push({ id: 'p_'+Date.now(), name, slots });
    await db.collection('events').doc(eventId).update({ positions: existing });
    document.getElementById('addPositionModal').classList.remove('open');
    showToast('เพิ่มตำแหน่งสำเร็จ ✅');
    renderEvents();
  } catch(ex) { showToast('เกิดข้อผิดพลาด: '+ex.message); }
};

// Join modal
let _joinEventId = '', _joinHours = 0, _joinTitle = '', _joinPositions = [];

window.openJoinModal = async (eventId, title, hours) => {
  _joinEventId = eventId;
  _joinHours   = parseFloat(hours) || 0;
  _joinTitle   = title;
  _joinPositions = [];
  document.getElementById('joinEventTitle').textContent = `🎯 ${title}`;
  document.getElementById('joinEventContent').innerHTML = '<div class="spinner-wrap" style="padding:20px 0"><div class="spinner"></div></div>';
  document.getElementById('confirmJoinBtn').style.display = 'block';
  document.getElementById('eventJoinModal').classList.add('open');
  try {
    const snap = await db.collection('events').doc(eventId).get();
    _joinPositions = snap.data()?.positions || [];
  } catch(_) { _joinPositions = []; }
  const posHtml = _joinPositions.length ? `
    <div class="form-group" style="margin-top:10px;">
      <label class="form-label" style="font-size:.82rem;">เลือกตำแหน่งที่ต้องการ <span style="color:var(--c-rose)">*</span></label>
      <select class="form-select" id="cJoinPositionSelect">
        <option value="">— เลือกตำแหน่ง —</option>
        ${_joinPositions.map(p=>`<option value="${esc(p.name)}">${esc(p.name)} (รับ ${p.slots} คน)</option>`).join('')}
      </select>
    </div>` : '';
  document.getElementById('joinEventContent').innerHTML = `
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:14px;margin-bottom:12px;">
      <div style="font-size:.88rem;color:var(--text-2);line-height:1.7;">
        คุณต้องการลงชื่อเข้าร่วมกิจกรรมนี้ใช่ไหม?<br>
        หลังจากส่งคำขอแล้ว ประธานจะตรวจสอบและอนุมัติให้<br>
        <strong>ชั่วโมงที่จะได้รับ: ${hours} ชม.</strong>
      </div>
    </div>${posHtml}`;
};

document.getElementById('cancelJoin').onclick = () => document.getElementById('eventJoinModal').classList.remove('open');

document.getElementById('confirmJoinBtn').onclick = async () => {
  if (DEMO) { showToast('โหมดทดสอบ — ต้องเชื่อมต่อ Firebase'); return; }
  if (!currentUser) { showToast('กรุณา login ผ่าน Firebase'); return; }
  const positionName = document.getElementById('cJoinPositionSelect')?.value || '';
  if (_joinPositions.length && !positionName) { showToast('กรุณาเลือกตำแหน่งที่ต้องการ'); return; }
  const btn = document.getElementById('confirmJoinBtn');
  btn.disabled = true; btn.textContent = 'กำลังส่ง…';
  try {
    await db.collection('participations').add({
      eventId:      _joinEventId,
      eventTitle:   _joinTitle,
      userId:       currentUser.uid,
      studentId:    userData.studentId,
      name:         userData.name || userData.studentId,
      program:      myProgram,
      hours:        _joinHours,
      positionName: positionName,
      status:       'pending',
      requestedAt:  firebase.firestore.FieldValue.serverTimestamp(),
    });
    document.getElementById('eventJoinModal').classList.remove('open');
    showToast('ส่งคำขอเข้าร่วมแล้ว ⏳ รอแอดมินอนุมัติ');
    renderEvents();
  } catch(ex) { showToast('เกิดข้อผิดพลาด: ' + ex.message); }
  btn.disabled = false; btn.textContent = '✅ ยืนยันเข้าร่วม';
};

window.cancelParticipation = async (partId) => {
  if (!confirm('ยกเลิกการสมัครเข้าร่วมกิจกรรมนี้?')) return;
  try {
    await db.collection('participations').doc(partId).delete();
    showToast('ยกเลิกแล้ว');
    renderEvents();
  } catch(ex) { showToast('เกิดข้อผิดพลาด: ' + ex.message); }
};

// ── BOARD (ป้ายประกาศ + รายงาน) ──────────────────────────────────────────────
async function renderBoard() {
  let banners = [], newsList = [], members = [], approvedParts = [];

  if (!DEMO && db) {
    try {
      const [bSnap, nSnap] = await Promise.all([
        db.collection('banners').where('active','==',true).get(),
        db.collection('news').get(),
      ]);
      banners  = bSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      newsList = nSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
    } catch(_) {}

    if (myProgram) {
      try {
        const [mSnap, pSnap] = await Promise.all([
          db.collection('users').where('program','==',myProgram).get(),
          db.collection('participations').where('program','==',myProgram).where('status','==','approved').get(),
        ]);
        members = mSnap.docs.map(d => ({ _id: d.id, ...d.data() }));
        approvedParts = pSnap.docs.map(d => d.data());
      } catch(_) {}
    }
  }

  const summary = {};
  members.forEach(m => { summary[m._id] = { name: m.name||m.studentId, studentId: m.studentId, hours: 0, count: 0 }; });
  approvedParts.forEach(p => { if (summary[p.userId]) { summary[p.userId].hours += (p.hours||0); summary[p.userId].count++; } });
  const reportRows = Object.values(summary).sort((a,b) => b.hours - a.hours);
  const totalHours = reportRows.reduce((s,r) => s + r.hours, 0);
  window._reportRows = reportRows; window._reportProgram = myProgram;

  document.getElementById('mainContent').innerHTML = `
    <div class="fade-in">

      <!-- ป้ายประกาศ -->
      <div class="section-header">
        <span class="section-title">🖼️ ป้ายประกาศ</span>
        <button class="btn btn-primary btn-sm" onclick="openBannerModal()">+ เพิ่มป้าย</button>
      </div>
      ${banners.length === 0
        ? '<div class="empty-state"><span class="empty-icon">🖼️</span><p class="empty-title">ยังไม่มีป้ายประกาศ</p></div>'
        : banners.map(b => `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;box-shadow:var(--shadow-sm);">
            ${b.imageUrl?`<img src="${esc(b.imageUrl)}" style="width:100%;border-radius:8px;max-height:160px;object-fit:cover;display:block;margin-bottom:10px;" onerror="this.style.display='none'">` : ''}
            <div style="font-weight:800;font-size:.92rem;">${esc(b.title||'')}</div>
            ${b.description?`<div style="font-size:.82rem;color:var(--text-2);margin-top:4px;">${esc(b.description)}</div>`:''}
            <div style="font-size:.72rem;color:var(--text-3);margin-top:4px;">โดย ${esc(b.createdBy||'—')}</div>
            ${b.createdBy === (userData.name||userData.studentId) ? `
            <div class="flex gap-8 mt-8">
              <button class="btn btn-xs btn-ghost" onclick="openEditBanner('${b.id}')">✏️ แก้ไข</button>
              <button class="btn btn-xs btn-danger" onclick="deleteBanner('${b.id}')">ลบ</button>
            </div>` : ''}
          </div>`).join('')}

      <!-- ข่าวสาร -->
      <div class="section-header mt-12">
        <span class="section-title">📢 ข่าวสาร</span>
      </div>
      ${newsList.length === 0
        ? '<div class="empty-state"><span class="empty-icon">📢</span><p class="empty-title">ยังไม่มีข่าวสาร</p></div>'
        : newsList.slice(0,5).map(n => {
            const dt = n.createdAt?.toDate ? n.createdAt.toDate() : new Date();
            return `<div class="news-card">
              <div class="news-accent-bar ${n.urgent?'urgent':''}"></div>
              <div class="news-body">
                <div class="news-tag ${n.urgent?'urgent':''}">${n.urgent?'⚠️ ด่วน':'📢 ประกาศ'}</div>
                <div class="news-title">${esc(n.title)}</div>
                <div class="news-content">${esc(n.content||'').replace(/\n/g,'<br>')}</div>
                <div class="news-meta"><span>🕐 ${dt.toLocaleDateString('th-TH',{day:'numeric',month:'short'})}</span></div>
              </div>
            </div>`;
          }).join('')}

      <!-- รายงานทีม -->
      <div class="section-header mt-12">
        <span class="section-title">📄 รายงานทีม</span>
        <button class="btn btn-xs btn-ghost" onclick="exportTeamCSV()">⬇️ Export CSV</button>
      </div>
      <div class="stats-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:12px;">
        <div class="stat-card s-green"><span class="stat-icon">👥</span><div class="stat-value">${members.length}</div><div class="stat-label">สมาชิก</div></div>
        <div class="stat-card s-indigo"><span class="stat-icon">🎯</span><div class="stat-value">${approvedParts.length}</div><div class="stat-label">เข้าร่วม</div></div>
        <div class="stat-card s-cyan"><span class="stat-icon">⏱️</span><div class="stat-value">${totalHours.toFixed(0)}</div><div class="stat-label">ชม.รวม</div></div>
      </div>
      <div class="card" style="padding:10px 8px;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>ชื่อ</th><th>งาน</th><th>ชม.</th></tr></thead>
            <tbody>
              ${reportRows.length === 0
                ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-3);">ยังไม่มีข้อมูล</td></tr>'
                : reportRows.map((r,i) => `<tr>
                    <td>${i+1}</td>
                    <td><span class="font-bold">${esc(r.name)}</span><div style="font-size:.72rem;color:var(--text-3);">${esc(r.studentId||'')}</div></td>
                    <td><span class="badge badge-indigo">${r.count}</span></td>
                    <td><span class="badge badge-success">${r.hours.toFixed(1)}</span></td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

window.exportTeamCSV = () => {
  const rows = window._reportRows || [];
  const header = ['ลำดับ','ชื่อ-นามสกุล','รหัสนักศึกษา','หลักสูตร','จำนวนงาน','ชั่วโมงสะสม'];
  const data = rows.map((r,i) => [i+1, r.name, r.studentId, window._reportProgram||'', r.count, r.hours.toFixed(2)]);
  const csv = [header, ...data].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' });
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `รายงาน_${(window._reportProgram||'ทีม').replace(/\s/g,'_')}.csv`
  }).click();
};

// Banner CRUD (committee)
window.openBannerModal = () => {
  document.getElementById('bId').value = '';
  document.getElementById('bannerModalTitle').textContent = '🖼️ เพิ่มป้ายประกาศ';
  ['bTitle','bImageUrl','bDesc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('bActive').checked = true;
  document.getElementById('bImagePreview').innerHTML = '';
  document.getElementById('bannerModal').classList.add('open');
};

window.openEditBanner = async (id) => {
  try {
    const snap = await db.collection('banners').doc(id).get();
    if (!snap.exists) return;
    const b = snap.data();
    document.getElementById('bId').value = id;
    document.getElementById('bannerModalTitle').textContent = '✏️ แก้ไขป้าย';
    document.getElementById('bTitle').value    = b.title || '';
    document.getElementById('bImageUrl').value = b.imageUrl || '';
    document.getElementById('bDesc').value     = b.description || '';
    document.getElementById('bActive').checked = b.active !== false;
    document.getElementById('bImagePreview').innerHTML = b.imageUrl
      ? `<img src="${esc(b.imageUrl)}" style="width:100%;border-radius:8px;max-height:150px;object-fit:cover;">`:'';
    document.getElementById('bannerModal').classList.add('open');
  } catch(ex) { showToast('เกิดข้อผิดพลาด'); }
};

document.getElementById('cancelBanner').onclick = () => document.getElementById('bannerModal').classList.remove('open');
document.getElementById('bImageUrl')?.addEventListener('input', function() {
  const prev = document.getElementById('bImagePreview');
  prev.innerHTML = this.value ? `<img src="${esc(this.value)}" style="width:100%;border-radius:8px;max-height:150px;object-fit:cover;" onerror="this.style.display='none'">` : '';
});

document.getElementById('bannerForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (DEMO) { showToast('โหมดทดสอบ'); return; }
  const btn = document.getElementById('bannerSubmit');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  const id   = document.getElementById('bId').value;
  const data = {
    title:       document.getElementById('bTitle').value.trim(),
    imageUrl:    document.getElementById('bImageUrl').value.trim(),
    description: document.getElementById('bDesc').value.trim(),
    active:      document.getElementById('bActive').checked,
    createdBy:   userData.name || userData.studentId,
    program:     myProgram,
  };
  try {
    if (id) {
      await db.collection('banners').doc(id).update(data);
      showToast('แก้ไขป้ายสำเร็จ ✅');
    } else {
      await db.collection('banners').add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      showToast('เพิ่มป้ายสำเร็จ ✅');
    }
    document.getElementById('bannerModal').classList.remove('open');
    renderBoard();
  } catch(ex) { showToast('เกิดข้อผิดพลาด: ' + ex.message); }
  btn.disabled = false; btn.textContent = '✅ บันทึก';
});

window.deleteBanner = async (id) => {
  if (!confirm('ลบป้ายประกาศนี้?')) return;
  await db.collection('banners').doc(id).delete();
  showToast('ลบแล้ว'); renderBoard();
};

function showProfile() {
  // Inject profile modal if not in cached HTML
  if (!document.getElementById('committeeProfileModal')) {
    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'committeeProfileModal';
    div.innerHTML = `<div class="modal">
      <div class="modal-handle"></div>
      <div id="committeeProfileContent"></div>
      <div class="flex gap-8 mt-12" style="flex-wrap:wrap;">
        <button class="btn btn-ghost w-full" onclick="document.getElementById('committeeProfileModal').classList.remove('open')">ปิด</button>
        <button class="btn btn-ghost w-full" onclick="document.getElementById('committeeProfileModal').classList.remove('open');openCommitteeEditProfileModal()">✏️ แก้ไขโปรไฟล์</button>
        <button class="btn btn-danger w-full" onclick="sessionStorage.removeItem('localUser');if(typeof auth!=='undefined'&&auth)auth.signOut();window.location.replace('index.html')">ออกจากระบบ</button>
      </div>
    </div>`;
    document.body.appendChild(div);
  }
  const sid = userData.studentId||'';
  const prog = userData.program||myProgram||'';
  const shortProg = prog.length > 22 ? prog.slice(0,21)+'…' : prog;
  const initial = (userData.name||sid||'?')[0].toUpperCase();
  const year = new Date().getFullYear()+543;
  const barcode = sid.split('').map((c,i)=>{
    const w = i%3===0?3:1, h=(parseInt(c)||1)*2+10;
    return `<div style="width:${w}px;height:${h}px;background:#f0c040;display:inline-block;margin:0 .5px;vertical-align:bottom;"></div>`;
  }).join('');
  const photoBox = userData.photoURL
    ? `<div style="position:relative;width:82px;margin-bottom:6px;">
        <img src="${esc(userData.photoURL)}" style="width:82px;height:100px;object-fit:cover;border-radius:6px;border:2px solid #c8960c;display:block;">
        <button onclick="triggerCommitteePhotoUpload()" style="position:absolute;bottom:4px;right:4px;width:22px;height:22px;border-radius:50%;background:#c8960c;border:none;cursor:pointer;font-size:.65rem;">📷</button>
      </div>`
    : `<div style="position:relative;width:82px;margin-bottom:6px;">
        <div style="width:82px;height:100px;background:linear-gradient(160deg,#065f46,#059669);border-radius:6px;border:2px solid #c8960c;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:2.2rem;font-weight:800;color:#f0c040;">${esc(initial)}</span>
        </div>
        <button onclick="triggerCommitteePhotoUpload()" style="position:absolute;bottom:4px;right:4px;width:22px;height:22px;border-radius:50%;background:#c8960c;border:none;cursor:pointer;font-size:.65rem;">📷</button>
      </div>`;

  document.getElementById('committeeProfileContent').innerHTML = `
    <div style="border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.4);max-width:360px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0d1f5c,#1a2d80);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="icons/logo.png" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid #c8960c;background:rgba(255,255,255,.1);flex-shrink:0;" onerror="this.style.display='none'">
          <div>
            <div style="color:#f0c040;font-size:.6rem;font-weight:800;letter-spacing:.06em;line-height:1.4;">${esc(FACULTY_NAME||'คณะมนุษยศาสตร์และสังคมศาสตร์')}</div>
            <div style="color:rgba(255,255,255,.7);font-size:.52rem;letter-spacing:.04em;line-height:1.4;">${esc(UNIVERSITY_NAME||'มหาวิทยาลัยสวนดุสิต')}</div>
          </div>
        </div>
        <span style="background:rgba(212,160,23,.2);border:1px solid #c8960c;border-radius:20px;padding:2px 8px;font-size:.6rem;font-weight:800;color:#f0c040;">คณะกรรมการ</span>
      </div>
      <div style="height:4px;background:linear-gradient(90deg,#6b4c00,#c8960c,#f0c040,#c8960c,#6b4c00);"></div>
      <div style="background:#f2ece0;padding:14px;display:flex;gap:12px;">
        <div style="flex-shrink:0;width:82px;">
          ${photoBox}
          <div style="font-size:.52rem;color:#888;text-align:center;">PHOTO</div>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="margin-bottom:8px;">
            <div style="font-size:.52rem;color:#c8960c;letter-spacing:.1em;font-weight:700;">NAME</div>
            <div style="font-size:.88rem;font-weight:800;color:#0d1f5c;line-height:1.25;">${esc(userData.name||sid)}</div>
          </div>
          <div style="margin-bottom:7px;">
            <div style="font-size:.52rem;color:#c8960c;letter-spacing:.1em;font-weight:700;">STUDENT ID</div>
            <div style="font-size:.78rem;font-weight:700;color:#222;font-family:monospace;">${esc(sid)}</div>
          </div>
          ${shortProg?`<div style="margin-bottom:7px;">
            <div style="font-size:.52rem;color:#c8960c;letter-spacing:.1em;font-weight:700;">PROGRAM</div>
            <div style="font-size:.68rem;font-weight:600;color:#444;line-height:1.3;">${esc(shortProg)}</div>
          </div>`:''}
          ${userData.position?`<div style="margin-bottom:7px;">
            <div style="font-size:.52rem;color:#c8960c;letter-spacing:.1em;font-weight:700;">POSITION</div>
            <div style="font-size:.72rem;font-weight:800;color:#065f46;">${esc(userData.position)}</div>
          </div>`:''}
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <div><div style="font-size:.52rem;color:#c8960c;letter-spacing:.08em;font-weight:700;">PHONE</div><div style="font-size:.65rem;color:#444;">${esc(userData.phone||'—')}</div></div>
            <div><div style="font-size:.52rem;color:#c8960c;letter-spacing:.08em;font-weight:700;">LINE</div><div style="font-size:.65rem;color:#444;">${esc(userData.lineId||'—')}</div></div>
          </div>
        </div>
      </div>
      <div style="background:linear-gradient(135deg,#0d1f5c,#0a1845);padding:8px 14px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:.58rem;color:rgba(255,255,255,.5);">ID: ${esc(sid)}</div>
          <div style="font-size:.6rem;color:#f0c040;font-weight:700;margin-top:1px;">ปี ${year}</div>
        </div>
        <div style="display:flex;align-items:flex-end;">${barcode}</div>
      </div>
    </div>`;
  document.getElementById('committeeProfileModal').classList.add('open');
}

// ── Committee: Edit Profile Request ──────────────────────────────────────────
window.openCommitteeEditProfileModal = () => {
  if (!document.getElementById('committeeEditProfileModal')) {
    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'committeeEditProfileModal';
    div.innerHTML = `<div class="modal">
      <div class="modal-handle"></div>
      <h2 style="font-weight:800;font-size:1rem;margin-bottom:4px;">✏️ แก้ไขโปรไฟล์</h2>
      <p style="font-size:.82rem;color:var(--text-2,#555);margin-bottom:14px;">กรอกข้อมูลที่ต้องการเปลี่ยน — ประธาน/กรรมการจะตรวจสอบและอนุมัติ</p>
      <div style="margin-bottom:12px;">
        <label style="font-weight:700;font-size:.85rem;display:block;margin-bottom:6px;">เบอร์โทรศัพท์</label>
        <input class="form-input" type="tel" id="cepPhone" inputmode="tel" placeholder="08x-xxx-xxxx">
      </div>
      <div style="margin-bottom:16px;">
        <label style="font-weight:700;font-size:.85rem;display:block;margin-bottom:6px;">Line ID</label>
        <input class="form-input" type="text" id="cepLineId" placeholder="@lineId หรือ lineId">
      </div>
      <div id="cepError" style="color:#ef4444;font-size:.82rem;margin-bottom:8px;display:none;"></div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" style="flex:1" onclick="document.getElementById('committeeEditProfileModal').classList.remove('open')">ยกเลิก</button>
        <button class="btn btn-primary" style="flex:1" id="cepSubmitBtn" onclick="submitCommitteeProfileRequest()">📤 ส่งคำขอ</button>
      </div>
    </div>`;
    document.body.appendChild(div);
  }
  document.getElementById('cepPhone').value  = userData.phone  || '';
  document.getElementById('cepLineId').value = userData.lineId || '';
  document.getElementById('cepError').style.display = 'none';
  document.getElementById('committeeEditProfileModal').classList.add('open');
};

window.submitCommitteeProfileRequest = async () => {
  if (DEMO || !db || !currentUser) { showToast('กรุณา login ผ่าน Firebase'); return; }
  const phone  = document.getElementById('cepPhone').value.trim();
  const lineId = document.getElementById('cepLineId').value.trim();
  const errEl  = document.getElementById('cepError');
  if (phone === (userData.phone||'') && lineId === (userData.lineId||'')) {
    errEl.textContent = 'ไม่มีข้อมูลที่เปลี่ยนแปลง'; errEl.style.display = 'block'; return;
  }
  const btn = document.getElementById('cepSubmitBtn');
  btn.disabled = true; btn.textContent = 'กำลังส่ง…';
  try {
    await db.collection('profileRequests').add({
      userId: currentUser.uid, studentId: userData.studentId||'',
      name: userData.name||userData.studentId||'', phone, lineId,
      status: 'pending', requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    document.getElementById('committeeEditProfileModal').classList.remove('open');
    showToast('ส่งคำขอแล้ว ⏳ รอประธาน/กรรมการอนุมัติ');
  } catch(e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  btn.disabled = false; btn.textContent = '📤 ส่งคำขอ';
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, ms = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}
