// Admin Reports & Transactions Management

// Global state
window.reportsOrders = [];
window.currentReportsFilter = 'all'; // 'all' | 'outside' | 'online'
window._publicProductsCache = [];
window._savedAddonsCache = [];
let _outsideItemCounter = 0;

async function loadReportsData() {
  const token = localStorage.getItem('adminToken');
  if (!token) {
    window.location.href = '/customer-login.html';
    return null;
  }
  try {
    const url = '/api/admin/reports';
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error('Failed to fetch reports');
    const data = await resp.json();
    return data;
  } catch (err) {
    console.error('loadReportsData error', err);
    if (typeof alertError === 'function') {
      alertError('Failed to load reports: ' + (err.message || err));
    }
    return null;
  }
}

function formatPHP(n) {
  try {
    const num = Number(n) || 0;
    if (typeof Intl !== 'undefined' && Intl.NumberFormat) {
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(num);
    }
    return '₱' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch (e) {
    return '₱0.00';
  }
}

function formatDateTimeLocal(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Fetch PUBLIC products catalog for the outside order builder
async function loadPublicProducts() {
  if (window._publicProductsCache && window._publicProductsCache.length) {
    return window._publicProductsCache;
  }
  try {
    const res = await fetch('/api/products');
    if (res.ok) {
      const prods = await res.json();
      window._publicProductsCache = (prods || []).filter(p => !p.is_private);
      return window._publicProductsCache;
    }
  } catch (e) {
    console.warn('Failed to fetch public products from /api/products, trying admin endpoint:', e);
    try {
      const token = localStorage.getItem('adminToken');
      const resAdmin = await fetch('/api/admin/products', { headers: { Authorization: `Bearer ${token}` } });
      if (resAdmin.ok) {
        const prods = await resAdmin.json();
        window._publicProductsCache = (prods || []).filter(p => !p.is_private);
        return window._publicProductsCache;
      }
    } catch (e2) {
      console.warn('Failed to fetch products:', e2);
    }
  }
  return [];
}

// Fetch SAVED add-ons from public products and database
async function loadSavedAddons() {
  if (window._savedAddonsCache && window._savedAddonsCache.length) {
    return window._savedAddonsCache;
  }

  const addonMap = new Map();

  // 1. Gather saved addons from public products
  const products = await loadPublicProducts();
  products.forEach(p => {
    if (Array.isArray(p.addons)) {
      p.addons.forEach(a => {
        if (!a) return;
        const name = String(a.name || a.label || (typeof a === 'string' ? a : '')).trim();
        const price = Math.max(0, parseFloat(a.price || 0) || 0);
        if (name && !addonMap.has(name.toLowerCase())) {
          addonMap.set(name.toLowerCase(), { name, price });
        }
      });
    }
  });

  // 2. Gather saved addons from custom_addons table via /api/customization/options
  try {
    const res = await fetch('/api/customization/options');
    if (res.ok) {
      const customData = await res.json();
      if (Array.isArray(customData.addons)) {
        customData.addons.forEach(a => {
          if (!a) return;
          const name = String(a.name || '').trim();
          const price = Math.max(0, parseFloat(a.price || 0) || 0);
          if (name && !addonMap.has(name.toLowerCase())) {
            addonMap.set(name.toLowerCase(), { name, price });
          }
        });
      }
    }
  } catch (err) {
    console.warn('Could not load custom_addons:', err);
  }

  window._savedAddonsCache = Array.from(addonMap.values());
  return window._savedAddonsCache;
}

// Render transactions table rows
function renderTable(orders) {
  const tbody = document.getElementById('reportsTbody');
  if (!tbody) return;

  if (!orders || !orders.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-5 text-muted">
          <div class="mb-2"><i class="fas fa-receipt fa-2x text-secondary opacity-50"></i></div>
          <div class="fw-semibold">No transactions found</div>
          <div class="small">Try adjusting your search query or filter selection.</div>
        </td>
      </tr>
    `;
    return;
  }

  const dtf = (d) => {
    try {
      return new Intl.DateTimeFormat('en-PH', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(d));
    } catch (e) {
      return new Date(d).toLocaleDateString();
    }
  };

  tbody.innerHTML = orders.map(o => {
    const isOutside = o.order_type === 'outside' || String(o.order_id || '').startsWith('OS');
    const isCustom = o.order_type === 'custom';
    const isReviewed = Boolean(o.has_reviewed);

    let idDisplay = '';

    if (isOutside) {
      // Outside orders: NO outside badge in table row as requested
      idDisplay = `<a href="#" class="reports-view text-decoration-none fw-bold font-monospace text-slate-900" data-order-id="${o.order_id || ''}" data-order-type="outside" title="Click to view details">${o.order_id || '—'}</a>`;
    } else if (isCustom) {
      idDisplay = `<a href="#" class="copy-review-link text-decoration-none fw-bold font-monospace" data-order-id="${o.order_id || ''}" title="Click to copy review link">${o.order_id || '—'}</a> <span class="badge bg-pink small ms-1">Custom</span>`;
    } else {
      idDisplay = `<a href="#" class="copy-review-link text-decoration-none fw-bold font-monospace" data-order-id="${o.order_id || ''}" title="Click to copy review link">${o.order_id || '—'}</a>`;
    }

    const reviewBtnClass = isReviewed ? 'btn-reviewed' : 'btn-remind';
    const reviewBtnTitle = isReviewed 
      ? 'Order already reviewed by customer (Click to send review email again)' 
      : 'Send Review Invitation Email';

    const hasValidEmail = o.email && !o.email.includes('@chammyflorals.local') && !o.email.includes('walkin@');
    const showReviewBtn = !isOutside || hasValidEmail;

    return `
      <tr data-order-id="${o.order_id || ''}" data-order-type="${o.order_type || 'regular'}">
        <td class="text-start">${idDisplay}</td>
        <td>
          <div class="fw-semibold text-slate-800">${o.name || 'Walk-in Customer'}</div>
          ${o.flower_type ? `<div class="small text-muted text-truncate" style="max-width: 250px;" title="${escapeHtml(o.flower_type)}">${escapeHtml(o.flower_type)}</div>` : ''}
        </td>
        <td>
          <span class="small text-muted">${o.created_at ? dtf(o.created_at) : '—'}</span>
        </td>
        <td class="text-end fw-bold text-slate-900">
          ${formatPHP(o.total_fee)}
        </td>
        <td class="actions">
          <div class="d-flex gap-2 justify-content-end align-items-center">
            <button class="btn btn-sm btn-outline-pink reports-view" data-order-id="${o.order_id || ''}" data-order-type="${o.order_type || 'regular'}" title="View Details">
              <i class="fas fa-eye me-1"></i>View
            </button>
            ${showReviewBtn ? `
              <button class="btn btn-sm ${reviewBtnClass} reports-review-btn" data-order-id="${o.order_id || ''}" data-order-type="${o.order_type || 'regular'}" title="${reviewBtnTitle}">
                <i class="fas fa-star me-1"></i>
              </button>
            ` : ''}
            <button class="btn btn-sm btn-outline-danger reports-delete" data-order-id="${o.order_id || ''}" data-order-type="${o.order_type || 'regular'}" title="Delete Transaction">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Wire Review Buttons
  document.querySelectorAll('.reports-review-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.orderId;
      const orderType = e.currentTarget.dataset.orderType || 'regular';
      openSendReviewModal(id, orderType);
    });
  });

  // Wire Delete Buttons
  document.querySelectorAll('.reports-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.orderId;
      const orderType = e.currentTarget.dataset.orderType || 'regular';
      const confirmBtn = document.getElementById('confirmDeleteButton');
      if (confirmBtn) {
        confirmBtn.dataset.orderId = id;
        confirmBtn.dataset.orderType = orderType;
      }
      const confirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
      confirmModal.show();
    });
  });

  // Wire Copy Review Link
  document.querySelectorAll('.copy-review-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = e.currentTarget.dataset.orderId;
      if (!id) return;
      const reviewUrl = window.location.origin + '/reviews.html?orderId=' + encodeURIComponent(id);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(reviewUrl).then(() => {
          if (typeof window.alertSuccess === 'function') {
            window.alertSuccess('Review link copied to clipboard!');
          } else {
            alert('Review link copied to clipboard:\n' + reviewUrl);
          }
        }).catch(err => {
          alert('Review link:\n' + reviewUrl);
        });
      } else {
        alert('Review link:\n' + reviewUrl);
      }
    });
  });

  // Wire View Details Button & Clickable Order IDs
  document.querySelectorAll('.reports-view').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const id = e.currentTarget.dataset.orderId;
      const orderType = e.currentTarget.dataset.orderType || 'regular';
      if (!id) return;

      openOrderDetailsModal(id, orderType);
    });
  });
}

