async function loadOrders() {
  const token = localStorage.getItem('adminToken');
  if (!token) {
    window.location.href = '/admin/login.html';
    return;
  }

  try {
    // Verify token
  const verifyResponse = await fetch('/api/admin/verify-token', {
      headers: { Authorization: `Bearer ${token}` },
    });
    let verifyResult;
    try {
      verifyResult = await verifyResponse.json();
    } catch (jsonError) {
      console.error('JSON parse error on verify-token:', jsonError);
      throw new Error('Invalid server response');
    }
    if (!verifyResponse.ok) {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login.html';
      return;
    }

  const response = await fetch('/api/admin/orders', {
      headers: { Authorization: `Bearer ${token}` },
    });
    let orders;
    try {
      orders = await response.json();
    } catch (jsonError) {
      console.error('JSON parse error on orders:', jsonError);
      throw new Error('Invalid server response');
    }

    if (response.ok) {
      // keep full orders data in window for detail lookups and filtering
      window.ordersData = orders || [];
        // pagination defaults
        window.ordersPerPage = 10;
        window.currentPage = 1;
        window.orderStatusFilter = '';
        // initialize filters UI and status badges
        setupOrderFilters();
        updateStatusCounts();
        // render initial view (not-delivered)
  applyOrderFilters();
  // refresh global notifications badge
  try { await refreshGlobalNotifCount(); } catch (e) { /* ignore */ }
    } else {
      showErrorModal(orders.error || 'Failed to load orders');
    }
  } catch (error) {
    console.error('Error loading orders:', error);
    showErrorModal(error.message || 'Error loading orders');
  }
}

function setupOrderFilters() {
  const search = document.getElementById('ordersSearch');
  if (search) {
    search.addEventListener('input', () => { window.currentPage = 1; applyOrderFilters(); });
  }
  // rows-per-page selector
  const perPageSel = document.getElementById('ordersPerPageSelect');
  if (perPageSel) {
    // initialize selector value
    perPageSel.value = String(window.ordersPerPage || 10);
    perPageSel.addEventListener('change', () => {
      const v = Number(perPageSel.value) || 10;
      window.ordersPerPage = v;
      window.currentPage = 1;
      applyOrderFilters();
    });
  }
  // setup status badges (replaces status dropdown)
  setupStatusBadges();
  // wire mobile dropdown items (if present)
  const ddItems = document.querySelectorAll('.status-dropdown-item');
  if (ddItems && ddItems.length) {
    ddItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const status = item.dataset.status || '';
        window.orderStatusFilter = status;
        // update desktop badge states
        const container = document.getElementById('statusBadges');
        if (container) {
          container.querySelectorAll('.status-badge').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
          const match = container.querySelector(`.status-badge[data-status="${status}"]`);
          if (match) { match.classList.add('active'); match.setAttribute('aria-pressed', 'true'); }
        }
        applyOrderFilters();
        // hide dropdown (Bootstrap handles, but ensure state)
        try { bootstrap.Dropdown.getInstance(document.getElementById('notifToggleMobile'))?.hide(); } catch (err) {}
      });
    });
  }
}

function renderPagination(totalPages) {
  const container = document.getElementById('ordersPagination');
  if (!container) return;
  container.innerHTML = '';
  if (totalPages <= 1) return;
  const createPageItem = (p, label = null, active = false, disabled = false) => {
    const li = document.createElement('li');
    li.className = 'page-item' + (active ? ' active' : '') + (disabled ? ' disabled' : '');
    const a = document.createElement('a');
    a.className = 'page-link';
    a.href = '#';
    a.dataset.page = p;
    a.innerText = label || String(p);
    li.appendChild(a);
    return li;
  };

  // previous
  container.appendChild(createPageItem(Math.max(1, window.currentPage - 1), '‹', false, window.currentPage === 1));

  // determine visible range (show up to 5 pages)
  const maxVisible = 5;
  let start = Math.max(1, window.currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

  // first page and leading ellipsis
  if (start > 1) {
    container.appendChild(createPageItem(1, '1', window.currentPage === 1));
    if (start > 2) {
      const ell = document.createElement('li');
      ell.className = 'page-item disabled';
      const span = document.createElement('span');
      span.className = 'page-link';
      span.innerText = '…';
      ell.appendChild(span);
      container.appendChild(ell);
    }
  }

  for (let p = start; p <= end; p++) {
    container.appendChild(createPageItem(p, null, p === window.currentPage));
  }

  // trailing ellipsis and last page
  if (end < totalPages) {
    if (end < totalPages - 1) {
      const ell2 = document.createElement('li');
      ell2.className = 'page-item disabled';
      const span2 = document.createElement('span');
      span2.className = 'page-link';
      span2.innerText = '…';
      ell2.appendChild(span2);
      container.appendChild(ell2);
    }
    container.appendChild(createPageItem(totalPages, String(totalPages), window.currentPage === totalPages));
  }

  // next
  container.appendChild(createPageItem(Math.min(totalPages, window.currentPage + 1), '›', false, window.currentPage === totalPages));

  // click handler
  container.querySelectorAll('.page-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const p = Number(e.currentTarget.dataset.page || 1);
      if (!p || p === window.currentPage) return;
      window.currentPage = p;
      applyOrderFilters();
      // scroll table into view
      const tableEl = document.querySelector('.table-responsive');
      if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function renderOrdersPaged(list) {
  const perPage = window.ordersPerPage || 8;
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (!window.currentPage || window.currentPage < 1) window.currentPage = 1;
  if (window.currentPage > totalPages) window.currentPage = totalPages;
  const start = (window.currentPage - 1) * perPage;
  const pageItems = list.slice(start, start + perPage);

  const tbody = document.getElementById('ordersTable');
  if (!pageItems.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No matching orders</td></tr>';
  } else {
    tbody.innerHTML = pageItems.map(order => `
      <tr data-order-id="${order.order_id}">
        <td>${order.order_id}</td>
        <td>${order.name}</td>
        <td>${order.email}</td>
        <td><a href="${order.fb_link}" target="_blank">${order.fb_link}</a></td>
        <td>
          <button class="btn btn-sm btn-pink details-button" data-order-id="${order.order_id}">Details</button>
          <button class="btn btn-sm btn-success ms-1 edit-order-button" data-order-id="${order.order_id}">Edit</button>
        </td>
      </tr>
    `).join('');
  }

  // wire buttons
  document.querySelectorAll('.details-button').forEach(button => {
    button.addEventListener('click', (e) => viewDetails(e.currentTarget.dataset.orderId));
  });
  document.querySelectorAll('.edit-order-button').forEach(button => {
    button.addEventListener('click', (e) => openEditModal(e.currentTarget.dataset.orderId));
  });

  // update counts and pagination
  try { updateStatusCounts(); } catch (e) {}
  renderPagination(totalPages);
}

function setupStatusBadges() {
  const container = document.getElementById('statusBadges');
  if (!container) return;
  container.querySelectorAll('.status-badge').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // set aria-pressed and visual active state
      container.querySelectorAll('.status-badge').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      // save filter and reapply
      window.orderStatusFilter = btn.dataset.status || '';
      applyOrderFilters();
    });
  });
  // initialize bootstrap tooltips on the count elements (if bootstrap available)
  try {
    container.querySelectorAll('.status-count').forEach(el => {
      if (el.getAttribute('data-bs-toggle') === 'tooltip') {
        // dispose existing tooltip if any
        const existing = bootstrap.Tooltip.getInstance(el);
        if (existing) existing.dispose();
        new bootstrap.Tooltip(el, { placement: 'top' });
      }
    });
  } catch (e) { /* bootstrap not available or tooltips already removed */ }
}

