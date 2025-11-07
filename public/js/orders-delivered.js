document.addEventListener('DOMContentLoaded', () => {
  loadDeliveredOrders();
  // wire logout if present
  const logout = document.getElementById('logoutButton');
  if (logout) logout.addEventListener('click', () => { localStorage.removeItem('adminToken'); window.location.href = '/admin/login.html'; });
  const search = document.getElementById('deliveredSearch');
  if (search) search.addEventListener('input', () => applyDeliveredFilters());
});

async function loadDeliveredOrders() {
  const token = localStorage.getItem('adminToken');
  if (!token) { window.location.href = '/admin/login.html'; return; }
  const tbody = document.getElementById('deliveredOrdersTbody');
  tbody.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
  try {
  const res = await fetch('/api/admin/orders', { headers: { Authorization: `Bearer ${token}` } });
    const orders = await res.json();
    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="6">Error: ${orders.error || res.status}</td></tr>`;
      return;
    }
    const delivered = (orders || []).filter(o => String((o.status||'')).toLowerCase() === 'delivered');
    if (!delivered.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">No delivered orders</td></tr>';
      return;
    }
  // cache delivered orders for use by viewOrder
  window.deliveredOrdersCache = delivered;
    tbody.innerHTML = delivered.map(o => `
      <tr>
        <td>${o.order_id}</td>
        <td>${escapeHtml(o.name)}</td>
        <td>${escapeHtml(o.flower_type)}</td>
        <td>${o.quantity || 1}</td>
        <td>₱${o.total_fee || o.total || o.amount || 0}</td>
        <td><button class="btn btn-sm btn-secondary view-order-btn" data-order-id="${o.order_id}">View</button></td>
      </tr>
    `).join('');
    // attach handlers
    document.querySelectorAll('.view-order-btn').forEach(btn => btn.addEventListener('click', (e) => viewOrder(e.target.dataset.orderId)));
    // apply any search filter immediately
    applyDeliveredFilters();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="7">Failed to load delivered orders</td></tr>`;
  }
}

function escapeHtml(s='') { return String(s).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function viewOrder(id) {
  const orders = window.deliveredOrdersCache || [];
  const order = orders.find(o => String(o.order_id) === String(id));
  if (!order) {
    // fallback: fetch all and try again
  fetch('/api/admin/orders', { headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` } })
      .then(r => r.json())
      .then(list => {
        const found = (list || []).find(o => String(o.order_id) === String(id));
        if (found) return showOrderModal(found);
        alert('Order not found');
      }).catch(err => { console.error(err); alert('Failed to load order'); });
    return;
  }
  showOrderModal(order);
}

function showOrderModal(order) {
  const content = document.getElementById('orderDetailsContent');
  if (!content) return;
  content.innerHTML = `
    <p><strong>Order ID:</strong> ${escapeHtml(order.order_id)}</p>
    <p><strong>Name:</strong> ${escapeHtml(order.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(order.email || '')}</p>
    <p><strong>Facebook Link:</strong> ${order.fb_link ? `<a href="${escapeHtml(order.fb_link)}" target="_blank">${escapeHtml(order.fb_link)}</a>` : 'N/A'}</p>
    <p><strong>Flower Type:</strong> ${escapeHtml(order.flower_type)}</p>
    <p><strong>Quantity:</strong> ${escapeHtml(order.quantity || 1)}</p>
    <p><strong>Add-ons:</strong> ${order.addons?.length ? escapeHtml(order.addons.join(', ')) : 'None'}</p>
    <p><strong>Message:</strong> ${escapeHtml(order.message || 'Not provided')}</p>
    <p><strong>Rush Order:</strong> ${escapeHtml(order.rush || 'No')}</p>
    <p><strong>Total Fee:</strong> ₱${order.total_fee || order.total || order.amount || 0}</p>
    <p><strong>Status:</strong> ${escapeHtml(order.status || '')}</p>
    
  `;
  const modal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
  modal.show();
}

function applyDeliveredFilters() {
  const q = (document.getElementById('deliveredSearch')?.value || '').trim().toLowerCase();
  const all = window.deliveredOrdersCache || [];
  let list = all;
  if (q) {
    list = all.filter(o => {
      return String(o.order_id || '').toLowerCase().includes(q)
        || String(o.name || '').toLowerCase().includes(q)
        || String((o.email||'')).toLowerCase().includes(q);
    });
  }
  const tbody = document.getElementById('deliveredOrdersTbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No matching delivered orders</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(o => `
    <tr>
      <td>${o.order_id}</td>
      <td>${escapeHtml(o.name)}</td>
      <td>${escapeHtml(o.flower_type)}</td>
      <td>${o.quantity || 1}</td>
      <td>₱${o.total_fee || o.total || o.amount || 0}</td>
      <td><button class="btn btn-sm btn-secondary view-order-btn" data-order-id="${o.order_id}">View</button></td>
    </tr>
  `).join('');
  document.querySelectorAll('.view-order-btn').forEach(btn => btn.addEventListener('click', (e) => viewOrder(e.target.dataset.orderId)));
}
