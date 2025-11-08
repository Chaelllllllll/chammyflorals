// reviews.js
// Simple client-side reviews stored in localStorage with order-id validation via /api/track/:orderId

// Fetch reviews from server (Supabase-backed) with a local fallback
async function fetchReviewsFromServer() {
  try {
    const resp = await fetch('/api/reviews');
    if (!resp.ok) throw new Error('Failed to fetch reviews');
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('fetchReviewsFromServer failed, falling back to localStorage', err);
    try {
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
  const top = (reviews || []).slice().sort((a,b)=> new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)).slice(0,3);
  if (!top.length) {
    container.innerHTML = '<div class="col-12 text-center text-muted">No reviews yet.</div>';
    return;
  }
  container.innerHTML = top.map(r => `
    <div class="col-12 col-md-4">
      <div class="card h-100">
        <div class="card-body d-flex p-3">
          ${r.image_url ? `
            <div class="review-thumb-wrap">
              <img src="${escapeHtml(r.image_url)}" class="review-thumb" data-url="${escapeHtml(r.image_url)}" alt="Review image" onerror="this.closest('.review-thumb-wrap').style.display='none'" />
            </div>
          ` : ''}
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <strong>${escapeHtml(r.name)}</strong>
              <div class="text-warning">${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</div>
            </div>
            <p class="mb-0">${escapeHtml(r.message)}</p>
          </div>
        </div>
      </div>
    </div>
  `).join('');
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
            <img src="${escapeHtml(r.image_url)}" class="review-thumb" data-url="${escapeHtml(r.image_url)}" alt="Review image" onerror="this.closest('.review-thumb-wrap').style.display='none'" />
          </div>
          ` : ''}
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong>${escapeHtml(r.name)}</strong>
              <div class="text-warning">${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</div>
            </div>
            <div class="small text-muted mb-1">Order: ${escapeHtml(r.order_id || r.orderId || '')} • ${new Date(r.created_at || r.createdAt).toLocaleString()}</div>
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

  // image click -> modal (delegated)
  document.addEventListener('click', (e) => {
    const img = e.target && e.target.closest && e.target.closest('.review-thumb');
    if (!img) return;
    const url = img.dataset && img.dataset.url ? img.dataset.url : img.src;
    const modalImg = document.getElementById('reviewImageModalImg');
    if (modalImg) modalImg.src = url || '';
    const modalEl = document.getElementById('reviewImageModal');
    if (modalEl) {
      try { new bootstrap.Modal(modalEl).show(); } catch (err) { console.warn('Failed to show image modal', err); }
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
  } catch (e) {
    console.warn('Failed to render reviews preview on load', e);
  }
  wireUI();
});