function updateStatusCounts() {
  const all = window.ordersData || [];
  // count only non-delivered orders as the table shows not-delivered by default
  const filtered = all.filter(o => String((o.status || '')).toLowerCase() !== 'delivered');
  const counts = { All: filtered.length, Pending: 0, Processing: 0, 'To Receive': 0 };
  filtered.forEach(o => {
    const s = String(o.status || '');
    if (s in counts) counts[s] = (counts[s] || 0) + 1;
  });
  // update DOM and set full count on title for tooltip/accessibility
  const fmt = (n) => (typeof n === 'number' && n > 99) ? '99+' : String(n);
  const setText = (id, n) => {
    const el = document.getElementById(id);
    if (!el) return;
    const display = fmt(n);
    // hide zero counts for clarity
    if (typeof n === 'number' && n === 0) {
      el.style.display = 'none';
      // dispose tooltip if exists
      try { const tt = bootstrap.Tooltip.getInstance(el); if (tt) tt.dispose(); } catch (e) {}
      return;
    }
    el.style.display = '';
    el.textContent = display;
    // set exact value as title so tooltip shows full number when truncated
    el.setAttribute('title', String(n));
    // refresh tooltip if present (recreate to update title)
    try {
      const tt = bootstrap.Tooltip.getInstance(el);
      if (tt) { tt.dispose(); }
      new bootstrap.Tooltip(el, { placement: 'top' });
    } catch (e) { /* ignore if bootstrap missing */ }
  };
  setText('countAll', counts.All);
  setText('countPending', counts.Pending);
  setText('countProcessing', counts.Processing);
  setText('countToReceive', counts['To Receive']);
  // update mobile dropdown counts and bell total if present
  try {
    const ddAll = document.getElementById('ddCountAll'); if (ddAll) { if (counts.All === 0) ddAll.style.display = 'none'; else { ddAll.style.display = ''; ddAll.textContent = fmt(counts.All); } }
  } catch (e) {}
  try {
    const ddPending = document.getElementById('ddCountPending'); if (ddPending) { if (counts.Pending === 0) ddPending.style.display = 'none'; else { ddPending.style.display = ''; ddPending.textContent = fmt(counts.Pending); } }
  } catch (e) {}
  try {
    const ddProcessing = document.getElementById('ddCountProcessing'); if (ddProcessing) { if (counts.Processing === 0) ddProcessing.style.display = 'none'; else { ddProcessing.style.display = ''; ddProcessing.textContent = fmt(counts.Processing); } }
  } catch (e) {}
  try {
    const ddToReceive = document.getElementById('ddCountToReceive'); if (ddToReceive) { if (counts['To Receive'] === 0) ddToReceive.style.display = 'none'; else { ddToReceive.style.display = ''; ddToReceive.textContent = fmt(counts['To Receive']); } }
  } catch (e) {}
  try { const notifTotalEl = document.getElementById('notifTotal'); if (notifTotalEl) { if (counts.All === 0) notifTotalEl.style.display = 'none'; else { notifTotalEl.style.display = ''; notifTotalEl.textContent = fmt(counts.All); } } } catch (e) {}
  // update optional dashboard metric cards if present
  try {
    const elTotal = document.getElementById('metricTotalOrders'); if (elTotal) elTotal.textContent = String(counts.All || 0);
    const elPending = document.getElementById('metricPending'); if (elPending) elPending.textContent = String(counts.Pending || 0);
    const elProcessing = document.getElementById('metricProcessing'); if (elProcessing) elProcessing.textContent = String(counts.Processing || 0);
    const elToReceive = document.getElementById('metricToReceive'); if (elToReceive) elToReceive.textContent = String(counts['To Receive'] || 0);
  } catch (e) { /* ignore if elements not present */ }
}

function applyOrderFilters() {
  const all = window.ordersData || [];
  const searchVal = (document.getElementById('ordersSearch')?.value || '').trim().toLowerCase();
  const statusVal = (window.orderStatusFilter || '').trim();
  // start with not-delivered
  let list = all.filter(o => String((o.status || '')).toLowerCase() !== 'delivered');
  if (statusVal) {
    list = list.filter(o => String(o.status || '') === statusVal);
  }
  if (searchVal) {
    list = list.filter(o => {
      return String(o.order_id || '').toLowerCase().includes(searchVal)
        || String(o.name || '').toLowerCase().includes(searchVal)
        || String(o.email || '').toLowerCase().includes(searchVal);
    });
  }

  // render paged results
  renderOrdersPaged(list);
}