// Populate and show the order details modal
async function openOrderDetailsModal(id, orderType = 'regular') {
  const modalEl = document.getElementById('reportOrderModal');
  if (!modalEl) return;
  const modal = new bootstrap.Modal(modalEl);

  // 1. Immediately check local cache for instant render
  const localOrder = (window.reportsOrders || []).find(o => String(o.order_id) === String(id));
  if (localOrder) {
    populateModalFields(localOrder, orderType);
  } else {
    // Initial placeholder state
    document.getElementById('reportOrderId').value = id;
    document.getElementById('reportName').value = 'Loading...';
    document.getElementById('reportEmail').value = '';
    document.getElementById('reportFlowerType').value = '';
    document.getElementById('reportQuantity').value = '';
    document.getElementById('reportRush').value = 'No';
    document.getElementById('reportAddons').value = '';
    document.getElementById('reportMessage').value = '';
    document.getElementById('reportTotalFee').value = '';
    document.getElementById('reportPaymentMethod').value = '';
    document.getElementById('reportStatus').value = 'Delivered';
  }

  modal.show();

  // 2. Fetch latest order data from backend
  try {
    const token = localStorage.getItem('adminToken');
    const endpoint = orderType === 'custom'
      ? `/api/admin/orders/custom/${encodeURIComponent(id)}`
      : `/api/admin/orders/${encodeURIComponent(id)}`;

    const resp = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.ok) {
      const serverOrder = await resp.json();
      populateModalFields(serverOrder, orderType);
    }
  } catch (err) {
    console.warn('Background order fetch error, kept local view:', err);
  }
}

