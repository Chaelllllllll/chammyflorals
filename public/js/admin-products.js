async function fetchJSON(url, opts = {}) {
  const token = localStorage.getItem('adminToken');
  opts.headers = opts.headers || {};
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, opts);
  let body;
  try { body = await res.json(); } catch (e) { body = null; }
  if (!res.ok) throw body || new Error('Request failed');
  return body;
}

async function loadProducts() {
  try {
  const products = await fetchJSON('/api/admin/products');
    const tbody = document.getElementById('productsTbody');
    window._adminProducts = products || [];
    console.log('Admin: loaded products count=', (window._adminProducts||[]).length, 'sample images=', (window._adminProducts[0] && window._adminProducts[0].images) || null);
    // populate category lists from products + stored categories, then render
    populateCategoryOptions(window._adminProducts);
  applyProductFilters();
    document.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', onEdit));
    document.querySelectorAll('.delete-btn').forEach(b => b.addEventListener('click', (e)=> showDeleteModal(e.currentTarget.dataset.id)));
  } catch (err) {
    showError(err.error || err.message || 'Failed to load products');
  }
}

// Try to fetch admin categories from server; fallback to localStorage
async function fetchAdminCategories() {
  try {
  const data = await fetchJSON('/api/admin/categories');
    if (Array.isArray(data)) return data.map(c => ({ id: c.id, name: c.name, rush_fee: (c.rush_fee == null ? 0 : Number(c.rush_fee)) }));
  } catch (err) {
    // ignore and fallback
  }
  // fallback to localStorage-stored names
  try {
    const local = JSON.parse(localStorage.getItem('adminCategories') || '[]');
    // support both legacy array-of-strings and new array-of-objects format
    if (!local || !local.length) return [];
    if (typeof local[0] === 'string') return local.map(n => ({ id: null, name: n, rush_fee: 0 }));
    return (local || []).map(o => ({ id: o.id || null, name: o.name || '', rush_fee: Number(o.rush_fee || 0) }));
  } catch (e) {
    return [];
  }
}

// populate category selects (filter + product modal) using products and server/local categories
async function populateCategoryOptions(products = []) {
  try {
    const fromServer = await fetchAdminCategories();
    const set = new Set((fromServer || []).map(c => c.name).filter(Boolean));
    products.forEach(p => { if (p && p.category) set.add(p.category); });

    const categories = Array.from(set).filter(Boolean).sort((a,b)=> a.localeCompare(b));

    const filter = document.getElementById('filterCategory');
    const productSelect = document.getElementById('productCategory');
    if (!filter || !productSelect) return;

    const filterDefault = filter.querySelector('option[value=""]') ? filter.querySelector('option[value=""]').outerHTML : '<option value="">All categories</option>';
    filter.innerHTML = filterDefault + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

    const prodDefault = productSelect.querySelector('option[value=""]') ? productSelect.querySelector('option[value=""]').outerHTML : '<option value="">Uncategorized</option>';
    productSelect.innerHTML = prodDefault + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  } catch (err) {}
}

// Add category button/modal handlers
document.getElementById('addCategoryBtn')?.addEventListener('click', () => {
  document.getElementById('newCategoryName').value = '';
  new bootstrap.Modal(document.getElementById('addCategoryModal')).show();
});

