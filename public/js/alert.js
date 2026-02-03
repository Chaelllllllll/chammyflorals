/**
 * Custom Badge-Style Alert Notification System
 * Replaces native JavaScript alert() with modern toast notifications
 */

(function() {
  // Container for all alerts
  let alertContainer = null;
  
  // Alert counter for unique IDs
  let alertCounter = 0;
  
  // Maximum number of visible alerts
  const MAX_ALERTS = 5;
  
  /**
   * Initialize the alert container
   */
  function initAlertContainer() {
    if (!alertContainer) {
      alertContainer = document.createElement('div');
      alertContainer.id = 'custom-alert-container';
      alertContainer.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 400px;
        pointer-events: none;
      `;
      document.body.appendChild(alertContainer);
    }
  }
  
  /**
   * Get icon and colors for alert type
   */
  function getAlertStyle(type) {
    const styles = {
      success: {
        icon: 'fa-check-circle',
        gradient: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
        color: '#fff'
      },
      error: {
        icon: 'fa-exclamation-circle',
        gradient: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
        color: '#fff'
      },
      danger: {
        icon: 'fa-exclamation-triangle',
        gradient: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
        color: '#fff'
      },
      warning: {
        icon: 'fa-exclamation-triangle',
        gradient: 'linear-gradient(135deg, #ffc107 0%, #ff9800 100%)',
        color: '#fff'
      },
      info: {
        icon: 'fa-info-circle',
        gradient: 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)',
        color: '#fff'
      },
      default: {
        icon: 'fa-bell',
        gradient: 'linear-gradient(135deg, #ff6f9b 0%, #ff5a87 100%)',
        color: '#fff'
      }
    };
    
    return styles[type] || styles.default;
  }
  
  /**
   * Show custom alert
   * @param {string} message - Alert message
   * @param {string} type - Alert type (success, error, warning, info)
   * @param {number} duration - Auto-dismiss duration in milliseconds (0 = no auto-dismiss)
   */
  function showAlert(message, type = 'default', duration = 5000) {
    initAlertContainer();
    
    // Limit number of visible alerts
    const existingAlerts = alertContainer.querySelectorAll('.custom-alert');
    if (existingAlerts.length >= MAX_ALERTS) {
      // Remove oldest alert
      const oldestAlert = existingAlerts[0];
      removeAlert(oldestAlert);
    }
    
    const alertId = `alert-${alertCounter++}`;
    const style = getAlertStyle(type);
    
    // Create alert element
    const alertEl = document.createElement('div');
    alertEl.id = alertId;
    alertEl.className = 'custom-alert';
    alertEl.style.cssText = `
      background: ${style.gradient};
      color: ${style.color};
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 300px;
      max-width: 400px;
      pointer-events: auto;
      animation: slideInRight 0.3s ease-out;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    `;
    
    // Add ripple effect background
    const ripple = document.createElement('div');
    ripple.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.1);
      opacity: 0;
      transition: opacity 0.2s;
    `;
    alertEl.appendChild(ripple);
    
    // Alert content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = 'display: flex; align-items: center; gap: 12px; flex: 1; position: relative; z-index: 1;';
    
    // Icon
    const icon = document.createElement('i');
    icon.className = `fa ${style.icon}`;
    icon.style.cssText = 'font-size: 24px; flex-shrink: 0;';
    contentWrapper.appendChild(icon);
    
    // Message
    const messageEl = document.createElement('div');
    messageEl.style.cssText = 'flex: 1; font-size: 14px; line-height: 1.4; word-break: break-word;';
    messageEl.textContent = message;
    contentWrapper.appendChild(messageEl);
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: ${style.color};
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      opacity: 0.8;
      transition: opacity 0.2s;
      position: relative;
      z-index: 1;
    `;
    closeBtn.addEventListener('mouseover', () => closeBtn.style.opacity = '1');
    closeBtn.addEventListener('mouseout', () => closeBtn.style.opacity = '0.8');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeAlert(alertEl);
    });
    contentWrapper.appendChild(closeBtn);
    
    alertEl.appendChild(contentWrapper);
    
    // Progress bar for auto-dismiss
    if (duration > 0) {
      const progressBar = document.createElement('div');
      progressBar.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: rgba(255, 255, 255, 0.5);
        width: 100%;
        transform-origin: left;
        animation: shrinkProgress ${duration}ms linear;
      `;
      alertEl.appendChild(progressBar);
    }
    
    // Hover effects
    alertEl.addEventListener('mouseenter', () => {
      alertEl.style.transform = 'translateX(-5px)';
      alertEl.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';
      ripple.style.opacity = '1';
    });
    
    alertEl.addEventListener('mouseleave', () => {
      alertEl.style.transform = 'translateX(0)';
      alertEl.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.2)';
      ripple.style.opacity = '0';
    });
    
    // Click to dismiss
    alertEl.addEventListener('click', () => {
      removeAlert(alertEl);
    });
    
    // Add to container
    alertContainer.appendChild(alertEl);
    
    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        removeAlert(alertEl);
      }, duration);
    }
    
    return alertEl;
  }
  
  /**
   * Remove alert with animation
   */
  function removeAlert(alertEl) {
    if (!alertEl || !alertEl.parentElement) return;
    
    alertEl.style.animation = 'slideOutRight 0.3s ease-in';
    alertEl.style.opacity = '0';
    
    setTimeout(() => {
      if (alertEl.parentElement) {
        alertEl.parentElement.removeChild(alertEl);
      }
    }, 300);
  }
  
  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
    
    @keyframes shrinkProgress {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
    }
    
    /* Mobile responsive */
    @media (max-width: 768px) {
      #custom-alert-container {
        left: 10px;
        right: 10px;
        bottom: 10px;
        max-width: none;
      }
      
      .custom-alert {
        min-width: auto !important;
        max-width: none !important;
      }
    }
  `;
  document.head.appendChild(style);
  
  // Expose to global scope
  window.showAlert = showAlert;
  
  // Alias for common patterns
  window.alertSuccess = (msg, duration) => showAlert(msg, 'success', duration);
  window.alertError = (msg, duration) => showAlert(msg, 'error', duration);
  window.alertWarning = (msg, duration) => showAlert(msg, 'warning', duration);
  window.alertInfo = (msg, duration) => showAlert(msg, 'info', duration);
})();
