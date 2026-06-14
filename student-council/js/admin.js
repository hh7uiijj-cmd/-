/* admin.js — v4 */
const DEMO = FIREBASE_CONFIG.apiKey.startsWith('REPLACE');
let db, auth, adminUser, adminData, activeTab = 'overview';
let _positions = []; // ตำแหน่งงานในกิจกรรม [{id,name,slots}]

// ── Boot ──────────────────────────────────────────────────────────────────────
(function boot() {
  // Fill program dropdowns after DOM ready
  const fillPrograms = () => {
    // เติม options ให้ทุก select ที่มี id="mProgram" หรือ class program-select
    ['mProgram', ...Array.from(document.querySelectorAll('.program-select')).map(s=>s.id)]
      .filter((v,i,a)=>v&&a.indexOf(v)===i)
      .forEach(id => {
        const sel = document.getElementById(id);
        if (!sel || sel.options.length > 1) return;
        (PROGRAMS || []).forEach(p => sel.appendChild(Object.assign(document.createElement('option'), { value: p, textContent: p })));
      });
  };

  // ── Inject missing form fields (cache-safe fallback) ─────────────────────────
  // Phone + Line ID fields in member form
  if (!document.getElementById('mPhone')) {
    const pwGroup = document.getElementById('mPasswordGroup');
    if (pwGroup) {
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="form-group">
          <label class="form-label">เบอร์โทรศัพท์</label>
          <input class="form-input" type="tel" id="mPhone" inputmode="tel" placeholder="08x-xxx-xxxx">
        </div>
        <div class="form-group">
          <label class="form-label">Line ID</label>
          <input class="form-input" type="text" id="mLineId" placeholder="@lineId หรือ lineId">
        </div>`;
      pwGroup.parentNode.insertBefore(div, pwGroup);
    }
  }

  // Positions section in event form
  if (!document.getElementById('positionsList')) {
    const evErr = document.getElementById('eventError');
    if (evErr) {
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="form-group">
          <label class="form-label">ตำแหน่งงาน <span style="font-weight:400;font-size:.8rem;color:var(--text-3)">(ไม่บังคับ — ถ้าไม่ระบุจะรับทุกคน)</span></label>
          <div id="positionsList" style="margin-bottom:6px;"></div>
          <button type="button" class="btn btn-xs btn-ghost" onclick="addPositionRow()">+ เพิ่มตำแหน่ง</button>
        </div>`;
      evErr.parentNode.insertBefore(div, evErr);
    }
  }

  // Log tab in nav (5th tab)
  if (!document.querySelector('.nav-item[data-tab="logs"]')) {
    const nav = document.querySelector('.bottom-nav');
    if (nav) {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.dataset.tab = 'logs';
      btn.innerHTML = '<span class="nav-icon">📝</span><span>Log</span>';
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        renderTab('logs');
      });
      nav.appendChild(btn);
    }
  }

  // Image URL preview
  document.getElementById('bImageUrl')?.addEventListener('input', e => {
    const p = document.getElementById('bImagePreview');
    p.innerHTML = e.target.value ? `<img src="${xe(e.target.value)}" style="width:100%;border-radius:8px;max-height:140px;object-fit:cover;margin-top:6px;" onerror="this.remove()">` : '';
  });

  const local = sessionStorage.getItem('localUser');
  if (local) {
    adminData = JSON.parse(local);
    if (!['admin','vice_admin'].includes(adminData.role)) return go('index.html');
    if (!DEMO) { firebase.initializeApp(FIREBASE_CONFIG); db = firebase.firestore(); }
    document.getElementById('adminSubtitle').textContent = adminData.name || adminData.studentId;
    fillPrograms();
    renderTab('overview');
    return;
  }
  if (DEMO) {
    adminData = { name: 'Admin', studentId: 'admin', role: 'admin' };
    document.getElementById('adminSubtitle').textContent = 'Demo';
    fillPrograms();
    renderTab('overview');
    return;
  }
  firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  db   = firebase.firestore();
  auth.onAuthStateChanged(async user => {
    if (!user) return go('index.html');
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      if (!snap.exists || !['admin','vice_admin'].includes(snap.data().role)) return go('dashboard.html');
      adminUser = user;
      adminData = snap.data();
      document.getElementById('adminSubtitle').textContent = adminData.name || adminData.studentId;
      fillPrograms();
      renderTab('overview');
    } catch(e) {
      // Firestore error — still allow admin in with auth data
      adminUser = user;
      adminData = { name: user.email, studentId: user.email, role: 'admin' };
      document.getElementById('adminSubtitle').textContent = user.email;
      fillPrograms();
      renderTab('overview');
    }
  });
})();

document.getElementById('logoutTopBtn').onclick = () => {
  sessionStorage.removeItem('localUser');
  auth?.signOut();
  go('index.html');
};

function go(url) { window.location.replace(url); }

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  renderTab(b.dataset.tab);
}));

function renderTab(tab) {
  activeTab = tab;
  document.getElementById('mainContent').innerHTML = spin();
  ({ overview: tabOverview, members: tabMembers, events: tabEvents, board: tabBoard, logs: tabLogs }[tab] || tabOverview)();
}

function goTab(tab) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderTab(tab);
}

// ── OVERVIEW ──────────────────────────────────────────────────────────────────
async function tabOverview() {
  let members=0, events=0, approved=0, pending=[], top=[];
  if (!DEMO && db) {
    try {
      const [ms,es,ps] = await Promise.all([
        db.collection('users').get(),
        db.collection('events').get(),
        db.collection('participations').get(),
      ]);
      members = ms.size;
      events  = es.size;
      const approvedDocs = ps.docs.filter(d => d.data().status === 'approved');
      const pendingDocs  = ps.docs.filter(d => d.data().status === 'pending');
      approved = approvedDocs.length;
      pending  = pendingDocs.map(d => ({ id: d.id, ...d.data() }));

      const byUser = {};
      approvedDocs.forEach(d => {
        const p = d.data();
        byUser[p.userId] = byUser[p.userId] || { name: p.name||p.studentId, hours: 0, count: 0 };
        byUser[p.userId].hours += p.hours||0;
        byUser[p.userId].count++;
      });
      top = Object.values(byUser).sort((a,b) => b.hours-a.hours).slice(0,5);
    } catch(e) { showErr(e); }
  }

  const profileReqHtml = await tabProfileRequests();
  set('mainContent', `<div class="fade-in">
    <div class="stats-grid stagger">
      ${stat('s-indigo','👥',members,'สมาชิก')}
      ${stat('s-cyan','🎯',events,'กิจกรรม')}
      ${stat('s-green','✅',approved,'เข้าร่วมแล้ว')}
      <div class="stat-card s-amber" style="cursor:pointer" onclick="goTab('events')">
        <span class="stat-icon">⏳</span><div class="stat-value">${pending.length}</div><div class="stat-label">รออนุมัติ</div>
      </div>
    </div>
    <div class="quick-actions stagger">
      ${qb('👥','สมาชิก',"goTab('members')")}
      ${qb('➕','เพิ่มคน','openAddMember()')}
      ${qb('🎯','สร้างงาน','openEventModal()')}
      ${qb('🖼️','ป้ายประกาศ',"goTab('board')")}
    </div>
    ${pending.length ? `
    <div class="section-header mt-4">
      <span class="section-title">⏳ รออนุมัติ (${pending.length})</span>
      <button class="btn btn-xs btn-ghost" onclick="goTab('events')">ดูทั้งหมด</button>
    </div>
    <div class="card" style="padding:8px 12px">
      ${pending.slice(0,6).map(p=>`
        <div class="list-item">
          <div class="list-avatar" style="background:var(--grad-card-d);font-size:.75rem">${(p.name||'?')[0]}</div>
          <div class="list-info">
            <div class="list-name">${xe(p.name||p.studentId)}</div>
            <div class="list-sub">${xe(p.eventTitle||'—')} · ${xe(p.program||'')}</div>
          </div>
          <div class="flex gap-4">
            <button class="btn btn-xs btn-success" onclick="doApprove('${p.id}',true)">✓</button>
            <button class="btn btn-xs btn-danger" onclick="doApprove('${p.id}',false)">✗</button>
          </div>
        </div>`).join('')}
    </div>` : ''}
    ${profileReqHtml}
    <div class="section-header mt-4"><span class="section-title">🏆 Top ชั่วโมง</span></div>
    <div class="card">
      ${top.length ? top.map((m,i)=>`
        <div class="leaderboard-item">
          <div class="rank-badge">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</div>
          <div class="list-info"><div class="list-name">${xe(m.name)}</div><div class="list-sub">${m.count} กิจกรรม</div></div>
          <span class="badge badge-indigo">${m.hours.toFixed(1)} ชม.</span>
        </div>`).join('') : empty('🏆','ยังไม่มีข้อมูล')}
    </div>
  </div>`);
}

