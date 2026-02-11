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
      throw new Error('Invalid server response');
    }
    if (!verifyResponse.ok) {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login.html';
      return;
    }

  // Load regular orders
  const response = await fetch('/api/admin/orders', {
      headers: { Authorization: `Bearer ${token}` },
    });
    let orders;
    try {
      orders = await response.json();
    } catch (jsonError) {
      throw new Error('Invalid server response');
    }

    if (response.ok) {
      // Filter out custom orders - they have their own management page
      const allOrders = (orders || []).filter(o => o.order_type !== 'custom');
      
      // Check for new orders and trigger notification
      const storedOrderIds = localStorage.getItem('adminKnownOrderIds');
      let knownOrderIds = storedOrderIds ? JSON.parse(storedOrderIds) : [];
      
      if (allOrders && allOrders.length > 0 && knownOrderIds.length > 0) {
        const newOrders = allOrders.filter(order => !knownOrderIds.includes(order.order_id));
        
        // Trigger notification for each new order
        if (newOrders.length > 0 && window.notificationManager) {
          newOrders.forEach(order => {
            window.notificationManager.notifyNewOrder(
              order.order_id,
              order.customer_name || order.name || 'Customer'
            );
          });
        }
      }
      
      // Update known order IDs
      if (allOrders && allOrders.length > 0) {
        const allOrderIds = allOrders.map(o => o.order_id);
        localStorage.setItem('adminKnownOrderIds', JSON.stringify(allOrderIds));
      }
      
      // keep full orders data in window for detail lookups and filtering
      window.ordersData = allOrders || [];
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
  // setup mobile status dropdown
  setupMobileStatusDropdown();
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
        <td class="actions">
          <div class="d-flex justify-content-end align-items-center" style="gap:.5rem;">
            <button class="btn btn-sm btn-pink details-button" data-order-id="${order.order_id}">Details</button>
            <button class="btn btn-sm btn-success edit-order-button" data-order-id="${order.order_id}">Edit</button>
          </div>
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

// Robust datetime formatter: accepts numbers (seconds or ms) or ISO strings
function formatDateTime(v) {
  if (v == null) return '';
  try {
    let d;
    if (typeof v === 'number') {
      d = new Date(v > 1e12 ? v : v * 1000);
    } else if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
      const n = Number(v.trim());
      d = new Date(n > 1e12 ? n : n * 1000);
    } else {
      d = new Date(v);
    }
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  } catch (e) { return String(v); }
}

// Convert ISO/Date-ish value to a value suitable for <input type="datetime-local"> (local time)
function toDateTimeLocal(v) {
  if (v == null) return '';
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) { return ''; }
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

function setupMobileStatusDropdown() {
  // Setup mobile dropdown filter clicks
  document.querySelectorAll('.mobile-status-filter').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const status = item.dataset.status || '';

      // Update active state in dropdown
      document.querySelectorAll('.mobile-status-filter').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Update desktop badges to match (if present)
      const container = document.getElementById('statusBadges');
      if (container) {
        container.querySelectorAll('.status-badge').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
          if (b.dataset.status === status) {
            b.classList.add('active');
            b.setAttribute('aria-pressed', 'true');
          }
        });
      }

      // Apply filter
      window.orderStatusFilter = status;
      applyOrderFilters();
    });
  });
}