document.getElementById('saveCategoryBtn')?.addEventListener('click', async () => {
  const name = (document.getElementById('newCategoryName').value || '').trim();
  if (!name) return showToast('Category name is required', 'danger');

  // try server-side create first
  try {
  const created = await fetchJSON('/api/admin/categories', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
    // refresh categories
    await populateCategoryOptions(window._adminProducts || []);
    bootstrap.Modal.getInstance(document.getElementById('addCategoryModal')).hide();
    showToast(`Category "${created.name || name}" added`, 'success');
    return;
  } catch (err) {}

  // fallback: add to localStorage-backed categories and update selects
  try {
    const saved = JSON.parse(localStorage.getItem('adminCategories') || '[]');
    if (!saved.includes(name)) saved.push(name);
    localStorage.setItem('adminCategories', JSON.stringify(saved));
    await populateCategoryOptions(window._adminProducts || []);
    bootstrap.Modal.getInstance(document.getElementById('addCategoryModal')).hide();
    showToast(`Category "${name}" added (local)`, 'success');
  } catch (err) {
    console.error('Failed saving category locally', err);
    showToast('Failed to add category', 'danger');
  }
});

// Manage categories button
document.getElementById('manageCategoriesBtn')?.addEventListener('click', () => {
  populateManageCategories();
  new bootstrap.Modal(document.getElementById('manageCategoriesModal')).show();
});

// focus the add input when manage modal is shown
document.getElementById('manageCategoriesModal')?.addEventListener('shown.bs.modal', () => {
  const input = document.getElementById('manageNewCategoryName');
  if (input) input.focus();
});

// Add / Edit category from inside Manage Categories modal
document.getElementById('manageSaveCategoryBtn')?.addEventListener('click', async () => {
  const name = (document.getElementById('manageNewCategoryName').value || '').trim();
  if (!name) return showToast('Category name is required', 'danger');
  const saveBtn = document.getElementById('manageSaveCategoryBtn');
  try {
    // If we have an editing state, perform update
    if (typeof _editingCategory !== 'undefined' && _editingCategory && (_editingCategory.id || _editingCategory.id === null)) {
      if (_editingCategory.id) {
        // server-side update
        const rushVal = Number((document.getElementById('manageCategoryRushFee')?.value || '0') || 0);
        const updated = await fetchJSON(`/api/admin/categories/${_editingCategory.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, rush_fee: rushVal }) });
        document.getElementById('manageNewCategoryName').value = '';
        _editingCategory = null;
        if (saveBtn) saveBtn.textContent = 'Add';
        await populateManageCategories();
        await populateCategoryOptions(window._adminProducts || []);
        showToast(`Category updated to "${updated.name || name}"`, 'success');
        return;
      } else {
        // local-only rename
        const saved = JSON.parse(localStorage.getItem('adminCategories') || '[]');
        // support objects in localStorage: [{name,rush_fee}]
        const idx = saved.findIndex(x => (typeof x === 'string' ? x === _editingCategory.name : x.name === _editingCategory.name));
        const rushVal = Number((document.getElementById('manageCategoryRushFee')?.value || '0') || 0);
        if (idx !== -1) saved[idx] = { name, rush_fee: rushVal }; else saved.push({ name, rush_fee: rushVal });
        localStorage.setItem('adminCategories', JSON.stringify(saved));
        document.getElementById('manageNewCategoryName').value = '';
        _editingCategory = null;
        if (saveBtn) saveBtn.textContent = 'Add';
        await populateManageCategories();
        await populateCategoryOptions(window._adminProducts || []);
        showToast(`Category "${name}" saved (local)`, 'success');
        return;
      }
    }

    // otherwise create new category (server-first)
    const rushValCreate = Number((document.getElementById('manageCategoryRushFee')?.value || '0') || 0);
    const created = await fetchJSON('/api/admin/categories', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, rush_fee: rushValCreate }) });
    document.getElementById('manageNewCategoryName').value = '';
    await populateManageCategories();
    await populateCategoryOptions(window._adminProducts || []);
    showToast(`Category "${created.name || name}" added`, 'success');
    return;
  } catch (err) {try {
      const saved = JSON.parse(localStorage.getItem('adminCategories') || '[]');
      if (!saved.includes(name)) saved.push(name);
      localStorage.setItem('adminCategories', JSON.stringify(saved));
      document.getElementById('manageNewCategoryName').value = '';
      _editingCategory = null;
      if (saveBtn) saveBtn.textContent = 'Add';
      await populateManageCategories();
      await populateCategoryOptions(window._adminProducts || []);
      showToast(`Category "${name}" added (local)`, 'success');
    } catch (err2) {
      console.error('Failed saving category locally inside manage modal', err2);
      showToast('Failed to add category', 'danger');
    }
  }
});

function populateManageCategories() {
  const listEl = document.getElementById('categoriesList');
  if (!listEl) return;
  // prefer server-backed categories; fall back to localStorage
  (async () => {
    try {
      const serverCats = await fetchAdminCategories(); // [{id,name}]
      const set = new Set((serverCats || []).map(c => c.name).filter(Boolean));
      (window._adminProducts || []).forEach(p => { if (p && p.category) set.add(p.category); });
      const categories = Array.from(set).filter(Boolean).sort((a,b)=> a.localeCompare(b));
      if (!categories.length) {
        listEl.innerHTML = '<div class="text-muted">No categories yet.</div>';
        return;
      }

      // Build list using server category ids when available
      listEl.innerHTML = categories.map(name => {
        const srv = (serverCats||[]).find(x => String(x.name) === String(name));
        const idAttr = srv && srv.id ? `data-id="${srv.id}"` : `data-name="${escapeHtml(name)}"`;
        const count = (window._adminProducts || []).filter(p => String(p.category||'') === String(name)).length;
        return `<div class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <strong>${escapeHtml(name)}</strong>
            <div class="small text-muted">${count} product${count!==1?'s':''} &middot; Rush: ₱${escapeHtml(String((srv && srv.rush_fee) || 0))}</div>
          </div>
          <div>
            <button class="btn btn-sm btn-outline-secondary me-2 edit-category" ${idAttr}>Edit</button>
            <button class="btn btn-sm btn-danger delete-category" ${idAttr}>Delete</button>
          </div>
        </div>`;
      }).join('');

      // wire delete buttons
      listEl.querySelectorAll('.delete-category').forEach(b => b.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        const name = e.target.dataset.name || e.target.dataset.id && (serverCats.find(s => String(s.id) === String(e.target.dataset.id)) || {}).name;
        // if server id present, pass that along via a small lookup during confirm
        confirmRemoveCategory(name || '');
        // store pending server id to use when confirming
        _pendingServerCategoryId = id || null;
      }));
      // wire edit buttons
      listEl.querySelectorAll('.edit-category').forEach(b => b.addEventListener('click', (e) => {
        const id = e.target.dataset.id || null;
        const srv = id ? (serverCats||[]).find(s => String(s.id) === String(id)) : null;
        const name = e.target.dataset.name || (srv && srv.name) || '';
        const rush = srv ? (srv.rush_fee || 0) : 0;
        // set editing state and prefill manage inputs
        _editingCategory = { id: id || null, name, rush_fee: rush };
        const input = document.getElementById('manageNewCategoryName');
        const rushInput = document.getElementById('manageCategoryRushFee');
        if (input) input.value = name;
        if (rushInput) rushInput.value = rush;
        const saveBtn = document.getElementById('manageSaveCategoryBtn');
        if (saveBtn) saveBtn.textContent = 'Save Changes';
        new bootstrap.Modal(document.getElementById('manageCategoriesModal')).show();
        // focus input when modal shown (existing listener will focus)
      }));
    } catch (err) {const saved = JSON.parse(localStorage.getItem('adminCategories') || '[]');
      const set = new Set(saved || []);
      (window._adminProducts || []).forEach(p => { if (p && p.category) set.add(p.category); });
      const categories = Array.from(set).filter(Boolean).sort((a,b)=> a.localeCompare(b));
      if (!categories.length) {
        listEl.innerHTML = '<div class="text-muted">No categories yet.</div>';
        return;
      }
      listEl.innerHTML = categories.map(c => {
        const count = (window._adminProducts || []).filter(p => String(p.category||'') === String(c)).length;
        return `<div class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <strong>${escapeHtml(c)}</strong>
            <div class="small text-muted">${count} product${count!==1?'s':''} &middot; Rush: ₱0</div>
          </div>
          <div>
            <button class="btn btn-sm btn-outline-secondary me-2 edit-category" data-name="${escapeHtml(c)}">Edit</button>
            <button class="btn btn-sm btn-danger delete-category" data-name="${escapeHtml(c)}">Delete</button>
          </div>
        </div>`;
      }).join('');
      listEl.querySelectorAll('.delete-category').forEach(b => b.addEventListener('click', (e) => {
        const name = e.target.dataset.name;
        confirmRemoveCategory(name);
      }));
      // wire edit buttons for local fallback listing
      listEl.querySelectorAll('.edit-category').forEach(b => b.addEventListener('click', (e) => {
        const name = e.target.dataset.name || '';
        _editingCategory = { id: null, name };
        const input = document.getElementById('manageNewCategoryName');
        if (input) input.value = name;
        const saveBtn = document.getElementById('manageSaveCategoryBtn');
        if (saveBtn) saveBtn.textContent = 'Save Changes';
        new bootstrap.Modal(document.getElementById('manageCategoriesModal')).show();
      }));
    }
  })();
}

let _pendingRemoveCategory = null;
let _pendingServerCategoryId = null;
let _editingCategory = null;
function confirmRemoveCategory(name) {
  _pendingRemoveCategory = name;
  const productsUsing = (window._adminProducts || []).filter(p => String(p.category||'') === String(name));
  const body = document.getElementById('confirmRemoveCategoryBody');
  if (!body) return;
  if (productsUsing.length) {
    body.innerHTML = `Category <strong>${escapeHtml(name)}</strong> is used by <strong>${productsUsing.length}</strong> product${productsUsing.length!==1?'s':''}.<br><br>Click "Remove" to delete the category and clear it from these products, or Cancel.`;
  } else {
    body.innerHTML = `Delete category <strong>${escapeHtml(name)}</strong>? This cannot be undone.`;
  }
  new bootstrap.Modal(document.getElementById('confirmRemoveCategoryModal')).show();
}

// Confirm remove category button handler
document.getElementById('confirmRemoveCategoryBtn')?.addEventListener('click', async () => {
  const name = _pendingRemoveCategory;
  if (!name) return;
  try {
    // attempt server-side delete if we have an id
    if (_pendingServerCategoryId) {
      try {
        await fetchJSON(`/api/admin/categories/${_pendingServerCategoryId}`, { method: 'DELETE' });
      } catch (err) {}
    }

    // remove from saved local categories as well
    try {
      const saved = JSON.parse(localStorage.getItem('adminCategories') || '[]').filter(x => x !== name);
      localStorage.setItem('adminCategories', JSON.stringify(saved));
    } catch (e) { /* ignore */ }

    // if products use it, clear their category
    const productsUsing = (window._adminProducts || []).filter(p => String(p.category||'') === String(name));
    if (productsUsing.length) {
      await Promise.all(productsUsing.map(p => fetchJSON(`/api/admin/products/${p.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ category: null }) }).catch(err => { console.error('Failed clearing category for product', p.id, err); } )));
    }

    bootstrap.Modal.getInstance(document.getElementById('confirmRemoveCategoryModal')).hide();
    bootstrap.Modal.getInstance(document.getElementById('manageCategoriesModal'))?.hide();
    await loadProducts();
    showToast(`Category "${name}" removed`, 'success');
  } catch (err) {
    console.error('Error removing category', err);
    showToast('Failed to remove category', 'danger');
  } finally {
    _pendingRemoveCategory = null;
    _pendingServerCategoryId = null;
  }
});