// Populate modal form elements with order data
function populateModalFields(order, orderType = 'regular') {
  const id = order.order_id || '';
  const isOutside = order.order_type === 'outside' || orderType === 'outside' || String(id).startsWith('OS');
  const isCustom = orderType === 'custom' || order.order_type === 'custom';

  document.getElementById('reportOrderId').value = id;
  document.getElementById('reportName').value = order.name || 'Walk-in Customer';

  // Badge in modal header
  const badgeEl = document.getElementById('reportOrderBadge');
  if (badgeEl) {
    if (isOutside) {
      badgeEl.innerHTML = '';
    } else if (isCustom) {
      badgeEl.innerHTML = `<span class="badge bg-pink ms-2">Custom Bouquet</span>`;
    } else {
      badgeEl.innerHTML = `<span class="badge bg-secondary-subtle text-dark ms-2">Online Order</span>`;
    }
  }

  // Email / contact formatting
  const isDummyEmail = !order.email || order.email.includes('@chammyflorals.local') || order.email.includes('walkin@');
  const emailEl = document.getElementById('reportEmail');
  if (emailEl) {
    emailEl.value = isDummyEmail 
      ? (isOutside ? 'Walk-in / Direct Sale (No Email)' : 'None') 
      : order.email;
  }

  // Send review email button visibility
  const sendReviewBtn = document.getElementById('reportModalSendReviewBtn');
  if (sendReviewBtn) {
    sendReviewBtn.style.display = (isOutside && isDummyEmail) ? 'none' : '';
  }

  // Parse items safely
  let itemsList = order.items;
  if (typeof itemsList === 'string') {
    try { itemsList = JSON.parse(itemsList); } catch (e) { itemsList = []; }
  }

  // Parse addons safely
  let addonsList = order.addons;
  if (typeof addonsList === 'string') {
    try { addonsList = JSON.parse(addonsList); } catch (e) { addonsList = order.addons; }
  }

  const breakdownBox = document.getElementById('reportItemsBreakdownContainer');
  const breakdownList = document.getElementById('reportItemsBreakdownList');

  if (isCustom) {
    if (breakdownBox) breakdownBox.style.display = 'none';

    let itemsText = [];
    if (order.stems && Array.isArray(order.stems) && order.stems.length) {
      itemsText.push('Stems: ' + order.stems.map(s => s.name).join(', '));
    }
    if (order.fillers && Array.isArray(order.fillers) && order.fillers.length) {
      itemsText.push('Fillers: ' + order.fillers.map(f => f.name).join(', '));
    }
    if (order.wrapping && Array.isArray(order.wrapping) && order.wrapping.length) {
      itemsText.push('Wrapping: ' + order.wrapping.map(w => w.name).join(', '));
    }
    document.getElementById('reportFlowerType').value = itemsText.join(' | ') || 'Custom Bouquet';
    document.getElementById('reportQuantity').value = '1';

    if (addonsList && Array.isArray(addonsList) && addonsList.length) {
      document.getElementById('reportAddons').value = addonsList.map(a => a.name || a.label || a).join(', ');
    } else {
      document.getElementById('reportAddons').value = '';
    }
    document.getElementById('reportMessage').value = order.special_instructions || order.message || '';
  } else if (isOutside) {
    // Outside Order Details
    document.getElementById('reportFlowerType').value = order.flower_type || 'Outside Sold Product';
    document.getElementById('reportQuantity').value = order.quantity || '1';

    // Format itemized items breakdown table
    if (Array.isArray(itemsList) && itemsList.length > 0) {
      if (breakdownBox && breakdownList) {
        breakdownBox.style.display = '';
        breakdownList.innerHTML = `
          <div class="table-responsive">
            <table class="table table-sm table-bordered mb-0 bg-white align-middle">
              <thead class="table-light">
                <tr>
                  <th class="small py-1">Item / Product</th>
                  <th class="small py-1">Color / Option</th>
                  <th class="small py-1 text-center" style="width: 60px;">Qty</th>
                  <th class="small py-1 text-end" style="width: 100px;">Price</th>
                  <th class="small py-1 text-end" style="width: 110px;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsList.map(it => {
                  const flower = escapeHtml(it.flower_type || it.flower || it.name || 'Item');
                  const colorStr = it.color ? escapeHtml(it.color.name || it.color.value || it.color) : 'Standard';
                  const qty = it.quantity || it.qty || 1;
                  const price = it.price != null ? Number(it.price) : 0;
                  const subtotal = it.subtotal != null ? Number(it.subtotal) : (qty * price);
                  return `
                    <tr>
                      <td class="fw-semibold text-slate-800">${flower}</td>
                      <td><span class="badge bg-light text-dark border">${colorStr}</span></td>
                      <td class="text-center">${qty}</td>
                      <td class="text-end text-muted">${formatPHP(price)}</td>
                      <td class="text-end fw-bold text-dark">${formatPHP(subtotal)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    } else {
      if (breakdownBox) breakdownBox.style.display = 'none';
    }

    // Format addons
    if (addonsList) {
      if (Array.isArray(addonsList)) {
        document.getElementById('reportAddons').value = addonsList.map(a => {
          if (typeof a === 'object' && a !== null) {
            const aName = a.name || a.label || '';
            const aPrice = a.price != null ? ` (₱${Number(a.price).toLocaleString()})` : '';
            return `${aName}${aPrice}`;
          }
          return String(a);
        }).join(', ');
      } else {
        document.getElementById('reportAddons').value = String(addonsList);
      }
    } else {
      document.getElementById('reportAddons').value = '';
    }

    document.getElementById('reportMessage').value = order.message || order.notes || '';
  } else {
    // Regular online order
    if (breakdownBox) breakdownBox.style.display = 'none';
    document.getElementById('reportFlowerType').value = Array.isArray(order.flower_type) ? order.flower_type.join(', ') : (order.flower_type || '');
    document.getElementById('reportQuantity').value = order.quantity || '';
    try {
      document.getElementById('reportAddons').value = addonsList ? (typeof addonsList === 'string' ? addonsList : JSON.stringify(addonsList)) : '';
    } catch (e) {
      document.getElementById('reportAddons').value = '';
    }
    document.getElementById('reportMessage').value = order.message || '';
  }

  document.getElementById('reportRush').value = order.rush || 'No';
  document.getElementById('reportTotalFee').value = formatPHP(order.total_fee || 0);
  document.getElementById('reportPaymentMethod').value = order.payment_method || 'Cash';
  document.getElementById('reportStatus').value = order.status || 'Delivered';
}

// Pagination logic
function renderPage(orders, page = 1, pageSize = 10) {
  const total = orders.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * pageSize;
  const chunk = orders.slice(start, start + pageSize);
  renderTable(chunk);

  const pager = document.getElementById('reportsPagination');
  if (pager) {
    let html = `<li class="page-item ${p === 1 ? 'disabled' : ''}"><button class="page-link" data-page="${p - 1}" aria-label="Previous">&laquo;</button></li>`;
    const visible = 5;
    const startPage = Math.max(1, Math.min(p - Math.floor(visible / 2), pages - visible + 1));
    const endPage = Math.min(pages, startPage + visible - 1);
    for (let i = startPage; i <= endPage; i++) {
      html += `<li class="page-item ${i === p ? 'active' : ''}"><button class="page-link" data-page="${i}">${i}</button></li>`;
    }
    html += `<li class="page-item ${p === pages ? 'disabled' : ''}"><button class="page-link" data-page="${p + 1}" aria-label="Next">&raquo;</button></li>`;
    pager.innerHTML = html;
    pager.querySelectorAll('.page-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = Number(e.currentTarget.dataset.page || p);
        if (!isNaN(target) && target >= 1 && target <= pages) renderPage(orders, target, pageSize);
      });
    });
  }
}

