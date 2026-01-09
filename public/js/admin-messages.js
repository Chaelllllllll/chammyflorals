document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('adminToken');
  
  if (!token) {
    alert('Please log in first');
    window.location.href = '/admin/login.html';
    return;
  }

  let currentOrderId = null;
  let chatRefreshInterval = null;
  let allOrders = [];
  let lastMessageCounts = {};

  // Initialize notifications and request permission for admin
  if (window.chatNotifications) {
    window.chatNotifications.init().then(() => {
      // Auto-request permission for admin users
      if (Notification.permission !== 'granted') {
        window.chatNotifications.requestPermission();
      }
    });
  }

  // Elements
  const ordersListContent = document.getElementById('ordersListContent');
  const chatArea = document.getElementById('chatArea');
  const emptyState = document.getElementById('emptyState');
  const chatContent = document.getElementById('chatContent');
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatOrderId = document.getElementById('chatOrderId');
  const chatOrderStatus = document.getElementById('chatOrderStatus');
  const backToList = document.getElementById('backToList');
  const ordersList = document.getElementById('ordersList');

  // Mobile back button
  if (backToList) {
    backToList.addEventListener('click', () => {
      ordersList.classList.remove('hide-mobile');
      chatArea.classList.remove('show-mobile');
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logoutButton');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login.html';
    });
  }

  // Helper function
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Load all orders
  async function loadOrders() {
    try {
      const response = await fetch('/api/admin/orders', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to load orders');
      }

      const orders = await response.json();
      const undeliveredOrders = orders.filter(o => o.status !== 'Delivered');

      // Group orders by customer_id to show unique customers
      const customerMap = new Map();
      
      for (const order of undeliveredOrders) {
        const customerId = order.customer_id;
        
        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customer_id: customerId,
            customer_name: order.customer_name || order.name || 'Customer',
            customer_email: order.customer_email || order.email,
            orders: [],
            totalMessages: 0,
            lastMessage: null,
            lastMessageTime: null
          });
        }
        
        customerMap.get(customerId).orders.push(order);
      }

      // Get message counts for each customer's orders
      allOrders = [];
      
      for (const [customerId, customerData] of customerMap) {
        let totalMessages = 0;
        let lastMessage = null;
        let lastMessageTime = null;
        
        for (const order of customerData.orders) {
          try {
            const chatResponse = await fetch(`/api/chat/${encodeURIComponent(order.order_id)}`);
            if (chatResponse.ok) {
              const chatData = await chatResponse.json();
              if (chatData.messages && chatData.messages.length > 0) {
                totalMessages += chatData.messages.length;
                const orderLastMsg = chatData.messages[chatData.messages.length - 1];
                
                if (!lastMessageTime || new Date(orderLastMsg.created_at) > new Date(lastMessageTime)) {
                  lastMessage = orderLastMsg;
                  lastMessageTime = orderLastMsg.created_at;
                }
              }
            }
          } catch (err) {
            console.error('Error loading chat for order:', order.order_id, err);
          }
        }
        
        // Only add customers who have sent messages
        if (totalMessages > 0) {
          allOrders.push({
            customer_id: customerId,
            customer_name: customerData.customer_name,
            customer_email: customerData.customer_email,
            orders: customerData.orders,
            messageCount: totalMessages,
            lastMessage,
            // Use first order's ID for initial chat display
            order_id: customerData.orders[0].order_id
          });
        }
      }

      // Sort by last message time (most recent first)
      allOrders.sort((a, b) => {
        if (!a.lastMessage) return 1;
        if (!b.lastMessage) return -1;
        return new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at);
      });

      displayOrders();
    } catch (error) {
      console.error('Error loading orders:', error);
      ordersListContent.innerHTML = '<div class="alert alert-danger m-3">Failed to load orders</div>';
    }

    // Check for new messages and show notifications
    if (window.chatNotifications && allOrders.length > 0) {
      window.chatNotifications.checkNewMessages(allOrders, currentOrderId);
    }
  }

  // Display orders list
  function displayOrders() {
    if (allOrders.length === 0) {
      ordersListContent.innerHTML = `
        <div class="text-center text-muted py-4">
          <i class="fas fa-inbox"></i>
          <p class="mt-2">No customers with active orders</p>
        </div>
      `;
      return;
    }

    ordersListContent.innerHTML = allOrders.map(customer => {
      const lastMsg = customer.lastMessage 
        ? escapeHtml(customer.lastMessage.message) 
        : 'No messages yet';
      
      const orderCount = customer.orders.length;
      const orderText = orderCount === 1 ? '1 order' : `${orderCount} orders`;
      
      return `
        <div class="order-item ${currentOrderId === customer.order_id ? 'active' : ''}" data-order-id="${customer.order_id}" data-customer-id="${customer.customer_id}">
          <div class="d-flex justify-content-between align-items-start">
            <div style="flex: 1;">
              <div class="order-id">
                <i class="fa fa-user me-1"></i>${escapeHtml(customer.customer_name)}
              </div>
              <div class="order-status" style="font-size: 11px;">
                <i class="fa fa-envelope me-1"></i>${escapeHtml(customer.customer_email || '')} • ${orderText}
              </div>
              <div class="message-preview">${lastMsg}</div>
            </div>
            ${customer.messageCount > 0 ? `<span class="message-count">${customer.messageCount}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers
    document.querySelectorAll('.order-item').forEach(item => {
      item.addEventListener('click', () => {
        const orderId = item.dataset.orderId;
        selectOrder(orderId);
      });
    });
  }

  // Select an order
  function selectOrder(orderId) {
    currentOrderId = orderId;
    const order = allOrders.find(o => o.order_id === orderId);
    
    if (!order) return;

    const customerName = order.customer_name || order.name || 'Customer';

    // Update UI
    displayOrders(); // Refresh to show active state
    emptyState.style.display = 'none';
    chatContent.style.display = 'flex';
    chatOrderId.textContent = customerName;
    chatOrderStatus.textContent = order.order_id;

    // Mobile: hide list, show chat
    ordersList.classList.add('hide-mobile');
    chatArea.classList.add('show-mobile');

    // Load messages
    loadMessages();

    // Start auto-refresh
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(loadMessages, 10000);
  }

  // Load messages for current order
  async function loadMessages() {
    if (!currentOrderId) return;

    try {
      const response = await fetch(`/api/chat/${encodeURIComponent(currentOrderId)}`);
      const data = await response.json();

      if (response.ok && data.messages) {
        // Check for new customer messages and trigger notification
        const storedLastMsgId = localStorage.getItem(`adminLastMsg_${currentOrderId}`);
        
        if (data.messages.length > 0) {
          const lastMessage = data.messages[data.messages.length - 1];
          
          // If there's a new customer message, notify admin
          if (storedLastMsgId && lastMessage.id !== parseInt(storedLastMsgId) && 
              lastMessage.sender_type === 'customer') {
            const order = allOrders.find(o => o.order_id === currentOrderId);
            const customerName = order ? (order.customer_name || 'Customer') : 'Customer';
            
            if (window.notificationManager) {
              window.notificationManager.notifyNewMessage(
                lastMessage.message,
                customerName
              );
            }
          }
          
          // Update stored last message ID
          localStorage.setItem(`adminLastMsg_${currentOrderId}`, lastMessage.id);
        }
        
        if (data.messages.length === 0) {
          chatMessages.innerHTML = `
            <div class="text-center text-muted py-4">
              <i class="fas fa-comments me-2"></i>No messages yet. Start the conversation!
            </div>
          `;
        } else {
          const scrollAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop <= chatMessages.clientHeight + 50;

          chatMessages.innerHTML = data.messages.map((msg, index) => {
            const isAdmin = msg.sender_type === 'admin';
            const time = new Date(msg.created_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            });
            const senderName = isAdmin ? 'You' : 'Customer';
            const avatarIcon = isAdmin ? '<i class="fas fa-user-shield"></i>' : '<i class="fas fa-user"></i>';
            
            return `
              <div class="chat-message-wrapper ${isAdmin ? 'customer' : 'seller'}">
                <div class="chat-avatar ${isAdmin ? 'customer' : 'seller'}">${avatarIcon}</div>
                <div class="chat-message-content">
                  <div class="chat-sender-name">${senderName}</div>
                  <div class="chat-bubble ${isAdmin ? 'customer' : 'seller'}" onclick="this.classList.toggle('show-time')">
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
        }
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  // Send message
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentOrderId) return;

    const message = chatInput.value.trim();
    if (!message) return;

    const submitBtn = chatForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    // Optimistic append
    const pendingId = `pending-${Date.now()}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message-wrapper customer';
    wrapper.innerHTML = `
      <div class="chat-avatar customer"><i class="fas fa-user-shield"></i></div>
      <div class="chat-message-content">
        <div class="chat-sender-name">You</div>
        <div class="chat-bubble customer" data-pending="${pendingId}">
          <div>${escapeHtml(message)}</div>
        </div>
      </div>
    `;
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          order_id: currentOrderId,
          message: message,
          sender_type: 'admin'
        })
      });

      const result = await response.json();

      if (response.ok) {
        chatInput.value = '';
        await loadMessages();
        await loadOrders(); // Refresh orders list
      } else {
        alert(result.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      const pending = document.querySelector(`[data-pending="${pendingId}"]`);
      if (pending && pending.parentElement && pending.parentElement.parentElement) {
        pending.parentElement.parentElement.remove();
      }
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  });

  // Initial load
  await loadOrders();

  // Auto-refresh orders list every 10 seconds
  setInterval(loadOrders, 10000);

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
  });
});
