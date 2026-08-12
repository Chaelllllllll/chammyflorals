async function loadReportsData() {
  const token = localStorage.getItem('adminToken');
  if (!token) return window.location.href = '/customer-login.html';
  try {
    const url = '/api/admin/reports';
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error('Failed to fetch reports');
    const data = await resp.json();
    return data;
  } catch (err) {
    console.error('loadReportsData error', err);
    alertError('Failed to load reports: ' + (err.message||err));
    return null;
  }
}

function formatPHP(n) {
  try {
    // Format as Philippine Peso with two decimals, e.g. ₱1,234.00
    const num = Number(n) || 0;
    // Use locale formatting for Philippines if available
    if (typeof Intl !== 'undefined' && Intl.NumberFormat) {
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(num);
    }
    return '₱' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch (e) { return '₱0.00'; }
}

function renderTable(orders) {
  const tbody = document.getElementById('reportsTbody');
  if (!orders || !orders.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No delivered orders</td></tr>';
    return;
  }
  const dtf = (d) => {
    try {
      return new Intl.DateTimeFormat('en-PH', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d));
    } catch (e) { return new Date(d).toLocaleDateString(); }
  };
  tbody.innerHTML = orders.map(o => `
    <tr data-order-id="${o.order_id || ''}" data-order-type="${o.order_type || 'regular'}">
      <td class="text-start"><a href="#" class="copy-review-link text-decoration-none fw-bold" data-order-id="${o.order_id || ''}" title="Click to copy review link">${o.order_id || '—'}</a>${o.order_type === 'custom' ? ' <span class="badge bg-pink small">Custom</span>' : ''}</td>
      <td>${o.name || '—'}</td>
      <td>${o.created_at ? dtf(o.created_at) : '—'}</td>
      <td class="text-end">${formatPHP(o.total_fee)}</td>
      <td class="actions">
        <div class="d-flex gap-2 justify-content-end">
          <button class="btn btn-sm btn-outline-pink reports-view" data-order-id="${o.order_id || ''}" data-order-type="${o.order_type || 'regular'}" title="View / Edit"><i class="fas fa-eye me-1"></i>View</button>
          <button class="btn btn-sm btn-outline-danger reports-delete" data-order-id="${o.order_id || ''}" data-order-type="${o.order_type || 'regular'}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.reports-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.orderId;
      const orderType = e.target.dataset.orderType || 'regular';
      const confirmBtn = document.getElementById('confirmDeleteButton');
      confirmBtn.dataset.orderId = id;
      confirmBtn.dataset.orderType = orderType;
      const confirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
      confirmModal.show();
    });
  });

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
            alert('Review link copied to clipboard:\\n' + reviewUrl);
          }
        }).catch(err => {
          console.error('Could not copy text: ', err);
          alert('Review link:\\n' + reviewUrl);
        });
      } else {
        alert('Review link:\\n' + reviewUrl);
      }
    });
  });

  // Attach view/edit handlers (fetch latest order when opened)
  document.querySelectorAll('.reports-view').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.orderId;
      const orderType = e.currentTarget.dataset.orderType || 'regular';
      if (!id) return;
      
      // show modal first with loading state
      const modalEl = document.getElementById('reportOrderModal');
      const modal = new bootstrap.Modal(modalEl);
      
      // clear form and show loading text
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
      document.getElementById('reportStatus').value = 'Pending';
      modal.show();

      try {
        const token = localStorage.getItem('adminToken');
        const endpoint = orderType === 'custom' 
          ? `/api/admin/orders/custom/${encodeURIComponent(id)}`
          : `/api/admin/orders/${encodeURIComponent(id)}`;
        
        const resp = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) throw new Error('Failed to fetch order');
        const order = await resp.json();
        
        // populate form with fetched order
        document.getElementById('reportOrderId').value = order.order_id || id;
        document.getElementById('reportName').value = order.name || '';
        document.getElementById('reportEmail').value = order.email || '';
        
        if (orderType === 'custom') {
          // For custom orders, show items breakdown
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
          
          // Custom order addons
          if (order.addons && Array.isArray(order.addons) && order.addons.length) {
            document.getElementById('reportAddons').value = order.addons.map(a => a.name).join(', ');
          } else {
            document.getElementById('reportAddons').value = '';
          }
          
          // Special instructions instead of message
          document.getElementById('reportMessage').value = order.special_instructions || '';
        } else {
          // Regular order
          document.getElementById('reportFlowerType').value = Array.isArray(order.flower_type) ? order.flower_type.join(', ') : (order.flower_type || '');
          document.getElementById('reportQuantity').value = order.quantity || '';
          try { 
            document.getElementById('reportAddons').value = order.addons ? (typeof order.addons === 'string' ? order.addons : JSON.stringify(order.addons)) : ''; 
          } catch(e){ 
            document.getElementById('reportAddons').value = ''; 
          }
          document.getElementById('reportMessage').value = order.message || '';
        }
        
        document.getElementById('reportRush').value = order.rush || 'No';
        document.getElementById('reportTotalFee').value = order.total_fee || '';
        document.getElementById('reportPaymentMethod').value = order.payment_method || '';
        document.getElementById('reportStatus').value = order.status || 'Pending';
      } catch (err) {
        alertError('Failed to load order: ' + (err.message || err));
        const mdl = bootstrap.Modal.getInstance(modalEl);
        if (mdl) mdl.hide();
      }
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
    // build bootstrap pagination
    let html = `<li class="page-item ${p===1?'disabled':''}"><button class="page-link" data-page="${p-1}" aria-label="Previous">&laquo;</button></li>`;
    const visible = 5; // show up to 5 page buttons
    const startPage = Math.max(1, Math.min(p - Math.floor(visible/2), pages - visible + 1));
    const endPage = Math.min(pages, startPage + visible - 1);
    for (let i = startPage; i <= endPage; i++) {
      html += `<li class="page-item ${i===p?'active':''}"><button class="page-link" data-page="${i}">${i}</button></li>`;
    }
    html += `<li class="page-item ${p===pages?'disabled':''}"><button class="page-link" data-page="${p+1}" aria-label="Next">&raquo;</button></li>`;
    pager.innerHTML = html;
    pager.querySelectorAll('.page-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = Number(e.currentTarget.dataset.page || p);
        if (!isNaN(target) && target >=1 && target <= pages) renderPage(orders, target, pageSize);
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const pageSizeSelect = document.getElementById('reportsPageSize');

  const data = await loadReportsData();
  if (!data) return;
  const totalEl = document.getElementById('totalRevenue');
  totalEl.textContent = formatPHP(data.total_revenue || 0);
  // populate KPI numbers
  const totalTxEl = document.getElementById('totalTransactions');
  const ordersList = (data.orders || []);
  if (totalTxEl) totalTxEl.textContent = String(ordersList.length || 0);
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
  // removed date filters (not used)
  // page size change
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', () => {
      const ps = Number(pageSizeSelect.value) || 10;
      renderPage(window.reportsOrders, 1, ps);
    });
  }
  // export buttons removed as requested
  // confirm delete button (present from dashboard.html shared modal)
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
        alertSuccess('Order deleted successfully');
      } catch (err) {
        alertError('Failed to delete order: ' + (err.message || err));
      }
    });
  }

  // Modal open/populate and save logic
  window.openReportModal = function(order) {
    document.getElementById('reportOrderId').value = order.order_id || '';
    document.getElementById('reportName').value = order.name || '';
    document.getElementById('reportEmail').value = order.email || '';
    document.getElementById('reportFlowerType').value = Array.isArray(order.flower_type) ? order.flower_type.join(', ') : (order.flower_type || '');
    document.getElementById('reportQuantity').value = order.quantity || '';
    document.getElementById('reportRush').value = order.rush || 'No';
    // addons may be JSON
    try { document.getElementById('reportAddons').value = order.addons ? (typeof order.addons === 'string' ? order.addons : JSON.stringify(order.addons)) : ''; } catch(e){ document.getElementById('reportAddons').value = ''; }
    document.getElementById('reportMessage').value = order.message || '';
    document.getElementById('reportTotalFee').value = order.total_fee || '';
    document.getElementById('reportPaymentMethod').value = order.payment_method || '';
    document.getElementById('reportStatus').value = order.status || 'Pending';
    const modal = new bootstrap.Modal(document.getElementById('reportOrderModal'));
    modal.show();
  };

  // No edit/save functionality — modal is display-only
});