// Apply filter buttons (All / Outside / Online) and search query
function applyReportsFilterAndSearch(targetPage = 1) {
  const orders = window.reportsOrders || [];
  const searchInput = document.getElementById('reportsSearch');
  const pageSizeSelect = document.getElementById('reportsPageSize');
  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const currentFilter = window.currentReportsFilter || 'all';

  // 1. Calculate overall counts & amounts
  const allCount = orders.length;
  const outsideOrders = orders.filter(o => o.order_type === 'outside' || String(o.order_id || '').startsWith('OS'));
  const onlineOrders = orders.filter(o => o.order_type !== 'outside' && !String(o.order_id || '').startsWith('OS'));

  const outsideCount = outsideOrders.length;
  const onlineCount = onlineOrders.length;

  let outsideTotal = 0;
  for (const o of outsideOrders) outsideTotal += Number(o.total_fee) || 0;

  let onlineTotal = 0;
  for (const o of onlineOrders) onlineTotal += Number(o.total_fee) || 0;

  const grandTotal = outsideTotal + onlineTotal;

  // Update KPI card elements
  const totalRevEl = document.getElementById('totalRevenue');
  if (totalRevEl) totalRevEl.textContent = formatPHP(grandTotal);

  const outsideRevEl = document.getElementById('outsideRevenue');
  if (outsideRevEl) outsideRevEl.textContent = formatPHP(outsideTotal);

  const onlineRevEl = document.getElementById('onlineRevenue');
  if (onlineRevEl) onlineRevEl.textContent = formatPHP(onlineTotal);

  const totalTxEl = document.getElementById('totalTransactions');
  if (totalTxEl) totalTxEl.textContent = String(allCount);

  const subtextEl = document.getElementById('transactionsSubtext');
  if (subtextEl) subtextEl.textContent = `${onlineCount} online • ${outsideCount} outside`;

  // Update filter pill counts
  const countAllEl = document.getElementById('filterCountAll');
  if (countAllEl) countAllEl.textContent = String(allCount);

  const countOutsideEl = document.getElementById('filterCountOutside');
  if (countOutsideEl) countOutsideEl.textContent = String(outsideCount);

  const countOnlineEl = document.getElementById('filterCountOnline');
  if (countOnlineEl) countOnlineEl.textContent = String(onlineCount);

  // Update filter pill button active styling
  document.querySelectorAll('#reportsFilterGroup button').forEach(btn => {
    if (btn.dataset.filter === currentFilter) {
      btn.classList.add('active', 'btn-white');
      btn.classList.remove('btn-transparent');
    } else {
      btn.classList.remove('active', 'btn-white');
      btn.classList.add('btn-transparent');
    }
  });

  // 2. Filter dataset by current filter
  let filtered = orders;
  if (currentFilter === 'outside') {
    filtered = outsideOrders;
  } else if (currentFilter === 'online') {
    filtered = onlineOrders;
  }

  // 3. Search query filter
  if (query) {
    filtered = filtered.filter(o => {
      const idMatch = String(o.order_id || '').toLowerCase().includes(query);
      const nameMatch = String(o.name || '').toLowerCase().includes(query);
      const flowerMatch = String(o.flower_type || '').toLowerCase().includes(query);
      const msgMatch = String(o.message || '').toLowerCase().includes(query);
      return idMatch || nameMatch || flowerMatch || msgMatch;
    });
  }

  const pageSize = pageSizeSelect ? Number(pageSizeSelect.value) || 10 : 10;
  renderPage(filtered, targetPage, pageSize);
}

