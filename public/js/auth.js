// auth.js - Customer authentication for index.html
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://chammyflorals.vercel.app';

// Check authentication status and update UI
async function checkAuth() {
  const token = localStorage.getItem('auth_token');
  const customerData = localStorage.getItem('customer');
  const authSection = document.getElementById('authSection');
  
  console.log('checkAuth called, token present:', !!token);
  
  if (!token || !customerData) {
    // Not logged in - show login button
    authSection.innerHTML = `
      <a href="customer-login.html" class="btn btn-pink" style="padding: 8px 20px; border-radius: 8px; font-weight: 600; box-shadow: 0 2px 8px rgba(255, 111, 155, 0.25);">
        <i class="fa fa-sign-in-alt me-2"></i>Login
      </a>
    `;
    return false;
  }

  // Get customer data from localStorage (already verified by Google)
  try {
    const data = JSON.parse(customerData);
    currentCustomer = data;
    console.log('Customer authenticated:', data.email);
    
    // Logged in - show dashboard button
    authSection.innerHTML = `
      <a href="dashboard.html" class="btn btn-pink" style="padding: 8px 20px; border-radius: 8px; font-weight: 600; box-shadow: 0 2px 8px rgba(255, 111, 155, 0.25);">
        <i class="fa fa-tachometer-alt me-2"></i>Dashboard
      </a>
    `;
    
    return true;
  } catch (error) {
    console.error('Error reading customer data:', error);
    // On error, clear session
    localStorage.removeItem('auth_token');
    localStorage.removeItem('customer');
    authSection.innerHTML = `
      <a href="customer-login.html" class="btn btn-pink" style="padding: 8px 20px; border-radius: 8px; font-weight: 600; box-shadow: 0 2px 8px rgba(255, 111, 155, 0.25);">
        <i class="fa fa-sign-in-alt me-2"></i>Login
      </a>
    `;
    return false;
  }
}

// Logout function
function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('customer');
  currentCustomer = null;
  window.location.reload();
}

// Shared function to handle order button clicks
function handleOrderClick(e) {
  console.log('handleOrderClick called');
  if (e) e.preventDefault();

  // Simple local token check for immediate UX
  const token = localStorage.getItem('auth_token');
  console.log('Token in localStorage:', token ? 'EXISTS' : 'MISSING');
  
  if (!token) {
    console.log('No token, redirecting to login');
    window.location.href = 'customer-login.html';
    return;
  }

  console.log('Token found, showing inquiry modal');
  
  // Show inquiry modal when authenticated
  const modalEl = document.getElementById('inquiryModal');
  if (modalEl) {
    try {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
      console.log('Modal shown successfully');
    } catch (err) {
      console.error('Error showing modal:', err);
    }
  } else {
    console.error('Inquiry modal element not found');
  }
}

// Check auth on page load and set up event listeners
window.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  
  // Handle Order Now button click (navbar)
  const orderNowBtn = document.getElementById('orderNowBtn');
  if (orderNowBtn) {
    console.log('Order Now button found, attaching listener');
    orderNowBtn.addEventListener('click', handleOrderClick);
  } else {
    console.warn('Order Now button not found');
  }
  
  // Handle Order Now button click (hero section)
  const heroOrderBtn = document.getElementById('heroOrderBtn');
  if (heroOrderBtn) {
    console.log('Hero Order button found, attaching listener');
    heroOrderBtn.addEventListener('click', handleOrderClick);
  } else {
    console.warn('Hero Order button not found');
  }
});
