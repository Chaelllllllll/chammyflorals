// dashboard.js - Customer Dashboard Functionality
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://chamflorals.vercel.app';

let currentCustomer = null;
let allOrders = [];

// Check authentication
async function checkAuth() {
    const token = localStorage.getItem('auth_token');
    const authSection = document.getElementById('authSection');
    
    if (!token) {
        window.location.href = 'customer-login.html?return=dashboard.html';
        return false;
    }

    try {
        const customerData = localStorage.getItem('customer');
        if (customerData) {
            currentCustomer = JSON.parse(customerData);
            
            // Update auth section with profile icon
            if (authSection) {
                const profileHTML = `
                    <div class="dropdown">
                        <button class="btn p-0 border-0" type="button" data-bs-toggle="dropdown" style="background: none;">
                            <div style="width: 42px; height: 42px; border-radius: 50%; border: 3px solid #ff6f9b; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%); cursor: pointer; box-shadow: 0 3px 10px rgba(255, 111, 155, 0.3);">
                                <i class="fa fa-user" style="color: white; font-size: 20px;"></i>
                            </div>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end" style="min-width: 280px; border-radius: 15px; border: 2px solid #ffe9f5; box-shadow: 0 10px 30px rgba(255, 111, 155, 0.2);">
                            <li class="px-3 py-3" style="border-bottom: 2px solid #ffe9f5;">
                                <div style="display: flex; align-items: center; gap: 15px;">
                                    <div style="width: 55px; height: 55px; border-radius: 50%; border: 3px solid #ff6f9b; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%); box-shadow: 0 3px 10px rgba(255, 111, 155, 0.3);">
                                        <i class="fa fa-user" style="color: white; font-size: 26px;"></i>
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 700; color: #3a2b33; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentCustomer.name || 'User'}</div>
                                        <div style="font-size: 13px; color: #999; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentCustomer.email}</div>
                                    </div>
                                </div>
                            </li>
                            <li><a class="dropdown-item py-2 profileBtnLink" href="#" style="font-weight: 600; color: #5b4952;"><i class="fa fa-user-circle me-2" style="color: #ff6f9b;"></i>My Profile</a></li>
                            <li><hr class="dropdown-divider" style="border-color: #ffe9f5;"></li>
                            <li><a class="dropdown-item py-2 text-danger logoutBtnLink" href="#" style="font-weight: 600;"><i class="fa fa-sign-out-alt me-2"></i>Logout</a></li>
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
function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('customer');
    currentCustomer = null;
    window.location.href = 'index.html';
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

// Display all orders
function displayAllOrders(orders) {
    const allOrdersList = document.getElementById('allOrdersList');
    
    if (!orders || orders.length === 0) {
        allOrdersList.innerHTML = `
            <div class="empty-state">
                <i class="fa fa-box-open"></i>
                <p>No orders yet. <a href="index.html" style="color: #667eea;">Place your first order!</a></p>
            </div>
        `;
        return;
    }
    
    allOrdersList.innerHTML = orders.map(order => {
        const statusClass = getStatusClass(order.status);
        const statusText = order.status.charAt(0).toUpperCase() + order.status.slice(1).replace('_', ' ');
        const date = new Date(order.created_at).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
        
        return `
            <div class="order-item" data-order-id="${order.id}">
                <div class="order-icon">
                    <i class="fa fa-receipt"></i>
                </div>
                <div class="order-details">
                    <h4>Order #${order.order_id || order.id}</h4>
                    <p>${order.flower_type || 'Custom Order'} x${order.quantity || 1} • ${date} • ₱${order.total_fee || '0.00'}</p>
                </div>
                <span class="order-status ${statusClass}">${statusText}</span>
            </div>
        `;
    }).join('');
    
    // Add click event listeners to all order items
    document.querySelectorAll('.order-item').forEach(item => {
        item.addEventListener('click', function() {
            const orderId = this.getAttribute('data-order-id'); // Don't use parseInt - ID is a UUID string
            window.showOrderDetails(orderId);
        });
    });
}

// Get status class
function getStatusClass(status) {
    const statusMap = {
        'pending': 'status-pending',
        'processing': 'status-processing',
        'out for delivery': 'status-processing',
        'delivered': 'status-delivered',
        'cancelled': 'status-pending'
    };
    return statusMap[status] || 'status-pending';
}

// Show order details modal
window.showOrderDetails = async function(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    
    if (!order) {
        return;
    }
    
    const modal = document.getElementById('orderModal');
    const modalTitle = document.getElementById('modalOrderTitle');
    const modalContent = document.getElementById('modalOrderContent');
    
    if (!modal || !modalTitle || !modalContent) {
        return;
    }
    
    // Check if review already exists for this order
    let hasReview = false;
    if (order.order_id) {
        try {
            const reviewResponse = await fetch(`${API_URL}/api/reviews`);
            if (reviewResponse.ok) {
                const reviews = await reviewResponse.json();
                hasReview = reviews.some(r => r.order_id === order.order_id);
            }
        } catch (error) {
            console.error('Error checking reviews:', error);
        }
    }
    
    modalTitle.textContent = `Order #${order.order_id || order.id}`;
    
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
    
    modalContent.innerHTML = `
        <div class="order-detail-section">
            <h4>Order Information</h4>
            <div class="order-detail-item">
                <span class="order-detail-label">Order Date</span>
                <span class="order-detail-value">${date}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">Order ID</span>
                <span class="order-detail-value">${order.order_id || 'N/A'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">Status</span>
                <span class="order-detail-value">${orderStatus.toUpperCase()}</span>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h4>Items</h4>
            <div class="order-detail-item">
                <span class="order-detail-label">Flower Type</span>
                <span class="order-detail-value">${order.flower_type || 'Custom'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">Quantity</span>
                <span class="order-detail-value">${order.quantity || 1}</span>
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
                <span class="order-detail-value">${order.message}</span>
            </div>
            ` : ''}
            ${order.rush ? `
            <div class="order-detail-item">
                <span class="order-detail-label">Rush Order</span>
                <span class="order-detail-value">Yes</span>
            </div>
            ` : ''}
        </div>
        
        <div class="order-detail-section">
            <h4>Contact Details</h4>
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
                <span class="order-detail-value">${order.fb_link || 'Not provided'}</span>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h4>Order Progress</h4>
            <div class="progress-tracker">
                ${statusSteps}
            </div>
        </div>
        
        <div class="order-detail-section">
            <h4>Payment</h4>
            <div class="order-detail-item">
                <span class="order-detail-label">Total Amount</span>
                <span class="order-detail-value" style="font-size: 18px; color: #667eea;">₱${order.total_fee || '0.00'}</span>
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
        document.getElementById('backToOrderBtn')?.addEventListener('click', () => window.showOrderDetails(orderId));
        
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
        alert('Please select a rating');
        return;
    }
    
    if (!reviewText) {
        alert('Please write a review');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('orderId', orderId);
        formData.append('stars', rating);
        formData.append('message', reviewText);
        
        // Add image if selected
        if (imageInput && imageInput.files && imageInput.files[0]) {
            formData.append('image', imageInput.files[0]);
        }
        
        const response = await fetch(`${API_URL}/api/reviews`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            alert('Thank you for your review!');
            closeOrderModal();
            // Reload orders to refresh the UI
            await loadOrders();
        } else {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error || errorData.message || 'Failed to submit review';
            alert(errorMsg);
        }
    } catch (error) {
        console.error('Review submission error:', error);
        alert('Error submitting review: ' + (error.message || 'Unknown error'));
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

