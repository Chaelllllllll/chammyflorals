// admin-todo.js - simple To Do orders viewer (requires admin token in localStorage)
(async function(){
  const token = localStorage.getItem('adminToken');
  if (!token) return window.location.href = '/admin/login.html';

  const todoTable = document.getElementById('todoTable');
  const sortSelect = document.getElementById('sortSelect');
  const todoSearch = document.getElementById('todoSearch');
  const statusFilter = document.getElementById('statusFilter');
  const refreshBtn = document.getElementById('refreshTodo');
  const todoCountEl = document.getElementById('todoCount');
  const logoutButton = document.getElementById('logoutButton');
  const orderDetailsModalEl = document.getElementById('orderDetailsModal');
  const detailsModal = orderDetailsModalEl ? new bootstrap.Modal(orderDetailsModalEl) : null;
  const orderDetailsContent = document.getElementById('orderDetailsContent');

  logoutButton?.addEventListener('click', () => { localStorage.removeItem('adminToken'); window.location.href = '/admin/login.html'; });

  function formatColor(c) {
    try {
      if (c == null) return '';
      if (typeof c === 'string') return c;
      if (typeof c === 'object') return c.name || c.label || c.value || (c.toString && c.toString()) || '';
      return String(c);
    } catch (e) { return ''; }
  }

  function renderItems(items) {
    if (!Array.isArray(items) || !items.length) return '<div class="text-muted">(no items)</div>';
    return items.map(it => {
      const name = it.name || it.flower_type || 'Item';
      const colorRaw = it.color || it.color_name || it.colorType || '';
      const color = formatColor(colorRaw);
      const colorPart = color ? ` <span class="badge bg-light text-dark" title="${escapeHtml(color)}">` +
        (color ? `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${escapeHtml(color)};margin-right:6px;vertical-align:middle;"></span>` : '') +
        `${escapeHtml(color)}</span>` : '';
      return `<div>${escapeHtml(name)}${colorPart}${it.quantity ? ` <small class="text-muted">×${escapeHtml(String(it.quantity))}</small>` : ''}</div>`;
    }).join('');
  }

  // small HTML-escape helper
  function escapeHtml(str){ return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

  // Helper to safely parse JSONB fields that might be strings or already objects
  function safeParseArray(field) {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    if (typeof field === 'string') {
      try {
        const parsed = JSON.parse(field);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.warn('Failed to parse field:', field, e);
        return [];
      }
    }
    if (typeof field === 'object') return [field];
    return [];
  }

  // Robust datetime formatter: accepts numbers (seconds or ms) or ISO strings
  function formatDateTime(v) {
    if (v == null) return '';
    try {
      let d;
      if (typeof v === 'number') {
        // guess seconds vs milliseconds
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
  let _lastData = null;
  let _debounceTimer = null;

  function setLoading() {
    todoTable.innerHTML = '<tr><td colspan="6" class="text-center py-4"><div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div> Loading…</td></tr>';
  }

  async function loadOrders(){
    setLoading();
    try {
      const resp = await fetch('/api/admin/orders', { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error('Failed to fetch orders');
      const data = await resp.json();
      _lastData = Array.isArray(data) ? data : [];
      // expect data to be array of orders
      if (!Array.isArray(data)) return todoTable.innerHTML = '<tr><td colspan="6">No orders</td></tr>';

      // filter: "to-do" orders — by default include Pending and Processing statuses
      let todos = data.filter(o => {
        const s = String(o.status||'').toLowerCase();
        // Exclude "to receive" from the default To Do set per request
        return ['pending','processing'].includes(s) || o.is_todo || o.todo;
      });

      // apply status filter
      const statusVal = (statusFilter && statusFilter.value) ? String(statusFilter.value).trim() : '';
      if (statusVal) {
        todos = todos.filter(o => String(o.status||'').toLowerCase() === statusVal.toLowerCase());
      }

      // apply search filter
      const q = (todoSearch && todoSearch.value) ? String(todoSearch.value).trim().toLowerCase() : '';
      if (q) {
        todos = todos.filter(o => {
          const id = String(o.orderId||o.order_id||o.id||'').toLowerCase();
          const name = String(o.name||o.customer_name||o.user_name||'').toLowerCase();
          const itemsText = (o.items && o.items.length) ? o.items.map(i => String(i.name||i.flower_type||'')).join(' ').toLowerCase() : '';
          return id.includes(q) || name.includes(q) || itemsText.includes(q);
        });
      }

      // sort by created_at
      const order = sortSelect.value || 'desc';
      todos.sort((a,b) => {
        const ta = new Date(a.created_at || a.createdAt || a.createdAtStr || 0).getTime() || 0;
        const tb = new Date(b.created_at || b.createdAt || b.createdAtStr || 0).getTime() || 0;
        return order === 'asc' ? ta - tb : tb - ta;
      });
      if (!todos.length) {
        todoTable.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No to-do orders</td></tr>';
        if (todoCountEl) todoCountEl.textContent = '0';
        return;
      }

      if (todoCountEl) todoCountEl.textContent = String(todos.length);

      todoTable.innerHTML = todos.map(o => {
        const rawId = String(o.orderId || o.order_id || o.id || '');
        const id = escapeHtml(rawId);
        const name = escapeHtml(o.name || o.customer_name || o.user_name || o.user || '');
        const status = escapeHtml(o.status || '');
        const date = escapeHtml(formatDateTime(o.created_at || o.createdAt || o.createdAtStr || o.createdAtDate || Date.now()));
        const itemsHtml = (o.items && o.items.length) ? renderItems(o.items) : escapeHtml(String(o.flower_type || ''));
        return `<tr>
          <td>${id}</td>
          <td>${name}</td>
          <td style="min-width:220px">${itemsHtml}</td>
          <td style="white-space:nowrap">${date}</td>
          <td><span class="badge ${statusBadgeClass(status)}">${status}</span></td>
            <td><button class="btn btn-sm btn-pink view-btn" data-id="${encodeURIComponent(rawId)}">View</button></td>
        </tr>`;
      }).join('');

      // wire view buttons
      document.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', async (ev) => {
        // dataset value contains an encoded raw id (to keep attribute-safe); decode before using
        const encoded = ev.currentTarget.dataset.id;
        const decodedId = encoded ? decodeURIComponent(encoded) : '';
        try {
          // Find the order to check if it's a custom order
          const order = todos.find(o => (o.orderId || o.order_id || o.id) === decodedId);
          const isCustom = order && order.order_type === 'custom';
          
          // Use appropriate endpoint based on order type
          const endpoint = isCustom 
            ? `/api/admin/orders/custom/${encodeURIComponent(decodedId)}`
            : `/api/admin/orders/${encodeURIComponent(decodedId)}`;
          
          const r = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
          if (!r.ok) throw new Error('Failed to load order');
          const ord = await r.json();
          showOrderDetails(ord);
        } catch (err) {
          alertError('Failed to load order details');
          console.error(err);
        }
      }));

    } catch (err) {
      console.error('loadOrders error', err);
      todoTable.innerHTML = '<tr><td colspan="6" class="text-danger">Failed to load orders</td></tr>';
    }
  }

  function showOrderDetails(ord){
    if (!orderDetailsContent) return;
    const id = escapeHtml(ord.orderId || ord.order_id || ord.id || '');
    const name = escapeHtml(ord.name || ord.customer_name || ord.user_name || '');
    const email = escapeHtml(ord.email || ord.user_email || '');
    const date = escapeHtml(new Date(ord.created_at || ord.createdAt || Date.now()).toLocaleString());
    const status = escapeHtml(ord.status || '');
    const total = String(ord.total_fee || ord.total || '0');
    
    // Check if this is a custom order (either has order_type or has stems/fillers/wrapping fields)
    const isCustom = ord.order_type === 'custom' || ord.stems || ord.fillers || ord.wrapping;
    
    let itemsHtml = '';
    
    if (isCustom) {
      // Handle custom orders with stems, fillers, wrapping, addons
      // Use safeParseArray to handle both string and object formats
      const stems = safeParseArray(ord.stems);
      const fillers = safeParseArray(ord.fillers);
      const wrapping = safeParseArray(ord.wrapping);
      const addons = safeParseArray(ord.addons);
      
      itemsHtml = '<div class="custom-order-items">';
      
      if (stems.length > 0) {
        itemsHtml += '<div class="item-category mb-3"><div class="category-title"><i class="fas fa-seedling me-2"></i>Stems</div>';
        stems.forEach(s => {
          const qty = s.quantity ? ` <span class="item-qty">×${escapeHtml(String(s.quantity))}</span>` : '';
          itemsHtml += `<div class="item-row"><span class="item-name">${escapeHtml(s.name || 'Stem')}${qty}</span><span class="item-price">₱${escapeHtml(String(s.price || 0))}</span></div>`;
        });
        itemsHtml += '</div>';
      }
      
      if (fillers.length > 0) {
        itemsHtml += '<div class="item-category mb-3"><div class="category-title"><i class="fas fa-leaf me-2"></i>Fillers</div>';
        fillers.forEach(f => {
          const qty = f.quantity ? ` <span class="item-qty">×${escapeHtml(String(f.quantity))}</span>` : '';
          itemsHtml += `<div class="item-row"><span class="item-name">${escapeHtml(f.name || 'Filler')}${qty}</span><span class="item-price">₱${escapeHtml(String(f.price || 0))}</span></div>`;
        });
        itemsHtml += '</div>';
      }
      
      if (wrapping.length > 0) {
        itemsHtml += '<div class="item-category mb-3"><div class="category-title"><i class="fas fa-gift me-2"></i>Wrapping</div>';
        wrapping.forEach(w => {
          itemsHtml += `<div class="item-row"><span class="item-name">${escapeHtml(w.name || 'Wrapping')}</span><span class="item-price">₱${escapeHtml(String(w.price || 0))}</span></div>`;
        });
        itemsHtml += '</div>';
      }
      
      if (addons.length > 0) {
        itemsHtml += '<div class="item-category mb-3"><div class="category-title"><i class="fas fa-plus-circle me-2"></i>Add-ons</div>';
        addons.forEach(a => {
          itemsHtml += `<div class="item-row"><span class="item-name">${escapeHtml(a.name || 'Add-on')}</span><span class="item-price">₱${escapeHtml(String(a.price || 0))}</span></div>`;
        });
        itemsHtml += '</div>';
      }
      
      itemsHtml += '</div>';
      
      if (!stems.length && !fillers.length && !wrapping.length && !addons.length) {
        itemsHtml = '<div class="text-muted fst-italic">No items specified</div>';
      }
    } else {
      // Handle regular orders
      if (ord.items && ord.items.length) {
        itemsHtml = '<div class="regular-order-items">';
        ord.items.forEach(it => {
          const nm = escapeHtml(it.name || it.flower_type || 'Item');
          const color = escapeHtml(formatColor(it.color || it.color_name || ''));
          const qty = it.quantity ? `<span class="item-qty">×${escapeHtml(String(it.quantity))}</span>` : '';
          itemsHtml += `<div class="item-row"><span class="item-name">${nm}${color ? ` <span class="item-color">(${color})</span>` : ''}</span>${qty}</div>`;
        });
        itemsHtml += '</div>';
      } else {
        itemsHtml = '<div class="text-muted fst-italic">' + escapeHtml(String(ord.flower_type || 'No items')) + '</div>';
      }
    }

    orderDetailsContent.innerHTML = `
      <div class="order-details-professional">
        <div class="detail-header mb-4">
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div>
              <div class="order-id-label">Order ID</div>
              <div class="order-id-value">#${id}</div>
            </div>
            <span class="badge ${statusBadgeClass(status)} status-badge-large">${status}</span>
          </div>
          ${isCustom ? '<div class="alert alert-info mb-0 py-2 px-3"><i class="fas fa-palette me-2"></i><small><strong>Custom Bouquet Order</strong></small></div>' : ''}
        </div>
        
        <div class="detail-section mb-4">
          <div class="section-title"><i class="fas fa-user me-2"></i>Customer Information</div>
          <div class="section-content">
            <div class="info-row">
              <span class="info-label">Name:</span>
              <span class="info-value">${name}</span>
            </div>
            ${email ? `<div class="info-row"><span class="info-label">Email:</span><span class="info-value">${email}</span></div>` : ''}
            <div class="info-row">
              <span class="info-label">Order Date:</span>
              <span class="info-value">${date}</span>
            </div>
          </div>
        </div>
        
        <div class="detail-section mb-4">
          <div class="section-title"><i class="fas fa-box me-2"></i>Order Items</div>
          <div class="section-content">
            ${itemsHtml}
          </div>
        </div>
        
        <div class="detail-footer">
          ${ord.voucher_code ? `
            <div style="margin-bottom: 15px; padding: 15px; background: #e8f5e9; border-radius: 10px; border-left: 4px solid #28a745;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-weight: 600; color: #2e7d32;">
                  <i class="fas fa-ticket-alt me-2"></i>Voucher Applied
                </span>
                <span class="badge bg-success" style="font-size: 14px; padding: 6px 12px;">
                  ${escapeHtml(ord.voucher_code)}
                </span>
              </div>
              <div style="font-size: 14px; color: #555;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <span>Original Total:</span>
                  <span style="text-decoration: line-through; color: #999;">₱${escapeHtml(String(ord.original_total || total))}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-weight: 600; color: #28a745;">
                  <span>Discount:</span>
                  <span>-₱${escapeHtml(String(ord.voucher_discount || '0.00'))}</span>
                </div>
              </div>
            </div>
          ` : ''}
          <div class="total-row">
            <span class="total-label">${ord.voucher_code ? 'Final' : 'Total'} Amount:</span>
            <span class="total-value">₱${total}</span>
          </div>
        </div>
      </div>
    `;
    detailsModal?.show();
  }

  function statusBadgeClass(status) {
    if (!status) return 'bg-secondary text-white';
    const s = String(status).toLowerCase();
    if (s.includes('pending')) return 'bg-warning text-dark';
    if (s.includes('processing')) return 'bg-primary text-white';
    if (s.includes('receive') || s.includes('to receive') || s.includes('delivered')) return 'bg-success text-white';
    if (s.includes('cancel')) return 'bg-secondary text-white';
    return 'bg-light text-dark';
  }

  sortSelect.addEventListener('change', loadOrders);
  statusFilter?.addEventListener('change', loadOrders);
  refreshBtn?.addEventListener('click', loadOrders);
  todoSearch?.addEventListener('input', () => {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(loadOrders, 250);
  });

  // initial load
  loadOrders();
})();