function updateStatusCounts() {
  const all = window.ordersData || [];
  // count only orders that are not delivered or to receive
  const filtered = all.filter(o => {
    const status = String((o.status || '')).toLowerCase();
    return status !== 'delivered' && status !== 'to receive';
  });
  const counts = { All: filtered.length, Pending: 0, Processing: 0 };
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
    const ddCustom = document.getElementById('ddCountCustom'); if (ddCustom) { if (counts.Custom === 0) ddCustom.style.display = 'none'; else { ddCustom.style.display = ''; ddCustom.textContent = fmt(counts.Custom); } }
  } catch (e) {}
  try {
    const ddToReceive = document.getElementById('ddCountToReceive'); if (ddToReceive) { if (counts['To Receive'] === 0) ddToReceive.style.display = 'none'; else { ddToReceive.style.display = ''; ddToReceive.textContent = fmt(counts['To Receive']); } }
  } catch (e) {}
  try { const notifTotalEl = document.getElementById('notifTotal'); if (notifTotalEl) { if (counts.All === 0) notifTotalEl.style.display = 'none'; else { notifTotalEl.style.display = ''; notifTotalEl.textContent = fmt(counts.All); } } } catch (e) {}
  // update mobile notification badge
  try {
    const mobileNotifBadge = document.getElementById('mobileNotifBadge');
    if (mobileNotifBadge) {
      if (counts.All === 0) {
        mobileNotifBadge.style.display = 'none';
      } else {
        mobileNotifBadge.style.display = '';
        mobileNotifBadge.textContent = fmt(counts.All);
      }
    }
  } catch (e) {}
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
  // start with orders that are not delivered or to receive
  let list = all.filter(o => {
    const status = String((o.status || '')).toLowerCase();
    return status !== 'delivered' && status !== 'to receive';
  });
  
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

  // sort by order date/time: newest first (descending)
  try {
    list.sort((a, b) => {
      const ta = new Date(a.created_at || a.createdAt || 0).getTime() || 0;
      const tb = new Date(b.created_at || b.createdAt || 0).getTime() || 0;
      return tb - ta; // newest first
    });
  } catch (e) { /* if dates invalid, leave original order */ }

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

  // compute total quantity (sum of items when available)
  const totalQty = (order.items && Array.isArray(order.items) && order.items.length)
    ? order.items.reduce((s, it) => s + (Number(it.quantity || it.qty || 1) || 0), 0)
    : (Number(order.quantity) || 0);

  modalContent.innerHTML = `
    <p><strong>Order ID:</strong> ${order.order_id}</p>
    <p><strong>Name:</strong> ${order.name}</p>
    <p><strong>Email:</strong> ${order.email}</p>
    <p><strong>Facebook Link:</strong> <a href="${order.fb_link}" target="_blank">${order.fb_link}</a></p>
  <p><strong>Flower Type:</strong> ${escapeHtml(order.flower_type || '')} ${hasAnyItems ? `<button type="button" class="btn btn-sm btn-pink ms-2 view-order-items-btn" data-order-id="${order.order_id}">View</button>` : ''}</p>
    <p><strong>Quantity:</strong> ${escapeHtml(String(totalQty))}</p>
    <!-- Inline items and color details intentionally omitted; use the View button to open the Items modal -->
  <p><strong>Add-ons:</strong> ${order.addons?.length ? escapeHtml(order.addons.join(', ')) : 'None'} ${hasAddonsAvailable ? `<button type="button" class="btn btn-sm btn-pink ms-2 view-order-addons-btn" data-order-id="${order.order_id}">View</button>` : ''}</p>
    <p><strong>Message:</strong> ${escapeHtml(order.message || 'Not provided')}</p>
    <p><strong>Rush Order:</strong> ${escapeHtml(order.rush || '')}</p>
    ${order.voucher_code ? `
      <hr style="margin: 15px 0; border-top: 2px solid #e0e0e0;">
      <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; border-left: 4px solid #28a745; margin-bottom: 10px;">
        <p style="margin-bottom: 8px;"><strong><i class="fas fa-ticket-alt me-2"></i>Voucher Applied:</strong> <span class="badge bg-success">${escapeHtml(order.voucher_code)}</span></p>
        <p style="margin-bottom: 5px;"><strong>Original Total:</strong> <span style="text-decoration: line-through; color: #999;">₱${escapeHtml(String(order.original_total || order.total_fee))}</span></p>
        <p style="margin-bottom: 5px;"><strong>Discount:</strong> <span style="color: #28a745; font-weight: 600;">-₱${escapeHtml(String(order.voucher_discount || '0.00'))}</span></p>
      </div>
    ` : ''}
    <p><strong>Total Fee:</strong> ₱${escapeHtml(String(order.total_fee || '0'))}</p>
    <p><strong>Status:</strong> ${escapeHtml(order.status || '')}</p>
    <p><strong>Order Date:</strong> ${escapeHtml(formatDateTime(order.created_at || order.createdAt || Date.now()))}</p>
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
    } catch (err) {window._adminProductsCache = [];
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
    } catch (err) {}
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
        
        // Display voucher info if present
        let voucherNoticeHtml = '';
        if (order && order.voucher_code) {
          const discountAmt = parseFloat(order.voucher_discount) || 0;
          voucherNoticeHtml = `
            <div class="alert alert-info mb-3" style="font-size: 0.9rem;">
              <strong><i class="bi bi-tag-fill me-1"></i>Voucher Applied:</strong> 
              <span class="badge bg-success">${escapeHtml(order.voucher_code)}</span>
              <br>
              <small>Discount of ₱${discountAmt.toFixed(2)} will be automatically applied to the new total when you save items.</small>
            </div>
          `;
        }
        
        body.innerHTML = `
          ${voucherNoticeHtml}
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

        saveBtn.addEventListener('click', async () => {
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

          // update in-memory ordersData and also update top-level flower_type and quantity
          let flowerTypeSummary = '';
          let totalQty = 0;
          if (order && window.ordersData) {
            const idx = window.ordersData.findIndex(o => o.order_id === order.order_id);
            if (idx !== -1) {
              window.ordersData[idx].items = newItems;
              // compute a sensible top-level flower_type summary
              if (Array.isArray(newItems) && newItems.length === 1) {
                flowerTypeSummary = newItems[0].flower_type || '';
              } else if (Array.isArray(newItems) && newItems.length > 1) {
                flowerTypeSummary = newItems.map(it => `${it.flower_type || ''}${it.quantity ? ' x' + it.quantity : ''}`).join('; ');
              } else {
                flowerTypeSummary = '';
              }
              window.ordersData[idx].flower_type = flowerTypeSummary;
              // update top-level quantity as the sum of item quantities
              totalQty = (newItems || []).reduce((s,it) => s + (Number(it.quantity || it.qty || 1) || 0), 0);
              window.ordersData[idx].quantity = totalQty;
              // reflect changes in the current `order` reference as well
              try { order.items = newItems; order.flower_type = flowerTypeSummary; order.quantity = totalQty; } catch (e) {}
            }
          }

          // First, save the items to the database so recompute can use them
          try {
            const token = localStorage.getItem('adminToken');
            const updateResp = await fetch(`/api/admin/orders/${order.order_id}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                items: newItems,
                flower_type: flowerTypeSummary,
                quantity: totalQty
              })
            });

            if (!updateResp.ok) {showErrorModal('Failed to save items to database');
              return;
            }

            // Now recalculate total fee based on the saved items
            const recomputeResp = await fetch(`/api/recompute-total/${order.order_id}`);
            if (recomputeResp.ok) {
              const recomputeData = await recomputeResp.json();
              const newTotalFee = recomputeData.recomputed_total || 0;

              // Update the total_fee in ordersData
              const idx = window.ordersData.findIndex(o => o.order_id === order.order_id);
              if (idx !== -1) {
                window.ordersData[idx].total_fee = newTotalFee;
                order.total_fee = newTotalFee;
              }

              // Update the total_fee input in the edit form if present
              const editFormTotalFee = document.querySelector('#orderDetailsContent input[name="total_fee"]');
              if (editFormTotalFee) {
                editFormTotalFee.value = newTotalFee;
              }
            }
          } catch (err) {showErrorModal('Failed to save items: ' + (err.message || 'Unknown error'));
            return;
          }

          // update any open edit form inputs so they reflect the saved values immediately
          try {
            const editFormFlower = document.querySelector('#orderDetailsContent input[name="flower_type"]');
            const editFormQty = document.querySelector('#orderDetailsContent input[name="quantity"]');
            if (editFormFlower) editFormFlower.value = window.ordersData?.find(o=>o.order_id===order.order_id)?.flower_type || '';
            if (editFormQty) editFormQty.value = String(window.ordersData?.find(o=>o.order_id===order.order_id)?.quantity || '0');
            // also update the hidden editItemsJson if present (again)
            const hidden = document.getElementById('editItemsJson'); if (hidden) hidden.value = JSON.stringify(newItems);
          } catch (e) { /* ignore */ }

          // If the readonly details modal is open, re-render it so the admin sees edits immediately
          try {
            const modalEl = document.getElementById('orderDetailsModal');
            if (modalEl) {
              // re-render the details modal with the updated `order` data
              try { showOrderDetails(order); } catch (e) { /* ignore */ }
            }
          } catch (e) { /* ignore */ }

          try { bootstrap.Modal.getInstance(modalEl).hide(); } catch (e) {}
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

    try { const m = new bootstrap.Modal(modalEl); m.show(); } catch (e) {}
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
        // If addon object has a label and possibly a price, construct the
        // same display string the public form uses so comparisons match.
        const label = a.label || a.name || a.value || '';
        if (label) {
          // append price if present so the final string equals what the
          // customer-side checkbox value contained (e.g. "Card - ₱50").
          const price = (typeof a.price !== 'undefined' && a.price !== null) ? Number(a.price) : null;
          if (!Number.isNaN(price) && price !== null) {
            return String(label) + ' - ₱' + Number(price).toLocaleString();
          }
          return String(label);
        }
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
        saveBtn.addEventListener('click', async () => {
          const chosen = Array.from(body.querySelectorAll('.addon-choice:checked')).map(cb => cb.value);
          // copy back to edit form input if present
          const editAddonsInput = document.querySelector('#orderDetailsContent input[name="addons"]');
          if (editAddonsInput) editAddonsInput.value = chosen.join(', ');
          // also update in-memory ordersData (store as strings)
          if (order && window.ordersData) {
            const idx = window.ordersData.findIndex(o => o.order_id === order.order_id);
            if (idx !== -1) window.ordersData[idx].addons = chosen;
          }

          // First, save the add-ons to the database so recompute can use them
          try {
            const token = localStorage.getItem('adminToken');
            const updateResp = await fetch(`/api/admin/orders/${order.order_id}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ addons: chosen })
            });

            if (!updateResp.ok) {showErrorModal('Failed to save add-ons to database');
              return;
            }

            // Now recalculate total fee based on the saved add-ons
            const recomputeResp = await fetch(`/api/recompute-total/${order.order_id}`);
            if (recomputeResp.ok) {
              const recomputeData = await recomputeResp.json();
              const newTotalFee = recomputeData.recomputed_total || 0;

              // Update the total_fee in ordersData
              const idx = window.ordersData.findIndex(o => o.order_id === order.order_id);
              if (idx !== -1) {
                window.ordersData[idx].total_fee = newTotalFee;
                order.total_fee = newTotalFee;
              }

              // Update the total_fee input in the edit form if present
              const editFormTotalFee = document.querySelector('#orderDetailsContent input[name="total_fee"]');
              if (editFormTotalFee) {
                editFormTotalFee.value = newTotalFee;
              }
            }
          } catch (err) {showErrorModal('Failed to save add-ons: ' + (err.message || 'Unknown error'));
            return;
          }

          try { bootstrap.Modal.getInstance(modalEl).hide(); } catch (e) {}
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

  try { const m = new bootstrap.Modal(modalEl); m.show(); } catch (e) {}
}

