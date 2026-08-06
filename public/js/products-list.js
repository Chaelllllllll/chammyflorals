// Products list with category filtering and lazy loading
document.addEventListener('DOMContentLoaded', () => {
  const categoriesRow = document.getElementById('categoriesRow');
  const productsContainer = document.getElementById('productsContainer');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const noMoreProducts = document.getElementById('noMoreProducts');
  const productsSectionTitle = document.getElementById('productsSectionTitle');
  const productsSectionSubtitle = document.getElementById('productsSectionSubtitle');
  const clearCategoryBtn = document.getElementById('clearCategoryBtn');
  
  if (!categoriesRow || !productsContainer) return;

  let allProducts = [];
  let filteredProducts = [];
  let displayedProducts = [];
  let currentCategory = null;
  let currentPage = 0;
  const PRODUCTS_PER_PAGE = 12;
  let isLoading = false;
  let hasMore = true;

  // Accept both array payloads and common wrapped API formats.
  function normalizeProductsResponse(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.products)) return payload.products;
    if (payload && typeof payload === 'object') {
      console.warn('Unexpected /api/products payload shape:', Object.keys(payload));
    }
    return [];
  }

  // Load all products from API
  async function loadProducts() {
    try {
      const res = await fetch('/api/products', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!res.ok) throw new Error('Failed to fetch products');
      const products = await res.json();
      allProducts = normalizeProductsResponse(products);
      
      // Render categories
      renderCategories();
      
      // Show all products initially
      filteredProducts = [...allProducts];
      currentPage = 0;
      displayedProducts = [];
      hasMore = true;
      loadMoreProducts();
      
      // Check if URL has a product parameter to auto-open modal
      const urlParams = new URLSearchParams(window.location.search);
      const productId = urlParams.get('product');
      if (productId) {
        const product = allProducts.find(p => p.id == productId);
        if (product) {
          setTimeout(() => {
            showPriceModal(product);
            setTimeout(() => {
              const modalEl = document.getElementById('productPriceModal');
              if (modalEl && typeof bootstrap !== 'undefined') {
                const modal = new bootstrap.Modal(modalEl);
                modal.show();
              }
            }, 100);
          }, 300);
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err) {
      console.error('Error loading products:', err);
      productsContainer.innerHTML = '<div class="col-12"><p class="text-center text-muted">Failed to load products.</p></div>';
    }
  }

  // Extract unique categories from products
  function getCategories() {
    const categoryMap = new Map();
    allProducts.forEach(p => {
      const cat = p.category && String(p.category).trim() ? p.category : 'Uncategorized';
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, {
          name: cat,
          count: 0,
          image: p.image_url || 'flowers/bouquetwithglitter.jfif'
        });
      }
      categoryMap.get(cat).count++;
    });
    return Array.from(categoryMap.values());
  }

  // Render category cards; when `query` is provided, only show categories/products matching query
  function renderCategories(query = '') {
    let baseProducts = Array.isArray(allProducts) ? allProducts : [];
    if (query && String(query).trim()) {
      const q = String(query).trim().toLowerCase();
      baseProducts = allProducts.filter(p => {
        if (!p) return false;
        const name = (p.name || '').toLowerCase();
        const cat = (p.category || '').toLowerCase();
        if (name.includes(q) || cat.includes(q)) return true;
        if (Array.isArray(p.pricing)) {
          for (const r of p.pricing) {
            if ((r.label || '').toString().toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }

    // derive categories from the filtered product list
    const categoryMap = new Map();
    baseProducts.forEach(p => {
      const cat = p.category && String(p.category).trim() ? p.category : 'Uncategorized';
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { name: cat, count: 0, image: p.image_url || 'flowers/bouquetwithglitter.jfif' });
      }
      categoryMap.get(cat).count++;
    });

    const categories = Array.from(categoryMap.values());

    if (!categories.length) {
      categoriesRow.innerHTML = '<div class="col-12"><p class="text-center text-muted">No categories available.</p></div>';
      return;
    }

    categoriesRow.innerHTML = categories.map(cat => `
      <div class="col-lg-3 col-md-4 col-sm-6 col-6">
        <div class="category-card" data-category="${escapeHtml(cat.name)}">
          <div class="category-card-inner">
            <div class="category-image">
              <img src="${escapeHtml(cat.image)}" alt="${escapeHtml(cat.name)}" loading="lazy">
              <div class="category-overlay">
                <i class="fa fa-arrow-right"></i>
              </div>
            </div>
            <div class="category-info">
              <h6 class="category-name">${escapeHtml(cat.name)}</h6>
              <p class="category-count">${cat.count} ${cat.count === 1 ? 'item' : 'items'}</p>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Add click handlers to category cards
    document.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', function() {
        const category = this.dataset.category;
        selectCategory(category);
      });
    });
  }

  // Select a category and filter products
  function selectCategory(category) {
    currentCategory = category;
    
    // Update active state on category cards
    document.querySelectorAll('.category-card').forEach(card => {
      if (card.dataset.category === category) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // Update section title
    productsSectionTitle.textContent = category;
    productsSectionSubtitle.textContent = `Browse ${category.toLowerCase()} products`;
    clearCategoryBtn.style.display = 'inline-block';

    // Delegate filtering to the search-aware filter function so category + search combine
    const q = (typeof productsSearch !== 'undefined' && productsSearch && productsSearch.value) ? productsSearch.value : '';
    filterBySearch(q);

    // Scroll to products section
    const productsSection = document.getElementById('productsSectionTitle');
    if (productsSection) {
      productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Clear category filter
  function clearCategoryFilter() {
    currentCategory = null;
    
    // Remove active state from all categories
    document.querySelectorAll('.category-card').forEach(card => {
      card.classList.remove('active');
    });

    // Update section title
    productsSectionTitle.textContent = 'All Products';
    productsSectionSubtitle.textContent = 'Browse our entire collection';
    clearCategoryBtn.style.display = 'none';

    // Show all products
    filteredProducts = [...allProducts];
    
    // Reset pagination and display
    currentPage = 0;
    displayedProducts = [];
    hasMore = true;
    productsContainer.innerHTML = '';
    noMoreProducts.style.display = 'none';
    
    // Load first page
    loadMoreProducts();
  }

  // Load more products (lazy loading)
  function loadMoreProducts() {
    if (isLoading || !hasMore) return;
    
    isLoading = true;
    loadingIndicator.style.display = 'block';

    // Simulate async loading with setTimeout
    setTimeout(() => {
      const start = currentPage * PRODUCTS_PER_PAGE;
      const end = start + PRODUCTS_PER_PAGE;
      const productsToAdd = filteredProducts.slice(start, end);

      if (productsToAdd.length === 0) {
        hasMore = false;
        loadingIndicator.style.display = 'none';
        if (displayedProducts.length > 0) {
          noMoreProducts.style.display = 'block';
        }
        isLoading = false;
        return;
      }

      // Render products
      productsToAdd.forEach(product => {
        const productCard = createProductCard(product);
        productsContainer.appendChild(productCard);
        displayedProducts.push(product);
      });

      currentPage++;
      
      // Check if there are more products
      if (end >= filteredProducts.length) {
        hasMore = false;
        if (displayedProducts.length > 0) {
          noMoreProducts.style.display = 'block';
        }
      }

      loadingIndicator.style.display = 'none';
      isLoading = false;
    }, 300);
  }

  // Create a product card element
  function createProductCard(product) {
    const col = document.createElement('div');
    col.className = 'col-lg-3 col-md-4 col-sm-6 col-6';
    
    const imgSrc = product.image_url || 'flowers/bouquetwithglitter.jfif';

    // Get price preview (first pricing item)
    let pricePreview = '';
    if (product.pricing && Array.isArray(product.pricing) && product.pricing.length && product.pricing[0].price) {
      pricePreview = `<div class="text-xs text-slate-500 mb-3 font-medium">Starting at <span class="font-bold text-rose-600 text-sm">₱${product.pricing[0].price}</span></div>`;
    }

    // Create modern card with hover effects
    const card = document.createElement('div');
    card.className = 'product-card h-full';
    card.innerHTML = `
      <div class="relative overflow-hidden h-52 sm:h-60 bg-slate-100">
        <img src="${imgSrc}" alt="${escapeHtml(product.name)}" class="card-img-top w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy">
      </div>
      <div class="p-4 sm:p-5 text-center flex flex-col flex-grow bg-white">
        <h5 class="font-bold text-slate-900 text-base sm:text-lg mb-1 line-clamp-1">${escapeHtml(product.name)}</h5>
        ${pricePreview}
        <div class="mt-auto pt-2">
          <button type="button" class="btn-shadcn-primary w-full py-2.5 px-4 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 group/btn shadow-md hover:shadow-lg hover:shadow-rose-500/25 active:scale-[0.98] transition-all view-price-btn">
            <i class="fa-solid fa-eye text-xs group-hover/btn:scale-110 transition-transform"></i>
            <span>View</span>
          </button>
        </div>
      </div>
    `;

    // Hover effects handled via Tailwind CSS classes on product-card

    const btn = card.querySelector('.view-price-btn');
    if (btn) btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showPriceModal(product);
    });

    // Make entire card clickable
    card.addEventListener('click', () => showPriceModal(product));

    col.appendChild(card);
    return col;
  }

  // Filter products by search query
  function filterBySearch(query) {
    if (!query || !query.trim()) {
      // If no search query, restore filtered products based on current category
      if (currentCategory) {
        filteredProducts = allProducts.filter(p => {
          const cat = p.category && String(p.category).trim() ? p.category : 'Uncategorized';
          return cat === currentCategory;
        });
      } else {
        filteredProducts = [...allProducts];
      }
    } else {
      const q = String(query).trim().toLowerCase();
      const baseProducts = currentCategory 
        ? allProducts.filter(p => {
            const cat = p.category && String(p.category).trim() ? p.category : 'Uncategorized';
            return cat === currentCategory;
          })
        : allProducts;
      
      filteredProducts = baseProducts.filter(p => {
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
    }

    // Reset pagination and display
    currentPage = 0;
    displayedProducts = [];
    hasMore = true;
    productsContainer.innerHTML = '';
    noMoreProducts.style.display = 'none';
    
    // Load first page
    loadMoreProducts();
  }

  // Wire search input/button
  const productsSearch = document.getElementById('productsSearch');
  const productsSearchBtn = document.getElementById('productsSearchBtn');
  
  if (productsSearch) {
    productsSearch.addEventListener('input', (e) => {
      const q = e.target.value || '';
      // Update categories and products as user types
      try { renderCategories(q); } catch (err) {}
      filterBySearch(q);
    });
  }
  
  if (productsSearchBtn) {
    productsSearchBtn.addEventListener('click', () => {
      const q = productsSearch ? productsSearch.value : '';
      try { renderCategories(q); } catch (err) {}
      filterBySearch(q);
    });
  }

  // Wire clear category button
  if (clearCategoryBtn) {
    clearCategoryBtn.addEventListener('click', clearCategoryFilter);
  }

  // Infinite scroll - detect when user scrolls near bottom
  function handleScroll() {
    if (isLoading || !hasMore) return;
    
    const scrollPosition = window.innerHeight + window.scrollY;
    const bottomPosition = document.documentElement.offsetHeight - 500; // Trigger 500px before bottom
    
    if (scrollPosition >= bottomPosition) {
      loadMoreProducts();
    }
  }

  // Throttle scroll events
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    scrollTimeout = setTimeout(handleScroll, 100);
  });

  function showPriceModal(product) {
    // create or update modal
    let modalEl = document.getElementById('productPriceModal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.className = 'modal fade';
      modalEl.id = 'productPriceModal';
      modalEl.tabIndex = -1;
      modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
          <div class="modal-content glass-modal overflow-hidden border-0 shadow-2xl rounded-3xl">
            <!-- Compact Header (Same as Order Now Modal) -->
            <div class="bg-gradient-to-r from-rose-600 via-rose-500 to-rose-400 px-4 py-3.5 sm:p-5 text-white relative">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white text-base sm:text-xl shrink-0 shadow-sm">
                  <i class="fa-solid fa-spa"></i>
                </div>
                <div class="pr-6">
                  <h5 class="modal-title font-display font-bold text-base sm:text-xl text-white mb-0 leading-tight" id="productPriceModalLabel"></h5>
                  <p class="text-white/90 text-[11px] sm:text-xs mb-0 leading-tight mt-0.5">View details, pricing options, and available colors</p>
                </div>
              </div>
              <button type="button" class="btn-close btn-close-white absolute z-50 top-3.5 right-3.5 sm:top-5 sm:right-5 text-xs" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <!-- Body (Matching slate background with white step cards) -->
            <div class="modal-body p-3.5 sm:p-6 space-y-4 sm:space-y-5 bg-slate-50/50" id="productPriceModalBody">
            </div>
            <div class="modal-footer border-t border-slate-200/80 bg-white/90 p-3.5 sm:p-4 rounded-b-3xl">
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalEl);
    }

    const titleEl = modalEl.querySelector('#productPriceModalLabel');
    const bodyEl = modalEl.querySelector('#productPriceModalBody');
    if (titleEl) titleEl.textContent = product.name || 'Product Details';

    // Build Gallery Section
    let galleryHtml = '';
    try {
      const imgs = Array.isArray(product.images) ? product.images : (product.gallery && Array.isArray(product.gallery) ? product.gallery : []);
      const mainImg = product.image_url || '';
      const allImgs = imgs && imgs.length ? imgs.slice() : (mainImg ? [mainImg] : []);
      if (allImgs && allImgs.length) {
        const carouselId = `productGalleryCarousel-${String(product.id).replace(/[^a-zA-Z0-9]/g,'')}`;
        const indicators = allImgs.map((u,i)=> `<button type="button" data-bs-target="#${carouselId}" data-bs-slide-to="${i}" ${i===0? 'class="active" aria-current="true"':''} aria-label="Slide ${i+1}"></button>`).join('');
        const items = allImgs.map((u,i)=> `
          <div class="carousel-item ${i===0? 'active':''}">
            <img src="${escapeHtml(u)}" class="d-block w-100" style="height:320px;object-fit:cover;border-radius:12px;" onerror="this.style.opacity=0.6;this.style.filter='grayscale(60%)';">
          </div>
        `).join('');
        galleryHtml = `
          <div class="bg-white border border-slate-200/80 rounded-2xl p-3 sm:p-4 shadow-sm overflow-hidden">
            <div id="${carouselId}" class="carousel slide" data-bs-ride="false">
              <div class="carousel-inner">${items}</div>
              <div class="carousel-indicators mt-2">${indicators}</div>
              <button class="carousel-control-prev" type="button" data-bs-target="#${carouselId}" data-bs-slide="prev"><span class="carousel-control-prev-icon" aria-hidden="true"></span><span class="visually-hidden">Previous</span></button>
              <button class="carousel-control-next" type="button" data-bs-target="#${carouselId}" data-bs-slide="next"><span class="carousel-control-next-icon" aria-hidden="true"></span><span class="visually-hidden">Next</span></button>
            </div>
          </div>
        `;
      }
    } catch (err) { galleryHtml = ''; }

    let html = '';
    // Pricing Options Card Section
    if (product.pricing && Array.isArray(product.pricing) && product.pricing.length) {
      html += `
        <div class="bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-5 shadow-sm space-y-3.5">
          <div class="flex items-center gap-2.5 border-b border-slate-100 pb-2.5">
            <span class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-rose-100 text-rose-600 font-bold text-xs flex items-center justify-center shrink-0">
              <i class="fa-solid fa-tags text-xs"></i>
            </span>
            <h6 class="font-bold text-sm sm:text-base text-slate-900 mb-0">Pricing Options</h6>
          </div>
          <div class="table-responsive rounded-xl border border-slate-200/60 overflow-hidden">
            <table class="table table-hover align-middle mb-0 text-xs sm:text-sm">
              <thead class="bg-rose-50/70 border-b border-rose-100">
                <tr>
                  <th class="border-0 text-rose-700 font-bold py-2.5">Photo</th>
                  <th class="border-0 text-rose-700 font-bold py-2.5">Flower Type</th>
                  <th class="border-0 text-rose-700 font-bold py-2.5">Set</th>
                  <th class="border-0 text-rose-700 font-bold text-end py-2.5">Price</th>
                </tr>
              </thead>
              <tbody>
      `;
      product.pricing.forEach((r, idx) => {
        const bgClass = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';
        const pImg = (r.image_url || '').trim();
        html += `
          <tr class="${bgClass}">
            <td class="border-0">${pImg ? `<img src="${escapeHtml(pImg)}" alt="${escapeHtml(r.label||'')}" class="pricing-img-zoom" style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;cursor:zoom-in;" onerror="this.style.display='none';">` : `<span class="text-slate-300"><i class="fa-regular fa-image"></i></span>`}</td>
            <td class="border-0 font-semibold text-slate-800">${escapeHtml(r.label||'')}</td>
            <td class="border-0 text-slate-500">${escapeHtml(r.set||'')}</td>
            <td class="border-0 text-end"><span class="badge bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">₱${escapeHtml(r.price||'')}</span></td>
          </tr>
        `;
      });
      html += '</tbody></table></div></div>';
    }

    // Available Add-ons Card Section
    if (product.addons && Array.isArray(product.addons) && product.addons.length) {
      html += `
        <div class="bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-5 shadow-sm space-y-3.5">
          <div class="flex items-center gap-2.5 border-b border-slate-100 pb-2.5">
            <span class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-rose-100 text-rose-600 font-bold text-xs flex items-center justify-center shrink-0">
              <i class="fa-solid fa-circle-plus text-xs"></i>
            </span>
            <h6 class="font-bold text-sm sm:text-base text-slate-900 mb-0">Available Add-ons</h6>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      `;
      product.addons.forEach(a => {
        html += `
          <div class="flex items-center justify-between p-3 bg-slate-50/90 rounded-xl border border-slate-200/80">
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-gift text-rose-500 text-sm"></i>
              <span class="font-semibold text-xs sm:text-sm text-slate-800">${escapeHtml(a.label||'')}</span>
            </div>
            <span class="badge bg-rose-600 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold">₱${escapeHtml(a.price||'')}</span>
          </div>
        `;
      });
      html += '</div></div>';
    }

    // Available Colors Swatches Card Section
    if (product.colors && Array.isArray(product.colors) && product.colors.length) {
      html += `
        <div class="bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-5 shadow-sm space-y-3.5">
          <div class="flex items-center gap-2.5 border-b border-slate-100 pb-2.5">
            <span class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-rose-100 text-rose-600 font-bold text-xs flex items-center justify-center shrink-0">
              <i class="fa-solid fa-palette text-xs"></i>
            </span>
            <h6 class="font-bold text-sm sm:text-base text-slate-900 mb-0">Available Colors</h6>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      `;
      product.colors.forEach(c => {
        let value = c.value || c.hex || c.color || '';
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
          <div class="text-center p-3 bg-slate-50/90 rounded-xl border border-slate-200/80 shadow-sm h-100">
            <div class="mx-auto mb-2 rounded-full shadow-sm" style="width: 44px; height: 44px; background: ${safeValue}; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.12);"></div>
            <div class="text-xs font-semibold text-slate-700">${safeName}</div>
          </div>
        ` : `<div class="text-center p-3 bg-slate-50 rounded-xl"><span class="text-slate-400 text-xs">—</span></div>`;
        html += swatch;
      });
      html += '</div></div>';
    }

    // Fallback starting price card
    if (!html) {
      if (product.pricing && Array.isArray(product.pricing) && product.pricing.length && typeof product.pricing[0].price !== 'undefined') {
        html = `
          <div class="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm text-center">
            <div class="text-3xl sm:text-4xl font-bold text-rose-600 mb-1">₱${Number(product.pricing[0].price).toLocaleString()}</div>
            <p class="text-slate-500 text-xs sm:text-sm font-medium mb-0">Starting Price</p>
          </div>
        `;
      } else {
        html = `
          <div class="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm text-center">
            <i class="fa-solid fa-envelope text-rose-500 text-3xl mb-2 block"></i>
            <h6 class="text-slate-700 font-bold text-sm mb-0">Contact us for custom pricing details</h6>
          </div>
        `;
      }
    }

    // Insert gallery & content into modal body
    if (bodyEl) bodyEl.innerHTML = (galleryHtml || '') + html;

    // Wire click on any gallery image to open a full-view modal
    try {
      const imgs = modalEl.querySelectorAll('.carousel-item img');
      imgs.forEach(img => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', (e) => {
          const src = e.currentTarget && e.currentTarget.src ? e.currentTarget.src : null;
          if (!src) return;
          const fullId = `productImageFullModal-${Date.now()}-${Math.floor(Math.random()*10000)}`;
          const full = document.createElement('div');
          full.className = 'modal fade';
          full.id = fullId;
          full.tabIndex = -1;
          full.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-xl">
              <div class="modal-content bg-transparent border-0">
                <div class="modal-body p-0 text-center" style="background:transparent">
                  <img src="${escapeHtml(src)}" style="max-width:100%;max-height:80vh;object-fit:contain;border-radius:12px;" alt="">
                </div>
                <div class="modal-footer border-0 justify-content-center bg-transparent">
                  <button type="button" class="btn btn-light" data-bs-dismiss="modal">Close</button>
                </div>
              </div>
            </div>
          `;
          document.body.appendChild(full);
          const inst = new bootstrap.Modal(full, { backdrop: 'static', keyboard: false });
          inst.show();
          full.addEventListener('hidden.bs.modal', () => { try { full.remove(); } catch (e) {} }, { once: true });
        });
      });
    } catch (e) { /* ignore */ }

    // Wire click on any pricing option image to open a full-view modal
    try {
      const pImgs = modalEl.querySelectorAll('.pricing-img-zoom');
      pImgs.forEach(img => {
        img.addEventListener('click', (e) => {
          const src = e.currentTarget && e.currentTarget.src ? e.currentTarget.src : null;
          if (!src) return;
          const fullId = `pricingImageFullModal-${Date.now()}-${Math.floor(Math.random()*10000)}`;
          const full = document.createElement('div');
          full.className = 'modal fade';
          full.id = fullId;
          full.tabIndex = -1;
          full.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-lg">
              <div class="modal-content border-0 rounded-3xl overflow-hidden shadow-xl">
                <div class="modal-body p-0 text-center">
                  <img src="${escapeHtml(src)}" style="width:100%;max-height:70vh;object-fit:contain;background:#fff;" alt="">
                </div>
                <div class="modal-footer border-t border-slate-200/80 justify-content-center bg-white p-3">
                  <button type="button" class="btn btn-dark px-4 rounded-lg" data-bs-dismiss="modal">Close</button>
                </div>
              </div>
            </div>
          `;
          document.body.appendChild(full);
          const inst = new bootstrap.Modal(full, { backdrop: 'static', keyboard: false });
          inst.show();
          full.addEventListener('hidden.bs.modal', () => { try { full.remove(); } catch (e) {} }, { once: true });
        });
      });
    } catch (e) { /* ignore */ }

    // Add footer buttons matching Order Now modal layout
    let footer = modalEl.querySelector('.modal-footer');
    if (!footer) {
      footer = document.createElement('div');
      const modalContent = modalEl.querySelector('.modal-content');
      if (modalContent) modalContent.appendChild(footer);
    }
    footer.className = 'modal-footer border-t border-slate-200/80 bg-white/90 p-3.5 sm:p-4 rounded-b-3xl';
    footer.innerHTML = `
      <div class="w-full flex flex-col sm:flex-row gap-2">
        <button type="button" id="productAskSellerBtn" class="btn-shadcn-outline flex-1 py-2.5 text-xs sm:text-sm font-semibold border-rose-200 text-rose-600 hover:bg-rose-50">
          <i class="fa-solid fa-comments me-1.5"></i>Ask Seller
        </button>
        <button type="button" id="productOrderBtn" class="btn-shadcn-primary flex-1 py-2.5 text-xs sm:text-sm font-semibold shadow-md">
          <i class="fa-solid fa-shopping-bag me-1.5"></i>Order Now
        </button>
        <button type="button" class="btn-shadcn-outline sm:w-auto px-4 py-2.5 text-xs sm:text-sm font-semibold" data-bs-dismiss="modal">
          <i class="fa-solid fa-xmark me-1.5"></i>Close
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

  // Image preview tooltip functionality
  function attachImagePreviewListeners() {
    let tooltip = null;
    let longPressTimer = null;

    function showTooltip(imgSrc, event) {
      // Remove existing tooltip
      if (tooltip) {
        tooltip.remove();
      }

      // Create tooltip
      tooltip = document.createElement('div');
      tooltip.className = 'image-preview-tooltip';
      tooltip.innerHTML = `<img src="${imgSrc}" alt="Preview" style="max-width: 300px; max-height: 300px; border-radius: 8px; display: block;">`;
      document.body.appendChild(tooltip);

      // Position tooltip
      const x = event.clientX || (event.touches && event.touches[0].clientX);
      const y = event.clientY || (event.touches && event.touches[0].clientY);
      
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = x + 15;
      let top = y + 15;

      // Adjust if tooltip goes off screen
      if (left + tooltipRect.width > viewportWidth) {
        left = x - tooltipRect.width - 15;
      }
      if (top + tooltipRect.height > viewportHeight) {
        top = y - tooltipRect.height - 15;
      }

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    function hideTooltip() {
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    // Attach hover listeners for desktop
    document.addEventListener('mouseover', (e) => {
      const card = e.target.closest('.category-card, .product-card');
      if (card) {
        const img = card.querySelector('img');
        if (img && img.src) {
          showTooltip(img.src, e);
        }
      }
    });

    document.addEventListener('mouseout', (e) => {
      const card = e.target.closest('.category-card, .product-card');
      if (card) {
        hideTooltip();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (tooltip) {
        const x = e.clientX;
        const y = e.clientY;
        
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = x + 15;
        let top = y + 15;

        if (left + tooltipRect.width > viewportWidth) {
          left = x - tooltipRect.width - 15;
        }
        if (top + tooltipRect.height > viewportHeight) {
          top = y - tooltipRect.height - 15;
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      }
    });

    // Attach long-press listeners for mobile
    document.addEventListener('touchstart', (e) => {
      const card = e.target.closest('.category-card, .product-card');
      if (card) {
        const img = card.querySelector('img');
        if (img && img.src) {
          longPressTimer = setTimeout(() => {
            showTooltip(img.src, e);
          }, 500); // 500ms long press
        }
      }
    });

    document.addEventListener('touchend', hideTooltip);
    document.addEventListener('touchcancel', hideTooltip);
    document.addEventListener('touchmove', (e) => {
      // Cancel long press if user moves finger
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });
  }

  // Initialize image preview listeners
  attachImagePreviewListeners();

  loadProducts();
});