// ── MEMBERS ───────────────────────────────────────────────────────────────────
async function tabMembers() {
  let rows = [], filter = '';
  if (!DEMO && db) {
    try {
      rows = (await db.collection('users').get()).docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (a.name||'').localeCompare(b.name||'','th'));
    } catch(e) { showErr(e); }
  }

  window._memberRows = rows;
  window.applyFilter = v => { filter = v; renderMemberList(filter ? rows.filter(u=>u.program===filter) : rows); };

  const progOpts = ['', ...(PROGRAMS||[])].map(p =>
    `<option value="${xe(p)}">${p||'— ทุกหลักสูตร —'}</option>`).join('');

  const profileReqHtml = await tabProfileRequests();

  set('mainContent', `<div class="fade-in">
    ${profileReqHtml}
    <div class="section-header">
      <span class="section-title">👥 สมาชิก</span>
      <button class="btn btn-primary btn-sm" onclick="openAddMember()">➕ เพิ่ม</button>
    </div>
    <select class="form-select mb-12" onchange="applyFilter(this.value)">${progOpts}</select>
    <div id="memberList"></div>
  </div>`);
  renderMemberList(rows);
}

function renderMemberList(list) {
  set('memberList', `<div class="card" style="padding:8px 12px">
    ${list.length ? list.map(u=>`
      <div class="list-item">
        <div class="list-avatar">${(u.name||u.studentId||'?')[0].toUpperCase()}</div>
        <div class="list-info">
          <div class="list-name">${xe(u.name||u.studentId)}</div>
          <div class="list-sub">${xe(u.studentId||'')} · ${xe(u.program||'—')}</div>
          <div class="list-sub">${xe(u.position||'สมาชิก')}</div>
        </div>
        <div class="flex flex-col items-center gap-4">
          <span class="badge ${roleBadge(u.role)}">${roleLabel(u.role)}</span>
          <div class="flex gap-4">
            <button class="btn btn-xs btn-ghost" onclick="openEditMember('${u.id}')">✏️</button>
            <button class="btn btn-xs btn-danger" onclick="delMember('${u.id}','${xe(u.name||u.studentId)}')">ลบ</button>
          </div>
        </div>
      </div>`).join('') : empty('👥','ยังไม่มีสมาชิก')}
  </div>`);
}

function roleBadge(r){return r==='admin'||r==='vice_admin'?'badge-warning':r==='committee'?'badge-success':'badge-indigo';}
function roleLabel(r){return r==='admin'?'ประธาน':r==='vice_admin'?'รองประธาน':r==='committee'?'กรรมการ':'สมาชิก';}

window.openAddMember = () => {
  clearForm('addMemberForm');
  document.getElementById('mUid').value = '';
  document.getElementById('addMemberTitle').textContent = '➕ เพิ่มสมาชิกใหม่';
  document.getElementById('mStudentId').readOnly = false;
  document.getElementById('mStudentId').removeAttribute('maxlength');
  document.getElementById('mStudentId').setAttribute('maxlength','13');
  document.getElementById('mStudentId').setAttribute('minlength','13');
  document.getElementById('mPasswordGroup').style.display = '';
  document.getElementById('mPassword').required = true;
  openModal('addMemberModal');
};

window.openEditMember = async id => {
  try {
    const u = (await db.collection('users').doc(id).get()).data();
    if (!u) return;
    document.getElementById('mUid').value          = id;
    document.getElementById('addMemberTitle').textContent = '✏️ แก้ไขสมาชิก';
    document.getElementById('mName').value         = u.name||'';
    document.getElementById('mStudentId').value    = u.studentId||'';
    document.getElementById('mStudentId').readOnly = true;
    document.getElementById('mPosition').value     = u.position||'';
    document.getElementById('mRole').value         = u.role||'member';
    document.getElementById('mProgram').value      = u.program||'';
    document.getElementById('mPhone').value        = u.phone||'';
    document.getElementById('mLineId').value       = u.lineId||'';
    document.getElementById('mPasswordGroup').style.display = 'none';
    document.getElementById('mPassword').required = false;
    document.getElementById('addMemberError').style.display = 'none';
    openModal('addMemberModal');
  } catch(e){ toast('โหลดข้อมูลไม่ได้: '+e.message); }
};

document.getElementById('cancelAddMember').onclick = () => closeModal('addMemberModal');

