// Admin Customer Messages - Enhanced with general messaging support
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('adminToken');
  
  if (!token) {
    alert('Please log in first');
    window.location.href = '/admin/login.html';
    return;
  }

  let currentCustomerId = null;
  let chatRefreshInterval = null;
  let allConversations = [];

  // Elements
  const conversationsListContent = document.getElementById('conversationsListContent');
  const chatArea = document.getElementById('chatArea');
  const emptyState = document.getElementById('emptyState');
  const chatContent = document.getElementById('chatContent');
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatCustomerName = document.getElementById('chatCustomerName');
  const chatCustomerEmail = document.getElementById('chatCustomerEmail');
  const backToList = document.getElementById('backToList');
  const conversationsList = document.getElementById('conversationsList');
  const imageInput = document.getElementById('imageInput');
  const imageUploadBtn = document.getElementById('imageUploadBtn');

  let selectedImage = null;

  // Mobile back button
  if (backToList) {
    backToList.addEventListener('click', () => {
      conversationsList.classList.remove('hide-mobile');
      chatArea.classList.remove('show-mobile');
    });
  }

  // Image upload button
  if (imageUploadBtn && imageInput) {
    imageUploadBtn.addEventListener('click', () => {
      imageInput.click();
    });

    imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        // Validate file
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
          alert('Please select a valid image file');
          imageInput.value = '';
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          alert('Image must be less than 5MB');
          imageInput.value = '';
          return;
        }
        selectedImage = file;
        showImagePreview(file);
      }
    });
  }

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

  // Logout button
  const logoutBtn = document.getElementById('logoutButton');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login.html';
    });
  }

  // Load all customer conversations
  async function loadConversations() {
    try {
      const response = await fetch('/api/admin/customer-conversations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to load conversations');
      
      const data = await response.json();
      allConversations = data.conversations || [];

      renderConversations(allConversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
      if (conversationsListContent) {
        conversationsListContent.innerHTML = '<div class="alert alert-danger">Failed to load conversations</div>';
      }
    }
  }

  function renderConversations(conversations) {
    if (!conversationsListContent) return;

    if (!conversations || conversations.length === 0) {
      conversationsListContent.innerHTML = `
        <div class="text-center text-muted py-4">
          <i class="fa fa-inbox fa-3x mb-3 opacity-50"></i>
          <p>No customer messages yet</p>
        </div>
      `;
      return;
    }

    conversationsListContent.innerHTML = conversations.map(conv => {
      const timeAgo = getTimeAgo(conv.last_message_at);
      const isActive = currentCustomerId === conv.customer_id;

      return `
        <div class="conversation-item ${isActive ? 'active' : ''}" 
             data-customer-id="${conv.customer_id}"
             onclick="selectConversation('${conv.customer_id}', '${escapeHtml(conv.name)}', '${escapeHtml(conv.email)}')">
          <div class="d-flex align-items-start gap-3">
            <div class="conversation-avatar">
              <i class="fa fa-user"></i>
            </div>
            <div class="flex-grow-1" style="min-width: 0;">
              <div class="d-flex justify-content-between align-items-start mb-1">
                <h6 class="mb-0 fw-bold" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;">${escapeHtml(conv.name)}</h6>
                <small class="text-muted" style="flex-shrink: 0; margin-left: 8px;">${timeAgo}</small>
              </div>
              <small class="text-muted d-block" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(conv.email)}</small>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.selectConversation = async function(customerId, name, email) {
    currentCustomerId = customerId;

    // Update UI
    if (chatCustomerName) chatCustomerName.textContent = name;
    if (chatCustomerEmail) chatCustomerEmail.textContent = email;

    // Hide empty state, show chat
    if (emptyState) emptyState.style.display = 'none';
    if (chatContent) chatContent.style.display = 'flex';

    // Mobile: show chat area
    if (conversationsList) conversationsList.classList.add('hide-mobile');
    if (chatArea) chatArea.classList.add('show-mobile');

    // Update active state
    document.querySelectorAll('.conversation-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-customer-id="${customerId}"]`)?.classList.add('active');

    // Load messages
    await loadMessages(customerId);

    // Start auto-refresh
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(() => loadMessages(customerId), 5000);
  };

  async function loadMessages(customerId) {
    if (!customerId) return;

    try {
      const response = await fetch(`/api/admin/customer-messages/${customerId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to load messages');

      const data = await response.json();
      const messages = data.messages || [];

      renderMessages(messages);
    } catch (error) {
      console.error('Error loading messages:', error);
      if (chatMessages) {
        chatMessages.innerHTML = '<div class="alert alert-danger">Failed to load messages</div>';
      }
    }
  }

  function renderMessages(messages) {
    if (!chatMessages) return;

    if (!messages || messages.length === 0) {
      chatMessages.innerHTML = `
        <div class="text-center text-muted py-4">
          <i class="fa fa-comments fa-2x mb-3 opacity-50"></i>
          <p>No messages yet</p>
        </div>
      `;
      return;
    }

    const scrollAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop <= chatMessages.clientHeight + 50;

    chatMessages.innerHTML = messages.map(msg => {
      const isSeller = msg.sender_type === 'seller';
      const time = new Date(msg.created_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      const senderName = isSeller ? 'You (Seller)' : msg.customers?.name || 'Customer';
      const avatarIcon = isSeller ? '<i class="fa fa-store"></i>' : '<i class="fa fa-user"></i>';

      // Product card (customer inquiry)
      let productCard = '';
      if (msg.products && msg.products.id) {
        productCard = `
          <div class="product-inquiry-card">
            <img src="${escapeHtml(msg.products.image_url || '/flowers/default.jpg')}" alt="${escapeHtml(msg.products.name)}">
            <div class="product-inquiry-info">
              <strong>${escapeHtml(msg.products.name)}</strong>
              <small><i class="fa fa-tag"></i> Product Inquiry</small>
            </div>
          </div>
        `;
      }

      // Broadcast attachment (product or announcement from seller)
      let broadcastCard = '';
      if (msg.sender_type === 'seller' && msg.product_id) {
        broadcastCard = `
          <div class="broadcast-attachment d-flex align-items-center" data-product-id="${msg.product_id}" style="cursor: pointer;">
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
      } else if (msg.sender_type === 'seller' && (msg.message?.trim().startsWith('{') || msg.message?.includes('Announcement') || msg.message?.includes('announcement'))) {
        let announcementTitle = '';
        let announcementDesc = '';

        if (msg.message?.trim().startsWith('{')) {
          try {
            const data = JSON.parse(msg.message);
            announcementTitle = data.title || 'Announcement';
            announcementDesc = data.description || '';
          } catch (e) {
            announcementTitle = 'Announcement';
            announcementDesc = msg.message || '';
          }
        } else {
          announcementTitle = 'Announcement';
          announcementDesc = msg.message || '';
        }

        broadcastCard = `
          <div class="broadcast-attachment" style="cursor: default;">
            <div class="attachment-icon">
              <i class="fa fa-bullhorn"></i>
            </div>
            <div class="attachment-content">
              <div class="attachment-title">${escapeHtml(announcementTitle)}</div>
              <div class="attachment-subtitle">${escapeHtml(announcementDesc)}</div>
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
        <div class="chat-message-wrapper ${isSeller ? 'customer' : 'seller'}">
          <div class="chat-avatar ${isSeller ? 'customer' : 'seller'}">${avatarIcon}</div>
          <div class="chat-message-content">
            <div class="chat-sender-name">${senderName}</div>
            ${broadcastCard}
            ${broadcastCard ? '' : productCard}
            ${broadcastCard ? '' : `
              <div class="chat-bubble ${isSeller ? 'customer' : 'seller'}">
                <div>${escapeHtml(msg.message)}</div>
                <span class="chat-time">${time}</span>
              </div>
            `}
            ${imageHTML}
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers for product broadcast cards
    document.querySelectorAll('.broadcast-attachment[data-product-id]').forEach(card => {
      card.addEventListener('click', () => {
        const productId = card.getAttribute('data-product-id');
        if (productId) {
          window.open(`/index.html?product=${productId}`, '_blank');
        }
      });
    });

    if (scrollAtBottom) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  // Send message
  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const message = chatInput.value.trim();
      if (!message || !currentCustomerId) return;

      const submitBtn = chatForm.querySelector('button[type="submit"]');
      const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
      }

      try {
        let body;
        let headers = {
          'Authorization': `Bearer ${token}`
        };

        if (selectedImage) {
          const formData = new FormData();
          formData.append('message', message);
          formData.append('customer_id', currentCustomerId);
          formData.append('image', selectedImage);
          body = formData;
        } else {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify({
            message: message,
            customer_id: currentCustomerId
          });
        }

        const response = await fetch('/api/admin/customer-messages/send', {
          method: 'POST',
          headers: headers,
          body: body
        });

        if (!response.ok) throw new Error('Failed to send message');

        chatInput.value = '';
        selectedImage = null;
        if (imageInput) imageInput.value = '';
        window.removeImagePreview();

        await loadMessages(currentCustomerId);
      } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
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
              <img src="${imageUrl}" alt="Full size" style="max-width: 100%; height: auto;">
            </div>
          </div>
        </div>
      </div>
    `;

    const existingModal = document.getElementById('imageViewModal');
    if (existingModal) {
      existingModal.remove();
    }

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = new bootstrap.Modal(document.getElementById('imageViewModal'));
    modal.show();

    document.getElementById('imageViewModal').addEventListener('hidden.bs.modal', function() {
      this.remove();
    });
  };

  // Helper functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getTimeAgo(dateString) {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return past.toLocaleDateString();
  }

  // Initial load
  await loadConversations();

  // Refresh conversations every 30 seconds
  setInterval(loadConversations, 30000);
});
