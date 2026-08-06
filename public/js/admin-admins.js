(function(){
  // Simple admin page script - expects admin token stored in localStorage.adminToken
  const token = localStorage.getItem('adminToken') || '';
  if (!token) {
    document.body.innerHTML = '<div class="container mt-4"> <h3>Not authenticated</h3><p>Please log in to the admin dashboard first.</p></div>';
    return;
  }

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
    
    // Extract Telegram Chat ID (now stored directly in tgid)
    const tgTd = document.createElement('td'); tgTd.textContent = r.tgid || '';
    const emailTd = document.createElement('td'); emailTd.textContent = r.email || '';
    const statusTd = document.createElement('td'); statusTd.innerHTML = `<span class="badge bg-${(String(r.status||'').toLowerCase()==='approved'?'success':'secondary')}">${r.status||'Not Approved'}</span>`;
    const actionsTd = document.createElement('td');
    const editBtn = el('button','btn btn-sm btn-pink me-1','Edit');
    editBtn.onclick = () => openEditModal(r);
    actionsTd.appendChild(editBtn);

    tr.appendChild(nameTd); 
    tr.appendChild(tgTd); 
    tr.appendChild(emailTd); 
    tr.appendChild(statusTd); 
    tr.appendChild(actionsTd);
    return tr;
  }

  async function load(){
    try{
      adminsTableBody.innerHTML = '';
      const q = (searchInput && searchInput.value || '').trim().toLowerCase();
      const seen = new Set();

      // Load email admins
      const adm = await api('/admins');
      (adm.admins||[]).forEach(a=>{
        const key = a.id || (a.email ? `email:${a.email}` : null);
        if (!key || seen.has(key)) return;
        const hay = `${a.name||''} ${a.tgid||''} ${a.email||''}`.toLowerCase();
        if (q && !hay.includes(q)) return;
        seen.add(key);
        adminsTableBody.appendChild(rowForAdmin(a));
      });

    }catch(e){
      console.error(e); alertError('Failed to load admin data: '+(e.message||e));
    }
  }

  // Edit modal handling
  const adminModalEl = document.getElementById('adminEditModal');
  let adminModal = null;
  try { adminModal = new bootstrap.Modal(adminModalEl); } catch (e) { adminModal = null; }
  const modalDeleteBtn = document.getElementById('modalDeleteBtn');
  const modalSaveBtn = document.getElementById('modalSaveBtn');

  function openEditModal(r){
    if (!r) return;
    const id = r.id || null;
    document.getElementById('modalAdminId').value = id || '';
    document.getElementById('modalName').value = (r && r.name) || '';
    
    // Fill Telegram input directly from tgid field
    document.getElementById('modalTelegramChatId').value = (r && r.tgid) || '';

    document.getElementById('modalEmail').value = (r && r.email) || '';
    document.getElementById('modalStatus').value = (r && r.status) || 'Not Approved';
    document.getElementById('modalPassword').value = '';
    
    const titleEl = document.getElementById('adminEditTitle');
    if (titleEl) titleEl.textContent = 'Edit Admin';
    if (modalSaveBtn) modalSaveBtn.textContent = 'Save Changes';

    // Configure Delete button
    if (modalDeleteBtn) {
      modalDeleteBtn.onclick = null;
      if (id) {
        modalDeleteBtn.classList.remove('d-none');
        modalDeleteBtn.onclick = async function(){
          if (!confirm('Delete this admin account? This cannot be undone.')) return;
          try {
            await api(`/admins/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (adminModal) adminModal.hide();
            load();
          } catch (err) { alertError('Delete failed: '+(err.message||err)); }
        };
      } else {
        modalDeleteBtn.classList.add('d-none');
      }
    }

    if (adminModal) adminModal.show();
  }

  // Save from modal
  document.getElementById('modalSaveBtn').addEventListener('click', async ()=>{
    const id = document.getElementById('modalAdminId').value || null;
    const name = document.getElementById('modalName').value.trim();
    const rawTg = document.getElementById('modalTelegramChatId').value.trim();
    const email = document.getElementById('modalEmail').value.trim() || null;
    const status = document.getElementById('modalStatus').value || 'Not Approved';
    const password = document.getElementById('modalPassword').value || null;

    // Telegram chat ID maps to database column tgid directly
    const tgid = rawTg || null;

    try{
      if (!id) {
        alertInfo('Creating new admins from the UI is disabled. Please create accounts via the server or database.');
        return;
      } else {
        await api(`/admins/${encodeURIComponent(id)}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, tgid, email, status }) });
        if (password) {
          await api(`/admins/${encodeURIComponent(id)}/password`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password }) });
        }
      }
      if (adminModal) adminModal.hide();
      load();
    }catch(e){ alertError('Save failed: '+(e.message||e)); }
  });

  // Refresh/search handlers
  if (refreshBtn) refreshBtn.addEventListener('click', load);
  if (searchInput) searchInput.addEventListener('input', ()=>{ load(); });

  // Wire logout
  const logoutBtn = document.getElementById('logoutButton');
  if (logoutBtn) logoutBtn.addEventListener('click', ()=>{ localStorage.removeItem('adminToken'); window.location.href = '/customer-login.html'; });

  // initial load
  load();
})();