document.getElementById('addMemberForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('addMemberSubmit');
  const err = document.getElementById('addMemberError');
  btn.disabled = true; err.style.display = 'none';
  const uid      = document.getElementById('mUid').value;
  const name     = document.getElementById('mName').value.trim();
  const studentId = document.getElementById('mStudentId').value.trim();
  const position = document.getElementById('mPosition').value.trim();
  const role     = document.getElementById('mRole').value;
  const program  = document.getElementById('mProgram').value;
  const phone    = document.getElementById('mPhone').value.trim();
  const lineId   = document.getElementById('mLineId').value.trim();

  if (!uid && studentId.length !== 13) {
    err.textContent = 'รหัสนักศึกษาต้องมี 13 หลัก';
    err.style.display = ''; btn.disabled = false; return;
  }

  if (uid) { // EDIT
    try {
      await db.collection('users').doc(uid).update({ name, position, role, program, phone, lineId });
      closeModal('addMemberModal'); toast('แก้ไขสำเร็จ ✅'); tabMembers();
    } catch(ex){ err.textContent = ex.message; err.style.display = ''; }
  } else { // ADD NEW
    const pw = document.getElementById('mPassword').value;
    const email = studentId + AUTH_DOMAIN_SUFFIX;
    let sec;
    try {
      sec = firebase.initializeApp(FIREBASE_CONFIG, 'sec_'+Date.now());
      let uid2;
      try { uid2 = (await sec.auth().createUserWithEmailAndPassword(email, pw)).user.uid; }
      catch(ce) {
        if (ce.code === 'auth/email-already-in-use') {
          try { uid2 = (await sec.auth().signInWithEmailAndPassword(email, pw)).user.uid; }
          catch(_) { throw new Error('มี account นี้แล้ว รหัสผ่านไม่ตรง'); }
        } else throw ce;
      }
      await sec.firestore().collection('users').doc(uid2).set({ studentId, name, position, role, program, phone, lineId, email, createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await sec.delete();
      writeLog('➕ เพิ่มสมาชิก', `${name} (${studentId}) หลักสูตร: ${program||'—'} สิทธิ์: ${roleLabel(role)}`);
      closeModal('addMemberModal'); toast('เพิ่มสมาชิกสำเร็จ ✅'); tabMembers();
    } catch(ex) {
      if (sec) try { await sec.delete(); } catch(_){}
      err.textContent = {'auth/weak-password':'รหัสผ่านต้องมีอย่างน้อย 6 ตัว'}[ex.code]||ex.message;
      err.style.display = '';
    }
  }
  btn.disabled = false;
});

window.delMember = async (id, name) => {
  if (!confirm(`ลบ "${name}"?`)) return;
  await db.collection('users').doc(id).delete();
  writeLog('🗑️ ลบสมาชิก', name);
  toast('ลบแล้ว'); tabMembers();
};

// ── EVENTS ────────────────────────────────────────────────────────────────────
async function tabEvents() {
  let events = [], allParts = [];
  if (!DEMO && db) {
    try {
      const [es, ps] = await Promise.all([
        db.collection('events').get(),
        db.collection('participations').get(),
      ]);
      events   = es.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
      allParts = ps.docs.map(d=>({id:d.id,...d.data()}));
    } catch(e) { set('mainContent',`<div class="empty-state"><span class="empty-icon">⚠️</span><p class="empty-title">โหลดไม่ได้</p><p class="empty-sub">${xe(e.message)}</p></div>`); return; }
  }

  const pending = allParts.filter(p=>p.status==='pending');

  set('mainContent', `<div class="fade-in">
    ${pending.length ? `
    <div class="section-header"><span class="section-title">⏳ รออนุมัติ (${pending.length})</span></div>
    <div class="card" style="padding:8px 12px;margin-bottom:14px">
      ${pending.map(p=>`
        <div class="list-item">
          <div class="list-avatar" style="background:var(--grad-card-d);font-size:.75rem">${(p.name||'?')[0]}</div>
          <div class="list-info">
            <div class="list-name">${xe(p.name||p.studentId)}</div>
            <div class="list-sub">${xe(p.eventTitle||'—')}</div>
            <div class="list-sub" style="font-size:.72rem">${xe(p.program||'')} · ${xe(p.studentId||'')}</div>
          </div>
          <div class="flex gap-4">
            <button class="btn btn-xs btn-success" onclick="doApprove('${p.id}',true)">✓ อนุมัติ</button>
            <button class="btn btn-xs btn-danger" onclick="doApprove('${p.id}',false)">✗</button>
          </div>
        </div>`).join('')}
    </div>` : `<div class="card mb-12" style="text-align:center;padding:12px;color:var(--text-3);font-size:.85rem">✅ ไม่มีรายการรออนุมัติ</div>`}

    <div class="section-header">
      <span class="section-title">🎯 กิจกรรม (${events.length})</span>
      <button class="btn btn-primary btn-sm" onclick="openEventModal()">+ สร้างงาน</button>
    </div>
    ${events.length ? events.map(ev=>evCard(ev, allParts.filter(p=>p.eventId===ev.id))).join('') : empty('🎯','ยังไม่มีกิจกรรม','กดปุ่มสร้างงานได้เลย')}
  </div>`);
}

function evCard(ev, parts) {
  const dt = ev.date ? new Date(ev.date).toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'}) : '—';
  const approved = parts.filter(p=>p.status==='approved').length;
  const pending  = parts.filter(p=>p.status==='pending').length;
  return `<div class="card" style="padding:14px 16px;margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:800">${xe(ev.title||'—')}</div>
        <div style="font-size:.76rem;color:var(--text-3);margin-top:3px">📅 ${dt} &nbsp;⏱ ${ev.hours||0} ชม.${ev.location?` &nbsp;📍 ${xe(ev.location)}`:''}  </div>
        ${ev.description?`<div style="font-size:.8rem;color:var(--text-2);margin-top:5px">${xe(ev.description)}</div>`:''}
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <span class="badge badge-success">✅ ${approved}</span>
          ${pending?`<span class="badge badge-warning">⏳ ${pending}</span>`:''}
          ${ev.status==='closed'?'<span class="badge badge-danger">ปิดแล้ว</span>':'<span class="badge badge-success" style="background:rgba(16,185,129,.12);color:var(--c-emerald)">เปิดรับ</span>'}
        </div>
      </div>
    </div>
    <div class="flex gap-8 mt-12" style="flex-wrap:wrap">
      <button class="btn btn-xs btn-ghost" onclick="viewParts('${ev.id}','${xe(ev.title||'')}')">👁 รายชื่อ</button>
      <button class="btn btn-xs btn-ghost" onclick="exportEventCSV('${ev.id}','${xe(ev.title||'')}')">⬇️ Export</button>
      <button class="btn btn-xs btn-ghost" onclick="openEditEvent('${ev.id}')">✏️ แก้ไข</button>
      ${ev.status!=='closed'
        ?`<button class="btn btn-xs btn-warning" onclick="setEvStatus('${ev.id}','closed')">🔒 ปิดรับ</button>`
        :`<button class="btn btn-xs btn-ghost" onclick="setEvStatus('${ev.id}','open')">🔓 เปิดอีกครั้ง</button>`}
      ${adminData.role !== 'vice_admin' ? `<button class="btn btn-xs btn-danger" onclick="delEvent('${ev.id}')">ลบ</button>` : ''}
    </div>
  </div>`;
}

// ── Position rows ──────────────────────────────────────────────────────────────
window.addPositionRow = () => {
  _positions.push({ id: 'p_'+Date.now(), name: '', slots: 1 });
  renderPositionRows();
};
window.removePosition = i => { _positions.splice(i, 1); renderPositionRows(); };

function renderPositionRows() {
  const container = document.getElementById('positionsList');
  if (!container) return;
  if (!_positions.length) {
    container.innerHTML = '<div style="font-size:.78rem;color:var(--text-3);padding:2px 0;">ยังไม่มีตำแหน่ง (รับทุกคนโดยไม่จำกัดตำแหน่ง)</div>';
    return;
  }
  container.innerHTML = _positions.map((p, i) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
      <input class="form-input" style="flex:1;min-width:0;" placeholder="ชื่อตำแหน่ง เช่น ช่างภาพ"
        value="${xe(p.name)}" oninput="_positions[${i}].name=this.value.trim()">
      <input class="form-input" style="width:60px;" type="number" min="1" max="999" title="จำนวนที่รับ"
        value="${p.slots}" oninput="_positions[${i}].slots=parseInt(this.value)||1">
      <span style="font-size:.75rem;color:var(--text-3);white-space:nowrap;">คน</span>
      <button type="button" class="btn btn-xs btn-danger" onclick="removePosition(${i})">✕</button>
    </div>`).join('');
}

// Create event
window.openEventModal = () => {
  clearForm('eventForm');
  document.getElementById('evId').value = '';
  document.getElementById('eventModalTitle').textContent = '🎯 สร้างกิจกรรม';
  document.getElementById('evDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('eventError').style.display = 'none';
  _positions = [];
  renderPositionRows();
  openModal('eventModal');
};

// Edit event
window.openEditEvent = async id => {
  try {
    const ev = (await db.collection('events').doc(id).get()).data();
    if (!ev) return;
    document.getElementById('evId').value          = id;
    document.getElementById('eventModalTitle').textContent = '✏️ แก้ไขกิจกรรม';
    document.getElementById('evTitle').value        = ev.title||'';
    document.getElementById('evDesc').value         = ev.description||'';
    document.getElementById('evDate').value         = ev.date||'';
    document.getElementById('evHours').value        = ev.hours||'';
    document.getElementById('evLocation').value     = ev.location||'';
    document.getElementById('eventError').style.display = 'none';
    _positions = (ev.positions || []).map(p => ({ ...p }));
    renderPositionRows();
    openModal('eventModal');
  } catch(e){ toast('โหลดไม่ได้: '+e.message); }
};

document.getElementById('cancelEvent').onclick = () => closeModal('eventModal');
document.getElementById('eventForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('eventSubmit');
  btn.disabled = true;
  const id = document.getElementById('evId').value;
  const validPositions = _positions.filter(p => p.name);
  const data = {
    title:       document.getElementById('evTitle').value.trim(),
    description: document.getElementById('evDesc').value.trim(),
    date:        document.getElementById('evDate').value,
    hours:       parseFloat(document.getElementById('evHours').value)||0,
    location:    document.getElementById('evLocation').value.trim(),
    positions:   validPositions,
  };
  try {
    if (id) {
      await db.collection('events').doc(id).update(data);
      writeLog('✏️ แก้ไขกิจกรรม', data.title);
      toast('แก้ไขสำเร็จ ✅');
    } else {
      await db.collection('events').add({...data, status:'open', createdBy: adminData.name||adminData.studentId, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
      writeLog('🎯 สร้างกิจกรรม', `${data.title} (${data.hours} ชม. วันที่ ${data.date})`);
      toast('สร้างกิจกรรมสำเร็จ ✅');
    }
    closeModal('eventModal'); tabEvents();
  } catch(ex) {
    document.getElementById('eventError').textContent = ex.message;
    document.getElementById('eventError').style.display = '';
  }
  btn.disabled = false;
});

window.setEvStatus = async (id,s) => {
  const snap = await db.collection('events').doc(id).get();
  await db.collection('events').doc(id).update({status:s});
  writeLog(s==='closed'?'🔒 ปิดรับกิจกรรม':'🔓 เปิดรับกิจกรรม', snap.data()?.title||id);
  toast(s==='closed'?'ปิดรับแล้ว':'เปิดอีกครั้ง'); tabEvents();
};
window.delEvent = async id => {
  if(!confirm('ลบกิจกรรมนี้?'))return;
  const snap = await db.collection('events').doc(id).get();
  await db.collection('events').doc(id).delete();
  writeLog('🗑️ ลบกิจกรรม', snap.data()?.title||id);
  toast('ลบแล้ว'); tabEvents();
};

window.doApprove = async (id, ok, reloadFn) => {
  const snap = await db.collection('participations').doc(id).get();
  const p = snap.data() || {};
  await db.collection('participations').doc(id).update({
    status: ok?'approved':'rejected',
    approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    approvedBy: adminData.name||adminData.studentId,
  });
  writeLog(
    ok ? '✅ อนุมัติเข้าร่วม' : '❌ ปฏิเสธเข้าร่วม',
    `${p.name||p.studentId||'?'} → ${p.eventTitle||'?'} (${p.hours||0} ชม.)`
  );
  toast(ok?'อนุมัติแล้ว ✅':'ปฏิเสธแล้ว');
  if (reloadFn) reloadFn(); else if (activeTab==='events') tabEvents(); else tabOverview();
};

window.viewParts = async (eventId, title) => {
  document.getElementById('eventDetailTitle').textContent = `👥 ${title}`;
  set('eventDetailContent', spin());
  openModal('eventDetailModal');
  try {
    const snap = await db.collection('participations').where('eventId','==',eventId).get();
    const parts = snap.docs.map(d=>({id:d.id,...d.data()}));
    const a=parts.filter(p=>p.status==='approved'), pe=parts.filter(p=>p.status==='pending'), r=parts.filter(p=>p.status==='rejected');
    set('eventDetailContent', `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <span class="badge badge-success">✅ อนุมัติ ${a.length}</span>
        <span class="badge badge-warning">⏳ รอ ${pe.length}</span>
        <span class="badge badge-danger">✗ ปฏิเสธ ${r.length}</span>
      </div>
      ${parts.length ? parts.map(p=>`
        <div class="list-item">
          <div class="list-avatar" style="font-size:.75rem">${(p.name||'?')[0]}</div>
          <div class="list-info">
            <div class="list-name">${xe(p.name||p.studentId)}</div>
            <div class="list-sub">${xe(p.program||'—')} · ${xe(p.studentId||'')}</div>
            ${p.positionName?`<div class="list-sub" style="color:var(--c-indigo-500);font-weight:600;">📌 ${xe(p.positionName)}</div>`:''}
          </div>
          <div class="flex flex-col items-center gap-4">
            <span class="badge ${p.status==='approved'?'badge-success':p.status==='pending'?'badge-warning':'badge-danger'}">${p.status==='approved'?'อนุมัติ':p.status==='pending'?'รอ':'ปฏิเสธ'}</span>
            ${p.status==='pending'?`<div class="flex gap-4">
              <button class="btn btn-xs btn-success" onclick="doApprove('${p.id}',true,()=>viewParts('${eventId}','${xe(title)}'))">✓</button>
              <button class="btn btn-xs btn-danger"  onclick="doApprove('${p.id}',false,()=>viewParts('${eventId}','${xe(title)}'))">✗</button>
            </div>`:''}
          </div>
        </div>`).join('') : empty('👥','ยังไม่มีผู้สมัคร')}
    `);
  } catch(e){ set('eventDetailContent','<p class="text-muted text-sm">'+xe(e.message)+'</p>'); }
};
document.getElementById('closeEventDetail').onclick = () => closeModal('eventDetailModal');

// Export participants of an event as CSV
window.exportEventCSV = async (eventId, title) => {
  try {
    const snap = await db.collection('participations').where('eventId','==',eventId).get();
    const parts = snap.docs.map(d=>d.data()).sort((a,b)=>(a.name||'').localeCompare(b.name||'','th'));
    const header = ['ลำดับ','ชื่อ-นามสกุล','รหัสนักศึกษา','หลักสูตร','ตำแหน่งงาน','ชั่วโมง','สถานะ','อนุมัติโดย'];
    const statusTh = s => s==='approved'?'อนุมัติ':s==='pending'?'รออนุมัติ':'ปฏิเสธ';
    const rows = parts.map((p,i) => [
      i+1, p.name||'', p.studentId||'', p.program||'', p.positionName||'—',
      (p.hours||0).toFixed(1), statusTh(p.status||''), p.approvedBy||''
    ]);
    const csv = [header,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
    Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`ผู้เข้าร่วม_${title.replace(/\s/g,'_')}.csv`}).click();
    writeLog('⬇️ Export รายชื่อ', `กิจกรรม: ${title} (${parts.length} คน)`);
  } catch(e){ toast('Export ไม่ได้: '+e.message); }
};

// ── BOARD ─────────────────────────────────────────────────────────────────────
async function tabBoard() {
  let banners=[], news=[];
  if (!DEMO && db) {
    try {
      const [bs,ns] = await Promise.all([db.collection('banners').get(), db.collection('news').get()]);
      banners = bs.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      news    = ns.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    } catch(e){ showErr(e); }
  }

  set('mainContent', `<div class="fade-in">
    <div class="section-header">
      <span class="section-title">🖼️ ป้ายประกาศ</span>
      <button class="btn btn-primary btn-sm" onclick="openBannerModal()">+ เพิ่มป้าย</button>
    </div>
    ${banners.length ? banners.map(b=>`
      <div class="banner-card">
        ${b.imageUrl?`<img src="${xe(b.imageUrl)}" class="banner-img" onerror="this.remove()">`:''}
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-weight:800">${xe(b.title||'—')}</div>
            ${b.description?`<div style="font-size:.82rem;color:var(--text-2);margin-top:3px">${xe(b.description)}</div>`:''}
            <div style="font-size:.72rem;color:var(--text-3);margin-top:3px">โดย ${xe(b.createdBy||'—')}</div>
          </div>
          <span class="badge ${b.active!==false?'badge-success':'badge-danger'}">${b.active!==false?'แสดง':'ซ่อน'}</span>
        </div>
        <div class="flex gap-8 mt-12" style="flex-wrap:wrap">
          <button class="btn btn-xs btn-ghost" onclick="openEditBanner('${b.id}')">✏️ แก้ไข</button>
          <button class="btn btn-xs btn-ghost" onclick="toggleBanner('${b.id}',${b.active!==false})">${b.active!==false?'🙈 ซ่อน':'👁 แสดง'}</button>
          <button class="btn btn-xs btn-danger" onclick="delBanner('${b.id}')">ลบ</button>
        </div>
      </div>`).join('') : empty('🖼️','ยังไม่มีป้ายประกาศ')}

    <div class="section-header mt-12">
      <span class="section-title">📢 ข่าวสาร/ประกาศ</span>
      <button class="btn btn-primary btn-sm" onclick="openNewsModal()">+ ลงประกาศ</button>
    </div>
    ${news.length ? news.map(n=>newsCard(n,n.id)).join('') : empty('📢','ยังไม่มีประกาศ')}
  </div>`);
}

window.openBannerModal = () => {
  clearForm('bannerForm');
  document.getElementById('bId').value = '';
  document.getElementById('bannerModalTitle').textContent = '🖼️ เพิ่มป้ายประกาศ';
  document.getElementById('bActive').checked = true;
  document.getElementById('bImagePreview').innerHTML = '';
  openModal('bannerModal');
};
window.openEditBanner = async id => {
  const b = (await db.collection('banners').doc(id).get()).data();
  document.getElementById('bId').value    = id;
  document.getElementById('bannerModalTitle').textContent = '✏️ แก้ไขป้าย';
  document.getElementById('bTitle').value    = b.title||'';
  document.getElementById('bImageUrl').value = b.imageUrl||'';
  document.getElementById('bDesc').value     = b.description||'';
  document.getElementById('bActive').checked = b.active!==false;
  document.getElementById('bImagePreview').innerHTML = b.imageUrl?`<img src="${xe(b.imageUrl)}" style="width:100%;border-radius:8px;max-height:120px;object-fit:cover">` :'';
  openModal('bannerModal');
};
document.getElementById('cancelBanner').onclick = () => closeModal('bannerModal');
document.getElementById('bannerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('bannerSubmit'); btn.disabled=true;
  const id  = document.getElementById('bId').value;
  const data = { title: document.getElementById('bTitle').value.trim(), imageUrl: document.getElementById('bImageUrl').value.trim(), description: document.getElementById('bDesc').value.trim(), active: document.getElementById('bActive').checked, createdBy: adminData.name||adminData.studentId };
  try {
    if (id) await db.collection('banners').doc(id).update(data);
    else await db.collection('banners').add({...data, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
    closeModal('bannerModal'); toast('บันทึกสำเร็จ ✅'); tabBoard();
  } catch(ex){ toast('เกิดข้อผิดพลาด: '+ex.message); }
  btn.disabled=false;
});
window.toggleBanner = async (id,cur) => { await db.collection('banners').doc(id).update({active:!cur}); toast(!cur?'แสดงแล้ว':'ซ่อนแล้ว'); tabBoard(); };
window.delBanner = async id => { if(!confirm('ลบป้ายนี้?'))return; await db.collection('banners').doc(id).delete(); toast('ลบแล้ว'); tabBoard(); };

// News
window.openNewsModal = () => { clearForm('newsForm'); openModal('newsModal'); };
document.getElementById('cancelNews').onclick = () => closeModal('newsModal');
document.getElementById('newsForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('newsSubmit'); btn.disabled=true;
  try {
    await db.collection('news').add({ title: document.getElementById('nTitle').value.trim(), content: document.getElementById('nContent').value.trim(), urgent: document.getElementById('nUrgent').checked, postedBy: adminData.name||adminData.studentId, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    closeModal('newsModal'); toast('ลงประกาศสำเร็จ ✅'); tabBoard();
  } catch(ex){ toast('เกิดข้อผิดพลาด: '+ex.message); }
  btn.disabled=false;
});
window.delNews = async id => { if(!confirm('ลบประกาศนี้?'))return; await db.collection('news').doc(id).delete(); toast('ลบแล้ว'); tabBoard(); };

function newsCard(n, id) {
  const dt = n.createdAt?.toDate?n.createdAt.toDate():new Date();
  return `<div class="news-card"><div class="news-accent-bar ${n.urgent?'urgent':''}"></div><div class="news-body">
    <div class="news-tag ${n.urgent?'urgent':''}">${n.urgent?'⚠️ ด่วน':'📢 ประกาศ'}</div>
    <div class="news-title">${xe(n.title)}</div>
    <div class="news-content">${xe(n.content||'').replace(/\n/g,'<br>')}</div>
    <div class="news-meta"><span>${dt.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})}</span>${id?`<button class="btn btn-xs btn-danger" onclick="delNews('${id}')">ลบ</button>`:''}</div>
  </div></div>`;
}

// ── ACTIVITY LOG ─────────────────────────────────────────────────────────────
async function writeLog(action, detail) {
  if (DEMO || !db) return;
  try {
    await db.collection('activityLogs').add({
      action, detail,
      by: adminData?.name || adminData?.studentId || 'admin',
      at: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch(_) {}
}

async function tabLogs() {
  let logs = [];
  if (!DEMO && db) {
    try {
      const snap = await db.collection('activityLogs').get();
      logs = snap.docs.map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>(b.at?.seconds||0)-(a.at?.seconds||0));
    } catch(e) { showErr(e); return; }
  }

  const actionColor = a => {
    if (a.includes('เพิ่ม') || a.includes('สร้าง') || a.includes('อนุมัติ')) return 'var(--c-emerald)';
    if (a.includes('ลบ') || a.includes('ปฏิเสธ')) return 'var(--c-rose)';
    if (a.includes('แก้ไข') || a.includes('ปิด') || a.includes('เปิด')) return 'var(--c-amber)';
    return 'var(--c-indigo-500)';
  };

  set('mainContent', `<div class="fade-in">
    <div class="section-header">
      <span class="section-title">📝 Log การใช้งาน (${logs.length} รายการ)</span>
      <div class="flex gap-4">
        ${logs.length ? `<button class="btn btn-xs btn-ghost" onclick="exportLogsCSV()">⬇️ Export</button>` : ''}
        ${logs.length ? `<button class="btn btn-xs btn-danger" onclick="clearLogs()">🗑️ เคลียร์</button>` : ''}
      </div>
    </div>
    ${logs.length === 0
      ? empty('📝','ยังไม่มี Log','Log จะเพิ่มอัตโนมัติเมื่อมีการเพิ่ม/ลบสมาชิก กิจกรรม และการอนุมัติ')
      : `<div class="card" style="padding:8px 12px">
          ${logs.map(l => {
            const dt = l.at?.toDate ? l.at.toDate() : new Date();
            const dateStr = dt.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
            const timeStr = dt.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
            return `<div class="list-item">
              <div style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;background:rgba(0,0,0,.05);">
                ${l.action?.split(' ')[0]||'📝'}
              </div>
              <div class="list-info">
                <div class="list-name" style="color:${actionColor(l.action||'')};">${xe(l.action||'—')}</div>
                <div class="list-sub">${xe(l.detail||'')}</div>
                <div class="list-sub" style="font-size:.72rem;">โดย ${xe(l.by||'—')} · ${dateStr} ${timeStr}</div>
              </div>
            </div>`;
          }).join('')}
        </div>`}
    <div style="text-align:center;color:var(--text-3);font-size:.78rem;margin-top:12px;">
      Log ถูกบันทึกอัตโนมัติทุกครั้งที่มีการเปลี่ยนแปลงข้อมูลในระบบ
    </div>
  </div>`);

  window._logsData = logs;
}

window.clearLogs = async () => {
  if (!confirm(`ลบ Log ทั้งหมด ${(window._logsData||[]).length} รายการ?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
  const logs = window._logsData || [];
  const batch = db.batch();
  logs.forEach(l => { if (l.id) batch.delete(db.collection('activityLogs').doc(l.id)); });
  await batch.commit();
  window._logsData = [];
  toast('เคลียร์ Log เรียบร้อย 🗑️');
  tabLogs();
};

