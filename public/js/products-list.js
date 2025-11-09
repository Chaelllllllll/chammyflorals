// Fetch products from public API and render as cards on the homepage
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('productsContainer');
  if (!container) return;

  let allProducts = [];

  async function loadProducts() {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to fetch products');
      const products = await res.json();
      allProducts = products || [];
      renderProducts(allProducts);
    } catch (err) {
      console.error('Error loading products:', err);
      container.innerHTML = '<p class="text-center text-muted">Failed to load products.</p>';
    }
  }

  function renderProducts(products) {
    if (!products.length) {
      container.innerHTML = '<p class="text-center text-muted">No products available right now.</p>';
      return;
    }
    // Group products by category (use provided category or fallback to 'Uncategorized')
    const groups = {};
    products.forEach(p => {
      const cat = p.category && String(p.category).trim() ? p.category : 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });

    container.innerHTML = '';
    // Render each category as a section with heading
    Object.keys(groups).forEach(cat => {
      const section = document.createElement('section');
      section.className = 'mb-5';
      const heading = document.createElement('h4');
      heading.className = 'text-center fw-bold mb-3';
      heading.textContent = cat;
      section.appendChild(heading);

      const row = document.createElement('div');
      row.className = 'row g-4 justify-content-center';

      groups[cat].forEach(p => {
        const col = document.createElement('div');
        col.className = 'col-md-4 col-sm-6';
        const imgSrc = p.image_url || 'flowers/bouquetwithglitter.jfif';
        // create card elements and attach handler directly (no setTimeout)
        const card = document.createElement('div');
        card.className = 'card shadow-sm';
        card.innerHTML = `
          <img src="${imgSrc}" alt="${escapeHtml(p.name)}" class="card-img-top rounded-top">
          <div class="card-body text-center">
            <h5 class="card-title text-muted">${escapeHtml(p.name)}</h5>
            <div class="mt-2 product-cta">
              <button class="btn btn-pink view-price-btn">View Price</button>
            </div>
          </div>
        `;
        const btn = card.querySelector('.view-price-btn');
        if (btn) btn.addEventListener('click', () => showPriceModal(p));
        col.appendChild(card);
        row.appendChild(col);
      });

      section.appendChild(row);
      container.appendChild(section);
    });

    // done
  }

  // filter products by query and re-render
  function filterAndRender(query) {
    if (!query || !query.trim()) return renderProducts(allProducts);
    const q = String(query).trim().toLowerCase();
    const filtered = allProducts.filter(p => {
      if (!p) return false;
      const name = (p.name || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      if (name.includes(q) || cat.includes(q)) return true;
      // also check pricing labels
      if (Array.isArray(p.pricing)) {
        for (const r of p.pricing) {
          if ((r.label||'').toString().toLowerCase().includes(q)) return true;
        }
      }
      return false;
    });
    renderProducts(filtered);
  }

  // wire search input/button
  const productsSearch = document.getElementById('productsSearch');
  const productsSearchBtn = document.getElementById('productsSearchBtn');
  if (productsSearch) {
    productsSearch.addEventListener('input', (e) => {
      // live filter as user types
      filterAndRender(e.target.value || '');
    });
  }
  if (productsSearchBtn) {
    productsSearchBtn.addEventListener('click', () => {
      const q = productsSearch ? productsSearch.value : '';
      filterAndRender(q);
    });
  }

  function showPriceModal(product) {
    // create or update modal
    let modalEl = document.getElementById('productPriceModal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.className = 'modal fade';
      modalEl.id = 'productPriceModal';
      modalEl.tabIndex = -1;
      modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content rounded-4">
            <div class="modal-header bg-light">
              <h5 class="modal-title text-pink" id="productPriceModalLabel"></h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body text-center" id="productPriceModalBody">
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalEl);
    }

    const titleEl = modalEl.querySelector('#productPriceModalLabel');
    const bodyEl = modalEl.querySelector('#productPriceModalBody');
    titleEl.textContent = product.name || 'Product';

    // build pricing tables if present
    let html = '';
    if (product.pricing && Array.isArray(product.pricing) && product.pricing.length) {
      html += '<h6 class="text-pink mb-3">Bouquet Pricing</h6>';
      html += '<div class="table-responsive"><table class="table table-bordered align-middle"><thead class="table-light"><tr><th>Flower Type</th><th>Set</th><th>Price (₱)</th></tr></thead><tbody>';
      product.pricing.forEach(r => {
        html += `<tr><td>${escapeHtml(r.label||'')}</td><td>${escapeHtml(r.set||'')}</td><td>${escapeHtml(r.price||'')}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }

    if (product.addons && Array.isArray(product.addons) && product.addons.length) {
      html += '<h6 class="text-pink mt-4 mb-3">Add-ons</h6>';
      html += '<div class="table-responsive"><table class="table table-bordered align-middle"><thead class="table-light"><tr><th>Add-on</th><th>Price (₱)</th></tr></thead><tbody>';
      product.addons.forEach(a => {
        html += `<tr><td>${escapeHtml(a.label||'')}</td><td>${escapeHtml(a.price||'')}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }

    // Available colors: render a simple 2-column table (Color preview, Color Name)
    if (product.colors && Array.isArray(product.colors) && product.colors.length) {
      html += '<h6 class="text-pink mt-4 mb-3">Available Colors</h6>';
      html += '<div class="table-responsive"><table class="table table-bordered align-middle"><thead class="table-light"><tr><th style="width:80px">Color</th><th>Color Name</th></tr></thead><tbody>';
      product.colors.forEach(c => {
        let value = c.value || c.hex || c.color || '';
        // normalize rgb(...) to hex for display
        if (typeof value === 'string' && value.trim().toLowerCase().startsWith('rgb')) {
          const m = value.match(/rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
          if (m) {
            const r = Math.max(0, Math.min(255, Number(m[1]||0)));
            const g = Math.max(0, Math.min(255, Number(m[2]||0)));
            const b = Math.max(0, Math.min(255, Number(m[3]||0)));
            value = '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('').toLowerCase();
          }
        }
        const name = c.name || '';
        const safeValue = escapeHtml(value);
        const safeName = escapeHtml(name);
        const swatch = value ? `<div style="width:36px;height:20px;border-radius:4px;border:1px solid rgba(0,0,0,0.08);background:${safeValue}"></div>` : '<span class="text-muted">—</span>';
        html += `<tr><td class="text-center">${swatch}</td><td>${safeName}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }

    // fallback to single price (use first pricing row if present) or show contact message
    if (!html) {
      if (product.pricing && Array.isArray(product.pricing) && product.pricing.length && typeof product.pricing[0].price !== 'undefined') {
        html = `<p class="h4 text-pink">₱${Number(product.pricing[0].price).toLocaleString()}</p>`;
      } else {
        html = `<p class="h6 text-muted">Contact us for pricing</p>`;
      }
    }

    bodyEl.innerHTML = html;

    // add a footer with an Order button that opens the inquiry form pre-filled for this product
    let footer = modalEl.querySelector('.modal-footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'modal-footer';
      modalEl.querySelector('.modal-content').appendChild(footer);
    }
    footer.innerHTML = `<div class="w-100"><button type="button" id="productOrderBtn" class="btn btn-pink w-100">Order</button></div>`;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // ensure we clean up the dynamically-created modal and any leftover backdrop when it's closed
    modalEl.addEventListener('hidden.bs.modal', function onHidden() {
      try {
        // dispose bootstrap instance if present
        const inst = bootstrap.Modal.getInstance(modalEl);
        if (inst) inst.dispose();
      } catch (e) { /* ignore */ }
      // remove any modal-backdrop elements left behind
      try { document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); } catch (e) { /* ignore */ }
      // restore body scroll and remove modal-open state (in case Bootstrap left it)
      try {
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      } catch (e) { /* ignore */ }
      // remove the modal element from the DOM
      try { modalEl.remove(); } catch (e) { /* ignore */ }
    }, { once: true });

    // wire order button to open inquiry modal and prefill the items to this product
    const orderBtn = modalEl.querySelector('#productOrderBtn');
    if (orderBtn) {
      orderBtn.addEventListener('click', () => {
        try {
          const inquiryEl = document.getElementById('inquiryModal');
          if (!inquiryEl) return;
          const inquiryModal = new bootstrap.Modal(inquiryEl);

          // hide the product price modal first so it doesn't remain on top of the inquiry modal
          try { const current = bootstrap.Modal.getInstance(modalEl); if (current) current.hide(); } catch (e) {}

          // prepare the inquiry form: keep a single item row and populate the flower select with only this product's pricing rows
          const itemsContainer = document.getElementById('itemsContainer');
          if (!itemsContainer) { inquiryModal.show(); return; }

          // remove extra rows, keep first
          while (itemsContainer.children.length > 1) itemsContainer.removeChild(itemsContainer.lastChild);
          const firstRow = itemsContainer.querySelector('.order-item');
          if (!firstRow) { inquiryModal.show(); return; }

          const flowerSelect = firstRow.querySelector('.item-flower');
          const qtyInput = firstRow.querySelector('.item-quantity');
          const colorSelect = firstRow.querySelector('.item-color');

          // reset qty
          if (qtyInput) qtyInput.value = 1;

          // populate flower select limited to this product pricing
          if (flowerSelect) {
            flowerSelect.innerHTML = '';
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = 'Select Flower Type';
            flowerSelect.appendChild(defaultOpt);
            if (product.pricing && Array.isArray(product.pricing) && product.pricing.length) {
              product.pricing.forEach(r => {
                const code = String(r.label || r.set || '').trim();
                if (!code) return;
                const opt = document.createElement('option');
                opt.value = code;
                const parts = [];
                if (r.set) parts.push(String(r.set));
                if (r.price != null) parts.push('\u20B1' + Number(r.price));
                opt.textContent = `${code}${parts.length ? ' - ' + parts.join(' - ') : ''}`;
                opt.dataset.productId = product.id;
                flowerSelect.appendChild(opt);
              });
              // select first available
              if (flowerSelect.options.length > 1) flowerSelect.selectedIndex = 1;
            }
            // trigger change so colors/addons refresh (function.js attaches change listeners to initial selects)
            try { flowerSelect.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
          }

          // open inquiry modal after a short delay so Bootstrap finishes hiding the previous modal/backdrop
          setTimeout(() => { try { inquiryModal.show(); } catch (e) { console.warn('Failed to show inquiry modal', e); } }, 200);
        } catch (err) {
          console.warn('Failed to open inquiry modal from product order button', err);
        }
      });
    }
  }

  // basic html escape for inserted values
  function escapeHtml(unsafe) {
    return String(unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  loadProducts();
});
