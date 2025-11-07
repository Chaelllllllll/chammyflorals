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
      // initialize filters UI
      setupOrderFilters();
      // render initial view (not-delivered)
      applyOrderFilters();
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
  const status = document.getElementById('ordersFilterStatus');
  if (search) {
    search.addEventListener('input', () => applyOrderFilters());
  }
  if (status) {
    status.addEventListener('change', () => applyOrderFilters());
  }
}

function applyOrderFilters() {
  const all = window.ordersData || [];
  const searchVal = (document.getElementById('ordersSearch')?.value || '').trim().toLowerCase();
  const statusVal = (document.getElementById('ordersFilterStatus')?.value || '').trim();
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

  const tbody = document.getElementById('ordersTable');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No matching orders</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(order => `
    <tr data-order-id="${order.order_id}">
      <td>${order.order_id}</td>
      <td>${order.name}</td>
      <td>${order.email}</td>
      <td><a href="${order.fb_link}" target="_blank">${order.fb_link}</a></td>
      <td>
        <button class="btn btn-sm btn-pink details-button" data-order-id="${order.order_id}">Details</button>
      </td>
    </tr>
  `).join('');

  // wire detail buttons
  document.querySelectorAll('.details-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const orderId = e.target.dataset.orderId;
      viewDetails(orderId);
    });
  });
}

function viewDetails(orderId) {
  const order = window.ordersData.find(o => o.order_id === orderId);
  if (!order) {
    showErrorModal('Order not found');
    return;
  }

  const modalContent = document.getElementById('orderDetailsContent');
  modalContent.innerHTML = `
    <p><strong>Order ID:</strong> ${order.order_id}</p>
    <p><strong>Name:</strong> ${order.name}</p>
    <p><strong>Email:</strong> ${order.email}</p>
    <p><strong>Facebook Link:</strong> <a href="${order.fb_link}" target="_blank">${order.fb_link}</a></p>
    <p><strong>Flower Type:</strong> ${order.flower_type}</p>
    <p><strong>Quantity:</strong> ${order.quantity}</p>
    <p><strong>Add-ons:</strong> ${order.addons?.length ? order.addons.join(', ') : 'None'}</p>
    <p><strong>Message:</strong> ${order.message || 'Not provided'}</p>
    <p><strong>Rush Order:</strong> ${order.rush}</p>
    <p><strong>Total Fee:</strong> ₱${order.total_fee}</p>
    <p><strong>Status:</strong> ${order.status}</p>
    <p><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
  `;

  const deleteButton = document.getElementById('deleteOrderButton');
  deleteButton.dataset.orderId = orderId;
  const changeStatusButton = document.getElementById('changeStatusButton');
  changeStatusButton.dataset.orderId = orderId;

  const detailsModal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
  detailsModal.show();
}

async function changeStatus(orderId) {
  const token = localStorage.getItem('adminToken');
  const status = document.getElementById('orderStatus').value;
  try {
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
document.getElementById('logoutButton').addEventListener('click', logout);
document.getElementById('deleteOrderButton').addEventListener('click', (e) => {
  const orderId = e.target.dataset.orderId;
  const confirmButton = document.getElementById('confirmDeleteButton');
  confirmButton.dataset.orderId = orderId;
  const confirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
  confirmModal.show();
});
document.getElementById('confirmDeleteButton').addEventListener('click', (e) => {
  const orderId = e.target.dataset.orderId;
  deleteOrder(orderId);
});
document.getElementById('changeStatusButton').addEventListener('click', (e) => {
  const orderId = e.target.dataset.orderId;
  const statusForm = document.getElementById('changeStatusForm');
  const statusSelect = document.getElementById('orderStatus');
  statusSelect.value = ''; // Reset dropdown
  statusForm.dataset.orderId = orderId;
  const statusModal = new bootstrap.Modal(document.getElementById('changeStatusModal'));
  statusModal.show();
});
document.getElementById('changeStatusForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const orderId = e.target.dataset.orderId;
  changeStatus(orderId);
});

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