window.exportLogsCSV = () => {
  const logs = window._logsData || [];
  const header = ['ลำดับ','การกระทำ','รายละเอียด','ผู้ดำเนินการ','วันที่','เวลา'];
  const rows = logs.map((l,i) => {
    const dt = l.at?.toDate ? l.at.toDate() : new Date();
    return [
      i+1, l.action||'', l.detail||'', l.by||'',
      dt.toLocaleDateString('th-TH'),
      dt.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}),
    ];
  });
  const csv = [header,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
  Object.assign(document.createElement('a'),{
    href: URL.createObjectURL(blob),
    download: `ActivityLog_${new Date().toLocaleDateString('th-TH').replace(/\//g,'-')}.csv`
  }).click();
};

// ── Admin: compress + upload photo (ImgBB) ───────────────────────────────────
async function adminCompressImage(file, maxW=400, quality=0.75) {
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width*scale; canvas.height = img.height*scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    img.src = url;
  });
}

async function resolveAdminUid() {
  if (adminUser?.uid) return adminUser.uid;
  if (!db || !adminData?.studentId) return null;
  const snap = await db.collection('users').where('studentId', '==', adminData.studentId).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function uploadAdminPhoto(file) {
  toast('กำลังอัปโหลด...');
  try {
    const blob = await adminCompressImage(file);
    const formData = new FormData();
    formData.append('image', blob, 'photo.jpg');
    const res  = await fetch('https://api.imgbb.com/1/upload?key=e5f5862b8658d49b78d8ab07fb0700df', { method:'POST', body:formData });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message||'ImgBB error');
    const url = json.data.url;
    const uid = await resolveAdminUid();
    if (db && uid) await db.collection('users').doc(uid).update({ photoURL: url });
    adminData.photoURL = url;
    // refresh avatar button
    const btn = document.getElementById('adminAvatarBtn');
    if (btn) { btn.textContent=''; btn.style.cssText+=';background-image:url('+url+');background-size:cover;background-position:center;'; }
    toast('อัปโหลดรูปสำเร็จ ✅');
    document.getElementById('adminAvatarBtn')?.click(); // refresh modal
  } catch(e) { toast('อัปโหลดไม่ได้: '+e.message); }
}