function viewDetails(orderId) {
  const order = window.ordersData.find(o => o.order_id === orderId);
  if (!order) {
    showErrorModal('Order not found');
    return;
  }

  const modalContent = document.getElementById('orderDetailsContent');
  // When an order contains multiple items we prefer a compact details view
  // showing a small "View" button next to the Flower Type and Add-ons labels
  // that opens the larger items modal. If there's only a single item we show
  // it inline for convenience.
  const hasAnyItems = order.items && Array.isArray(order.items) && order.items.length >= 1;
  const singleItemInline = order.items && Array.isArray(order.items) && order.items.length === 1 ? order.items[0] : null;

  // Helper: determine whether any of the order's items map to products that have add-ons defined
  function orderHasProductsWithAddons(ord) {
    try {
      const prods = window._adminProducts || window._adminProductsCache || [];
      if (!Array.isArray(prods) || !ord || !Array.isArray(ord.items)) return false;
      for (const it of ord.items) {
        const code = String(it.flower_type || it.flower || '').trim();
        if (!code) continue;
        for (const p of prods) {
          if (!p || !Array.isArray(p.pricing)) continue;
          for (const r of p.pricing) {
            const rcode = String(r.label || r.set || '').trim();
            if (!rcode) continue;
            // match exact or prefix (covers cases like "FWGK1" vs "FWGK1 - ...")
            if (rcode === code || code.startsWith(rcode) || rcode.startsWith(code)) {
              if (Array.isArray(p.addons) && p.addons.length) return true;
            }
          }
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  }
  const hasAddonsAvailable = (order.addons && Array.isArray(order.addons) && order.addons.length > 0) || orderHasProductsWithAddons(order);

  modalContent.innerHTML = `
    <p><strong>Order ID:</strong> ${order.order_id}</p>
    <p><strong>Name:</strong> ${order.name}</p>
    <p><strong>Email:</strong> ${order.email}</p>
    <p><strong>Facebook Link:</strong> <a href="${order.fb_link}" target="_blank">${order.fb_link}</a></p>
  <p><strong>Flower Type:</strong> ${escapeHtml(order.flower_type || '')} ${hasAnyItems ? `<button type="button" class="btn btn-sm btn-pink ms-2 view-order-items-btn" data-order-id="${order.order_id}">View</button>` : ''}</p>
    <p><strong>Quantity:</strong> ${escapeHtml(String(order.quantity || ''))}</p>
    <!-- Inline items and color details intentionally omitted; use the View button to open the Items modal -->
  <p><strong>Add-ons:</strong> ${order.addons?.length ? escapeHtml(order.addons.join(', ')) : 'None'} ${hasAddonsAvailable ? `<button type="button" class="btn btn-sm btn-pink ms-2 view-order-addons-btn" data-order-id="${order.order_id}">View</button>` : ''}</p>
    <p><strong>Message:</strong> ${escapeHtml(order.message || 'Not provided')}</p>
    <p><strong>Rush Order:</strong> ${escapeHtml(order.rush || '')}</p>
    <p><strong>Total Fee:</strong> ₱${escapeHtml(String(order.total_fee || '0'))}</p>
    <p><strong>Status:</strong> ${escapeHtml(order.status || '')}</p>
    <p><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
  `;

  // wire the view items buttons inside the details view (if any)
  modalContent.querySelectorAll('.view-order-items-btn').forEach(btn => {
    btn.addEventListener('click', () => openOrderItemsModal(order));
  });
  // wire the view addons button to a separate addons modal
  modalContent.querySelectorAll('.view-order-addons-btn').forEach(btn => {
    btn.addEventListener('click', () => openOrderAddonsModal(order));
  });

  // If we don't yet have a products cache, fetch it on-demand so we can
  // determine whether Add-ons are available and show the Add-ons View button.
  (async function ensureProductsForAddons() {
    try {
      const prodsCached = (window._adminProducts && Array.isArray(window._adminProducts) && window._adminProducts.length > 0) || (window._adminProductsCache && Array.isArray(window._adminProductsCache) && window._adminProductsCache.length > 0);
      if (prodsCached) return;
      const res = await fetch('/api/products');
      if (!res.ok) return; // nothing to do
      const prods = await res.json();
      window._adminProductsCache = prods || [];
      // Re-check whether addons are available for this order
      const nowHas = orderHasProductsWithAddons(order);
      if (nowHas) {
        // insert a view button next to Add-ons line if not present
        const pEls = Array.from(modalContent.querySelectorAll('p'));
        for (const p of pEls) {
          if (p.textContent && p.textContent.trim().startsWith('Add-ons:')) {
            if (!p.querySelector('.view-order-addons-btn')) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'btn btn-sm btn-outline-primary ms-2 view-order-addons-btn';
              btn.dataset.orderId = order.order_id;
              btn.textContent = 'View';
              btn.addEventListener('click', () => openOrderAddonsModal(order));
              p.appendChild(btn);
            }
            break;
          }
        }
      }
    } catch (err) { /* ignore */ }
  })();

  const deleteButton = document.getElementById('deleteOrderButton');
  if (deleteButton) deleteButton.dataset.orderId = orderId;
  const changeStatusButton = document.getElementById('changeStatusButton');
  if (changeStatusButton) changeStatusButton.dataset.orderId = orderId;

  // ensure footer shows the default Close button for details view
  if (typeof resetDetailsModalFooter === 'function') resetDetailsModalFooter();
  const detailsModal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
  detailsModal.show();
}

// Ensure that when showing details (not editing) the modal footer contains the default Close button
function resetDetailsModalFooter() {
  const modalFooter = document.querySelector('#orderDetailsModal .modal-footer');
  if (modalFooter) {
    modalFooter.innerHTML = `<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>`;
  }
}

// Populate and show the reusable Order Items modal
function openOrderItemsModal(order, editable = false) {
  const body = document.getElementById('orderItemsModalBody');
  const modalEl = document.getElementById('orderItemsModal');
  if (!body || !modalEl) return;
  const items = (order && Array.isArray(order.items)) ? order.items.slice() : [];

  // ensure admin products cache exists
  async function ensureAdminProducts() {
    if (window._adminProductsCache && Array.isArray(window._adminProductsCache)) return window._adminProductsCache;
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to fetch products');
      const prods = await res.json();
      window._adminProductsCache = prods || [];
      return window._adminProductsCache;
    } catch (err) {
      console.warn('Failed to load admin products cache', err);
      window._adminProductsCache = [];
      return window._adminProductsCache;
    }
  }

  // build flower select options using product pricing rows (similar to public function.js)
  function buildFlowerOptionsHtml() {
    const prods = window._adminProductsCache || [];
    const seen = new Set();
    const groups = {};
    prods.forEach(p => {
      const cat = p.category && String(p.category).trim() ? p.category : 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      if (Array.isArray(p.pricing)) {
        p.pricing.forEach(r => {
          const code = String(r.label || r.set || '').trim();
          if (!code) return;
          if (seen.has(code)) return;
          seen.add(code);
          const parts = [];
          if (r.set) parts.push(String(r.set));
          if (r.price != null) parts.push('\u20B1' + Number(r.price));
          const text = `${code}${parts.length ? ' - ' + parts.join(' - ') : ''}`;
          groups[cat].push({ code, text, productId: p.id });
        });
      }
    });
    // build HTML
    let html = '<option value="">Select Flower Type</option>';
    Object.keys(groups).sort().forEach(cat => {
      const items = groups[cat];
      if (!items.length) return;
      html += `<optgroup label="${escapeHtml(cat)}">`;
      items.forEach(it => {
        html += `<option value="${escapeHtml(it.code)}" data-product-id="${escapeHtml(String(it.productId))}">${escapeHtml(it.text)}</option>`;
      });
      html += '</optgroup>';
    });
    return html;
  }

  // populate color select for a given row based on selected product
  function populateColorSelectForRowAdmin(row, selectedValue) {
    try {
      const flowerSelect = row.querySelector('.item-flower-select');
      const colorSelect = row.querySelector('.item-color-select');
      if (!flowerSelect || !colorSelect) return;
      const opt = flowerSelect.selectedOptions && flowerSelect.selectedOptions[0];
      const productId = opt && opt.dataset && opt.dataset.productId;
      colorSelect.innerHTML = '<option value="">Select Color</option>';
      if (!productId || !window._adminProductsCache) return;
      const prod = (window._adminProductsCache || []).find(p => String(p.id) === String(productId));
      if (!prod || !Array.isArray(prod.colors) || !prod.colors.length) return;
      prod.colors.forEach(c => {
        let value = c.value || c.hex || c.color || '';
        // normalize rgb(...) to hex
        if (typeof value === 'string' && value.trim().toLowerCase().startsWith('rgb')) {
          const m = value.match(/rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
          if (m) {
            const r = Math.max(0, Math.min(255, Number(m[1]||0)));
            const g = Math.max(0, Math.min(255, Number(m[2]||0)));
            const b = Math.max(0, Math.min(255, Number(m[3]||0)));
            value = '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('').toLowerCase();
          }
        }
        const name = c.name || value || '';
        const optEl = document.createElement('option');
        optEl.value = value;
        optEl.textContent = `● ${name}`;
        if (value) optEl.style.color = value;
        optEl.dataset.colorName = name;
        colorSelect.appendChild(optEl);
      });
      if (selectedValue) {
        // normalize selected value similarly
        let sel = selectedValue;
        if (typeof sel === 'string' && sel.trim().toLowerCase().startsWith('rgb')) {
          const m2 = sel.match(/rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
          if (m2) {
            const r2 = Math.max(0, Math.min(255, Number(m2[1]||0)));
            const g2 = Math.max(0, Math.min(255, Number(m2[2]||0)));
            const b2 = Math.max(0, Math.min(255, Number(m2[3]||0)));
            sel = '#' + [r2,g2,b2].map(n => n.toString(16).padStart(2,'0')).join('').toLowerCase();
          }
        }
        colorSelect.value = sel;
      }
    } catch (err) { console.warn('populateColorSelectForRowAdmin error', err); }
  }

  // Helper to create one editable row HTML (uses flower select and color select)
  function makeRowEditable(it, idx) {
    const flowerVal = escapeHtml(it.flower_type || it.flower || '');
    const qty = escapeHtml(String(it.quantity || it.qty || 1));
    const colorVal = (it.color && it.color.value) ? escapeHtml(it.color.value) : '';
    let html = `
      <tr data-idx="${idx}">
        <td>
          <select class="form-select form-select-sm item-flower-select">${buildFlowerOptionsHtml()}</select>
        </td>
        <td style="width:110px;"><input type="number" min="1" class="form-control form-control-sm item-qty" value="${qty}"></td>
        <td style="width:220px;">
          <select class="form-select form-select-sm item-color-select" style="width:100%;">
            <option value="">Select Color</option>
          </select>
        </td>
        <td style="width:80px;"><button type="button" class="btn btn-sm btn-outline-danger remove-item-btn">Remove</button></td>
      </tr>
    `;
    return html;
  }

  (async () => {
    await ensureAdminProducts();

    if (!items.length && !editable) {
      body.innerHTML = '<div class="p-3">No items for this order</div>';
    } else {
  if (editable) {
        const rowsHtml = items.map((it, i) => makeRowEditable(it, i)).join('');
        body.innerHTML = `
          <div class="table-responsive">
            <table class="table table-sm table-bordered" id="orderItemsEditTable">
              <thead class="table-light"><tr><th>Item</th><th style="width:110px;">Qty</th><th style="width:220px;">Color</th><th></th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        `;

        // move action buttons into modal footer for consistent layout
        const modalFooter = modalEl.querySelector('.modal-footer');
        if (modalFooter) {
          modalFooter.innerHTML = `<div class="d-flex justify-content-between w-100">
              <div>
                <button type="button" class="btn btn-sm btn-outline-secondary" id="addOrderItemBtn">Add Item</button>
              </div>
              <div>
                <button type="button" class="btn btn-outline-secondary me-2" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-pink" id="saveOrderItemsBtn">Save Items</button>
              </div>
            </div>`;
        }

        const tblBody = body.querySelector('#orderItemsEditTable tbody');
        const addBtn = modalEl.querySelector('#addOrderItemBtn');
        const saveBtn = modalEl.querySelector('#saveOrderItemsBtn');

        // initialize selects and wire events
        tblBody.querySelectorAll('tr').forEach((tr, i) => {
          const it = items[i] || {};
          const flowerSelect = tr.querySelector('.item-flower-select');
          const colorSelect = tr.querySelector('.item-color-select');
          const qtyInput = tr.querySelector('.item-qty');
          // select matching flower if possible
          if (flowerSelect && it.flower_type) {
            // try to match by option text or value
            for (const opt of Array.from(flowerSelect.options)) {
              if (opt.value === it.flower_type || opt.textContent === it.flower_type || opt.textContent.startsWith(it.flower_type)) {
                opt.selected = true; break;
              }
            }
          }
          // populate color options for this row based on selected product
          populateColorSelectForRowAdmin(tr, (it.color && it.color.value) ? it.color.value : '');
          // when flower changes, refresh colors
          flowerSelect.addEventListener('change', () => populateColorSelectForRowAdmin(tr));
          // remove handler
          const removeBtn = tr.querySelector('.remove-item-btn');
          removeBtn.addEventListener('click', () => { tr.remove(); });
        });

        addBtn.addEventListener('click', () => {
          const idx = tblBody.querySelectorAll('tr').length;
          const temp = document.createElement('tbody');
          temp.innerHTML = makeRowEditable({ flower_type: '', quantity: 1, color: null }, idx);
          tblBody.appendChild(temp.querySelector('tr'));
          const newRow = tblBody.querySelector('tr:last-child');
          // wire events for new row
          const flowerSelect = newRow.querySelector('.item-flower-select');
          const removeBtn = newRow.querySelector('.remove-item-btn');
          removeBtn.addEventListener('click', () => { newRow.remove(); });
          flowerSelect.addEventListener('change', () => populateColorSelectForRowAdmin(newRow));
        });

        saveBtn.addEventListener('click', () => {
          const newItems = [];
          tblBody.querySelectorAll('tr').forEach(r => {
            const flowerOpt = r.querySelector('.item-flower-select')?.selectedOptions[0];
            const flower = flowerOpt ? (flowerOpt.value || flowerOpt.textContent) : '';
            const qty = parseInt(r.querySelector('.item-qty')?.value || '1') || 1;
            const colorSel = r.querySelector('.item-color-select');
            const cval = colorSel ? colorSel.value : '';
            const cname = colorSel && colorSel.selectedOptions && colorSel.selectedOptions[0] ? (colorSel.selectedOptions[0].dataset.colorName || colorSel.selectedOptions[0].textContent) : '';
            const colorObj = (cval || cname) ? { name: cname, value: cval } : null;
            newItems.push({ flower_type: flower, quantity: qty, color: colorObj });
          });

          // copy back to hidden input in edit form if present
          const editItemsInput = document.getElementById('editItemsJson');
          if (editItemsInput) editItemsInput.value = JSON.stringify(newItems);

          // update in-memory ordersData
          if (order && window.ordersData) {
            const idx = window.ordersData.findIndex(o => o.order_id === order.order_id);
            if (idx !== -1) window.ordersData[idx].items = newItems;
          }

          try { bootstrap.Modal.getInstance(modalEl).hide(); } catch (e) { console.warn(e); }
        });

      } else {
        // readonly table
        const rows = items.map(it => {
          const color = it.color || it.colour || null;
          const swatch = color && color.value ? `<div style="width:28px;height:18px;border-radius:4px;border:1px solid rgba(0,0,0,0.08);background:${escapeHtml(color.value)}"></div>` : '';
          const cname = color && color.name ? escapeHtml(color.name) : (color && color.value ? escapeHtml(color.value) : '');
          return `<tr><td>${escapeHtml(it.flower_type||it.flower||'')}</td><td>${escapeHtml(String(it.quantity||it.qty||1))}</td><td class="text-center">${swatch}${cname ? ' ' + cname : ''}</td></tr>`;
        }).join('');
        body.innerHTML = `
          <div class="table-responsive">
            <table class="table table-sm table-bordered">
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
        // ensure footer contains the default Close button in readonly mode
        const modalFooter = modalEl.querySelector('.modal-footer');
        if (modalFooter) modalFooter.innerHTML = `<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>`;
      }
    }

    try { const m = new bootstrap.Modal(modalEl); m.show(); } catch (e) { console.warn('Unable to open order items modal', e); }
  })();
}

// Populate and show a separate Add-ons modal (used for Add-ons view/edit)
function openOrderAddonsModal(order, editable = false) {
  const body = document.getElementById('orderAddonsModalBody');
  const modalEl = document.getElementById('orderAddonsModal');
  if (!body || !modalEl) return;

  // gather available addons from products referenced by the order's items
  function gatherAvailableAddons(ord) {
    const out = [];
    try {
      const prods = window._adminProducts || window._adminProductsCache || [];
      if (!Array.isArray(prods) || !ord || !Array.isArray(ord.items)) return out;
      for (const it of ord.items) {
        const code = String(it.flower_type || it.flower || '').trim();
        if (!code) continue;
        for (const p of prods) {
          if (!p || !Array.isArray(p.pricing)) continue;
          for (const r of p.pricing) {
            const rcode = String(r.label || r.set || '').trim();
            if (!rcode) continue;
            if (rcode === code || code.startsWith(rcode) || rcode.startsWith(code)) {
              if (Array.isArray(p.addons) && p.addons.length) {
                p.addons.forEach(a => { if (!out.includes(a)) out.push(a); });
              }
            }
          }
        }
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  const available = gatherAvailableAddons(order);
  const selected = (order.addons && Array.isArray(order.addons)) ? order.addons.slice() : [];

  // normalize addon item to a display string
  function addonToString(a) {
    if (a == null) return '';
    if (typeof a === 'string') return a;
    if (typeof a === 'number') return String(a);
    // object: prefer {label,name,value}
    try {
      if (typeof a === 'object') {
        if (a.label) return String(a.label);
        if (a.name) return String(a.name);
        if (a.value) return String(a.value);
        // if object has a toString that isn't [object Object], use it
        const ts = a.toString && a.toString();
        if (ts && ts !== '[object Object]') return ts;
        // fallback to JSON
        return JSON.stringify(a);
      }
    } catch (e) { /* ignore */ }
    return String(a);
  }

  // build a normalized available list of unique display strings
  const availableKeys = [];
  const availableMap = [];
  (available || []).forEach(a => {
    const key = addonToString(a);
    if (!availableKeys.includes(key)) {
      availableKeys.push(key);
      availableMap.push({ raw: a, key });
    }
  });
  const selectedKeys = selected.map(s => addonToString(s));

  if (!available.length && !editable) {
    body.innerHTML = `<div class="p-3 text-muted">No add-ons available for the selected product(s).</div>`;
  } else if (!available.length && editable) {
    body.innerHTML = `<div class="p-3">No add-ons configured for the selected product(s).</div>`;
  } else {
      if (editable) {
      // render checkboxes for each available addon (use normalized keys)
      const html = availableMap.map(a => {
        const checked = selectedKeys.includes(a.key) ? 'checked' : '';
        return `<div class="form-check"><input class="form-check-input addon-choice" type="checkbox" value="${escapeHtml(a.key)}" ${checked}><label class="form-check-label">${escapeHtml(a.key)}</label></div>`;
      }).join('');
      // place the checkboxes in the modal body; place Cancel/Save into the modal footer for consistent layout
      body.innerHTML = `<div>${html}</div>`;
      // update footer buttons (no Add Item here)
      const modalFooter = modalEl.querySelector('.modal-footer');
      if (modalFooter) {
        modalFooter.innerHTML = `<div class="d-flex justify-content-end w-100">
            <div>
              <button type="button" class="btn btn-outline-secondary me-2" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-pink" id="saveOrderAddonsBtn">Save</button>
            </div>
          </div>`;
      }
      const saveBtn = modalFooter ? modalFooter.querySelector('#saveOrderAddonsBtn') : null;
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const chosen = Array.from(body.querySelectorAll('.addon-choice:checked')).map(cb => cb.value);
          // copy back to edit form input if present
          const editAddonsInput = document.querySelector('#orderDetailsContent input[name="addons"]');
          if (editAddonsInput) editAddonsInput.value = chosen.join(', ');
          // also update in-memory ordersData (store as strings)
          if (order && window.ordersData) {
            const idx = window.ordersData.findIndex(o => o.order_id === order.order_id);
            if (idx !== -1) window.ordersData[idx].addons = chosen;
          }
          try { bootstrap.Modal.getInstance(modalEl).hide(); } catch (e) { console.warn(e); }
        });
      }
    } else {
      // readonly: show only the selected add-ons for this order (not the full available list)
      // reset footer to default Close button
      const modalFooter = modalEl.querySelector('.modal-footer');
      if (modalFooter) modalFooter.innerHTML = `<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>`;
      if (selectedKeys && selectedKeys.length) {
        const html = selectedKeys.map(s => `<div>${escapeHtml(s)}</div>`).join('');
        body.innerHTML = `<div class="p-2">${html}</div>`;
      } else {
        body.innerHTML = `<div class="p-3 text-muted">No add-ons selected for this order.</div>`;
      }
    }
  }

  try { const m = new bootstrap.Modal(modalEl); m.show(); } catch (e) { console.warn('Unable to open order addons modal', e); }
}

function openEditModal(orderId) {
  const order = window.ordersData.find(o => o.order_id === orderId);
  if (!order) { showErrorModal('Order not found'); return; }
  // Populate a simple edit form inside the details modal
  const modalContent = document.getElementById('orderDetailsContent');
  const hasAnyItems = order.items && Array.isArray(order.items) && order.items.length >= 1;
  // detect whether any of the order's items map to products that have add-ons
  const hasAddonsAvailable = (order.addons && Array.isArray(order.addons) && order.addons.length > 0) || (function() {
    try {
      const prods = window._adminProducts || window._adminProductsCache || [];
      if (!Array.isArray(prods) || !order || !Array.isArray(order.items)) return false;
      for (const it of order.items) {
        const code = String(it.flower_type || it.flower || '').trim();
        if (!code) continue;
        for (const p of prods) {
          if (!p || !Array.isArray(p.pricing)) continue;
          for (const r of p.pricing) {
            const rcode = String(r.label || r.set || '').trim();
            if (!rcode) continue;
            if (rcode === code || code.startsWith(rcode) || rcode.startsWith(code)) {
              if (Array.isArray(p.addons) && p.addons.length) return true;
            }
          }
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  })();
  modalContent.innerHTML = `
    <form id="editOrderForm">
      <div class="mb-2"><label class="form-label">Order ID</label><input class="form-control" name="order_id" value="${order.order_id}" readonly></div>
      <div class="mb-2"><label class="form-label">Name</label><input class="form-control" name="name" value="${order.name || ''}"></div>
      <div class="mb-2"><label class="form-label">Email</label><input class="form-control" name="email" value="${order.email || ''}"></div>
      <div class="mb-2"><label class="form-label">Flower Type</label>
        <div class="d-flex align-items-start">
          <input class="form-control" name="flower_type" value="${order.flower_type || ''}" readonly>
          ${hasAnyItems ? `<button type="button" class="btn btn-sm btn-pink ms-2 view-order-items-btn" data-order-id="${order.order_id}">View</button>` : ''}
        </div>
      </div>
      <div class="mb-2"><label class="form-label">Quantity</label><input type="number" class="form-control" name="quantity" value="${order.quantity || 1}"></div>
      <div class="mb-2"><label class="form-label">Add-ons (comma separated)</label>
        <div class="d-flex align-items-start">
          <input class="form-control" name="addons" value="${(order.addons && order.addons.join(', ')) || ''}" readonly>
          ${hasAddonsAvailable ? `<button type="button" class="btn btn-sm btn-pink ms-2 view-order-addons-btn" data-order-id="${order.order_id}">View</button>` : ''}
        </div>
      </div>
  <div class="mb-2"><label class="form-label">Message</label><textarea class="form-control" name="message">${order.message || ''}</textarea></div>
  <input type="hidden" id="editItemsJson" name="items_json" value='${escapeHtml(JSON.stringify(order.items || []))}'>
      <div class="mb-2"><label class="form-label">Rush</label><select class="form-select" name="rush"><option ${order.rush==='No'?'selected':''}>No</option><option ${order.rush==='Yes'?'selected':''}>Yes</option></select></div>
      <div class="mb-2"><label class="form-label">Total Fee</label><input type="number" step="0.01" class="form-control" name="total_fee" value="${order.total_fee || 0}"></div>
      <div class="mb-2"><label class="form-label">Status</label>
        <select class="form-select" name="status">
          <option ${order.status==='Pending' ? 'selected' : ''}>Pending</option>
          <option ${order.status==='Processing' ? 'selected' : ''}>Processing</option>
          <option ${order.status==='To Receive' ? 'selected' : ''}>To Receive</option>
          <option ${order.status==='Cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </div>
      
    </form>
  `;

  // wire view buttons inside the edit form to open the items modal
  modalContent.querySelectorAll('.view-order-items-btn').forEach(btn => {
    btn.addEventListener('click', () => openOrderItemsModal(order, true));
  });
  // wire addons view buttons inside the edit form to open the addons modal in edit mode
  modalContent.querySelectorAll('.view-order-addons-btn').forEach(btn => {
    btn.addEventListener('click', () => openOrderAddonsModal(order, true));
  });

  // If addon visibility couldn't be determined because product cache was empty,
  // fetch products and update the edit form to show the Add-ons View button if applicable.
  (async function ensureProductsForAddonsEdit() {
    try {
      const prodsCached = (window._adminProducts && Array.isArray(window._adminProducts) && window._adminProducts.length > 0) || (window._adminProductsCache && Array.isArray(window._adminProductsCache) && window._adminProductsCache.length > 0);
      if (prodsCached) return;
      const res = await fetch('/api/products');
      if (!res.ok) return;
      const prods = await res.json();
      window._adminProductsCache = prods || [];
      // recompute availability
      const nowHas = (order.addons && Array.isArray(order.addons) && order.addons.length > 0) || (function() {
        try {
          const prods2 = window._adminProducts || window._adminProductsCache || [];
          if (!Array.isArray(prods2) || !order || !Array.isArray(order.items)) return false;
          for (const it of order.items) {
            const code = String(it.flower_type || it.flower || '').trim();
            if (!code) continue;
            for (const p of prods2) {
              if (!p || !Array.isArray(p.pricing)) continue;
              for (const r of p.pricing) {
                const rcode = String(r.label || r.set || '').trim();
                if (!rcode) continue;
                if (rcode === code || code.startsWith(rcode) || rcode.startsWith(code)) {
                  if (Array.isArray(p.addons) && p.addons.length) return true;
                }
              }
            }
          }
        } catch (e) { /* ignore */ }
        return false;
      })();
      if (nowHas) {
        const addonsWrapper = modalContent.querySelector('input[name="addons"]')?.parentElement;
        if (addonsWrapper && !addonsWrapper.querySelector('.view-order-addons-btn')) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-sm btn-outline-primary ms-2 view-order-addons-btn';
          b.dataset.orderId = order.order_id;
          b.textContent = 'View';
          b.addEventListener('click', () => openOrderAddonsModal(order, true));
          addonsWrapper.appendChild(b);
        }
      }
    } catch (err) { /* ignore */ }
  })();

  // move action buttons to the modal footer so they are always visible
  const modalFooter = document.querySelector('#orderDetailsModal .modal-footer');
  if (modalFooter) {
    modalFooter.innerHTML = `
      <div class="me-auto">
        <button type="button" class="btn btn-outline-danger" id="editDeleteButton">Delete</button>
      </div>
      <div>
        <button type="button" class="btn btn-success me-2" id="paymentButton">Payment</button>
        <button type="button" class="btn btn-pink" id="editSaveButton">Save</button>
      </div>
    `;
  }

  const editForm = document.getElementById('editOrderForm');
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(editForm);
    const payload = {};
    formData.forEach((v,k)=>{ payload[k]=v; });
    // convert addons back to array
    if (payload.addons) payload.addons = payload.addons.split(',').map(s=>s.trim()).filter(Boolean);
    // include items if provided via the modal (items_json)
    if (payload.items_json) {
      try { payload.items = JSON.parse(payload.items_json); } catch (e) { payload.items = []; }
      delete payload.items_json;
    }
    try {
      const token = localStorage.getItem('adminToken');
      const resp = await fetch(`/api/admin/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Failed to update order');
      showSuccessModal(result.message || 'Order updated');
      // refresh list
      loadOrders();
      bootstrap.Modal.getInstance(document.getElementById('orderDetailsModal')).hide();
    } catch (err) {
      showErrorModal(err && err.message ? err.message : 'Failed to save');
    }
  });

  // wire delete inside edit modal
  const editDeleteBtn = document.getElementById('editDeleteButton');
  if (editDeleteBtn) {
    editDeleteBtn.addEventListener('click', (e) => {
      const confirmButton = document.getElementById('confirmDeleteButton');
      confirmButton.dataset.orderId = orderId;
      const confirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
      confirmModal.show();
    });
  }

  // wire save button in footer to submit the edit form
  const editSaveBtn = document.getElementById('editSaveButton');
  if (editSaveBtn && editForm) {
    editSaveBtn.addEventListener('click', () => {
      if (typeof editForm.requestSubmit === 'function') {
        editForm.requestSubmit();
      } else {
        // fallback
        editForm.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
  }

  // wire payment button: open cashier modal and allow delivering the order
  const paymentBtn = document.getElementById('paymentButton');
  if (paymentBtn) {
    paymentBtn.addEventListener('click', () => {
      const cashierModalEl = document.getElementById('cashierModal');
      const totalEl = document.getElementById('cashierOrderTotal');
      const amtInput = document.getElementById('cashierAmountReceived');
      const changeEl = document.getElementById('cashierChange');
      const deliverBtn = document.getElementById('cashierConfirmButton');

      totalEl.textContent = `₱${Number(order.total_fee || 0).toLocaleString()}`;
      amtInput.value = '';
      changeEl.textContent = `₱0`;
      // disable deliver until amount entered
      if (deliverBtn) deliverBtn.disabled = true;

      const onInput = () => {
        const received = parseFloat(amtInput.value);
        const total = Number(order.total_fee) || 0;
        const validNumber = amtInput.value !== '' && !Number.isNaN(received);
        // Only enable deliver when a valid number is entered AND it's >= total fee
        const sufficient = validNumber && (received >= total);
        if (deliverBtn) deliverBtn.disabled = !sufficient;
        const change = validNumber ? (received - total) : 0;
        changeEl.textContent = `₱${(change < 0 ? 0 : change).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      };

      amtInput.removeEventListener('input', onInput);
      amtInput.addEventListener('input', onInput);

      const cashierModal = new bootstrap.Modal(cashierModalEl);

      const onDeliver = async () => {
        if (!deliverBtn) return;
        deliverBtn.disabled = true;
        try {
          const token = localStorage.getItem('adminToken');
          const received = parseFloat(amtInput.value) || 0;
          // send a deliver request that marks the order Delivered and sends the delivered email
          const receiverNameInput = document.getElementById('cashierReceiverName');
          const receiverName = receiverNameInput ? (receiverNameInput.value || '').trim() : '';
          const response = await fetch(`/api/admin/orders/${orderId}/deliver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ received, receiverName }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Failed to mark delivered');
          showSuccessModal(result.message || 'Order marked as Delivered');
          cashierModal.hide();
          loadOrders();
          try { bootstrap.Modal.getInstance(document.getElementById('orderDetailsModal')).hide(); } catch (e) {}
        } catch (err) {
          showErrorModal(err && err.message ? err.message : 'Failed to mark delivered');
        } finally {
          try { deliverBtn.removeEventListener('click', onDeliver); } catch (e) {}
          try { amtInput.removeEventListener('input', onInput); } catch (e) {}
          if (deliverBtn) deliverBtn.disabled = false;
        }
      };

      if (deliverBtn) deliverBtn.addEventListener('click', onDeliver);
      cashierModalEl.addEventListener('hidden.bs.modal', () => {
        try { if (deliverBtn) deliverBtn.removeEventListener('click', onDeliver); } catch (e) {}
        try { amtInput.removeEventListener('input', onInput); } catch (e) {}
      }, { once: true });

      cashierModal.show();
    });
  }

  // View Audit removed: audit UI and client fetch removed per request.

  const detailsModal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
  detailsModal.show();
}

async function changeStatus(orderId) {
  const token = localStorage.getItem('adminToken');
  const status = document.getElementById('orderStatus').value;
  try {
    // Simple status update (Delivered should be handled via Payment flow in the order details)
    console.log('Sending PATCH for order:', orderId, 'Status:', status);
    const response = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });

    let result;
    try {
      result = await response.json();
    } catch (jsonError) {
      console.error('JSON parse error on patch:', jsonError);
      throw new Error('Invalid server response');
    }

    if (response.ok) {
      const successModalContent = document.getElementById('successModalContent');
      successModalContent.textContent = result.message || 'Status updated successfully';
      const successModal = new bootstrap.Modal(document.getElementById('successModal'));
      successModal.show();
      loadOrders();
      bootstrap.Modal.getInstance(document.getElementById('changeStatusModal')).hide();
      bootstrap.Modal.getInstance(document.getElementById('orderDetailsModal')).hide();
    } else {
      showErrorModal(result.error || `Failed to update status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error updating status:', error);
    showErrorModal(error.message || 'Error updating status');
  }
}

async function deleteOrder(orderId) {
  const token = localStorage.getItem('adminToken');
  try {
  console.log('Sending DELETE for order:', orderId);
  const response = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    let result;
    try {
      result = await response.json();
    } catch (jsonError) {
      console.error('JSON parse error on delete:', jsonError);
      throw new Error('Invalid server response');
    }

    if (response.ok) {
      const successModalContent = document.getElementById('successModalContent');
      successModalContent.textContent = result.message || 'Order deleted successfully';
      const successModal = new bootstrap.Modal(document.getElementById('successModal'));
      successModal.show();
      loadOrders();
      bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
      bootstrap.Modal.getInstance(document.getElementById('orderDetailsModal')).hide();
    } else {
      showErrorModal(result.error || `Failed to delete order: ${response.status}`);
    }
  } catch (error) {
    console.error('Error deleting order:', error);
    showErrorModal(error.message || 'Error deleting order');
  }
}

function showErrorModal(message) {
  const errorModalContent = document.getElementById('errorModalContent');
  errorModalContent.textContent = message;
  const errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
  errorModal.show();
}

function showSuccessModal(message) {
  const successModalContent = document.getElementById('successModalContent');
  successModalContent.textContent = message;
  const successModal = new bootstrap.Modal(document.getElementById('successModal'));
  successModal.show();
}

function logout() {
  localStorage.removeItem('adminToken');
  window.location.href = '/admin/login.html';
}

// Event listeners
const logoutBtn = document.getElementById('logoutButton');
if (logoutBtn) logoutBtn.addEventListener('click', logout);

// Global notifications button wiring (supports desktop and mobile buttons)
const globalNotifBtns = Array.from(document.querySelectorAll('#globalNotifBtn, #globalNotifBtnMobile'));
async function fetchNotifications(since) {
  const token = localStorage.getItem('adminToken');
  try {
    let url = '/api/admin/notifications';
    if (since) url += `?since=${encodeURIComponent(since)}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      console.warn('Failed to fetch notifications', resp.status);
      return { notifications: [], since: null };
    }
    const data = await resp.json();
    return data || { notifications: [], since: null };
  } catch (err) {
    console.error('fetchNotifications error', err);
    return { notifications: [], since: null };
  }
}

function renderNotificationsList(items) {
  const list = document.getElementById('notificationsList');
  if (!list) return;
  list.innerHTML = '';
  if (!items || !items.length) {
    list.innerHTML = '<div class="list-group-item">No new orders</div>';
    return;
  }
  for (const it of items) {
    const created = it.created_at ? new Date(it.created_at).toLocaleString() : '';
    const el = document.createElement('div');
    el.className = 'list-group-item d-flex justify-content-between align-items-center';
    el.innerHTML = `
      <div>
        <div class="fw-semibold">${escapeHtml(it.name || 'Anonymous')}</div>
        <div class="small text-muted">Order ${escapeHtml(it.order_id)} · ${escapeHtml(it.flower_type || '')}</div>
        <div class="small text-muted">${escapeHtml(created)}</div>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-primary notif-view-btn" data-order-id="${escapeHtml(it.order_id)}">View</button>
      </div>
    `;
    list.appendChild(el);
  }
  // wire view buttons — mark individual notification viewed when clicked
  list.querySelectorAll('.notif-view-btn').forEach(b => b.addEventListener('click', async (e) => {
    const id = e.currentTarget.dataset.orderId;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const token = localStorage.getItem('adminToken');
      const resp = await fetch('/api/admin/notifications/markViewed', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ orderId: id })
      });
      if (!resp.ok) console.warn('Failed to mark notification viewed', resp.status);
    } catch (err) {
      console.error('Failed to mark notification viewed', err);
    }
    // refresh global badge count from server (server will exclude viewed id)
    try { await refreshGlobalNotifCount(); } catch (e) { /* ignore */ }
    // close notifications modal then open the order details
    try { bootstrap.Modal.getInstance(document.getElementById('notificationsModal'))?.hide(); } catch (e) {}
    viewDetails(id);
  }));
}

async function markNotificationsViewed() {
  const token = localStorage.getItem('adminToken');
  try {
    const resp = await fetch('/api/admin/notifications/markViewed', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) console.warn('markViewed failed', resp.status);
  } catch (err) { console.error('markNotificationsViewed error', err); }
}

function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str).replace(/[&<>"'`]/g, function (s) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[s]; });
}

if (globalNotifBtns && globalNotifBtns.length) {
  globalNotifBtns.forEach(btn => btn.addEventListener('click', async (e) => {
    // fetch notifications (server uses lastViewed if client doesn't send since)
    const data = await fetchNotifications();
    const items = (data && data.notifications) || [];
    renderNotificationsList(items);
    const modal = new bootstrap.Modal(document.getElementById('notificationsModal'));
    // we no longer mark all notifications as viewed on modal close.
    // Individual notifications are marked when the View button is clicked.
    modal.show();
  }));
}

// refresh the global notifications count (run during load)
async function refreshGlobalNotifCount() {
  const badgeDesktop = document.getElementById('globalNotifCount');
  const badgeMobile = document.getElementById('globalNotifCountMobile');
  const data = await fetchNotifications();
  const n = (data && data.notifications) ? data.notifications.length : 0;
  const display = n > 99 ? '99+' : String(n);
  if (badgeDesktop) {
    if (n > 0) { badgeDesktop.textContent = display; badgeDesktop.style.display = 'inline-block'; }
    else { badgeDesktop.style.display = 'none'; }
  }
  if (badgeMobile) {
    if (n > 0) { badgeMobile.textContent = display; badgeMobile.style.display = 'inline-block'; }
    else { badgeMobile.style.display = 'none'; }
  }
}

// delete confirm button (shared) - guard existence
const confirmDeleteBtn = document.getElementById('confirmDeleteButton');
if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener('click', (e) => {
    const orderId = e.target.dataset.orderId;
    deleteOrder(orderId);
  });
}

