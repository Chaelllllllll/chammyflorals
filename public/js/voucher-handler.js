// voucher-handler.js - Client-side voucher validation and application
class VoucherHandler {
  constructor(prefix = '') {
    this.prefix = prefix; // 'custom' for custom orders, '' for regular orders
    this.appliedVoucher = null;
    this.discountAmount = 0;
    this.originalTotal = 0;
    
    this.initElements();
    this.attachListeners();
  }

  initElements() {
    const p = this.prefix;
    this.voucherInput = document.getElementById(`${p}${p ? 'V' : 'v'}oucherCodeInput`);
    this.applyBtn = document.getElementById(`apply${p ? 'Custom' : ''}VoucherBtn`);
    this.feedback = document.getElementById(`${p}${p ? 'V' : 'v'}oucherFeedback`);
    
    if (p === 'custom') {
      this.totalDisplay = document.getElementById('customOrderTotal');
      this.originalTotalDisplay = document.getElementById('customOrderOriginalTotal');
      this.originalAmountSpan = document.getElementById('customOriginalTotalAmount');
      this.discountBadge = document.getElementById('customOrderDiscountBadge');
      this.discountAmountSpan = document.getElementById('customOrderDiscountAmount');
    } else {
      this.totalDisplay = document.getElementById('orderFinalTotal');
      this.originalTotalDisplay = document.getElementById('orderOriginalTotal');
      this.originalAmountSpan = document.getElementById('originalTotalAmount');
      this.discountBadge = document.getElementById('orderDiscountBadge');
      this.discountAmountSpan = document.getElementById('orderDiscountAmount');
    }
  }

  attachListeners() {
    if (this.applyBtn) {
      const clickHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.appliedVoucher) {
          this.removeVoucher();
        } else {
          this.applyVoucher();
        }
      };
      