const _adminPhotoInput = document.createElement('input');
_adminPhotoInput.type='file'; _adminPhotoInput.accept='image/*'; _adminPhotoInput.style.display='none';
_adminPhotoInput.onchange = e => { if(e.target.files[0]) uploadAdminPhoto(e.target.files[0]); };
document.body.appendChild(_adminPhotoInput);
window.triggerAdminPhotoUpload = () => _adminPhotoInput.click();

// ── Admin Avatar / Profile / Member Card ─────────────────────────────────────
(function initAdminAvatar() {
  const btn = document.getElementById('adminAvatarBtn');
  if (!btn) return;
  function updateAdminAvatar() {
    if (!adminData) return;
    if (adminData.photoURL) {
      btn.textContent = '';
      btn.style.cssText += ';background-image:url('+adminData.photoURL+');background-size:cover;background-position:center;';
    } else {
      btn.textContent = (adminData.name||adminData.studentId||'?')[0].toUpperCase();
      btn.style.backgroundImage = '';
    }
  }

  const _checkAvatar = setInterval(() => {
    if (adminData) { updateAdminAvatar(); clearInterval(_checkAvatar); }
  }, 200);

  btn.onclick = async () => {
    if (!adminData) return;
    let hrs = 0, count = 0;
    if (!DEMO && db && adminUser) {
      try {
        const snap = await db.collection('participations').where('userId','==',adminUser.uid).where('status','==','approved').get();
        count = snap.size;
        snap.forEach(d => { hrs += (d.data().hours||0); });
      } catch(_) {}
    }
    window._adminProfileHours = hrs; window._adminProfileCount = count;
    const rLabel = roleLabel(adminData.role||'admin');
    const photoHtml = adminData.photoURL
      ? `<div style="position:relative;display:inline-block;margin-bottom:10px;">
          <img src="${xe(adminData.photoURL)}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid #f0c040;display:block;">
          <button onclick="triggerAdminPhotoUpload()" style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:#f0c040;border:none;cursor:pointer;font-size:.75rem;display:flex;align-items:center;justify-content:center;">📷</button>
        </div>`
      : `<div style="position:relative;display:inline-block;margin-bottom:10px;">
          <div style="width:72px;height:72px;border-radius:50%;background:rgba(212,160,23,.2);border:2px solid rgba(212,160,23,.4);display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:800;color:#f0c040;">${xe((adminData.name||'?')[0].toUpperCase())}</div>
          <button onclick="triggerAdminPhotoUpload()" style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:#f0c040;border:none;cursor:pointer;font-size:.75rem;display:flex;align-items:center;justify-content:center;">📷</button>
        </div>`;
    const el = document.getElementById('adminProfileContent');
    if (!el) return;
    el.innerHTML = `
      <div style="background:linear-gradient(160deg,#0d1f5c,#142470,#1a2d80);border-radius:12px;padding:20px;text-align:center;margin-bottom:12px;">
        <img src="icons/logo.png" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid rgba(212,160,23,.6);background:rgba(255,255,255,.1);margin-bottom:6px;" onerror="this.style.display='none'">
        <div style="font-size:.6rem;letter-spacing:.08em;color:rgba(255,255,255,.5);margin-bottom:8px;">${xe(typeof FACULTY_NAME!=='undefined'?FACULTY_NAME:'')} · ${xe(typeof UNIVERSITY_NAME!=='undefined'?UNIVERSITY_NAME:'')}</div>
        ${photoHtml}
        <div style="font-size:1.1rem;font-weight:800;color:#fff;">${xe(adminData.name||adminData.studentId)}</div>
        <div style="font-size:.82rem;opacity:.75;color:rgba(255,255,255,.8);margin-top:2px;">รหัส: ${xe(adminData.studentId||'')}</div>
        ${adminData.program?`<div style="font-size:.78rem;opacity:.7;color:rgba(255,255,255,.7);margin-top:2px;">📚 ${xe(adminData.program)}</div>`:''}
        <span style="display:inline-block;margin-top:8px;background:rgba(212,160,23,.2);border:1px solid rgba(212,160,23,.5);color:#f0c040;border-radius:20px;padding:2px 10px;font-size:.75rem;font-weight:800;">${xe(rLabel)}</span>
        <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:6px;font-size:.78rem;color:rgba(255,255,255,.75);">
          <span>📞 ${xe(adminData.phone||'—')}</span>
          <span>💬 ${xe(adminData.lineId||'—')}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <button class="btn btn-ghost w-full" onclick="document.getElementById('adminProfileModal').classList.remove('open');showAdminMemberCard()">🪪 บัตรสมาชิก</button>
        <button class="btn btn-ghost w-full" onclick="openAdminEditContact()">✏️ แก้ไขข้อมูล</button>
      </div>`;
    openModal('adminProfileModal');
  };
})();

