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
      
      // Check if URL has a product parameter to auto-open modal
      const urlParams = new URLSearchParams(window.location.search);
      const productId = urlParams.get('product');
      if (productId) {
        // Find and show the product
        const product = allProducts.find(p => p.id == productId);
        if (product) {
          // Wait for DOM to be ready
          setTimeout(() => {
            showPriceModal(product);
            // Wait for modal to be created, then show it
            setTimeout(() => {
              const modalEl = document.getElementById('productPriceModal');
              if (modalEl && typeof bootstrap !== 'undefined') {
                const modal = new bootstrap.Modal(modalEl);
                modal.show();
              }
            }, 100);
          }, 300);
        }
        // Clean URL without reloading
        window.history.replaceState({}, document.title, window.location.pathname);
      }
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

      // Category header with decorative line
      const headerDiv = document.createElement('div');
      headerDiv.className = 'text-center mb-4';
      headerDiv.innerHTML = `
        <div class="d-inline-flex align-items-center gap-3">
          <div style="width: 50px; height: 2px; background: linear-gradient(to right, transparent, #ff99bb);"></div>
          <h4 class="fw-bold mb-0 text-pink">${escapeHtml(cat)}</h4>
          <div style="width: 50px; height: 2px; background: linear-gradient(to left, transparent, #ff99bb);"></div>
        </div>
      `;
      section.appendChild(headerDiv);

      const row = document.createElement('div');
      row.className = 'row g-4 justify-content-center';

      groups[cat].forEach(p => {
        const col = document.createElement('div');
        col.className = 'col-lg-3 col-md-4 col-sm-6';
        const imgSrc = p.image_url || 'flowers/bouquetwithglitter.jfif';

        // Get price preview (first pricing item)
        let pricePreview = '';
        if (p.pricing && Array.isArray(p.pricing) && p.pricing.length && p.pricing[0].price) {
          pricePreview = `<div class="small text-muted mb-2">Starting at <span class="fw-bold text-pink">₱${p.pricing[0].price}</span></div>`;
        }

        // Create modern card with hover effects
        const card = document.createElement('div');
        card.className = 'card h-100 border-0 shadow-sm product-card';
        card.style.cssText = 'transition: all 0.3s ease; cursor: pointer; overflow: hidden;';
        card.innerHTML = `
          <div class="position-relative overflow-hidden" style="height: 220px;">
            <img src="${imgSrc}" alt="${escapeHtml(p.name)}" class="card-img-top" style="height: 100%; object-fit: cover; transition: transform 0.3s ease;">
            <div class="position-absolute top-0 end-0 m-2">
              <span class="badge bg-white text-pink shadow-sm px-3 py-2">
                <i class="fa fa-flower"></i>
              </span>
            </div>
          </div>
          <div class="card-body text-center d-flex flex-column">
            <h5 class="card-title fw-bold mb-2" style="color: #333; font-size: 1.1rem;">${escapeHtml(p.name)}</h5>
            ${pricePreview}
            <div class="mt-auto">
              <button class="btn btn-pink w-100 view-price-btn">
                <i class="fa fa-eye me-2"></i>View Details
              </button>
            </div>
          </div>
        `;

        // Add hover effect
        card.addEventListener('mouseenter', () => {
          card.style.transform = 'translateY(-8px)';
          card.style.boxShadow = '0 8px 24px rgba(255, 111, 155, 0.2)';
          const img = card.querySelector('img');
          if (img) img.style.transform = 'scale(1.1)';
        });

        card.addEventListener('mouseleave', () => {
          card.style.transform = 'translateY(0)';
          card.style.boxShadow = '';
          const img = card.querySelector('img');
          if (img) img.style.transform = 'scale(1)';
        });

        const btn = card.querySelector('.view-price-btn');
        if (btn) btn.addEventListener('click', (e) => {
          e.stopPropagation();
          showPriceModal(p);
        });

        // Make entire card clickable
        card.addEventListener('click', () => showPriceModal(p));

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
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content rounded-4 border-0 shadow-lg">
            <div class="modal-header border-0 position-relative" style="background: linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%); padding: 2rem;">
              <div class="w-100">
                <div class="d-flex align-items-center gap-3 mb-2">
                  <div class="bg-white rounded-circle p-2 shadow-sm" style="width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;">
                    <i class="fa fa-flower text-pink" style="font-size: 1.5rem;"></i>
                  </div>
                  <h5 class="modal-title text-white mb-0 fw-bold" id="productPriceModalLabel" style="font-size: 1.5rem;"></h5>
                </div>
                <p class="text-white mb-0 opacity-75 small">View pricing details and available options</p>
              </div>
              <button type="button" class="btn-close btn-close-white position-absolute top-0 end-0 m-3" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4" id="productPriceModalBody">
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
      html += `
        <div class="mb-4">
          <div class="d-flex align-items-center gap-2 mb-3">
            <i class="fa fa-tags text-pink"></i>
            <h6 class="mb-0 fw-bold text-dark">Pricing Options</h6>
          </div>
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0" style="border-radius: 8px; overflow: hidden;">
              <thead style="background: linear-gradient(135deg, #fff6f9 0%, #ffe9f0 100%);">
                <tr>
                  <th class="border-0 text-pink fw-semibold">Flower Type</th>
                  <th class="border-0 text-pink fw-semibold">Set</th>
                  <th class="border-0 text-pink fw-semibold text-end">Price</th>
                </tr>
              </thead>
              <tbody>
      `;
      product.pricing.forEach((r, idx) => {
        const bgClass = idx % 2 === 0 ? 'bg-white' : 'bg-light';
        html += `
          <tr class="${bgClass}">
            <td class="border-0 fw-semibold">${escapeHtml(r.label||'')}</td>
            <td class="border-0 text-muted">${escapeHtml(r.set||'')}</td>
            <td class="border-0 text-end"><span class="badge bg-pink text-white px-3 py-2">₱${escapeHtml(r.price||'')}</span></td>
          </tr>
        `;
      });
      html += '</tbody></table></div></div>';
    }

    if (product.addons && Array.isArray(product.addons) && product.addons.length) {
      html += `
        <div class="mb-4">
          <div class="d-flex align-items-center gap-2 mb-3">
            <i class="fa fa-plus-circle text-pink"></i>
            <h6 class="mb-0 fw-bold text-dark">Available Add-ons</h6>
          </div>
          <div class="row g-2">
      `;
      product.addons.forEach(a => {
        html += `
          <div class="col-md-6">
            <div class="d-flex justify-content-between align-items-center p-3 bg-light rounded-3 border">
              <div class="d-flex align-items-center gap-2">
                <i class="fa fa-gift text-pink"></i>
                <span class="fw-semibold">${escapeHtml(a.label||'')}</span>
              </div>
              <span class="badge bg-pink text-white">₱${escapeHtml(a.price||'')}</span>
            </div>
          </div>
        `;
      });
      html += '</div></div>';
    }

    // Available colors: render as color swatches
    if (product.colors && Array.isArray(product.colors) && product.colors.length) {
      html += `
        <div class="mb-4">
          <div class="d-flex align-items-center gap-2 mb-3">
            <i class="fa fa-palette text-pink"></i>
            <h6 class="mb-0 fw-bold text-dark">Available Colors</h6>
          </div>
          <div class="row g-3">
      `;
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
        const swatch = value ? `
          <div class="text-center p-3 bg-white rounded-3 border shadow-sm h-100">
            <div class="mx-auto mb-2 rounded-circle shadow-sm" style="width: 50px; height: 50px; background: ${safeValue}; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"></div>
            <div class="small fw-semibold">${safeName}</div>
          </div>
        ` : `<div class="text-center p-3 bg-light rounded-3"><span class="text-muted">—</span></div>`;
        html += `<div class="col-6 col-md-4 col-lg-3">${swatch}</div>`;
      });
      html += '</div></div>';
    }

    // fallback to single price (use first pricing row if present) or show contact message
    if (!html) {
      if (product.pricing && Array.isArray(product.pricing) && product.pricing.length && typeof product.pricing[0].price !== 'undefined') {
        html = `
          <div class="text-center py-4">
            <div class="display-4 text-pink fw-bold mb-2">₱${Number(product.pricing[0].price).toLocaleString()}</div>
            <p class="text-muted">Starting price</p>
          </div>
        `;
      } else {
        html = `
          <div class="text-center py-4">
            <i class="fa fa-envelope text-pink mb-3" style="font-size: 3rem;"></i>
            <h6 class="text-muted">Contact us for pricing details</h6>
          </div>
        `;
      }
    }

    bodyEl.innerHTML = html;

    // add a footer with an Order button and Ask Seller button
    let footer = modalEl.querySelector('.modal-footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'modal-footer border-0 bg-light';
      modalEl.querySelector('.modal-content').appendChild(footer);
    }
    footer.innerHTML = `
      <div class="w-100 d-flex gap-2">
        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">
          <i class="fa fa-times me-2"></i>Close
        </button>
        <button type="button" id="productAskSellerBtn" class="btn btn-outline-pink flex-fill">
          <i class="fa fa-comments me-2"></i>Ask Seller
        </button>
        <button type="button" id="productOrderBtn" class="btn btn-pink flex-fill">
          <i class="fa fa-shopping-bag me-2"></i>Order Now
        </button>
      </div>
    `;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // Handle Ask Seller button click
    const askSellerBtn = footer.querySelector('#productAskSellerBtn');
    if (askSellerBtn) {
      askSellerBtn.addEventListener('click', () => {
        // Close the product modal
        modal.hide();
        
        // Check if user is logged in
        const token = localStorage.getItem('auth_token');
        if (!token) {
          // Redirect to login with return URL
          // Removed alert to improve UX
          localStorage.setItem('pendingProductInquiry', JSON.stringify({
            productId: product.id,
            productName: product.name
          }));
          window.location.href = '/customer-login.html';
          return;
        }
        
        // Save product inquiry data to localStorage
        localStorage.setItem('pendingProductInquiry', JSON.stringify({
          productId: product.id,
          productName: product.name
        }));
        
        // Redirect to dashboard (which will auto-open chat)
        window.location.href = '/dashboard.html';
      });
    }

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
      orderBtn.addEventListener('click', async () => {
        // Redirect to login if not authenticated
        const isAuthenticated = typeof checkAuth === 'function' ? await checkAuth() : false;
        if (!isAuthenticated) {
          window.location.href = 'customer-login.html';
          return;
        }

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
          setTimeout(() => { try { inquiryModal.show(); } catch (e) {} }, 200);
        } catch (err) {}
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