// guard: change status elements may have been removed from the details modal; wire only if present
const changeStatusBtn = document.getElementById('changeStatusButton');
if (changeStatusBtn) {
  changeStatusBtn.addEventListener('click', (e) => {
    const orderId = e.target.dataset.orderId;
    const statusForm = document.getElementById('changeStatusForm');
    const statusSelect = document.getElementById('orderStatus');
    // try to pre-select the current order status for convenience
    if (statusSelect) {
      const order = (window.ordersData || []).find(o => String(o.order_id) === String(orderId));
      statusSelect.value = order && order.status ? order.status : '';
    }
    if (statusForm) statusForm.dataset.orderId = orderId;
    const statusModal = new bootstrap.Modal(document.getElementById('changeStatusModal'));
    statusModal.show();
  });
}
const changeStatusForm = document.getElementById('changeStatusForm');
if (changeStatusForm) {
  changeStatusForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const orderId = e.target.dataset.orderId;
    changeStatus(orderId);
  });
}

// Focus management for accessibility
document.getElementById('errorModal').addEventListener('hidden.bs.modal', () => {
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) logoutButton.focus();
});
document.getElementById('successModal').addEventListener('hidden.bs.modal', () => {
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) logoutButton.focus();
});
document.getElementById('changeStatusModal').addEventListener('hidden.bs.modal', () => {
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) logoutButton.focus();
});