window.openAdminEditContact = () => {
  if (!document.getElementById('adminEditContactModal')) {
    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'adminEditContactModal';
    div.innerHTML = `<div class="modal">
      <div class="modal-handle"></div>
      <h2 class="modal-title">✏️ แก้ไขข้อมูลติดต่อ</h2>
      <div class="form-group">
        <label class="form-label">เบอร์โทรศัพท์</label>
        <input class="form-input" type="tel" id="acPhone" inputmode="tel" placeholder="08x-xxx-xxxx">
      </div>
      <div class="form-group">
        <label class="form-label">Line ID</label>
        <input class="form-input" type="text" id="acLineId" placeholder="@lineId หรือ lineId">
      </div>
      <div id="acError" class="login-error" style="display:none;"></div>
      <div class="flex gap-8">
        <button class="btn btn-ghost w-full" onclick="closeModal('adminEditContactModal')">ยกเลิก</button>
        <button class="btn btn-primary w-full" id="acSaveBtn" onclick="saveAdminContact()">💾 บันทึก</button>
      </div>
    </div>`;
    document.body.appendChild(div);
  }
  document.getElementById('acPhone').value  = adminData.phone  || '';
  document.getElementById('acLineId').value = adminData.lineId || '';
  document.getElementById('acError').style.display = 'none';
  closeModal('adminProfileModal');
  openModal('adminEditContactModal');
};

