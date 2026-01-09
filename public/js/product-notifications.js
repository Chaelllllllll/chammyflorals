// Product Notifications - Shows new products to customers and triggers browser notifications

// Load and display product notifications
async function loadProductNotifications() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/api/announcements/product-notifications`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) return;

        const data = await response.json();
        
        if (data.notifications && data.notifications.length > 0) {
            // Trigger browser notification for new products
            if (window.notificationManager) {
                data.notifications.forEach(product => {
                    window.notificationManager.notifyNewProduct({
                        name: product.name,
                        image: product.image_url
                    });
                });
            }
        }
    } catch (error) {
        // Silently fail
    }
}

// Display product notifications
function displayProductNotifications(notifications) {
    const container = document.createElement('div');
    container.id = 'productNotificationsContainer';
    container.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 1050;
        max-width: 350px;
        max-height: 80vh;
        overflow-y: auto;
    `;

    const content = `
        <div style="background: white; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h6 style="margin: 0; color: #333;">
                    <i class="fa fa-gift me-2" style="color: #ff6f9b;"></i>New Products!
                </h6>
                <button onclick="closeProductNotifications()" style="border: none; background: none; font-size: 20px; cursor: pointer; color: #999;">×</button>
            </div>
            <div id="notificationsList">
                ${notifications.map(notif => `
                    <div class="notification-card" style="background: #f8f9fa; border-radius: 10px; padding: 12px; margin-bottom: 12px; cursor: pointer;" onclick="viewProduct('${notif.products.id}', '${notif.id}')">
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <img src="${notif.products.image_url || '/flowers/default.jpg'}" 
                                 style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; color: #333; font-size: 14px; margin-bottom: 4px;">
                                    ${notif.products.name}
                                </div>
                                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                                    ${notif.products.description || 'New product available!'}
                                </div>
                                <div style="color: #ff6f9b; font-weight: 600; font-size: 13px;">
                                    ₱${notif.products.price || 'See details'}
                                </div>
                            </div>
                        </div>
                        <button class="btn btn-sm btn-pink mt-2 w-100" style="background: linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%); border: none; color: white; padding: 6px;">
                            <i class="fa fa-arrow-right me-2"></i>View Product
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    container.innerHTML = content;
    document.body.appendChild(container);
}

// View product and mark notification as read
window.viewProduct = async function(productId, notificationId) {
    const token = localStorage.getItem('auth_token');
    if (token) {
        try {
            await fetch(`${API_URL}/api/announcements/product-notifications/${notificationId}/read`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (error) {
            // Silently fail
        }
    }
    
    closeProductNotifications();
    window.location.href = `/?product=${productId}`;
};

// Close notifications
window.closeProductNotifications = function() {
    const container = document.getElementById('productNotificationsContainer');
    if (container) {
        container.remove();
    }
};

// Auto-load on dashboard pages
if (window.location.pathname.includes('dashboard.html') || window.location.pathname.includes('my-orders.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(loadProductNotifications, 2000); // Show after 2 seconds
    });
}