// reset editing state when modal hidden
document.getElementById('manageCategoriesModal')?.addEventListener('hidden.bs.modal', () => {
  _editingCategory = null;
  const saveBtn = document.getElementById('manageSaveCategoryBtn');
  if (saveBtn) saveBtn.textContent = 'Add';
  const input = document.getElementById('manageNewCategoryName');
  if (input) input.value = '';
});

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

function showError(msg) {
  showToast(msg, 'danger');
}

// Filtering / search helpers
function applyProductFilters() {
  const products = window._adminProducts || [];
  const query = (document.getElementById('productSearch')?.value || '').trim().toLowerCase();
  const category = document.getElementById('filterCategory')?.value || '';

  const filtered = products.filter(p => {
    if (category && String(p.category || '') !== String(category)) return false;
    if (!query) return true;
    const hay = `${p.name} ${p.category || ''}`.toLowerCase();
    return hay.includes(query);
  });

  const tbody = document.getElementById('productsTbody');
  tbody.innerHTML = filtered.map(p => `
    <tr data-id="${p.id}">
      <td style="width:120px"><img src="${p.image_url || '/flowers/addons.jfif'}" alt="img" class="product-thumb"></td>
      <td class="text-start">${escapeHtml(p.name)}<div class="small text-muted">${escapeHtml(p.description || '')}</div></td>
      <td>${escapeHtml(p.category || '')}</td>
      <td>${renderColorsSmall(p)}</td>
      <td style="width:90px;">
        <div class="d-flex gap-2 justify-content-center">
          <button class="btn btn-sm btn-outline-secondary gallery-btn" data-id="${p.id}" data-bs-toggle="tooltip" title="Gallery">
            <i class="fa fa-images"></i>
          </button>
        </div>
      </td>
      <td>
        <span class="badge bg-${p.is_private ? 'secondary' : 'success'}">
          ${p.is_private ? 'Private' : 'Public'}
        </span>
      </td>
      <td>
        <div class="d-flex gap-2 justify-content-center">
          <button class="btn btn-sm btn-outline-secondary edit-btn" data-id="${p.id}" data-bs-toggle="tooltip" title="Edit">
            <svg class="icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 21l3-1 11-11a2 2 0 0 0-3-3L3 17v4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn btn-sm btn-danger delete-btn" data-id="${p.id}" data-bs-toggle="tooltip" title="Delete">
            <svg class="icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 6h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
  document.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', onEdit));
  document.querySelectorAll('.delete-btn').forEach(b => b.addEventListener('click', (e)=> showDeleteModal(e.currentTarget.dataset.id)));
  // wire gallery buttons
  document.querySelectorAll('.gallery-btn').forEach(b => b.addEventListener('click', (e) => {
    const id = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id;
    if (!id) return;
    openGalleryModal(id);
  }));
}

// hook up search / filters
document.getElementById('productSearch')?.addEventListener('input', () => applyProductFilters());
document.getElementById('filterCategory')?.addEventListener('change', () => applyProductFilters());
document.getElementById('clearFilters')?.addEventListener('click', () => { document.getElementById('productSearch').value=''; document.getElementById('filterCategory').value=''; applyProductFilters(); });

function showToast(message, variant = 'info', timeout = 4000) {
  const id = `toast-${Date.now()}`;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="${id}" class="toast align-items-center text-bg-${variant} border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>`;
  document.getElementById('toastContainer').appendChild(wrapper);
  const toastEl = wrapper.firstElementChild;
  const toast = new bootstrap.Toast(toastEl, { delay: timeout });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => wrapper.remove());
}