window.saveAdminContact = async () => {
  if (DEMO || !db || !adminUser) { toast('กรุณา login ผ่าน Firebase'); return; }
  const phone  = document.getElementById('acPhone').value.trim();
  const lineId = document.getElementById('acLineId').value.trim();
  const btn    = document.getElementById('acSaveBtn');
  const errEl  = document.getElementById('acError');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    await db.collection('users').doc(adminUser.uid).update({ phone, lineId });
    adminData.phone  = phone;
    adminData.lineId = lineId;
    writeLog('✏️ แก้ไขข้อมูลติดต่อ', `${adminData.name||adminData.studentId}: 📞${phone||'—'} 💬${lineId||'—'}`);
    closeModal('adminEditContactModal');
    toast('บันทึกสำเร็จ ✅');
    document.getElementById('adminAvatarBtn')?.click();
  } catch(e) { errEl.textContent = e.message; errEl.style.display = ''; }
  btn.disabled = false; btn.textContent = '💾 บันทึก';
};

window.showAdminMemberCard = () => {
  if (!adminData) return;
  const hrs   = (window._adminProfileHours||0).toFixed(1);
  const count = window._adminProfileCount||0;
  const rLabel = roleLabel(adminData.role||'admin');
  const sid    = adminData.studentId||'';
  const prog   = adminData.program||'';
  const shortProg = prog.length > 22 ? prog.slice(0,21)+'…' : prog;
  const year   = new Date().getFullYear()+543;
  const barcode = sid.split('').map((c,i)=>{
    const w=i%3===0?3:1, h=(parseInt(c)||1)*2+10;
    return `<div style="width:${w}px;height:${h}px;background:#f0c040;display:inline-block;margin:0 .5px;vertical-align:bottom;"></div>`;
  }).join('');
  const photoBox = adminData.photoURL
    ? `<div style="position:relative;width:82px;margin-bottom:6px;">
        <img src="${xe(adminData.photoURL)}" style="width:82px;height:100px;object-fit:cover;border-radius:6px;border:2px solid #c8960c;display:block;">
        <button onclick="triggerAdminPhotoUpload()" style="position:absolute;bottom:4px;right:4px;width:22px;height:22px;border-radius:50%;background:#c8960c;border:none;cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;">📷</button>
      </div>`
    : `<div style="position:relative;width:82px;margin-bottom:6px;">
        <div style="width:82px;height:100px;background:linear-gradient(160deg,#0d1f5c,#1a2d80);border-radius:6px;border:2px solid #c8960c;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:2.2rem;font-weight:800;color:#f0c040;">${xe((adminData.name||'?')[0].toUpperCase())}</span>
        </div>
        <button onclick="triggerAdminPhotoUpload()" style="position:absolute;bottom:4px;right:4px;width:22px;height:22px;border-radius:50%;background:#c8960c;border:none;cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;">📷</button>
      </div>`;
  const el = document.getElementById('adminMemberCardContent');
  if (!el) return;
  el.innerHTML = `
    <div style="border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.4);max-width:360px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0d1f5c,#1a2d80);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="icons/logo.png" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid #c8960c;background:rgba(255,255,255,.1);flex-shrink:0;" onerror="this.style.display='none'">
          <div>
            <div style="color:#f0c040;font-size:.6rem;font-weight:800;letter-spacing:.06em;line-height:1.4;">${xe(typeof FACULTY_NAME!=='undefined'?FACULTY_NAME:'คณะมนุษยศาสตร์และสังคมศาสตร์')}</div>
            <div style="color:rgba(255,255,255,.7);font-size:.55rem;letter-spacing:.04em;">${xe(typeof UNIVERSITY_NAME!=='undefined'?UNIVERSITY_NAME:'มหาวิทยาลัยสวนดุสิต')}</div>
          </div>
        </div>
        <span style="background:rgba(212,160,23,.2);border:1px solid #c8960c;border-radius:20px;padding:2px 8px;font-size:.6rem;font-weight:800;color:#f0c040;">${xe(rLabel)}</span>
      </div>
      <div style="height:4px;background:linear-gradient(90deg,#6b4c00,#c8960c,#f0c040,#c8960c,#6b4c00);"></div>
      <div style="background:#f2ece0;padding:14px;display:flex;gap:12px;">
        <div style="flex-shrink:0;width:82px;">${photoBox}<div style="font-size:.52rem;color:#888;text-align:center;">PHOTO</div></div>
        <div style="flex:1;min-width:0;">
          <div style="margin-bottom:8px;"><div style="font-size:.52rem;color:#c8960c;letter-spacing:.1em;font-weight:700;">NAME</div><div style="font-size:.88rem;font-weight:800;color:#0d1f5c;">${xe(adminData.name||sid)}</div></div>
          <div style="margin-bottom:7px;"><div style="font-size:.52rem;color:#c8960c;letter-spacing:.1em;font-weight:700;">STUDENT ID</div><div style="font-size:.78rem;font-weight:700;color:#222;font-family:monospace;">${xe(sid)}</div></div>
          ${shortProg?`<div style="margin-bottom:7px;"><div style="font-size:.52rem;color:#c8960c;letter-spacing:.1em;font-weight:700;">PROGRAM</div><div style="font-size:.68rem;font-weight:600;color:#444;line-height:1.3;">${xe(shortProg)}</div></div>`:''}
          ${adminData.position?`<div style="margin-bottom:7px;"><div style="font-size:.52rem;color:#c8960c;letter-spacing:.1em;font-weight:700;">POSITION</div><div style="font-size:.72rem;font-weight:800;color:#0d1f5c;">${xe(adminData.position)}</div></div>`:''}
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <div><div style="font-size:.52rem;color:#c8960c;letter-spacing:.08em;font-weight:700;">PHONE</div><div style="font-size:.65rem;color:#444;">${xe(adminData.phone||'—')}</div></div>
            <div><div style="font-size:.52rem;color:#c8960c;letter-spacing:.08em;font-weight:700;">LINE</div><div style="font-size:.65rem;color:#444;">${xe(adminData.lineId||'—')}</div></div>
          </div>
        </div>
      </div>
      <div style="background:linear-gradient(135deg,#0d1f5c,#0a1845);padding:8px 14px;display:flex;justify-content:space-between;align-items:center;">
        <div><div style="font-size:.58rem;color:rgba(255,255,255,.5);">ID: ${xe(sid)}</div><div style="font-size:.6rem;color:#f0c040;font-weight:700;margin-top:1px;">⏱ ${hrs} HRS · ปี ${year}</div></div>
        <div style="display:flex;align-items:flex-end;">${barcode}</div>
      </div>
    </div>`;
  openModal('adminMemberCardModal');
};

