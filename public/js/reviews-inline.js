// reviews-inline.js
// Contains handlers previously inlined in reviews.html so CSP allows execution

document.addEventListener('DOMContentLoaded', function() {
  // Hero buttons
  const heroSubmitBtn = document.getElementById('heroSubmitReviewBtn');
  if (heroSubmitBtn) {
    heroSubmitBtn.addEventListener('click', function() {
      window.openReviewModal();
    });
  }

  const heroReadBtn = document.getElementById('heroReadReviewsBtn');
  if (heroReadBtn) {
    heroReadBtn.addEventListener('click', function() {
      const container = document.getElementById('reviewsContainer');
      if (container) container.scrollIntoView({ behavior: 'smooth' });
    });
  }
});

// expose convenience functions on window (safe for markup to call)
window.openReviewModal = function() {
  try {
    const modalEl = document.getElementById('pageAddReviewModal');
    if (modalEl && window.bootstrap && window.bootstrap.Modal) {
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  } catch (err) {
    console.error('openReviewModal error', err);
  }
};

window.closeReviewModal = function() {
  try {
    const modalEl = document.getElementById('pageAddReviewModal');
    if (modalEl && window.bootstrap && window.bootstrap.Modal) {
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.hide();
    }
  } catch (err) {
    console.error('closeReviewModal error', err);
  }
};

window.scrollToReviewForm = function() {
  window.openReviewModal();
};

window.scrollToReviews = function() {
  const container = document.getElementById('reviewsContainer');
  if (container) container.scrollIntoView({ behavior: 'smooth' });
};

// Image modal functionality
window.openImageModal = function(imageSrc) {
  try {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    if (modal && modalImg) {
      modalImg.src = imageSrc;
      // Show the lightbox: drop `hidden`, add `flex` (Tailwind) + `active` (custom CSS)
      modal.classList.remove('hidden');
      modal.classList.add('flex', 'active');
      document.body.style.overflow = 'hidden';
    }
  } catch (err) {
    console.error('openImageModal error', err);
  }
};

window.closeImageModal = function() {
  try {
    const modal = document.getElementById('imageModal');
    if (modal) {
      // Hide the lightbox again
      modal.classList.add('hidden');
      modal.classList.remove('flex', 'active');
      document.body.style.overflow = 'auto';
    }
  } catch (err) {
    console.error('closeImageModal error', err);
  }
};

// Close modal on background click
document.addEventListener('click', function(e) {
  if (e.target && e.target.id === 'imageModal') {
    window.closeImageModal();
  }
});

// Close modal on ESC key
document.addEventListener('keydown', function(e) {
  if (e && e.key === 'Escape') {
    window.closeImageModal();
  }
});

// Wire close button inside modal (no inline onclick)
const modalClose = document.querySelector('.image-modal-close');
if (modalClose) modalClose.addEventListener('click', function(e) {
  e.preventDefault();
  window.closeImageModal();
});

// Delegated click handler for review images -> open lightbox
document.addEventListener('click', function(e) {
  const wrapper = e.target.closest('.review-image-wrapper');
  if (wrapper) {
    e.preventDefault();
    e.stopPropagation();
    const imageUrl = wrapper.getAttribute('data-image-url');
    if (imageUrl && typeof window.openImageModal === 'function') {
      window.openImageModal(imageUrl);
    }
  }
});