// Initialize
loadOrders();

// --- Real-time polling and toast notifications ---
window._notifLastIds = new Set();
window._notifPollingInterval = 15000; // 15s

async function startNotificationsPolling() {
  try {
    // seed initial set
    const data = await fetchNotifications();
    const items = (data && data.notifications) || [];
    window._notifLastIds = new Set(items.map(i => i.order_id));
    // ensure badges reflect current state
    try { await refreshGlobalNotifCount(); } catch (e) {}
  } catch (e) { console.warn('Failed to seed notifications polling', e); }

  setInterval(async () => {
    try {
      const data = await fetchNotifications();
      const items = (data && data.notifications) || [];
      // compute new IDs not in last set
      const newItems = items.filter(i => !window._notifLastIds.has(i.order_id));
      if (newItems && newItems.length) {
        // show toast with count and first item
        try { showNotifToast(newItems.length, newItems); } catch (e) { console.warn('showNotifToast error', e); }
        // update orders listing so admin sees latest
        try { loadOrders(); } catch (e) { /* ignore */ }
      }
      // refresh badge and update last ids
      try { await refreshGlobalNotifCount(); } catch (e) {}
      window._notifLastIds = new Set(items.map(i => i.order_id));
    } catch (err) {
      console.error('Notifications polling error', err);
    }
  }, window._notifPollingInterval);
}