// Escape HTML utility
function escapeHtml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -------------------------------------------------------------
// ITEMIZED ORDER BUILDER FOR OUTSIDE SALES
// -------------------------------------------------------------

function createOutsideItemRow(index) {
  const row = document.createElement('div');
  row.className = 'item-builder-row';
  row.dataset.rowIndex = index;
  row.innerHTML = `
    <div class="row g-2 align-items-center">
      <div class="col-md-5">
        <label class="small text-muted mb-1 d-block fw-semibold">Public Catalog Product</label>
        <select class="form-select form-select-sm item-product-select" required>
          <option value="">Select a Product</option>
          <option value="__custom__">✨ Custom Item (Unlisted)</option>
        </select>
        <input type="text" class="form-control form-control-sm item-custom-name mt-1" style="display: none;" placeholder="Enter item name">
      </div>

      <div class="col-md-3 col-6">
        <label class="small text-muted mb-1 d-block fw-semibold">Color / Style</label>
        <select class="form-select form-select-sm item-color-select">
          <option value="">Default / Standard</option>
        </select>
      </div>

      <div class="col-md-2 col-6">
        <label class="small text-muted mb-1 d-block fw-semibold">Qty</label>
        <input type="number" min="1" value="1" class="form-control form-control-sm text-center item-qty-input" required>
      </div>

      <div class="col-md-2 col-12">
        <label class="small text-muted mb-1 d-block fw-semibold">Price (₱)</label>
        <div class="input-group input-group-sm">
          <input type="number" min="0" step="0.01" class="form-control form-control-sm item-price-input" placeholder="0.00" required>
          <button type="button" class="btn btn-outline-danger item-remove-btn" title="Remove item">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  // Populate public products
  populateProductSelect(row.querySelector('.item-product-select'));

  // Wire events
  const prodSelect = row.querySelector('.item-product-select');
  const customNameInput = row.querySelector('.item-custom-name');
  const colorSelect = row.querySelector('.item-color-select');
  const qtyInput = row.querySelector('.item-qty-input');
  const priceInput = row.querySelector('.item-price-input');
  const removeBtn = row.querySelector('.item-remove-btn');

  prodSelect.addEventListener('change', () => {
    const isCustom = prodSelect.value === '__custom__';
    customNameInput.style.display = isCustom ? '' : 'none';
    if (isCustom) {
      customNameInput.required = true;
      priceInput.value = '';
      colorSelect.innerHTML = '<option value="">Default / Standard</option>';
    } else {
      customNameInput.required = false;
      const opt = prodSelect.selectedOptions && prodSelect.selectedOptions[0];
      if (opt && opt.dataset.price) {
        priceInput.value = Number(opt.dataset.price) || 0;
      }
      populateColorsForProduct(row, opt ? opt.dataset.productId : null);
    }
    recalculateOutsideOrderTotals();
  });

  qtyInput.addEventListener('input', recalculateOutsideOrderTotals);
  priceInput.addEventListener('input', recalculateOutsideOrderTotals);

  removeBtn.addEventListener('click', () => {
    const container = document.getElementById('outsideItemsContainer');
    if (container && container.children.length > 1) {
      row.remove();
      recalculateOutsideOrderTotals();
    } else {
      if (typeof alertWarning === 'function') alertWarning('At least one item is required in the order');
    }
  });

  return row;
}

function populateProductSelect(selectEl) {
  if (!selectEl) return;
  const products = window._publicProductsCache || [];

  selectEl.innerHTML = `
    <option value="">Select a Product</option>
    <option value="__custom__">✨ Custom Item (Unlisted)</option>
  `;

  const groups = {};
  products.forEach(p => {
    const cat = (p.category && String(p.category).trim()) || 'Catalog Products';
    if (!groups[cat]) groups[cat] = [];

    if (Array.isArray(p.pricing) && p.pricing.length) {
      p.pricing.forEach(tier => {
        const label = String(tier.label || tier.set || p.name).trim();
        const price = Number(tier.price) || 0;
        groups[cat].push({
          productId: p.id,
          name: `${p.name} - ${label}`,
          price: price,
          flowerType: `${p.name} (${label})`
        });
      });
    } else {
      groups[cat].push({
        productId: p.id,
        name: p.name,
        price: 0,
        flowerType: p.name
      });
    }
  });

  Object.keys(groups).sort().forEach(cat => {
    const og = document.createElement('optgroup');
    og.label = cat;
    groups[cat].forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.flowerType;
      opt.textContent = `${item.name} (₱${item.price.toLocaleString()})`;
      opt.dataset.price = item.price;
      opt.dataset.productId = item.productId;
      og.appendChild(opt);
    });
    selectEl.appendChild(og);
  });
}

function populateColorsForProduct(row, productId) {
  const colorSelect = row.querySelector('.item-color-select');
  if (!colorSelect) return;
  colorSelect.innerHTML = '<option value="">Default / Standard</option>';
  if (!productId) return;

  const prod = (window._publicProductsCache || []).find(p => String(p.id) === String(productId));
  if (!prod || !Array.isArray(prod.colors) || !prod.colors.length) return;

  prod.colors.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.value || c.name || '';
    opt.textContent = c.name ? `● ${c.name}` : (c.value || 'Color');
    opt.dataset.colorName = c.name || '';
    opt.dataset.colorValue = c.value || '';
    if (c.value) opt.style.color = c.value;
    colorSelect.appendChild(opt);
  });
}

// Render SAVED add-ons from catalog into the checkboxes grid
async function renderSavedAddonsGrid() {
  const grid = document.getElementById('outsideAddonsGrid');
  if (!grid) return;

  const addons = await loadSavedAddons();

  if (!addons || !addons.length) {
    grid.innerHTML = `
      <div class="col-12 text-muted small py-2 text-center">
        <i class="fas fa-info-circle me-1"></i>No saved add-ons found in catalog.
      </div>
    `;
    return;
  }

  grid.innerHTML = addons.map((a, idx) => {
    const id = `saved_addon_${idx}`;
    return `
      <div class="col-sm-6 col-md-4">
        <input class="d-none addon-card-check outside-addon-check" type="checkbox" id="${id}" data-name="${escapeHtml(a.name)}" data-price="${a.price}">
        <label class="addon-card-label d-flex align-items-center justify-content-between h-100 w-100" for="${id}">
          <div class="d-flex align-items-center gap-2">
            <i class="fas fa-check-circle text-pink opacity-50 check-icon"></i>
            <span class="small fw-semibold text-slate-800">${escapeHtml(a.name)}</span>
          </div>
          <span class="badge bg-light text-purple border" style="color: #7c3aed;">₱${a.price}</span>
        </label>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.outside-addon-check').forEach(chk => {
    chk.addEventListener('change', recalculateOutsideOrderTotals);
  });
}

