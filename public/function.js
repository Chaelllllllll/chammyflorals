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
      // restore defaults
      if (addonsContainer) addonsContainer.innerHTML = defaultAddonsHtml;
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
        // no product match: keep default addons
        if (addonsContainer) addonsContainer.innerHTML = defaultAddonsHtml;
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
        } else {
          // no product-specific addons: restore default list
          addonsContainer.innerHTML = defaultAddonsHtml;
        }
      }
    } catch (err) {
      console.error('Failed to fetch product info for inquiry:', err);
      if (addonsContainer) addonsContainer.innerHTML = defaultAddonsHtml;
    }
  }

  if (flowerSelect) {
    flowerSelect.addEventListener('change', onFlowerTypeChange);
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
          groups[cat].push({ code, text });
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
        og.appendChild(opt);
      });
      selectEl.appendChild(og);
    });
  }

  function createItemRow(index) {
    const row = document.createElement('div');
    row.className = 'order-item d-flex gap-2 align-items-start mb-2';
    row.innerHTML = `
      <select class="form-select item-flower" name="flower_type_${index}" required>
        <option value="">Select Flower Type</option>
      </select>
      <input type="number" class="form-control item-quantity" name="quantity_${index}" min="1" value="1" required style="width:110px;">
      <button type="button" class="btn btn-outline-danger btn-sm remove-item" style="height:38px;">&times;</button>
    `;
    const selectEl = row.querySelector('.item-flower');
    populateItemSelect(selectEl);
    // attach change handler so addons preview updates when item selection changes
    try { selectEl.addEventListener('change', onFlowerTypeChange); } catch (e) {}
    row.querySelector('.remove-item').addEventListener('click', () => {
      if (itemsContainer.children.length <= 1) return; // keep at least one
      row.remove();
    });
    return row;
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
      try { s.addEventListener('change', onFlowerTypeChange); } catch (e) {}
    });
  })();

  addItemBtn.addEventListener('click', () => {
    const idx = itemsContainer.children.length;
    const newRow = createItemRow(idx);
    itemsContainer.appendChild(newRow);
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
      if (!flower) return;
      items.push({ flower_type: flower, quantity: qty });
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
        trackResult.innerHTML = `
          <div class="alert alert-success">
            <h5>Order Details</h5>
            <p><strong>Order ID:</strong> ${result.orderId}</p>
            <p><strong>Name:</strong> ${result.name}</p>
            <p><strong>Flower Type:</strong> ${result.flower_type}</p>
            <p><strong>Quantity:</strong> ${result.quantity}</p>
            <p><strong>Add-ons:</strong> ${result.addons?.length ? result.addons.join(', ') : 'None'}</p>
            <p><strong>Total Fee:</strong> ₱${result.total_fee}</p>
            <p><strong>Status:</strong> ${result.status}</p>
            <p><strong>Order Date:</strong> ${new Date(result.created_at).toLocaleDateString()}</p>
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