// dashboard.js - Customer Dashboard Functionality
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://chammyflorals.vercel.app';
let allOrders = [];
let telegramBotLink = 'https://t.me/ChammyFloralsBot';

// Load Telegram Bot Link dynamically
fetch('/api/settings/telegram-link')
    .then(res => res.json())
    .then(data => {
        if (data && data.telegram_bot_link) {
            telegramBotLink = data.telegram_bot_link;
        }
    })
    .catch(err => console.warn('Failed to load Telegram bot link:', err));

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Check authentication
async function checkAuth() {
    const token = localStorage.getItem('auth_token');
    const authSection = document.getElementById('authSection');
    
    if (!token) {
        window.location.href = 'customer-login.html?return=dashboard.html';
        return false;
    }

    try {
        const customerData = localStorage.getItem('customer') || localStorage.getItem('customer_user') || localStorage.getItem('user');
        if (customerData) {
            currentCustomer = JSON.parse(customerData);
            
            // Update welcome header dynamically with first name
            const welcomeHeader = document.getElementById('welcomeMessage');
            if (welcomeHeader && currentCustomer.name) {
                const firstName = currentCustomer.name.split(' ')[0];
                welcomeHeader.textContent = `Hi! ${firstName}`;
            }
            
            const initial = (currentCustomer.name || currentCustomer.email || 'U').charAt(0).toUpperCase();
            const avatarImg = currentCustomer.profile_picture 
              ? `<img src="${currentCustomer.profile_picture}" referrerpolicy="no-referrer" class="w-8 h-8 rounded-full object-cover shrink-0" alt="Profile" onerror="this.onerror=null; this.classList.add('hidden'); if(this.nextElementSibling) this.nextElementSibling.classList.remove('hidden');">`
              : '';
              
            const avatarFallback = `<div class="w-8 h-8 rounded-full bg-gradient-to-tr from-rose-600 to-rose-400 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm ${currentCustomer.profile_picture ? 'hidden' : ''}">${initial}</div>`;

            // Update auth section with profile icon
            if (authSection) {
                const profileHTML = `
                    <div class="dropdown relative">
                        <button class="p-0.5 rounded-full border-2 border-rose-500/40 hover:border-rose-600 active:scale-95 transition-all flex items-center justify-center bg-white shadow-sm" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="${currentCustomer.name || 'Account'}">
                            ${avatarImg}
                            ${avatarFallback}
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end p-2 rounded-2xl border border-slate-200/80 shadow-xl min-w-[220px] mt-2">
                            <li class="px-3 py-2 border-b border-slate-100">
                                <p class="font-bold text-sm text-slate-900 mb-0 truncate">${currentCustomer.name || 'Customer'}</p>
                                <p class="text-xs text-slate-500 mb-0 truncate">${currentCustomer.email || ''}</p>
                            </li>
                            <li><hr class="dropdown-divider my-1 border-slate-100"></li>
                            <li>
                                <a class="dropdown-item flex items-center gap-2 py-2 px-3 text-xs sm:text-sm font-semibold rounded-xl text-rose-600 hover:bg-rose-50 logoutBtnLink" href="#">
                                    <i class="fa-solid fa-right-from-bracket me-1"></i>Logout
                                </a>
                            </li>
                        </ul>
                    </div>
                `;
                
                authSection.innerHTML = profileHTML;
                
                // Also update mobile section if it exists
                const authSectionMobile = document.getElementById('authSectionMobile');
                if (authSectionMobile) {
                    authSectionMobile.innerHTML = profileHTML;
                }
                
                // Attach logout handler
                setTimeout(() => {
                    const logoutBtns = document.querySelectorAll('.logoutBtnLink');
                    logoutBtns.forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.preventDefault();
                            logout();
                        });
                    });
                    
                    const profileBtns = document.querySelectorAll('.profileBtnLink');
                    profileBtns.forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.preventDefault();
                            openProfileModal();
                        });
                    });
                }, 0);
            }
            
            return true;
        } else {
            window.location.href = 'customer-login.html?return=dashboard.html';
            return false;
        }
    } catch (error) {
        window.location.href = 'customer-login.html?return=dashboard.html';
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

// Load orders data
async function loadOrders() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/api/orders`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            allOrders = await response.json();
            updateStats(allOrders);
            displayAllOrders(allOrders);
        } else {
        }
    } catch (error) {
    }
}

// Update statistics
function updateStats(orders) {
    // Stats grid removed from UI, but keep function for compatibility
}

// Lazy loading variables
let displayedOrdersCount = 0;
const ORDERS_PER_PAGE = 10;
let isLoadingMore = false;

// Display all orders with lazy loading
function displayAllOrders(orders, append = false) {
    const allOrdersList = document.getElementById('allOrdersList');
    
    if (!orders || orders.length === 0) {
        allOrdersList.innerHTML = `
            <div class="d-flex justify-content-center">
                <div class="text-center py-16 px-4 text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-rose-50 dark:bg-rose-900/30 mb-4">
                        <i class="fa fa-box-open text-3xl text-rose-600"></i>
                    </div>
                    <h3 class="text-xl font-semibold mb-2">No orders yet</h3>
                    <p class="text-sm mb-4">Looks like you haven't placed any orders. When you do, they'll appear here for easy tracking.</p>
                    <a href="index.html" class="btn-shadcn-primary px-4 py-2 inline-flex items-center justify-center">
                        <i class="fa fa-shopping-bag me-2"></i>Place your first order
                    </a>
                </div>
            </div>
        `;
        return;
    }
    
    // Reset counter if not appending
    if (!append) {
        displayedOrdersCount = 0;
        allOrdersList.innerHTML = '';
    }
    
    // Get next batch of orders
    const startIdx = displayedOrdersCount;
    const endIdx = Math.min(startIdx + ORDERS_PER_PAGE, orders.length);
    const ordersToDisplay = orders.slice(startIdx, endIdx);
    
    const orderHTML = ordersToDisplay.map(order => {
        const statusBadgeClass = (function(status) {
            const normalized = (status || '').toLowerCase().trim();
            if (normalized === 'delivered') return 'bg-emerald-50 text-emerald-700 border border-emerald-200/60';
            if (normalized === 'processing') return 'bg-rose-50 text-rose-700 border border-rose-200/60';
            if (normalized === 'cancelled') return 'bg-slate-100 text-slate-600 border border-slate-200/60';
            return 'bg-amber-50 text-amber-700 border border-amber-200/60';
        })(order.status);

        const statusText = order.status.charAt(0).toUpperCase() + order.status.slice(1).replace('_', ' ');
        const date = new Date(order.created_at).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
        
        return `
            <div class="order-item glass-card p-5 mb-4 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border border-slate-100/90" data-order-id="${order.id}">
                <!-- Card Header -->
                <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                    <div class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/20"></span>
                        <span class="font-display font-bold text-slate-800 text-sm">Order #${order.order_id || order.id}</span>
                    </div>
                    <span class="text-xs text-slate-400 font-semibold">${date}</span>
                </div>

                <!-- Card Body -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-12 h-12 rounded-xl bg-rose-50/60 border border-rose-100/50 text-rose-500 flex items-center justify-center shrink-0">
                            <i class="fa fa-spa text-lg"></i>
                        </div>
                        <div class="min-w-0">
                            <h5 class="font-bold text-slate-800 text-sm mb-1 truncate">${escapeHtml(order.flower_type || 'Custom Bouquet')}</h5>
                            <p class="text-xs text-slate-500 font-medium mb-0">Quantity: ${order.quantity || 1}</p>
                        </div>
                    </div>
                    
                    <!-- Pricing and Status -->
                    <div class="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 border-t border-slate-100/80 sm:border-0 pt-2.5 sm:pt-0">
                        <div class="font-display font-bold text-rose-600 text-sm sm:text-base">₱${order.total_fee || '0.00'}</div>
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold select-none shadow-sm ${statusBadgeClass}">${statusText}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    if (append) {
        allOrdersList.insertAdjacentHTML('beforeend', orderHTML);
    } else {
        allOrdersList.innerHTML = orderHTML;
    }
    
    displayedOrdersCount = endIdx;
    
    // Add or remove "Load More" button
    const existingLoadMore = document.getElementById('loadMoreOrders');
    if (existingLoadMore) {
        existingLoadMore.remove();
    }
    
    if (displayedOrdersCount < orders.length) {
        const loadMoreBtn = document.createElement('div');
        loadMoreBtn.id = 'loadMoreOrders';
        loadMoreBtn.className = 'text-center my-4';
        loadMoreBtn.innerHTML = `
            <button class="btn btn-pink btn-lg px-5" style="border-radius: 50px; font-weight: 600; box-shadow: 0 4px 15px rgba(255, 111, 155, 0.3);">
                <i class="fa fa-chevron-down me-2"></i>Load More Orders (${orders.length - displayedOrdersCount} remaining)
            </button>
        `;
        allOrdersList.parentElement.appendChild(loadMoreBtn);
        
        loadMoreBtn.querySelector('button').addEventListener('click', () => {
            if (!isLoadingMore) {
                isLoadingMore = true;
                displayAllOrders(allOrders, true);
                isLoadingMore = false;
            }
        });
    }
    
    // Add click event listeners to all order items
    document.querySelectorAll('.order-item').forEach(item => {
        item.addEventListener('click', function() {
            const orderId = this.getAttribute('data-order-id');
            window.showOrderDetails(orderId);
        });
    });
}

