// admin-vouchers.js - Voucher management
(async function() {
  const token = localStorage.getItem('adminToken');
  if (!token) {
    window.location.href = '/customer-login.html';
    return;
  }

  const vouchersContainer = document.getElementById('vouchersContainer');
  const voucherModal = new bootstrap.Modal(document.getElementById('voucherModal'));
  const voucherForm = document.getElementById('voucherForm');
  const saveVoucherBtn = document.getElementById('saveVoucherBtn');
  const createVoucherBtn = document.getElementById('createVoucherBtn');
  const logoutButton = document.getElementById('logoutButton');

  logoutButton?.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    window.location.href = '/customer-login.html';
  });

  // Load all vouchers
  async function loadVouchers() {
    try {
      console.log('Fetching vouchers from:', '/api/vouchers/admin/vouchers');
      const response = await fetch('/api/vouchers/admin/vouchers', {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Voucher routes not found. Please restart the server.');
        } else if (response.status === 401 || response.status === 403) {
          throw new Error('Authentication failed. Please log in again.');
        }
        throw new Error(`Server error: ${response.status}`);
      }

      const vouchers = await response.json();
      console.log('Loaded vouchers:', vouchers.length);
      renderVouchers(vouchers);
    } catch (error) {
      console.error('Error loading vouchers:', error);
      vouchersContainer.innerHTML = `
        <div class="col-12">
          <div class="alert alert-danger">
            <i class="fas fa-exclamation-triangle me-2"></i>
            <strong>Failed to load vouchers</strong>
            <p class="mb-0 mt-2">${error.message}</p>
            <hr>
            <small>
              <strong>Troubleshooting:</strong><br>
              1. Make sure you've run the database migrations<br>
              2. Restart your server (Ctrl+C, then npm start)<br>
              3. Check the server console for errors<br>
              4. Verify you're logged in as admin
            </small>
          </div>
        </div>
      `;
    }
  }

  function renderVouchers(vouchers) {
    if (!vouchers || vouchers.length === 0) {
      vouchersContainer.innerHTML = `
        <div class="col-12">
          <div class="card shadow-sm text-center py-5">
            <div class="card-body">
              <i class="fas fa-ticket-alt fa-3x text-muted mb-3"></i>
              <h5 class="text-muted">No vouchers yet</h5>
              <p class="text-muted">Create your first voucher to offer discounts</p>
            </div>
          </div>
        </div>
      `;
      return;
    }

    vouchersContainer.innerHTML = vouchers.map(voucher => {
      const isExpired = voucher.valid_until && new Date(voucher.valid_until) < new Date();
      const statusBadge = voucher.is_active 
        ? '<span class="badge badge-active">Active</span>'
        : '<span class="badge badge-inactive">Inactive</span>';
      
      const expiryBadge = isExpired 
        ? '<span class="badge bg-danger ms-2">Expired</span>' 
        : '';

      const discountText = voucher.discount_type === 'percentage'
        ? `${voucher.discount_value}% OFF`
        : `₱${voucher.discount_value} OFF`;

      const maxDiscountText = voucher.max_discount_amount && voucher.discount_type === 'percentage'
        ? ` (Max: ₱${voucher.max_discount_amount})`
        : '';

      const usageText = voucher.max_uses
        ? `${voucher.usage_count || 0} / ${voucher.max_uses} uses`
        : `${voucher.usage_count || 0} uses`;

      return `
        <div class="col-md-6 col-lg-4">
          <div class="card shadow-sm voucher-card h-100">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                  <h5 class="card-title mb-1">
                    <i class="fas fa-ticket-alt text-pink me-2"></i>
                    ${escapeHtml(voucher.code)}
                  </h5>
                  <p class="card-text text-muted small mb-0">${escapeHtml(voucher.description || 'No description')}</p>
                </div>
                <div class="text-end">
                  ${statusBadge}
                  ${expiryBadge}
                </div>
              </div>

              <div class="mb-3">
                <div class="h3 text-pink mb-1">${discountText}${maxDiscountText}</div>
                ${voucher.min_order_amount > 0 ? `<small class="text-muted">Min order: ₱${voucher.min_order_amount}</small>` : ''}
              </div>

              <div class="d-flex justify-content-between align-items-center mb-3">
                <small class="text-muted">
                  <i class="fas fa-users me-1"></i>
                  ${escapeHtml(voucher.eligible_customer_type || 'all').charAt(0).toUpperCase() + escapeHtml(voucher.eligible_customer_type || 'all').slice(1)} customers
                </small>
                <small class="text-muted">
                  <i class="fas fa-chart-line me-1"></i>
                  ${usageText}
                </small>
              </div>

              ${voucher.valid_until ? `
                <div class="mb-3">
                  <small class="text-muted">
                    <i class="fas fa-calendar-alt me-1"></i>
                    Expires: ${new Date(voucher.valid_until).toLocaleDateString()}
                  </small>
                </div>
              ` : ''}

              <div class="btn-group w-100" role="group">
                <button class="btn btn-sm btn-pink edit-btn" data-id="${voucher.id}">
                  <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-sm btn-pink toggle-btn" data-id="${voucher.id}">
                  <i class="fas fa-power-off"></i> ${voucher.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button class="btn btn-sm btn-pink delete-btn" data-id="${voucher.id}">
                  <i class="fas fa-trash"></i> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach event listeners
    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => editVoucher(btn.dataset.id));
    });

    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleVoucher(btn.dataset.id));
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteVoucher(btn.dataset.id));
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // Create new voucher
  createVoucherBtn.addEventListener('click', () => {
    document.getElementById('voucherModalTitle').textContent = 'Create Voucher';
    voucherForm.reset();
    document.getElementById('voucherId').value = '';
    
    // Set default dates
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('voucherValidFrom').value = now.toISOString().slice(0, 16);
  });

  // Edit voucher
  async function editVoucher(id) {
    try {
      const response = await fetch(`/api/vouchers/admin/vouchers/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch voucher');

      const data = await response.json();
      const voucher = data.voucher;

      document.getElementById('voucherModalTitle').textContent = 'Edit Voucher';
      document.getElementById('voucherId').value = voucher.id;
      document.getElementById('voucherCode').value = voucher.code;
      document.getElementById('voucherDescription').value = voucher.description || '';
      document.getElementById('voucherDiscountType').value = voucher.discount_type;
      document.getElementById('voucherDiscountValue').value = voucher.discount_value;
      document.getElementById('voucherMaxDiscount').value = voucher.max_discount_amount || '';
      document.getElementById('voucherMinOrder').value = voucher.min_order_amount || 0;
      document.getElementById('voucherMaxUses').value = voucher.max_uses || '';
      document.getElementById('voucherUsesPerCustomer').value = voucher.uses_per_customer || 1;
      document.getElementById('voucherEligibleType').value = voucher.eligible_customer_type || 'all';
      document.getElementById('voucherActive').value = voucher.is_active.toString();
      
      if (voucher.valid_from) {
        const validFrom = new Date(voucher.valid_from);
        validFrom.setMinutes(validFrom.getMinutes() - validFrom.getTimezoneOffset());
        document.getElementById('voucherValidFrom').value = validFrom.toISOString().slice(0, 16);
      }
      
      if (voucher.valid_until) {
        const validUntil = new Date(voucher.valid_until);
        validUntil.setMinutes(validUntil.getMinutes() - validUntil.getTimezoneOffset());
        document.getElementById('voucherValidUntil').value = validUntil.toISOString().slice(0, 16);
      }

      voucherModal.show();
    } catch (error) {
      console.error('Error loading voucher:', error);
      alertError('Failed to load voucher details');
    }
  }

  // Save voucher (create or update)
  saveVoucherBtn.addEventListener('click', async () => {
    if (!voucherForm.checkValidity()) {
      voucherForm.reportValidity();
      return;
    }

    const voucherId = document.getElementById('voucherId').value;
    const voucherData = {
      code: document.getElementById('voucherCode').value.toUpperCase(),
      description: document.getElementById('voucherDescription').value,
      discount_type: document.getElementById('voucherDiscountType').value,
      discount_value: parseFloat(document.getElementById('voucherDiscountValue').value),
      max_discount_amount: document.getElementById('voucherMaxDiscount').value ? parseFloat(document.getElementById('voucherMaxDiscount').value) : null,
      min_order_amount: parseFloat(document.getElementById('voucherMinOrder').value) || 0,
      max_uses: document.getElementById('voucherMaxUses').value ? parseInt(document.getElementById('voucherMaxUses').value) : null,
      uses_per_customer: parseInt(document.getElementById('voucherUsesPerCustomer').value) || 1,
      eligible_customer_type: document.getElementById('voucherEligibleType').value,
      valid_from: document.getElementById('voucherValidFrom').value ? new Date(document.getElementById('voucherValidFrom').value).toISOString() : null,
      valid_until: document.getElementById('voucherValidUntil').value ? new Date(document.getElementById('voucherValidUntil').value).toISOString() : null,
      is_active: document.getElementById('voucherActive').value === 'true'
    };

    try {
      const url = voucherId 
        ? `/api/vouchers/admin/vouchers/${voucherId}`
        : '/api/vouchers/admin/vouchers';
      
      const method = voucherId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(voucherData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save voucher');
      }

      alertSuccess(voucherId ? 'Voucher updated successfully' : 'Voucher created successfully');
      voucherModal.hide();
      loadVouchers();
    } catch (error) {
      console.error('Error saving voucher:', error);
      alertError(error.message);
    }
  });

  // Toggle voucher active status
  async function toggleVoucher(id) {
    try {
      const response = await fetch(`/api/vouchers/admin/vouchers/${id}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to toggle voucher');

      alertSuccess('Voucher status updated');
      loadVouchers();
    } catch (error) {
      console.error('Error toggling voucher:', error);
      alertError('Failed to update voucher status');
    }
  }

  // Delete voucher
  async function deleteVoucher(id) {
    if (!confirm('Are you sure you want to delete this voucher? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/vouchers/admin/vouchers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to delete voucher');

      alertSuccess('Voucher deleted successfully');
      loadVouchers();
    } catch (error) {
      console.error('Error deleting voucher:', error);
      alertError('Failed to delete voucher');
    }
  }

  // Update discount help text based on type
  document.getElementById('voucherDiscountType').addEventListener('change', (e) => {
    const helpText = e.target.value === 'percentage' 
      ? 'Enter percentage (e.g., 10 for 10% off)'
      : 'Enter fixed amount in pesos';
    document.getElementById('discountHelp').textContent = helpText;
  });

  // Initial load
  loadVouchers();
})();
