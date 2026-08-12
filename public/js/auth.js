// auth.js - Customer authentication for index.html & storefront
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://chammyflorals.vercel.app';

let currentCustomer = null;

// Check authentication status and update UI
async function checkAuth() {
  const token = localStorage.getItem('auth_token');
  const customerData = localStorage.getItem('customer') || localStorage.getItem('customer_user') || localStorage.getItem('user');
  const authSection = document.getElementById('authSection');
  const authMobile = document.getElementById('authSectionMobile');
  
  const loginBtnHTML = `
    <a href="customer-login.html" class="btn-shadcn-primary text-decoration-none w-full md:w-auto flex items-center justify-center px-4 py-2.5 text-xs sm:text-sm font-semibold shadow-md">
      <i class="fa-solid fa-right-to-bracket me-1.5"></i>Login
    </a>
  `;

  if (!token || !customerData) {
    if (authSection) authSection.innerHTML = loginBtnHTML;
    if (authMobile) authMobile.innerHTML = loginBtnHTML;
    return false;
  }

  try {
    currentCustomer = JSON.parse(customerData);
    const initial = (currentCustomer.name || currentCustomer.email || 'U').charAt(0).toUpperCase();
    const avatarImg = currentCustomer.profile_picture 
      ? `<img src="${currentCustomer.profile_picture}" referrerpolicy="no-referrer" class="w-8 h-8 rounded-full object-cover shrink-0" alt="Profile" onerror="this.onerror=null; this.classList.add('hidden'); if(this.nextElementSibling) this.nextElementSibling.classList.remove('hidden');">`
      : '';
      
    const avatarFallback = `<div class="w-8 h-8 rounded-full bg-gradient-to-tr from-rose-600 to-rose-400 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm ${currentCustomer.profile_picture ? 'hidden' : ''}">${initial}</div>`;
      
    const profileDropdownHTML = `
      <div class="dropdown relative">
        <button class="p-0.5 rounded-full border-2 border-rose-500/40 hover:border-rose-600 active:scale-95 transition-all flex items-center justify-center bg-white dark:bg-slate-900 shadow-sm" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="${currentCustomer.name || 'Account'}">
          ${avatarImg}
          ${avatarFallback}
        </button>
        <ul class="dropdown-menu dropdown-menu-end p-2 rounded-2xl border border-slate-200/80 shadow-xl min-w-[220px] mt-2">
          <li class="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <p class="font-bold text-sm text-slate-900 dark:text-white mb-0 truncate">${currentCustomer.name || 'Customer'}</p>
            <p class="text-xs text-slate-500 mb-0 truncate">${currentCustomer.email || ''}</p>
          </li>
          <li>
            <a class="dropdown-item flex items-center gap-2 py-2 px-3 text-xs sm:text-sm font-semibold rounded-xl text-slate-700 hover:bg-rose-50 hover:text-rose-600 transition-colors" href="dashboard.html">
              <i class="fa-solid fa-gauge text-rose-500 me-1"></i>My Dashboard
            </a>
          </li>
          <li><hr class="dropdown-divider my-1 border-slate-100"></li>
          <li>
            <button onclick="logout()" class="dropdown-item flex items-center gap-2 py-2 px-3 text-xs sm:text-sm font-semibold rounded-xl text-rose-600 hover:bg-rose-50 transition-colors w-full text-left">
              <i class="fa-solid fa-right-from-bracket me-1"></i>Logout
            </button>
          </li>
        </ul>
      </div>
    `;

    if (authSection) authSection.innerHTML = profileDropdownHTML;
    if (authMobile) authMobile.innerHTML = profileDropdownHTML;
    return true;
  } catch (error) {
    console.error('Error reading customer data:', error);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('customer');
    if (authSection) authSection.innerHTML = loginBtnHTML;
    if (authMobile) authMobile.innerHTML = loginBtnHTML;
    return false;
  }
}

// Logout function
async function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('customer');
  localStorage.removeItem('customer_user');
  localStorage.removeItem('user');

  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('sb-') || key.includes('supabase')) {
      localStorage.removeItem(key);
    }
  });
  Object.keys(sessionStorage).forEach(key => {
    if (key.startsWith('sb-') || key.includes('supabase')) {
      sessionStorage.removeItem(key);
    }
  });

  if (window.supabaseClient && typeof window.supabaseClient.auth?.signOut === 'function') {
    try { await window.supabaseClient.auth.signOut(); } catch (e) {}
  }

  currentCustomer = null;
  window.location.href = 'customer-login.html';
}

function handleOrderClick(e) {
  if (e) e.preventDefault();
  const modalEl = document.getElementById('inquiryModal');
  if (modalEl) {
    try {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    } catch (err) {
      console.error('Error showing modal:', err);
    }
  }
}

// Check auth on page load and set up event listeners
window.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  
  const orderNowBtn = document.getElementById('orderNowBtn');
  if (orderNowBtn) {
    orderNowBtn.addEventListener('click', handleOrderClick);
  }
  
  const heroOrderBtn = document.getElementById('heroOrderBtn');
  if (heroOrderBtn) {
    heroOrderBtn.addEventListener('click', handleOrderClick);
  }
});