function renderPricingSmall(p) {
  if (p.pricing && Array.isArray(p.pricing) && p.pricing.length) {
    const rows = p.pricing.map(r => `<tr><td style="padding:4px 8px">${escapeHtml(r.label||'')}</td><td style="padding:4px 8px">${escapeHtml(r.set||'')}</td><td style="padding:4px 8px">${escapeHtml(String(r.price||''))}</td></tr>`).join('');
    return `<div class="table-responsive"><table class="table table-sm mb-0"><tbody>${rows}</tbody></table></div>`;
  }
  // fallback: try first pricing row price if present
  if (p.pricing && Array.isArray(p.pricing) && p.pricing.length && typeof p.pricing[0].price !== 'undefined' && p.pricing[0].price !== null) {
    return `₱${Number(p.pricing[0].price).toLocaleString()}`;
  }
  return '<span class="text-muted">No pricing</span>';
}

// --- Gallery Manager (per-product) ---
window._galleryManager_currentId = null;
window._galleryManager_images = [];
window._galleryManager_paths = [];
window._galleryManager_newFiles = [];

function renderGalleryManagerList() {
  const list = document.getElementById('galleryManagerList');
  if (!list) return;
  list.innerHTML = '';
  (window._galleryManager_images || []).forEach((url, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'position-relative';
    wrap.style.width = '140px';
    wrap.style.height = '100px';
    wrap.style.flex = '0 0 auto';
    wrap.innerHTML = `
      <img src="${escapeHtml(url)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid #eee; cursor:pointer;">
      <button type="button" class="btn btn-sm btn-danger position-absolute" title="Remove" style="top:6px;right:6px;padding:4px 6px;">✕</button>
    `;
    const imgEl = wrap.querySelector('img');
    imgEl.addEventListener('click', () => {
      // mark this as primary by moving to front
      try { window._galleryManager_images.splice(0,0, window._galleryManager_images.splice(idx,1)[0]);
        if (window._galleryManager_paths && window._galleryManager_paths.length) {
          window._galleryManager_paths.splice(0,0, window._galleryManager_paths.splice(idx,1)[0]);
        }
        renderGalleryManagerList();
      } catch (e) {}
    });
    wrap.querySelector('button').addEventListener('click', async () => {
      // remove image (and corresponding path) - perform server-side delete if possible
      try {
        const prodId = window._galleryManager_currentId;
        const imgUrl = window._galleryManager_images[idx];
        const imgPath = (window._galleryManager_paths && window._galleryManager_paths.length) ? window._galleryManager_paths[idx] : null;
        let serverDeleted = false;
        if (prodId && (imgPath || imgUrl)) {
          try {
            await fetchJSON(`/api/admin/products/${prodId}/gallery`, { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ path: imgPath, url: imgUrl }) });
            serverDeleted = true;
            showToast('Image removed from storage', 'success');
          } catch (err) {
            console.error('Server-side gallery delete failed', err);
            showToast('Failed to remove from storage', 'danger');
          }
        } else {
          // no product id or path/url provided, treat as local-only and allow removal
          serverDeleted = true;
        }

        // Only update local UI if server deletion succeeded (or we had no server target)
        if (serverDeleted) {
          window._galleryManager_images.splice(idx,1);
          if (window._galleryManager_paths && window._galleryManager_paths.length) window._galleryManager_paths.splice(idx,1);
        }
      } catch (e) { console.error('Failed to remove image locally', e); showToast('Failed to remove image', 'danger'); }
      renderGalleryManagerList();
    });
    list.appendChild(wrap);
  });
  // show previews for new files (not yet uploaded)
  (window._galleryManager_newFiles || []).forEach((f, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'position-relative';
    wrap.style.width = '140px';
    wrap.style.height = '100px';
    wrap.style.flex = '0 0 auto';
    const url = URL.createObjectURL(f);
    wrap.innerHTML = `
      <img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid #eee;">
      <button type="button" class="btn btn-sm btn-danger position-absolute" title="Remove" style="top:6px;right:6px;padding:4px 6px;">✕</button>
    `;
    wrap.querySelector('button').addEventListener('click', () => {
      window._galleryManager_newFiles.splice(idx,1);
      renderGalleryManagerList();
    });
    list.appendChild(wrap);
  });
}

