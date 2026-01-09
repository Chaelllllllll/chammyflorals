// Profile page functionality
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadProfile();
  
  // Form submission
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateProfile();
  });
});

function checkAuth() {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    window.location.href = '/customer-login.html';
    return;
  }
}

function loadProfile() {
  const customer = JSON.parse(localStorage.getItem('customer') || '{}');
  
  // Update header
  document.getElementById('profilePhoto').src = customer.profile_picture || 
    'https://ui-avatars.com/api/?name=' + encodeURIComponent(customer.name || 'User');
  document.getElementById('profileName').textContent = customer.name || 'User';
  document.getElementById('profileEmail').textContent = customer.email || '';
  
  // Populate form
  document.getElementById('name').value = customer.name || '';
  document.getElementById('email').value = customer.email || '';
  document.getElementById('phone').value = customer.phone || '';
  document.getElementById('city').value = customer.city || '';
  document.getElementById('address').value = customer.address || '';
}

async function updateProfile() {
  const token = localStorage.getItem('auth_token');
  if (!token) return;
  
  const formData = {
    name: document.getElementById('name').value,
    phone: document.getElementById('phone').value,
    city: document.getElementById('city').value,
    address: document.getElementById('address').value
  };
  
  try {
    const response = await fetch('/api/auth/update-profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Update localStorage
      const customer = JSON.parse(localStorage.getItem('customer') || '{}');
      localStorage.setItem('customer', JSON.stringify({
        ...customer,
        ...data.customer
      }));
      
      // Reload profile
      loadProfile();
      
      // Show success message
      showAlert('success', 'Profile updated successfully!');
      
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      showAlert('danger', data.error || 'Failed to update profile');
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    showAlert('danger', 'An error occurred while updating profile');
  }
}

function showAlert(type, message) {
  const alertContainer = document.getElementById('alertContainer');
  alertContainer.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      <i class="fa ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-2"></i>
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
  
  // Auto dismiss after 5 seconds
  setTimeout(() => {
    const alert = alertContainer.querySelector('.alert');
    if (alert) {
      alert.remove();
    }
  }, 5000);
}
