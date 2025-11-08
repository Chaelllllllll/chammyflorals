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
        <button class="btn btn-sm btn-success ms-1 edit-order-button" data-order-id="${order.order_id}">Edit</button>
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

  // wire edit buttons
  document.querySelectorAll('.edit-order-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const orderId = e.target.dataset.orderId;
      openEditModal(orderId);
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

function openEditModal(orderId) {
  const order = window.ordersData.find(o => o.order_id === orderId);
  if (!order) { showErrorModal('Order not found'); return; }
  // Populate a simple edit form inside the details modal
  const modalContent = document.getElementById('orderDetailsContent');
  modalContent.innerHTML = `
    <form id="editOrderForm">
      <div class="mb-2"><label class="form-label">Order ID</label><input class="form-control" name="order_id" value="${order.order_id}" readonly></div>
      <div class="mb-2"><label class="form-label">Name</label><input class="form-control" name="name" value="${order.name || ''}"></div>
      <div class="mb-2"><label class="form-label">Email</label><input class="form-control" name="email" value="${order.email || ''}"></div>
      <div class="mb-2"><label class="form-label">Flower Type</label><input class="form-control" name="flower_type" value="${order.flower_type || ''}"></div>
      <div class="mb-2"><label class="form-label">Quantity</label><input type="number" class="form-control" name="quantity" value="${order.quantity || 1}"></div>
      <div class="mb-2"><label class="form-label">Add-ons (comma separated)</label><input class="form-control" name="addons" value="${(order.addons && order.addons.join(', ')) || ''}"></div>
      <div class="mb-2"><label class="form-label">Message</label><textarea class="form-control" name="message">${order.message || ''}</textarea></div>
      <div class="mb-2"><label class="form-label">Rush</label><select class="form-select" name="rush"><option ${order.rush==='No'?'selected':''}>No</option><option ${order.rush==='Yes'?'selected':''}>Yes</option></select></div>
      <div class="mb-2"><label class="form-label">Total Fee</label><input type="number" step="0.01" class="form-control" name="total_fee" value="${order.total_fee || 0}"></div>
  <div class="mb-2"><label class="form-label">Status</label><select class="form-select" name="status"><option>Pending</option><option>Processing</option><option>To Receive</option><option>Cancelled</option></select></div>
      
    </form>
  `;

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
        const ok = amtInput.value !== '' && !Number.isNaN(received);
        if (deliverBtn) deliverBtn.disabled = !ok;
        const change = (Number.isNaN(received) ? 0 : received) - (Number(order.total_fee) || 0);
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
          const payload = { status: 'Delivered' };
          payload.message = `${order.message || ''}\n\n[Received: ₱${received.toFixed(2)}]`;
          const response = await fetch(`/api/admin/orders/${orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
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
    if (statusSelect) statusSelect.value = '';
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