function openGalleryModal(id) {
  const p = (window._adminProducts || []).find(x => String(x.id) === String(id));
  if (!p) return showToast('Product not found', 'danger');
  console.log('Opening gallery modal for product id=', id, 'product.images=', p.images, 'product.images_paths=', p.images_paths);
  window._galleryManager_currentId = id;
  // If images are not present on the client product object, fetch fresh single-product data (cache-busted)
  if (!p.images || !Array.isArray(p.images) || p.images.length === 0) {
    (async () => {
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(id)}?_=${Date.now()}`);
        if (res && res.ok) {
          const prod = await res.json();
          window._galleryManager_images = Array.isArray(prod.images) ? prod.images.slice() : (prod.image_url ? [prod.image_url] : []);
          window._galleryManager_paths = Array.isArray(prod.images_paths) ? prod.images_paths.slice() : [];
        } else {
          window._galleryManager_images = p.image_url ? [p.image_url] : [];
          window._galleryManager_paths = [];
        }
      } catch (err) {
        console.warn('Failed fetching single product for gallery fallback:', err);
        window._galleryManager_images = p.image_url ? [p.image_url] : [];
        window._galleryManager_paths = [];
      }
      window._galleryManager_newFiles = [];
      renderGalleryManagerList();
      new bootstrap.Modal(document.getElementById('galleryManagerModal')).show();
    })();
    return;
  }
  window._galleryManager_images = Array.isArray(p.images) ? p.images.slice() : (p.image_url ? [p.image_url] : []);
  window._galleryManager_paths = Array.isArray(p.images_paths) ? p.images_paths.slice() : [];
  window._galleryManager_newFiles = [];
  renderGalleryManagerList();
  // reset inputs
  try { document.getElementById('galleryManagerFiles').value = ''; document.getElementById('galleryManagerUrl').value = ''; } catch (e) {}
  new bootstrap.Modal(document.getElementById('galleryManagerModal')).show();
}

document.getElementById('galleryManagerFiles')?.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  window._galleryManager_newFiles = window._galleryManager_newFiles.concat(files);
  renderGalleryManagerList();
});

document.getElementById('galleryManagerAddUrl')?.addEventListener('click', () => {
  const v = (document.getElementById('galleryManagerUrl')?.value || '').trim();
  if (!v) return;
  window._galleryManager_images = window._galleryManager_images || [];
  window._galleryManager_images.push(v);
  document.getElementById('galleryManagerUrl').value = '';
  renderGalleryManagerList();
});

document.getElementById('galleryManagerSaveBtn')?.addEventListener('click', async () => {
  const id = window._galleryManager_currentId;
  if (!id) return showToast('No product selected', 'danger');
  try {
    const images = Array.isArray(window._galleryManager_images) ? window._galleryManager_images.slice() : [];
    const images_paths = Array.isArray(window._galleryManager_paths) ? window._galleryManager_paths.slice() : [];
    // upload new files first
    if (window._galleryManager_newFiles && window._galleryManager_newFiles.length) {
      for (const f of window._galleryManager_newFiles) {
        try {
          const fd = new FormData(); fd.append('file', f);
          const upl = await fetchJSON('/api/admin/products/upload', { method: 'POST', body: fd });
          if (upl && upl.url) images.push(upl.url);
          if (upl && upl.path) images_paths.push(upl.bucket ? `${upl.bucket}:${upl.path}` : upl.path);
        } catch (err) { console.error('Gallery file upload failed', err); }
      }
    }
    const payload = { images, images_paths };
    await fetchJSON(`/api/admin/products/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    bootstrap.Modal.getInstance(document.getElementById('galleryManagerModal')).hide();
    showToast('Gallery saved', 'success');
    await loadProducts();
  } catch (err) { console.error('Failed saving gallery', err); showError(err.error || err.message || 'Failed to save gallery'); }
});

function renderColorsSmall(p) {
  if (p.colors && Array.isArray(p.colors) && p.colors.length) {
    const colors = p.colors.slice(0,3).map(c => {
      const v = escapeHtml(c.value || c.hex || c.color || '');
      return `<span title="${escapeHtml(c.name||'')}" style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${v};border:1px solid rgba(0,0,0,0.08);margin-right:4px;vertical-align:middle"></span>`;
    }).join('');
    const more = p.colors.length > 3 ? ` <small class="text-muted">+${p.colors.length-3}</small>` : '';
    return `<div class="d-flex align-items-center justify-content-center">${colors}${more}</div>`;
  }
  return '<span class="text-muted">—</span>';
}

async function onEdit(e) {
  const id = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || (e.target && e.target.dataset && e.target.dataset.id);
  try {
  const products = await fetchJSON('/api/admin/products');
    const p = products.find(x => String(x.id) === String(id));
    if (!p) throw new Error('Product not found');
    document.getElementById('productModalLabel').textContent = 'Edit Product';
    document.getElementById('productId').value = p.id;
    document.getElementById('productName').value = p.name;
  // productPrice input removed; no single price field to fill. Primary price will be derived from pricing rows.
    document.getElementById('productImageUrl').value = p.image_url || '';
    // load gallery images (support legacy `images` or `gallery` array)
    try {
      window._galleryExisting = Array.isArray(p.images) ? p.images.slice() : (Array.isArray(p.gallery) ? p.gallery.slice() : []);
      // ensure the primary image_url is included if gallery empty
      if ((!window._galleryExisting || !window._galleryExisting.length) && p.image_url) window._galleryExisting = [p.image_url];
    } catch (err) { window._galleryExisting = p.image_url ? [p.image_url] : []; }
    window._galleryFiles = [];
    renderGalleryPreview();
  // description removed from modal
    document.getElementById('productCategory').value = p.category || '';
    document.getElementById('productCustomizationFee').value = p.customization_fee != null ? p.customization_fee : '0.00';
    document.getElementById('productMinQty').value = p.min_qty != null && p.min_qty !== '' ? p.min_qty : '1';
    document.getElementById('productMaxQty').value = p.max_qty != null && p.max_qty !== '' ? p.max_qty : '';
    const isPrivateCheck = document.getElementById('productIsPrivate');
    if (isPrivateCheck) {
      isPrivateCheck.checked = p.is_private === true || p.is_private === 'true';
    }
    // fill pricing and addons editors
  try { 
      console.log('Loading product colors:', p.colors);
      fillPricingInForm(p.pricing || [], p.addons || [], p.colors || []); 
    } catch (err) {
      console.error('Error filling form:', err);
    }
    new bootstrap.Modal(document.getElementById('productModal')).show();
  } catch (err) { showError(err.error || err.message || 'Failed to load product'); }
}

async function onDelete(e) {
  // replaced by modal-based flow
}

let deleteCandidateId = null;
function showDeleteModal(id) {
  deleteCandidateId = id;
  const modal = new bootstrap.Modal(document.getElementById('deleteProductModal'));
  modal.show();
}

document.getElementById('confirmDeleteProductBtn').addEventListener('click', async () => {
  if (!deleteCandidateId) return;
  try {
  await fetchJSON(`/api/admin/products/${deleteCandidateId}`, { method: 'DELETE' });
    bootstrap.Modal.getInstance(document.getElementById('deleteProductModal')).hide();
    await loadProducts();
    showToast('Product deleted', 'success');
  } catch (err) { showError(err.error || err.message || 'Failed to delete'); }
});

document.getElementById('addProductBtn').addEventListener('click', () => {
  document.getElementById('productModalLabel').textContent = 'Add Product';
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('imagePreview').src = '';
  document.getElementById('productCategory').value = '';
  document.getElementById('productCustomizationFee').value = '';
  document.getElementById('productMinQty').value = '1';
  document.getElementById('productMaxQty').value = '';
  const minMaxQtyHint = document.getElementById('minMaxQtyHint');
  if (minMaxQtyHint) minMaxQtyHint.style.display = 'none';
  const isPrivateCheck = document.getElementById('productIsPrivate');
  if (isPrivateCheck) {
    isPrivateCheck.checked = false;
  }
  // clear pricing and addons editors
  try { fillPricingInForm([], [], []); } catch (e) { /* ignore */ }
  new bootstrap.Modal(document.getElementById('productModal')).show();
  // clear gallery state for new product
  window._galleryExisting = [];
  window._galleryFiles = [];
  renderGalleryPreview();
});

