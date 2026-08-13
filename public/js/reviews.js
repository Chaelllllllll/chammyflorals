// reviews.js
// Simple client-side reviews stored in localStorage with order-id validation via /api/track/:orderId

// Fetch reviews from server (Supabase-backed) with a local fallback
async function fetchReviewsFromServer() {
  try {
    const resp = await fetch('/api/reviews');
    if (!resp.ok) throw new Error('Failed to fetch reviews');
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {try {
      const raw = localStorage.getItem('chammy_reviews_v1') || '[]';
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }
}

async function postReviewToServer(payload) {
  try {
    let resp;
    if (payload instanceof FormData) {
      resp = await fetch('/api/reviews', { method: 'POST', body: payload });
    } else {
      resp = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    if (!resp.ok) {
        // try to parse JSON error first
        let errMsg = 'Failed to post review';
        try {
          const j = await resp.json();
          if (j && j.error) errMsg = j.error;
          else if (j && j.message) errMsg = j.message;
          else errMsg = JSON.stringify(j);
        } catch (e) {
          const txt = await resp.text();
          if (txt) errMsg = txt;
        }
        const err = new Error(errMsg || 'Failed to post review');
        err.status = resp.status;
        throw err;
    }
    const data = await resp.json();
    return data;
  } catch (err) {
    console.error('postReviewToServer error', err);
    throw err;
  }
}

async function renderPreview() {
  const container = document.getElementById('reviewsPreview');
  if (!container) return;
  const reviews = await fetchReviewsFromServer();
  const top = (reviews || []).slice().sort((a,b)=> new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)).slice(0, 4);
  if (!top.length) {
    container.innerHTML = '<div class="text-center text-slate-500 py-4 text-xs">No reviews yet.</div>';
    return;
  }
  
  // Duplicate for seamless infinite scrolling
  const marqueeItems = [...top, ...top, ...top, ...top];

  container.innerHTML = marqueeItems.map((r) => `
    <div class="marquee-item" style="width: 260px;">
      <div class="glass-card w-full flex flex-col rounded-xl border border-slate-200/80 shadow-sm overflow-hidden bg-white" style="aspect-ratio: 1/1;">
        ${r.image_url ? `
          <div class="relative w-full overflow-hidden bg-slate-100 shrink-0" style="height: 45%;">
            <img src="${escapeHtml(r.image_url)}" class="review-thumb w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-500" data-url="${escapeHtml(r.image_url)}" alt="Review photo" loading="lazy" onerror="this.closest('div').style.display='none'" />
          </div>
        ` : ''}
        <div class="p-3.5 flex flex-col flex-grow justify-start">
          <div class="flex flex-col mb-2">
            <div class="flex items-center justify-between mb-1">
              <h6 class="font-bold text-slate-900 text-sm leading-tight mb-0 truncate mr-2">${escapeHtml(r.name || 'Customer')}</h6>
              ${r.item_name ? `
                <${r.product_id ? `a href="/?product=${r.product_id}"` : 'span'} class="inline-flex items-center gap-1 rounded-full bg-rose-50/80 border border-rose-100/50 font-bold text-rose-600 shadow-sm truncate max-w-[50%] hover:bg-rose-100 transition-colors" style="font-size: 9px; padding: 2px 6px; text-decoration: none; cursor: ${r.product_id ? 'pointer' : 'default'};">
                  <i class="fa fa-shopping-bag" style="font-size: 8px;"></i>&nbsp;${escapeHtml(r.item_name)}
                </${r.product_id ? 'a' : 'span'}>
              ` : ''}
            </div>
            <div class="flex items-center gap-1 text-amber-400 text-[10px]">
              ${Array.from({length: 5}, (_, idx) => `<i class="fa-solid fa-star ${idx < (r.stars || 5) ? 'text-amber-400' : 'text-slate-200'}"></i>`).join('')}
            </div>
          </div>

          <p class="text-[11px] sm:text-xs text-slate-600 leading-relaxed mb-0 italic overflow-hidden" style="display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;">
            "${escapeHtml(r.message)}"
          </p>
        </div>
      </div>
    </div>
  `).join('');

  // Auto scroll every 3 seconds (snapping)
  setInterval(() => {
    if (!container) return;
    const cardWidth = 260 + 24; // 260px width + 1.5rem (24px) gap
    
    // If scrolled past half, reset silently
    if (container.scrollLeft >= container.scrollWidth / 2) {
      container.style.scrollBehavior = 'auto';
      container.scrollLeft = 0;
      // Small delay before turning smooth scroll back on
      setTimeout(() => {
        container.style.scrollBehavior = 'smooth';
        container.scrollLeft += cardWidth;
      }, 50);
    } else {
      container.scrollLeft += cardWidth;
    }
  }, 3000);
}

async function renderModalList() {
  const container = document.getElementById('reviewsList');
  if (!container) return;
  const reviews = (await fetchReviewsFromServer()).slice().sort((a,b)=> new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt));
  if (!reviews.length) {
    container.innerHTML = '<div class="text-center text-muted">No reviews yet. Be the first to add one!</div>';
    return;
  }
  container.innerHTML = reviews.map(r => `
    <div class="mb-3 border-bottom pb-2">
      <div class="card">
        <div class="card-body d-flex p-3">
          ${r.image_url ? `
            <div class="review-thumb-wrap">
            <img src="${escapeHtml(r.image_url)}" class="review-thumb" data-url="${escapeHtml(r.image_url)}" alt="Review image" loading="lazy" onerror="this.closest('.review-thumb-wrap').style.display='none'" />
          </div>
          ` : ''}
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong>${escapeHtml(r.name)}</strong>
              <div class="text-warning">${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</div>
            </div>
            <div class="small text-muted mb-1">Order: ${escapeHtml(r.order_id || r.orderId || '')} • ${new Date(r.created_at || r.createdAt).toLocaleString()}</div>
            ${r.item_name ? `<${r.product_id ? `a href="/?product=${r.product_id}"` : 'div'} class="small text-danger mb-1" style="text-decoration: none; ${r.product_id ? 'cursor: pointer;' : ''}"><i class="fa fa-shopping-bag me-1"></i>${escapeHtml(r.item_name)}</${r.product_id ? 'a' : 'div'}>` : ''}
            <div>${escapeHtml(r.message)}</div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

async function validateOrderId(orderId) {
  if (!orderId) throw new Error('Order ID required');
  const resp = await fetch(`/api/track/${encodeURIComponent(orderId)}`);
  if (!resp.ok) {
    throw new Error('Order not found');
  }
  const data = await resp.json();
  // Only allow reviews for delivered orders
  const status = String(data.status || '').toLowerCase();
  if (status !== 'delivered') {
    const err = new Error('Order must be Delivered to submit a review');
    err.status = 400;
    throw err;
  }
  return data; // contains name etc.
}

  // image click -> lightbox modal (delegated, works on index.html & reviews.html)
  document.addEventListener('click', (e) => {
    const img = e.target && e.target.closest && e.target.closest('.review-thumb');
    if (!img) return;
    const url = img.dataset && img.dataset.url ? img.dataset.url : img.src;
    // Prefer the shared custom lightbox when available
    if (typeof window.openImageModal === 'function') {
      window.openImageModal(url || '');
      return;
    }
    // Fallback: Bootstrap modal (legacy)
    const modalImg = document.getElementById('reviewImageModalImg');
    if (modalImg) modalImg.src = url || '';
    const modalEl = document.getElementById('reviewImageModal');
    if (modalEl) {
      try { new bootstrap.Modal(modalEl).show(); } catch (err) {}
    }
  });

function escapeHtml(s='') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wireUI() {
  // preview button and nav button
  const viewBtn = document.getElementById('viewReviewsBtn');
  const navBtn = document.getElementById('navReviewsBtn');
  const reviewsModalEl = document.getElementById('reviewsModal');
  const addReviewBtn = document.getElementById('addReviewBtn');
  const addReviewModalEl = document.getElementById('addReviewModal');

  if (viewBtn) {
    viewBtn.addEventListener('click', async () => {
      await renderModalList();
      const modal = new bootstrap.Modal(reviewsModalEl);
      modal.show();
    });
  }
  if (navBtn) {
    navBtn.addEventListener('click', async () => {
      await renderModalList();
      const modal = new bootstrap.Modal(reviewsModalEl);
      modal.show();
    });
  }
  if (addReviewBtn) {
    addReviewBtn.addEventListener('click', () => {
      const modal = new bootstrap.Modal(addReviewModalEl);
      // clear form
      const form = document.getElementById('addReviewForm');
      form.reset();
      document.getElementById('addReviewError').style.display = 'none';
      modal.show();
    });
  }

  // form submit
  const form = document.getElementById('addReviewForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      form.classList.add('was-validated');
      if (!form.checkValidity()) return;
      const orderId = document.getElementById('reviewOrderId').value.trim();
      const stars = Number(document.getElementById('reviewStars').value);
      const message = document.getElementById('reviewMessage').value.trim();
      const errEl = document.getElementById('addReviewError');
      errEl.style.display = 'none';
      const submitBtn = form.querySelector('button[type="submit"]');
      const origBtnHtml = submitBtn ? submitBtn.innerHTML : null;
      try {
        // disable submit to prevent double submits
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Submitting...';
        }

        const order = await validateOrderId(orderId);
        const name = order.name || (order.email || 'Customer');

        // submit to server (server will enforce 1 review per order)
        await postReviewToServer({ orderId, stars, message });

        // refresh UI from server
        await renderPreview();
        await renderModalList();

        // close add modal
        const addModalEl = document.getElementById('addReviewModal');
        const addModalInstance = bootstrap.Modal.getInstance(addModalEl) || new bootstrap.Modal(addModalEl);
        addModalInstance.hide();

        // show reviews modal
        const rmodal = new bootstrap.Modal(document.getElementById('reviewsModal'));
        rmodal.show();
      } catch (err) {
        // handle duplicate review specially
        const msg = err && err.message ? err.message : 'Failed to validate order ID';
        if (err && err.message && err.message.includes('already exists')) {
          errEl.textContent = 'A review for this order already exists.';
        } else if (err && err.status === 409) {
          errEl.textContent = 'A review for this order already exists.';
        } else {
          errEl.textContent = msg || 'Failed to submit review';
        }
        errEl.style.display = 'block';
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          if (origBtnHtml) submitBtn.innerHTML = origBtnHtml;
          else submitBtn.textContent = 'Submit Review';
        }
      }
    });
  }
}

// initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await renderPreview();
  } catch (e) {}
  wireUI();
});
