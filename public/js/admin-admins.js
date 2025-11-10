(async function(){
  // Simple admin page script - expects admin token stored in localStorage.adminToken
  const token = localStorage.getItem('adminToken') || '';
  if (!token) {
    document.body.innerHTML = '<div class="container mt-4"> <h3>Not authenticated</h3><p>Please log in to the admin dashboard first.</p></div>';
    return;
  }

  const pendingList = document.getElementById('pendingList');
  const approvedList = document.getElementById('approvedList');
  const adminsTableBody = document.getElementById('adminsTableBody');
  const searchInput = document.getElementById('searchInput');
  const refreshBtn = document.getElementById('refreshBtn');

  async function api(path, opts={}){
    opts.headers = opts.headers || {};
    opts.headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(`/api/admin${path}`, opts);
    if (!resp.ok) {
      const txt = await resp.text().catch(()=>null);
      throw new Error(`API ${path} failed: ${resp.status} ${txt}`);
    }
    return resp.json();
  }

  function el(tag, cls, text){ const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  function rowForAdmin(r){
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.innerHTML = `<strong>${r.name||'(no name)'}</strong>`;
    const psidTd = document.createElement('td'); psidTd.textContent = r.psid || '';
    const emailTd = document.createElement('td'); emailTd.textContent = r.email || '';
    const statusTd = document.createElement('td'); statusTd.innerHTML = `<span class="badge bg-${(String(r.status||'').toLowerCase()==='approved'?'success':'secondary')}">${r.status||'Not Approved'}</span>`;
  const actionsTd = document.createElement('td');
    const editBtn = el('button','btn btn-sm btn-pink me-1','Edit');
  editBtn.onclick = ()=> openEditModal(r);
  actionsTd.appendChild(editBtn);
  tr.appendChild(nameTd); tr.appendChild(psidTd); tr.appendChild(emailTd); tr.appendChild(statusTd); tr.appendChild(actionsTd);
    return tr;
  }

  async function load(){
    try{
      const data = await api('/admins/messenger');
      // render unified admins table for messenger-capable rows
      adminsTableBody.innerHTML = '';
      const all = ((data.pending||[]).concat(data.approved||[]));
      const q = (searchInput && searchInput.value || '').trim().toLowerCase();
      // avoid duplicates by id (or psid)
      const seen = new Set();
      (all || []).forEach(r=>{
        const key = r.id || r.psid || (r.email ? `email:${r.email}` : null);
        if (!key || seen.has(key)) return;
        const hay = `${r.name||''} ${r.psid||''} ${r.email||''}`.toLowerCase();
        if (q && !hay.includes(q)) return;
        seen.add(key);
        adminsTableBody.appendChild(rowForAdmin(r));
      });

      // load email admins and append those not yet shown
      const adm = await api('/admins');
      (adm.admins||[]).forEach(a=>{
        const key = a.id || a.psid || (a.email ? `email:${a.email}` : null);
        if (!key || seen.has(key)) return;
        const hay = `${a.name||''} ${a.psid||''} ${a.email||''}`.toLowerCase();
        if (q && !hay.includes(q)) return;
        seen.add(key);
        adminsTableBody.appendChild(rowForAdmin(a));
      });

    }catch(e){
      console.error(e); alert('Failed to load admin data: '+(e.message||e));
    }
  }

  // Manual messenger admin form
  // modal handling: open modal to edit/create admin
  const adminModalEl = document.getElementById('adminEditModal');
  let adminModal = null;
  try { adminModal = new bootstrap.Modal(adminModalEl); } catch (e) { adminModal = null; }
  const modalDeleteBtn = document.getElementById('modalDeleteBtn');
  const modalSaveBtn = document.getElementById('modalSaveBtn');

  function openEditModal(r){
    // populate modal fields; requires an existing record (edit-only UX)
    if (!r) return; // disallow create-from-UI
    const id = r.id || null;
    document.getElementById('modalAdminId').value = id || '';
    document.getElementById('modalName').value = (r && r.name) || '';
    document.getElementById('modalPsid').value = (r && r.psid) || '';
    document.getElementById('modalEmail').value = (r && r.email) || '';
    document.getElementById('modalStatus').value = (r && r.status) || 'Not Approved';
    document.getElementById('modalPassword').value = '';
    // update modal title and save button text
    const titleEl = document.getElementById('adminEditTitle');
    if (titleEl) titleEl.textContent = 'Edit Admin';
    if (modalSaveBtn) modalSaveBtn.textContent = 'Save Changes';

    // Configure Delete button: visible only when editing an existing record or when a PSID exists
    if (modalDeleteBtn) {
      // clear previous handler
      modalDeleteBtn.onclick = null;
      if (id) {
        modalDeleteBtn.classList.remove('d-none');
        modalDeleteBtn.onclick = async function(){
          if (!confirm('Delete this admin account? This cannot be undone.')) return;
          try {
            await api(`/admins/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (adminModal) adminModal.hide();
            load();
          } catch (err) { alert('Delete failed: '+(err.message||err)); }
        };
      } else if ((r && r.psid)) {
        // no id but has psid (messenger-only record)
        modalDeleteBtn.classList.remove('d-none');
        modalDeleteBtn.onclick = async function(){
          if (!confirm('Remove this messenger subscription?')) return;
          try {
            await api(`/admins/messenger/${encodeURIComponent(r.psid)}`, { method: 'DELETE' });
            if (adminModal) adminModal.hide();
            load();
          } catch (err) { alert('Delete failed: '+(err.message||err)); }
        };
      } else {
        modalDeleteBtn.classList.add('d-none');
      }
    }

    if (adminModal) adminModal.show();
  }

  // New admin creation via UI is disabled (use server or DB tools). Ensure no New Admin wiring remains.

  // Save from modal
  document.getElementById('modalSaveBtn').addEventListener('click', async ()=>{
    const id = document.getElementById('modalAdminId').value || null;
    const name = document.getElementById('modalName').value.trim();
    const psid = document.getElementById('modalPsid').value.trim() || null;
    const email = document.getElementById('modalEmail').value.trim() || null;
    const status = document.getElementById('modalStatus').value || 'Not Approved';
    const password = document.getElementById('modalPassword').value || null;
    try{
      if (!id) {
        alert('Creating new admins from the UI is disabled. Please create accounts via the server or database.');
        return;
      } else {
        // update basic fields
        await api(`/admins/${encodeURIComponent(id)}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, psid, email, status }) });
        // update password if provided
        if (password) {
          await api(`/admins/${encodeURIComponent(id)}/password`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password }) });
        }
      }
      if (adminModal) adminModal.hide();
      load();
    }catch(e){ alert('Save failed: '+(e.message||e)); }
  });

  // Refresh/search handlers
  if (refreshBtn) refreshBtn.addEventListener('click', load);
  if (searchInput) searchInput.addEventListener('input', ()=>{ load(); });

  // Wire logout (clear admin token and redirect to login)
  const logoutBtn = document.getElementById('logoutButton');
  if (logoutBtn) logoutBtn.addEventListener('click', ()=>{ localStorage.removeItem('adminToken'); window.location.href = '/admin/login.html'; });

  // initial load
  load();
})();
