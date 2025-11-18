// Load orders ready for delivery (To Receive status)
async function loadDeliveryOrders() {
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
    
    if (!verifyResponse.ok) {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login.html';
      return;
    }

    // Fetch all orders
    const response = await fetch('/api/admin/orders', {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const orders = await response.json();

    if (response.ok) {
      // Filter only "To Receive" status orders
      const deliveryOrders = (orders || []).filter(order => 
        String(order.status || '').toLowerCase() === 'to receive'
      );
      
      window.deliveryOrders = deliveryOrders;
      updateMetrics();
      renderDeliveryTable();
      setupSearch();
    } else {
      showErrorModal(orders.error || 'Failed to load orders');
    }
  } catch (error) {
    console.error('Error loading delivery orders:', error);
    showErrorModal(error.message || 'Error loading orders');
  }
}

// Update metrics
function updateMetrics() {
  const count = (window.deliveryOrders || []).length;
  document.getElementById('deliveryCount').textContent = count;
}

// Render delivery table
function renderDeliveryTable() {
  const tbody = document.getElementById('deliveryTable');
  const orders = window.deliveryOrders || [];
  
  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No orders ready for delivery</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(order => {
    const total = Number(order.total_fee || 0);
    
    return `
      <tr>
        <td><strong class="text-pink">${escapeHtml(order.order_id || '-')}</strong></td>
        <td>${escapeHtml(order.name || '-')}</td>
        <td class="text-success fw-bold">₱${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-success deliver-btn" data-order-id="${escapeHtml(order.order_id)}" title="Mark as Delivered">
            <i class="fas fa-truck me-1"></i>Deliver
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  // Attach event listeners to deliver buttons
  document.querySelectorAll('.deliver-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const orderId = this.getAttribute('data-order-id');
      showDeliveryConfirmation(orderId);
    });
  });
}

// Setup search functionality
function setupSearch() {
  const searchInput = document.getElementById('deliverySearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      
      if (!searchTerm) {
        renderDeliveryTable();
        return;
      }

      const allOrders = window.deliveryOrders || [];
      const filtered = allOrders.filter(order => {
        const orderId = String(order.order_id || '').toLowerCase();
        const name = String(order.name || '').toLowerCase();
        const email = String(order.email || '').toLowerCase();
        
        return orderId.includes(searchTerm) || 
               name.includes(searchTerm) || 
               email.includes(searchTerm);
      });

      const tbody = document.getElementById('deliveryTable');
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No matching orders found</td></tr>';
        return;
      }

      // Temporarily replace orders for rendering
      const originalOrders = window.deliveryOrders;
      window.deliveryOrders = filtered;
      renderDeliveryTable();
      window.deliveryOrders = originalOrders;
    });
  }
}

// View order details
async function viewOrderDetails(orderId) {
  const order = (window.deliveryOrders || []).find(o => String(o.order_id) === String(orderId));
  if (!order) {
    showErrorModal('Order not found');
    return;
  }

  const content = document.getElementById('orderDetailsContent');
  
  // Parse items
  let itemsHtml = '<div class="mb-3"><strong>Items:</strong><ul class="mt-2">';
  if (order.items && Array.isArray(order.items)) {
    itemsHtml += order.items.map(item => 
      `<li>${escapeHtml(item.flower_type || item.name || 'Item')} x${item.quantity || 1}</li>`
    ).join('');
  } else if (order.flower_type) {
    const types = Array.isArray(order.flower_type) ? order.flower_type : [order.flower_type];
    const quantities = Array.isArray(order.quantity) ? order.quantity : [order.quantity || 1];
    itemsHtml += types.map((type, i) => 
      `<li>${escapeHtml(type)} x${quantities[i] || 1}</li>`
    ).join('');
  }
  itemsHtml += '</ul></div>';

  // Parse addons
  let addonsHtml = '';
  if (order.addons && order.addons.length > 0) {
    addonsHtml = '<div class="mb-3"><strong>Add-ons:</strong><ul class="mt-2">';
    const addons = Array.isArray(order.addons) ? order.addons : [order.addons];
    addonsHtml += addons.map(addon => `<li>${escapeHtml(addon)}</li>`).join('');
    addonsHtml += '</ul></div>';
  }

  content.innerHTML = `
    <div class="row g-3">
      <div class="col-md-6">
        <strong>Order ID:</strong><br>
        <span class="text-pink">${escapeHtml(order.order_id || '-')}</span>
      </div>
      <div class="col-md-6">
        <strong>Status:</strong><br>
        <span class="badge bg-success">To Receive</span>
      </div>
      <div class="col-md-6">
        <strong>Customer Name:</strong><br>
        ${escapeHtml(order.name || '-')}
      </div>
      <div class="col-md-6">
        <strong>Email:</strong><br>
        ${escapeHtml(order.email || '-')}
      </div>
      <div class="col-md-6">
        <strong>Facebook:</strong><br>
        ${order.fb_link ? `<a href="${escapeHtml(order.fb_link)}" target="_blank">View Profile</a>` : '-'}
      </div>
      <div class="col-md-6">
        <strong>Phone:</strong><br>
        ${escapeHtml(order.phone || '-')}
      </div>
      <div class="col-12">
        ${itemsHtml}
      </div>
      ${addonsHtml ? `<div class="col-12">${addonsHtml}</div>` : ''}
      <div class="col-md-6">
        <strong>Rush Order:</strong><br>
        ${order.rush === 'Yes' ? '<span class="badge bg-warning text-dark">Yes</span>' : '<span class="badge bg-secondary">No</span>'}
      </div>
      <div class="col-md-6">
        <strong>Total Fee:</strong><br>
        <span class="text-success fw-bold">₱${Number(order.total_fee || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      ${order.message ? `<div class="col-12"><strong>Message:</strong><br><p class="mb-0">${escapeHtml(order.message)}</p></div>` : ''}
      <div class="col-12">
        <strong>Order Date:</strong><br>
        ${order.created_at ? new Date(order.created_at).toLocaleString() : '-'}
      </div>
    </div>
  `;

  const modal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
  modal.show();
}

// Show delivery confirmation modal
function showDeliveryConfirmation(orderId) {
  const order = (window.deliveryOrders || []).find(o => String(o.order_id) === String(orderId));
  if (!order) {
    showErrorModal('Order not found');
    return;
  }

  // Store order total for validation
  const orderTotal = Number(order.total_fee || 0);
  
  // Populate order information
  document.getElementById('deliveryOrderId').textContent = order.order_id || '-';
  document.getElementById('deliveryCustomerName').textContent = order.name || '-';
  document.getElementById('deliveryTotalAmount').textContent = `₱${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Reset form
  const form = document.getElementById('deliveryConfirmForm');
  if (form) form.reset();
  
  // Add real-time validation for amount paid
  const amountInput = document.getElementById('deliveryAmountPaid');
  const validationText = document.getElementById('amountValidationText');
  
  amountInput.addEventListener('input', function() {
    const amountPaid = parseFloat(this.value) || 0;
    if (amountPaid > 0 && amountPaid < orderTotal) {
      validationText.innerHTML = '<i class="fas fa-exclamation-triangle text-danger me-1"></i><span class="text-danger">Amount is less than total order amount (₱' + orderTotal.toFixed(2) + ')</span>';
      this.classList.add('border-danger');
    } else {
      validationText.innerHTML = '<i class="fas fa-info-circle me-1"></i>Amount must equal or exceed the total order amount';
      this.classList.remove('border-danger');
    }
  });

  // Show modal
  const deliveryModal = new bootstrap.Modal(document.getElementById('deliveryConfirmModal'));
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const receiverName = document.getElementById('deliveryReceiverName').value.trim();
    const amountPaid = parseFloat(document.getElementById('deliveryAmountPaid').value);
    const deliveredBy = document.getElementById('deliveryDeliveredBy').value.trim();
    const notes = document.getElementById('deliveryNotes').value.trim();
    
    if (!receiverName) {
      showErrorModal('Please enter the receiver name');
      return;
    }
    
    if (!amountPaid || amountPaid <= 0) {
      showErrorModal('Please enter a valid amount paid');
      return;
    }
    
    if (!deliveredBy) {
      showErrorModal('Please enter the name of the person who delivered');
      return;
    }
    
    // Validate amount is not less than order total
    if (amountPaid < orderTotal) {
      showErrorModal(`Amount received (₱${amountPaid.toFixed(2)}) cannot be less than the total order amount (₱${orderTotal.toFixed(2)})`);
      return;
    }
    
    const confirmButton = document.getElementById('deliveryConfirmButton');
    const originalText = confirmButton.innerHTML;
    confirmButton.disabled = true;
    confirmButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Processing...';
    
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/orders/${orderId}/deliver`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          received: amountPaid,
          receiverName: receiverName,
          deliveredBy: deliveredBy,
          notes: notes || undefined
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to mark order as delivered');
      }
      
      showSuccessModal(result.message || 'Order successfully marked as delivered');
      deliveryModal.hide();
      loadDeliveryOrders(); // Reload the list
      
    } catch (err) {
      showErrorModal(err.message || 'Failed to process delivery confirmation');
    } finally {
      confirmButton.disabled = false;
      confirmButton.innerHTML = originalText;
      form.removeEventListener('submit', handleSubmit);
    }
  };
  
  form.addEventListener('submit', handleSubmit);
  
  // Clean up listener when modal is closed
  document.getElementById('deliveryConfirmModal').addEventListener('hidden.bs.modal', () => {
    form.removeEventListener('submit', handleSubmit);
  }, { once: true });
  
  deliveryModal.show();
}

// Show success modal
function showSuccessModal(message) {
  document.getElementById('successModalContent').textContent = message;
  const modal = new bootstrap.Modal(document.getElementById('successModal'));
  modal.show();
}

// Show error modal
function showErrorModal(message) {
  document.getElementById('errorModalContent').textContent = message;
  const modal = new bootstrap.Modal(document.getElementById('errorModal'));
  modal.show();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Logout functionality
document.getElementById('logoutButton')?.addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  window.location.href = '/admin/login.html';
});

// Initialize
loadDeliveryOrders();