function showNotifToast(count, items) {
  const toastEl = document.getElementById('notifToast');
  if (!toastEl) return;
  const body = document.getElementById('notifToastBody');
  const time = document.getElementById('notifToastTime');
  const viewBtn = document.getElementById('notifToastView');
  const first = items && items[0];
  body.innerHTML = `<div>You have <strong>${count}</strong> new order${count>1?'s':''}.</div>`;
  if (first) body.innerHTML += `<div class="small text-muted">Latest: ${escapeHtml(first.name||'Anonymous')} · ${escapeHtml(first.order_id)}</div>`;
  body.innerHTML += `<div class="mt-2 pt-1"><button id="notifToastView" type="button" class="btn btn-sm btn-primary">View</button></div>`;
  if (time) time.textContent = 'just now';
  const toast = new bootstrap.Toast(toastEl);
  toast.show();
  // wire view button
  const vb = document.getElementById('notifToastView');
  if (vb) {
    vb.addEventListener('click', () => {
      // open notifications modal
      const modal = new bootstrap.Modal(document.getElementById('notificationsModal'));
      // pre-render list from items
      renderNotificationsList(items);
      modal.show();
      try { toast.hide(); } catch (e) {}
    }, { once: true });
  }
}

// Start polling after a short delay once page loads
setTimeout(() => { try { startNotificationsPolling(); } catch (e) { console.warn(e); } }, 2000);