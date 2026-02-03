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
      allOrders = (data.orders || []).filter(order => {
        const status = String(order.status || '').toLowerCase();
        return status !== 'to receive';
      });
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
            <button class="btn btn-sm btn-pink" onclick="window.adminCustomOrders.viewItems('${order.order_id}')" title="View Items">
              <i class="fa fa-box-open me-1 text-white"></i><span class="text-white">View</span>
            </button>
          </td>
          <td class="fw-bold">₱${parseFloat(order.total_fee || 0).toFixed(2)}</td>
          <td><span class="badge ${statusClass}">${order.status || 'Pending'}</span></td>
          <td><small>${date}</small></td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-sm btn-outline-pink" onclick="window.adminCustomOrders.viewDetails('${order.order_id}')" title="View Details">
                <i class="fa fa-eye text-pink"></i>
              </button>
              <button class="btn btn-sm btn-outline-pink" onclick="window.adminCustomOrders.editOrder('${order.order_id}')" title="Edit Order">
                <i class="fa fa-edit text-pink"></i>
              </button>
              <button class="btn btn-sm btn-outline-pink" onclick="window.adminCustomOrders.deleteOrder('${order.order_id}')" title="Delete Order">
                <i class="fa fa-trash text-pink"></i>
              </button>
            </div>
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
  async function editOrder(orderId) {
    const order = allOrders.find(o => o.order_id === orderId);
    if (!order) return;

    // Load available items first
    await loadAvailableItems();

    document.getElementById('editOrderId').value = orderId;
    document.getElementById('editName').value = order.name || '';
    document.getElementById('editEmail').value = order.email || '';
    document.getElementById('editFbLink').value = order.fb_link || '';
    document.getElementById('editStatus').value = order.status || 'Pending';
    document.getElementById('editInstructions').value = order.special_instructions || '';

    // Populate items
    populateEditItems(order);
    
    // Calculate and set total
    calculateEditTotal();

    new bootstrap.Modal(document.getElementById('editOrderModal')).show();
  }

  // Populate items in edit modal
  let availableItems = { stems: [], fillers: [], wrapping: [], addons: [] };
  let editOrderData = null;

  async function loadAvailableItems() {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_URL}/api/customization/options`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        availableItems = await response.json();
      }
    } catch (error) {
      console.error('Error loading available items:', error);
    }
  }

  function populateEditItems(order) {
    editOrderData = JSON.parse(JSON.stringify(order)); // Deep clone
    const container = document.getElementById('editItemsContainer');
    let html = '';

    // Stems
    html += `
      <div class="card mb-3 border-0 shadow-sm" id="stemsSection">
        <div class="card-header bg-light d-flex justify-content-between align-items-center">
          <h6 class="mb-0 text-pink"><i class="fas fa-flower me-2"></i>Stems</h6>
          <button type="button" class="btn btn-sm btn-outline-pink" onclick="window.adminCustomOrders.addItemRow('stems')">
            <i class="fas fa-plus me-1"></i>Add Stem
          </button>
        </div>
        <div class="card-body" id="stemsContainer">
          ${renderItemRows(editOrderData.stems || [], 'stems')}
        </div>
      </div>
    `;

    // Fillers
    html += `
      <div class="card mb-3 border-0 shadow-sm" id="fillersSection">
        <div class="card-header bg-light d-flex justify-content-between align-items-center">
          <h6 class="mb-0 text-pink"><i class="fas fa-leaf me-2"></i>Fillers</h6>
          <button type="button" class="btn btn-sm btn-outline-pink" onclick="window.adminCustomOrders.addItemRow('fillers')">
            <i class="fas fa-plus me-1"></i>Add Filler
          </button>
        </div>
        <div class="card-body" id="fillersContainer">
          ${renderItemRows(editOrderData.fillers || [], 'fillers')}
        </div>
      </div>
    `;

    // Wrapping
    html += `
      <div class="card mb-3 border-0 shadow-sm" id="wrappingSection">
        <div class="card-header bg-light d-flex justify-content-between align-items-center">
          <h6 class="mb-0 text-pink"><i class="fas fa-gift me-2"></i>Wrapping</h6>
          <button type="button" class="btn btn-sm btn-outline-pink" onclick="window.adminCustomOrders.addWrapping()">
            <i class="fas fa-plus me-1"></i>Change Wrapping
          </button>
        </div>
        <div class="card-body" id="wrappingContainer">
          ${editOrderData.wrapping ? renderWrapping(editOrderData.wrapping) : '<p class="text-muted mb-0">No wrapping selected</p>'}
        </div>
      </div>
    `;

    // Addons
    html += `
      <div class="card mb-3 border-0 shadow-sm" id="addonsSection">
        <div class="card-header bg-light d-flex justify-content-between align-items-center">
          <h6 class="mb-0 text-pink"><i class="fas fa-plus-circle me-2"></i>Add-ons</h6>
          <button type="button" class="btn btn-sm btn-outline-pink" onclick="window.adminCustomOrders.addAddon()">
            <i class="fas fa-plus me-1"></i>Add Addon
          </button>
        </div>
        <div class="card-body" id="addonsContainer">
          ${editOrderData.addons && editOrderData.addons.length > 0 ? renderAddons(editOrderData.addons) : '<p class="text-muted mb-0">No add-ons selected</p>'}
        </div>
      </div>
    `;

    container.innerHTML = html;
    attachEditEventListeners();
  }

  function renderItemRows(items, type) {
    if (!items || items.length === 0) {
      return '<p class="text-muted mb-0">No items added</p>';
    }
    return `
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
          <thead>
            <tr>
              <th>Item</th>
              <th class="text-center">Quantity</th>
              <th class="text-end">Price</th>
              <th class="text-end">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => `
              <tr class="item-row" data-item-type="${type}" data-item-index="${idx}">
                <td><small>${item.name}</small></td>
                <td>
                  <div class="input-group input-group-sm" style="width: 120px; margin: 0 auto;">
                    <button class="btn btn-outline-secondary qty-decrease" type="button">
                      <i class="fas fa-minus"></i>
                    </button>
                    <input type="number" class="form-control text-center item-quantity" 
                           value="${item.quantity}" min="0" data-price="${item.price}" data-name="${item.name}" style="padding: 0.25rem;">
                    <button class="btn btn-outline-secondary qty-increase" type="button">
                      <i class="fas fa-plus"></i>
                    </button>
                  </div>
                </td>
                <td class="text-end"><small class="text-muted">₱${parseFloat(item.price).toFixed(2)}</small></td>
                <td class="text-end"><strong class="text-pink item-subtotal">₱${(item.quantity * item.price).toFixed(2)}</strong></td>
                <td class="text-end">
                  <button type="button" class="btn btn-sm text-pink remove-item" title="Remove">
                    <i class="fas fa-times"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderWrapping(wrapping) {
    return `
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
          <tbody>
            <tr data-item-type="wrapping" data-wrapping-price="${wrapping.price}" data-wrapping-name="${wrapping.name}">
              <td><small>${wrapping.name}</small></td>
              <td class="text-end"><strong class="text-pink">₱${parseFloat(wrapping.price).toFixed(2)}</strong></td>
              <td class="text-end" style="width: 50px;">
                <button type="button" class="btn btn-sm text-pink remove-wrapping" title="Remove">
                  <i class="fas fa-times"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function renderAddons(addons) {
    return `
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
          <tbody>
            ${addons.map((addon, idx) => `
              <tr data-item-type="addons" data-item-index="${idx}" data-addon-price="${addon.price}" data-addon-name="${addon.name}">
                <td><small>${addon.name}</small></td>
                <td class="text-end"><strong class="text-pink">₱${parseFloat(addon.price).toFixed(2)}</strong></td>
                <td class="text-end" style="width: 50px;">
                  <button type="button" class="btn btn-sm text-pink remove-addon" title="Remove">
                    <i class="fas fa-times"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function attachEditEventListeners() {
    // Quantity input change
    document.querySelectorAll('.item-quantity').forEach(input => {
      input.addEventListener('input', function() {
        const row = this.closest('.item-row');
        const price = parseFloat(this.dataset.price);
        const quantity = parseInt(this.value) || 0;
        const subtotal = price * quantity;
        
        row.querySelector('.item-subtotal').textContent = `₱${subtotal.toFixed(2)}`;
        calculateEditTotal();
      });
    });

    // Decrease button
    document.querySelectorAll('.qty-decrease').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const input = this.parentElement.querySelector('.item-quantity');
        const currentValue = parseInt(input.value) || 0;
        if (currentValue > 0) {
          input.value = currentValue - 1;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });

    // Increase button
    document.querySelectorAll('.qty-increase').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const input = this.parentElement.querySelector('.item-quantity');
        const currentValue = parseInt(input.value) || 0;
        input.value = currentValue + 1;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });

    // Remove item buttons
    document.querySelectorAll('.remove-item').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const row = this.closest('tr.item-row');
        const table = this.closest('table');
        row.remove();
        // If no more rows, show "no items" message
        if (table && table.querySelectorAll('tbody tr').length === 0) {
          const container = table.closest('.table-responsive').parentElement;
          container.innerHTML = '<p class="text-muted mb-0">No items added</p>';
        }
        calculateEditTotal();
      });
    });

    // Remove wrapping button
    document.querySelectorAll('.remove-wrapping').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const container = document.getElementById('wrappingContainer');
        container.innerHTML = '<p class="text-muted mb-0">No wrapping selected</p>';
        calculateEditTotal();
      });
    });

    // Remove addon buttons
    document.querySelectorAll('.remove-addon').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const row = this.closest('tr[data-item-type="addons"]');
        const table = this.closest('table');
        row.remove();
        // If no more addon rows, show "no add-ons" message
        if (table && table.querySelectorAll('tbody tr').length === 0) {
          const container = document.getElementById('addonsContainer');
          container.innerHTML = '<p class="text-muted mb-0">No add-ons selected</p>';
        }
        calculateEditTotal();
      });
    });
  }

  // Add item row
  function addItemRow(type) {
    const items = availableItems[type] || [];
    if (items.length === 0) {
      alertWarning('No available items to add');
      return;
    }

    const container = document.getElementById(`${type}Container`);
    const existingText = container.querySelector('.text-muted');
    if (existingText) existingText.remove();

    // Create selection modal content
    let html = `
      <div class="modal fade" id="addItemModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header gradient-pink">
              <h5 class="modal-title text-white">Select ${type.charAt(0).toUpperCase() + type.slice(1)}</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <select class="form-select" id="itemSelect">
                <option value="">Choose...</option>
                ${items.map(item => `<option value="${item.id}" data-name="${item.name}" data-price="${item.price}">${item.name} - ₱${parseFloat(item.price).toFixed(2)}</option>`).join('')}
              </select>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-pink" id="confirmAddItem">Add</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    document.body.appendChild(tempDiv.firstElementChild);

    const modal = new bootstrap.Modal(document.getElementById('addItemModal'));
    modal.show();

    document.getElementById('confirmAddItem').addEventListener('click', () => {
      const select = document.getElementById('itemSelect');
      const option = select.selectedOptions[0];
      if (!option || !option.value) {
        alertWarning('Please select an item');
        return;
      }

      const item = {
        name: option.dataset.name,
        price: parseFloat(option.dataset.price),
        quantity: 1
      };

      // Check if container has "no items" message
      const noItemsMsg = container.querySelector('.text-muted');
      if (noItemsMsg) {
        container.innerHTML = renderItemRows([item], type);
      } else {
        // Add to existing table
        const tbody = container.querySelector('tbody');
        if (tbody) {
          const existingRows = tbody.querySelectorAll('tr').length;
          const newRow = `
            <tr class="item-row" data-item-type="${type}" data-item-index="${existingRows}">
              <td><small>${item.name}</small></td>
              <td>
                <div class="input-group input-group-sm" style="width: 120px; margin: 0 auto;">
                  <button class="btn btn-outline-secondary qty-decrease" type="button">
                    <i class="fas fa-minus"></i>
                  </button>
                  <input type="number" class="form-control text-center item-quantity" 
                         value="${item.quantity}" min="0" data-price="${item.price}" data-name="${item.name}" style="padding: 0.25rem;">
                  <button class="btn btn-outline-secondary qty-increase" type="button">
                    <i class="fas fa-plus"></i>
                  </button>
                </div>
              </td>
              <td class="text-end"><small class="text-muted">₱${parseFloat(item.price).toFixed(2)}</small></td>
              <td class="text-end"><strong class="text-pink item-subtotal">₱${(item.quantity * item.price).toFixed(2)}</strong></td>
              <td class="text-end">
                <button type="button" class="btn btn-sm text-pink remove-item" title="Remove">
                  <i class="fas fa-times"></i>
                </button>
              </td>
            </tr>
          `;
          tbody.insertAdjacentHTML('beforeend', newRow);
        }
      }
      attachEditEventListeners();
      calculateEditTotal();
      modal.hide();
      document.getElementById('addItemModal').remove();
    });

    document.getElementById('addItemModal').addEventListener('hidden.bs.modal', () => {
      document.getElementById('addItemModal').remove();
    });
  }

  // Add wrapping
  function addWrapping() {
    const items = availableItems.wrapping || [];
    if (items.length === 0) {
      alertWarning('No available wrapping options');
      return;
    }

    let html = `
      <div class="modal fade" id="addWrappingModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header gradient-pink">
              <h5 class="modal-title text-white">Select Wrapping</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <select class="form-select" id="wrappingSelect">
                <option value="">Choose...</option>
                ${items.map(item => `<option value="${item.id}" data-name="${item.name}" data-price="${item.price}">${item.name} - ₱${parseFloat(item.price).toFixed(2)}</option>`).join('')}
              </select>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-pink" id="confirmAddWrapping">Add</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    document.body.appendChild(tempDiv.firstElementChild);

    const modal = new bootstrap.Modal(document.getElementById('addWrappingModal'));
    modal.show();

    document.getElementById('confirmAddWrapping').addEventListener('click', () => {
      const select = document.getElementById('wrappingSelect');
      const option = select.selectedOptions[0];
      if (!option || !option.value) {
        alertWarning('Please select wrapping');
        return;
      }

      const wrapping = {
        name: option.dataset.name,
        price: parseFloat(option.dataset.price)
      };

      document.getElementById('wrappingContainer').innerHTML = renderWrapping(wrapping);
      attachEditEventListeners();
      calculateEditTotal();
      modal.hide();
      document.getElementById('addWrappingModal').remove();
    });

    document.getElementById('addWrappingModal').addEventListener('hidden.bs.modal', () => {
      document.getElementById('addWrappingModal').remove();
    });
  }

  // Add addon
  function addAddon() {
    const items = availableItems.addons || [];
    if (items.length === 0) {
      alertWarning('No available add-ons');
      return;
    }

    let html = `
      <div class="modal fade" id="addAddonModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header gradient-pink">
              <h5 class="modal-title text-white">Select Add-on</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <select class="form-select" id="addonSelect">
                <option value="">Choose...</option>
                ${items.map(item => `<option value="${item.id}" data-name="${item.name}" data-price="${item.price}">${item.name} - ₱${parseFloat(item.price).toFixed(2)}</option>`).join('')}
              </select>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-pink" id="confirmAddAddon">Add</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    document.body.appendChild(tempDiv.firstElementChild);

    const modal = new bootstrap.Modal(document.getElementById('addAddonModal'));
    modal.show();

    document.getElementById('confirmAddAddon').addEventListener('click', () => {
      const select = document.getElementById('addonSelect');
      const option = select.selectedOptions[0];
      if (!option || !option.value) {
        alertWarning('Please select an add-on');
        return;
      }

      const addon = {
        name: option.dataset.name,
        price: parseFloat(option.dataset.price)
      };

      const container = document.getElementById('addonsContainer');
      const existingText = container.querySelector('.text-muted');
      if (existingText) existingText.remove();

      container.innerHTML += renderAddons([addon]);
      attachEditEventListeners();
      calculateEditTotal();
      modal.hide();
      document.getElementById('addAddonModal').remove();
    });

    document.getElementById('addAddonModal').addEventListener('hidden.bs.modal', () => {
      document.getElementById('addAddonModal').remove();
    });
  }

  // Calculate total in edit modal
  function calculateEditTotal() {
    let total = 0;

    // Sum all item subtotals
    document.querySelectorAll('.item-subtotal').forEach(el => {
      const amount = parseFloat(el.textContent.replace('₱', '')) || 0;
      total += amount;
    });

    // Add wrapping
    const wrappingRow = document.querySelector('[data-item-type="wrapping"]');
    if (wrappingRow) {
      const wrappingPrice = parseFloat(wrappingRow.dataset.wrappingPrice) || 0;
      total += wrappingPrice;
    }

    // Add addons
    document.querySelectorAll('[data-item-type="addons"]').forEach(row => {
      const addonPrice = parseFloat(row.dataset.addonPrice) || 0;
      total += addonPrice;
    });

    document.getElementById('editTotalFee').value = total.toFixed(2);
  }

  // Save edited order
  async function saveEdit() {
    const orderId = document.getElementById('editOrderId').value;
    
    console.log('Starting saveEdit for order:', orderId);
    
    // Collect stems data
    const stems = [];
    const stemsContainer = document.getElementById('stemsContainer');
    console.log('Stems container:', stemsContainer);
    if (stemsContainer) {
      const stemInputs = stemsContainer.querySelectorAll('tr[data-item-type="stems"] .item-quantity');
      console.log('Found stem inputs:', stemInputs.length);
      stemInputs.forEach(qtyInput => {
        const quantity = parseInt(qtyInput.value) || 0;
        if (quantity > 0) {
          stems.push({
            name: qtyInput.dataset.name,
            price: parseFloat(qtyInput.dataset.price),
            quantity: quantity
          });
        }
      });
    }
    console.log('Collected stems:', stems);

    // Collect fillers data
    const fillers = [];
    const fillersContainer = document.getElementById('fillersContainer');
    console.log('Fillers container:', fillersContainer);
    if (fillersContainer) {
      const fillerInputs = fillersContainer.querySelectorAll('tr[data-item-type="fillers"] .item-quantity');
      console.log('Found filler inputs:', fillerInputs.length);
      fillerInputs.forEach(qtyInput => {
        const quantity = parseInt(qtyInput.value) || 0;
        if (quantity > 0) {
          fillers.push({
            name: qtyInput.dataset.name,
            price: parseFloat(qtyInput.dataset.price),
            quantity: quantity
          });
        }
      });
    }
    console.log('Collected fillers:', fillers);

    // Collect wrapping data
    let wrapping = null;
    const wrappingContainer = document.getElementById('wrappingContainer');
    console.log('Wrapping container:', wrappingContainer);
    if (wrappingContainer) {
      const wrappingRow = wrappingContainer.querySelector('tr[data-item-type="wrapping"]');
      console.log('Wrapping row:', wrappingRow);
      if (wrappingRow) {
        wrapping = {
          name: wrappingRow.dataset.wrappingName,
          price: parseFloat(wrappingRow.dataset.wrappingPrice)
        };
      }
    }
    console.log('Collected wrapping:', wrapping);

    // Collect addons data
    const addons = [];
    const addonsContainer = document.getElementById('addonsContainer');
    console.log('Addons container:', addonsContainer);
    if (addonsContainer) {
      const addonRows = addonsContainer.querySelectorAll('tr[data-item-type="addons"]');
      console.log('Found addon rows:', addonRows.length);
      addonRows.forEach(row => {
        addons.push({
          name: row.dataset.addonName,
          price: parseFloat(row.dataset.addonPrice)
        });
      });
    }
    console.log('Collected addons:', addons);

    const updatedData = {
      name: document.getElementById('editName').value,
      email: document.getElementById('editEmail').value,
      fb_link: document.getElementById('editFbLink').value,
      status: document.getElementById('editStatus').value,
      total_fee: parseFloat(document.getElementById('editTotalFee').value),
      special_instructions: document.getElementById('editInstructions').value,
      stems: stems,
      fillers: fillers,
      wrapping: wrapping,
      addons: addons
    };

    console.log('Final data to send:', updatedData);

    if (!orderId || !updatedData.name || !updatedData.email) {
      showError('Please fill in all required fields');
      return;
    }

    try {
      const token = localStorage.getItem('adminToken');
      console.log('Sending PUT request to:', `${API_URL}/api/admin/orders/custom/${orderId}`);
      const response = await fetch(`${API_URL}/api/admin/orders/custom/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify(updatedData)
      });

      const result = await response.json();
      console.log('Server response:', result);

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update order');
      }

      const editModal = bootstrap.Modal.getInstance(document.getElementById('editOrderModal'));
      if (editModal) {
        editModal.hide();
      }
      showSuccess('Order updated successfully');
      await loadCustomOrders();
    } catch (error) {
      console.error('Error updating order:', error);
      showError('Failed to update order: ' + error.message);
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
    alertSuccess(message);
  }

  // Show error message
  function showError(message) {
    alertError(message);
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
    deleteOrder,
    addItemRow,
    addWrapping,
    addAddon
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
