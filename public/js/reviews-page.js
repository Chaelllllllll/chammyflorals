// reviews-page.js
// Page-specific logic for /reviews.html. Relies on helper functions defined in /js/reviews.js (fetchReviewsFromServer, postReviewToServer, validateOrderId, escapeHtml)

// Cached reviews for client-side filtering
window.pageReviews = null;

// Lazy loading variables
let displayedReviewsCount = 0;
const REVIEWS_PER_PAGE = 12;
let isLoadingMoreReviews = false;

function sanitizeInput(str, maxLen = 1000) {
  if (!str) return '';
  // Remove tags
  let s = String(str).replace(/<[^>]*>?/gm, '');
  // Trim and limit length
  s = s.trim().slice(0, maxLen);
  return s;
}

async function renderPageReviews(append = false) {
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
      container.innerHTML = '<div class="text-center text-muted py-5"><i class="fa fa-star-o fa-3x mb-3 d-block" style="opacity: 0.3;"></i><p>No reviews yet. Be the first to add one!</p></div>';
      // update hero counts
      try { document.getElementById('reviewsCount').textContent = '0'; } catch (e) {}
      try { document.getElementById('reviewsAvg').textContent = '0.0'; } catch (e) {}
      return;
    }

    // sort newest first
    const sorted = reviews.slice().sort((a,b)=> new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt));
    
    // update hero summary (count & average)
    try {
      const countEl = document.getElementById('reviewsCount');
      const avgEl = document.getElementById('reviewsAvg');
      const total = sorted.length;
      const avg = (sorted.reduce((s, x) => s + (Number(x.stars) || 0), 0) / Math.max(1, total));
      if (countEl) countEl.textContent = `${total}`;
      if (avgEl) avgEl.textContent = `${Number(avg.toFixed(1))}`;
    } catch (e) {}
    
    // Reset counter if not appending
    if (!append) {
      displayedReviewsCount = 0;
      container.innerHTML = '';
    }
    
    // Get next batch of reviews
    const startIdx = displayedReviewsCount;
    const endIdx = Math.min(startIdx + REVIEWS_PER_PAGE, sorted.length);
    const reviewsToDisplay = sorted.slice(startIdx, endIdx);

    const reviewsHTML = reviewsToDisplay.map(r => {
      const starsHTML = '★'.repeat(r.stars) + '☆'.repeat(5 - (r.stars||0));
      const time = r.created_at || r.createdAt ? new Date(r.created_at || r.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) : '';
      const initial = (r.name || 'C').charAt(0).toUpperCase();

      return `
        <div class="col-12 col-md-6 col-lg-4 mb-4 flex">
          <div class="glass-card w-full flex flex-col justify-between p-6 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
            <div>
              <!-- Author Profile Header -->
              <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <div class="flex items-center min-w-0">
                  <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-rose-600 to-rose-400 text-white font-bold text-sm flex items-center justify-center shrink-0 me-3 shadow-sm select-none">
                    ${initial}
                  </div>
                  <div class="min-w-0">
                    <h5 class="font-bold text-slate-800 text-base mb-0.5 truncate">${escapeHtml(r.name || 'Customer')}</h5>
                    ${time ? `<span class="text-xs text-slate-400 font-medium block">${time}</span>` : ''}
                  </div>
                </div>
                <div class="text-amber-500 text-base tracking-wide select-none shrink-0 ms-2">${starsHTML}</div>
              </div>
              
              <!-- Review text message -->
              <p class="text-slate-600 text-sm leading-relaxed mb-4">${escapeHtml(r.message)}</p>
            </div>
            
            <!-- Review image -->
            ${r.image_url ? `
              <div class="review-image-wrapper relative w-full h-52 rounded-xl overflow-hidden cursor-pointer hover:opacity-95 transition-opacity mt-2 group border border-slate-100/80" data-image-url="${escapeHtml(r.image_url)}">
                <img src="${escapeHtml(r.image_url)}" class="w-full h-full object-cover" alt="Review photo" loading="lazy" />
                <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold">
                  <i class="fa fa-eye me-1.5 text-sm"></i> View Full Image
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    
    if (append) {
      container.insertAdjacentHTML('beforeend', reviewsHTML);
    } else {
      container.innerHTML = reviewsHTML;
    }
    
    displayedReviewsCount = endIdx;
    
    // Add or remove "Load More" button
    const existingLoadMore = document.getElementById('loadMoreReviews');
    if (existingLoadMore) {
      existingLoadMore.remove();
    }
    
    if (displayedReviewsCount < sorted.length) {
      const loadMoreBtn = document.createElement('div');
      loadMoreBtn.id = 'loadMoreReviews';
      loadMoreBtn.className = 'col-12 text-center my-4';
      loadMoreBtn.innerHTML = `
        <button class="btn btn-pink btn-lg px-5" style="border-radius: 50px; font-weight: 600; box-shadow: 0 4px 15px rgba(255, 111, 155, 0.3);">
          <i class="fa fa-chevron-down me-2"></i>Load More Reviews (${sorted.length - displayedReviewsCount} remaining)
        </button>
      `;
      container.parentElement.appendChild(loadMoreBtn);
      
      loadMoreBtn.querySelector('button').addEventListener('click', async () => {
        if (!isLoadingMoreReviews) {
          isLoadingMoreReviews = true;
          await renderPageReviews(true);
          isLoadingMoreReviews = false;
        }
      });
    }

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
  // Delegated click handler for review images -> lightbox
  // Attached once to the container, so it keeps working after "Load More" or re-renders
  const reviewsContainerEl = document.getElementById('reviewsContainer');
  if (reviewsContainerEl) {
    reviewsContainerEl.addEventListener('click', (e) => {
      const wrapper = e.target && e.target.closest && e.target.closest('.review-image-wrapper');
      if (!wrapper) return;
      e.preventDefault();
      e.stopPropagation();
      const imageUrl = wrapper.getAttribute('data-image-url');
      if (imageUrl && typeof window.openImageModal === 'function') {
        window.openImageModal(imageUrl);
      }
    });
  }

  await renderPageReviews();

  // Wire star filter
  const filterEl = document.getElementById('pageReviewsFilterStars');
  if (filterEl) filterEl.addEventListener('change', async () => {
    displayedReviewsCount = 0; // Reset pagination when filter changes
    await renderPageReviews();
  });

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
      // prepare payload; if image selected send multipart/form-data
      const imageEl = document.getElementById('pageReviewImage');
      if (imageEl && imageEl.files && imageEl.files.length) {
        const fd = new FormData();
        fd.append('orderId', orderId);
        fd.append('stars', String(stars));
        fd.append('message', message);
        fd.append('image', imageEl.files[0]);
        await postReviewToServer(fd);
      } else {
        // submit to server (server will re-validate and sanitize)
        await postReviewToServer({ orderId, stars, message });
      }
      // on success: clear form, re-render
      form.reset();
      // Invalidate cache and reset pagination so the new review shows immediately
      window.pageReviews = null;
      displayedReviewsCount = 0;
      form.classList.remove('was-validated');
      await renderPageReviews();
      showPageError('Review submitted successfully.');
      // Scroll to top of reviews to see the new review
      const reviewsContainer = document.getElementById('reviewsContainer');
      if (reviewsContainer) {
        reviewsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
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