function recalculateOutsideOrderTotals() {
  let itemsSubtotal = 0;
  const container = document.getElementById('outsideItemsContainer');
  if (container) {
    container.querySelectorAll('.item-builder-row').forEach(row => {
      const qty = Math.max(1, parseInt(row.querySelector('.item-qty-input')?.value, 10) || 1);
      const price = Math.max(0, parseFloat(row.querySelector('.item-price-input')?.value) || 0);
      itemsSubtotal += (qty * price);
    });
  }

  let addonsSubtotal = 0;
  document.querySelectorAll('.outside-addon-check:checked').forEach(chk => {
    addonsSubtotal += Math.max(0, parseFloat(chk.dataset.price) || 0);
  });

  const grandTotal = itemsSubtotal + addonsSubtotal;

  const itemsTotalEl = document.getElementById('summaryItemsTotal');
  if (itemsTotalEl) itemsTotalEl.textContent = formatPHP(itemsSubtotal);

  const addonsTotalEl = document.getElementById('summaryAddonsTotal');
  if (addonsTotalEl) addonsTotalEl.textContent = formatPHP(addonsSubtotal);

  const grandTotalEl = document.getElementById('summaryGrandTotal');
  if (grandTotalEl) grandTotalEl.textContent = formatPHP(grandTotal);
}

