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
  // description removed from modal
    document.getElementById('productCategory').value = p.category || '';
    // fill pricing and addons editors
  try { fillPricingInForm(p.pricing || [], p.addons || [], p.colors || []); } catch (err) {}
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
  // clear pricing and addons editors
  try { fillPricingInForm([], [], []); } catch (e) { /* ignore */ }
  new bootstrap.Modal(document.getElementById('productModal')).show();
});

document.getElementById('logoutButton').addEventListener('click', () => { localStorage.removeItem('adminToken'); window.location.href = '/admin/login.html'; });

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

  try {
  let payload = { name, description };
    if (category) payload.category = category;
    // include pricing and addons collected from the modal tables
  const pricing = readPricingFromForm();
    const addons = readAddonsFromForm();
  const colors = readColorsFromForm();
    if (pricing && pricing.length) payload.pricing = pricing;
    if (addons && addons.length) payload.addons = addons;
  if (colors && colors.length) payload.colors = colors;
    if (file) {
      // upload file via multipart endpoint to storage to avoid sending base64 in JSON
      const fd = new FormData();
      fd.append('file', file);
  const upl = await fetchJSON('/api/admin/products/upload', { method: 'POST', body: fd });
      payload.image_url = upl.url;
      payload.image_path = upl.path;
    } else if (imageUrl) {
      payload.image_url = imageUrl;
    }

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
function createPricingRow(row = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="form-control form-control-sm pricing-label" value="${escapeHtml(row.label||'')}" placeholder="Label e.g. FWG1"></td>
    <td><input class="form-control form-control-sm pricing-set" value="${escapeHtml(row.set||'')}" placeholder="Set e.g. 1 pc"></td>
    <td><input class="form-control form-control-sm pricing-price" type="number" min="0" step="0.01" value="${row.price||''}"></td>
    <td><button type="button" class="btn btn-sm btn-outline-danger remove-pricing">✕</button></td>
  `;
  tr.querySelector('.remove-pricing').addEventListener('click', () => tr.remove());
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
  return rows.map(r => ({
    label: r.querySelector('.pricing-label').value.trim(),
    set: r.querySelector('.pricing-set').value.trim(),
    price: (function(v){ const s = String((r.querySelector('.pricing-price').value||'').trim()); const n = parseFloat(s); return isNaN(n) ? s : n; })(r),
  })).filter(x => x.label || x.set || x.price);
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
  const pbody = document.querySelector('#pricingTable tbody');
  pbody.innerHTML = '';
  pricing.forEach(r => pbody.appendChild(createPricingRow(r)));

  const abody = document.querySelector('#addonsTable tbody');
  abody.innerHTML = '';
  addons.forEach(a => abody.appendChild(createAddonRow(a)));
  // colors
  const cbody = document.querySelector('#colorsTable tbody');
  if (cbody) {
    cbody.innerHTML = '';
    (colors || []).forEach(c => cbody.appendChild(createColorRow(c)));
  }
}

// When saving product, include pricing and addons as JSON
const originalSubmit = document.getElementById('productForm').onsubmit;
document.getElementById('productForm').addEventListener('submit', async (e) => {
  // productForm submit logic exists above; we will not duplicate; the existing handler will pick category and other fields.
});

