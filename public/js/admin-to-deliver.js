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
        addonsHtml += `
          <div class="col-md-6">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" name="addons[]" value="${escapeHtml(label)}" id="manualAddon${idx}">
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
    alert('Please add at least one item to the order');
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
