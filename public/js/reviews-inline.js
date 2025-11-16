// reviews-inline.js
// Contains handlers previously inlined in reviews.html so CSP allows execution

document.addEventListener('DOMContentLoaded', function() {
  // Hero buttons
  const heroSubmitBtn = document.getElementById('heroSubmitReviewBtn');
  if (heroSubmitBtn) {
    heroSubmitBtn.addEventListener('click', function() {
      const form = document.getElementById('pageAddReviewForm');
      if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const first = form.querySelector('input, select, textarea');
        if (first) first.focus({ preventScroll: true });
      }
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
window.scrollToReviewForm = function() {
  const form = document.getElementById('pageAddReviewForm');
  if (form) {
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const first = form.querySelector('input, select, textarea');
    if (first) first.focus({ preventScroll: true });
  }
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
      modal.classList.add('active');
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
      modal.classList.remove('active');
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