// Get status class
function getStatusClass(status) {
    const normalizedStatus = (status || '').toLowerCase().trim();
    const statusMap = {
        'pending': 'status-pending',
        'processing': 'status-processing',
        'out for delivery': 'status-processing',
        'delivered': 'status-delivered',
        'cancelled': 'status-pending',
        'ready': 'status-delivered'
    };
    return statusMap[normalizedStatus] || 'status-pending';
}

// Show order details modal
window.showOrderDetails = async function(orderId) {
    // Find order by order_id or id
    const order = allOrders.find(o => o.order_id === orderId || o.id === orderId);
    
    if (!order) {
        return;
    }
    
    const modal = document.getElementById('orderModal');
    const modalTitle = document.getElementById('modalOrderTitle');
    const modalContent = document.getElementById('modalOrderContent');
    
    if (!modal || !modalTitle || !modalContent) {
        return;
    }
    
    // Check if review already exists for this order (works for both regular and custom orders)
    let hasReview = false;
    const currentOrderId = order.order_id || order.id;
    if (currentOrderId) {
        try {
            const reviewResponse = await fetch(`${API_URL}/api/reviews`);
            if (reviewResponse.ok) {
                const reviews = await reviewResponse.json();
                hasReview = reviews.some(r => r.order_id === currentOrderId);
            }
        } catch (error) {
            // Ignore errors when checking reviews
        }
    }

    modalTitle.innerHTML = `<i class="fa fa-receipt"></i>Order #${order.order_id || order.id}`;
    
    const date = new Date(order.created_at).toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Use default status if not set
    const orderStatus = order.status || 'pending';
    const statusSteps = getOrderProgress(orderStatus);
    
    // Format status with badge
    const statusBadgeClass = {
        'pending': 'bg-warning',
        'processing': 'bg-info',
        'to receive': 'bg-primary',
        'delivered': 'bg-success',
        'cancelled': 'bg-danger'
    }[orderStatus.toLowerCase()] || 'bg-secondary';
    
    modalContent.innerHTML = `
        <div class="order-detail-section">
            <h4><i class="fa fa-info-circle"></i>Order Information</h4>
            <div class="order-detail-item">
                <span class="order-detail-label">Order ID</span>
                <span class="order-detail-value" style="font-family: 'Courier New', monospace; background: #f8f8f8; padding: 6px 12px; border-radius: 6px; display: inline-block;">${order.order_id || 'N/A'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">Order Date</span>
                <span class="order-detail-value">${date}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">Status</span>
                <span class="order-detail-value"><span class="badge ${statusBadgeClass} px-3 py-2" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${orderStatus}</span></span>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h4><i class="fa fa-box"></i>Items</h4>
            ${order.order_type === 'custom' ? `
                ${order.stems && Array.isArray(order.stems) && order.stems.length > 0 ? `
                <div class="order-detail-item">
                    <span class="order-detail-label">Stems</span>
                    <span class="order-detail-value">${order.stems.map(s => `${s.name} (₱${s.price})`).join(', ')}</span>
                </div>
                ` : ''}
                ${order.fillers && Array.isArray(order.fillers) && order.fillers.length > 0 ? `
                <div class="order-detail-item">
                    <span class="order-detail-label">Fillers</span>
                    <span class="order-detail-value">${order.fillers.map(f => `${f.name} (₱${f.price})`).join(', ')}</span>
                </div>
                ` : ''}
                ${order.wrapping && Array.isArray(order.wrapping) && order.wrapping.length > 0 ? `
                <div class="order-detail-item">
                    <span class="order-detail-label">Wrapping</span>
                    <span class="order-detail-value">${order.wrapping.map(w => `${w.name} (₱${w.price})`).join(', ')}</span>
                </div>
                ` : ''}
                ${order.addons && Array.isArray(order.addons) && order.addons.length > 0 ? `
                <div class="order-detail-item">
                    <span class="order-detail-label">Add-ons</span>
                    <span class="order-detail-value">${order.addons.map(a => `${a.name} (₱${a.price})`).join(', ')}</span>
                </div>
                ` : ''}
                ${order.special_instructions ? `
                <div class="order-detail-item">
                    <span class="order-detail-label">Special Instructions</span>
                    <span class="order-detail-value" style="font-style: italic;">"${order.special_instructions}"</span>
                </div>
                ` : ''}
            ` : `
                <div class="order-detail-item">
                    <span class="order-detail-label">Flower Type</span>
                    <span class="order-detail-value">${order.flower_type || 'Custom'}</span>
                </div>
                <div class="order-detail-item">
                    <span class="order-detail-label">Quantity</span>
                    <span class="order-detail-value">${order.quantity || 1} pc(s)</span>
                </div>
                ${order.addons && Array.isArray(order.addons) && order.addons.length > 0 ? `
                <div class="order-detail-item">
                    <span class="order-detail-label">Add-ons</span>
                    <span class="order-detail-value">${order.addons.join(', ')}</span>
                </div>
                ` : ''}
                ${order.message && order.message !== 'Not provided' ? `
                <div class="order-detail-item">
                    <span class="order-detail-label">Message</span>
                    <span class="order-detail-value" style="font-style: italic;">"${order.message}"</span>
                </div>
                ` : ''}
                ${order.rush ? `
                <div class="order-detail-item">
                    <span class="order-detail-label">Rush Order</span>
                    <span class="order-detail-value"><span class="badge bg-danger"><i class="fa fa-bolt me-1"></i>Rush</span></span>
                </div>
                ` : ''}
            `}
        </div>
        
        <div class="order-detail-section">
            <h4><i class="fa fa-receipt"></i>Payment Summary</h4>
            ${order.voucher_code ? `
                <div class="order-detail-item">
                    <span class="order-detail-label">Voucher Applied</span>
                    <span class="order-detail-value">
                        <span class="badge bg-success px-3 py-2" style="font-size: 12px;">
                            <i class="fa fa-ticket-alt me-1"></i>${order.voucher_code}
                        </span>
                    </span>
                </div>
                <div class="order-detail-item">
                    <span class="order-detail-label">Original Total</span>
                    <span class="order-detail-value" style="text-decoration: line-through; color: #999;">₱${order.original_total || order.total_fee}</span>
                </div>
                <div class="order-detail-item">
                    <span class="order-detail-label">Discount</span>
                    <span class="order-detail-value" style="color: #28a745; font-weight: 600;">-₱${order.voucher_discount || '0.00'}</span>
                </div>
            ` : ''}
            <div class="order-detail-item">
                <span class="order-detail-label">Total ${order.voucher_code ? 'After Discount' : 'Fee'}</span>
                <span class="order-detail-value highlight">₱${order.total_fee || '0.00'}</span>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h4><i class="fa fa-user"></i>Contact Details</h4>
            <div class="order-detail-item">
                <span class="order-detail-label">Name</span>
                <span class="order-detail-value">${order.name || 'N/A'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">Email</span>
                <span class="order-detail-value">${order.email || 'N/A'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">Facebook Link</span>
                <span class="order-detail-value">${order.fb_link ? `<a href="${order.fb_link}" target="_blank" style="color: #ff6f9b; text-decoration: none;"><i class="fab fa-facebook me-1"></i>View Profile</a>` : 'Not provided'}</span>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h4><i class="fa fa-tasks"></i>Order Progress</h4>
            <div class="progress-tracker">
                ${statusSteps}
            </div>
        </div>
        
        ${orderStatus.toLowerCase() === 'delivered' && !hasReview ? `
            <button class="btn-review" data-review-order-id="${order.order_id || order.id}">
                <i class="fa fa-star me-2"></i>Submit Review
            </button>
        ` : orderStatus.toLowerCase() === 'delivered' && hasReview ? `
            <div style="padding: 16px; background: #e8f5e9; border-radius: 12px; text-align: center; color: #4caf50; margin-top: 10px;">
                <i class="fa fa-check-circle me-2"></i>You've already submitted a review for this order
            </div>
        ` : ''}

        <a href="${telegramBotLink}?start=${order.order_id || order.id}" target="_blank" class="btn-shadcn-primary w-full py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 mb-3 mt-4 text-white text-decoration-none" style="background: #0088cc; border: none; display: flex; align-items: center; justify-content: center; color: #fff;">
            <i class="fa-brands fa-telegram text-lg"></i>
            <span>Track your order using our Telegram Bot</span>
        </a>
    `;
    
    modal.classList.add('show');
    
    // Add event listener for review button if present
    const reviewBtn = modalContent.querySelector('.btn-review');
    if (reviewBtn) {
        reviewBtn.addEventListener('click', function() {
            const orderId = this.getAttribute('data-review-order-id');
            window.showReviewForm(orderId);
        });
    }
}

