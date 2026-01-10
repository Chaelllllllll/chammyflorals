// Dashboard Chat System - Enhanced messaging with image support and product inquiries
document.addEventListener('DOMContentLoaded', async () => {
    const floatingChatBtn = document.getElementById('floatingChatBtn');
    const chatModal = document.getElementById('chatModal');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const imageUploadBtn = document.getElementById('imageUploadBtn');
    const imageInput = document.getElementById('imageInput');

    let chatInterval = null;
    let lastMessageId = null;
    let customerId = null;
    let selectedImage = null;

    // Check authentication
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
        if (floatingChatBtn) {
            floatingChatBtn.style.display = 'none';
        }
        return;
    }

    // Get customer ID from token
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        customerId = payload.id;
    } catch (error) {
        if (floatingChatBtn) {
            floatingChatBtn.style.display = 'none';
        }
        return;
    }
    
    // Function to update chat notification badge
    function updateChatBadge(count) {
        const badge = document.getElementById('chatNotificationBadge');
        if (!badge) return;
        
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
    
    // Load messages initially to check for unread
    loadMessages();
    
    // Poll for new messages every 15 seconds when chat is closed
    setInterval(() => {
        if (!chatModal || !chatModal.classList.contains('show')) {
            loadMessages();
        }
    }, 15000);

    // Floating chat button click handler
    if (floatingChatBtn && chatModal) {
        chatModal.addEventListener('shown.bs.modal', () => {
            // Clear badge when chat opens
            updateChatBadge(0);
            loadMessages();
            
            if (chatInterval) clearInterval(chatInterval);
            chatInterval = setInterval(loadMessages, 10000);
        });

        chatModal.addEventListener('hidden.bs.modal', () => {
            if (chatInterval) {
                clearInterval(chatInterval);
                chatInterval = null;
            }
        });
        
        // Check for pending product inquiry
        const pendingInquiry = localStorage.getItem('pendingProductInquiry');
        if (pendingInquiry) {
            try {
                const inquiry = JSON.parse(pendingInquiry);
                localStorage.removeItem('pendingProductInquiry');
                
                // Open chat modal and send product inquiry
                setTimeout(() => {
                    sendProductInquiry(inquiry.productId, inquiry.productName);
                }, 500);
            } catch (error) {
            }
        }

        // Auto-open chat modal when arriving from other pages
        try {
            const params = new URLSearchParams(window.location.search);
            if ((params.get('openChat') === '1' || window.location.hash === '#openChat') && chatModal) {
                const bs = new bootstrap.Modal(chatModal);
                bs.show();
            }
        } catch (e) { }
    }

    // Image upload button handler
    if (imageUploadBtn && imageInput) {
        imageUploadBtn.addEventListener('click', () => {
            imageInput.click();
        });

        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Validate file type
                const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                if (!allowedTypes.includes(file.type)) {
                    alert('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
                    imageInput.value = '';
                    return;
                }
                
                // Validate file size (5MB max)
                if (file.size > 5 * 1024 * 1024) {
                    alert('Image file size must be less than 5MB');
                    imageInput.value = '';
                    return;
                }
                
                selectedImage = file;
                // Show preview
                showImagePreview(file);
            }
        });
    }

    // Show image preview before sending
    function showImagePreview(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const previewHTML = `
                <div class="image-preview-wrapper" id="imagePreview">
                    <div class="image-preview">
                        <img src="${e.target.result}" alt="Preview">
                        <button type="button" class="btn-remove-image" onclick="removeImagePreview()">
                            <i class="fa fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
            const existingPreview = document.getElementById('imagePreview');
            if (existingPreview) {
                existingPreview.remove();
            }
            chatForm.insertAdjacentHTML('beforebegin', previewHTML);
        };
        reader.readAsDataURL(file);
    }

    // Remove image preview (make it global)
    window.removeImagePreview = function() {
        const preview = document.getElementById('imagePreview');
        if (preview) {
            preview.remove();
        }
        selectedImage = null;
        if (imageInput) {
            imageInput.value = '';
        }
    };

    // Load messages function with image and product support
    async function loadMessages() {
        if (!chatMessages || !customerId) return;

        try {
            const response = await fetch('/api/customer-chat', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (response.ok && data.messages) {
                // Count unread messages (seller messages only that haven't been seen)
                const unreadCount = data.messages.filter(msg => 
                    msg.sender_type === 'seller' && !msg.is_read
                ).length;
                
                // Check for new messages and trigger notification
                if (data.messages.length > 0 && lastMessageId) {
                    const newestMessage = data.messages[data.messages.length - 1];
                    if (newestMessage.id !== lastMessageId && newestMessage.sender_type === 'seller') {
                        // New message from seller - trigger notification
                        if (window.notificationManager && (!chatModal || !chatModal.classList.contains('show'))) {
                            let messagePreview = newestMessage.message;
                            if (newestMessage.product_id) {
                                messagePreview = 'Sent you a product recommendation';
                            } else if (newestMessage.message.includes('📢')) {
                                messagePreview = 'Sent you an announcement';
                            }
                            window.notificationManager.notifyNewMessage(messagePreview, 'Chammy Florals');
                        }
                    }
                }
                
                // Update last message ID
                if (data.messages.length > 0) {
                    lastMessageId = data.messages[data.messages.length - 1].id;
                }
                
                // Only update badge if chat is not open
                if (!chatModal || !chatModal.classList.contains('show')) {
                    updateChatBadge(unreadCount);
                }
                
                if (data.messages.length === 0) {
                    chatMessages.innerHTML = `
                        <div class="chat-empty">
                            <i class="fa fa-comments me-2"></i>No messages yet. Start a conversation!
                        </div>
                    `;
                } else {
                    const scrollAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop <= chatMessages.clientHeight + 50;
                    
                    chatMessages.innerHTML = data.messages.map(msg => {
                        const isCustomer = msg.sender_type === 'customer';
                        const time = new Date(msg.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                        });
                        const senderName = isCustomer ? 'You' : 'Chammy Florals';
                        const avatarIcon = isCustomer ? '<i class="fa fa-user"></i>' : '<i class="fa fa-store"></i>';
                        
                        // Check if this is a broadcast message (seller with product_id)
                        let broadcastCard = '';
                        if (msg.sender_type === 'seller' && msg.product_id) {
                            // This is a product announcement broadcast
                            broadcastCard = `
                                <div class="broadcast-attachment d-flex align-items-center" style="cursor: pointer;" data-product-id="${msg.product_id}">
                                    <div class="attachment-icon">
                                        <i class="fa fa-gift"></i>
                                    </div>
                                    <div class="attachment-content">
                                        <div class="attachment-title">${escapeHtml(msg.message)}</div>
                                        <div class="attachment-subtitle">Tap to view product details</div>
                                    </div>
                                    <div class="attachment-arrow">
                                        <i class="fa fa-chevron-right"></i>
                                    </div>
                                </div>
                            `;
                        } else if (msg.sender_type === 'seller' && (msg.message.startsWith('{') || msg.message.includes('📢'))) {
                            // This is an announcement broadcast
                            let announcementTitle = '';
                            let announcementDesc = '';
                            
                            // Try to parse as JSON first (new format)
                            if (msg.message.startsWith('{')) {
                                try {
                                    const announcementData = JSON.parse(msg.message);
                                    announcementTitle = announcementData.title;
                                    announcementDesc = announcementData.description;
                                } catch (e) {
                                    // If JSON parse fails, try old format
                                }
                            }
                            
                            // Parse old format: "📢 New Announcement: Title - Description"
                            if (!announcementTitle && msg.message.includes('📢')) {
                                let cleanMsg = msg.message.replace('📢 New Announcement:', '').replace('📢', '').trim();
                                const parts = cleanMsg.split(' - ');
                                announcementTitle = parts[0] || cleanMsg;
                                announcementDesc = parts.slice(1).join(' - ') || '';
                            }
                            
                            if (announcementTitle) {
                                broadcastCard = `
                                    <div class="broadcast-attachment" style="cursor: default;">
                                        <div class="d-flex align-items-start">
                                            <div class="attachment-icon">
                                                <i class="fa fa-bullhorn"></i>
                                            </div>
                                            <div class="attachment-content">
                                                <div class="attachment-title">${escapeHtml(announcementTitle)}</div>
                                                ${announcementDesc ? `<div class="attachment-subtitle">${escapeHtml(announcementDesc)}</div>` : ''}
                                            </div>
                                        </div>
                                        <button class="btn btn-sm mt-2 w-100" style="background: linear-gradient(135deg, #ff99bb, #ff6f9b); color: white; border: none; border-radius: 8px; padding: 8px;" onclick="window.location.href='/index.html'">
                                            <i class="fa fa-eye me-2"></i>View Details
                                        </button>
                                    </div>
                                `;
                            }
                        }
                        
                        // Product card if this is a product inquiry (but not a broadcast)
                        let productCard = '';
                        if (msg.products && msg.products.id && !broadcastCard) {
                            productCard = `
                                <div class="product-inquiry-card" onclick="window.location.href='/index.html?product=${msg.products.id}'">
                                    <img src="${escapeHtml(msg.products.image_url || '/flowers/default.jpg')}" alt="${escapeHtml(msg.products.name)}">
                                    <div class="product-inquiry-info">
                                        <strong>${escapeHtml(msg.products.name)}</strong>
                                        <small><i class="fa fa-arrow-right"></i> View Product</small>
                                    </div>
                                </div>
                            `;
                        }

                        // Image attachment
                        let imageHTML = '';
                        if (msg.image_url) {
                            imageHTML = `
                                <div class="chat-image">
                                    <img src="${escapeHtml(msg.image_url)}" alt="Image" onclick="showImageModal('${escapeHtml(msg.image_url)}')">
                                </div>
                            `;
                        }
                        
                        return `
                            <div class="chat-message-wrapper ${isCustomer ? 'customer' : 'seller'}" data-message-id="${msg.id}" data-sender-type="${msg.sender_type}">
                                <div class="chat-avatar ${isCustomer ? 'customer' : 'seller'}">${avatarIcon}</div>
                                <div class="chat-message-content">
                                    <div class="chat-sender-name">${senderName}</div>
                                    ${broadcastCard}
                                    ${productCard}
                                    ${broadcastCard ? '' : `<div class="chat-bubble ${isCustomer ? 'customer' : 'seller'}" onclick="this.classList.toggle('show-time')">
                                        <div>${escapeHtml(msg.message)}</div>
                                        ${imageHTML}
                                        <span class="chat-time">${time}</span>
                                    </div>`}
                                </div>
                            </div>
                        `;
                    }).join('');
                    
                    if (scrollAtBottom) {
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }

                    if (data.messages.length > 0) {
                        lastMessageId = data.messages[data.messages.length - 1].id;
                    }
                    
                    // Add click handlers for broadcast cards
                    document.querySelectorAll('.broadcast-attachment[data-product-id]').forEach(card => {
                        card.addEventListener('click', async function() {
                            const productId = this.getAttribute('data-product-id');
                            if (productId) {
                                // Fetch product details and show modal
                                try {
                                    const response = await fetch(`${API_URL}/api/products/${productId}`);
                                    if (response.ok) {
                                        const product = await response.json();
                                        // Use showPriceModal from products-list.js
                                        if (typeof showPriceModal === 'function') {
                                            showPriceModal(product);
                                        } else {
                                            // Fallback: redirect to index.html
                                            window.location.href = `/index.html?product=${productId}`;
                                        }
                                    }
                                } catch (error) {
                                    console.error('Error loading product:', error);
                                    // Fallback: redirect to index.html
                                    window.location.href = `/index.html?product=${productId}`;
                                }
                            }
                        });
                    });
                    
                }
            } else {
                chatMessages.innerHTML = `
                    <div class="chat-empty">
                        <i class="fa fa-exclamation-triangle me-2"></i>Failed to load messages. ${data.error || ''}
                    </div>
                `;
            }
        } catch (error) {
            chatMessages.innerHTML = `
                <div class="chat-empty">
                    <i class="fa fa-exclamation-triangle me-2"></i>Error loading messages.
                </div>
            `;
        }
    }

    // Send message with optional image
    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const message = chatInput.value.trim();
            const productId = chatInput.dataset.productId; // Get product ID if set
            
            if (!message || !customerId) {
                return;
            }

            const submitBtn = chatForm.querySelector('button[type="submit"]');
            const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
            
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
            }

            try {
                // Use FormData if we have an image or product_id
                let body;
                let headers = {
                    'Authorization': `Bearer ${token}`
                };

                if (selectedImage || productId) {
                    const formData = new FormData();
                    formData.append('message', message);
                    if (selectedImage) {
                        formData.append('image', selectedImage);
                    }
                    if (productId) {
                        formData.append('product_id', productId);
                    }
                    body = formData;
                    // Don't set Content-Type header for FormData
                } else {
                    headers['Content-Type'] = 'application/json';
                    body = JSON.stringify({ message: message });
                }

                const response = await fetch('/api/customer-chat/send', {
                    method: 'POST',
                    headers: headers,
                    body: body
                });

                const result = await response.json();

                if (response.ok) {
                    chatInput.value = '';
                    delete chatInput.dataset.productId; // Clear product ID after sending
                    selectedImage = null;
                    if (imageInput) imageInput.value = '';
                    window.removeImagePreview();
                    await loadMessages();
                } else {
                    alert(result.error || 'Failed to send message');
                }
            } catch (error) {
                alert('Failed to send message. Please try again.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnHtml;
                }
            }
        });
    }

    // Show full-size image modal
    window.showImageModal = function(imageUrl) {
        const modalHTML = `
            <div class="modal fade" id="imageViewModal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Image</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body text-center">
                            <img src="${imageUrl}" alt="Full size image" style="max-width: 100%; height: auto;">
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('imageViewModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = new bootstrap.Modal(document.getElementById('imageViewModal'));
        modal.show();
        
        // Clean up when closed
        document.getElementById('imageViewModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    };

    // Function to send product inquiry (called from product pages)
    window.sendProductInquiry = async function(productId, productName) {
        // Open chat modal if not already open
        if (!chatModal.classList.contains('show')) {
            const modal = new bootstrap.Modal(chatModal);
            modal.show();
            
            // Wait for modal to open and messages to load
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Pre-fill message with product inquiry
        const inquiryMessage = `Hi, I'm interested in ${productName}. Can you provide more information?`;
        chatInput.value = inquiryMessage;
        
        // Store product ID for sending
        chatInput.dataset.productId = productId;
        
        // Focus input so user can edit and send manually
        chatInput.focus();
    };

    // Escape HTML helper
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});

// Add CSS for image preview and product cards
const chatStyles = document.createElement('style');
chatStyles.textContent = `
    .image-preview-wrapper {
        padding: 10px;
        background: #f8f9fa;
        border-radius: 8px;
        margin-bottom: 10px;
    }
    
    .image-preview {
        position: relative;
        display: inline-block;
    }
    
    .image-preview img {
        max-width: 200px;
        max-height: 200px;
        border-radius: 8px;
        display: block;
    }
    
    .btn-remove-image {
        position: absolute;
        top: -8px;
        right: -8px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 12px;
    }
    
    .btn-remove-image:hover {
        background: #c82333;
    }

    .chat-image {
        margin-top: 8px;
    }
    
    .chat-image img {
        max-width: 250px;
        max-height: 250px;
        border-radius: 8px;
        cursor: pointer;
        transition: transform 0.2s;
    }
    
    .chat-image img:hover {
        transform: scale(1.05);
    }
    
    .product-inquiry-card {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid #dee2e6;
        border-radius: 8px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .product-inquiry-card:hover {
        background: rgba(255, 255, 255, 1);
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .product-inquiry-card img {
        width: 50px;
        height: 50px;
        object-fit: cover;
        border-radius: 6px;
    }
    
    .product-inquiry-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    
    .product-inquiry-info strong {
        color: #333;
        font-size: 14px;
    }
    
    .product-inquiry-info small {
        color: #ff6f9b;
        font-size: 12px;
    }
`;
document.head.appendChild(chatStyles);

// Delete feature removed; messages auto-expire after 30 days (handled server-side)
