// reviews-page.js
// Page-specific logic for /reviews.html. Relies on helper functions defined in /js/reviews.js (fetchReviewsFromServer, postReviewToServer, validateOrderId, escapeHtml)

// Cached reviews for client-side filtering
window.pageReviews = null;

function sanitizeInput(str, maxLen = 1000) {
  if (!str) return '';
  // Remove tags
  let s = String(str).replace(/<[^>]*>?/gm, '');
  // Trim and limit length
  s = s.trim().slice(0, maxLen);
  return s;
}

async function renderPageReviews() {
  const container = document.getElementById('reviewsContainer');
  if (!container) return;
  try {
    if (!window.pageReviews) {
      window.pageReviews = (await fetchReviewsFromServer()) || [];
    }

    const filterStarsEl = document.getElementById('pageReviewsFilterStars');
    const starFilter = filterStarsEl && filterStarsEl.value ? Number(filterStarsEl.value) : null;

    let reviews = window.pageReviews.slice();
    if (starFilter) {
      reviews = reviews.filter(r => Number(r.stars) === starFilter);
    }

    if (!reviews.length) {
      container.innerHTML = '<div class="p-4 text-center text-muted">No reviews yet. Be the first to add one!</div>';
      return;
    }

    // sort newest first
    const sorted = reviews.slice().sort((a,b)=> new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt));
    container.innerHTML = sorted.map(r => `
      <div class="card mb-3 shadow-sm">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <strong>${escapeHtml(r.name || 'Customer')}</strong>
              <div class="small text-muted">${new Date(r.created_at || r.createdAt).toLocaleString()}</div>
            </div>
            <div class="text-warning fs-5">${'★'.repeat(r.stars)}${'☆'.repeat(5 - (r.stars||0))}</div>
          </div>
          <p class="mb-0">${escapeHtml(r.message)}</p>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to render page reviews', err);
    container.innerHTML = '<div class="p-4 text-center text-danger">Failed to load reviews. Please try again later.</div>';
  }
}

function showPageError(msg) {
  const el = document.getElementById('pageAddReviewError');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function setButtonLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Submitting...';
  } else {
    btn.disabled = false;
    if (btn.dataset.orig) btn.innerHTML = btn.dataset.orig;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await renderPageReviews();

  // Wire star filter
  const filterEl = document.getElementById('pageReviewsFilterStars');
  if (filterEl) filterEl.addEventListener('change', () => renderPageReviews());

  // Wire navbar submit button to scroll to form
  const navSubmitBtn = document.getElementById('navSubmitReviewBtn');
  if (navSubmitBtn) {
    navSubmitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const form = document.getElementById('pageAddReviewForm');
      if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // focus first field
        const first = form.querySelector('input, select, textarea');
        if (first) first.focus({ preventScroll: true });
      }
    });
  }

  const form = document.getElementById('pageAddReviewForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;

  // Sanitize inputs client-side before sending. Server will also sanitize.
  const orderId = sanitizeInput(document.getElementById('pageReviewOrderId').value, 64);
  let stars = Number(document.getElementById('pageReviewStars').value);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) stars = 5;
  const message = sanitizeInput(document.getElementById('pageReviewMessage').value, 2000);
    const submitBtn = form.querySelector('button[type="submit"]');
    showPageError('');

    try {
      setButtonLoading(submitBtn, true);
  // validate order exists (also enforces Delivered status)
  await validateOrderId(orderId);
  // submit to server (server will re-validate and sanitize)
  await postReviewToServer({ orderId, stars, message });
      // on success: clear form, re-render
  form.reset();
  // Invalidate cache so the new review shows
  window.pageReviews = null;
      form.classList.remove('was-validated');
      await renderPageReviews();
      showPageError('Review submitted successfully.');
      setTimeout(()=> showPageError(''), 3000);
    } catch (err) {
      console.error('Page submit error', err);
      if (err && (err.status === 409 || (err.message && err.message.toLowerCase().includes('already')))) {
        showPageError('A review for this order already exists.');
      } else {
        const m = err && err.message ? err.message : 'Failed to submit review';
        showPageError(m);
      }
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
});