      this.applyBtn.addEventListener('click', clickHandler);
    }
    
    if (this.voucherInput) {
      this.voucherInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!this.appliedVoucher) {
            this.applyVoucher();
          }
        }
      });
      
      // Convert to uppercase as user types
      this.voucherInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
      });
    }
  }

  async applyVoucher() {
    const code = this.voucherInput?.value?.trim().toUpperCase();
    
    if (!code) {
      this.showFeedback('Please enter a voucher code', 'warning');
      return;
    }

    // Get current order total
    const currentTotal = this.getCurrentTotal();
    
    if (!currentTotal || currentTotal <= 0) {
      this.showFeedback('Please add items to your order first', 'warning');
      return;
    }

    // Get customer email
    const emailField = this.prefix === 'custom' 
      ? document.querySelector('[name="custom_user_email"]')
      : document.querySelector('[name="user_email"]');
    
    const customerEmail = emailField?.value?.trim();
    
    if (!customerEmail) {
      this.showFeedback('Please enter your email address first', 'warning');
      return;
    }

    // Show loading state
    if (this.applyBtn) {
      this.applyBtn.disabled = true;
      this.applyBtn.innerHTML = '<i class="fa fa-spinner fa-spin me-2"></i>Checking...';
    }

    try {
      const response = await fetch('/api/vouchers/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: code,
          orderAmount: currentTotal,
          customerEmail: customerEmail,
          customerId: null // Will be set on backend if customer is logged in
        })
      });

      const result = await response.json();

      if (result.valid) {
        this.appliedVoucher = result.voucher;
        this.discountAmount = result.discountAmount;
        this.originalTotal = currentTotal;
        
        this.updateDisplay(currentTotal, result.finalAmount);
        this.showFeedback(
          `Voucher applied! You saved ₱${result.discountAmount.toFixed(2)}`, 
          'success'
        );
        
        // Change button to "Remove"
        this.applyBtn.innerHTML = '<i class="fa fa-times me-2"></i>Remove';
        this.applyBtn.classList.remove('btn-outline-pink');
        this.applyBtn.classList.add('btn-danger');
        this.applyBtn.disabled = false; // Re-enable button for removal
        this.voucherInput.disabled = true;
        
      } else {
        this.showFeedback(result.error || 'Invalid voucher code', 'danger');
      }

    } catch (error) {
      console.error('Error validating voucher:', error);
      this.showFeedback('Failed to validate voucher. Please try again.', 'danger');
    } finally {
      // Always re-enable the button after the operation
      if (this.applyBtn) {
        this.applyBtn.disabled = false;
        if (!this.appliedVoucher) {
          this.applyBtn.innerHTML = '<i class="fa fa-check me-2"></i>Apply';
        }
      }
    }
  }

  removeVoucher() {
    // Store the original total before clearing
    const originalAmount = this.originalTotal;
    
    this.appliedVoucher = null;
    this.discountAmount = 0;
    this.originalTotal = 0;
    
    // Update display with the original total (no discount)
    this.updateDisplay(originalAmount, originalAmount);
    
    this.voucherInput.value = '';
    this.voucherInput.disabled = false;
    this.applyBtn.disabled = false;
    this.applyBtn.innerHTML = '<i class="fa fa-check me-2"></i>Apply';
    
    // Restore button styling based on prefix (custom vs regular)
    if (this.prefix === 'custom') {
      this.applyBtn.style.background = '#ff6f9b';
      this.applyBtn.style.color = 'white';
      this.applyBtn.classList.remove('btn-danger');
    } else {
      this.applyBtn.classList.add('btn-outline-pink');
      this.applyBtn.classList.remove('btn-danger');
    }
    
    this.showFeedback('Voucher removed', 'info');
    setTimeout(() => this.clearFeedback(), 2000);
  }

  updateDisplay(originalAmount, finalAmount) {
    if (this.originalTotal > 0 && this.discountAmount > 0) {
      // Show original price (struck through)
      if (this.originalTotalDisplay) {
        this.originalTotalDisplay.style.display = 'block';
      }
      if (this.originalAmountSpan) {
        this.originalAmountSpan.textContent = originalAmount.toFixed(2);
      }
      
      // Show discount badge
      if (this.discountBadge) {
        this.discountBadge.style.display = 'block';
      }
      if (this.discountAmountSpan) {
        this.discountAmountSpan.textContent = this.discountAmount.toFixed(2);
      }
    } else {
      // Hide discount displays
      if (this.originalTotalDisplay) {
        this.originalTotalDisplay.style.display = 'none';
      }
      if (this.discountBadge) {
        this.discountBadge.style.display = 'none';
      }
    }
    
    // Update final total
    if (this.totalDisplay) {
      // For custom order modal, include currency symbol
      if (this.prefix === 'custom') {
        this.totalDisplay.textContent = `₱${finalAmount.toFixed(2)}`;
      } else {
        // For regular order, just the number
        this.totalDisplay.textContent = finalAmount.toFixed(2);
      }
    }
  }

  getCurrentTotal() {
    // Extract numeric value from total display
    if (!this.totalDisplay) return 0;
    
    const totalText = this.totalDisplay.textContent || '0';
    // Remove currency symbols and formatting, extract number
    const cleanText = totalText.replace(/[₱,\s]/g, '');
    return parseFloat(cleanText) || 0;
  }

  setCurrentTotal(amount) {
    // Update total display without voucher
    if (!this.appliedVoucher) {
      if (this.totalDisplay) {
        // For custom order modal, display includes currency symbol
        if (this.prefix === 'custom') {
          this.totalDisplay.textContent = `₱${amount.toFixed(2)}`;
        } else {
          // For regular order, just the number
          this.totalDisplay.textContent = amount.toFixed(2);
        }
      }
    } else {
      // Recalculate with voucher
      this.originalTotal = amount;
      const finalAmount = amount - this.discountAmount;
      this.updateDisplay(amount, finalAmount);
    }
  }

  showFeedback(message, type = 'info') {
    if (!this.feedback) return;
    
    const alertClass = `alert-${type}`;
    this.feedback.innerHTML = `
      <div class="alert ${alertClass} alert-dismissible fade show mb-0" role="alert">
        <i class="fa fa-${type === 'success' ? 'check-circle' : type === 'danger' ? 'exclamation-circle' : 'info-circle'} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;
  }

  clearFeedback() {
    if (this.feedback) {
      this.feedback.innerHTML = '';
    }
  }

  getAppliedVoucher() {
    return {
      voucher: this.appliedVoucher,
      discountAmount: this.discountAmount,
      originalTotal: this.originalTotal
    };
  }

  hasVoucher() {
    return this.appliedVoucher !== null;
  }
}

// Helper function to show voucher warning modal
window.showVoucherWarningModal = function() {
  return new Promise((resolve) => {
    const modal = document.getElementById('voucherWarningModal');
    const proceedBtn = document.getElementById('voucherWarningProceed');
    const bsModal = new bootstrap.Modal(modal);
    
    // Remove any existing listeners to avoid duplicates
    const newProceedBtn = proceedBtn.cloneNode(true);
    proceedBtn.parentNode.replaceChild(newProceedBtn, proceedBtn);
    
    // Handle proceed without discount
    newProceedBtn.addEventListener('click', () => {
      bsModal.hide();
      resolve(true);
    });
    
    // Handle go back (cancel)
    modal.addEventListener('hidden.bs.modal', function handler() {
      modal.removeEventListener('hidden.bs.modal', handler);
      // Restore backdrop z-index
      const backdrops = document.querySelectorAll('.modal-backdrop');
      backdrops.forEach(bd => bd.style.zIndex = '');
      if (!modal.dataset.proceeded) {
        resolve(false);
      }
      delete modal.dataset.proceeded;
    });
    
    // Track when proceed is clicked
    newProceedBtn.addEventListener('click', () => {
      modal.dataset.proceeded = 'true';
    }, { once: true });
    
    bsModal.show();
    
    // After modal is shown, adjust backdrop z-index to appear above other modals
    setTimeout(() => {
      const backdrops = document.querySelectorAll('.modal-backdrop');
      backdrops.forEach(bd => {
        if (bd.style.zIndex === '' || parseInt(bd.style.zIndex) < 1055) {
          bd.style.zIndex = '1055';
        }
      });
    }, 100);
  });
};

// Initialize voucher handlers when DOM is ready
window.regularVoucherHandler = null;
window.customVoucherHandler = null;

document.addEventListener('DOMContentLoaded', () => {
  // Regular order voucher handler
  if (document.getElementById('voucherCodeInput')) {
    window.regularVoucherHandler = new VoucherHandler('');
  }
  
  // Custom order voucher handler
  if (document.getElementById('customVoucherCodeInput')) {
    window.customVoucherHandler = new VoucherHandler('custom');
  }
});
