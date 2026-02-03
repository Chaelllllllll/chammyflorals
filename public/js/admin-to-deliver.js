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

    // Fetch regular orders and custom orders
    const ordersResponse = await fetch('/api/admin/orders', {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const orders = await ordersResponse.json();

    if (ordersResponse.ok) {
      // Filter for "To Receive" status only
      const deliveryOrders = (orders || [])
        .filter(order => String(order.status || '').toLowerCase() === 'to receive')
        .map(order => ({
          ...order,
          orderType: order.order_type || 'regular'
        }));
      
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
    const isCustom = order.orderType === 'custom';
    
    return `
      <tr>
        <td>
          <strong class="text-pink">${escapeHtml(order.order_id || '-')}</strong>
          ${isCustom ? '<span class="badge bg-pink ms-2 small">Custom</span>' : ''}
        </td>
        <td>${escapeHtml(order.name || '-')}</td>
        <td class="text-success fw-bold">₱${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-center">
          <div class="d-flex gap-2 justify-content-center">
            <button class="btn btn-sm btn-outline-pink view-details-btn" data-order-id="${escapeHtml(order.order_id)}" data-order-type="${isCustom ? 'custom' : 'regular'}" title="View Details">
              <i class="fas fa-eye me-1"></i>View
            </button>
            <button class="btn btn-sm btn-success deliver-btn" data-order-id="${escapeHtml(order.order_id)}" data-order-type="${isCustom ? 'custom' : 'regular'}" title="Mark as Delivered">
              <i class="fas fa-truck me-1"></i>Deliver
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  // Attach event listeners to deliver buttons
  document.querySelectorAll('.deliver-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const orderId = this.getAttribute('data-order-id');
      const orderType = this.getAttribute('data-order-type');
      showDeliveryConfirmation(orderId, orderType);
    });
  });

  // Attach event listeners to view-details buttons
  document.querySelectorAll('.view-details-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const orderId = this.getAttribute('data-order-id');
      const orderType = this.getAttribute('data-order-type');
      viewOrderDetails(orderId, orderType);
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
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No matching orders found</td></tr>';
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
  const isCustomOrder = order.orderType === 'custom';
  
  // Fetch customization options to get images for custom orders
  let customizationOptions = {};
  if (isCustomOrder) {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/admin/customization-options', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        // Create lookup maps by name
        customizationOptions = {
          stems: (data.stems || []).reduce((acc, item) => { acc[item.name] = item; return acc; }, {}),
          fillers: (data.fillers || []).reduce((acc, item) => { acc[item.name] = item; return acc; }, {}),
          wrapping: (data.wrapping || []).reduce((acc, item) => { acc[item.name] = item; return acc; }, {}),
          addons: (data.addons || []).reduce((acc, item) => { acc[item.name] = item; return acc; }, {})
        };
      }
    } catch (err) {
      console.error('Error fetching customization options:', err);
    }
  }
  
  // Build a professional details layout
  const statusBadge = `<span class="badge ${order.status && String(order.status).toLowerCase() === 'to receive' ? 'bg-success' : 'bg-secondary'}">${escapeHtml(order.status || 'To Receive')}</span>`;

  // Items
  let itemsHtml = '';
  
  if (isCustomOrder) {
    // Handle custom order items (stems, fillers, wrapping, addons)
    itemsHtml = '<div class="order-items-list">';
    
    // Stems
    if (order.stems && Array.isArray(order.stems) && order.stems.length) {
      itemsHtml += '<div class="mb-3"><div class="fw-semibold text-pink mb-2">Stems</div>';
      order.stems.forEach(stem => {
        const stemOption = customizationOptions.stems?.[stem.name];
        const stemImage = stemOption?.image_url || stem.image;
        itemsHtml += `
          <div class="order-item-row">
            ${stemImage ? `<img src="${escapeHtml(stemImage)}" alt="${escapeHtml(stem.name)}" class="product-thumb me-3">` : `<div class="product-thumb placeholder me-3">🌸</div>`}
            <div style="flex:1">
              <div class="fw-semibold">${escapeHtml(stem.name)}</div>
              <div class="item-meta">₱${Number(stem.price || 0).toFixed(2)}</div>
            </div>
          </div>
        `;
      });
      itemsHtml += '</div>';
    }
    
    // Fillers
    if (order.fillers && Array.isArray(order.fillers) && order.fillers.length) {
      itemsHtml += '<div class="mb-3"><div class="fw-semibold text-pink mb-2">Fillers</div>';
      order.fillers.forEach(filler => {
        const fillerOption = customizationOptions.fillers?.[filler.name];
        const fillerImage = fillerOption?.image_url || filler.image;
        itemsHtml += `
          <div class="order-item-row">
            ${fillerImage ? `<img src="${escapeHtml(fillerImage)}" alt="${escapeHtml(filler.name)}" class="product-thumb me-3">` : `<div class="product-thumb placeholder me-3">🌿</div>`}
            <div style="flex:1">
              <div class="fw-semibold">${escapeHtml(filler.name)}</div>
              <div class="item-meta">₱${Number(filler.price || 0).toFixed(2)}</div>
            </div>
          </div>
        `;
      });
      itemsHtml += '</div>';
    }
    
    // Wrapping (stored as array)
    if (order.wrapping && Array.isArray(order.wrapping) && order.wrapping.length) {
      itemsHtml += '<div class="mb-3"><div class="fw-semibold text-pink mb-2">Wrapping</div>';
      order.wrapping.forEach(wrap => {
        const wrapOption = customizationOptions.wrapping?.[wrap.name];
        const wrapImage = wrapOption?.image_url || wrap.image;
        itemsHtml += `
          <div class="order-item-row">
            ${wrapImage ? `<img src="${escapeHtml(wrapImage)}" alt="${escapeHtml(wrap.name)}" class="product-thumb me-3">` : `<div class="product-thumb placeholder me-3">🎀</div>`}
            <div style="flex:1">
              <div class="fw-semibold">${escapeHtml(wrap.name)}</div>
              <div class="item-meta">₱${Number(wrap.price || 0).toFixed(2)}</div>
            </div>
          </div>
        `;
      });
      itemsHtml += '</div>';
    }
    
    itemsHtml += '</div>';
  } else {
    // Handle regular order items
    // Helpers to normalize item data
    function getItemName(it) {
      if (!it) return 'Item';
      if (typeof it === 'string') return it;
      if (typeof it.name === 'string') return it.name;
      if (typeof it.flower_type === 'string') return it.flower_type;
      if (typeof it.product === 'string') return it.product;
      if (it.name && typeof it.name === 'object') {
        return it.name.name || it.name.title || JSON.stringify(it.name).slice(0, 100);
      }
      return JSON.stringify(it).slice(0, 100);
    }

    function getItemQty(it) {
      if (!it) return 1;
      return Number(it.quantity || it.qty || it.count || 1) || 1;
    }

    function getItemPrice(it) {
      if (!it) return 0;
      return Number(it.price || it.unit_price || it.cost || 0) || 0;
    }

    function getItemImage(it) {
      if (!it) return '';
      const img = it.image || it.img || it.photo || it.thumbnail || it.thumb || '';
      if (!img) return '';
      if (typeof img === 'string') return img;
      if (typeof img === 'object') return img.url || img.src || '';
      return '';
    }

    // Normalize generic field values to readable strings (handles objects and arrays)
    function normalizeField(val) {
      if (val == null) return '';
      if (typeof val === 'string') return val;
      if (typeof val === 'number' || typeof val === 'boolean') return String(val);
      if (Array.isArray(val)) {
        return val.map(v => normalizeField(v)).filter(Boolean).join(', ');
      }
      if (typeof val === 'object') {
        // Try common keys
        if (val.name && typeof val.name === 'string') return val.name;
        if (val.title && typeof val.title === 'string') return val.title;
        if (val.label && typeof val.label === 'string') return val.label;
        if (val.value && (typeof val.value === 'string' || typeof val.value === 'number')) return String(val.value);
        // Fallback to JSON
        try { return JSON.stringify(val); } catch (e) { return String(val); }
      }
      return String(val);
    }

    const items = Array.isArray(order.items) && order.items.length ? order.items : (order.flower_type ? (Array.isArray(order.flower_type) ? order.flower_type.map((t,i)=>({ flower_type: t, quantity: (Array.isArray(order.quantity)?order.quantity[i]:order.quantity) })) : [{ flower_type: order.flower_type, quantity: order.quantity || 1 }]) : []);

    if (items.length) {
      itemsHtml = '<div class="order-items-list">';
      items.forEach(it => {
        const rawName = getItemName(it);
        const name = escapeHtml(rawName);
        const qty = getItemQty(it);
        const colorRaw = (it && (it.color || it.variant || it.variant_color)) ? (it.color || it.variant || it.variant_color) : '';
        const color = colorRaw ? escapeHtml(normalizeField(colorRaw)) : '';
        const price = getItemPrice(it);
        const subtotal = price * qty;
        const img = getItemImage(it);

        itemsHtml += `
          <div class="order-item-row">
            ${img ? `<img src="${escapeHtml(img)}" alt="${name}" class="product-thumb me-3">` : `<div class="product-thumb placeholder me-3">*</div>`}
            <div style="flex:1">
              <div class="fw-semibold">${name}</div>
              <div class="item-meta">${color ? color + ' • ' : ''}Qty: ${qty}${price ? ' • ₱' + price.toFixed(2) : ''}</div>
            </div>
            <div class="text-end fw-bold">${price ? '₱' + subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</div>
          </div>
        `;
      });
      itemsHtml += '</div>';
    } else {
      itemsHtml = '<div class="text-muted">No items information available</div>';
    }
  }

  // Add-ons
  let addonsHtml = '';
  if (isCustomOrder && order.addons && Array.isArray(order.addons) && order.addons.length) {
    // Custom order addons are objects with name, image, price
    addonsHtml = '<div class="mb-2"><div class="details-key">Add-ons</div><div class="order-items-list mt-2">';
    order.addons.forEach(addon => {
      const addonOption = customizationOptions.addons?.[addon.name];
      const addonImage = addonOption?.image_url || addon.image;
      addonsHtml += `
        <div class="order-item-row">
          ${addonImage ? `<img src="${escapeHtml(addonImage)}" alt="${escapeHtml(addon.name)}" class="product-thumb me-3">` : `<div class="product-thumb placeholder me-3">🎁</div>`}
          <div style="flex:1">
            <div class="fw-semibold">${escapeHtml(addon.name)}</div>
            ${addon.price ? `<div class="item-meta">₱${Number(addon.price).toFixed(2)}</div>` : ''}
          </div>
        </div>
      `;
    });
    addonsHtml += '</div></div>';
  } else if (!isCustomOrder && order.addons && ((Array.isArray(order.addons) && order.addons.length) || typeof order.addons === 'string')) {
    // Regular order addons are strings
    const addons = Array.isArray(order.addons) ? order.addons : [order.addons];
    addonsHtml = `<div class="mb-2"><div class="details-key">Add-ons</div><div class="small text-muted">${addons.map(a=>escapeHtml(a)).join(', ')}</div></div>`;
  }

  content.innerHTML = `
    <div class="row g-3">
      <div class="col-md-8">
        <div class="mb-2 d-flex align-items-center justify-content-between">
          <div>
            <div class="details-key">Order ID</div>
            <div class="fw-bold text-pink fs-5">${escapeHtml(order.order_id || '-')}</div>
          </div>
          <div class="text-end">
            <div class="details-key">Status</div>
            <div>${statusBadge}</div>
          </div>
        </div>

        <div class="details-section mb-3">
          <div>
            <div class="details-key">Customer</div>
            <div class="fw-semibold">${escapeHtml(order.name || '-')}</div>
            <div class="small text-muted">${escapeHtml(order.email || '-')}</div>
          </div>
        </div>

        <div>
          <div class="details-key mb-2">Items</div>
          ${itemsHtml}
        </div>

        ${addonsHtml}
      </div>

      <div class="col-md-4">
        <div class="details-section summary-panel mb-3">
          <div class="details-key">Summary</div>
          <div class="d-flex justify-content-between mt-2">
            <div class="small text-muted">Subtotal</div>
            <div class="fw-semibold">₱${Number(order.subtotal || order.total_fee || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="d-flex justify-content-between mt-1">
            <div class="small text-muted">Delivery Fee</div>
            <div class="fw-semibold">₱${Number(order.delivery_fee || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <hr>
          <div class="d-flex justify-content-between align-items-center">
            <div class="details-key">Total</div>
            <div class="fs-5 text-success fw-bold">₱${Number(order.total_fee || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>

          <div class="mt-3">
            <div class="details-key">Rush Order</div>
            <div>${order.rush === 'Yes' ? '<span class="badge bg-warning text-dark">Yes</span>' : '<span class="badge bg-secondary">No</span>'}</div>
          </div>

          ${order.message ? `<div class="mt-3"><div class="details-key">Message</div><div class="small text-muted">${escapeHtml(order.message)}</div></div>` : ''}

          <div class="mt-3">
            <div class="details-key">Order Date</div>
            <div class="small text-muted">${order.created_at ? new Date(order.created_at).toLocaleString() : '-'}</div>
          </div>
        </div>

        <div class="d-grid gap-2">
          <button class="btn btn-outline-pink btn-sm" id="printOrderBtn"><i class="fas fa-print me-2"></i>Print</button>
          <button class="btn btn-pink btn-sm" data-bs-dismiss="modal"><i class="fas fa-times me-2"></i>Close</button>
        </div>
      </div>
    </div>
  `;

  // Print button
  const printBtn = document.getElementById('printOrderBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`<html><head><title>Order ${escapeHtml(order.order_id || '')}</title>` + document.querySelector('link[rel="stylesheet"]').outerHTML + `</head><body>` + content.innerHTML + `</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); }, 500);
    });
  }

  const modal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
  modal.show();
}

// Show delivery confirmation modal
function showDeliveryConfirmation(orderId, orderType = 'regular') {
  const order = (window.deliveryOrders || []).find(o => String(o.order_id) === String(orderId));
  if (!order) {
    showErrorModal('Order not found');
    return;
  }

  // Store order total and type for validation
  const orderTotal = Number(order.total_fee || 0);
  const isCustomOrder = orderType === 'custom';
  
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
    const paymentMethod = (document.getElementById('deliveryPaymentMethod') && document.getElementById('deliveryPaymentMethod').value) ? document.getElementById('deliveryPaymentMethod').value : '';
    
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

    if (!paymentMethod) {
      showErrorModal('Please select a payment method');
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
      
      // Use different endpoint for custom orders
      const endpoint = isCustomOrder 
        ? `/api/admin/orders/custom/${orderId}`
        : `/api/admin/orders/${orderId}/deliver`;
      
      const method = isCustomOrder ? 'PUT' : 'POST';
      
      const body = isCustomOrder 
        ? JSON.stringify({ status: 'Delivered' })
        : JSON.stringify({ 
            received: amountPaid,
            receiverName: receiverName,
            deliveredBy: deliveredBy,
            notes: notes || undefined,
            payment_method: paymentMethod
          });
      
      const response = await fetch(endpoint, {
        method: method,
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: body,
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

// Manual Order Form Functionality
let _manualProductsCache = null;

// Load products for manual order form
async function loadProductsForManualOrder() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('Failed to fetch products');
    const products = await res.json();
    _manualProductsCache = products || [];

    // Populate all flower type selects
    const flowerSelects = document.querySelectorAll('#manualOrderForm .item-flower');
    flowerSelects.forEach(select => {
      populateFlowerSelect(select);
      
      // Add change listener to populate colors and add-ons
      select.addEventListener('change', function(e) {
        const row = this.closest('.order-item');
        if (row) populateColorSelectForRow(row);
        onManualFlowerTypeChange(e);
      });
      
      // Populate colors for initial item if already selected
      const row = select.closest('.order-item');
      if (row && select.value) {
        populateColorSelectForRow(row);
      }
    });

    return products;
  } catch (err) {
    console.error('Failed loading products for manual order:', err);
    return [];
  }
}

// Populate a single flower select element
function populateFlowerSelect(selectElement) {
  const seen = new Set();
  selectElement.innerHTML = '<option value="">Select Flower Type</option>';

  // Group pricing rows by category
  const groups = {};
  _manualProductsCache.forEach(p => {
    const cat = p.category && String(p.category).trim() ? p.category : 'Uncategorized';
    if (!groups[cat]) groups[cat] = [];
    if (Array.isArray(p.pricing)) {
      p.pricing.forEach(r => {
        const code = String(r.label || r.set || '').trim();
        if (!code) return;
        if (seen.has(code)) return;
        seen.add(code);
        const parts = [];
        if (r.set) parts.push(String(r.set));
        if (r.price != null) parts.push('\u20B1' + Number(r.price));
        const text = `${code}${parts.length ? ' - ' + parts.join(' - ') : ''}`;
        groups[cat].push({ code, text, productId: p.id });
      });
    }
  });

  Object.keys(groups).sort().forEach(cat => {
    const items = groups[cat];
    if (!items.length) return;
    const og = document.createElement('optgroup');
    og.label = cat;
    items.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.code;
      opt.textContent = it.text;
      opt.dataset.productId = it.productId;
      selectElement.appendChild(opt);
    });
  });

  // Fallback: if no pricing rows, group by product name
  if (selectElement.options.length <= 1 && _manualProductsCache.length) {
    const namesByCat = {};
    _manualProductsCache.forEach(p => {
      const cat = p.category && String(p.category).trim() ? p.category : 'Uncategorized';
      if (!namesByCat[cat]) namesByCat[cat] = [];
      const code = String(p.name || '').trim();
      if (!code || seen.has(code)) return;
      seen.add(code);
      namesByCat[cat].push({ code, text: code, productId: p.id });
    });
    Object.keys(namesByCat).sort().forEach(cat => {
      const og = document.createElement('optgroup');
      og.label = cat;
      namesByCat[cat].forEach(it => {
        const opt = document.createElement('option');
        opt.value = it.code;
        opt.textContent = it.text;
        opt.dataset.productId = it.productId;
        selectElement.appendChild(opt);
      });
    });
  }
}

// Populate color select for a specific row
function populateColorSelectForRow(row) {
  try {
    const select = row.querySelector('.item-flower');
    const colorSelect = row.querySelector('.item-color');
    if (!select || !colorSelect) return;
    const opt = select.selectedOptions && select.selectedOptions[0];
    const productId = opt && opt.dataset && opt.dataset.productId;
    
    // Clear and reset
    colorSelect.innerHTML = '<option value="">Select Color</option>';
    if (!productId || !_manualProductsCache) return;
    
    const prod = (_manualProductsCache || []).find(p => String(p.id) === String(productId));
    if (!prod || !Array.isArray(prod.colors) || !prod.colors.length) return;
    
    prod.colors.forEach(c => {
      let value = c.value || c.hex || c.color || '';
      // Normalize rgb(...) to hex
      if (typeof value === 'string' && value.trim().toLowerCase().startsWith('rgb')) {
        const m = value.match(/rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
        if (m) {
          const r = Math.max(0, Math.min(255, Number(m[1]||0)));
          const g = Math.max(0, Math.min(255, Number(m[2]||0)));
          const b = Math.max(0, Math.min(255, Number(m[3]||0)));
          value = '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('').toLowerCase();
        }
      }
      const name = c.name || value || '';
      const optEl = document.createElement('option');
      optEl.value = value;
      // Use a colored bullet in the option
      optEl.textContent = `● ${name}`;
      if (value) optEl.style.color = value;
      optEl.dataset.colorName = name;
      colorSelect.appendChild(optEl);
    });
  } catch (err) {
    console.error('Error populating color select:', err);
  }
}

// Handle flower type change to show add-ons
async function onManualFlowerTypeChange(e) {
  const code = (e.target.value || '').trim();
  const addonsContainer = document.getElementById('manualAddonsContainer');
  const addonsSection = document.getElementById('manualAddonsSection');
  
  if (!code) {
    if (addonsSection) addonsSection.style.display = 'none';
    return;
  }

  try {
    const products = _manualProductsCache || (await (await fetch('/api/products')).json());
    if (!_manualProductsCache) _manualProductsCache = products || [];

    // Find product that matches the selected code
    let match = null;
    for (const p of products) {
      if (p.pricing && Array.isArray(p.pricing)) {
        const row = p.pricing.find(r => {
          const label = String(r.label || '');
          const set = String(r.set || '');
          return label === code || label.includes(code) || set === code || set.includes(code);
        });
        if (row) { match = { product: p, row }; break; }
      }
      if (String(p.name || '').toUpperCase().includes(code.toUpperCase())) {
        match = { product: p, row: null };
        break;
      }
    }

    if (!match) {
      if (addonsSection) addonsSection.style.display = 'none';
      return;
    }

    const { product } = match;
    
    // Show add-ons if available
    if (product.addons && Array.isArray(product.addons) && product.addons.length > 0) {
      let addonsHtml = '<div class="row g-3">';
      product.addons.forEach((addon, idx) => {
        const label = escapeHtml(String(addon.label || addon.name || addon));
        const price = addon.price != null ? `₱${Number(addon.price).toLocaleString()}` : '';
        // Include price in value so backend can parse it
        const value = escapeHtml(label + (price ? ` - ${price}` : ''));
        addonsHtml += `
          <div class="col-md-6">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" name="addons[]" value="${value}" id="manualAddon${idx}">
              <label class="form-check-label" for="manualAddon${idx}">
                ${label} ${price ? `<span class="text-success fw-semibold">(${price})</span>` : ''}
              </label>
            </div>
          </div>
        `;
      });
      addonsHtml += '</div>';
      addonsContainer.innerHTML = addonsHtml;
      addonsSection.style.display = 'block';
    } else {
      addonsSection.style.display = 'none';
    }
  } catch (err) {
    console.error('Error loading add-ons:', err);
    if (addonsSection) addonsSection.style.display = 'none';
  }
}

// Add item button handler
document.getElementById('manualAddItemBtn')?.addEventListener('click', function() {
  const container = document.getElementById('manualItemsContainer');
  const items = container.querySelectorAll('.order-item');
  const newIndex = items.length;

  const newItem = document.createElement('div');
  newItem.className = 'order-item mb-2';
  newItem.innerHTML = `
    <div class="d-flex align-items-center gap-2 p-2 bg-light rounded border w-100">
      <span class="badge bg-pink text-white text-center" style="width: 65px; flex-shrink: 0;">Item ${newIndex + 1}</span>
      <select class="form-select form-select-sm item-flower" name="flower_type_${newIndex}" required style="flex: 3;">
        <option value="">Flower Type</option>
      </select>
      <select class="form-select form-select-sm item-color" name="color_${newIndex}" aria-label="Color" style="flex: 2;">
        <option value="">Color</option>
      </select>
      <input type="number" class="form-control form-control-sm item-quantity text-center" name="quantity_${newIndex}" min="1" value="1" required style="width: 65px; flex-shrink: 0;" placeholder="Qty">
      <button type="button" class="btn btn-sm btn-outline-danger remove-item" style="width: 36px; height: 31px; flex-shrink: 0; padding: 0;">
        <i class="fa fa-times"></i>
      </button>
    </div>
  `;

  container.appendChild(newItem);

  // Populate the new select
  const newSelect = newItem.querySelector('.item-flower');
  populateFlowerSelect(newSelect);
  
  // Add change listener to populate colors and add-ons
  newSelect.addEventListener('change', function(e) {
    const row = this.closest('.order-item');
    if (row) populateColorSelectForRow(row);
    onManualFlowerTypeChange(e);
  });

  // Add remove handler
  newItem.querySelector('.remove-item').addEventListener('click', function() {
    newItem.remove();
    updateItemBadges();
  });

  updateItemBadges();
});

// Remove item handlers for initial item
document.querySelectorAll('#manualItemsContainer .remove-item').forEach(btn => {
  btn.addEventListener('click', function() {
    const item = this.closest('.order-item');
    item.remove();
    updateItemBadges();
  });
});

// Update item badges
function updateItemBadges() {
  const items = document.querySelectorAll('#manualItemsContainer .order-item');
  items.forEach((item, index) => {
    const badge = item.querySelector('.badge');
    if (badge) badge.textContent = `Item ${index + 1}`;
    
    // Show/hide remove button (hide for first item if it's the only one)
    const removeBtn = item.querySelector('.remove-item');
    if (removeBtn) {
      removeBtn.style.display = items.length > 1 ? 'block' : 'none';
    }
  });
}

// Handle manual order form submission
document.getElementById('manualOrderForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnHtml = submitBtn ? submitBtn.innerHTML : null;
  const form = e.target;

  // Validate form
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  const data = {};
  data.user_name = form.querySelector('input[name="user_name"]').value;
  data.user_email = form.querySelector('input[name="user_email"]').value;
  data.fb_link = 'Manual Order'; // Set default value since we removed the field
  data.message = ''; // No message field
  data.rush = 'No'; // No rush field
  data.addons = Array.from(form.querySelectorAll('input[name="addons[]"]:checked')).map(x => x.value);

  // Collect items
  const items = [];
  const itemRows = document.querySelectorAll('#manualItemsContainer .order-item');
  itemRows.forEach((row, i) => {
    const flower = row.querySelector('.item-flower').value;
    const qty = parseInt(row.querySelector('.item-quantity').value) || 1;
    const colorEl = row.querySelector('.item-color');
    const colorValue = colorEl ? (colorEl.value || '') : '';
    const colorName = colorEl && colorEl.selectedOptions && colorEl.selectedOptions[0] ? (colorEl.selectedOptions[0].dataset.colorName || colorEl.selectedOptions[0].textContent) : '';
    if (!flower) return;
    const itemObj = { flower_type: flower, quantity: qty };
    if (colorValue) itemObj.color = { name: colorName, value: colorValue };
    items.push(itemObj);
  });

  if (!items.length) {
    alertWarning('Please add at least one item to the order');
    return;
  }

  data.items = items;
  data.flower_type = items.map(it => `${it.flower_type} x${it.quantity}`).join('; ');
  data.quantity = items.reduce((s, it) => s + (parseInt(it.quantity) || 0), 0) || 1;

  // Set status to Delivered for manual orders
  data.status = 'Delivered';
  data.manual_order = true;

  console.log('Creating manual order with data:', { status: data.status, manual_order: data.manual_order });

  // Add timestamps
  try {
    const now = new Date();
    data.created_at = now.toISOString();
    data.created_at_local = now.toLocaleString();
    data.tz_offset_minutes = now.getTimezoneOffset();
    const pad = (n) => String(n).padStart(2, '0');
    data.created_at_local_iso = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  } catch (e) { /* ignore */ }

  try {
    // Show loading state
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Creating...';
    }

    const token = localStorage.getItem('adminToken');
    const response = await fetch('/api/inquiry', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify(data),
    });
    const result = await response.json();

    if (response.ok) {
      // Hide manual order modal
      const manualModalEl = document.getElementById('manualOrderModal');
      if (manualModalEl) {
        const manualModalInstance = bootstrap.Modal.getInstance(manualModalEl) || new bootstrap.Modal(manualModalEl);
        manualModalInstance.hide();
      }

      // Show success with order ID
      const orderId = result.orderId || result.order_id || '';
      if (orderId) {
        document.getElementById('createdOrderId').textContent = orderId;
        const successModal = new bootstrap.Modal(document.getElementById('orderCreatedModal'));
        successModal.show();
        
        // Reset form
        form.reset();
        form.classList.remove('was-validated');
        
        // Reload delivery orders
        loadDeliveryOrders();
      }
    } else {
      showErrorModal(result.error || 'Failed to create order. Please try again.');
    }
  } catch (error) {
    showErrorModal('Failed to create order. Please try again.');
    console.error('Error:', error);
  } finally {
    // Restore button
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      if (originalBtnHtml !== null) submitBtn.innerHTML = originalBtnHtml;
    }
  }
});

// Initialize manual order form when modal is shown
document.getElementById('manualOrderModal')?.addEventListener('shown.bs.modal', function() {
  if (!_manualProductsCache) {
    loadProductsForManualOrder();
  }
  updateItemBadges();
});
