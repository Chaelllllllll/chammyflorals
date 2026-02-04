document.addEventListener('DOMContentLoaded', () => {
  const inquiryForm = document.getElementById('inquiryForm');
  if (!inquiryForm) {
    console.error('Inquiry form not found');
    return;
  }

  // Pre-fill customer information if logged in
  function prefillCustomerInfo() {
    const customerData = localStorage.getItem('customer');
    if (customerData) {
      try {
        const customer = JSON.parse(customerData);
        
        // Pre-fill name field
        const nameInput = inquiryForm.querySelector('input[name="user_name"]');
        if (nameInput && customer.name) {
          nameInput.value = customer.name;
          nameInput.readOnly = true;
          nameInput.style.backgroundColor = '#f8f9fa';
        }
        
        // Pre-fill email field
        const emailInput = inquiryForm.querySelector('input[name="user_email"]');
        if (emailInput && customer.email) {
          emailInput.value = customer.email;
          emailInput.readOnly = true;
          emailInput.style.backgroundColor = '#f8f9fa';
        }
      } catch (error) {
        console.error('Error pre-filling customer info:', error);
      }
    }
  }

  // Call prefill function
  prefillCustomerInfo();

  // --- Auto-fetch product & addons when Flower Type changes ---
  const flowerSelect = inquiryForm.querySelector('select[name="flower_type"]');
  const addonsContainer = document.getElementById('addonsContainer');
  const defaultAddonsHtml = addonsContainer ? addonsContainer.innerHTML : '';
  const addonsSection = document.getElementById('addonsSection');
  const addonsWrapper = addonsContainer ? addonsContainer.parentElement : null;
  // hide addons section by default until a product with addons is selected
  try {
    if (addonsSection) addonsSection.style.display = 'none';
    if (addonsWrapper && !addonsSection) addonsWrapper.style.display = 'none';
  } catch (e) {}
  let _productsCache = null;

  // Load products once and populate flower type select dynamically
  async function loadProductsForInquiry() {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to fetch products');
      const products = await res.json();
      _productsCache = products || [];

      // Build option list grouped by product category from pricing rows
      const seen = new Set();
      // populate legacy single select if present
      if (flowerSelect) flowerSelect.innerHTML = '<option value="">Select Flower Type</option>';

      // Group pricing rows by category so the select shows categories first
      const groups = {};
      _productsCache.forEach(p => {
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
          if (flowerSelect) flowerSelect.appendChild(opt);
        });
      });

      // fallback: if no pricing rows, group by product name and category
      if (flowerSelect && flowerSelect.options.length <= 1 && _productsCache.length) {
        const namesByCat = {};
        _productsCache.forEach(p => {
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
            flowerSelect.appendChild(opt);
          });
        });
      }
    } catch (err) {
      console.error('Failed loading products for inquiry select:', err);
    }
  }

  function escapeHtml(unsafe) {
    return String(unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function onFlowerTypeChange(e) {
    const code = (e.target.value || '').trim();
    if (!code) {
      // hide addons area when no product selected
      try { if (addonsWrapper) addonsWrapper.style.display = 'none'; else if (addonsContainer) addonsContainer.innerHTML = ''; } catch (e) {}
      return;
    }

    try {
      const products = _productsCache || (await (await fetch('/api/products')).json());
      if (!_productsCache) _productsCache = products || [];

      // Find product that contains a pricing row or name matching the selected code
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
        // fallback: check name contains code
        if (String(p.name || '').toUpperCase().includes(code.toUpperCase())) {
          match = { product: p, row: null };
          break;
        }
      }

  if (!match) {
        // no product match: hide addons
        try { if (addonsWrapper) addonsWrapper.style.display = 'none'; else if (addonsContainer) addonsContainer.innerHTML = ''; } catch (e) {}
        return;
      }

      const { product, row } = match;
      // show preview: Category (heading) and Prices (list of pricing rows)
      const category = product.category && String(product.category).trim() ? product.category : 'Uncategorized';
      let previewHtml = `<div class="fw-bold">${escapeHtml(category)}</div>`;
      previewHtml += `<div class="small text-muted mt-1">Prices</div>`;
      if (product.pricing && Array.isArray(product.pricing) && product.pricing.length) {
        previewHtml += '<ul class="list-unstyled small mb-0 mt-1">';
        product.pricing.forEach(r => {
          const label = escapeHtml(r.label || r.set || '');
          const price = (typeof r.price !== 'undefined' && r.price !== null) ? `₱${Number(r.price).toLocaleString()}` : '';
          const line = label ? `${label}${price ? ' — ' + price : ''}` : (price || 'Contact for price');
          previewHtml += `<li>${line}</li>`;
        });
        previewHtml += '</ul>';
      } else {
        previewHtml += '<div class="small text-muted">No pricing available</div>';
      }
  // preview shown via the dropdown labels (category optgroup + option text)

      // render addons (product.addons may be array of objects or strings)
      if (addonsContainer) {
        if (product.addons && Array.isArray(product.addons) && product.addons.length) {
          const html = product.addons.map((a, idx) => {
            if (typeof a === 'string') {
              const val = escapeHtml(a);
              return `<div class="form-check mb-2"><input type="checkbox" name="addons[]" value="${val}" class="form-check-input addon-checkbox" id="addon_${idx}" data-name="${val}" data-price="0"><label class="form-check-label fw-semibold" for="addon_${idx}" style="cursor: pointer;">${val}</label></div>`;
            }
            const label = String(a.label || a.name || '').trim();
            const price = a.price != null ? Number(a.price) : 0;
            const priceStr = price > 0 ? `₱${price.toLocaleString()}` : '';
            const id = 'addon_' + idx;
            return `<div class="form-check mb-2"><input type="checkbox" name="addons[]" class="form-check-input addon-checkbox" id="${id}" data-name="${escapeHtml(label)}" data-price="${price}"><label class="form-check-label" for="${id}" style="cursor: pointer;"><span class="fw-semibold">${escapeHtml(label)}</span>${priceStr ? ` <span class="badge bg-pink text-white ms-2">${priceStr}</span>` : ''}</label></div>`;
          }).join('');
          addonsContainer.innerHTML = html;
          try {
            if (addonsSection) addonsSection.style.display = '';
            if (addonsWrapper && !addonsSection) addonsWrapper.style.display = '';
          } catch (e) {}
        } else {
          // no product-specific addons: hide the addons wrapper
          try {
            if (addonsSection) { addonsSection.style.display = 'none'; addonsContainer.innerHTML = ''; }
            else if (addonsWrapper) { addonsWrapper.style.display = 'none'; addonsContainer.innerHTML = ''; }
            else { addonsContainer.innerHTML = ''; }
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error('Failed to fetch product info for inquiry:', err);
      try {
        if (addonsSection) addonsSection.style.display = 'none';
        else if (addonsWrapper) addonsWrapper.style.display = 'none';
        else if (addonsContainer) addonsContainer.innerHTML = defaultAddonsHtml;
      } catch (e) {}
    }
  }

  if (flowerSelect) {
    flowerSelect.addEventListener('change', (ev) => { onFlowerTypeChange(ev); computeRushFee(); });
  }
  // Always load products so dynamic item selects can be populated even when
  // the legacy single `flowerSelect` is not present (we now support multi-item orders).
  loadProductsForInquiry();

  // --- Multi-item order UI handling ---
  const itemsContainer = document.getElementById('itemsContainer');
  const addItemBtn = document.getElementById('addItemBtn');

  function populateItemSelect(selectEl) {
    // Reuse existing product cache to populate a select element
    if (!_productsCache || !_productsCache.length) return;
    // create options similar to the main flowerSelect
    selectEl.innerHTML = '<option value="">Select Flower Type</option>';
    const seen = new Set();
    const groups = {};
    _productsCache.forEach(p => {
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
      const og = document.createElement('optgroup');
      og.label = cat;
      groups[cat].forEach(it => {
        const opt = document.createElement('option');
        opt.value = it.code;
        opt.textContent = it.text;
        if (it.productId) opt.dataset.productId = it.productId;
        og.appendChild(opt);
      });
      selectEl.appendChild(og);
    });
  }

  function createItemRow(index) {
    const row = document.createElement('div');
    row.className = 'order-item mb-2';
    row.innerHTML = `
      <div class="d-flex align-items-center gap-2 p-2 bg-light rounded border w-100">
        <span class="badge bg-pink text-white text-center" style="width: 65px; flex-shrink: 0;">Item ${index + 1}</span>
        <select class="form-select form-select-sm item-flower" name="flower_type_${index}" required style="flex: 3;">
          <option value="">Flower Type</option>
        </select>
        <select class="form-select form-select-sm item-color" name="color_${index}" aria-label="Color" style="flex: 2;">
          <option value="">Color</option>
        </select>
        <input type="number" class="form-control form-control-sm item-quantity text-center" name="quantity_${index}" min="1" value="1" required style="width: 65px; flex-shrink: 0;" placeholder="Qty">
        <button type="button" class="btn btn-sm btn-outline-danger remove-item" style="width: 36px; height: 31px; flex-shrink: 0; padding: 0;">
          <i class="fa fa-times"></i>
        </button>
      </div>
    `;
    const selectEl = row.querySelector('.item-flower');
  populateItemSelect(selectEl);
    // ensure color select is populated shortly after creation (handles async product cache)
    setTimeout(() => {
      try { populateColorSelectForRow(row); } catch (e) {}
      try {
        // if options not yet present because products cache was empty, attempt populate again
        if (selectEl && selectEl.options && selectEl.options.length <= 1 && typeof loadProductsForInquiry === 'function') {
          loadProductsForInquiry().then(() => populateItemSelect(selectEl)).catch(() => {});
        }
      } catch (e) {}
    }, 40);
    // attach change handler so addons preview updates when item selection changes
    try { selectEl.addEventListener('change', (ev) => { onFlowerTypeChange(ev); computeRushFee(); populateColorSelectForRow(row); }); } catch (e) {}
    row.querySelector('.remove-item').addEventListener('click', () => {
      if (itemsContainer.children.length <= 1) return; // keep at least one
      row.remove();
      // update item numbers
      updateItemNumbers();
      // update rush fee when item removed
      computeRushFee();
    });
    return row;
  }

  // Update item numbers after adding/removing items
  function updateItemNumbers() {
    const items = itemsContainer.querySelectorAll('.order-item');
    items.forEach((item, idx) => {
      const badge = item.querySelector('.badge');
      if (badge) badge.textContent = `Item ${idx + 1}`;
    });
  }

  function populateColorSelectForRow(row) {
    try {
      const select = row.querySelector('.item-flower');
      const colorSelect = row.querySelector('.item-color');
      if (!select || !colorSelect) return;
      const opt = select.selectedOptions && select.selectedOptions[0];
      const productId = opt && opt.dataset && opt.dataset.productId;
      // clear
      colorSelect.innerHTML = '<option value="">Select Color</option>';
      if (!productId || !_productsCache) return;
      const prod = (_productsCache || []).find(p => String(p.id) === String(productId));
      if (!prod || !Array.isArray(prod.colors) || !prod.colors.length) return;
      prod.colors.forEach(c => {
        let value = c.value || c.hex || c.color || '';
        // normalize rgb(...) to hex
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
        // Use a colored bullet in the option and color the bullet by setting option text color.
        optEl.textContent = `● ${name}`;
        if (value) optEl.style.color = value;
        optEl.dataset.colorName = name;
        colorSelect.appendChild(optEl);
      });
    } catch (err) {}
  }

  // ensure initial item has select options populated after products load
  (async function ensureInitialItems() {
    // wait until products cache is loaded
    let tries = 0;
    while (!_productsCache && tries < 10) {
      await new Promise(r => setTimeout(r, 150));
      tries++;
    }
    const initialSelects = itemsContainer.querySelectorAll('.item-flower');
    initialSelects.forEach(s => {
      populateItemSelect(s);
      try { s.addEventListener('change', (ev) => { onFlowerTypeChange(ev); computeRushFee(); populateColorSelectForRow(s.closest('.order-item')); }); } catch (e) {}
      // populate color select for existing rows
      const row = s.closest('.order-item');
      if (row) populateColorSelectForRow(row);
    });
  })();

  addItemBtn.addEventListener('click', () => {
    const idx = itemsContainer.children.length;
    const newRow = createItemRow(idx);
    itemsContainer.appendChild(newRow);
    // recompute rush fee when new item added
    computeRushFee();
  });

  // --- Rush fee calculation and UI update ---
  let _categoriesCache = null; // name -> rush_fee
  async function loadCategoriesForRush() {
    try {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      const cats = await res.json();
      // Build a fee map keyed by lowercased name, slug and id so lookups
      // succeed whether product.category stores a name, a slug or an id.
      _categoriesCache = {};
      (cats || []).forEach(c => {
        const fee = Number(c.rush_fee) || 0;
        const nameKey = String(c.name || '').trim().toLowerCase();
        const slugKey = String(c.slug || '').trim().toLowerCase();
        const idKey = c.id != null ? String(c.id).trim() : '';
        if (nameKey) _categoriesCache[nameKey] = fee;
        if (slugKey) _categoriesCache[slugKey] = fee;
        if (idKey) _categoriesCache[idKey] = fee;
      });
    } catch (err) {_categoriesCache = {};
    }
  }

  function computeRushFee() {
    try {
      if (!_categoriesCache) return;
      const itemRows = itemsContainer.querySelectorAll('.order-item');
      let totalRush = 0;
      itemRows.forEach(row => {
        const select = row.querySelector('.item-flower');
        const qty = parseInt(row.querySelector('.item-quantity').value) || 1;
        const opt = select && select.selectedOptions && select.selectedOptions[0];
        const productId = opt && opt.dataset && opt.dataset.productId;
        if (!productId) return;
        const prod = (_productsCache || []).find(p => String(p.id) === String(productId));
        const cat = prod && prod.category ? String(prod.category).trim() : '';
        const key = String(cat || '').trim().toLowerCase();
        const fee = _categoriesCache[key] || 0;
        if (fee) totalRush += fee * qty;
      });
      const rushSelect = inquiryForm.querySelector('select[name="rush"]');
      if (rushSelect) {
        const yesOpt = rushSelect.querySelector('option[value="Yes"]');
        if (yesOpt) {
          yesOpt.textContent = `Yes - Rush Fee: ₱${Number(totalRush).toLocaleString()}`;
        }
      }
    } catch (err) {}
  }

  // load categories and compute initial value
  loadCategoriesForRush().then(() => computeRushFee()).catch(() => {});

  // recompute when quantity inputs change
  itemsContainer.addEventListener('input', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('item-quantity')) {
      computeRushFee();
      calculateOrderTotal();
    }
  });

  // Calculate order total based on selected items and addons
  function calculateOrderTotal() {
    const inquiryForm = document.getElementById('inquiryForm');
    if (!inquiryForm) return;
    let total = 0;
    
    // Calculate items cost from selected products
    const itemRows = itemsContainer.querySelectorAll('.order-item');
    itemRows.forEach(row => {
      const selectEl = row.querySelector('.item-flower');
      const qtyInput = row.querySelector('.item-quantity');
      const qty = parseInt(qtyInput?.value) || 0;
      
      if (!selectEl || !qty) return;
      
      const selectedOption = selectEl.selectedOptions && selectEl.selectedOptions[0];
      if (!selectedOption || !selectedOption.value) return;
      
      // Extract price from option text (format: "Name - Set - ₱Price")
      const optionText = selectedOption.textContent || '';
      const priceMatch = optionText.match(/₱([\d,]+(?:\.\d{2})?)/);
      
      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        total += price * qty;
      }
    });
    
    // Add addon prices
    const addonCheckboxes = document.querySelectorAll('.addon-checkbox:checked');
    addonCheckboxes.forEach(checkbox => {
      const price = parseFloat(checkbox.dataset.price) || 0;
      total += price;
    });
    
    // Add rush fee if rush is Yes
    const rushInput = inquiryForm.querySelector('input[name="rush"]');
    if (rushInput && rushInput.value === 'Yes') {
      // Calculate rush fee based on items
      let rushFee = 0;
      itemRows.forEach(row => {
        const select = row.querySelector('.item-flower');
        const qty = parseInt(row.querySelector('.item-quantity').value) || 1;
        const opt = select && select.selectedOptions && select.selectedOptions[0];
        const productId = opt && opt.dataset && opt.dataset.productId;
        if (!productId) return;
        const prod = (_productsCache || []).find(p => String(p.id) === String(productId));
        const cat = prod && prod.category ? String(prod.category).trim() : '';
        const key = String(cat || '').trim().toLowerCase();
        const fee = _categoriesCache[key] || 0;
        if (fee) rushFee += fee * qty;
      });
      total += rushFee;
    }
    
    // Update total display using voucher handler if available
    if (window.regularVoucherHandler) {
      window.regularVoucherHandler.setCurrentTotal(total);
    } else {
      // Fallback: update display directly
      const totalDisplay = document.getElementById('orderFinalTotal');
      if (totalDisplay) {
        totalDisplay.textContent = total.toFixed(2);
      }
    }
  }

  // Make calculateOrderTotal globally accessible
  window.calculateOrderTotal = calculateOrderTotal;
  
  // Listen for addon changes to recalculate total
  document.addEventListener('change', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('addon-checkbox')) {
      calculateOrderTotal();
    }
  });
  
  // Listen for item flower selection changes to recalculate total
  document.addEventListener('change', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('item-flower')) {
      calculateOrderTotal();
    }
  });

  // Initial calculation when modal opens
  const inquiryModal = document.getElementById('inquiryModal');
  if (inquiryModal) {
    inquiryModal.addEventListener('shown.bs.modal', () => {
      setTimeout(calculateOrderTotal, 100);
    });
  }

  // --- end auto-fetch logic ---

  inquiryForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Submit the inquiry form to server. reCAPTCHA removed (server-side anti-abuse can be added later).
    const submitBtn = inquiryForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : null;
    // Build data object explicitly to support multiple items
    const data = {};
    const form = e.target;

    // run HTML5 validation (form has `novalidate` so we invoke reportValidity manually)
    try {
      if (typeof form.reportValidity === 'function') {
        if (!form.reportValidity()) return; // user will see which fields are missing/invalid
      } else if (!form.checkValidity || !form.checkValidity()) {
        return;
      }
    } catch (valErr) { /* ignore validation errors and continue; we'll still validate required fields below */ }
    
    // Check if user has entered voucher code but hasn't applied it
    const voucherInput = document.getElementById('voucherCodeInput');
    const hasVoucherCode = voucherInput && voucherInput.value.trim() !== '';
    const voucherApplied = window.regularVoucherHandler && window.regularVoucherHandler.hasVoucher();
    
    if (hasVoucherCode && !voucherApplied) {
      const proceed = await showVoucherWarningModal();
      if (!proceed) {
        return;
      }
    }
    data.user_name = form.querySelector('input[name="user_name"]').value;
    data.user_email = form.querySelector('input[name="user_email"]').value;
    data.fb_link = form.querySelector('input[name="fb_link"]').value;
    data.message = form.querySelector('textarea[name="message"]').value;
    data.rush = form.querySelector('input[name="rush"]').value;
    data.expected_delivery_date = form.querySelector('input[name="expected_delivery_date"]').value;
    data.addons = Array.from(form.querySelectorAll('input[name="addons[]"]:checked')).map(x => x.value);

    // Collect items
    const items = [];
    const itemRows = itemsContainer.querySelectorAll('.order-item');
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
      alertWarning('Please add at least one item to your order');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.removeAttribute('aria-busy'); if (originalBtnHtml !== null) submitBtn.innerHTML = originalBtnHtml; }
      return;
    }

    data.items = items;
    // For backwards-compatibility keep flower_type and quantity as summary
    data.flower_type = items.map(it => `${it.flower_type} x${it.quantity}`).join('; ');
    data.quantity = items.reduce((s, it) => s + (parseInt(it.quantity) || 0), 0) || 1;
    // Include client-side timestamps so orders can preserve user's local time
    try {
      const now = new Date();
      // UTC ISO (legacy/canonical)
      data.created_at = now.toISOString();
      // human-friendly local string for visibility
      data.created_at_local = now.toLocaleString();
      // numeric offset in minutes (local -> UTC)
      data.tz_offset_minutes = now.getTimezoneOffset();
      // local ISO-like value (YYYY-MM-DDTHH:MM:SS) — this reflects the user's OS local time
      const pad = (n) => String(n).padStart(2, '0');
      data.created_at_local_iso = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    } catch (e) { /* ignore */ }

    // Add voucher information if applied
    if (window.regularVoucherHandler && window.regularVoucherHandler.hasVoucher()) {
      const voucherData = window.regularVoucherHandler.getAppliedVoucher();
      data.voucher_code = voucherData.voucher.code;
      data.voucher_id = voucherData.voucher.id;
      data.voucher_discount = voucherData.discountAmount;
      data.original_total = voucherData.originalTotal;
    }

    try {
      // show loading state
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Placing...';
      }
      
      // Check authentication (optional for orders)
      const token = localStorage.getItem('auth_token');
      
      // Prepare headers with auth token if available
      const headers = { 
        'Content-Type': 'application/json'
      };
      
      // Only add auth header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // minimal debug
      const response = await fetch('/api/inquiry', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (response.ok) {
        // Record voucher usage if voucher was applied
        if (data.voucher_id && data.voucher_code) {
          try {
            await fetch('/api/vouchers/use', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                voucherId: data.voucher_id,
                orderId: result.orderId || result.order_id,
                customerEmail: data.user_email,
                customerId: null,
                discountAmount: data.voucher_discount
              })
            });
          } catch (voucherErr) {
            console.error('Failed to record voucher usage:', voucherErr);
          }
        }

        // hide the inquiry modal first so the placed modal appears above it
        try {
          const inquiryModalEl = document.getElementById('inquiryModal');
          if (inquiryModalEl) {
            const inquiryModalInstance = bootstrap.Modal.getInstance(inquiryModalEl) || new bootstrap.Modal(inquiryModalEl);
            inquiryModalInstance.hide();
          }
        } catch (hideErr) {}

        // redirect to success page with orderId in querystring
        try {
          const orderId = result.orderId || result.order_id || '';
          if (orderId) {
            // reset form and redirect
            e.target.reset();
            window.location.href = `/order-success.html?orderId=${encodeURIComponent(orderId)}`;
            return;
          }
        } catch (redirectErr) {alertSuccess(`Inquiry sent successfully! Your Order ID is: ${result.orderId}`);
        }
      } else {
        // Handle errors
        if (response.status === 401) {
          // Token expired or invalid - user needs to log in again
          localStorage.removeItem('auth_token');
          localStorage.removeItem('customer');
          alertError('Your session has expired. Please log in again to place an order.');
          window.location.href = '/customer-login.html';
          return;
        }
        alertError(result.error || 'Something went wrong. Please try again.');
      }
    } catch (error) {
      alertError('Failed to send inquiry. Please try again.');
      console.error('Error:', error);
    } finally {
      // restore button
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
        if (originalBtnHtml !== null) submitBtn.innerHTML = originalBtnHtml;
      }
    }
  });

  const trackForm = document.getElementById('trackForm');
  if (!trackForm) {
    return;
  }

  // If URL contains ?orderId=..., open the track modal, fill the input and auto-submit
  try {
    const params = new URLSearchParams(window.location.search);
    const urlOrderId = params.get('orderId') || params.get('order_id') || params.get('id');
    if (urlOrderId) {
      const orderInput = document.getElementById('orderId');
      const trackModalEl = document.getElementById('trackModal');
      if (orderInput) {
        orderInput.value = urlOrderId;
      }
      if (trackModalEl) {
        try {
          const modal = new bootstrap.Modal(trackModalEl);
          modal.show();
        } catch (e) { /* ignore */ }
      }
      // submit the form programmatically after a short delay to allow modal to render
      setTimeout(() => {
        try {
          if (typeof trackForm.requestSubmit === 'function') trackForm.requestSubmit();
          else trackForm.dispatchEvent(new Event('submit', { cancelable: true }));
        } catch (e) {}
      }, 400);
    }
  } catch (e) { /* ignore parsing errors */ }

  trackForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const orderId = document.getElementById('orderId').value;
    const trackResult = document.getElementById('trackResult');

    try {
      const response = await fetch(`/api/track/${orderId}`);
      const result = await response.json();

      if (response.ok) {
        // display a nicer card with a status badge and a simple progress indicator
        const status = String(result.status || 'Pending');
        const statusClass = (s) => {
          switch ((s||'').toLowerCase()) {
            case 'pending': return 'bg-warning text-dark';
            case 'processing': case 'confirmed': return 'bg-primary text-white';
            case 'to receive': case 'ready': return 'bg-info text-white';
            case 'delivered': case 'completed': return 'bg-success text-white';
            case 'cancelled': case 'rejected': return 'bg-danger text-white';
            default: return 'bg-secondary text-white';
          }
        };

        const statusIcon = (s) => {
          switch ((s||'').toLowerCase()) {
            case 'pending': return 'fa-clock';
            case 'processing': case 'confirmed': return 'fa-cog fa-spin';
            case 'to receive': case 'ready': return 'fa-box';
            case 'delivered': case 'completed': return 'fa-check-circle';
            case 'cancelled': case 'rejected': return 'fa-times-circle';
            default: return 'fa-info-circle';
          }
        };

        // compute progress steps
        const steps = [
          { name: 'Pending', icon: 'fa-clock' },
          { name: 'Processing', icon: 'fa-cog' },
          { name: 'To Receive', icon: 'fa-box' },
          { name: 'Delivered', icon: 'fa-check-circle' }
        ];
        const activeIndex = steps.findIndex(s => s.name.toLowerCase() === status.toLowerCase());

        // render steps as a progress bar
        const stepsHtml = `
          <div class="position-relative">
            <!-- Progress line -->
            <div class="position-absolute top-50 start-0 translate-middle-y w-100" style="height: 3px; background: #e0e0e0; z-index: 0;"></div>
            <div class="position-absolute top-50 start-0 translate-middle-y" style="height: 3px; background: #ff99bb; z-index: 0; width: ${activeIndex >= 0 ? (activeIndex / (steps.length - 1)) * 100 : 0}%;"></div>

            <!-- Steps -->
            <div class="d-flex justify-content-between position-relative" style="z-index: 1;">
              ${steps.map((s, i) => {
                const active = i <= activeIndex;
                const current = i === activeIndex;
                return `
                  <div class="text-center" style="flex: 1;">
                    <div class="rounded-circle d-inline-flex justify-content-center align-items-center mb-2"
                         style="width: 40px; height: 40px; background: ${active ? '#ff99bb' : '#e0e0e0'}; color: ${active ? '#fff' : '#999'}; border: 3px solid ${current ? '#ff6f9b' : 'transparent'};">
                      <i class="fa ${s.icon}"></i>
                    </div>
                    <div class="small fw-${active ? 'bold' : 'normal'}" style="color: ${active ? '#ff6f9b' : '#999'}; font-size: 0.75rem;">
                      ${escapeHtml(s.name)}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;

        trackResult.innerHTML = `
          <div class="card border-0 shadow-sm">
            <div class="card-body p-4">
              <!-- Header -->
              <div class="d-flex justify-content-between align-items-start mb-4 pb-3 border-bottom">
                <div>
                  <div class="small text-muted mb-1">Order ID</div>
                  <h5 class="card-title mb-1 fw-bold text-pink">${escapeHtml(result.orderId || '')}</h5>
                  <div class="small text-muted">
                    <i class="fa fa-user me-1"></i>${escapeHtml(result.name || 'Customer')} ·
                    <i class="fa fa-calendar ms-2 me-1"></i>${new Date(result.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div class="text-end">
                  <span class="badge ${statusClass(status)} rounded-pill px-3 py-2" style="font-size: 0.9rem;">
                    <i class="fa ${statusIcon(status)} me-1"></i>${escapeHtml(status)}
                  </span>
                </div>
              </div>

              <!-- Order Details -->
              <div class="mb-4">
                <div class="fw-semibold mb-3 text-muted" style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">
                  <i class="fa fa-shopping-bag me-2"></i>Order Details
                </div>
                <div class="bg-light rounded p-3">
                  ${(() => {
                    try {
                      if (Array.isArray(result.items) && result.items.length) {
                        return result.items.map(it => {
                          const name = it.name || it.flower_type || '';
                          let colorRaw = it.color || it.color_name || it.colorType || '';
                          let colorLabel = '';
                          if (colorRaw && typeof colorRaw === 'object') {
                            colorLabel = colorRaw.name || colorRaw.label || colorRaw.value || '';
                          } else if (colorRaw) {
                            colorLabel = String(colorRaw);
                          }
                          const colorPart = colorLabel ? ` <span class="badge bg-white text-dark border">${escapeHtml(colorLabel)}</span>` : '';
                          return `<div class="d-flex justify-content-between align-items-center mb-2">
                            <div><i class="fa fa-flower text-pink me-2"></i>${escapeHtml(name)}${colorPart}</div>
                            <div class="text-muted">×${it.quantity || 1}</div>
                          </div>`;
                        }).join('');
                      }
                      // fallback: try flower_type and color properties on result
                      const base = escapeHtml(result.flower_type || '');
                      let c = result.color || result.color_name || '';
                      if (c && typeof c === 'object') c = c.name || c.label || c.value || '';
                      const colorBadge = c ? ` <span class="badge bg-white text-dark border">${escapeHtml(String(c))}</span>` : '';
                      return `<div class="d-flex justify-content-between align-items-center">
                        <div><i class="fa fa-flower text-pink me-2"></i>${base}${colorBadge}</div>
                        <div class="text-muted">×${result.quantity || 1}</div>
                      </div>`;
                    } catch (e) { return `<div><i class="fa fa-flower text-pink me-2"></i>${escapeHtml(result.flower_type || '')}</div>`; }
                  })()}
                  ${result.addons?.length ? `
                    <div class="mt-2 pt-2 border-top">
                      <div class="small text-muted mb-1">Add-ons:</div>
                      <div class="small">${result.addons.map(a => `<span class="badge bg-pink text-white me-1">${escapeHtml(a)}</span>`).join('')}</div>
                    </div>
                  ` : ''}
                </div>
              </div>

              <!-- Total -->
              <div class="d-flex justify-content-between align-items-center mb-4 p-3 bg-light rounded">
                <div class="fw-semibold">Total Amount</div>
                <div class="h4 mb-0 text-pink fw-bold">₱${escapeHtml(String(result.total_fee || '0'))}</div>
              </div>

              <!-- Progress -->
              <div class="mb-3">
                <div class="fw-semibold mb-3 text-muted" style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">
                  <i class="fa fa-route me-2"></i>Order Progress
                </div>
                <div class="px-2">
                  ${stepsHtml}
                </div>
              </div>

              <!-- Actions -->
              <div class="mt-4 pt-3 border-top">
                <div class="d-flex gap-2 flex-wrap">
                  <a href="/?orderId=${encodeURIComponent(result.orderId || '')}" class="btn btn-outline-pink btn-sm flex-fill">
                    <i class="fa fa-refresh me-2"></i>Refresh Status
                  </a>
                  <a href="https://www.messenger.com/t/847673415097754" target="_blank" class="btn btn-outline-primary btn-sm flex-fill">
                    <i class="fa-brands fa-facebook-messenger me-2"></i>Contact Us
                  </a>
                </div>
              </div>

              <!-- Chat Section (only show if order is not delivered) -->
              ${status !== 'Delivered' ? `
                <div class="mt-4 pt-3 border-top">
                  <div class="fw-semibold mb-3 text-muted" style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">
                    <i class="fa fa-comments me-2"></i>Chat with Seller
                  </div>
                  
                  <!-- Chat Messages -->
                  <div id="chatMessages" class="bg-light rounded p-3 mb-3" style="max-height: 300px; overflow-y: auto;">
                    <div class="text-center text-muted small">
                      <i class="fa fa-spinner fa-spin me-2"></i>Loading messages...
                    </div>
                  </div>

                  <!-- Chat Input -->
                  <form id="chatForm" class="d-flex gap-2">
                    <input type="text" id="chatInput" class="form-control" placeholder="Type your message..." required>
                    <button type="submit" class="btn btn-pink">
                      <i class="fa fa-paper-plane"></i>
                    </button>
                  </form>
                </div>
              ` : ''}
            </div>
          </div>
        `;

        // Load chat messages if order is not delivered
        if (status !== 'Delivered') {
          loadChatMessages(result.orderId);
          
          // Setup chat form handler
          const chatForm = document.getElementById('chatForm');
          if (chatForm) {
            chatForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              await sendChatMessage(result.orderId);
            });
          }
        }
      } else {
        trackResult.innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
      }
    } catch (error) {
      trackResult.innerHTML = `<div class="alert alert-danger">Failed to track order. Please try again.</div>`;
    }
  });

  // Copy tracking link button handler
  const copyTrackLinkBtn = document.getElementById('copyTrackLinkBtn');
  if (copyTrackLinkBtn) {
    copyTrackLinkBtn.addEventListener('click', async () => {
      const orderIdInput = document.getElementById('orderId');
      const orderId = orderIdInput ? orderIdInput.value.trim() : '';
      
      if (!orderId) {
        alertWarning('Please enter an Order ID first');
        return;
      }

      const trackingUrl = `${window.location.origin}/?orderId=${encodeURIComponent(orderId)}`;
      
      try {
        await navigator.clipboard.writeText(trackingUrl);
        
        // Visual feedback
        const originalIcon = copyTrackLinkBtn.innerHTML;
        copyTrackLinkBtn.innerHTML = '<i class="fa fa-check"></i>';
        copyTrackLinkBtn.classList.remove('btn-outline-secondary');
        copyTrackLinkBtn.classList.add('btn-success');
        
        setTimeout(() => {
          copyTrackLinkBtn.innerHTML = originalIcon;
          copyTrackLinkBtn.classList.remove('btn-success');
          copyTrackLinkBtn.classList.add('btn-outline-secondary');
        }, 2000);
      } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = trackingUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          alertSuccess('Tracking link copied to clipboard!');
        } catch (e) {
          alertError('Failed to copy link. Please copy manually: ' + trackingUrl);
        }
        document.body.removeChild(textArea);
      }
    });
  }

  // Chat functionality for order tracking
  async function loadChatMessages(orderId) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    try {
      const response = await fetch(`/api/chat/${encodeURIComponent(orderId)}`);
      const data = await response.json();

      if (response.ok && data.messages) {
        if (data.messages.length === 0) {
          chatMessages.innerHTML = `
            <div class="text-center text-muted small py-3">
              <i class="fa fa-comments me-2"></i>No messages yet. Start a conversation!
            </div>
          `;
        } else {
          chatMessages.innerHTML = data.messages.map(msg => {
            const isCustomer = msg.sender_type === 'customer';
            const time = new Date(msg.created_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            });
            
            return `
              <div class="mb-3 ${isCustomer ? 'text-end' : ''}">
                <div class="d-inline-block ${isCustomer ? 'bg-pink text-white' : 'bg-white'} rounded px-3 py-2" style="max-width: 80%;">
                  <div class="small fw-semibold mb-1">${isCustomer ? 'You' : 'Seller'}</div>
                  <div>${escapeHtml(msg.message)}</div>
                  <div class="small opacity-75 mt-1">${time}</div>
                </div>
              </div>
            `;
          }).join('');
          
          // Scroll to bottom
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      } else {
        chatMessages.innerHTML = `
          <div class="text-center text-danger small">
            <i class="fa fa-exclamation-circle me-2"></i>Failed to load messages
          </div>
        `;
      }
    } catch (error) {
      console.error('Error loading chat messages:', error);
      chatMessages.innerHTML = `
        <div class="text-center text-danger small">
          <i class="fa fa-exclamation-circle me-2"></i>Failed to load messages
        </div>
      `;
    }
  }

  async function sendChatMessage(orderId) {
    const chatInput = document.getElementById('chatInput');
    const chatForm = document.getElementById('chatForm');
    const chatMessages = document.getElementById('chatMessages');
    
    if (!chatInput || !chatForm) return;

    const message = chatInput.value.trim();
    if (!message) return;

    // Disable form while sending
    const submitBtn = chatForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    }

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          message: message,
          sender_type: 'customer'
        })
      });

      const result = await response.json();

      if (response.ok) {
        // Clear input
        chatInput.value = '';
        
        // Reload messages
        await loadChatMessages(orderId);
      } else {
        alertError(result.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alertError('Failed to send message. Please try again.');
    } finally {
      // Re-enable form
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  }

  // Helper function to escape HTML
  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Floating chat functionality removed - now in dashboard.html only
});