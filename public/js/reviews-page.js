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
      const starsCount = Number(r.stars) || 0;
      const starsHTML = Array.from({length: 5}).map((_, i) => 
        i < starsCount ? '<i class="fas fa-star text-amber-400"></i>' : '<i class="far fa-star text-slate-300"></i>'
      ).join('');
      
      const time = r.created_at || r.createdAt ? new Date(r.created_at || r.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) : '';
      const initial = (r.name || 'C').charAt(0).toUpperCase();

      return `
        <div class="col-12 col-md-6 col-lg-4 mb-4 d-flex">
          <div class="w-100 position-relative d-flex flex-column bg-white/80 backdrop-blur-2xl border border-white/80 rounded-2xl p-4 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_50px_-10px_rgba(244,63,94,0.15)] hover:-translate-y-2 transition-all duration-500 ease-out group overflow-hidden">
            <!-- Subtle ambient glow background -->
            <div class="absolute -top-24 -right-24 w-48 h-48 bg-rose-300/20 rounded-full blur-3xl group-hover:bg-rose-400/30 transition-colors duration-500"></div>
            
            <div class="relative z-10 flex flex-col h-full w-full">
              <!-- Header -->
              <div class="flex flex-col mb-4">
                <div class="flex items-center justify-between mb-2">
                  <h5 class="font-bold text-slate-800 text-[16px] leading-tight truncate mr-3">${escapeHtml(r.name || 'Customer')}</h5>
                  <span class="text-[10px] text-slate-400/70 font-medium whitespace-nowrap">${time}</span>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex gap-0.5 text-[11px] tracking-widest shrink-0 mr-3">${starsHTML}</div>
                  ${r.item_name ? `
                  <${r.product_id ? `a href="/?product=${r.product_id}"` : 'span'} class="inline-flex items-center px-3 py-1.5 rounded-full bg-rose-50/80 border border-rose-100/50 text-[11px] font-bold text-rose-600 shadow-sm truncate max-w-[65%] hover:bg-rose-100 transition-colors" ${r.product_id ? 'style="text-decoration: none; cursor: pointer;"' : ''}>
                    <i class="fas fa-shopping-bag" style="margin-right: 6px;"></i>&nbsp;<span class="truncate">${escapeHtml(r.item_name)}</span>
                  </${r.product_id ? 'a' : 'span'}>
                  ` : ''}
                </div>
              </div>
              
              <!-- Review text message -->
              <div class="flex-grow mb-4">
                <p class="text-slate-600 text-[14px] leading-relaxed mb-0 line-clamp-4 group-hover:line-clamp-none transition-all duration-300">${escapeHtml(r.message)}</p>
              </div>
              
              <!-- Instagram Style Image -->
              ${r.image_url ? `
                <div class="review-image-wrapper relative w-full rounded-[1rem] overflow-hidden cursor-pointer mt-auto border border-white/50 shadow-sm group/img" style="aspect-ratio: 1 / 1;" data-image-url="${escapeHtml(r.image_url)}">
                  <img src="${escapeHtml(r.image_url)}" class="w-full h-full object-cover transform group-hover/img:scale-105 transition-transform duration-700 ease-out" alt="Review photo" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;" />
                  <div class="absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-black/0 opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                    <span class="text-white text-xs font-bold flex items-center gap-2 transform translate-y-4 group-hover/img:translate-y-0 transition-transform duration-300">
                      <i class="fas fa-expand"></i> View Full Image
                    </span>
                  </div>
                </div>
              ` : ''}
            </div>
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

  // Wire navbar submit button to open the review modal
  const navSubmitBtn = document.getElementById('navSubmitReviewBtn');
  if (navSubmitBtn) {
    navSubmitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.openReviewModal();
    });
  }

  const form = document.getElementById('pageAddReviewForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.classList.add('was-validated');
    if (!form.checkValidity()) {
      const imageEl = document.getElementById('pageReviewImage');
      const missingPhoto = !(imageEl && imageEl.files && imageEl.files.length);
      if (missingPhoto) {
        showPageError('A photo is required to submit your review. Please attach an image before submitting.');
        if (imageEl) imageEl.focus();
      } else {
        showPageError('Please fill in the required fields before submitting.');
      }
      return;
    }

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
        const compImage = typeof compressImage === 'function' ? await compressImage(imageEl.files[0]) : imageEl.files[0];
        const fd = new FormData();
        fd.append('orderId', orderId);
        fd.append('stars', String(stars));
        fd.append('message', message);
        fd.append('image', compImage);
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
      if (typeof window.closeReviewModal === 'function') window.closeReviewModal();
      if (typeof window.alertSuccess === 'function') {
        window.alertSuccess('Review submitted successfully.');
      } else {
        showPageError('Review submitted successfully.');
        setTimeout(()=> showPageError(''), 3000);
      }
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

  // Query-param prefill: /reviews.html?orderId=ORDERID (e.g. from Telegram review button)
  const params = new URLSearchParams(window.location.search);
  const prefillOrderId = (params.get('orderId') || '').trim();
  if (prefillOrderId) {
    const orderIdInput = document.getElementById('pageReviewOrderId');
    if (orderIdInput) {
      orderIdInput.value = sanitizeInput(prefillOrderId, 64);
      setTimeout(() => {
        window.openReviewModal();
      }, 300);
    }
  }
});