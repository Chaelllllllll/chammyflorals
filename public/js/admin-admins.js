(async function(){
  // Simple admin page script - expects admin token stored in localStorage.adminToken
  const token = localStorage.getItem('adminToken') || '';
  if (!token) {
    document.body.innerHTML = '<div class="container mt-4"> <h3>Not authenticated</h3><p>Please log in to the admin dashboard first.</p></div>';
    return;
  }

  const pendingList = document.getElementById('pendingList');
  const approvedList = document.getElementById('approvedList');
  const adminsList = document.getElementById('adminsList');

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

  function rowForMessenger(r){
    const li = el('li','list-group-item d-flex justify-content-between align-items-start');
    const left = el('div','ms-2 me-auto');
    left.innerHTML = `<div><strong>${r.name||'(no name)'} </strong> <small class="text-muted">${r.psid}</small></div>`;
    if (r.email) left.innerHTML += `<div><small class="text-muted">Email: ${r.email}</small></div>`;
    left.innerHTML += `<div class="mt-1"><span class="badge bg-${(String(r.status||'').toLowerCase()==='approved'?'success':'secondary')}">${r.status||'Not Approved'}</span> <small class="text-muted">${r.created_at||''}</small></div>`;
    const btns = el('div','btn-group');
    const approve = el('button','btn btn-sm btn-primary','Approve');
    const del = el('button','btn btn-sm btn-danger','Remove');
    approve.onclick = async ()=>{
      try{ await api(`/admins/messenger/${encodeURIComponent(r.psid)}/approve`, { method: 'PATCH' }); load(); }catch(e){ alert(e.message) }
    };
    del.onclick = async ()=>{
      if(!confirm('Remove this messenger admin?')) return;
      try{ await api(`/admins/messenger/${encodeURIComponent(r.psid)}`, { method: 'DELETE' }); load(); }catch(e){ alert(e.message) }
    };
    btns.appendChild(approve); btns.appendChild(del);
    li.appendChild(left); li.appendChild(btns);
    return li;
  }

  async function load(){
    try{
      const data = await api('/admins/messenger');
      pendingList.innerHTML = '';
      approvedList.innerHTML = '';
      (data.pending||[]).forEach(p=> pendingList.appendChild(rowForMessenger(p)));
      (data.approved||[]).forEach(a=> approvedList.appendChild(rowForMessenger(a)));

      // load email admins
      const adm = await api('/admins');
      adminsList.innerHTML = '';
      (adm.admins||[]).forEach(a=>{
        const li = el('li','list-group-item d-flex justify-content-between align-items-center');
        li.innerHTML = `<div><strong>${a.email}</strong><br><small class="text-muted">${a.created_at}</small></div>`;
        const del = el('button','btn btn-sm btn-danger','Delete');
        del.onclick = async ()=>{
          if(!confirm('Delete admin account?')) return;
          try{ await api(`/admins/${encodeURIComponent(a.id)}`, { method: 'DELETE' }); load(); }catch(e){ alert(e.message) }
        };
        li.appendChild(del);
        adminsList.appendChild(li);
      });

    }catch(e){
      console.error(e); alert('Failed to load admin data: '+(e.message||e));
    }
  }

  // Manual messenger admin form
  document.getElementById('manualForm').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const psid = document.getElementById('psidInput').value.trim();
    const name = document.getElementById('nameInput').value.trim();
    const email = document.getElementById('manualEmail') ? document.getElementById('manualEmail').value.trim() : null;
    const status = document.getElementById('statusInput').value;
    try{
      await api('/admins/messenger', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ psid, name, status, email }) });
      alert('Saved'); document.getElementById('psidInput').value=''; document.getElementById('nameInput').value=''; load();
    }catch(e){ alert('Failed: '+(e.message||e)); }
  });

  // Create admin account
  document.getElementById('createAdminForm').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    try{
      await api('/admins', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
      alert('Admin created'); document.getElementById('adminEmail').value=''; document.getElementById('adminPassword').value=''; load();
    }catch(e){ alert('Failed: '+(e.message||e)); }
  });

  // initial load
  load();
})();