function openEditModal(orderId) {
  const order = window.ordersData.find(o => o.order_id === orderId);
  if (!order) { showErrorModal('Order not found'); return; }
  // Populate a simple edit form inside the details modal
  const modalContent = document.getElementById('orderDetailsContent');
  const hasAnyItems = order.items && Array.isArray(order.items) && order.items.length >= 1;
  const totalQty = (order.items && Array.isArray(order.items) && order.items.length)
    ? order.items.reduce((s, it) => s + (Number(it.quantity || it.qty || 1) || 0), 0)
    : (Number(order.quantity) || 1);
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
  <div class="mb-2"><label class="form-label">Quantity</label><input type="number" class="form-control" name="quantity" value="${totalQty}"></div>
      <div class="mb-2"><label class="form-label">Add-ons (comma separated)</label>
        <div class="d-flex align-items-start">
          <input class="form-control" name="addons" value="${(order.addons && order.addons.join(', ')) || ''}" readonly>
          ${hasAddonsAvailable ? `<button type="button" class="btn btn-sm btn-pink ms-2 view-order-addons-btn" data-order-id="${order.order_id}">View</button>` : ''}
        </div>
      </div>
  <div class="mb-2"><label class="form-label">Message</label><textarea class="form-control" name="message">${order.message || ''}</textarea></div>
  <input type="hidden" id="editItemsJson" name="items_json" value='${escapeHtml(JSON.stringify(order.items || []))}'>
      <div class="row g-2 mb-2">
        <div class="col-md-6">
          <label class="form-label">Expected Delivery Date</label>
          <input type="text" class="form-control" id="adminEditDeliveryDate" name="expected_delivery_date" value="${order.expected_delivery_date || ''}" placeholder="Select date" readonly>
        </div>
        <div class="col-md-6">
          <label class="form-label">Rush</label>
          <select class="form-select" name="rush"><option ${order.rush==='No'?'selected':''}>No</option><option ${order.rush==='Yes'?'selected':''}>Yes</option></select>
        </div>
      </div>
      <div class="mb-2"><label class="form-label">Total Fee</label><input type="number" step="0.01" class="form-control" name="total_fee" value="${order.total_fee || 0}"></div>
      <div class="mb-2"><label class="form-label">Status</label>
        <select class="form-select" name="status">
          <option ${order.status==='Pending' ? 'selected' : ''}>Pending</option>
          <option ${order.status==='Processing' ? 'selected' : ''}>Processing</option>
          <option ${order.status==='To Receive' ? 'selected' : ''}>To Receive</option>
          <option ${order.status==='Cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </div>
      <div class="mb-2"><label class="form-label">Order Date</label>
        <input type="datetime-local" class="form-control" name="created_at" value="${escapeHtml(toDateTimeLocal(order.created_at || order.createdAt || Date.now()))}">
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

  // Add listener to Rush dropdown to recalculate total fee when changed
  const rushSelect = modalContent.querySelector('select[name="rush"]');
  if (rushSelect) {
    rushSelect.addEventListener('change', async () => {
      // Update the order in the database first so recompute can use the new rush value
      try {
        const token = localStorage.getItem('adminToken');
        const updateResp = await fetch(`/api/admin/orders/${order.order_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ rush: rushSelect.value })
        });

        if (!updateResp.ok) {return;
        }

        // Update the order object with the new rush value
        order.rush = rushSelect.value;
        const idx = window.ordersData.findIndex(o => o.order_id === order.order_id);
        if (idx !== -1) {
          window.ordersData[idx].rush = rushSelect.value;
        }

        // Recalculate total fee
        const recomputeResp = await fetch(`/api/recompute-total/${order.order_id}`);
        if (recomputeResp.ok) {
          const recomputeData = await recomputeResp.json();
          const newTotalFee = recomputeData.recomputed_total || 0;

          // Update the total_fee in ordersData
          if (idx !== -1) {
            window.ordersData[idx].total_fee = newTotalFee;
            order.total_fee = newTotalFee;
          }

          // Update the total_fee input in the edit form
          const editFormTotalFee = modalContent.querySelector('input[name="total_fee"]');
          if (editFormTotalFee) {
            editFormTotalFee.value = newTotalFee;
          }
        }
      } catch (err) {}
    });
  }

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
    
    // Format expected_delivery_date properly (must be YYYY-MM-DD or null)
    if (payload.expected_delivery_date) {
      try {
        const dateObj = new Date(payload.expected_delivery_date);
        if (!isNaN(dateObj.getTime())) {
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          payload.expected_delivery_date = `${year}-${month}-${day}`;
        }
      } catch (e) {
        payload.expected_delivery_date = null;
      }
    }
    
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

  // View Audit removed: audit UI and client fetch removed per request.

  const detailsModal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
  detailsModal.show();
  
  // Initialize delivery calendar after modal is shown
  setTimeout(() => {
    if (document.getElementById('adminEditDeliveryDate') && typeof DeliveryCalendar !== 'undefined') {
      // Destroy existing calendar instance if any
      if (window.adminEditCalendar) {
        try {
          if (window.adminEditCalendar.backdrop && window.adminEditCalendar.backdrop.parentNode) {
            window.adminEditCalendar.backdrop.parentNode.removeChild(window.adminEditCalendar.backdrop);
          }
          if (window.adminEditCalendar.calendar && window.adminEditCalendar.calendar.parentNode) {
            window.adminEditCalendar.calendar.parentNode.removeChild(window.adminEditCalendar.calendar);
          }
        } catch (e) {}
      }
      
      window.adminEditCalendar = new DeliveryCalendar('adminEditDeliveryDate', {
        minDate: new Date(),
        onChange: (dateStr) => {
          document.getElementById('adminEditDeliveryDate').value = dateStr;
          
          // Auto-set rush based on selected date (3 days from today)
          const selectedDate = new Date(dateStr);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          selectedDate.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((selectedDate - today) / (1000 * 60 * 60 * 24));
          
          const rushSelect = document.querySelector('#editOrderForm select[name="rush"]');
          if (rushSelect) {
            if (diffDays >= 1 && diffDays <= 3) {
              rushSelect.value = 'Yes';
            } else {
              rushSelect.value = 'No';
            }
            
            // Trigger change event to recalculate total if needed
            rushSelect.dispatchEvent(new Event('change'));
          }
        }
      });
    }
  }, 100);
}

async function changeStatus(orderId) {
  const token = localStorage.getItem('adminToken');
  const status = document.getElementById('orderStatus').value;
  
  try {
    // Simple status update
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
    showErrorModal(error.message || 'Error updating status');
  }
}

async function deleteOrder(orderId) {
  const token = localStorage.getItem('adminToken');
  try {const response = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    let result;
    try {
      result = await response.json();
    } catch (jsonError) {
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

// Notifications removed: replace with safe no-op implementations to avoid network calls
async function fetchNotifications(since) {
  return { notifications: [], since: null };
}

function renderNotificationsList(items) {
  // notifications removed; no-op
}

async function markNotificationsViewed() {
  // no-op
}

function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str).replace(/[&<>"'`]/g, function (s) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[s]; });
}

// Ensure the selector exists (notifications were removed from the navbar but some code
// still references the collection). Create an empty array if none found so references
// below won't throw.
const globalNotifBtns = Array.from(document.querySelectorAll('#globalNotifBtn, #globalNotifBtnMobile'));
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
  // notifications removed — ensure any badge elements are hidden
  try { const bd = document.getElementById('globalNotifCount'); if (bd) bd.style.display = 'none'; } catch (e) {}
  try { const bm = document.getElementById('globalNotifCountMobile'); if (bm) bm.style.display = 'none'; } catch (e) {}
  return { notifications: [], since: null };
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
  // notifications removed — no-op
  return;
}

function showNotifToast(count, items) {
  // notifications removed — no-op
}

// Start polling after a short delay once page loads (notifications disabled)
// setTimeout(() => { try { startNotificationsPolling(); } catch (e) {} }, 2000);

// --- Manual Order Form Logic ---
(function initManualOrderForm() {
  const manualOrderForm = document.getElementById('manualOrderForm');
  if (!manualOrderForm) return;

  const manualItemsContainer = document.getElementById('manualItemsContainer');
  const manualAddItemBtn = document.getElementById('manualAddItemBtn');
  const manualAddonsContainer = document.getElementById('manualAddonsContainer');
  const manualAddonsSection = document.getElementById('manualAddonsSection');
  
  let _productsCache = null;
  let _categoriesCache = null;

  // Load products
  async function loadProductsForManualOrder() {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to fetch products');
      const products = await res.json();
      _productsCache = products || [];
      return _productsCache;
    } catch (err) {
      return [];
    }
  }

  // Load categories for rush fee
  async function loadCategoriesForRush() {
    try {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      const cats = await res.json();
      _categoriesCache = {};
      (cats || []).forEach(c => {
        const fee = Number(c.rush_fee) || 0;
        const nameKey = String(c.name || '').trim().toLowerCase();
        const slugKey = String(c.slug || '').trim().toLowerCase();
        const idKey = c.id != null ? String(c.id).trim() : '';
        if (nameKey) _categoriesCache[nameKey] = fee;
        if (slugKey) _categoriesCache[slugKey] = fee;
        if (idKey) _categoriesCache[idKey] = fee;
      });
    } catch (err) {
      _categoriesCache = {};
    }
  }

  function escapeHtml(unsafe) {
    return String(unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Populate item select
  function populateItemSelect(selectEl) {
    if (!_productsCache || !_productsCache.length) return;
    selectEl.innerHTML = '<option value="">Select Flower Type</option>';
    const seen = new Set();
    const groups = {};
    
    _productsCache.forEach(p => {
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
    
    Object.keys(groups).sort().forEach(cat => {
      const og = document.createElement('optgroup');
      og.label = cat;
      groups[cat].forEach(it => {
        const opt = document.createElement('option');
        opt.value = it.code;
        opt.textContent = it.text;
        if (it.productId) opt.dataset.productId = it.productId;
        og.appendChild(opt);
      });
      selectEl.appendChild(og);
    });
  }

  // Populate color select for a row
  function populateColorSelectForRow(row) {
    try {
      const select = row.querySelector('.item-flower');
      const colorSelect = row.querySelector('.item-color');
      if (!select || !colorSelect) return;
      const opt = select.selectedOptions && select.selectedOptions[0];
      const productId = opt && opt.dataset && opt.dataset.productId;
      
      colorSelect.innerHTML = '<option value="">Select Color</option>';
      if (!productId || !_productsCache) return;
      
      const prod = _productsCache.find(p => String(p.id) === String(productId));
      if (!prod || !Array.isArray(prod.colors) || !prod.colors.length) return;
      
      prod.colors.forEach(c => {
        let value = c.value || c.hex || c.color || '';
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
    } catch (err) {
    }
  }

  // Handle flower type change to show add-ons
  async function onFlowerTypeChange(e) {
    const code = (e.target.value || '').trim();
    if (!code) {
      if (manualAddonsSection) manualAddonsSection.style.display = 'none';
      return;
    }

    try {
      const products = _productsCache || [];
      let match = null;
      
      for (const p of products) {
        if (p.pricing && Array.isArray(p.pricing)) {
          const row = p.pricing.find(r => {
            const label = String(r.label || '');
            const set = String(r.set || '');
            return label === code || label.includes(code) || set === code || set.includes(code);
          });
          if (row) { match = { product: p, row }; break; }
        }
        if (String(p.name || '').toUpperCase().includes(code.toUpperCase())) {
          match = { product: p, row: null };
          break;
        }
      }

      if (!match) {
        if (manualAddonsSection) manualAddonsSection.style.display = 'none';
        return;
      }

      const { product } = match;
      
      // Render add-ons
      if (manualAddonsContainer) {
        if (product.addons && Array.isArray(product.addons) && product.addons.length) {
          const html = product.addons.map(a => {
            if (typeof a === 'string') {
              const val = escapeHtml(a);
              return `<div class="form-check mb-2"><input type="checkbox" name="addons[]" value="${val}" class="form-check-input" id="manual_addon_${val}"><label class="form-check-label fw-semibold" for="manual_addon_${val}">${val}</label></div>`;
            }
            const label = String(a.label || '').trim();
            const price = a.price != null ? `₱${Number(a.price).toLocaleString()}` : '';
            const value = escapeHtml(label + (price ? ` - ${price}` : ''));
            const id = 'manual_addon_' + label.replace(/\s+/g, '_');
            return `<div class="form-check mb-2"><input type="checkbox" name="addons[]" value="${value}" class="form-check-input" id="${id}"><label class="form-check-label" for="${id}"><span class="fw-semibold">${escapeHtml(label)}</span>${price ? ` <span class="badge bg-pink text-white ms-2">${price}</span>` : ''}</label></div>`;
          }).join('');
          manualAddonsContainer.innerHTML = html;
          if (manualAddonsSection) manualAddonsSection.style.display = '';
        } else {
          if (manualAddonsSection) manualAddonsSection.style.display = 'none';
          manualAddonsContainer.innerHTML = '';
        }
      }
    } catch (err) {
      if (manualAddonsSection) manualAddonsSection.style.display = 'none';
    }
  }

  // Compute rush fee
  function computeRushFee() {
    try {
      if (!_categoriesCache) return;
      const itemRows = manualItemsContainer.querySelectorAll('.order-item');
      let totalRush = 0;
      
      itemRows.forEach(row => {
        const select = row.querySelector('.item-flower');
        const qty = parseInt(row.querySelector('.item-quantity').value) || 1;
        const opt = select && select.selectedOptions && select.selectedOptions[0];
        const productId = opt && opt.dataset && opt.dataset.productId;
        if (!productId) return;
        
        const prod = (_productsCache || []).find(p => String(p.id) === String(productId));
        const cat = prod && prod.category ? String(prod.category).trim() : '';
        const key = String(cat || '').trim().toLowerCase();
        const fee = _categoriesCache[key] || 0;
        if (fee) totalRush += fee * qty;
      });
      
      const rushSelect = manualOrderForm.querySelector('select[name="rush"]');
      if (rushSelect) {
        const yesOpt = rushSelect.querySelector('option[value="Yes"]');
        if (yesOpt) {
          yesOpt.textContent = `Yes - Rush Fee: ₱${Number(totalRush).toLocaleString()}`;
        }
      }
    } catch (err) {
    }
  }

  // Create item row
  function createItemRow(index) {
    const row = document.createElement('div');
    row.className = 'order-item mb-2';
    row.innerHTML = `
      <div class="d-flex align-items-center gap-2 p-2 bg-light rounded border w-100">
        <span class="badge bg-pink text-white text-center" style="width: 65px; flex-shrink: 0;">Item ${index + 1}</span>
        <select class="form-select form-select-sm item-flower" name="flower_type_${index}" required style="flex: 3;">
          <option value="">Flower Type</option>
        </select>
        <select class="form-select form-select-sm item-color" name="color_${index}" aria-label="Color" style="flex: 2;">
          <option value="">Color</option>
        </select>
        <input type="number" class="form-control form-control-sm item-quantity text-center" name="quantity_${index}" min="1" value="1" required style="width: 65px; flex-shrink: 0;" placeholder="Qty">
        <button type="button" class="btn btn-sm btn-outline-danger remove-item" style="width: 36px; height: 31px; flex-shrink: 0; padding: 0;">
          <i class="fa fa-times"></i>
        </button>
      </div>
    `;
    
    const selectEl = row.querySelector('.item-flower');
    populateItemSelect(selectEl);
    
    setTimeout(() => {
      populateColorSelectForRow(row);
    }, 40);
    
    selectEl.addEventListener('change', (ev) => {
      onFlowerTypeChange(ev);
      computeRushFee();
      populateColorSelectForRow(row);
    });
    
    row.querySelector('.remove-item').addEventListener('click', () => {
      if (manualItemsContainer.children.length <= 1) return;
      row.remove();
      updateItemNumbers();
      computeRushFee();
    });
    
    return row;
  }

  // Update item numbers
  function updateItemNumbers() {
    const items = manualItemsContainer.querySelectorAll('.order-item');
    items.forEach((item, idx) => {
      const badge = item.querySelector('.badge');
      if (badge) badge.textContent = `Item ${idx + 1}`;
    });
  }

  // Initialize
  (async function init() {
    await loadProductsForManualOrder();
    await loadCategoriesForRush();
    
    // Populate initial item selects
    const initialSelects = manualItemsContainer.querySelectorAll('.item-flower');
    initialSelects.forEach(s => {
      populateItemSelect(s);
      s.addEventListener('change', (ev) => {
        onFlowerTypeChange(ev);
        computeRushFee();
        populateColorSelectForRow(s.closest('.order-item'));
      });
      const row = s.closest('.order-item');
      if (row) populateColorSelectForRow(row);
    });
    
    computeRushFee();
  })();

  // Add item button
  if (manualAddItemBtn) {
    manualAddItemBtn.addEventListener('click', () => {
      const idx = manualItemsContainer.children.length;
      const newRow = createItemRow(idx);
      manualItemsContainer.appendChild(newRow);
      computeRushFee();
    });
  }

  // Recompute rush fee when quantity changes
  manualItemsContainer.addEventListener('input', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('item-quantity')) {
      computeRushFee();
    }
  });

  // Form submission
  manualOrderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = manualOrderForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : null;
    
    // Validate form
    try {
      if (typeof manualOrderForm.reportValidity === 'function') {
        if (!manualOrderForm.reportValidity()) return;
      } else if (!manualOrderForm.checkValidity || !manualOrderForm.checkValidity()) {
        return;
      }
    } catch (valErr) {}
    
    const data = {};
    data.user_name = manualOrderForm.querySelector('input[name="user_name"]').value;
    data.user_email = manualOrderForm.querySelector('input[name="user_email"]').value;
    data.fb_link = manualOrderForm.querySelector('input[name="fb_link"]').value;
    data.message = manualOrderForm.querySelector('textarea[name="message"]').value;
    data.rush = manualOrderForm.querySelector('select[name="rush"]').value;
    data.addons = Array.from(manualOrderForm.querySelectorAll('input[name="addons[]"]:checked')).map(x => x.value);
    
    // Collect items
    const items = [];
    const itemRows = manualItemsContainer.querySelectorAll('.order-item');
    itemRows.forEach((row, i) => {
      const flower = row.querySelector('.item-flower').value;
      const qty = parseInt(row.querySelector('.item-quantity').value) || 1;
      const colorEl = row.querySelector('.item-color');
      const colorValue = colorEl ? (colorEl.value || '') : '';
      const colorName = colorEl && colorEl.selectedOptions && colorEl.selectedOptions[0] ? 
        (colorEl.selectedOptions[0].dataset.colorName || colorEl.selectedOptions[0].textContent) : '';
      
      if (!flower) return;
      
      const itemObj = { flower_type: flower, quantity: qty };
      if (colorValue) itemObj.color = { name: colorName, value: colorValue };
      items.push(itemObj);
    });
    
    if (!items.length) {
      alertWarning('Please add at least one item to the order');
      return;
    }
    
    data.items = items;
    data.flower_type = items.map(it => `${it.flower_type} x${it.quantity}`).join('; ');
    data.quantity = items.reduce((s, it) => s + (parseInt(it.quantity) || 0), 0) || 1;
    
    // Add timestamps
    try {
      const now = new Date();
      data.created_at = now.toISOString();
      data.created_at_local = now.toLocaleString();
      data.tz_offset_minutes = now.getTimezoneOffset();
      const pad = (n) => String(n).padStart(2, '0');
      data.created_at_local_iso = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    } catch (e) {}
    
    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Creating...';
      }
      
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('manualOrderModal'));
        if (modal) modal.hide();
        
        // Show success
        showSuccessModal('Manual order created successfully!');
        
        // Reset form
        manualOrderForm.reset();
        
        // Reset items container to single item
        manualItemsContainer.innerHTML = '';
        const initialRow = createItemRow(0);
        manualItemsContainer.appendChild(initialRow);
        
        // Hide addons
        if (manualAddonsSection) manualAddonsSection.style.display = 'none';
        
        // Reload orders
        await loadOrders();
      } else {
        showErrorModal(result.error || 'Failed to create manual order');
      }
    } catch (error) {
      showErrorModal(error.message || 'Error creating manual order');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
        if (originalBtnHtml !== null) submitBtn.innerHTML = originalBtnHtml;
      }
    }
  });
})();

