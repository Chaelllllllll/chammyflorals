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

  // Load customization options from API
  async function loadCustomizationOptions() {
    try {
      const res = await fetch(`${API_URL}/api/customization/options`);
      if (!res.ok) throw new Error('Failed to load options');
      
      customizationOptions = await res.json();
      renderAllOptions();
    } catch (err) {
      console.error('Error loading customization options:', err);
      showError();
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
                `<img src="${opt.image_url}" alt="${opt.name}" class="customize-option-image me-2" style="width:50px;height:50px;object-fit:cover;border-radius:8px;">` : 
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
                    `<img src="${opt.image_url}" alt="${opt.name}" class="me-2" style="width:40px;height:40px;object-fit:cover;border-radius:6px;">` : 
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
                    `<img src="${opt.image_url}" alt="${opt.name}" class="me-2" style="width:40px;height:40px;object-fit:cover;border-radius:6px;">` : 
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
    
    totalEl.textContent = `₱${total.toFixed(2)}`;
  }

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
      alert('Please accept the terms and conditions to proceed.');
      termsCheckbox?.focus();
      return;
    }
    
    // Validate at least one item selected
    if (selectedItems.stems.length === 0 && 
        selectedItems.fillers.length === 0 && 
        !selectedItems.wrapping && 
        selectedItems.addons.length === 0) {
      alert('Please select at least one item for your custom order.');
      return;
    }
    
    const formData = new FormData(form);
    const fullName = formData.get('custom_user_name')?.trim();
    const email = formData.get('custom_user_email')?.trim();
    const facebookLink = formData.get('custom_fb_link')?.trim();
    const specialInstructions = formData.get('custom_message')?.trim();
    
    if (!fullName || !email) {
      alert('Please fill in your name and email.');
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
      
      const res = await fetch(`${API_URL}/api/orders/custom`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          full_name: fullName,
          email: email,
          facebook_link: facebookLink || null,
          stems: selectedItems.stems,
          fillers: selectedItems.fillers,
          wrapping: selectedItems.wrapping,
          addons: selectedItems.addons,
          special_instructions: specialInstructions || null,
          estimated_total: total
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit order');
      }
      
      // Success!
      bootstrap.Modal.getInstance(document.getElementById('customizeOrderModal'))?.hide();
      
      // Show success message
      showSuccessMessage(data.order_number);
      
      // Reset form
      resetForm();
      
    } catch (err) {
      console.error('Error submitting custom order:', err);
      alert('Failed to submit order: ' + err.message);
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
          <div class="modal-content rounded-4 border-0 shadow-lg text-center p-4">
            <div class="mb-3">
              <i class="fa fa-check-circle text-success" style="font-size: 4rem;"></i>
            </div>
            <h4 class="fw-bold mb-2">Order Submitted!</h4>
            <p class="text-muted">Your custom order has been received.</p>
            <p>Order Number: <strong class="text-purple">${orderNumber}</strong></p>
            <p class="small text-muted">We've sent a confirmation email. We'll contact you shortly with payment details.</p>
            <button type="button" class="btn btn-purple mt-3" data-bs-dismiss="modal">
              <i class="fa fa-thumbs-up me-2"></i>Got it!
            </button>
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

  // Initialize when modal opens
  function init() {
    const modal = document.getElementById('customizeOrderModal');
    if (!modal) return;
    
    modal.addEventListener('show.bs.modal', () => {
      loadCustomizationOptions();
      prefillUserInfo();
    });
    
    modal.addEventListener('hidden.bs.modal', () => {
      resetForm();
    });
    
    // Attach form submit handler
    const form = document.getElementById('customizeOrderForm');
    if (form) {
      form.addEventListener('submit', handleSubmit);
    }
  }

  // Pre-fill user information if logged in
  function prefillUserInfo() {
    try {
      const customerData = localStorage.getItem('customer');
      if (!customerData) return;
      
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
    } catch (error) {
      console.error('Error prefilling user info:', error);
    }
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