// ── profileRequests — Approve / Reject ────────────────────────────────────────
async function tabProfileRequests() {
  if (DEMO || !db) return '';
  try {
    const snap = await db.collection('profileRequests').where('status','==','pending').get();
    const reqs = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (!reqs.length) return '';
    return `
      <div class="section-header mt-4"><span class="section-title">✏️ คำขอแก้ไขโปรไฟล์ (${reqs.length})</span></div>
      <div class="card" style="padding:8px 12px;margin-bottom:14px;">
        ${reqs.map(r=>`
          <div class="list-item">
            <div class="list-avatar" style="font-size:.75rem">${(r.name||'?')[0]}</div>
            <div class="list-info">
              <div class="list-name">${xe(r.name||r.studentId||'?')}</div>
              <div class="list-sub">
                ${r.phone!==undefined?`📞 ${xe(r.phone||'—')}`:''}
                ${r.lineId!==undefined?`&nbsp;💬 ${xe(r.lineId||'—')}`:''}
              </div>
            </div>
            <div class="flex gap-4">
              <button class="btn btn-xs btn-success" onclick="approveProfileReq('${r.id}',true)">✓</button>
              <button class="btn btn-xs btn-danger" onclick="approveProfileReq('${r.id}',false)">✗</button>
            </div>
          </div>`).join('')}
      </div>`;
  } catch(_) { return ''; }
}

window.approveProfileReq = async (id, ok) => {
  try {
    const snap = await db.collection('profileRequests').doc(id).get();
    const r = snap.data()||{};
    if (ok) {
      const update = {};
      if (r.phone  !== undefined) update.phone  = r.phone;
      if (r.lineId !== undefined) update.lineId = r.lineId;
      if (Object.keys(update).length && r.userId) {
        await db.collection('users').doc(r.userId).update(update);
      }
    }
    await db.collection('profileRequests').doc(id).update({
      status: ok ? 'approved' : 'rejected',
      approvedBy: adminData.name||adminData.studentId,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    writeLog(ok?'✅ อนุมัติแก้ไขโปรไฟล์':'❌ ปฏิเสธแก้ไขโปรไฟล์', r.name||r.studentId||'?');
    toast(ok?'อนุมัติแล้ว ✅':'ปฏิเสธแล้ว');
    if (activeTab==='members') tabMembers(); else tabOverview();
  } catch(e){ toast('เกิดข้อผิดพลาด: '+e.message); }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function xe(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function set(id,h){ const el=document.getElementById(id); if(el) el.innerHTML=h; }
function spin(){ return '<div class="spinner-wrap"><div class="spinner"></div></div>'; }
function empty(icon,title,sub=''){ return `<div class="empty-state"><span class="empty-icon">${icon}</span><p class="empty-title">${title}</p>${sub?`<p class="empty-sub">${sub}</p>`:''}</div>`; }
function stat(cls,icon,val,lbl){ return `<div class="stat-card ${cls}"><span class="stat-icon">${icon}</span><div class="stat-value">${val}</div><div class="stat-label">${lbl}</div></div>`; }
function qb(icon,lbl,fn){ return `<button class="quick-btn" onclick="${fn}"><div class="icon-wrap">${icon}</div><span>${lbl}</span></button>`; }
function toast(msg,ms=3000){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),ms); }
function showErr(e){ set('mainContent',`<div class="empty-state"><span class="empty-icon">⚠️</span><p class="empty-title">เกิดข้อผิดพลาด</p><p class="empty-sub">${xe(e.message)}</p></div>`); }
function openModal(id){ document.getElementById(id)?.classList.add('open'); }
function closeModal(id){ document.getElementById(id)?.classList.remove('open'); }
function clearForm(id){ document.getElementById(id)?.querySelectorAll('input,textarea,select').forEach(el=>{ if(el.type==='checkbox') el.checked=true; else if(el.tagName!=='SELECT') el.value=''; }); }