// -------------------------------------------------------------
// PAGE INITIALIZATION
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  // Load initial reports data
  const data = await loadReportsData();
  if (data) {
    window.reportsOrders = (data.orders || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    applyReportsFilterAndSearch(1);
  }

  // Load PUBLIC products & SAVED add-ons
  Promise.all([loadPublicProducts(), renderSavedAddonsGrid()]).then(() => {
    const container = document.getElementById('outsideItemsContainer');
    if (container && container.children.length === 0) {
      container.appendChild(createOutsideItemRow(_outsideItemCounter++));
    }
  });

  // Wire filter pill buttons
  document.querySelectorAll('#reportsFilterGroup button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      window.currentReportsFilter = e.currentTarget.dataset.filter || 'all';
      applyReportsFilterAndSearch(1);
    });
  });

  // Wire KPI card clicks as filter shortcuts
  const kpiOutsideCard = document.getElementById('kpiOutsideCard');
  if (kpiOutsideCard) {
    kpiOutsideCard.addEventListener('click', () => {
      window.currentReportsFilter = window.currentReportsFilter === 'outside' ? 'all' : 'outside';
      applyReportsFilterAndSearch(1);
    });
  }

  const kpiOnlineCard = document.getElementById('kpiOnlineCard');
  if (kpiOnlineCard) {
    kpiOnlineCard.addEventListener('click', () => {
      window.currentReportsFilter = window.currentReportsFilter === 'online' ? 'all' : 'online';
      applyReportsFilterAndSearch(1);
    });
  }

  // Wire search input
  const search = document.getElementById('reportsSearch');
  if (search) {
    search.addEventListener('input', () => {
      applyReportsFilterAndSearch(1);
    });
  }

  // Wire page size selector
  const pageSizeSelect = document.getElementById('reportsPageSize');
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', () => {
      applyReportsFilterAndSearch(1);
    });
  }

  // Wire Add Another Item button in Itemized builder
  const addItemBtn = document.getElementById('addOutsideItemBtn');
  if (addItemBtn) {
    addItemBtn.addEventListener('click', () => {
      const container = document.getElementById('outsideItemsContainer');
      if (container) {
        container.appendChild(createOutsideItemRow(_outsideItemCounter++));
      }
    });
  }

  // Set default datetime when modal opens
  const outsideModalEl = document.getElementById('outsideSaleModal');
  if (outsideModalEl) {
    outsideModalEl.addEventListener('show.bs.modal', () => {
      const nowStr = formatDateTimeLocal();
      const itemizedDate = document.getElementById('itemizedSaleDate');
      if (itemizedDate && !itemizedDate.value) itemizedDate.value = nowStr;

      // Ensure at least one item row exists in itemized builder
      const container = document.getElementById('outsideItemsContainer');
      if (container && container.children.length === 0) {
        container.appendChild(createOutsideItemRow(_outsideItemCounter++));
      }
    });
  }

  // -------------------------------------------------------------
  // SUBMIT HANDLER: ITEMIZED ORDER BUILDER
  // -------------------------------------------------------------
  const itemizedForm = document.getElementById('itemizedOrderForm');
  if (itemizedForm) {
    itemizedForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const customerName = (document.getElementById('itemizedCustomerName')?.value || '').trim();
      if (!customerName) {
        if (typeof alertWarning === 'function') alertWarning('Please enter the customer name');
        return;
      }

      // Collect items
      const items = [];
      const itemRows = document.querySelectorAll('#outsideItemsContainer .item-builder-row');
      itemRows.forEach(row => {
        const select = row.querySelector('.item-product-select');
        const customInput = row.querySelector('.item-custom-name');
        const colorSelect = row.querySelector('.item-color-select');
        const qtyInput = row.querySelector('.item-qty-input');
        const priceInput = row.querySelector('.item-price-input');

        let flowerName = '';
        if (select && select.value === '__custom__') {
          flowerName = (customInput ? customInput.value : '').trim();
        } else if (select) {
          flowerName = select.value;
        }

        const qty = Math.max(1, parseInt(qtyInput ? qtyInput.value : 1, 10) || 1);
        const price = Math.max(0, parseFloat(priceInput ? priceInput.value : 0) || 0);

        if (flowerName) {
          const itemObj = {
            flower_type: flowerName,
            quantity: qty,
            price: price,
            subtotal: qty * price
          };

          if (colorSelect && colorSelect.value) {
            const opt = colorSelect.selectedOptions && colorSelect.selectedOptions[0];
            itemObj.color = {
              name: opt ? (opt.dataset.colorName || opt.textContent) : colorSelect.value,
              value: opt ? opt.dataset.colorValue || colorSelect.value : colorSelect.value
            };
          }

          items.push(itemObj);
        }
      });

      if (!items.length) {
        if (typeof alertWarning === 'function') alertWarning('Please add at least one valid item to the order');
        return;
      }

      // Collect add-ons
      const addons = [];
      document.querySelectorAll('.outside-addon-check:checked').forEach(chk => {
        addons.push({
          name: chk.dataset.name,
          price: parseFloat(chk.dataset.price) || 0
        });
      });

      const submitBtn = document.getElementById('submitItemizedOrderBtn');
      const originalHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Submitting...';
      }

      const payload = {
        revenue_type: 'itemized',
        customer_name: customerName,
        customer_email: (document.getElementById('itemizedCustomerContact')?.value || '').trim(),
        items: items,
        addons: addons,
        payment_method: document.getElementById('itemizedPaymentMethod')?.value || 'Cash',
        created_at: document.getElementById('itemizedSaleDate')?.value || new Date().toISOString(),
        notes: (document.getElementById('itemizedNotes')?.value || '').trim()
      };

      try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch('/api/admin/outside-sales', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || result.details || 'Failed to submit outside order');

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('outsideSaleModal'));
        if (modal) modal.hide();

        if (typeof alertSuccess === 'function') {
          alertSuccess(`Outside order for ${customerName} processed successfully!`);
        }

        // Reset itemized form
        itemizedForm.reset();
        const container = document.getElementById('outsideItemsContainer');
        if (container) {
          container.innerHTML = '';
          container.appendChild(createOutsideItemRow(_outsideItemCounter++));
        }
        recalculateOutsideOrderTotals();

        // Refresh reports data and switch to 'outside' filter
        window.currentReportsFilter = 'outside';
        const refreshed = await loadReportsData();
        if (refreshed) {
          window.reportsOrders = (refreshed.orders || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          applyReportsFilterAndSearch(1);
        }
      } catch (err) {
        console.error('Itemized order error:', err);
        if (typeof alertError === 'function') alertError(err.message || 'Error submitting outside order');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalHtml;
        }
      }
    });
  }

  // Confirm delete handler (shared modal)
  const confirmBtn = document.getElementById('confirmDeleteButton');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async (e) => {
      const id = e.target.dataset.orderId;
      const orderType = e.target.dataset.orderType || 'regular';
      if (!id) return;
      try {
        const token = localStorage.getItem('adminToken');
        const endpoint = orderType === 'custom'
          ? `/api/admin/orders/custom/${encodeURIComponent(id)}`
          : `/api/admin/orders/${encodeURIComponent(id)}`;

        const resp = await fetch(endpoint, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Failed to delete transaction');

        const mdl = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
        if (mdl) mdl.hide();

        // Refresh data
        const newData = await loadReportsData();
        if (newData) {
          window.reportsOrders = (newData.orders || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          applyReportsFilterAndSearch(1);
        }
        if (typeof alertSuccess === 'function') alertSuccess('Transaction deleted successfully');
      } catch (err) {
        if (typeof alertError === 'function') alertError('Failed to delete: ' + (err.message || err));
      }
    });
  }

  // Modal open/populate and save logic for external callers
  window.openReportModal = function (order) {
    if (order && order.order_id) {
      openOrderDetailsModal(order.order_id, order.order_type || 'regular');
    }
  };

  // Wire Send Review button inside details modal
  const modalReviewBtn = document.getElementById('reportModalSendReviewBtn');
  if (modalReviewBtn) {
    modalReviewBtn.addEventListener('click', () => {
      const id = document.getElementById('reportOrderId')?.value;
      if (!id) return;
      const currentModal = bootstrap.Modal.getInstance(document.getElementById('reportOrderModal'));
      if (currentModal) currentModal.hide();
      const order = (window.reportsOrders || []).find(o => String(o.order_id) === String(id));
      openSendReviewModal(id, order?.order_type || 'regular');
    });
  }
});