// Admin Chat Functions
async function loadAdminChatMessages(orderId) {
  const chatMessages = document.getElementById('adminChatMessages');
  if (!chatMessages) return;

  try {
    const token = localStorage.getItem('adminToken');
    const response = await fetch(`/api/chat/${encodeURIComponent(orderId)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();

    if (response.ok && data.messages) {
      if (data.messages.length === 0) {
        chatMessages.innerHTML = `
          <div class="text-center text-muted small py-2">
            <i class="fas fa-comments me-2"></i>No messages yet
          </div>
        `;
      } else {
        chatMessages.innerHTML = data.messages.map(msg => {
          const isAdmin = msg.sender_type === 'admin';
          const time = new Date(msg.created_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          });
          
          return `
            <div class="mb-2 ${isAdmin ? 'text-end' : ''}">
              <div class="d-inline-block ${isAdmin ? 'bg-pink text-white' : 'bg-white border'} rounded px-3 py-2" style="max-width: 80%;">
                <div class="small fw-semibold mb-1">${isAdmin ? 'You (Admin)' : 'Customer'}</div>
                <div style="word-wrap: break-word;">${escapeHtml(msg.message)}</div>
                <div class="small opacity-75 mt-1">${time}</div>
              </div>
            </div>
          `;
        }).join('');
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    } else {
      chatMessages.innerHTML = `
        <div class="text-center text-danger small">
          <i class="fas fa-exclamation-circle me-2"></i>Failed to load messages
        </div>
      `;
    }
  } catch (error) {
    chatMessages.innerHTML = `
      <div class="text-center text-danger small">
        <i class="fas fa-exclamation-circle me-2"></i>Failed to load messages
      </div>
    `;
  }
}

async function sendAdminChatMessage(orderId) {
  const chatInput = document.getElementById('adminChatInput');
  const chatForm = document.getElementById('adminChatForm');
  
  if (!chatInput || !chatForm) return;

  const message = chatInput.value.trim();
  if (!message) return;

  // Disable form while sending
  const submitBtn = chatForm.querySelector('button[type="submit"]');
  const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }

  try {
    const token = localStorage.getItem('adminToken');
    const response = await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        order_id: orderId,
        message: message,
        sender_type: 'admin'
      })
    });

    const result = await response.json();

    if (response.ok) {
      // Clear input
      chatInput.value = '';
      
      // Reload messages
      await loadAdminChatMessages(orderId);
    } else {
      showErrorModal(result.error || 'Failed to send message');
    }
  } catch (error) {
    showErrorModal('Failed to send message. Please try again.');
  } finally {
    // Re-enable form
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  }
}

// Floating Message Button Functionality
(function initAdminFloatingMessages() {
  const messagesNavLink = document.getElementById('messagesNavLink');
  const messagesModal = document.getElementById('adminMessagesModal');
  const conversationModal = document.getElementById('adminChatConversationModal');
  
  let currentChatOrderId = null;
  let chatRefreshInterval = null;

  // Messages navigation is now handled by direct link to messages.html page
  // No modal needed anymore

  // Load all undelivered orders
  async function loadOrdersWithMessages() {
    const messagesList = document.getElementById('adminMessagesList');
    if (!messagesList) return;

    try {
      const token = localStorage.getItem('adminToken');
      
      // Get all undelivered orders
      const ordersResponse = await fetch('/api/admin/orders', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!ordersResponse.ok) {
        messagesList.innerHTML = '<div class="alert alert-danger">Failed to load orders</div>';
        return;
      }

      const orders = await ordersResponse.json();
      const undeliveredOrders = orders.filter(o => o.status !== 'Delivered');

      // Get message counts for each order
      const ordersWithData = [];
      let totalMessagesCount = 0;
      
      for (const order of undeliveredOrders) {
        try {
          const chatResponse = await fetch(`/api/chat/${encodeURIComponent(order.order_id)}`);
          if (chatResponse.ok) {
            const chatData = await chatResponse.json();
            const messageCount = chatData.messages ? chatData.messages.length : 0;
            const lastMessage = chatData.messages && chatData.messages.length > 0 ? chatData.messages[chatData.messages.length - 1] : null;
            
            ordersWithData.push({
              ...order,
              messageCount,
              lastMessage
            });
            
            if (messageCount > 0) totalMessagesCount++;
          }
        } catch (err) {
          ordersWithData.push({
            ...order,
            messageCount: 0,
            lastMessage: null
          });
        }
      }

      // Update badge
      const badge = document.getElementById('messagesBadge');
      if (badge) {
        if (totalMessagesCount > 0) {
          badge.textContent = totalMessagesCount;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }

      // Display orders
      if (ordersWithData.length === 0) {
        messagesList.innerHTML = `
          <div class="text-center text-muted py-4">
            <i class="fas fa-inbox fa-3x mb-3"></i>
            <div>No active orders</div>
          </div>
        `;
      } else {
        messagesList.innerHTML = ordersWithData.map(order => {
          let messagePreview = '';
          if (order.lastMessage) {
            const lastMsgTime = new Date(order.lastMessage.created_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            });
            const isCustomerLast = order.lastMessage.sender_type === 'customer';
            messagePreview = `
              <div class="small text-muted">
                <strong>${isCustomerLast ? 'Customer' : 'You'}:</strong> ${escapeHtml(order.lastMessage.message.substring(0, 60))}${order.lastMessage.message.length > 60 ? '...' : ''}
              </div>
              <div class="small text-muted mt-1">
                <i class="fas fa-clock me-1"></i>${lastMsgTime}
              </div>
            `;
          } else {
            messagePreview = '<div class="small text-muted">No messages yet</div>';
          }
          
          return `
            <div class="order-message-item" data-order-id="${order.order_id}">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <div class="fw-bold text-pink">${escapeHtml(order.order_id)}</div>
                  <div class="small text-muted">${escapeHtml(order.name)}</div>
                </div>
                <div class="d-flex align-items-center gap-2">
                  ${order.messageCount > 0 ? `<span class="message-count-badge">${order.messageCount} msg${order.messageCount > 1 ? 's' : ''}</span>` : ''}
                  <span class="badge bg-${getStatusColorClass(order.status)}">${escapeHtml(order.status)}</span>
                </div>
              </div>
              ${messagePreview}
            </div>
          `;
        }).join('');

        // Add click handlers
        messagesList.querySelectorAll('.order-message-item').forEach(item => {
          item.addEventListener('click', () => {
            const orderId = item.dataset.orderId;
            const order = ordersWithData.find(o => o.order_id === orderId);
            openChatInModal(order);
          });
        });
      }
    } catch (error) {
      messagesList.innerHTML = '<div class="alert alert-danger">Failed to load messages</div>';
    }
  }

  function getStatusColorClass(status) {
    const statusMap = {
      'Pending': 'warning',
      'Processing': 'primary',
      'To Receive': 'success',
      'Delivered': 'secondary',
      'Cancelled': 'danger'
    };
    return statusMap[status] || 'secondary';
  }

  function openChatInModal(order) {
    currentChatOrderId = order.order_id;
    
    // Hide order list and show chat section
    const messagesList = document.getElementById('adminMessagesList');
    messagesList.style.display = 'none';
    
    // Create chat section
    const chatSection = document.createElement('div');
    chatSection.id = 'adminChatSection';
    chatSection.innerHTML = `
      <div class="mb-3 pb-3 border-bottom">
        <button type="button" class="btn btn-sm btn-outline-secondary mb-2" id="backToOrdersList">
          <i class="fas fa-arrow-left me-1"></i>Back to Orders
        </button>
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <div class="fw-bold text-pink">${escapeHtml(order.order_id)}</div>
            <div class="small text-muted">${escapeHtml(order.name)} · ${escapeHtml(order.status)}</div>
          </div>
        </div>
      </div>
      
      <div id="adminFloatingChatMessages" class="bg-light rounded p-3 mb-3" style="max-height: 400px; overflow-y: auto;">
        <div class="text-center text-muted small">
          <i class="fas fa-spinner fa-spin me-2"></i>Loading messages...
        </div>
      </div>

      <form id="adminFloatingChatForm" class="d-flex gap-2">
        <input type="text" id="adminFloatingChatInput" class="form-control" placeholder="Type your message..." required>
        <button type="submit" class="btn btn-pink">
          <i class="fas fa-paper-plane"></i>
        </button>
      </form>
    `;
    
    messagesList.parentElement.appendChild(chatSection);
    
    // Back button handler
    document.getElementById('backToOrdersList').addEventListener('click', () => {
      const section = document.getElementById('adminChatSection');
      if (section) section.remove();
      messagesList.style.display = 'block';
      currentChatOrderId = null;
      if (chatRefreshInterval) {
        clearInterval(chatRefreshInterval);
        chatRefreshInterval = null;
      }
    });
    
    // Form submit handler
    document.getElementById('adminFloatingChatForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await sendFloatingChatMessage();
    });
    
    // Load messages
    loadFloatingChatMessages();
    
    // Start auto-refresh
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(loadFloatingChatMessages, 10000);
  }

  async function loadFloatingChatMessages() {
    if (!currentChatOrderId) return;

    const messagesDiv = document.getElementById('adminFloatingChatMessages');
    if (!messagesDiv) return;

    try {
      const response = await fetch(`/api/chat/${encodeURIComponent(currentChatOrderId)}`);
      const data = await response.json();

      if (response.ok && data.messages) {
        if (data.messages.length === 0) {
          messagesDiv.innerHTML = `
            <div class="text-center text-muted small py-3 chat-empty">
              <i class="fas fa-comments me-2"></i>No messages yet. Start the conversation!
            </div>
          `;
        } else {
          const scrollAtBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop <= messagesDiv.clientHeight + 50;

          messagesDiv.innerHTML = data.messages.map((msg, index) => {
            const isAdmin = msg.sender_type === 'admin';
            const time = new Date(msg.created_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            });
            const senderName = isAdmin ? 'You' : 'Customer';
            const avatarIcon = isAdmin ? '<i class="fas fa-user-shield"></i>' : '<i class="fas fa-user"></i>';
            
            // Determine message status (for admin messages only)
            let statusHtml = '';
            if (isAdmin) {
              // For demo: mark last message as seen, second-to-last as delivered, others as sent
              const isLast = index === data.messages.length - 1;
              const isSecondLast = index === data.messages.length - 2;
              if (isLast) {
                statusHtml = '<div class="chat-status status-seen"><i class="fas fa-check-double"></i></div>';
              } else if (isSecondLast) {
                statusHtml = '<div class="chat-status status-delivered"><i class="fas fa-check-double"></i></div>';
              } else {
                statusHtml = '<div class="chat-status status-sent"><i class="fas fa-check"></i></div>';
              }
            }
            
            return `
              <div class="chat-message-wrapper ${isAdmin ? 'customer' : 'seller'}">
                <div class="chat-avatar ${isAdmin ? 'customer' : 'seller'}">${avatarIcon}</div>
                <div class="chat-message-content">
                  <div class="chat-sender-name">${senderName}</div>
                  <div class="chat-bubble ${isAdmin ? 'customer' : 'seller'}" onclick="this.classList.toggle('show-time')">
                    <div>${escapeHtml(msg.message)}</div>
                    <span class="chat-time">${time}</span>
                  </div>
                  ${statusHtml}
                </div>
              </div>
            `;
          }).join('');

          if (scrollAtBottom) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
          }
        }
      }
    } catch (error) {
    }
  }

  async function sendFloatingChatMessage() {
    if (!currentChatOrderId) return;

    const input = document.getElementById('adminFloatingChatInput');
    const form = document.getElementById('adminFloatingChatForm');
    const message = input.value.trim();
    
    if (!message) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    // optimistic append
    const messagesDiv = document.getElementById('adminFloatingChatMessages');
    const pendingId = `pending-${Date.now()}`;
    if (messagesDiv) {
      const wrapper = document.createElement('div');
      wrapper.className = 'chat-message-wrapper customer';
      wrapper.innerHTML = `
        <div class="chat-avatar customer"><i class="fas fa-user-shield"></i></div>
        <div class="chat-message-content">
          <div class="chat-sender-name">You</div>
          <div class="chat-bubble customer" data-pending="${pendingId}">
            <div>${escapeHtml(message)}</div>
          </div>
          <div class="chat-status status-sent"><i class="fas fa-spinner fa-spin"></i></div>
        </div>
      `;
      messagesDiv.appendChild(wrapper);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          order_id: currentChatOrderId,
          message: message,
          sender_type: 'admin'
        })
      });

      const result = await response.json();

      if (response.ok) {
        input.value = '';
        await loadFloatingChatMessages();
      } else {
        alertError(result.error || 'Failed to send message');
      }
    } catch (error) {
      alertError('Failed to send message. Please try again.');
    } finally {
      // remove pending bubble if present
      const pending = document.querySelector(`[data-pending="${pendingId}"]`);
      if (pending && pending.parentElement && pending.parentElement.parentElement) {
        pending.parentElement.parentElement.remove();
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  }

  async function loadChatConversation() {
    if (!currentChatOrderId) return;

    const messagesDiv = document.getElementById('adminChatConversationMessages');
    if (!messagesDiv) return;

    try {
      const response = await fetch(`/api/chat/${encodeURIComponent(currentChatOrderId)}`);
      const data = await response.json();

      if (response.ok && data.messages) {
        if (data.messages.length === 0) {
          messagesDiv.innerHTML = `
            <div class="text-center text-muted small py-3">
              <i class="fas fa-comments me-2"></i>No messages yet
            </div>
          `;
        } else {
          const scrollAtBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop <= messagesDiv.clientHeight + 50;

          messagesDiv.innerHTML = data.messages.map(msg => {
            const isAdmin = msg.sender_type === 'admin';
            const time = new Date(msg.created_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            });
            
            return `
              <div class="mb-3 ${isAdmin ? 'text-end' : ''}">
                <div class="d-inline-block ${isAdmin ? 'bg-pink text-white' : 'bg-white'} rounded px-3 py-2" style="max-width: 80%;">
                  <div class="small fw-semibold mb-1">${isAdmin ? 'You' : 'Customer'}</div>
                  <div>${escapeHtml(msg.message)}</div>
                  <div class="small opacity-75 mt-1">${time}</div>
                </div>
              </div>
            `;
          }).join('');

          if (scrollAtBottom) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
          }
        }
      }
    } catch (error) {
    }
  }

  const conversationForm = document.getElementById('adminChatConversationForm');
  if (conversationForm) {
    conversationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!currentChatOrderId) return;

      const input = document.getElementById('adminChatConversationInput');
      const message = input.value.trim();
      
      if (!message) return;

      const submitBtn = conversationForm.querySelector('button[type="submit"]');
      const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      }

      try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            order_id: currentChatOrderId,
            message: message,
            sender_type: 'admin'
          })
        });

        const result = await response.json();

        if (response.ok) {
          input.value = '';
          await loadChatConversation();
        } else {
          alertError(result.error || 'Failed to send message');
        }
      } catch (error) {
        alertError('Failed to send message. Please try again.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHtml;
        }
      }
    });
  }

  // Stop auto-refresh when modal closes
  if (messagesModal) {
    messagesModal.addEventListener('hidden.bs.modal', () => {
      if (chatRefreshInterval) {
        clearInterval(chatRefreshInterval);
        chatRefreshInterval = null;
      }
      currentChatOrderId = null;
      
      // Clean up chat section if exists
      const chatSection = document.getElementById('adminChatSection');
      if (chatSection) chatSection.remove();
      
      // Show orders list
      const messagesList = document.getElementById('adminMessagesList');
      if (messagesList) messagesList.style.display = 'block';
    });
  }

  // Refresh orders list when messages modal is shown
  if (messagesModal) {
    messagesModal.addEventListener('shown.bs.modal', () => {
      loadOrdersWithMessages();
    });
  }

  // Initial badge update
  setTimeout(loadOrdersWithMessages, 2000);

  // Periodic badge update (every 30 seconds)
  setInterval(() => {
    if (!messagesModal.classList.contains('show')) {
      loadOrdersWithMessages();
    }
  }, 30000);
})();