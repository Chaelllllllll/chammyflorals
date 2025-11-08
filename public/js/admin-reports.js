async function loadReportsData(from, to) {
  const token = localStorage.getItem('adminToken');
  if (!token) return window.location.href = '/admin/login.html';
  try {
    const qs = [];
    if (from) qs.push('from=' + encodeURIComponent(from));
    if (to) qs.push('to=' + encodeURIComponent(to));
    const url = '/api/admin/reports' + (qs.length ? ('?' + qs.join('&')) : '');
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error('Failed to fetch reports');
    const data = await resp.json();
    return data;
  } catch (err) {
    console.error('loadReportsData error', err);
    alert('Failed to load reports: ' + (err.message||err));
    return null;
  }
}

function formatPHP(n) {
  try { return 'P' + Number(n).toLocaleString(); } catch (e) { return 'P0'; }
}

function renderTable(orders) {
  const tbody = document.getElementById('reportsTbody');
  if (!orders || !orders.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No delivered orders</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => `
    <tr data-order-id="${o.order_id || ''}">
      <td>${o.order_id || '—'}</td>
      <td>${o.name || '—'}</td>
      <td>${o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</td>
      <td>${formatPHP(o.total_fee)}</td>
      <td><button class="btn btn-sm btn-danger reports-delete" data-order-id="${o.order_id || ''}">Delete</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('.reports-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.orderId;
      const confirmBtn = document.getElementById('confirmDeleteButton');
      confirmBtn.dataset.orderId = id;
      const confirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
      confirmModal.show();
    });
  });
}

function renderPage(orders, page=1, pageSize=10) {
  const total = orders.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p-1)*pageSize;
  const chunk = orders.slice(start, start + pageSize);
  renderTable(chunk);
  const pager = document.getElementById('reportsPagination');
  if (pager) {
    pager.innerHTML = `
      <div class="d-flex align-items-center justify-content-between">
        <div class="small text-muted">Showing ${start+1}-${Math.min(start+chunk.length, total)} of ${total}</div>
        <div>
          <button class="btn btn-sm btn-outline-secondary me-2" id="reportsPrev">Prev</button>
          <span class="mx-2">Page ${p} / ${pages}</span>
          <button class="btn btn-sm btn-outline-secondary ms-2" id="reportsNext">Next</button>
        </div>
      </div>
    `;
    document.getElementById('reportsPrev').addEventListener('click', () => {
      if (p > 1) renderPage(orders, p-1, pageSize);
    });
    document.getElementById('reportsNext').addEventListener('click', () => {
      if (p < pages) renderPage(orders, p+1, pageSize);
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const fromInput = document.getElementById('reportsFrom');
  const toInput = document.getElementById('reportsTo');
  const pageSizeSelect = document.getElementById('reportsPageSize');
  const exportBtn = document.getElementById('exportCsvBtn');

  const fromVal = fromInput ? fromInput.value : '';
  const toVal = toInput ? toInput.value : '';
  const data = await loadReportsData(fromVal, toVal);
  if (!data) return;
  const totalEl = document.getElementById('totalRevenue');
  totalEl.textContent = formatPHP(data.total_revenue || 0);
  // keep a local copy for search/filter
  window.reportsOrders = (data.orders || []).slice().sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
  const pageSize = pageSizeSelect ? Number(pageSizeSelect.value) || 10 : 10;
  renderPage(window.reportsOrders, 1, pageSize);

  const search = document.getElementById('reportsSearch');
  if (search) {
    search.addEventListener('input', () => {
      const q = (search.value || '').trim().toLowerCase();
      const filtered = window.reportsOrders.filter(o => String(o.order_id || '').toLowerCase().includes(q) || String(o.name || '').toLowerCase().includes(q));
      const ps = pageSizeSelect ? Number(pageSizeSelect.value) || 10 : 10;
      renderPage(filtered, 1, ps);
    });
  }
  // date filters
  if (fromInput) {
    fromInput.addEventListener('change', async () => {
      const data2 = await loadReportsData(fromInput.value, toInput ? toInput.value : '');
      if (!data2) return;
      document.getElementById('totalRevenue').textContent = formatPHP(data2.total_revenue || 0);
      window.reportsOrders = (data2.orders || []).slice().sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
      const ps = pageSizeSelect ? Number(pageSizeSelect.value) || 10 : 10;
      renderPage(window.reportsOrders, 1, ps);
    });
  }
  if (toInput) {
    toInput.addEventListener('change', async () => {
      const data2 = await loadReportsData(fromInput ? fromInput.value : '', toInput.value);
      if (!data2) return;
      document.getElementById('totalRevenue').textContent = formatPHP(data2.total_revenue || 0);
      window.reportsOrders = (data2.orders || []).slice().sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
      const ps = pageSizeSelect ? Number(pageSizeSelect.value) || 10 : 10;
      renderPage(window.reportsOrders, 1, ps);
    });
  }
  // page size change
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', () => {
      const ps = Number(pageSizeSelect.value) || 10;
      renderPage(window.reportsOrders, 1, ps);
    });
  }
  // export CSV
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const rows = window.reportsOrders || [];
      if (!rows.length) return alert('No orders to export');
      const headers = ['order_id','name','created_at','total_fee'];
      const csv = [headers.join(',')].concat(rows.map(r => {
        return [
          '"' + (r.order_id || '') + '"',
          '"' + (r.name || '') + '"',
          '"' + (r.created_at || '') + '"',
          (r.total_fee || 0)
        ].join(',');
      })).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'orders-report.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }
  // confirm delete button (present from dashboard.html shared modal)
  const confirmBtn = document.getElementById('confirmDeleteButton');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async (e) => {
      const id = e.target.dataset.orderId;
      if (!id) return;
      try {
        const token = localStorage.getItem('adminToken');
        const resp = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Failed to delete');
        // refresh data
        const mdl = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
        if (mdl) mdl.hide();
        const newData = await loadReportsData();
        if (!newData) return;
        window.reportsOrders = (newData.orders || []).slice().sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
        document.getElementById('totalRevenue').textContent = formatPHP(newData.total_revenue || 0);
        const ps2 = pageSizeSelect ? Number(pageSizeSelect.value) || 10 : 10;
        renderPage(window.reportsOrders, 1, ps2);
      } catch (err) {
        alert('Failed to delete order: ' + (err.message || err));
      }
    });
  }
});
