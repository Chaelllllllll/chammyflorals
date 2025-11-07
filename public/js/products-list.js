// Fetch products from public API and render as cards on the homepage
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('productsContainer');
  if (!container) return;

  async function loadProducts() {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to fetch products');
      const products = await res.json();
      renderProducts(products || []);
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
        col.innerHTML = `
          <div class="card shadow-sm">
            <img src="${imgSrc}" alt="${escapeHtml(p.name)}" class="card-img-top rounded-top">
            <div class="card-body text-center">
              <h5 class="card-title text-muted">${escapeHtml(p.name)}</h5>
              <div class="mt-2">
                <button class="btn btn-pink view-price-btn">View Price</button>
              </div>
            </div>
          </div>
        `;
        // attach handler directly so we can close over the product object
        setTimeout(() => {
          const btn = col.querySelector('.view-price-btn');
          if (btn) btn.addEventListener('click', () => showPriceModal(p));
        }, 0);
        row.appendChild(col);
      });

      section.appendChild(row);
      container.appendChild(section);
    });

    // attach click handlers
    container.querySelectorAll('.view-price-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name || 'Product';
        const price = btn.dataset.price ?? '0';
        showPriceModal(name, price);
      });
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

    // fallback to single price (use first pricing row if present) or show contact message
    if (!html) {
      if (product.pricing && Array.isArray(product.pricing) && product.pricing.length && typeof product.pricing[0].price !== 'undefined') {
        html = `<p class="h4 text-pink">₱${Number(product.pricing[0].price).toLocaleString()}</p>`;
      } else {
        html = `<p class="h6 text-muted">Contact us for pricing</p>`;
      }
    }

    bodyEl.innerHTML = html;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
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
