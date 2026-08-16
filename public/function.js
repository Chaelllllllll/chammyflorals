const initChammyFlorals = () => {
  try {
    const logs = JSON.parse(sessionStorage.getItem('chammy_logs') || '[]');
    logs.push({ time: new Date().toLocaleTimeString(), event: 'initChammyFlorals started' });
    sessionStorage.setItem('chammy_logs', JSON.stringify(logs));
  } catch(e) {}
  // Check custom order status setting
  async function checkCustomOrderStatus() {
    const customBtns = ['navCustomizeBtn', 'mobileNavCustomizeBtn', 'heroCustomizeBtn'];
    try {
      const res = await fetch('/api/settings/custom-order-status');
      if (res.ok) {
        const { status } = await res.json();
        if (status === 'open') {
          // Show custom order buttons if open by removing inline display: none
          customBtns.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.style.removeProperty('display');
          });
        } else {
          // Explicitly keep/set them hidden
          customBtns.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.style.setProperty('display', 'none', 'important');
          });
        }
      } else {
        // Fallback: show buttons if API fails
        customBtns.forEach(id => {
          const btn = document.getElementById(id);
          if (btn) btn.style.removeProperty('display');
        });
      }
    } catch (err) {
      console.error('Failed to check custom order status:', err);
      // Fallback: show buttons if error occurs
      customBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.removeProperty('display');
      });
    }
  }
  checkCustomOrderStatus();

  const inquiryForm = document.getElementById('inquiryForm');
  try {
    const logs = JSON.parse(sessionStorage.getItem('chammy_logs') || '[]');
    logs.push({ time: new Date().toLocaleTimeString(), event: 'inquiryForm lookup', found: !!inquiryForm });
    sessionStorage.setItem('chammy_logs', JSON.stringify(logs));
  } catch(e) {}
  if (!inquiryForm) {
    return;
  }

  // Fetch meetup places from settings and populate dropdown immediately on script load
  (function fetchMeetupPlaces() {
    const savedMeetup = localStorage.getItem('customer_preferred_meetup_place');
    fetch('/api/settings/meetup-places?t=' + Date.now())
      .then(res => res.json())
      .then(data => {
        const meetupInput = inquiryForm.querySelector('select[name="preferred_meetup_place"]');
        if (meetupInput) {
          meetupInput.innerHTML = '<option value="" disabled selected>Select preferred meetup place</option>';
          if (data.places && Array.isArray(data.places) && data.places.length > 0) {
            data.places.forEach(place => {
              const opt = document.createElement('option');
              opt.value = place;
              opt.textContent = place;
              meetupInput.appendChild(opt);
            });
            const savedState = localStorage.getItem('inquiry_form_state');
            const state = savedState ? JSON.parse(savedState) : null;
            const stateMeetup = state ? state.preferred_meetup_place : '';
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
        const meetupInput = inquiryForm.querySelector('select[name="preferred_meetup_place"]');
        if (meetupInput) meetupInput.innerHTML = '<option value="" disabled selected>Error loading places</option>';
      });
  })();

  const isAdminDashboardPage = window.location.pathname.startsWith('/admin/');

  // Pre-fill customer information if logged in
  // Save inquiryForm fields to localStorage on input/change
  // Save inquiryForm fields to localStorage on input/change
  function saveInquiryFormState() {
    if (!inquiryForm) return;

    // Collect items
    const items = [];
    const itemRows = inquiryForm.querySelectorAll('.order-item');
    itemRows.forEach(row => {
      const flowerSelect = row.querySelector('.item-flower');
      const colorSelect = row.querySelector('.item-color');
      const qtyInput = row.querySelector('.item-quantity');
      if (flowerSelect && flowerSelect.value) {
        items.push({
          flower_type: flowerSelect.value,
          color: colorSelect ? colorSelect.value : '',
          quantity: qtyInput ? parseInt(qtyInput.value) || 1 : 1
        });
      }
    });

    const state = {
      user_name: inquiryForm.querySelector('input[name="user_name"]')?.value || '',
      user_email: inquiryForm.querySelector('input[name="user_email"]')?.value || '',
      fb_link: inquiryForm.querySelector('input[name="fb_link"]')?.value || '',
      delivery_address: inquiryForm.querySelector('input[name="delivery_address"]')?.value || '',
      preferred_meetup_place: inquiryForm.querySelector('select[name="preferred_meetup_place"]')?.value || '',
      expected_delivery_date: inquiryForm.querySelector('input[name="expected_delivery_date"]')?.value || '',
      message: inquiryForm.querySelector('textarea[name="message"]')?.value || '',
      voucher_code: document.getElementById('voucherCodeInput')?.value || '',
      items: items,
      addons: Array.from(inquiryForm.querySelectorAll('input[name="addons[]"]:checked')).map(x => x.value)
    };
    console.log('Chammy Florals: saveInquiryFormState called, saving state:', state);
    try {
      const logs = JSON.parse(sessionStorage.getItem('chammy_logs') || '[]');
      logs.push({ time: new Date().toLocaleTimeString(), event: 'saveInquiryFormState', state });
      sessionStorage.setItem('chammy_logs', JSON.stringify(logs));
    } catch(e) {}
    localStorage.setItem('inquiry_form_state', JSON.stringify(state));
  }

  // Load state and populate form fields
  async function loadInquiryFormState() {
    if (!inquiryForm) return;
    try {
      const saved = localStorage.getItem('inquiry_form_state');
      console.log('Chammy Florals: loadInquiryFormState called, read from localStorage:', saved);
      try {
        const logs = JSON.parse(sessionStorage.getItem('chammy_logs') || '[]');
        logs.push({ time: new Date().toLocaleTimeString(), event: 'loadInquiryFormState', saved });
        sessionStorage.setItem('chammy_logs', JSON.stringify(logs));
      } catch(e) {}
      if (saved) {
        const state = JSON.parse(saved);
        if (state.user_name) {
          const el = inquiryForm.querySelector('input[name="user_name"]');
          if (el && !el.readOnly) el.value = state.user_name;
        }
        if (state.user_email) {
          const el = inquiryForm.querySelector('input[name="user_email"]');
          if (el && !el.readOnly) el.value = state.user_email;
        }
        if (state.fb_link) {
          const el = inquiryForm.querySelector('input[name="fb_link"]');
          if (el) el.value = state.fb_link;
        }
        if (state.delivery_address) {
          const el = inquiryForm.querySelector('input[name="delivery_address"]');
          if (el) {
            el.value = state.delivery_address;
            if (typeof checkMuntinlupaForInput === 'function') {
              checkMuntinlupaForInput(el, state.delivery_address);
            }
          }
        }
        if (state.preferred_meetup_place) {
          const el = inquiryForm.querySelector('select[name="preferred_meetup_place"]');
          if (el) {
            setTimeout(() => {
              el.value = state.preferred_meetup_place;
            }, 500);
          }
        }
        if (state.expected_delivery_date) {
          const el = inquiryForm.querySelector('input[name="expected_delivery_date"]');
          if (el) {
            el.value = state.expected_delivery_date;
            setTimeout(() => {
              el.dispatchEvent(new Event('change'));
            }, 100);
          }
        }
        if (state.message) {
          const el = inquiryForm.querySelector('textarea[name="message"]');
          if (el) el.value = state.message;
        }
        if (state.voucher_code) {
          const el = document.getElementById('voucherCodeInput');
          if (el) el.value = state.voucher_code;
        }

        // Wait until products cache is loaded before rebuilding items
        let tries = 0;
        while (!_productsCache && tries < 100) {
          await new Promise(r => setTimeout(r, 100));
          tries++;
        }

        if (_productsCache && Array.isArray(state.items) && state.items.length) {
          inquiryFormStateLoaded = true;
          const container = document.getElementById('itemsContainer');
          if (container) {
            container.innerHTML = '';
            for (let idx = 0; idx < state.items.length; idx++) {
              const it = state.items[idx];
              const row = createItemRow(idx);
              container.appendChild(row);
              
              const flowerSelect = row.querySelector('.item-flower');
              if (flowerSelect) {
                flowerSelect.value = it.flower_type || '';
                populateColorSelectForRow(row);
                
                const colorSelect = row.querySelector('.item-color');
                if (colorSelect && it.color) {
                  colorSelect.value = it.color;
                }
              }
              const qtyInput = row.querySelector('.item-quantity');
              if (qtyInput) {
                qtyInput.value = it.quantity || 1;
              }
              updateQuantityLimits(row);
            }
            updateItemNumbers();

            // Trigger check for first item to load addons & calculate
            const firstSelect = container.querySelector('.item-flower');
            if (firstSelect && firstSelect.value) {
              await onFlowerTypeChange({ target: firstSelect });
              
              // Restore checked addons
              if (Array.isArray(state.addons)) {
                state.addons.forEach(addOnValue => {
                  const base = addOnValue.split(' ×')[0];
                  const cb = inquiryForm.querySelector(`.addon-checkbox[data-base-value="${base}"], .addon-checkbox[value="${addOnValue}"]`);
                  if (cb) {
                    cb.checked = true;
                    const m = addOnValue.match(/×\s*(\d+)$/);
                    if (m) {
                      const qty = parseInt(m[1]) || 1;
                      const qtyInput = cb.closest('.addon-item')?.querySelector('.addon-qty');
                      if (qtyInput) {
                        qtyInput.value = qty;
                        qtyInput.disabled = false;
                      }
                    }
                  }
                });
              }
            }
            computeRushFee();
            calculateOrderTotal();
          }
        }
      }
    } catch (e) {
      console.error('Error loading inquiry form state:', e);
    }
  }

  // Pre-fill customer information if logged in
  function prefillCustomerInfo() {
    try {
      const logs = JSON.parse(sessionStorage.getItem('chammy_logs') || '[]');
      logs.push({ time: new Date().toLocaleTimeString(), event: 'prefillCustomerInfo started' });
      sessionStorage.setItem('chammy_logs', JSON.stringify(logs));
    } catch(e) {}
    const customerData = localStorage.getItem('customer');
    if (customerData) {
      try {
        const customer = JSON.parse(customerData);
        
        // Pre-fill name field
        const nameInput = inquiryForm.querySelector('input[name="user_name"]');
        if (nameInput && customer.name) {
          nameInput.value = customer.name;
          if (isAdminDashboardPage) {
            nameInput.readOnly = false;
            nameInput.removeAttribute('readonly');
            nameInput.style.backgroundColor = '';
          } else {
            nameInput.readOnly = true;
            nameInput.style.backgroundColor = '#f8f9fa';
          }
        }
        
        // Pre-fill email field
        const emailInput = inquiryForm.querySelector('input[name="user_email"]');
        if (emailInput && customer.email) {
          emailInput.value = customer.email;
          if (isAdminDashboardPage) {
            emailInput.readOnly = false;
            emailInput.removeAttribute('readonly');
            emailInput.style.backgroundColor = '';
          } else {
            emailInput.readOnly = true;
            emailInput.style.backgroundColor = '#f8f9fa';
          }
        }
      } catch (error) {
      }
    }

    // Always pre-fill saved delivery address and preferred meetup place if they exist in localStorage
    try {
      const savedAddress = localStorage.getItem('customer_delivery_address');
      if (savedAddress) {
        const addressInput = inquiryForm.querySelector('input[name="delivery_address"]');
        if (addressInput) {
          addressInput.value = savedAddress;
          // Trigger Muntinlupa check for meetup section display
          if (typeof checkMuntinlupaForInput === 'function') {
            checkMuntinlupaForInput(addressInput, savedAddress);
          }
        }
      }
    } catch (e) {}

    // Load persisted state from localStorage
    loadInquiryFormState();
  }

  // Attach event listeners for saving state
  if (inquiryForm) {
    inquiryForm.addEventListener('input', saveInquiryFormState);
    inquiryForm.addEventListener('change', saveInquiryFormState);
    const voucherInput = document.getElementById('voucherCodeInput');
    if (voucherInput) {
      voucherInput.addEventListener('input', saveInquiryFormState);
    }
  }

  // Prefill call moved to the end of DOMContentLoaded to ensure all helper functions are defined

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
  let inquiryFormStateLoaded = false;

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

  // --- Add-on quantity helpers ---

  // Reads the quantity stepper paired with an addon checkbox (defaults to 1).
  function getAddonQty(checkbox) {
    try {
      const item = checkbox.closest('.addon-item');
      const qtyInput = item ? item.querySelector('.addon-qty') : null;
      const qty = qtyInput ? parseInt(qtyInput.value) : 1;
      return qty > 0 ? qty : 1;
    } catch (e) { return 1; }
  }

  // Re-encodes the addon checkbox value so a quantity > 1 is carried as a
  // trailing " ×N" marker (e.g. "Card - ₱50" -> "Card - ₱50 ×2").
  function syncAddonValue(checkbox) {
    if (!checkbox) return;
    const qty = getAddonQty(checkbox);
    const base = checkbox.dataset.baseValue || checkbox.value || '';
    checkbox.value = qty > 1 ? `${base} ×${qty}` : base;
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
      // Each addon row includes a quantity stepper so the customer can order
      // more than one of a given add-on. The quantity is encoded into the
      // checkbox value as a trailing " ×N" marker (e.g. "Card - ₱50 ×2") so it
      // survives submission and can be parsed server-side.
      if (addonsContainer) {
        if (product.addons && Array.isArray(product.addons) && product.addons.length) {
          const html = product.addons.map((a, idx) => {
            if (typeof a === 'string') {
              const raw = String(a);
              const val = escapeHtml(raw);
              // Some add-on strings embed their price ("Card - ₱50"); extract it so
              // the client-side total agrees with the server-side calculation.
              const pm = raw.match(/₱\s?([0-9,]+(?:\.[0-9]+)?)/);
              const strPrice = pm ? (parseFloat(pm[1].replace(/,/g, '')) || 0) : 0;
              return `<div class="addon-item form-check mb-2 d-flex align-items-center gap-2 flex-wrap"><input type="checkbox" name="addons[]" value="${val}" class="form-check-input addon-checkbox" id="addon_${idx}" data-name="${val}" data-price="${strPrice}" data-base-value="${val}"><label class="form-check-label fw-semibold flex-grow-1" for="addon_${idx}" style="cursor: pointer;">${val}</label><input type="number" class="form-control form-control-sm addon-qty text-center" style="width: 76px;" min="1" value="1" disabled aria-label="Quantity for ${val}"></div>`;
            }
            const label = String(a.label || a.name || '').trim();
            const price = a.price != null ? Number(a.price) : 0;
            const priceStr = price > 0 ? `₱${price.toLocaleString()}` : '';
            const id = 'addon_' + idx;
            const valueStr = label + (priceStr ? ` - ${priceStr}` : '');
            return `<div class="addon-item form-check mb-2 d-flex align-items-center gap-2 flex-wrap"><input type="checkbox" name="addons[]" value="${escapeHtml(valueStr)}" class="form-check-input addon-checkbox" id="${id}" data-name="${escapeHtml(label)}" data-price="${price}" data-base-value="${escapeHtml(valueStr)}"><label class="form-check-label flex-grow-1" for="${id}" style="cursor: pointer;"><span class="fw-semibold">${escapeHtml(label)}</span>${priceStr ? ` <span class="badge bg-pink text-white ms-2">${priceStr}</span>` : ''}</label><input type="number" class="form-control form-control-sm addon-qty text-center" style="width: 76px;" min="1" value="1" disabled aria-label="Quantity for ${escapeHtml(label)}"></div>`;
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
      <div class="flex flex-col gap-2.5 p-3 bg-slate-50/90 rounded-xl border border-slate-200/80 w-full transition-all flex-wrap">
        <div class="flex items-center gap-2.5 w-full flex-col sm:flex-row">
          <span class="badge bg-rose-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold text-center shrink-0">Item ${index + 1}</span>
          <select class="form-select item-flower flex-1 text-sm sm:text-base py-2" name="flower_type_${index}" required>
            <option value="">Select Bouquet / Item</option>
          </select>
          <select class="form-select item-color w-full sm:w-36 text-sm sm:text-base py-2" name="color_${index}" aria-label="Color">
            <option value="">Color</option>
          </select>
          <input type="number" class="form-control item-quantity text-center w-full sm:w-24 text-sm sm:text-base py-2" name="quantity_${index}" min="1" value="1" required placeholder="Qty">
          <button type="button" class="btn btn-sm btn-outline-danger remove-item p-2">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
    `;
    const selectEl = row.querySelector('.item-flower');
    populateItemSelect(selectEl);
    if (_productsCache) {
      try { populateColorSelectForRow(row); } catch (e) {}
    } else {
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
    }
    
    // attach change handler so addons preview updates when item selection changes
    try { 
      selectEl.addEventListener('change', (ev) => { 
        onFlowerTypeChange(ev); 
        computeRushFee(); 
        populateColorSelectForRow(row); 
        updateQuantityLimits(row);
        calculateOrderTotal();
      }); 
    } catch (e) {}
    
    row.querySelector('.remove-item').addEventListener('click', () => {
      if (itemsContainer.children.length <= 1) return; // keep at least one
      row.remove();
      // update item numbers
      updateItemNumbers();
      // update rush fee when item removed
      computeRushFee();
      calculateOrderTotal();
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
    if (inquiryFormStateLoaded) return;
    const initialSelects = itemsContainer.querySelectorAll('.item-flower');
    initialSelects.forEach(s => {
      populateItemSelect(s);
      try { 
        s.addEventListener('change', (ev) => { 
          onFlowerTypeChange(ev); 
          computeRushFee(); 
          populateColorSelectForRow(s.closest('.order-item')); 
          updateQuantityLimits(s.closest('.order-item'));
          calculateOrderTotal();
        }); 
      } catch (e) {}
      // populate color select + quantity limits for existing rows
      const row = s.closest('.order-item');
      if (row) {
        populateColorSelectForRow(row);
        updateQuantityLimits(row);
      }
    });
  })();

  addItemBtn.addEventListener('click', () => {
    const idx = itemsContainer.children.length;
    const newRow = createItemRow(idx);
    itemsContainer.appendChild(newRow);
    updateQuantityLimits(newRow);
    // recompute rush fee when new item added
    computeRushFee();
  });

  // --- Min/Max quantity enforcement per product ---

  // Reads the selected product's min_qty/max_qty, applies the limits to the
  // quantity input, clamps the current value, and shows a helper hint.
  function updateQuantityLimits(row) {
    try {
      const select = row.querySelector('.item-flower');
      const qtyInput = row.querySelector('.item-quantity');
      if (!select || !qtyInput) return;
      const opt = select.selectedOptions && select.selectedOptions[0];
      const productId = opt && opt.dataset && opt.dataset.productId;
      let minQty = 1;
      let maxQty = null;
      let productName = opt && opt.textContent
        ? opt.textContent.replace(/₱[\d,]+(?:\.\d{2})?/g, '').replace(/\s*-\s*$/, '').trim()
        : '';
      if (!productName) productName = opt && opt.value ? opt.value : '';
      if (productId) {
        const prod = (_productsCache || []).find(p => String(p.id) === String(productId));
        if (prod) {
          minQty = parseInt(prod.min_qty) || 1;
          maxQty = prod.max_qty != null && prod.max_qty !== '' ? parseInt(prod.max_qty) : null;
          if (maxQty != null && maxQty < minQty) maxQty = minQty;
          if (prod.name) productName = String(prod.name);
        }
      }
      // NOTE: We intentionally do NOT set the native min/max attributes here.
      // The form uses `novalidate` + manual reportValidity(), so native attrs
      // would trigger the browser's generic bubble instead of our friendly
      // inline error + alert. Limits are enforced by validateOrderQuantities().

      // Clamp the current value to be at least 1, and at most the product's maxQty
      let val = parseInt(qtyInput.value) || 1;
      if (val < 1) val = 1;
      if (maxQty != null && val > maxQty) val = maxQty;
      if (String(qtyInput.value) !== String(val)) {
        qtyInput.value = val;
        calculateOrderTotal();
      }

      // Show a helper hint under the row
      let hint = row.querySelector('.item-qty-hint');
      if (!hint) {
        hint = document.createElement('small');
        hint.className = 'item-qty-hint d-block mt-1';
        hint.style.fontSize = '11px';
        row.appendChild(hint);
      }
      hint.style.display = 'none';
      // clear any stale error styling
      qtyInput.classList.remove('is-invalid');
      const errEl = row.querySelector('.item-qty-error');
      if (errEl) errEl.style.display = 'none';
    } catch (e) {}
  }

  // Validates every item row's quantity against the selected product's
  // min/max. Marks offending rows and returns human-readable errors.
  function validateOrderQuantities() {
    const errors = [];
    const rows = itemsContainer ? itemsContainer.querySelectorAll('.order-item') : [];
    
    // Group quantities by product ID
    const productGroups = {};
    
    // Clear all previous errors first
    rows.forEach(row => {
      const qtyInput = row.querySelector('.item-quantity');
      if (qtyInput) qtyInput.classList.remove('is-invalid');
      const errEl = row.querySelector('.item-qty-error');
      if (errEl) errEl.style.display = 'none';
    });

    rows.forEach(row => {
      const selectEl = row.querySelector('.item-flower');
      const qtyInput = row.querySelector('.item-quantity');
      if (!selectEl || !qtyInput) return;
      const opt = selectEl.selectedOptions && selectEl.selectedOptions[0];
      if (!opt || !opt.value) return;
      const productId = opt.dataset && opt.dataset.productId;
      if (!productId) return;
      const prod = (_productsCache || []).find(p => String(p.id) === String(productId));
      if (!prod) return;
      
      const qty = parseInt(qtyInput.value) || 0;
      if (!productGroups[productId]) {
        productGroups[productId] = {
          product: prod,
          totalQty: 0,
          rows: []
        };
      }
      productGroups[productId].totalQty += qty;
      productGroups[productId].rows.push({ row, qtyInput });
    });

    // Validate each product group
    Object.keys(productGroups).forEach(productId => {
      const { product, totalQty, rows: groupRows } = productGroups[productId];
      const minQty = parseInt(product.min_qty) || 1;
      const maxQty = product.max_qty != null && product.max_qty !== '' ? parseInt(product.max_qty) : null;
      const label = String(product.name);
      
      let error = null;
      if (totalQty < minQty) {
        error = `"${label}" requires a total of at least ${minQty} item(s). You selected ${totalQty}.`;
      } else if (maxQty != null && totalQty > maxQty) {
        error = `"${label}" allows a total of at most ${maxQty} item(s). You selected ${totalQty}.`;
      }
      
      if (error) {
        errors.push(error);
        // Mark all rows in the offending product group as invalid
        groupRows.forEach(({ row, qtyInput }) => {
          qtyInput.classList.add('is-invalid');
          let errEl = row.querySelector('.item-qty-error');
          if (!errEl) {
            errEl = document.createElement('small');
            errEl.className = 'item-qty-error d-block mt-1';
            errEl.style.fontSize = '11px';
            errEl.style.color = '#e11d48';
            row.appendChild(errEl);
          }
          errEl.textContent = '⚠ ' + error;
          errEl.style.display = '';
        });
      }
    });
    
    return errors;
  }

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

  function getRushFeeTotal() {
    if (!_categoriesCache) return 0;
    const itemRows = itemsContainer.querySelectorAll('.order-item');
    let maxRush = 0;
    itemRows.forEach(row => {
      const select = row.querySelector('.item-flower');
      const opt = select && select.selectedOptions && select.selectedOptions[0];
      const productId = opt && opt.dataset && opt.dataset.productId;
      if (!productId) return;
      const prod = (_productsCache || []).find(p => String(p.id) === String(productId));
      const cat = prod && prod.category ? String(prod.category).trim() : '';
      const key = String(cat || '').trim().toLowerCase();
      const fee = _categoriesCache[key] || 0;
      if (fee > maxRush) {
        maxRush = fee;
      }
    });
    return maxRush;
  }

  function computeRushFee() {
    try {
      if (!_categoriesCache) return;
      const totalRush = getRushFeeTotal();
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
  if (itemsContainer) {
    itemsContainer.addEventListener('input', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('item-quantity')) {
        computeRushFee();
        calculateOrderTotal();
        validateOrderQuantities();
      }
      saveInquiryFormState();
    });
    itemsContainer.addEventListener('change', saveInquiryFormState);
  }
  if (typeof addonsContainer !== 'undefined' && addonsContainer) {
    addonsContainer.addEventListener('change', saveInquiryFormState);
  }

  // Calculate order total based on selected items and addons
  function calculateOrderTotal() {
    const inquiryForm = document.getElementById('inquiryForm');
    if (!inquiryForm) return;
    let total = 0;
    
    let totalCustomizationFee = 0;
    let hasCustomizationFee = false;

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

      // Add customization fee automatically if product has customization fee configured.
      // The fee is a FLAT one-time charge applied ONCE to the order total
      // (not per added item, not per quantity).
      const productId = selectedOption.dataset.productId;
      if (productId && !hasCustomizationFee) {
        const prod = (_productsCache || []).find(p => String(p.id) === String(productId));
        const fee = prod ? parseFloat(prod.customization_fee) : 0;
        if (fee > 0) {
          hasCustomizationFee = true;
          totalCustomizationFee = fee;
          total += fee;
        }
      }
    });

    // Update customization fee card display
    const feeAlertContainer = document.getElementById('customizationFeeAlertContainer');
    const feeAlertAmount = document.getElementById('customizationFeeAlertAmount');
    if (feeAlertContainer) {
      if (hasCustomizationFee) {
        feeAlertContainer.style.display = 'block';
        if (feeAlertAmount) {
          feeAlertAmount.textContent = totalCustomizationFee.toFixed(2);
        }
      } else {
        feeAlertContainer.style.display = 'none';
      }
    }
    
    // Add addon prices as a flat fee for the entire order (price × quantity)
    const addonCheckboxes = document.querySelectorAll('.addon-checkbox:checked');
    addonCheckboxes.forEach(checkbox => {
      const price = parseFloat(checkbox.dataset.price) || 0;
      const qty = getAddonQty(checkbox);
      total += price * qty;
    });
    
    // Add rush fee if rush is Yes
    const rushInput = inquiryForm.querySelector('input[name="rush"]');
    if (rushInput && rushInput.value === 'Yes') {
      total += getRushFeeTotal();
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
  
  // Listen for addon changes to recalculate total. Toggling a checkbox also
  // enables/disables its quantity stepper, and changing the quantity re-encodes
  // the checkbox value (" ×N") so the server can price it correctly.
  document.addEventListener('change', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('addon-checkbox')) {
      const item = e.target.closest('.addon-item');
      const qtyInput = item ? item.querySelector('.addon-qty') : null;
      if (qtyInput) qtyInput.disabled = !e.target.checked;
      syncAddonValue(e.target);
      calculateOrderTotal();
    }
    if (e.target && e.target.classList && e.target.classList.contains('addon-qty')) {
      const item = e.target.closest('.addon-item');
      const cb = item ? item.querySelector('.addon-checkbox') : null;
      if (cb) syncAddonValue(cb);
      calculateOrderTotal();
    }
  });

  // Keep totals live while typing in the addon quantity field.
  document.addEventListener('input', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('addon-qty')) {
      const item = e.target.closest('.addon-item');
      const cb = item ? item.querySelector('.addon-checkbox') : null;
      if (cb) syncAddonValue(cb);
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
      setTimeout(() => {
        calculateOrderTotal();
        if (itemsContainer) {
          itemsContainer.querySelectorAll('.order-item').forEach(row => updateQuantityLimits(row));
        }
      }, 100);
    });

    // Blur any focused descendant before Bootstrap applies aria-hidden=true in
    // _hideModal(), so the "Blocked aria-hidden" console warning never fires.
    // Covers: map picker auto-hide (clicking a [data-bs-toggle] opens the
    // picker and hides this modal), form submit, backdrop click, and Escape.
    inquiryModal.addEventListener('hide.bs.modal', () => {
      if (inquiryModal.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    });
  }

  // --- end auto-fetch logic ---

  // Pending order data awaiting final confirmation on the home page summary modal
  let pendingOrderData = null;

  // Actually place the order by POSTing to /api/inquiry. Used both for the
  // direct admin flow and for the home page "Finalize Order" button.
  async function submitOrder(data, btn) {
    const originalBtnHtml = btn ? btn.innerHTML : null;
    try {
      // show loading state
      if (btn) {
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Placing...';
      }

      // Check authentication (optional for orders)
      const token = localStorage.getItem('auth_token') || localStorage.getItem('adminToken');

      // Prepare headers with auth token if available
      const headers = {
        'Content-Type': 'application/json'
      };

      // Only add auth header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/inquiry', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (response.ok) {
        // Save delivery details to localStorage for next time
        try {
          if (data.delivery_address) {
            localStorage.setItem('customer_delivery_address', data.delivery_address);
          }
          if (data.preferred_meetup_place) {
            localStorage.setItem('customer_preferred_meetup_place', data.preferred_meetup_place);
          } else {
            localStorage.removeItem('customer_preferred_meetup_place');
          }
        } catch (e) {}

        // Clear pretyped state
        try {
          localStorage.removeItem('inquiry_form_state');
        } catch (e) {}

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
            // Ignore voucher errors
          }
        }

        try {
          const inquiryModalEl = document.getElementById('inquiryModal');
          if (inquiryModalEl) {
            const inquiryModalInstance = bootstrap.Modal.getInstance(inquiryModalEl) || new bootstrap.Modal(inquiryModalEl);
            inquiryModalInstance.hide();
          }
        } catch (hideErr) {}

        // Hide the order summary modal if visible
        try {
          const summaryModalEl = document.getElementById('orderSummaryModal');
          if (summaryModalEl) {
            const summaryModalInstance = bootstrap.Modal.getInstance(summaryModalEl) || new bootstrap.Modal(summaryModalEl);
            summaryModalInstance.hide();
          }
        } catch (hideSummaryErr) {}

        // redirect to success page with orderId in querystring
        try {
          const orderId = result.orderId || result.order_id || '';
          if (orderId) {
            const formEl = document.getElementById('inquiryForm');
            if (formEl) formEl.reset();
            if (window.location.pathname.includes('/admin/')) {
              alertSuccess(`Order created successfully! Order ID: ${orderId}`);
              if (typeof loadOrders === 'function') {
                loadOrders();
              } else {
                window.location.reload();
              }
              return;
            }
            window.location.href = `/order-success.html?orderId=${encodeURIComponent(orderId)}`;
            return;
          }
        } catch (redirectErr) {
          alertSuccess(`Inquiry sent successfully! Your Order ID is: ${result.orderId}`);
        }
      } else {
        // Handle errors
        if (response.status === 401) {
          if (window.location.pathname.includes('/admin/')) {
            alertError('Authentication error. Please ensure you are logged in to the admin panel.');
            return;
          }
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
    } finally {
      // restore button
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        if (originalBtnHtml !== null) btn.innerHTML = originalBtnHtml;
      }
    }
  }

  // Render the order summary into the home page confirmation modal
  function renderOrderSummary(data) {
    const container = document.getElementById('orderSummaryContent');
    if (!container) return;

    const money = (n) => '₱' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ---- Items breakdown ----
    let itemsHtml = '';
    let itemsTotal = 0;
    let customizationFee = 0;
    const itemRows = itemsContainer.querySelectorAll('.order-item');
    itemRows.forEach(row => {
      const selectEl = row.querySelector('.item-flower');
      if (!selectEl || !selectEl.value || !selectEl.selectedOptions || !selectEl.selectedOptions[0]) return;
      const opt = selectEl.selectedOptions[0];
      const qty = parseInt(row.querySelector('.item-quantity')?.value) || 1;
      const optionText = opt.textContent || '';
      const priceMatch = optionText.match(/₱([\d,]+(?:\.\d{2})?)/);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
      let name = optionText.replace(/₱[\d,]+(?:\.\d{2})?/g, '').replace(/\s*-\s*$/, '').trim();
      if (!name) name = opt.value;
      const colorEl = row.querySelector('.item-color');
      const colorName = colorEl && colorEl.selectedOptions && colorEl.selectedOptions[0]
        ? (colorEl.selectedOptions[0].dataset.colorName || colorEl.selectedOptions[0].textContent.replace(/^●\s*/, '')) : '';
      itemsTotal += price * qty;

      // Flat customization fee (first customizable product only)
      const productId = opt.dataset && opt.dataset.productId;
      if (productId && !customizationFee) {
        const prod = (_productsCache || []).find(p => String(p.id) === String(productId));
        const fee = prod ? parseFloat(prod.customization_fee) : 0;
        if (fee > 0) customizationFee = fee;
      }

      itemsHtml += `
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom border-slate-100">
          <div class="pe-3">
            <div class="fw-semibold text-slate-800 text-sm">${escapeHtml(name)}</div>
            <div class="text-[11px] text-slate-500">${colorName ? escapeHtml(colorName) + ' &bull; ' : ''}Qty: ${qty}${price ? ' &bull; ₱' + price.toFixed(2) + ' each' : ''}</div>
          </div>
          <div class="fw-bold text-slate-800 text-sm shrink-0">${price ? money(price * qty) : ''}</div>
        </div>`;
    });

    // ---- Add-ons ----
    let addonsTotal = 0;
    let addonsHtml = '';
    document.querySelectorAll('.addon-checkbox:checked').forEach(cb => {
      const price = parseFloat(cb.dataset.price) || 0;
      const qty = getAddonQty(cb);
      addonsTotal += price * qty;
      const label = cb.dataset.name || cb.value || '';
      const lineLabel = qty > 1 ? `${label} ×${qty}` : label;
      addonsHtml += `
        <div class="d-flex justify-content-between align-items-center py-1">
          <span class="text-sm text-slate-600">${escapeHtml(lineLabel)}</span>
          <span class="text-sm fw-semibold text-slate-800">${price ? money(price * qty) : ''}</span>
        </div>`;
    });

    // ---- Rush fee ----
    const rushInput = inquiryForm.querySelector('input[name="rush"]');
    const isRush = rushInput && rushInput.value === 'Yes';
    const rushFee = isRush ? getRushFeeTotal() : 0;

    // ---- Voucher discount ----
    let voucherDiscount = 0;
    if (window.regularVoucherHandler && window.regularVoucherHandler.hasVoucher()) {
      voucherDiscount = parseFloat(window.regularVoucherHandler.getAppliedVoucher().discountAmount) || 0;
    }

    const subtotal = itemsTotal + customizationFee + addonsTotal + rushFee;
    const finalTotal = Math.max(0, subtotal - voucherDiscount);

    // ---- Customer / delivery summary ----
    const fieldValue = (name) => {
      const el = inquiryForm.querySelector(`[name="${name}"]`);
      return el ? (el.value || '') : '';
    };
    const deliveryAddress = fieldValue('delivery_address');
    const expectedDate = fieldValue('expected_delivery_date');
    const meetupPlace = fieldValue('preferred_meetup_place');

    container.innerHTML = `
      <div class="space-y-3.5 sm:space-y-4">

        <!-- Customer -->
        <div class="bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-4">
          <h6 class="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2"><i class="fa-solid fa-user me-1.5 text-rose-500"></i>Customer Details</h6>
          <div class="text-sm text-slate-700">${escapeHtml(data.user_name || '')}</div>
          <div class="text-xs text-slate-500">${escapeHtml(data.user_email || '')}</div>
        </div>

        <!-- Items -->
        <div class="bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-4">
          <h6 class="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2"><i class="fa-solid fa-bag-shopping me-1.5 text-rose-500"></i>Order Items</h6>
          ${itemsHtml || '<div class="text-xs text-slate-400 py-1">No items</div>'}
        </div>

        <!-- Delivery -->
        <div class="bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-4">
          <h6 class="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2"><i class="fa-solid fa-truck me-1.5 text-rose-500"></i>Delivery</h6>
          <div class="text-sm text-slate-700">${escapeHtml(deliveryAddress || '—')}</div>
          <div class="text-xs text-slate-500">${expectedDate ? 'Expected delivery: ' + escapeHtml(expectedDate) : ''}${isRush ? ' &bull; <span class="badge bg-amber-100 text-amber-700">Rush</span>' : ''}</div>
          ${meetupPlace ? `<div class="text-xs text-slate-500 mt-1">Meetup: ${escapeHtml(meetupPlace)}</div>` : ''}
        </div>

        <!-- Price breakdown -->
        <div class="bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-4">
          <h6 class="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2"><i class="fa-solid fa-receipt me-1.5 text-rose-500"></i>Price Summary</h6>
          <div class="d-flex justify-content-between py-1"><span class="text-sm text-slate-600">Items</span><span class="text-sm fw-semibold text-slate-800">${money(itemsTotal)}</span></div>
          ${customizationFee > 0 ? `
          <div class="d-flex justify-content-between py-1">
            <span class="text-sm text-slate-600">Customization Fee <span class="text-[11px] text-slate-400">(one-time)</span></span>
            <span class="text-sm fw-semibold text-rose-600">${money(customizationFee)}</span>
          </div>` : ''}
          ${addonsHtml ? `<div class="mt-1 pt-2 border-top border-slate-100">${addonsHtml}</div>` : ''}
          ${rushFee > 0 ? `
          <div class="d-flex justify-content-between py-1">
            <span class="text-sm text-slate-600">Rush Fee</span>
            <span class="text-sm fw-semibold text-slate-800">${money(rushFee)}</span>
          </div>` : ''}
          ${voucherDiscount > 0 ? `
          <div class="d-flex justify-content-between py-1">
            <span class="text-sm text-slate-600">Voucher Discount</span>
            <span class="text-sm fw-semibold text-emerald-600">− ${money(voucherDiscount)}</span>
          </div>` : ''}
          <div class="d-flex justify-content-between align-items-center mt-2 pt-2.5 border-top border-slate-200">
            <span class="font-bold text-slate-800">Total</span>
            <span class="text-xl font-bold text-rose-600">${money(finalTotal)}</span>
          </div>
        </div>
      </div>`;
  }

  // Finalize order from the summary modal (home page)
  const finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
  if (finalizeOrderBtn) {
    finalizeOrderBtn.addEventListener('click', async () => {
      const orderData = pendingOrderData;
      if (!orderData) return;
      // Double-submission is prevented by the button's disabled state inside
      // submitOrder, so we keep pendingOrderData intact here to allow retrying
      // if the submission fails. It is cleared when the modal hides.
      await submitOrder(orderData, finalizeOrderBtn);
    });
  }

  // Blur any focused descendant before Bootstrap applies aria-hidden=true, and
  // clear pending data when the summary modal closes without finalizing.
  const orderSummaryModalRef = document.getElementById('orderSummaryModal');
  if (orderSummaryModalRef) {
    orderSummaryModalRef.addEventListener('shown.bs.modal', () => {
      // Keep the summary modal above BOTH its own backdrop and the still-open
      // order modal underneath. The modal must always beat its backdrop's
      // z-index, otherwise the dark backdrop paints on top of it (black
      // screen, nothing clickable).
      orderSummaryModalRef.style.zIndex = '1070';
      const backdrops = document.querySelectorAll('.modal-backdrop');
      if (backdrops.length) backdrops[backdrops.length - 1].style.zIndex = '1065';
    });
    orderSummaryModalRef.addEventListener('hide.bs.modal', () => {
      if (orderSummaryModalRef.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      pendingOrderData = null;
    });
  }

  inquiryForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Submit the inquiry form to server. reCAPTCHA removed (server-side anti-abuse can be added later).
    const submitBtn = inquiryForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : null;
    // Build data object explicitly to support multiple items
    const data = {};
    const form = e.target;

    // --- Delivery details validation (manual) ---
    // The delivery address is readonly (filled via the map picker), so the
    // browser skips its native `required` check entirely. The meetup place is
    // only required for Muntinlupa addresses. Validate both explicitly so the
    // customer always sees a clear alert before the order can proceed.
    const deliveryAddressEl = form.querySelector('input[name="delivery_address"]');
    const meetupPlaceEl = form.querySelector('[name="preferred_meetup_place"]');
    const meetupSectionEl = document.getElementById('meetupPlaceSection');

    // Only enforce this on the customer-facing flow; the admin "Add Order"
    // modal reuses inquiryForm and must keep its existing behavior.
    if (!isAdminDashboardPage && deliveryAddressEl && !deliveryAddressEl.value.trim()) {
      alertWarning('Please search and pin your delivery address on the map before placing your order.');
      return;
    }

    const isMuntinlupa = !!(meetupSectionEl && meetupSectionEl.style.display !== 'none') ||
      (deliveryAddressEl && /muntinlupa/i.test(deliveryAddressEl.value));
    if (isMuntinlupa && meetupPlaceEl && !meetupPlaceEl.value.trim()) {
      alertWarning('Please enter your preferred meetup place for deliveries within Muntinlupa.');
      meetupPlaceEl.focus();
      return;
    }

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
    data.fb_link = form.querySelector('input[name="fb_link"]')?.value || '';
    data.message = form.querySelector('textarea[name="message"]').value;
    data.rush = form.querySelector('input[name="rush"]').value;
    data.expected_delivery_date = form.querySelector('input[name="expected_delivery_date"]').value;
    // Re-encode addon values first so any quantity > 1 is included as " ×N".
    form.querySelectorAll('.addon-checkbox').forEach(cb => { try { syncAddonValue(cb); } catch (e) {} });
    data.addons = Array.from(form.querySelectorAll('input[name="addons[]"]:checked')).map(x => x.value);
    data.delivery_address = form.querySelector('input[name="delivery_address"]').value;
    data.preferred_meetup_place = form.querySelector('[name="preferred_meetup_place"]')?.value || null;

    // Collect items
    const items = [];
    const itemRows = itemsContainer.querySelectorAll('.order-item');
    itemRows.forEach((row, i) => {
      const flower = row.querySelector('.item-flower').value;
      const qty = parseInt(row.querySelector('.item-quantity').value) || 1;
      const colorEl = row.querySelector('.item-color');
      const colorValue = colorEl ? (colorEl.value || '') : '';
      const colorName = colorEl && colorEl.selectedOptions && colorEl.selectedOptions[0] ? (colorEl.selectedOptions[0].dataset.colorName || colorEl.selectedOptions[0].textContent) : '';
      const selectEl = row.querySelector('.item-flower');
      const selectedOption = selectEl && selectEl.selectedOptions && selectEl.selectedOptions[0];
      const productId = selectedOption ? selectedOption.dataset.productId : null;
      let customized = false;
      if (productId) {
        const prod = (_productsCache || []).find(p => String(p.id) === String(productId));
        const fee = prod ? parseFloat(prod.customization_fee) : 0;
        if (fee > 0) {
          customized = true;
        }
      }

      if (!flower) return;
      const itemObj = { flower_type: flower, quantity: qty, customized: customized };
      if (colorValue) itemObj.color = { name: colorName, value: colorValue };
      items.push(itemObj);
    });
    if (!items.length) {
      alertWarning('Please add at least one item to your order');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.removeAttribute('aria-busy'); if (originalBtnHtml !== null) submitBtn.innerHTML = originalBtnHtml; }
      return;
    }

    // Enforce per-product min/max quantity (e.g. minimum stems for a bouquet).
    // The order cannot proceed if any selected item is below its minimum or
    // above its maximum allowed quantity.
    const qtyErrors = validateOrderQuantities();
    if (qtyErrors.length) {
      alertWarning(qtyErrors[0]);
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

    // On the home page, show an order summary confirmation modal before placing
    // the order. On the admin dashboard (no summary modal in the DOM), submit directly.
    const orderSummaryModalEl = document.getElementById('orderSummaryModal');
    if (orderSummaryModalEl && !isAdminDashboardPage) {
      pendingOrderData = data;
      renderOrderSummary(data);
      try {
        const summaryModal = bootstrap.Modal.getOrCreateInstance(orderSummaryModalEl);
        summaryModal.show();
      } catch (modalErr) {
        // Fallback: place the order directly if the summary modal fails to open
        await submitOrder(data, submitBtn);
      }
      return;
    }
    await submitOrder(data, submitBtn);
  });

// --- Leaflet Map Picker Modal Integration ---
  let activeAddressInput = null;
  let pickerMapInstance = null;
  let pickerMarker = null;

  const mapPickerModalEl = document.getElementById('mapPickerModal');
  const modalMapCurrentAddress = document.getElementById('modalMapCurrentAddress');
  const confirmLocationBtn = document.getElementById('confirmLocationBtn');

  function checkMuntinlupaForInput(input, addressText) {
    if (!input) return;
    
    let meetupSection, meetupInput;
    if (input.id === 'deliveryAddressInput') {
      meetupSection = document.getElementById('meetupPlaceSection');
      meetupInput = document.getElementById('meetupPlaceInput');
    } else if (input.id === 'customDeliveryAddressInput') {
      meetupSection = document.getElementById('customMeetupPlaceSection');
      meetupInput = document.getElementById('customMeetupPlaceInput');
    }
    
    if (!meetupSection) return;

    if (!addressText) {
      meetupSection.style.display = 'none';
      if (meetupInput) meetupInput.value = '';
      return;
    }
    
    const isMunt = addressText.toLowerCase().includes('muntinlupa');
    if (isMunt) {
      meetupSection.style.display = 'block';
    } else {
      meetupSection.style.display = 'none';
      if (meetupInput) meetupInput.value = '';
    }
  }
  window.checkMuntinlupaForInput = checkMuntinlupaForInput;

  if (mapPickerModalEl) {
    // Listen for modal show event (fired immediately when show is called, before transition starts)
    mapPickerModalEl.addEventListener('show.bs.modal', (event) => {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    });

    // Listen for modal shown event (fired after fade transitions are complete)
    mapPickerModalEl.addEventListener('shown.bs.modal', (event) => {
      try {
        console.log('mapPickerModal shown.bs.modal event triggered.');
        const initialVal = activeAddressInput ? activeAddressInput.value : '';
        const currentAddrEl = document.getElementById('modalMapCurrentAddress');
        if (currentAddrEl) {
          currentAddrEl.textContent = initialVal || 'No location pinned yet';
        }
        
        // Initialize map on show
        initPickerMap(initialVal);
      } catch (err) {
        console.error('Error inside mapPickerModal shown.bs.modal:', err);
      }
    });

    // Listen for modal hidden event to restore previously hidden parent order modal
    mapPickerModalEl.addEventListener('hidden.bs.modal', () => {
      try {
        const reopenId = mapPickerModalEl.dataset.reopenModal;
        if (reopenId) {
          delete mapPickerModalEl.dataset.reopenModal;
          const targetModalEl = document.getElementById(reopenId);
          if (targetModalEl) {
            setTimeout(() => {
              const targetModal = bootstrap.Modal.getOrCreateInstance(targetModalEl);
              targetModal.show();
            }, 150); // wait for mapPickerModal to completely fade out
          }
        }
      } catch (err) {
        console.error('Error inside mapPickerModal hidden.bs.modal:', err);
      }
    });

    // Programmatic trigger handler to avoid nested Bootstrap overlay transition races
    function openMapPickerFromInput(input) {
      console.log('openMapPickerFromInput called for:', input.id);
      activeAddressInput = input;
      
      const mapModalEl = document.getElementById('mapPickerModal');
      if (!mapModalEl) {
        console.error('mapPickerModal element not found in DOM!');
        return;
      }

      let parentModalEl = null;
      if (input.id === 'deliveryAddressInput') {
        parentModalEl = document.getElementById('inquiryModal');
      } else if (input.id === 'customDeliveryAddressInput') {
        parentModalEl = document.getElementById('customizeOrderModal');
      }

      const mapPickerModal = bootstrap.Modal.getOrCreateInstance(mapModalEl);

      if (parentModalEl) {
        const parentModal = bootstrap.Modal.getOrCreateInstance(parentModalEl);
        
        // Check if the parent modal is actually visible/shown
        const isShown = parentModalEl.classList.contains('show');
        
        if (isShown) {
          let hasFired = false;
          
          // Safety timeout: if transition events are dropped, force open map picker after 400ms
          const safetyTimeout = setTimeout(() => {
            if (!hasFired) {
              hasFired = true;
              console.log('Safety timeout triggered: opening map modal.');
              mapModalEl.dataset.reopenModal = parentModalEl.id;
              mapPickerModal.show();
            }
          }, 400);

          // Wait for the parent order modal to fully hide BEFORE opening the map picker modal
          parentModalEl.addEventListener('hidden.bs.modal', function onParentHidden() {
            parentModalEl.removeEventListener('hidden.bs.modal', onParentHidden);
            clearTimeout(safetyTimeout);
            
            if (!hasFired) {
              hasFired = true;
              console.log('Parent modal hidden. Opening map modal.');
              mapModalEl.dataset.reopenModal = parentModalEl.id;
              mapPickerModal.show();
            }
          });
          
          parentModal.hide();
        } else {
          console.log('Parent modal is not visible. Opening map modal directly.');
          mapPickerModal.show();
        }
      } else {
        console.log('No parent modal found. Opening map modal directly.');
        mapPickerModal.show();
      }
    }

    // Initialize tabindex once on load to comply with ARIA focus rules
    ['deliveryAddressInput', 'customDeliveryAddressInput'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.setAttribute('tabindex', '-1');
    });

    // Replaced with a global event delegation listener to guarantee clicks are caught even under dynamic modifications
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (target && (target.id === 'deliveryAddressInput' || target.id === 'customDeliveryAddressInput')) {
        console.log('Programmatic click intercepted on address input:', target.id);
        event.preventDefault();
        openMapPickerFromInput(target);
      }
    });

    // Handle Confirm button
    if (confirmLocationBtn) {
      confirmLocationBtn.addEventListener('click', () => {
        const address = modalMapCurrentAddress ? modalMapCurrentAddress.textContent : '';
        if (address && address !== 'No location pinned yet') {
          if (activeAddressInput) {
            activeAddressInput.value = address;
            checkMuntinlupaForInput(activeAddressInput, address);
            activeAddressInput.dispatchEvent(new Event('input', { bubbles: true }));
            activeAddressInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const bsModal = bootstrap.Modal.getOrCreateInstance(mapPickerModalEl);
          if (bsModal) bsModal.hide();
        } else {
          alertWarning('Please pin a location on the map first.');
        }
      });
    }
  }

  function initPickerMap(initialVal) {
    if (pickerMapInstance) {
      pickerMapInstance.invalidateSize();
      if (initialVal) {
        geocodeSearchPicker(initialVal);
      }
      return;
    }

    // Default centered on Muntinlupa, Metro Manila (lat: 14.4081, lng: 121.0415, zoom: 14)
    const defaultLat = 14.4081;
    const defaultLng = 121.0415;
    const defaultZoom = 14;

    pickerMapInstance = L.map('modalMap', {
      center: [defaultLat, defaultLng],
      zoom: defaultZoom
    });

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(pickerMapInstance);

    // Click map to place/move marker
    pickerMapInstance.on('click', async (e) => {
      placeMarker(e.latlng.lat, e.latlng.lng);
      await reverseGeocodePicker(e.latlng.lat, e.latlng.lng);
    });

// Handle search input
    const searchBtn = document.getElementById('modalMapSearchBtn');
    const searchInput = document.getElementById('modalMapSearchInput');
    const suggestionsEl = document.getElementById('modalMapSuggestions');

    // Debounce helper to avoid excessive API calls while typing
    let suggestionTimer = null;
    function debounceSuggestions(fn, delay) {
      clearTimeout(suggestionTimer);
      suggestionTimer = setTimeout(fn, delay);
    }

    async function fetchSuggestions(query) {
      try {
        // Use Nominatim autocomplete endpoint; bias results toward the Philippines
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1&countrycodes=ph`;
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (err) {
        console.error('Suggestions fetch error:', err);
        return [];
      }
    }

    function renderSuggestions(suggestions) {
      if (!suggestionsEl) return;
      if (!suggestions || !suggestions.length) {
        suggestionsEl.style.display = 'none';
        suggestionsEl.innerHTML = '';
        return;
      }
      suggestionsEl.innerHTML = suggestions.map((s, i) => {
        const name = escapeHtml(s.display_name || '');
        const lat = s.lat;
        const lon = s.lon;
        return `<div data-idx="${i}" data-lat="${lat}" data-lon="${lon}"
          style="padding: 9px 12px; cursor: pointer; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; background: #fff;"
          onmouseover="this.style.background='#fff0f5'" onmouseout="this.style.background='#fff'">
          <i class="fa fa-map-marker-alt" style="color: #ff6f9b; margin-right: 7px; font-size: 12px;"></i>${name}
        </div>`;
      }).join('');
      suggestionsEl.style.display = 'block';

      // Attach click handlers to each suggestion
      suggestionsEl.querySelectorAll('[data-idx]').forEach(el => {
        el.addEventListener('click', () => {
          const lat = parseFloat(el.dataset.lat);
          const lon = parseFloat(el.dataset.lon);
          const idx = parseInt(el.dataset.idx);
          const suggestion = suggestions[idx];
          if (suggestion) {
            searchInput.value = suggestion.display_name || '';
            if (pickerMapInstance) pickerMapInstance.setView([lat, lon], 15);
            placeMarker(lat, lon);
            if (modalMapCurrentAddress) {
              modalMapCurrentAddress.textContent = suggestion.display_name || '';
            }
            checkMuntinlupaForInput(activeAddressInput, suggestion.display_name || '');
          }
          suggestionsEl.style.display = 'none';
          suggestionsEl.innerHTML = '';
        });
      });
    }

    if (searchInput) {
      // Show live suggestions as the user types
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        if (q.length < 2) {
          if (suggestionsEl) { suggestionsEl.style.display = 'none'; suggestionsEl.innerHTML = ''; }
          return;
        }
        debounceSuggestions(async () => {
          const results = await fetchSuggestions(q);
          renderSuggestions(results);
        }, 300);
      });

      // Hide suggestions when clicking outside the search box
      document.addEventListener('click', (e) => {
        if (suggestionsEl && e.target !== searchInput && !suggestionsEl.contains(e.target)) {
          suggestionsEl.style.display = 'none';
          suggestionsEl.innerHTML = '';
        }
      });
    }

    if (searchBtn && searchInput) {
      searchBtn.onclick = async () => {
        const q = searchInput.value.trim();
        if (q) {
          if (suggestionsEl) { suggestionsEl.style.display = 'none'; suggestionsEl.innerHTML = ''; }
          await geocodeSearchPicker(q);
        }
      };
      searchInput.onkeypress = async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const q = searchInput.value.trim();
          if (q) {
            if (suggestionsEl) { suggestionsEl.style.display = 'none'; suggestionsEl.innerHTML = ''; }
            await geocodeSearchPicker(q);
          }
        }
      };
    }

    if (initialVal) {
      geocodeSearchPicker(initialVal);
    }

    pickerMapInstance.invalidateSize();
  }

  function placeMarker(lat, lng) {
    const pinkMarkerIcon = L.divIcon({
      html: `
        <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.2));">
          <path d="M16 0C7.16 0 0 7.16 0 16C0 28 16 42 16 42C16 42 32 28 32 16C32 7.16 24.84 0 16 0ZM16 22C12.68 22 10 19.32 10 16C10 12.68 12.68 10 16 10C19.32 10 22 12.68 22 16C22 19.32 19.32 22 16 22Z" fill="#ff6f9b"/>
          <circle cx="16" cy="16" r="4" fill="white"/>
        </svg>
      `,
      className: 'custom-pink-marker',
      iconSize: [32, 42],
      iconAnchor: [16, 42]
    });

    if (pickerMarker) {
      pickerMarker.setLatLng([lat, lng]);
    } else {
      pickerMarker = L.marker([lat, lng], {
        draggable: true,
        icon: pinkMarkerIcon
      }).addTo(pickerMapInstance);

      pickerMarker.on('dragend', async () => {
        const latlng = pickerMarker.getLatLng();
        await reverseGeocodePicker(latlng.lat, latlng.lng);
      });
    }
  }

  async function reverseGeocodePicker(lat, lng) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      if (response.ok) {
        const data = await response.json();
        const address = data.display_name || '';
        const countryCode = data.address && data.address.country_code;
        const country = data.address && data.address.country;
        
        // Validation: must be within the Philippines
        const isPH = (countryCode && countryCode.toLowerCase() === 'ph') || 
                     (country && country.toLowerCase().includes('philippines')) ||
                     address.toLowerCase().includes('philippines');
        
        if (!isPH) {
          alertWarning('Delivery address must be within the Philippines. Location declined.');
          if (modalMapCurrentAddress) {
            modalMapCurrentAddress.textContent = 'No location pinned yet';
          }
          if (pickerMarker) {
            pickerMarker.remove();
            pickerMarker = null;
          }
          return;
        }

        if (modalMapCurrentAddress) {
          modalMapCurrentAddress.textContent = address;
        }
      }
    } catch (err) {
      console.error('Picker reverse geocoding error:', err);
    }
  }

  async function geocodeSearchPicker(query) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          const address = data[0].display_name || '';
          const countryCode = data[0].address && data[0].address.country_code;
          const country = data[0].address && data[0].address.country;
          
          // Validation: must be within the Philippines
          const isPH = (countryCode && countryCode.toLowerCase() === 'ph') || 
                       (country && country.toLowerCase().includes('philippines')) ||
                       address.toLowerCase().includes('philippines');
          
          if (!isPH) {
            alertWarning('Delivery address must be within the Philippines. Location declined.');
            return;
          }

          if (pickerMapInstance) {
            pickerMapInstance.setView([lat, lng], 15);
            setTimeout(() => {
              try { pickerMapInstance.invalidateSize(); } catch (e) {}
            }, 300);
          }
          placeMarker(lat, lng);
          if (modalMapCurrentAddress) {
            modalMapCurrentAddress.textContent = address;
          }
        } else {
          alertWarning('Location not found. Please try another search term.');
        }
      }
    } catch (err) {
      console.error('Picker geocoding search error:', err);
    }
  }

  const trackForm = document.getElementById('trackForm');
  if (trackForm) {

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
      alertError('Failed to send message. Please try again.');
    } finally {
      // Re-enable form
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
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

  // --- Auto-reopen active modal on refresh ---
  const inquiryModalEl = document.getElementById('inquiryModal');
  if (inquiryModalEl) {
    inquiryModalEl.addEventListener('shown.bs.modal', () => {
      sessionStorage.setItem('active_modal', 'inquiryModal');
    });
    inquiryModalEl.addEventListener('hidden.bs.modal', () => {
      sessionStorage.removeItem('active_modal');
    });
  }

  const customizeOrderModalEl = document.getElementById('customizeOrderModal');
  if (customizeOrderModalEl) {
    customizeOrderModalEl.addEventListener('shown.bs.modal', () => {
      sessionStorage.setItem('active_modal', 'customizeOrderModal');
    });
    customizeOrderModalEl.addEventListener('hidden.bs.modal', () => {
      sessionStorage.removeItem('active_modal');
    });
  }

  const activeModal = sessionStorage.getItem('active_modal');
  if (activeModal) {
    setTimeout(() => {
      const el = document.getElementById(activeModal);
      if (el) {
        const modal = bootstrap.Modal.getOrCreateInstance(el);
        if (modal) modal.show();
      }
    }, 800);
  }

  // Call prefill function now that all helpers are declared
  prefillCustomerInfo();

  // Floating chat functionality removed - now in dashboard.html only
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChammyFlorals);
} else {
  initChammyFlorals();
}