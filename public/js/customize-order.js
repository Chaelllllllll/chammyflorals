// Customize Order Modal Handler
(function() {
  const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
  
  let customizationOptions = {
    stems: [],
    fillers: [],
    wrapping: [],
    addons: []
  };
  
  let selectedItems = {
    stems: [],      // { id, name, price, quantity }
    fillers: [],    // { id, name, price, quantity }
    wrapping: null, // { id, name, price }
    addons: []      // { id, name, price }
  };

  // Load rush fee setting from API
  async function loadRushFeeSetting() {
    try {
      const res = await fetch(`${API_URL}/api/settings/rush-fee`);
      if (!res.ok) throw new Error('Failed to load rush fee');
      const data = await res.json();
      window._customRushFee = data.rushFee || 50;
    } catch (err) {
      console.error('Failed to load rush fee setting:', err);
      window._customRushFee = 50; // Default fallback
    }
  }

  // Load customization options from API
  async function loadCustomizationOptions() {
    try {
      const res = await fetch(`${API_URL}/api/customization/options`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!res.ok) throw new Error('Failed to load options');
      
      customizationOptions = await res.json();
      renderAllOptions();
    } catch (err) {
      showError();
    }
  }

  // Load Telegram bot link from API
  async function loadTelegramLink() {
    try {
      const res = await fetch(`${API_URL}/api/settings/telegram-link`);
      if (!res.ok) throw new Error('Failed to load telegram link');
      const data = await res.json();
      const btn = document.getElementById('tg-track-btn-custom');
      if (btn && data.telegram_bot_link) {
        btn.href = data.telegram_bot_link;
      }
    } catch (err) {
      console.error('Failed to load telegram link:', err);
    }
  }

  function showError() {
    const containers = ['customStemsContainer', 'customFillersContainer', 'customWrappingContainer', 'customAddonsContainer'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        container.innerHTML = `
          <div class="text-center text-danger py-3">
            <i class="fa fa-exclamation-circle me-2"></i>Failed to load options
          </div>
        `;
      }
    });
  }

  function renderAllOptions() {
    renderQuantityOptions('stems', customizationOptions.stems, 'customStemsContainer');
    renderQuantityOptions('fillers', customizationOptions.fillers, 'customFillersContainer');
    renderSingleSelectOptions('wrapping', customizationOptions.wrapping, 'customWrappingContainer');
    renderCheckboxOptions('addons', customizationOptions.addons, 'customAddonsContainer');
    updateOrderSummary();
    restoreCustomSelections();
  }

  // Render options with quantity selector (for stems and fillers)
  function renderQuantityOptions(type, options, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!options.length) {
      container.innerHTML = `
        <div class="text-center text-muted py-3">
          <i class="fa fa-inbox opacity-50 me-2"></i>No ${type} available
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="row g-2">
        ${options.map(opt => `
          <div class="col-md-6">
            <div class="customize-option-card d-flex align-items-center p-2 border rounded" data-type="${type}" data-id="${opt.id}">
              ${opt.image_url ? 
                `<img src="${opt.image_url}" alt="${opt.name}" class="customize-option-image me-2 has-preview" data-preview-url="${opt.image_url}" style="width:50px;height:50px;object-fit:cover;border-radius:8px;cursor:pointer;">` : 
                `<div class="customize-option-image me-2 d-flex align-items-center justify-content-center bg-light" style="width:50px;height:50px;border-radius:8px;">
                  <i class="fa fa-image text-muted"></i>
                </div>`
              }
              <div class="flex-grow-1">
                <div class="fw-semibold small">${opt.name}</div>
                <div class="text-purple small">₱${parseFloat(opt.price).toFixed(2)}</div>
              </div>
              <div class="input-group input-group-sm" style="width:100px;">
                <button type="button" class="btn btn-outline-secondary qty-btn" data-action="decrease" data-type="${type}" data-id="${opt.id}">-</button>
                <input type="number" class="form-control text-center qty-input" value="0" min="0" max="99" data-type="${type}" data-id="${opt.id}" data-name="${opt.name}" data-price="${opt.price}">
                <button type="button" class="btn btn-outline-secondary qty-btn" data-action="increase" data-type="${type}" data-id="${opt.id}">+</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    // Attach event listeners
    container.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', handleQuantityChange);
    });
    container.querySelectorAll('.qty-input').forEach(input => {
      input.addEventListener('change', handleQuantityInput);
    });
    
    // Attach image preview listeners
    attachImagePreviewListeners(container);
  }

  // Render single-select options (for wrapping)
  function renderSingleSelectOptions(type, options, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!options.length) {
      container.innerHTML = `
        <div class="text-center text-muted py-3">
          <i class="fa fa-inbox opacity-50 me-2"></i>No ${type} available
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="row g-2">
        ${options.map(opt => `
          <div class="col-md-6">
            <div class="customize-option-card p-2 border rounded" style="cursor:pointer;" data-type="${type}" data-id="${opt.id}" data-name="${opt.name}" data-price="${opt.price}">
              <div class="form-check d-flex align-items-center">
                <input class="form-check-input me-2" type="radio" name="wrapping" id="wrap_${opt.id}" value="${opt.id}">
                <label class="form-check-label d-flex align-items-center flex-grow-1" for="wrap_${opt.id}" style="cursor:pointer;">
                  ${opt.image_url ? 
                    `<img src="${opt.image_url}" alt="${opt.name}" class="me-2 has-preview" data-preview-url="${opt.image_url}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;cursor:pointer;">` : 
                    `<div class="me-2 d-flex align-items-center justify-content-center bg-light" style="width:40px;height:40px;border-radius:6px;">
                      <i class="fa fa-image text-muted small"></i>
                    </div>`
                  }
                  <div>
                    <div class="fw-semibold small">${opt.name}</div>
                    <div class="text-purple small">₱${parseFloat(opt.price).toFixed(2)}</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    // Attach event listeners
    container.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', handleWrappingChange);
    });
    container.querySelectorAll('.customize-option-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
          const radio = card.querySelector('input[type="radio"]');
          if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change'));
          }
        }
      });
    });
    
    // Attach image preview listeners
    attachImagePreviewListeners(container);
  }

  // Render checkbox options (for add-ons)
  function renderCheckboxOptions(type, options, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!options.length) {
      container.innerHTML = `
        <div class="text-center text-muted py-3">
          <i class="fa fa-inbox opacity-50 me-2"></i>No ${type} available
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="row g-2">
        ${options.map(opt => `
          <div class="col-md-6">
            <div class="customize-option-card p-2 border rounded" style="cursor:pointer;" data-type="${type}" data-id="${opt.id}" data-name="${opt.name}" data-price="${opt.price}">
              <div class="form-check d-flex align-items-center">
                <input class="form-check-input me-2" type="checkbox" id="addon_${opt.id}" value="${opt.id}" data-name="${opt.name}" data-price="${opt.price}">
                <label class="form-check-label d-flex align-items-center flex-grow-1" for="addon_${opt.id}" style="cursor:pointer;">
                  ${opt.image_url ? 
                    `<img src="${opt.image_url}" alt="${opt.name}" class="me-2 has-preview" data-preview-url="${opt.image_url}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;cursor:pointer;">` : 
                    `<div class="me-2 d-flex align-items-center justify-content-center bg-light" style="width:40px;height:40px;border-radius:6px;">
                      <i class="fa fa-image text-muted small"></i>
                    </div>`
                  }
                  <div>
                    <div class="fw-semibold small">${opt.name}</div>
                    <div class="text-purple small">₱${parseFloat(opt.price).toFixed(2)}</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    // Attach event listeners
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', handleAddonChange);
    });
    container.querySelectorAll('.customize-option-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't toggle if clicking directly on the checkbox or label
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') {
          return;
        }
        const checkbox = card.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      });
    });
    
    // Attach image preview listeners
    attachImagePreviewListeners(container);
  }

  // Handle quantity button clicks
  function handleQuantityChange(e) {
    const btn = e.target.closest('.qty-btn');
    if (!btn) return;
    
    const action = btn.dataset.action;
    const type = btn.dataset.type;
    const id = btn.dataset.id;
    
    const input = document.querySelector(`.qty-input[data-type="${type}"][data-id="${id}"]`);
    if (!input) return;
    
    let value = parseInt(input.value) || 0;
    if (action === 'increase') {
      value = Math.min(99, value + 1);
    } else if (action === 'decrease') {
      value = Math.max(0, value - 1);
    }
    input.value = value;
    
    updateQuantitySelection(type, id, input.dataset.name, parseFloat(input.dataset.price), value);
  }

  // Handle quantity input changes
  function handleQuantityInput(e) {
    const input = e.target;
    const type = input.dataset.type;
    const id = input.dataset.id;
    let value = parseInt(input.value) || 0;
    value = Math.max(0, Math.min(99, value));
    input.value = value;
    
    updateQuantitySelection(type, id, input.dataset.name, parseFloat(input.dataset.price), value);
  }

  // Update selection for quantity-based options
  function updateQuantitySelection(type, id, name, price, quantity) {
    const items = selectedItems[type];
    const existingIndex = items.findIndex(item => item.id === id);
    
    if (quantity > 0) {
      if (existingIndex >= 0) {
        items[existingIndex].quantity = quantity;
      } else {
        items.push({ id, name, price, quantity });
      }
    } else {
      if (existingIndex >= 0) {
        items.splice(existingIndex, 1);
      }
    }
    
    updateOrderSummary();
  }

  // Handle wrapping radio change
  function handleWrappingChange(e) {
    const radio = e.target;
    const card = radio.closest('.customize-option-card');
    if (!card) return;
    
    selectedItems.wrapping = {
      id: card.dataset.id,
      name: card.dataset.name,
      price: parseFloat(card.dataset.price)
    };
    
    updateOrderSummary();
  }

  // Handle addon checkbox change
  function handleAddonChange(e) {
    const checkbox = e.target;
    const id = checkbox.value;
    const name = checkbox.dataset.name;
    const price = parseFloat(checkbox.dataset.price);
    
    if (checkbox.checked) {
      if (!selectedItems.addons.find(a => a.id === id)) {
        selectedItems.addons.push({ id, name, price });
      }
    } else {
      selectedItems.addons = selectedItems.addons.filter(a => a.id !== id);
    }
    
    updateOrderSummary();
  }

  // Update order summary
  function updateOrderSummary() {
    const totalEl = document.getElementById('customOrderTotal');
    
    if (!totalEl) return;
    
    let total = 0;
    
    // Stems
    selectedItems.stems.forEach(item => {
      const subtotal = item.price * item.quantity;
      total += subtotal;
    });
    
    // Fillers
    selectedItems.fillers.forEach(item => {
      const subtotal = item.price * item.quantity;
      total += subtotal;
    });
    
    // Wrapping
    if (selectedItems.wrapping) {
      total += selectedItems.wrapping.price;
    }
    
    // Add-ons
    selectedItems.addons.forEach(item => {
      total += item.price;
    });
    
    // Add rush fee if applicable
    const rushInput = document.querySelector('input[name="custom_rush"]');
    if (rushInput && rushInput.value === 'Yes') {
      // Get rush fee from settings (default 50)
      const rushFee = window._customRushFee || 50;
      total += rushFee;
    }
    
    // Update via voucher handler if available (handles discount display)
    if (window.customVoucherHandler) {
      window.customVoucherHandler.setCurrentTotal(total);
    } else {
      // Fallback: update display directly
      totalEl.textContent = `₱${total.toFixed(2)}`;
    }
    // Auto-save the selected items to localStorage
    try {
      localStorage.setItem('custom_selected_items', JSON.stringify(selectedItems));
    } catch (e) {}
  }
  
  // Make updateOrderSummary globally accessible for rush date changes
  window.calculateCustomOrderTotal = updateOrderSummary;

  // Reset form
  function resetForm() {
    selectedItems = {
      stems: [],
      fillers: [],
      wrapping: null,
      addons: []
    };
    
    const form = document.getElementById('customOrderForm');
    if (form) form.reset();
    
    // Reset quantity inputs
    document.querySelectorAll('.qty-input').forEach(input => {
      input.value = 0;
    });
    
    // Reset checkboxes and radios
    document.querySelectorAll('#customAddonsContainer input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
    document.querySelectorAll('#customWrappingContainer input[type="radio"]').forEach(radio => {
      radio.checked = false;
    });
    
    updateOrderSummary();
  }

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const termsCheckbox = document.getElementById('customAgreeTerms');
    
    // Validate terms
    if (!termsCheckbox || !termsCheckbox.checked) {
      alertWarning('Please accept the terms and conditions to proceed.');
      termsCheckbox?.focus();
      return;
    }
    
    // Check if user has entered voucher code but hasn't applied it
    const voucherInput = document.getElementById('customVoucherCodeInput');
    const hasVoucherCode = voucherInput && voucherInput.value.trim() !== '';
    const voucherApplied = window.customVoucherHandler && window.customVoucherHandler.hasVoucher();
    
    if (hasVoucherCode && !voucherApplied) {
      const proceed = await showVoucherWarningModal();
      if (!proceed) {
        return;
      }
    }
    
    // Validate required items (stems, fillers, wrapping)
    if (selectedItems.stems.length === 0) {
      alertWarning('Please select at least one stem for your custom order.');
      // Open stems accordion
      const stemsCollapse = document.getElementById('collapseStems');
      if (stemsCollapse && !stemsCollapse.classList.contains('show')) {
        new bootstrap.Collapse(stemsCollapse, { toggle: true });
      }
      return;
    }
    
    if (selectedItems.fillers.length === 0) {
      alertWarning('Please select at least one filler for your custom order.');
      // Open fillers accordion
      const fillersCollapse = document.getElementById('collapseFillers');
      if (fillersCollapse && !fillersCollapse.classList.contains('show')) {
        new bootstrap.Collapse(fillersCollapse, { toggle: true });
      }
      return;
    }
    
    if (!selectedItems.wrapping) {
      alertWarning('Please select wrapping for your custom order.');
      // Open wrapping accordion
      const wrappingCollapse = document.getElementById('collapseWrapping');
      if (wrappingCollapse && !wrappingCollapse.classList.contains('show')) {
        new bootstrap.Collapse(wrappingCollapse, { toggle: true });
      }
      return;
    }
    
    const formData = new FormData(form);
    const fullName = formData.get('custom_user_name')?.trim();
    const email = formData.get('custom_user_email')?.trim();
    const facebookLink = formData.get('custom_fb_link')?.trim();
    const specialInstructions = formData.get('custom_message')?.trim();
    const expectedDeliveryDate = formData.get('custom_expected_delivery_date')?.trim();
    const rush = formData.get('custom_rush')?.trim() || 'No';
    const deliveryAddress = formData.get('custom_delivery_address')?.trim();
    const preferredMeetupPlace = formData.get('custom_preferred_meetup_place')?.trim() || null;
    
    if (!fullName || !email || !facebookLink) {
      alertWarning('Please fill in your name, email, and Facebook profile link.');
      return;
    }

    if (!deliveryAddress) {
      alertWarning('Please enter your delivery address or pin it on the map.');
      return;
    }

    // Preferred meetup place is required for Muntinlupa delivery addresses.
    // The meetup input's `required` attribute can't be relied on here (this
    // flow doesn't run native form validation), so enforce it explicitly.
    if (/muntinlupa/i.test(deliveryAddress) && !preferredMeetupPlace) {
      alertWarning('Please enter your preferred meetup place for deliveries within Muntinlupa.');
      return;
    }

    if (!expectedDeliveryDate) {
      alertWarning('Please select an expected delivery date.');
      return;
    }
    
    // Calculate total
    let total = 0;
    selectedItems.stems.forEach(s => total += s.price * s.quantity);
    selectedItems.fillers.forEach(f => total += f.price * f.quantity);
    if (selectedItems.wrapping) total += selectedItems.wrapping.price;
    selectedItems.addons.forEach(a => total += a.price);
    
    // Disable button during submission
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';
    
    try {
      // Get auth token if available
      const token = localStorage.getItem('auth_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Prepare order data
      const orderData = {
        full_name: fullName,
        email: email,
        facebook_link: facebookLink || null,
        stems: selectedItems.stems,
        fillers: selectedItems.fillers,
        wrapping: selectedItems.wrapping,
        addons: selectedItems.addons,
        special_instructions: specialInstructions || null,
        expected_delivery_date: expectedDeliveryDate,
        rush: rush,
        estimated_total: total,
        delivery_address: deliveryAddress,
        preferred_meetup_place: preferredMeetupPlace
      };

      // Add voucher information if applied
      if (window.customVoucherHandler && window.customVoucherHandler.hasVoucher()) {
        const voucherData = window.customVoucherHandler.getAppliedVoucher();
        orderData.voucher_code = voucherData.voucher.code;
        orderData.voucher_id = voucherData.voucher.id;
        orderData.voucher_discount = voucherData.discountAmount;
        orderData.original_total = voucherData.originalTotal;
      }

      let res = await fetch(`${API_URL}/api/orders/custom`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(orderData)
      });
      
      let data = await res.json();
      
      if (!res.ok && res.status === 401 && headers['Authorization']) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('customer');
        delete headers['Authorization'];
        res = await fetch(`${API_URL}/api/orders/custom`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(orderData)
        });
        data = await res.json();
      }
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit order');
      }
      
      // Record voucher usage if voucher was applied
      if (orderData.voucher_id && orderData.voucher_code) {
        try {
          await fetch(`${API_URL}/api/vouchers/use`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              voucherId: orderData.voucher_id,
              orderId: data.order_number || data.orderId,
              customerEmail: email,
              customerId: null,
              discountAmount: orderData.voucher_discount
            })
          });
        } catch (voucherErr) {
        }
      }

      // Save delivery details to localStorage for next time
      try {
        if (deliveryAddress) {
          localStorage.setItem('customer_delivery_address', deliveryAddress);
        }
        if (preferredMeetupPlace) {
          localStorage.setItem('customer_preferred_meetup_place', preferredMeetupPlace);
        } else {
          localStorage.removeItem('customer_preferred_meetup_place');
        }
      } catch (e) {}

      // Success!
      bootstrap.Modal.getInstance(document.getElementById('customizeOrderModal'))?.hide();
      
      // Show success message
      showSuccessMessage(data.order_number);
      
      // Clear pretyped state
      try {
        localStorage.removeItem('custom_form_state');
        localStorage.removeItem('custom_selected_items');
      } catch (e) {}

      // Reset form
      resetForm();
      
    } catch (err) {
      alertError('Failed to submit order: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  }

  // Show success message
  function showSuccessMessage(orderNumber) {
    // Create and show a success modal or redirect
    const successHtml = `
      <div class="modal fade" id="customOrderSuccessModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content border-0 shadow-lg" style="border-radius: 20px; overflow: hidden;">
            <div class="text-center" style="background: linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%); padding: 40px 30px;">
              <div style="width: 80px; height: 80px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                <i class="fa fa-check" style="font-size: 40px; color: #ff6f9b;"></i>
              </div>
              <h3 class="text-white fw-bold mb-2" style="font-size: 28px;">Order Placed!</h3>
              <p class="text-white mb-0" style="opacity: 0.95; font-size: 15px;">Your custom order has been placed</p>
            </div>
            
            <div class="p-4" style="background: #fff;">
              <div style="background: linear-gradient(135deg, #fff5f8 0%, #ffe9f0 100%); border-radius: 12px; padding: 20px; margin-bottom: 20px; text-align: center;">
                <div style="font-size: 12px; color: #999; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 1px;">Order Number</div>
                <div style="font-size: 24px; font-weight: 700; color: #ff6f9b; letter-spacing: 1px;">${orderNumber}</div>
              </div>
              
              <button type="button" class="btn w-100 py-3" data-bs-dismiss="modal" style="background: linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%); color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 16px;">
                <i class="fa fa-thumbs-up me-2"></i>Got it!
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Remove existing success modal if any
    const existingModal = document.getElementById('customOrderSuccessModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', successHtml);
    new bootstrap.Modal(document.getElementById('customOrderSuccessModal')).show();
  }

  // Image preview tooltip functionality
  let imagePreviewTooltip = null;
  let previewTimeout = null;

  function attachImagePreviewListeners(container) {
    container.querySelectorAll('.has-preview').forEach(img => {
      // Desktop: hover
      img.addEventListener('mouseenter', showImagePreview);
      img.addEventListener('mouseleave', hideImagePreview);
      img.addEventListener('mousemove', moveImagePreview);
      
      // Mobile: long press
      let pressTimer = null;
      img.addEventListener('touchstart', (e) => {
        e.preventDefault();
        pressTimer = setTimeout(() => {
          showImagePreview(e);
        }, 500); // 500ms long press
      });
      
      img.addEventListener('touchend', (e) => {
        clearTimeout(pressTimer);
        hideImagePreview();
      });
      
      img.addEventListener('touchmove', (e) => {
        clearTimeout(pressTimer);
      });
    });
  }

  function showImagePreview(e) {
    const img = e.target;
    const imageUrl = img.dataset.previewUrl;
    
    if (!imageUrl) return;
    
    // Remove existing tooltip
    if (imagePreviewTooltip) {
      imagePreviewTooltip.remove();
    }
    
    // Create tooltip
    imagePreviewTooltip = document.createElement('div');
    imagePreviewTooltip.className = 'image-preview-tooltip';
    imagePreviewTooltip.innerHTML = `
      <img src="${imageUrl}" alt="Preview" style="max-width: 250px; max-height: 250px; object-fit: contain; border-radius: 8px;">
    `;
    
    document.body.appendChild(imagePreviewTooltip);
    
    // Position tooltip
    positionTooltip(e);
  }

  function moveImagePreview(e) {
    if (imagePreviewTooltip) {
      positionTooltip(e);
    }
  }

  function positionTooltip(e) {
    if (!imagePreviewTooltip) return;
    
    const offset = 15;
    let x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    let y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    
    const tooltipRect = imagePreviewTooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Adjust position if tooltip goes off screen
    if (x + tooltipRect.width + offset > viewportWidth) {
      x = x - tooltipRect.width - offset;
    } else {
      x = x + offset;
    }
    
    if (y + tooltipRect.height + offset > viewportHeight) {
      y = y - tooltipRect.height - offset;
    } else {
      y = y + offset;
    }
    
    imagePreviewTooltip.style.left = x + 'px';
    imagePreviewTooltip.style.top = y + 'px';
  }

  function hideImagePreview() {
    if (previewTimeout) {
      clearTimeout(previewTimeout);
    }
    
    previewTimeout = setTimeout(() => {
      if (imagePreviewTooltip) {
        imagePreviewTooltip.remove();
        imagePreviewTooltip = null;
      }
    }, 100);
  }

  // Check if user is authenticated
  function isAuthenticated() {
    const token = localStorage.getItem('auth_token');
    const customerData = localStorage.getItem('customer');
    return !!(token && customerData);
  }

  // Initialize when modal opens
  function init() {
    const modal = document.getElementById('customizeOrderModal');
    if (!modal) return;
    
    loadTelegramLink();
    
    // Intercept modal show event to load options
    modal.addEventListener('show.bs.modal', (event) => {
      loadCustomizationOptions();
      loadRushFeeSetting();
      prefillUserInfo();
    });
    
    modal.addEventListener('hidden.bs.modal', () => {
      resetForm();
    });
    
    // Attach form submit handler
    const form = document.getElementById('customizeOrderForm');
    if (form) {
      form.addEventListener('submit', handleSubmit);
      form.addEventListener('input', saveCustomFormState);
      form.addEventListener('change', saveCustomFormState);
      const voucherInput = document.getElementById('customVoucherCodeInput');
      if (voucherInput) {
        voucherInput.addEventListener('input', saveCustomFormState);
      }
    }
  }

  // Save customOrderForm fields to localStorage on input/change
  function saveCustomFormState() {
    const form = document.getElementById('customizeOrderForm');
    if (!form) return;
    const state = {
      custom_user_name: form.querySelector('[name="custom_user_name"]')?.value || '',
      custom_user_email: form.querySelector('[name="custom_user_email"]')?.value || '',
      custom_fb_link: form.querySelector('[name="custom_fb_link"]')?.value || '',
      custom_delivery_address: form.querySelector('[name="custom_delivery_address"]')?.value || '',
      custom_preferred_meetup_place: form.querySelector('[name="custom_preferred_meetup_place"]')?.value || '',
      custom_expected_delivery_date: form.querySelector('[name="custom_expected_delivery_date"]')?.value || '',
      custom_message: form.querySelector('[name="custom_message"]')?.value || '',
      custom_voucher_code: document.getElementById('customVoucherCodeInput')?.value || ''
    };
    console.log('Chammy Florals: saveCustomFormState called, saving state:', state);
    localStorage.setItem('custom_form_state', JSON.stringify(state));
    localStorage.setItem('custom_selected_items', JSON.stringify(selectedItems));
  }

  // Load state and populate form fields
  function loadCustomFormState() {
    const form = document.getElementById('customizeOrderForm');
    if (!form) return;
    try {
      const saved = localStorage.getItem('custom_form_state');
      console.log('Chammy Florals: loadCustomFormState called, read from localStorage:', saved);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.custom_user_name) {
          const el = form.querySelector('[name="custom_user_name"]');
          if (el) el.value = state.custom_user_name;
        }
        if (state.custom_user_email) {
          const el = form.querySelector('[name="custom_user_email"]');
          if (el) el.value = state.custom_user_email;
        }
        if (state.custom_fb_link) {
          const el = form.querySelector('[name="custom_fb_link"]');
          if (el) el.value = state.custom_fb_link;
        }
        if (state.custom_delivery_address) {
          const el = form.querySelector('[name="custom_delivery_address"]');
          if (el) {
            el.value = state.custom_delivery_address;
            if (typeof window.checkMuntinlupaForInput === 'function') {
              window.checkMuntinlupaForInput(el, state.custom_delivery_address);
            }
          }
        }
        if (state.custom_preferred_meetup_place) {
          const el = form.querySelector('[name="custom_preferred_meetup_place"]');
          if (el) {
            setTimeout(() => {
              el.value = state.custom_preferred_meetup_place;
            }, 500);
          }
        }
        if (state.custom_expected_delivery_date) {
          const el = form.querySelector('[name="custom_expected_delivery_date"]');
          if (el) {
            el.value = state.custom_expected_delivery_date;
            setTimeout(() => {
              el.dispatchEvent(new Event('change'));
            }, 100);
          }
        }
        if (state.custom_message) {
          const el = form.querySelector('[name="custom_message"]');
          if (el) el.value = state.custom_message;
        }
        if (state.custom_voucher_code) {
          const el = document.getElementById('customVoucherCodeInput');
          if (el) el.value = state.custom_voucher_code;
        }
      }
    } catch (e) {
      console.error('Error loading custom form state:', e);
    }
  }

  // Restore custom order selections from localStorage
  function restoreCustomSelections() {
    try {
      const savedItems = localStorage.getItem('custom_selected_items');
      if (savedItems) {
        const parsed = JSON.parse(savedItems);
        if (parsed) {
          selectedItems = parsed;
          
          // 1. Populate stems quantity inputs
          if (Array.isArray(selectedItems.stems)) {
            selectedItems.stems.forEach(it => {
              const input = document.querySelector(`.qty-input[data-type="stems"][data-id="${it.id}"]`);
              if (input) input.value = it.quantity;
            });
          }
          
          // 2. Populate fillers quantity inputs
          if (Array.isArray(selectedItems.fillers)) {
            selectedItems.fillers.forEach(it => {
              const input = document.querySelector(`.qty-input[data-type="fillers"][data-id="${it.id}"]`);
              if (input) input.value = it.quantity;
            });
          }
          
          // 3. Populate wrapping radio button
          if (selectedItems.wrapping) {
            const radio = document.getElementById(`wrap_${selectedItems.wrapping.id}`);
            if (radio) radio.checked = true;
          }
          
          // 4. Populate addons checkboxes
          if (Array.isArray(selectedItems.addons)) {
            selectedItems.addons.forEach(it => {
              const checkbox = document.getElementById(`addon_${it.id}`);
              if (checkbox) checkbox.checked = true;
            });
          }
          
          updateOrderSummary();
        }
      }
    } catch (error) {
      console.error('Failed to restore custom selections:', error);
    }
  }

  // Pre-fill user information if logged in
  function prefillUserInfo() {
    try {
      const customerData = localStorage.getItem('customer');
      if (customerData) {
        const customer = JSON.parse(customerData);
        
        // Pre-fill name
        const nameInput = document.querySelector('[name="custom_user_name"]');
        if (nameInput && customer.name) {
          nameInput.value = customer.name;
        }
        
        // Pre-fill email
        const emailInput = document.querySelector('[name="custom_user_email"]');
        if (emailInput && customer.email) {
          emailInput.value = customer.email;
        }
      }
    } catch (error) {
    }

    // Always pre-fill saved delivery address and preferred meetup place if they exist in localStorage
    try {
      const savedAddress = localStorage.getItem('customer_delivery_address');
      if (savedAddress) {
        const addressInput = document.querySelector('[name="custom_delivery_address"]');
        if (addressInput) {
          addressInput.value = savedAddress;
          // Trigger Muntinlupa check for custom meetup section display
          if (typeof window.checkMuntinlupaForInput === 'function') {
            window.checkMuntinlupaForInput(addressInput, savedAddress);
          }
        }
      }
      const savedMeetup = localStorage.getItem('customer_preferred_meetup_place');
      
      // Fetch meetup places from settings and populate dropdown
      fetch('/api/settings/meetup-places?t=' + Date.now())
        .then(res => res.json())
        .then(data => {
          const meetupInput = document.querySelector('select[name="custom_preferred_meetup_place"]');
          if (meetupInput) {
            meetupInput.innerHTML = '<option value="" disabled selected>Select preferred meetup place</option>';
            if (data.places && Array.isArray(data.places) && data.places.length > 0) {
              data.places.forEach(place => {
                const opt = document.createElement('option');
                opt.value = place;
                opt.textContent = place;
                meetupInput.appendChild(opt);
              });
              const savedState = localStorage.getItem('custom_form_state');
              const state = savedState ? JSON.parse(savedState) : null;
              const stateMeetup = state ? state.custom_preferred_meetup_place : '';
              const finalMeetup = stateMeetup || savedMeetup;
              if (finalMeetup && data.places.includes(finalMeetup)) {
                meetupInput.value = finalMeetup;
              }
            } else {
              meetupInput.innerHTML = '<option value="" disabled selected>No places available</option>';
            }
          }
        })
        .catch(err => {
          console.error('Error fetching meetup places:', err);
          const meetupInput = document.querySelector('select[name="custom_preferred_meetup_place"]');
          if (meetupInput) meetupInput.innerHTML = '<option value="" disabled selected>Error loading places</option>';
        });
    } catch (e) {}

    // Load persisted state from localStorage
    loadCustomFormState();
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