document.getElementById('logoutButton').addEventListener('click', () => { localStorage.removeItem('adminToken'); window.location.href = '/customer-login.html'; });

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const name = document.getElementById('productName').value.trim();
  // price removed from form; derive primary price from pricing table if available
  const pricing = readPricingFromForm();
  const imageUrl = document.getElementById('productImageUrl').value.trim();
  const file = document.getElementById('productImageFile').files[0];
  // description field removed; no longer collected
  const description = undefined;
  const category = document.getElementById('productCategory').value || null;
  const isPrivate = document.getElementById('productIsPrivate')?.checked || false;
  const customizationFee = parseFloat(document.getElementById('productCustomizationFee').value) || 0;

  // Min/max quantity validation
  const rawMinQty = (document.getElementById('productMinQty')?.value || '').trim();
  const rawMaxQty = (document.getElementById('productMaxQty')?.value || '').trim();
  const minQty = rawMinQty === '' ? 1 : Math.max(1, parseInt(rawMinQty) || 1);
  const maxQty = rawMaxQty === '' ? null : Math.max(1, parseInt(rawMaxQty) || 1);
  if (maxQty !== null && maxQty < minQty) {
    showToast('Max quantity must be greater than or equal to Min quantity', 'danger');
    return;
  }

  try {
  let payload = { name, description, is_private: isPrivate, customization_fee: customizationFee, min_qty: minQty, max_qty: maxQty };
    if (category) payload.category = category;
    // include pricing and addons collected from the modal tables
  const pricing = readPricingFromForm();
    const addons = readAddonsFromForm();
  const colors = readColorsFromForm();

    // Upload any new pricing row images
    for (const pRow of pricing) {
      if (pRow._file) {
        try {
          const pfd = new FormData();
          pfd.append('file', pRow._file);
          const pUpl = await fetchJSON('/api/admin/products/upload', { method: 'POST', body: pfd });
          if (pUpl && pUpl.url) pRow.image_url = pUpl.url;
        } catch (err) { console.error('Pricing image upload failed for', pRow.label, err); }
        delete pRow._file;
      }
    }

    if (pricing && pricing.length) payload.pricing = pricing;
    if (addons && addons.length) payload.addons = addons;
  if (colors && colors.length) payload.colors = colors;
    // handle gallery images: include existing gallery URLs + upload any new gallery files
    const images = Array.isArray(window._galleryExisting) ? window._galleryExisting.slice() : [];
    const images_paths = [];
    // if admin provided a single imageUrl and it's not already present, include it
    if (imageUrl && !images.includes(imageUrl)) images.unshift(imageUrl);

    // upload gallery files if any and collect their public urls and storage paths
    if (window._galleryFiles && window._galleryFiles.length) {
      for (const gf of window._galleryFiles) {
        try {
          const fdg = new FormData();
          fdg.append('file', gf);
          const uplg = await fetchJSON('/api/admin/products/upload', { method: 'POST', body: fdg });
          if (uplg && uplg.url) images.push(uplg.url);
          if (uplg && uplg.path) images_paths.push(uplg.bucket ? `${uplg.bucket}:${uplg.path}` : uplg.path);
        } catch (err) { console.error('Gallery upload failed for a file', err); }
      }
    }

    // set primary image if single file selected for main image
      if (file) {
      const fd = new FormData();
      fd.append('file', file);
      const upl = await fetchJSON('/api/admin/products/upload', { method: 'POST', body: fd });
      payload.image_url = upl.url;
      payload.image_path = upl.bucket ? `${upl.bucket}:${upl.path}` : upl.path;
      // ensure primary image is at front of gallery list
      try { if (payload.image_url && !images.includes(payload.image_url)) images.unshift(payload.image_url); } catch (e) {}
    } else if (imageUrl) {
      payload.image_url = imageUrl;
    }

    if (images && images.length) payload.images = images;
    if (images_paths && images_paths.length) payload.images_paths = images_paths;

    if (id) {
  await fetchJSON(`/api/admin/products/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    } else {
  await fetchJSON('/api/admin/products', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    }

    bootstrap.Modal.getInstance(document.getElementById('productModal')).hide();
    await loadProducts();
    showToast('Product saved', 'success');
  } catch (err) { showError(err.error || err.message || 'Failed to save product'); }
});

// --- Gallery client-side helpers ---
window._galleryExisting = [];
window._galleryFiles = [];
function renderGalleryPreview() {
  const container = document.getElementById('galleryPreview');
  if (!container) return;
  container.innerHTML = '';
  // existing URLs
  (window._galleryExisting || []).forEach((url, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'position-relative';
    wrap.style.width = '120px';
    wrap.style.height = '90px';
    wrap.style.flex = '0 0 auto';
    wrap.innerHTML = `
      <img src="${escapeHtml(url)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid #eee;" onerror="this.style.opacity=0.6;this.style.filter='grayscale(60%)';">
      <button type="button" class="btn btn-sm btn-danger position-absolute" title="Remove" style="top:6px;right:6px;padding:4px 6px;">✕</button>
    `;
    wrap.querySelector('button').addEventListener('click', () => {
      window._galleryExisting.splice(idx,1);
      renderGalleryPreview();
    });
    container.appendChild(wrap);
  });
  // new files
  (window._galleryFiles || []).forEach((f, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'position-relative';
    wrap.style.width = '120px';
    wrap.style.height = '90px';
    wrap.style.flex = '0 0 auto';
    const url = URL.createObjectURL(f);
    wrap.innerHTML = `
      <img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid #eee;">
      <button type="button" class="btn btn-sm btn-danger position-absolute" title="Remove" style="top:6px;right:6px;padding:4px 6px;">✕</button>
    `;
    wrap.querySelector('button').addEventListener('click', () => {
      window._galleryFiles.splice(idx,1);
      renderGalleryPreview();
    });
    container.appendChild(wrap);
  });
}

// wire gallery inputs
document.getElementById('productGalleryFiles')?.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  window._galleryFiles = window._galleryFiles.concat(files);
  renderGalleryPreview();
});
document.getElementById('addGalleryUrlBtn')?.addEventListener('click', () => {
  const v = (document.getElementById('productGalleryUrl')?.value || '').trim();
  if (!v) return;
  window._galleryExisting = window._galleryExisting || [];
  if (!window._galleryExisting.includes(v)) window._galleryExisting.push(v);
  document.getElementById('productGalleryUrl').value = '';
  renderGalleryPreview();
});
document.getElementById('clearGalleryBtn')?.addEventListener('click', () => {
  window._galleryExisting = [];
  window._galleryFiles = [];
  try { document.getElementById('productGalleryFiles').value = ''; } catch (e) {}
  renderGalleryPreview();
});

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// image preview handler - use data URL (avoids blob: so CSP won't block it)
document.getElementById('productImageFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  const preview = document.getElementById('imagePreview');
  if (!f) { preview.style.display = 'none'; preview.src = ''; return; }
  try {
    const b64 = await toBase64(f);
    preview.src = b64;
    preview.style.display = 'block';
  } catch (err) {
    console.error('Preview read error:', err);
    preview.style.display = 'none';
    preview.src = '';
  }
});

// initialize
// initialize
// Initialize Bootstrap tooltips (moved from inline script to comply with CSP)
try {
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));
} catch (e) { /* ignore if bootstrap not present yet */ }
loadProducts();

// -----------------
// Pricing & add-ons UI helpers
// -----------------
let dragSrcEl = null;

function handleDragStart(e) {
  this.style.opacity = '0.4';
  dragSrcEl = this;
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  this.classList.add('over');
}

function handleDragLeave(e) {
  this.classList.remove('over');
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  if (dragSrcEl !== this) {
    const tbody = this.parentNode;
    const children = Array.from(tbody.children);
    const dragIndex = children.indexOf(dragSrcEl);
    const dropIndex = children.indexOf(this);
    
    if (dragIndex < dropIndex) {
      tbody.insertBefore(dragSrcEl, this.nextSibling);
    } else {
      tbody.insertBefore(dragSrcEl, this);
    }
  }
  return false;
}

function handleDragEnd(e) {
  this.style.opacity = '1';
  document.querySelectorAll('#pricingTable tbody tr').forEach(row => {
    row.classList.remove('over');
  });
}

function createPricingRow(row = {}) {
  const tr = document.createElement('tr');
  tr.setAttribute('draggable', 'true');
  tr.addEventListener('dragstart', handleDragStart, false);
  tr.addEventListener('dragover', handleDragOver, false);
  tr.addEventListener('dragenter', handleDragEnter, false);
  tr.addEventListener('dragleave', handleDragLeave, false);
  tr.addEventListener('drop', handleDrop, false);
  tr.addEventListener('dragend', handleDragEnd, false);

  const existingImg = row.image_url || '';
  tr.innerHTML = `
    <td style="vertical-align:middle; text-align:center;"><i class="fas fa-grip-vertical text-muted drag-handle"></i></td>
    <td><input class="form-control form-control-sm pricing-label" value="${escapeHtml(row.label||'')}" placeholder="Label e.g. FWG1"></td>
    <td><input class="form-control form-control-sm pricing-set" value="${escapeHtml(row.set||'')}" placeholder="Set e.g. 1 pc"></td>
    <td><input class="form-control form-control-sm pricing-price" type="number" min="0" step="0.01" value="${row.price||''}"></td>
    <td>
      <div class="d-flex align-items-center gap-2">
        <input type="hidden" class="pricing-image-url" value="${escapeHtml(existingImg)}">
        ${existingImg ? `<img src="${escapeHtml(existingImg)}" class="pricing-image-preview" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;cursor:pointer;" title="Click to change">` : `<div class="pricing-image-preview" style="width:40px;height:40px;border-radius:6px;border:1px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#94a3b8;font-size:14px;" title="Click to upload"><i class="fas fa-image"></i></div>`}
        <input type="file" accept="image/*" class="pricing-image-file d-none">
      </div>
    </td>
    <td><button type="button" class="btn btn-sm btn-outline-danger remove-pricing">✕</button></td>
  `;
  tr.querySelector('.remove-pricing').addEventListener('click', () => tr.remove());

  // Click preview to trigger file input
  const preview = tr.querySelector('.pricing-image-preview');
  const fileInput = tr.querySelector('.pricing-image-file');
  if (preview && fileInput) {
    preview.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      // Replace preview with actual image thumbnail
      const td = preview.closest('td');
      const existingPreview = td.querySelector('.pricing-image-preview');
      if (existingPreview) {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'pricing-image-preview';
        img.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;cursor:pointer;';
        img.title = 'Click to change';
        img.addEventListener('click', () => fileInput.click());
        existingPreview.replaceWith(img);
      }
      // Clear the hidden URL since we have a new file
      const hiddenUrl = td.querySelector('.pricing-image-url');
      if (hiddenUrl) hiddenUrl.value = '';
    });
  }

  return tr;
}

function createAddonRow(row = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="form-control form-control-sm addon-label" value="${escapeHtml(row.label||'')}" placeholder="Add-on name"></td>
    <td><input class="form-control form-control-sm addon-price" type="text" value="${escapeHtml(row.price||'')}"></td>
    <td><button type="button" class="btn btn-sm btn-outline-danger remove-addon">✕</button></td>
  `;
  tr.querySelector('.remove-addon').addEventListener('click', () => tr.remove());
  return tr;
}

function createColorRow(row = {}) {
  const tr = document.createElement('tr');
  // normalize incoming color value to hex (#rrggbb) if possible
  function normalizeColorVal(v) {
    if (!v) return '';
    v = String(v).trim();
    // if already hex (# or 3/6 length), return standard 7-char hex
    if (/^#([0-9a-fA-F]{3})$/.test(v)) {
      // expand shorthand #abc -> #aabbcc
      const parts = v.substring(1).split('');
      return '#' + parts.map(c => c + c).join('').toLowerCase();
    }
    if (/^#([0-9a-fA-F]{6})$/.test(v)) return v.toLowerCase();
    // rgb(...) or rgba(...)
    const m = v.match(/rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (m) {
      const r = Math.max(0, Math.min(255, Number(m[1]||0)));
      const g = Math.max(0, Math.min(255, Number(m[2]||0)));
      const b = Math.max(0, Math.min(255, Number(m[3]||0)));
      const hex = '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('').toLowerCase();
      return hex;
    }
    // fallback: return as-is
    return v;
  }
  tr.innerHTML = `
    ${(() => {
      const raw = row.value || row.hex || row.color || '';
      const hex = normalizeColorVal(raw) || '#ffffff';
    return `<td><div style="width:36px;height:20px;border-radius:4px;border:1px solid #ddd;background:${escapeHtml(hex)}"></div></td>
    <td><input class="form-control form-control-sm color-name" value="${escapeHtml(row.name||'')}" placeholder="Color name e.g. Blush"></td>
    <td><input class="form-control form-control-sm color-code" value="${escapeHtml(row.code||hex)}" placeholder="#RRGGBB (auto)"></td>
    <td><input class="form-control form-control-sm color-value" type="color" value="${escapeHtml(hex)}"></td>`;
    })()}
    <td><button type="button" class="btn btn-sm btn-outline-danger remove-color">✕</button></td>
  `;
  tr.querySelector('.remove-color').addEventListener('click', () => tr.remove());
  // live update preview when color or name changes
  const preview = tr.querySelector('td div');
  const colorInput = tr.querySelector('.color-value');
  const codeInput = tr.querySelector('.color-code');
  colorInput.addEventListener('input', () => { preview.style.background = colorInput.value; });
  // auto-copy hex value into Code column (readonly) so admin sees hex code for each color
  colorInput.addEventListener('input', () => { try { if (codeInput) codeInput.value = colorInput.value.toLowerCase(); } catch (e) {} });
  // when admin types a hex into the Code column, normalize and apply it to the color picker & preview
  if (codeInput) {
    codeInput.addEventListener('input', () => {
      try {
        let v = String(codeInput.value || '').trim();
        // strip any non-hex/# characters
        v = v.replace(/[^0-9a-fA-F#]/g, '');
        if (v && !v.startsWith('#')) v = '#' + v;
        // expand 3-digit hex to 6
        const m3 = v.match(/^#([0-9a-fA-F]{3})$/);
        if (m3) {
          const parts = m3[1].split('');
          v = '#' + parts.map(c => c + c).join('').toLowerCase();
        }
        // if 6-digit hex, normalize case
        const m6 = v.match(/^#([0-9a-fA-F]{6})$/);
        if (m6) {
          v = '#' + m6[1].toLowerCase();
          codeInput.value = v;
          // apply to color input and preview
          if (colorInput) {
            colorInput.value = v;
            preview.style.background = v;
          }
        } else {
          // keep the user's partial input (without invalid chars)
          codeInput.value = v;
        }
      } catch (err) { /* ignore invalid inputs */ }
    });
  }
  return tr;
}

document.getElementById('addPricingRow').addEventListener('click', () => {
  document.querySelector('#pricingTable tbody').appendChild(createPricingRow());
});
document.getElementById('addAddonRow').addEventListener('click', () => {
  document.querySelector('#addonsTable tbody').appendChild(createAddonRow());
});
document.getElementById('addColorRow')?.addEventListener('click', () => {
  document.querySelector('#colorsTable tbody').appendChild(createColorRow());
});

function readPricingFromForm() {
  const rows = Array.from(document.querySelectorAll('#pricingTable tbody tr'));
  return rows.map(r => {
    const entry = {
      label: r.querySelector('.pricing-label').value.trim(),
      set: r.querySelector('.pricing-set').value.trim(),
      price: (function(){ const s = String((r.querySelector('.pricing-price').value||'').trim()); const n = parseFloat(s); return isNaN(n) ? s : n; })(),
    };
    // Collect existing image URL
    const hiddenUrl = r.querySelector('.pricing-image-url');
    if (hiddenUrl && hiddenUrl.value.trim()) {
      entry.image_url = hiddenUrl.value.trim();
    }
    // Collect new file (for upload later)
    const fileInput = r.querySelector('.pricing-image-file');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      entry._file = fileInput.files[0];
    }
    return entry;
  }).filter(x => x.label || x.set || x.price);
}

function readAddonsFromForm() {
  const rows = Array.from(document.querySelectorAll('#addonsTable tbody tr'));
  return rows.map(r => ({ label: r.querySelector('.addon-label').value.trim(), price: r.querySelector('.addon-price').value.trim() })).filter(x => x.label || x.price);
}

function readColorsFromForm() {
  const rows = Array.from(document.querySelectorAll('#colorsTable tbody tr'));
  return rows.map(r => ({
    name: r.querySelector('.color-name').value.trim(),
    code: (r.querySelector('.color-code') ? r.querySelector('.color-code').value.trim() : ''),
    value: r.querySelector('.color-value').value.trim()
  })).filter(x => x.name || x.value || x.code);
}

function fillPricingInForm(pricing = [], addons = [], colors = []) {
  console.log('fillPricingInForm called with colors:', colors);
  const pbody = document.querySelector('#pricingTable tbody');
  pbody.innerHTML = '';
  pricing.forEach(r => pbody.appendChild(createPricingRow(r)));

  const abody = document.querySelector('#addonsTable tbody');
  abody.innerHTML = '';
  addons.forEach(a => abody.appendChild(createAddonRow(a)));
  // colors
  const cbody = document.querySelector('#colorsTable tbody');
  console.log('Colors table tbody found:', !!cbody);
  if (cbody) {
    cbody.innerHTML = '';
    (colors || []).forEach(c => {
      console.log('Creating color row for:', c);
      cbody.appendChild(createColorRow(c));
    });
  }
}

// When saving product, include pricing and addons as JSON
const originalSubmit = document.getElementById('productForm').onsubmit;
document.getElementById('productForm').addEventListener('submit', async (e) => {
  // productForm submit logic exists above; we will not duplicate; the existing handler will pick category and other fields.
});