window.closeOrderModal = function() {
    const modal = document.getElementById('orderModal');
    modal.classList.remove('show');
}

// Get order progress steps
function getOrderProgress(status) {
    const steps = [
        { name: 'Order Placed', icon: 'fa-check', desc: 'Your order has been received' },
        { name: 'Processing', icon: 'fa-cog', desc: 'Preparing your order' },
        { name: 'Out for Delivery', icon: 'fa-truck', desc: 'On the way to you' },
        { name: 'Delivered', icon: 'fa-check-circle', desc: 'Order completed' }
    ];
    
    // Normalize status for accurate matching
    const normalizedStatus = (status || 'pending').toLowerCase().trim();
    
    const statusIndex = {
        'pending': 0,
        'confirmed': 0,
        'order placed': 0,
        'processing': 1,
        'preparing': 1,
        'in progress': 1,
        'out for delivery': 2,
        'to receive': 2,
        'to deliver': 2,
        'shipping': 2,
        'shipped': 2,
        'in transit': 2,
        'delivered': 3,
        'completed': 3,
        'received': 3
    };
    
    const currentIndex = statusIndex[normalizedStatus] !== undefined 
        ? statusIndex[normalizedStatus] 
        : 0;
    
    return steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isActive = index === currentIndex;
        const className = isActive ? 'active' : (isCompleted ? 'completed' : '');
        
        return `
            <div class="progress-step ${className}">
                <div class="progress-icon">
                    <i class="fa ${step.icon}"></i>
                </div>
                <div class="progress-info">
                    <div class="progress-name">${step.name}</div>
                    <div class="progress-desc">${step.desc}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Show review form
window.showReviewForm = function(orderId) {
    const modalContent = document.getElementById('modalOrderContent');
    modalContent.innerHTML = `
        <div class="review-form">
            <h4 style="margin-bottom: 16px;">How was your experience?</h4>
            <div class="star-rating" id="starRating">
                <i class="fa fa-star" data-rating="1"></i>
                <i class="fa fa-star" data-rating="2"></i>
                <i class="fa fa-star" data-rating="3"></i>
                <i class="fa fa-star" data-rating="4"></i>
                <i class="fa fa-star" data-rating="5"></i>
            </div>
            <textarea id="reviewText" placeholder="Share your thoughts about this order..."></textarea>
            <div style="margin-bottom: 15px;">
                <label class="form-label fw-semibold small" style="color: #2d2d2d; display: block; margin-bottom: 8px;">Photo (Optional)</label>
                <input type="file" id="reviewImage" accept="image/*" class="form-control" style="border: 2px solid #e8e8e8; border-radius: 12px; padding: 12px;">
                <div class="form-text small text-muted">Max 5MB</div>
            </div>
            <button class="btn-save" id="submitReviewBtn">
                <i class="fa fa-paper-plane me-2"></i>Submit Review
            </button>
            <button class="btn-review" id="backToOrderBtn" style="background: #6c757d; margin-top: 12px;">
                <i class="fa fa-arrow-left me-2"></i>Back to Order Details
            </button>
        </div>
    `;
    
    // Add event listeners
    setTimeout(() => {
        document.getElementById('submitReviewBtn')?.addEventListener('click', () => window.submitReview(orderId));
        document.getElementById('backToOrderBtn')?.addEventListener('click', () => {
            const order = allOrders.find(o => o.id === orderId || o.order_id === orderId);
            if (order) window.showOrderDetails(order.id);
        });
        
        // Star rating functionality
        const stars = document.querySelectorAll('.star-rating i');
        let selectedRating = 0;
        
        stars.forEach(star => {
            star.addEventListener('click', function() {
                selectedRating = this.getAttribute('data-rating');
                updateStars(selectedRating);
            });
        });
        
        function updateStars(rating) {
            stars.forEach((star, index) => {
                if (index < rating) {
                    star.classList.add('active');
                } else {
                    star.classList.remove('active');
                }
            });
        }
    }, 0);
}

// Submit review
window.submitReview = async function(orderId) {
    const rating = document.querySelectorAll('.star-rating i.active').length;
    const reviewText = document.getElementById('reviewText').value.trim();
    const imageInput = document.getElementById('reviewImage');
    
    if (rating === 0) {
        alertWarning('Please select a rating');
        return;
    }
    
    if (!reviewText) {
        alertWarning('Please write a review');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('orderId', orderId);
        formData.append('stars', rating);
        formData.append('message', reviewText);
        
        // Add image if selected
        if (imageInput && imageInput.files && imageInput.files[0]) {
            const compImage = typeof compressImage === 'function' ? await compressImage(imageInput.files[0]) : imageInput.files[0];
            formData.append('image', compImage);
        }
        
        const response = await fetch(`${API_URL}/api/reviews`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            alertSuccess('Thank you for your review!');
            closeOrderModal();
            // Reload orders to refresh the UI
            await loadOrders();
        } else {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error || errorData.message || 'Failed to submit review';
            alertError(errorMsg);
        }
    } catch (error) {
        alertError('Failed to submit review. Please try again.');
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    const authenticated = await checkAuth();
    if (authenticated) {
        await loadOrders();
    }
    
    // Add event listeners for modal close buttons
    const closeOrderBtn = document.getElementById('closeOrderModalBtn');
    if (closeOrderBtn) {
        closeOrderBtn.addEventListener('click', window.closeOrderModal);
    }
    
    const closeProfileBtn = document.getElementById('closeProfileModalBtn');
    if (closeProfileBtn) {
        closeProfileBtn.addEventListener('click', window.closeProfileModal);
    }
});

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const orderModal = document.getElementById('orderModal');
    const profileModal = document.getElementById('profileModal');
    
    if (e.target === orderModal) {
        closeOrderModal();
    }
    
    if (e.target === profileModal) {
        closeProfileModal();
    }
});

// Profile Modal Functions
window.openProfileModal = function() {
    const customer = JSON.parse(localStorage.getItem('customer') || '{}');
    
    document.getElementById('profileName').value = customer.name || '';
    document.getElementById('profileEmail').value = customer.email || '';
    
    document.getElementById('profileModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

window.closeProfileModal = function() {
    document.getElementById('profileModal').classList.remove('show');
    document.body.style.overflow = 'auto';
    document.getElementById('profileAlertContainer').innerHTML = '';
}

// Handle profile form submission
document.addEventListener('DOMContentLoaded', () => {
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const token = localStorage.getItem('auth_token');
            if (!token) return;
            
            const formData = {
                name: document.getElementById('profileName').value.trim()
            };
            
            try {
                const response = await fetch(`${API_URL}/api/auth/update-profile`, {
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
                    
                    // Show success message
                    showProfileAlert('success', 'Profile updated successfully!');
                    
                    // Reload profile data
                    setTimeout(() => {
                        closeProfileModal();
                        checkAuth(); // Refresh auth section
                    }, 1500);
                } else {
                    showProfileAlert('danger', data.error || 'Failed to update profile');
                }
            } catch (error) {
                showProfileAlert('danger', 'An error occurred while updating profile');
            }
        });
    }
    
    // Change Password Form
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const token = localStorage.getItem('auth_token');
            if (!token) return;
            
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            // Validate passwords match
            if (newPassword !== confirmPassword) {
                showPasswordAlert('danger', 'New passwords do not match');
                return;
            }
            
            // Validate password length
            if (newPassword.length < 6) {
                showPasswordAlert('danger', 'Password must be at least 6 characters long');
                return;
            }
            
            try {
                const response = await fetch(`${API_URL}/api/auth/change-password`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        currentPassword,
                        newPassword
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showPasswordAlert('success', 'Password changed successfully!');
                    
                    // Clear form
                    changePasswordForm.reset();
                    
                    // Optional: logout user after password change
                    setTimeout(() => {
                        showPasswordAlert('info', 'Please login again with your new password');
                        setTimeout(() => {
                            localStorage.removeItem('auth_token');
                            localStorage.removeItem('customer');
                            window.location.href = '/customer-login.html';
                        }, 2000);
                    }, 1500);
                } else {
                    showPasswordAlert('danger', data.error || 'Failed to change password');
                }
            } catch (error) {
                showPasswordAlert('danger', 'An error occurred while changing password');
            }
        });
    }
});

function showProfileAlert(type, message) {
    const alertContainer = document.getElementById('profileAlertContainer');
    alertContainer.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert" style="border-radius: 10px;">
            <i class="fa ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
}

function showPasswordAlert(type, message) {
    const alertContainer = document.getElementById('passwordAlertContainer');
    alertContainer.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert" style="border-radius: 10px;">
            <i class="fa ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
}

