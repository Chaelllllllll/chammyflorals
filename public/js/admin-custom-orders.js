// admin-custom-orders.js - Admin Custom Orders Management
(function() {
  const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://chammyflorals.vercel.app';

  let allOrders = [];
  let filteredOrders = [];

  // Load custom orders from API
  async function loadCustomOrders() {
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        window.location.href = 'login.html';
        return;
      }

      const response = await fetch(`${API_URL}/api/admin/orders/custom`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('adminToken');
          window.location.href = 'login.html';
          return;
        }
        throw new Error('Failed to load custom orders');
      }

      const data = await response.json();
      allOrders = data.orders || [];
      filteredOrders = [...allOrders];
      
      renderOrdersTable();
    } catch (error) {
      console.error('Error loading custom orders:', error);
      showError('Failed to load custom orders');
    }
  }

  // Render orders table
  function renderOrdersTable() {
    const tbody = document.getElementById('ordersTableBody');
    
    if (filteredOrders.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4">
            <i class="fa fa-inbox fa-3x text-muted opacity-50 mb-3"></i>
            <p class="text-muted">No custom orders found</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filteredOrders.map(order => {
      const statusClass = getStatusClass(order.status);
      const itemsSummary = getItemsSummary(order);
      const date = new Date(order.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      return `
        <tr>
          <td><strong>${order.order_id}</strong></td>
          <td>${order.name || 'N/A'}</td>
          <td><small>${order.email || 'N/A'}</small></td>
          <td>
            <button class="btn btn-sm btn-outline-info" onclick="window.adminCustomOrders.viewItems('${order.order_id}')" title="View Items">
              <i class="fa fa-box-open me-1"></i>View
            </button>
          </td>
          <td class="fw-bold">₱${parseFloat(order.total_fee || 0).toFixed(2)}</td>
          <td><span class="badge ${statusClass}">${order.status || 'Pending'}</span></td>
          <td><small>${date}</small></td>
          <td>
            <button class="btn btn-sm btn-outline-primary" onclick="window.adminCustomOrders.viewDetails('${order.order_id}')" title="View Details">
              <i class="fa fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline-success" onclick="window.adminCustomOrders.editOrder('${order.order_id}')" title="Edit Order">
              <i class="fa fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="window.adminCustomOrders.deleteOrder('${order.order_id}')" title="Delete Order">
              <i class="fa fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Get status badge class
  function getStatusClass(status) {
    const classes = {
      'Pending': 'bg-warning text-dark',
      'Processing': 'bg-info text-white',
      'Ready': 'bg-primary text-white',
      'Delivered': 'bg-success text-white',
      'Cancelled': 'bg-danger text-white'
    };
    return classes[status] || 'bg-secondary text-white';
  }

  // Get items summary
  function getItemsSummary(order) {
    if (!order) return 'N/A';
    
    const parts = [];
    if (order.stems && order.stems.length > 0) {
      const totalStems = order.stems.reduce((sum, s) => sum + (s.quantity || 0), 0);
      parts.push(`${totalStems} stem(s)`);
    }
    if (order.fillers && order.fillers.length > 0) {
      const totalFillers = order.fillers.reduce((sum, f) => sum + (f.quantity || 0), 0);
      parts.push(`${totalFillers} filler(s)`);
    }
    if (order.wrapping) {
      parts.push('wrapping');
    }
    if (order.addons && order.addons.length > 0) {
      parts.push(`${order.addons.length} addon(s)`);
    }
    
    return parts.join(', ') || 'No items';
  }

  // View items in modal
  function viewItems(orderId) {
    const order = allOrders.find(o => o.order_id === orderId);
    if (!order) return;

    let html = '';

    // Stems
    if (order.stems && order.stems.length > 0) {
      html += `
        <div class="mb-4">
          <h6 class="fw-bold text-pink mb-3">
            <i class="fas fa-flower text-pink me-2"></i>Stems
          </h6>
          <div class="row g-3">
            ${order.stems.map(s => `
              <div class="col-md-6">
                <div class="card border-0 shadow-sm h-100">
                  <div class="card-body p-3">
                    <div class="d-flex align-items-center">
                      ${s.image_url ? 
                        `<img src="${s.image_url}" alt="${s.name}" class="rounded" style="width: 60px; height: 60px; object-fit: cover;">` :
                        `<div class="bg-light rounded d-flex align-items-center justify-content-center" style="width: 60px; height: 60px;">
                          <i class="fas fa-image text-muted"></i>
                        </div>`
                      }
                      <div class="ms-3 flex-grow-1">
                        <div class="fw-semibold">${s.name}</div>
                        <div class="small text-muted">Qty: ${s.quantity}</div>
                        <div class="text-pink fw-semibold">₱${parseFloat(s.price).toFixed(2)} each</div>
                      </div>
                      <div class="text-end">
                        <div class="fw-bold text-pink">₱${(s.price * s.quantity).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Fillers
    if (order.fillers && order.fillers.length > 0) {
      html += `
        <div class="mb-4">
          <h6 class="fw-bold text-pink mb-3">
            <i class="fas fa-leaf text-pink me-2"></i>Fillers
          </h6>
          <div class="row g-3">
            ${order.fillers.map(f => `
              <div class="col-md-6">
                <div class="card border-0 shadow-sm h-100">
                  <div class="card-body p-3">
                    <div class="d-flex align-items-center">
                      ${f.image_url ? 
                        `<img src="${f.image_url}" alt="${f.name}" class="rounded" style="width: 60px; height: 60px; object-fit: cover;">` :
                        `<div class="bg-light rounded d-flex align-items-center justify-content-center" style="width: 60px; height: 60px;">
                          <i class="fas fa-image text-muted"></i>
                        </div>`
                      }
                      <div class="ms-3 flex-grow-1">
                        <div class="fw-semibold">${f.name}</div>
                        <div class="small text-muted">Qty: ${f.quantity}</div>
                        <div class="text-pink fw-semibold">₱${parseFloat(f.price).toFixed(2)} each</div>
                      </div>
                      <div class="text-end">
                        <div class="fw-bold text-pink">₱${(f.price * f.quantity).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Wrapping
    if (order.wrapping) {
      html += `
        <div class="mb-4">
          <h6 class="fw-bold text-pink mb-3">
            <i class="fas fa-gift text-pink me-2"></i>Wrapping
          </h6>
          <div class="card border-0 shadow-sm">
            <div class="card-body p-3">
              <div class="d-flex align-items-center">
                ${order.wrapping.image_url ? 
                  `<img src="${order.wrapping.image_url}" alt="${order.wrapping.name}" class="rounded" style="width: 60px; height: 60px; object-fit: cover;">` :
                  `<div class="bg-light rounded d-flex align-items-center justify-content-center" style="width: 60px; height: 60px;">
                    <i class="fas fa-image text-muted"></i>
                  </div>`
                }
                <div class="ms-3 flex-grow-1">
                  <div class="fw-semibold">${order.wrapping.name}</div>
                  <div class="text-pink fw-semibold">₱${parseFloat(order.wrapping.price).toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // Add-ons
    if (order.addons && order.addons.length > 0) {
      html += `
        <div class="mb-4">
          <h6 class="fw-bold text-pink mb-3">
            <i class="fas fa-star text-pink me-2"></i>Add-ons
          </h6>
          <div class="row g-3">
            ${order.addons.map(a => `
              <div class="col-md-6">
                <div class="card border-0 shadow-sm h-100">
                  <div class="card-body p-3">
                    <div class="d-flex align-items-center">
                      ${a.image_url ? 
                        `<img src="${a.image_url}" alt="${a.name}" class="rounded" style="width: 60px; height: 60px; object-fit: cover;">` :
                        `<div class="bg-light rounded d-flex align-items-center justify-content-center" style="width: 60px; height: 60px;">
                          <i class="fas fa-image text-muted"></i>
                        </div>`
                      }
                      <div class="ms-3 flex-grow-1">
                        <div class="fw-semibold">${a.name}</div>
                        <div class="text-pink fw-semibold">₱${parseFloat(a.price).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (!html) {
      html = '<div class="text-center text-muted py-4"><i class="fas fa-inbox fa-3x mb-3 opacity-50"></i><p>No items found</p></div>';
    }

    document.getElementById('itemsModalContent').innerHTML = html;
    document.getElementById('itemsModalTitle').textContent = `Items - Order #${order.order_id}`;
    new bootstrap.Modal(document.getElementById('viewItemsModal')).show();
  }

  // View order details
  function viewDetails(orderId) {
    const order = allOrders.find(o => o.order_id === orderId);
    if (!order) return;
    const date = new Date(order.created_at).toLocaleString();

    let html = `
      <!-- Header Section -->
      <div class="card border-0 shadow-sm mb-4" style="background: linear-gradient(135deg, #fff6f9 0%, #ffe9f0 100%);">
        <div class="card-body p-4">
          <h5 class="text-pink fw-bold mb-4"><i class="fas fa-receipt me-2"></i>Order #${order.order_id}</h5>
          
          <!-- Customer Info -->
          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <div class="d-flex align-items-start">
                <i class="fas fa-user text-pink me-3 mt-1"></i>
                <div class="flex-grow-1">
                  <small class="text-muted d-block mb-1">Customer</small>
                  <strong class="text-dark">${order.name || 'N/A'}</strong>
                </div>
              </div>
            </div>
            <div class="col-md-6">
              <div class="d-flex align-items-start">
                <i class="fas fa-envelope text-pink me-3 mt-1"></i>
                <div class="flex-grow-1">
                  <small class="text-muted d-block mb-1">Email</small>
                  <strong class="text-dark text-break" style="font-size: 0.9rem;">${order.email || 'N/A'}</strong>
                </div>
              </div>
            </div>
            <div class="col-md-6">
              <div class="d-flex align-items-start">
                <i class="fas fa-calendar text-pink me-3 mt-1"></i>
                <div class="flex-grow-1">
                  <small class="text-muted d-block mb-1">Order Date</small>
                  <strong class="text-dark">${date}</strong>
                </div>
              </div>
            </div>
            <div class="col-md-6">
              <div class="d-flex align-items-start">
                <i class="fab fa-facebook text-pink me-3 mt-1"></i>
                <div class="flex-grow-1">
                  <small class="text-muted d-block mb-1">Facebook</small>
                  ${order.fb_link ? `<a href="${order.fb_link}" target="_blank" class="text-pink text-decoration-none fw-semibold text-break"><i class="fas fa-external-link-alt me-1 small"></i>View Profile</a>` : '<span class="text-muted">N/A</span>'}
                </div>
              </div>
            </div>
          </div>
          
          <!-- Total & Status -->
          <div class="border-top pt-3 mt-3 text-center">
            <small class="text-muted d-block mb-2">Total Amount</small>
            <h3 class="text-pink fw-bold mb-2">₱${parseFloat(order.total_fee || 0).toFixed(2)}</h3>
            <span class="badge ${getStatusClass(order.status)} px-3 py-2">${order.status}</span>
          </div>
        </div>
      </div>

      <!-- Items Section -->
      <h6 class="text-pink fw-bold mb-3"><i class="fas fa-box-open me-2"></i>Order Items</h6>
    `;

    // Stems
    if (order.stems && order.stems.length > 0) {
      html += `
        <div class="card border-0 shadow-sm mb-3">
          <div class="card-header bg-white border-bottom">
            <h6 class="mb-0 text-pink fw-semibold"><i class="fas fa-flower me-2"></i>Stems</h6>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-sm table-hover mb-0">
                <thead style="background: #fff6f9;">
                  <tr>
                    <th class="border-0">Item</th>
                    <th class="text-center border-0">Quantity</th>
                    <th class="text-end border-0">Price</th>
                    <th class="text-end border-0">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.stems.map(s => `
                    <tr>
                      <td>${s.name}</td>
                      <td class="text-center">${s.quantity}</td>
                      <td class="text-end">₱${parseFloat(s.price).toFixed(2)}</td>
                      <td class="text-end fw-semibold text-pink">₱${(s.price * s.quantity).toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    // Fillers
    if (order.fillers && order.fillers.length > 0) {
      html += `
        <div class="card border-0 shadow-sm mb-3">
          <div class="card-header bg-white border-bottom">
            <h6 class="mb-0 text-pink fw-semibold"><i class="fas fa-leaf me-2"></i>Fillers</h6>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-sm table-hover mb-0">
                <thead style="background: #fff6f9;">
                  <tr>
                    <th class="border-0">Item</th>
                    <th class="text-center border-0">Quantity</th>
                    <th class="text-end border-0">Price</th>
                    <th class="text-end border-0">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.fillers.map(f => `
                    <tr>
                      <td>${f.name}</td>
                      <td class="text-center">${f.quantity}</td>
                      <td class="text-end">₱${parseFloat(f.price).toFixed(2)}</td>
                      <td class="text-end fw-semibold text-pink">₱${(f.price * f.quantity).toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    // Wrapping
    if (order.wrapping) {
      html += `
        <div class="card border-0 shadow-sm mb-3">
          <div class="card-header bg-white border-bottom">
            <h6 class="mb-0 text-pink fw-semibold"><i class="fas fa-gift me-2"></i>Wrapping</h6>
          </div>
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center">
              <span class="fw-semibold">${order.wrapping.name}</span>
              <span class="fw-bold text-pink">₱${parseFloat(order.wrapping.price).toFixed(2)}</span>
            </div>
          </div>
        </div>
      `;
    }

    // Add-ons
    if (order.addons && order.addons.length > 0) {
      html += `
        <div class="card border-0 shadow-sm mb-3">
          <div class="card-header bg-white border-bottom">
            <h6 class="mb-0 text-pink fw-semibold"><i class="fas fa-star me-2"></i>Add-ons</h6>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-sm table-hover mb-0">
                <thead style="background: #fff6f9;">
                  <tr>
                    <th class="border-0">Item</th>
                    <th class="text-end border-0">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.addons.map(a => `
                    <tr>
                      <td>${a.name}</td>
                      <td class="text-end fw-semibold text-pink">₱${parseFloat(a.price).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // Special Instructions
    if (order.special_instructions) {
      html += `
        <div class="card border-0 shadow-sm mb-3">
          <div class="card-header bg-white border-bottom">
            <h6 class="mb-0 text-pink fw-semibold"><i class="fas fa-comment-dots me-2"></i>Special Instructions</h6>
          </div>
          <div class="card-body">
            <p class="mb-0 fst-italic text-muted">"${order.special_instructions}"</p>
          </div>
        </div>
      `;
    }

    document.getElementById('orderDetailsContent').innerHTML = html;
    new bootstrap.Modal(document.getElementById('orderDetailsModal')).show();
  }

  // Edit order
  function editOrder(orderId) {
    const order = allOrders.find(o => o.order_id === orderId);
    if (!order) return;

    document.getElementById('editOrderId').value = orderId;
    document.getElementById('editName').value = order.name || '';
    document.getElementById('editEmail').value = order.email || '';
    document.getElementById('editFbLink').value = order.fb_link || '';
    document.getElementById('editStatus').value = order.status || 'Pending';
    document.getElementById('editTotalFee').value = order.total_fee || 0;
    document.getElementById('editInstructions').value = order.special_instructions || '';

    new bootstrap.Modal(document.getElementById('editOrderModal')).show();
  }

  // Save edited order
  async function saveEdit() {
    const orderId = document.getElementById('editOrderId').value;
    const updatedData = {
      name: document.getElementById('editName').value,
      email: document.getElementById('editEmail').value,
      fb_link: document.getElementById('editFbLink').value,
      status: document.getElementById('editStatus').value,
      total_fee: parseFloat(document.getElementById('editTotalFee').value),
      special_instructions: document.getElementById('editInstructions').value
    };

    if (!orderId || !updatedData.name || !updatedData.email) {
      showError('Please fill in all required fields');
      return;
    }

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_URL}/api/admin/orders/custom/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify(updatedData)
      });

      if (!response.ok) {
        throw new Error('Failed to update order');
      }

      bootstrap.Modal.getInstance(document.getElementById('editOrderModal')).hide();
      showSuccess('Order updated successfully');
      loadCustomOrders();
    } catch (error) {
      console.error('Error updating order:', error);
      showError('Failed to update order');
    }
  }

  // Delete order
  function deleteOrder(orderId) {
    document.getElementById('deleteOrderId').value = orderId;
    new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
  }

  // Confirm delete
  async function confirmDelete() {
    const orderId = document.getElementById('deleteOrderId').value;
    if (!orderId) return;

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_URL}/api/admin/orders/custom/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to delete order');
      }

      bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
      showSuccess('Order deleted successfully');
      loadCustomOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      showError('Failed to delete order');
    }
  }

  // Filter orders
  function filterOrders() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;

    filteredOrders = allOrders.filter(order => {
      const matchesSearch = !searchTerm || 
        order.order_id.toLowerCase().includes(searchTerm) ||
        (order.name && order.name.toLowerCase().includes(searchTerm)) ||
        (order.email && order.email.toLowerCase().includes(searchTerm));

      const matchesStatus = !statusFilter || order.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    renderOrdersTable();
  }

  // Show success message
  function showSuccess(message) {
    alert(message); // Replace with better toast notification
  }

  // Show error message
  function showError(message) {
    alert(message); // Replace with better toast notification
  }

  // Initialize
  function init() {
    // Load orders
    loadCustomOrders();

    // Event listeners
    document.getElementById('searchBtn')?.addEventListener('click', filterOrders);
    document.getElementById('searchInput')?.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') filterOrders();
    });
    document.getElementById('statusFilter')?.addEventListener('change', filterOrders);
    document.getElementById('refreshBtn')?.addEventListener('click', loadCustomOrders);
    document.getElementById('saveEditBtn')?.addEventListener('click', saveEdit);
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', confirmDelete);
  }

  // Expose functions globally
  window.adminCustomOrders = {
    viewItems,
    viewDetails,
    editOrder,
    deleteOrder
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
