document.addEventListener('DOMContentLoaded', () => {
  const inquiryForm = document.getElementById('inquiryForm');
  if (!inquiryForm) {
    console.error('Inquiry form not found');
    return;
  }

  // --- Auto-fetch product & addons when Flower Type changes ---
  const flowerSelect = inquiryForm.querySelector('select[name="flower_type"]');
  const addonsContainer = document.getElementById('addonsContainer');
  const defaultAddonsHtml = addonsContainer ? addonsContainer.innerHTML : '';
  const addonsWrapper = addonsContainer ? addonsContainer.parentElement : null;
  // hide addons section by default until a product with addons is selected
  try { if (addonsWrapper) addonsWrapper.style.display = 'none'; } catch (e) {}
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
          const html = product.addons.map(a => {
            if (typeof a === 'string') {
              const val = escapeHtml(a);
              return `<div class="form-check"><input type="checkbox" name="addons[]" value="${val}" class="form-check-input"><label class="form-check-label">${val}</label></div>`;
            }
            const label = String(a.label || '').trim();
            const price = a.price != null ? `₱${Number(a.price).toLocaleString()}` : '';
            const value = escapeHtml(label + (price ? ` - ${price}` : ''));
            return `<div class="form-check"><input type="checkbox" name="addons[]" value="${value}" class="form-check-input"><label class="form-check-label">${escapeHtml(label)}${price ? ` - ${price}` : ''}</label></div>`;
          }).join('');
          addonsContainer.innerHTML = html;
          try { if (addonsWrapper) addonsWrapper.style.display = ''; } catch (e) {}
        } else {
          // no product-specific addons: hide the addons wrapper
          try { if (addonsWrapper) { addonsWrapper.style.display = 'none'; addonsContainer.innerHTML = ''; } else { addonsContainer.innerHTML = ''; } } catch (e) {}
        }
      }
    } catch (err) {
      console.error('Failed to fetch product info for inquiry:', err);
      try { if (addonsWrapper) addonsWrapper.style.display = 'none'; else if (addonsContainer) addonsContainer.innerHTML = defaultAddonsHtml; } catch (e) {}
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
      <div class="item-controls d-flex align-items-center gap-2 w-100">
        <select class="form-select item-flower" name="flower_type_${index}" required>
          <option value="">Select Flower Type</option>
        </select>
        <select class="form-select item-color" name="color_${index}" aria-label="Color selection">
          <option value="">Select Color</option>
        </select>
        <input type="number" class="form-control item-quantity" name="quantity_${index}" min="1" value="1" required>
        <button type="button" class="btn btn-outline-danger btn-sm remove-item">&times;</button>
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
      // update rush fee when item removed
      computeRushFee();
    });
    return row;
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
    } catch (err) { console.warn('populateColorSelectForRow error', err); }
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
    } catch (err) {
      console.warn('Failed to load categories for rush fee calculation', err);
      _categoriesCache = {};
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
    } catch (err) { console.warn('computeRushFee error', err); }
  }

  // load categories and compute initial value
  loadCategoriesForRush().then(() => computeRushFee()).catch(() => {});

  // recompute when quantity inputs change
  itemsContainer.addEventListener('input', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('item-quantity')) computeRushFee();
  });

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
    data.user_name = form.querySelector('input[name="user_name"]').value;
    data.user_email = form.querySelector('input[name="user_email"]').value;
    data.fb_link = form.querySelector('input[name="fb_link"]').value;
    data.message = form.querySelector('textarea[name="message"]').value;
    data.rush = form.querySelector('select[name="rush"]').value;
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
      alert('Please add at least one item to your order');
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

    try {
      // show loading state
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Placing...';
      }

  console.log('Submitting inquiry:', { items: data.items, quantity: data.quantity }); // minimal debug
      const response = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (response.ok) {
        // hide the inquiry modal first so the placed modal appears above it
        try {
          const inquiryModalEl = document.getElementById('inquiryModal');
          if (inquiryModalEl) {
            const inquiryModalInstance = bootstrap.Modal.getInstance(inquiryModalEl) || new bootstrap.Modal(inquiryModalEl);
            inquiryModalInstance.hide();
          }
        } catch (hideErr) {
          console.warn('Failed to hide inquiry modal before showing placed modal:', hideErr);
        }

        // redirect to success page with orderId in querystring
        try {
          const orderId = result.orderId || result.order_id || '';
          if (orderId) {
            // reset form and redirect
            e.target.reset();
            window.location.href = `/order-success.html?orderId=${encodeURIComponent(orderId)}`;
            return;
          }
        } catch (redirectErr) {
          console.warn('Failed to redirect to success page:', redirectErr);
          alert(`Inquiry sent successfully! Your Order ID is: ${result.orderId}`);
        }
      } else {
        alert(result.error || 'Something went wrong. Please try again.');
      }
    } catch (error) {
      alert('Failed to send inquiry. Please try again.');
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
    console.error('Track form not found');
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
        } catch (e) { console.warn('Auto-submit track form failed', e); }
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
            case 'processing': return 'bg-primary text-white';
            case 'to receive': return 'bg-success text-white';
            case 'delivered': return 'bg-success text-white';
            case 'cancelled': return 'bg-secondary text-white';
            default: return 'bg-light text-dark';
          }
        };

        // compute progress steps
        const steps = ['Pending','Processing','To Receive','Delivered'];
        const activeIndex = steps.findIndex(s => s.toLowerCase() === status.toLowerCase());

        // render steps in a wrapping flex container to avoid overflow on small screens
        const stepsHtml = steps.map((s,i)=>{
          const active = i <= activeIndex;
          return `<div class="d-flex align-items-center">
            <div class="rounded-circle d-inline-flex justify-content-center align-items-center me-2" style="width:28px;height:28px;${active? 'background:#ff99bb;color:#fff;': 'background:#eee;color:#666;'}">${i+1}</div>
            <div class="small">${escapeHtml(s)}</div>
          </div>`;
        }).join('');

        trackResult.innerHTML = `
          <div class="card border-0 shadow-sm">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <h5 class="card-title mb-0">Order ${escapeHtml(result.orderId || '')}</h5>
                  <div class="small text-muted">${escapeHtml(result.name || '')} · ${new Date(result.created_at).toLocaleDateString()}</div>
                </div>
                <div class="text-end">
                  <span class="badge ${statusClass(status)} rounded-pill">${escapeHtml(status)}</span>
                </div>
                </div>
              <div class="mb-3">
                <div class="small text-muted">Items</div>
                <div class="mt-2">
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
                          const colorPart = colorLabel ? ` (${escapeHtml(colorLabel)})` : '';
                          return '<div>' + escapeHtml(name) + colorPart + '</div>';
                        }).join('');
                      }
                      // fallback: try flower_type and color properties on result
                      const base = escapeHtml(result.flower_type || '');
                      let c = result.color || result.color_name || '';
                      if (c && typeof c === 'object') c = c.name || c.label || c.value || '';
                      return '<div>' + base + (c ? (' (' + escapeHtml(String(c)) + ')') : '') + '</div>';
                    } catch (e) { return `<div>${escapeHtml(result.flower_type || '')}</div>`; }
                  })()}
                  <div class="small text-muted">Quantity: ${escapeHtml(String(result.quantity || '1'))}</div>
                  <div class="small text-muted">Add-ons: ${result.addons?.length ? escapeHtml(result.addons.join(', ')) : 'None'}</div>
                </div>
              </div>
              </div>
              <div class="mb-3 me-4 text-end">
                <div class="small text-muted">Total Fee</div>
                <div class="h5">₱${escapeHtml(String(result.total_fee || '0'))}</div>
              </div>

              <div class="mb-3">
                <div class="small text-muted mb-2 ms-2">Order Progress</div>
                <div class="d-flex flex-wrap align-items-center gap-3 ms-3">
                  ${stepsHtml}
                </div>
              </div>
            </div>
          </div>
        `;
      } else {
        trackResult.innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
      }
    } catch (error) {
      trackResult.innerHTML = `<div class="alert alert-danger">Failed to track order. Please try again.</div>`;
    }
  });
});