// -------------------------------------------------------------
// REVIEW MODAL
// -------------------------------------------------------------
async function openSendReviewModal(orderId, orderType = 'regular') {
  if (!orderId) return;

  let order = (window.reportsOrders || []).find(o => String(o.order_id) === String(orderId));

  if (!order || !order.email) {
    try {
      const token = localStorage.getItem('adminToken');
      const endpoint = orderType === 'custom'
        ? `/api/admin/orders/custom/${encodeURIComponent(orderId)}`
        : `/api/admin/orders/${encodeURIComponent(orderId)}`;
      const resp = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const fetched = await resp.json();
        order = { ...order, ...fetched };
      }
    } catch (e) {
      console.warn('Could not fetch order details for review modal:', e);
    }
  }

  document.getElementById('reviewOrderId').textContent = order?.order_id || orderId;
  document.getElementById('reviewCustomerName').textContent = order?.name || 'Customer';

  const statusBadge = document.getElementById('reviewStatusBadge');
  if (statusBadge) {
    if (order?.has_reviewed) {
      statusBadge.className = 'badge bg-success';
      statusBadge.innerHTML = '<i class="fas fa-check-circle me-1"></i>Reviewed';
    } else {
      statusBadge.className = 'badge bg-warning text-dark';
      statusBadge.innerHTML = '<i class="fas fa-clock me-1"></i>Pending Review';
    }
  }

  const emailInput = document.getElementById('reviewCustomerEmail');
  if (emailInput) {
    emailInput.value = order?.email || '';
  }

  const reviewUrl = window.location.origin + '/reviews.html?orderId=' + encodeURIComponent(orderId);
  const urlInput = document.getElementById('reviewPageUrl');
  if (urlInput) {
    urlInput.value = reviewUrl;
  }

  const copyBtn = document.getElementById('copyReviewUrlBtn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(reviewUrl).then(() => {
          if (typeof alertSuccess === 'function') alertSuccess('Review link copied!');
          else alert('Copied: ' + reviewUrl);
        });
      } else {
        alert('Review URL: ' + reviewUrl);
      }
    };
  }

  const customMsgInput = document.getElementById('reviewCustomMessage');
  if (customMsgInput) customMsgInput.value = '';

  document.getElementById('reviewOrderType').value = orderType;

  const reviewModal = new bootstrap.Modal(document.getElementById('sendReviewModal'));

  const form = document.getElementById('sendReviewForm');
  const handleSubmit = async (e) => {
    e.preventDefault();

    const recipientEmail = (document.getElementById('reviewCustomerEmail')?.value || '').trim();
    const customMessage = (document.getElementById('reviewCustomMessage')?.value || '').trim();

    if (!recipientEmail) {
      if (typeof alertError === 'function') alertError('Please enter a recipient email address');
      return;
    }

    const submitBtn = document.getElementById('sendReviewSubmitBtn');
    const originalHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Sending Email...';

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/send-review-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          recipientEmail,
          customMessage: customMessage || undefined,
          reviewLink: reviewUrl
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to send review invitation email');
      }

      reviewModal.hide();
      if (typeof alertSuccess === 'function') {
        alertSuccess(result.message || `Review invitation email successfully sent to ${recipientEmail}`);
      }
    } catch (err) {
      console.error('Failed to send review invitation email:', err);
      if (typeof alertError === 'function') alertError(err.message || 'Error sending review invitation email');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
      form.removeEventListener('submit', handleSubmit);
    }
  };

  form.addEventListener('submit', handleSubmit);

  document.getElementById('sendReviewModal').addEventListener('hidden.bs.modal', () => {
    form.removeEventListener('submit', handleSubmit);
  }, { once: true });

  reviewModal.show();
}
