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
          const r = await fetch(`/api/admin/orders/${encodeURIComponent(decodedId)}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!r.ok) throw new Error('Failed to load order');
          const ord = await r.json();
          showOrderDetails(ord);
        } catch (err) {
          alert('Failed to load order details');
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
    const itemsHtml = (ord.items && ord.items.length) ? (ord.items.map(it => {
      const nm = escapeHtml(it.name || it.flower_type || 'Item');
      const color = escapeHtml(formatColor(it.color || it.color_name || ''));
      return `<div>${nm}${color ? ' ('+color+')' : ''} ${it.quantity ? ('<small class="text-muted">×'+escapeHtml(String(it.quantity))+'</small>') : ''}</div>`;
    }).join('')) : escapeHtml(String(ord.flower_type || ''));

    orderDetailsContent.innerHTML = `
      <div class="mb-2"><strong>Order ID:</strong> ${id}</div>
      <div class="mb-2"><strong>Customer:</strong> ${name}${email ? (' — ' + email) : ''}</div>
      <div class="mb-3"><strong>Items</strong><div class="mt-1">${itemsHtml}</div></div>
      <div class="row">
        <div class="col-sm-6"><strong>Status:</strong> <span class="badge ${statusBadgeClass(status)}">${status}</span></div>
        <div class="col-sm-6"><strong>Placed:</strong> ${date}</div>
      </div>
      <div class="mt-2"><strong>Total:</strong> ${escapeHtml(String(ord.total_fee || ord.total || ''))}</div>
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