// Dashboard Chat System - Direct messaging for authenticated users
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard chat initializing...');
    
    const floatingChatBtn = document.getElementById('floatingChatBtn');
    const chatModal = document.getElementById('chatModal');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');

    console.log('Elements found:', {
        floatingChatBtn: !!floatingChatBtn,
        chatModal: !!chatModal,
        chatForm: !!chatForm,
        chatInput: !!chatInput,
        chatMessages: !!chatMessages
    });

    let chatInterval = null;
    let lastMessageId = null;
    let customerId = null;

    // Check authentication - use 'auth_token' key to match dashboard.js
    const token = localStorage.getItem('auth_token');
    console.log('Token found:', !!token);
    
    if (!token) {
        // Hide chat button if not logged in
        if (floatingChatBtn) {
            floatingChatBtn.style.display = 'none';
        }
        console.log('No token, chat button hidden');
        return;
    }

    // Get customer ID from token
    try {
        if (token && token.split('.').length === 3) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            customerId = payload.id || payload.sub || payload.customerId;
        }
    } catch (error) {}

    // Floating chat button click handler
    if (floatingChatBtn && chatModal) {
        console.log('Attaching click handler to floating chat button');
        
        // The button now uses data-bs-toggle, so Bootstrap handles opening
        // We just need to load messages when it opens
        chatModal.addEventListener('shown.bs.modal', () => {
            console.log('Chat modal opened');
            loadMessages();
            
            // Start auto-refresh
            if (chatInterval) clearInterval(chatInterval);
            chatInterval = setInterval(loadMessages, 10000);
        });

        // Stop auto-refresh when modal closes
        chatModal.addEventListener('hidden.bs.modal', () => {
            console.log('Chat modal closed');
            if (chatInterval) {
                clearInterval(chatInterval);
                chatInterval = null;
            }
        });
        
        console.log('Chat button is visible and ready');
    } else {
        console.error('Missing elements:', {
            floatingChatBtn: !floatingChatBtn,
            chatModal: !chatModal
        });
    }

    // Load messages function
    async function loadMessages() {
        console.log('Loading messages...', { chatMessages: !!chatMessages, customerId });
        if (!chatMessages || !customerId) return;

        try {
            console.log('Fetching messages from /api/customer-chat');
            const response = await fetch('/api/customer-chat', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('Response status:', response.status);
            const data = await response.json();
            console.log('Response data:', data);

            if (response.ok && data.messages) {
                console.log('Messages loaded:', data.messages.length);
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
                        
                        return `
                            <div class="chat-message-wrapper ${isCustomer ? 'customer' : 'seller'}">
                                <div class="chat-avatar ${isCustomer ? 'customer' : 'seller'}">${avatarIcon}</div>
                                <div class="chat-message-content">
                                    <div class="chat-sender-name">${senderName}</div>
                                    <div class="chat-bubble ${isCustomer ? 'customer' : 'seller'}" onclick="this.classList.toggle('show-time')">
                                        <div>${escapeHtml(msg.message)}</div>
                                        <span class="chat-time">${time}</span>
                                    </div>
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
                }
            } else {
                console.error('Failed to load messages:', data);
                chatMessages.innerHTML = `
                    <div class="chat-empty">
                        <i class="fa fa-exclamation-triangle me-2"></i>Failed to load messages. ${data.error || ''}
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading messages:', error);
            chatMessages.innerHTML = `
                <div class="chat-empty">
                    <i class="fa fa-exclamation-triangle me-2"></i>Error loading messages.
                </div>
            `;
        }
    }

    // Send message
    if (chatForm) {
        console.log('Attaching submit handler to chat form');
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Chat form submitted');
            
            const message = chatInput.value.trim();
            console.log('Message:', message);
            if (!message || !customerId) {
                console.log('No message or customer ID');
                return;
            }

            const submitBtn = chatForm.querySelector('button[type="submit"]');
            const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
            
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
            }

            try {
                console.log('Sending message to /api/customer-chat/send');
                const response = await fetch('/api/customer-chat/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        message: message
                    })
                });

                console.log('Send response status:', response.status);
                const result = await response.json();
                console.log('Send response data:', result);

                if (response.ok) {
                    chatInput.value = '';
                    await loadMessages();
                } else {
                    console.error('Failed to send:', result);
                    alertError(result.error || 'Failed to send message');
                }
            } catch (error) {
                console.error('Error sending message:', error);
                alertError('Failed to send message. Please try again.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnHtml;
                }
            }
        });
    } else {
        console.error('Chat form not found!');
    }

    // Escape HTML helper
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
