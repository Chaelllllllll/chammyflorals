// admin-reviews.js
// Admin interface to list, search, filter, and delete reviews. Requires admin token in localStorage.adminToken

async function loadReviews() {
  const token = localStorage.getItem('adminToken');
  if (!token) {
    window.location.href = '/admin/login.html';
    return;
  }

  try {
    const resp = await fetch('/api/admin/reviews', { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      throw new Error(j.error || `Failed to load reviews: ${resp.status}`);
    }
    const data = await resp.json();
    window.reviewsData = Array.isArray(data) ? data : [];
    setupFilters();
    applyFilters();
  } catch (err) {
    console.error('loadReviews error', err);
    showErrorModal(err.message || 'Failed to load reviews');
  }
}

function setupFilters() {
  const search = document.getElementById('reviewsSearch');
  const stars = document.getElementById('reviewsFilterStars');
  if (search) search.addEventListener('input', () => applyFilters());
  if (stars) stars.addEventListener('change', () => applyFilters());
}

function applyFilters() {
  const all = window.reviewsData || [];
  const q = (document.getElementById('reviewsSearch')?.value || '').trim().toLowerCase();
  const starsVal = (document.getElementById('reviewsFilterStars')?.value || '').trim();

  let list = all.slice();
  if (starsVal) {
    const s = Number(starsVal);
    list = list.filter(r => Number(r.stars) === s);
  }
  if (q) {
    list = list.filter(r => {
      return String(r.order_id || '').toLowerCase().includes(q)
        || String(r.name || '').toLowerCase().includes(q)
        || String(r.message || '').toLowerCase().includes(q);
    });
  }

  renderTable(list);
}

function renderTable(items) {
  const tbody = document.getElementById('reviewsTable');
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No matching reviews</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(r => `
    <tr data-id="${r.id}">
      <td>${r.id}</td>
      <td>${escapeHtml(r.order_id)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${Number(r.stars)}</td>
      <td>${escapeHtml(r.message)}</td>
      <td>${new Date(r.created_at).toLocaleString()}</td>
      <td><button class="btn btn-sm btn-danger delete-review-btn" data-id="${r.id}">Delete</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('.delete-review-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      const confirmBtn = document.getElementById('confirmDeleteButton');
      confirmBtn.dataset.id = id;
      const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
      modal.show();
    });
  });
}

async function deleteReview(id) {
  const token = localStorage.getItem('adminToken');
  if (!token) { window.location.href = '/admin/login.html'; return; }
  try {
    const resp = await fetch(`/api/admin/reviews/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    let parsed;
    try { parsed = await resp.json(); } catch (e) { parsed = {}; }
    if (!resp.ok) {
      throw new Error(parsed.error || `Failed to delete review: ${resp.status}`);
    }
    const successMsg = parsed.message || 'Review deleted';
    showSuccessModal(successMsg);
    // refresh list
    await loadReviews();
    bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
  } catch (err) {
    console.error('deleteReview error', err);
    showErrorModal(err.message || 'Failed to delete review');
  }
}

function showErrorModal(message) {
  const el = document.getElementById('errorModalContent');
  if (!el) return;
  el.textContent = message;
  const modal = new bootstrap.Modal(document.getElementById('errorModal'));
  modal.show();
}
function showSuccessModal(message) {
  const el = document.getElementById('successModalContent');
  if (!el) return;
  el.textContent = message;
  const modal = new bootstrap.Modal(document.getElementById('successModal'));
  modal.show();
}

function escapeHtml(s='') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// wire delete confirm
document.getElementById('confirmDeleteButton').addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  deleteReview(id);
});

// logout handling (same as admin-dashboard.js)
const logoutBtn = document.getElementById('logoutButton');
if (logoutBtn) logoutBtn.addEventListener('click', () => { localStorage.removeItem('adminToken'); window.location.href = '/admin/login.html'; });

// initialize
document.addEventListener('DOMContentLoaded', () => {
  loadReviews();
});
