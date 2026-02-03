// small currency formatter used by the receipt canvas
function formatPHP(n) {
  try {
    const num = Number(n) || 0;
    if (typeof Intl !== 'undefined' && Intl.NumberFormat) {
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(num);
    }
    return '₱' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch (e) { return '₱0.00'; }
}

// normalize color field which may be a string or an object
function formatColor(c) {
  try {
    if (c == null) return '';
    if (typeof c === 'string') return c;
    if (typeof c === 'object') {
      return c.name || c.label || c.value || (c.toString && c.toString()) || '';
    }
    return String(c);
  } catch (e) { return '' }
}

// order-success page JS: fetch order details and populate the page
(async function(){
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('orderId');
  const contentEl = document.getElementById('orderContent');
  if (!orderId) {
    if (contentEl) contentEl.innerHTML = '<div class="alert alert-warning">No order specified. <a href="/">Go back</a></div>';
    return;
  }
  try {
    const res = await fetch(`/api/track/${encodeURIComponent(orderId)}`);
    if (!res.ok) throw new Error('Order not found');
    const data = await res.json();
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val == null ? '-' : String(val); };
    setText('os-order-id', data.orderId || data.order_id || orderId);

    // Helper function to get color value (hex or rgb)
    function getColorValue(colorData) {
      if (!colorData) return null;

      // If it's an object with value/hex/color property
      if (typeof colorData === 'object') {
        return colorData.value || colorData.hex || colorData.color || null;
      }

      // If it's a string that looks like a color code
      if (typeof colorData === 'string') {
        const str = colorData.trim();
        // Check if it's hex or rgb
        if (str.startsWith('#') || str.startsWith('rgb')) {
          return str;
        }
      }

      return null;
    }

    // Display all items
    const itemsListEl = document.getElementById('os-items-list');
    let totalQuantity = 0;

    if (itemsListEl) {
      let itemsHtml = '';

      if (Array.isArray(data.items) && data.items.length) {
        // Show all items
        data.items.forEach((item, idx) => {
          const itemName = item.name || item.flower_type || 'Item';
          const itemColorName = formatColor(item.color || item.color_name || item.colorType || '');
          const itemColorValue = getColorValue(item.color || item.color_name || item.colorType);
          const qty = item.quantity || item.qty || 1;
          totalQuantity += qty;

          // Create color swatch if we have a color value
          let colorDisplay = '';
          if (itemColorValue) {
            colorDisplay = `
              <span class="d-inline-flex align-items-center gap-1 ms-2">
                <span class="d-inline-block rounded-circle border" style="width: 16px; height: 16px; background: ${itemColorValue};"></span>
                <span class="badge bg-white text-dark border">${itemColorName}</span>
              </span>
            `;
          } else if (itemColorName) {
            colorDisplay = `<span class="badge bg-white text-dark border ms-2">${itemColorName}</span>`;
          }

          itemsHtml += `
            <div class="d-flex justify-content-between align-items-center p-2 bg-light rounded mb-2">
              <div class="d-flex align-items-center">
                <span class="badge bg-pink text-white me-2">${idx + 1}</span>
                <span class="fw-semibold">${itemName}</span>
                ${colorDisplay}
              </div>
              <div class="text-muted">×${qty}</div>
            </div>
          `;
        });
      } else {
        // Fallback to old format
        const itemName = data.flower_type || 'Item';
        const itemColorName = formatColor(data.color || data.color_name || '');
        const itemColorValue = getColorValue(data.color || data.color_name);
        const qty = data.quantity || 1;
        totalQuantity = qty;

        // Create color swatch if we have a color value
        let colorDisplay = '';
        if (itemColorValue) {
          colorDisplay = `
            <span class="d-inline-flex align-items-center gap-1 ms-2">
              <span class="d-inline-block rounded-circle border" style="width: 16px; height: 16px; background: ${itemColorValue};"></span>
              <span class="badge bg-white text-dark border">${itemColorName}</span>
            </span>
          `;
        } else if (itemColorName) {
          colorDisplay = `<span class="badge bg-white text-dark border ms-2">${itemColorName}</span>`;
        }

        itemsHtml = `
          <div class="d-flex justify-content-between align-items-center p-2 bg-light rounded mb-2">
            <div class="d-flex align-items-center">
              <span class="badge bg-pink text-white me-2">1</span>
              <span class="fw-semibold">${itemName}</span>
              ${colorDisplay}
            </div>
            <div class="text-muted">×${qty}</div>
          </div>
        `;
      }

      itemsListEl.innerHTML = itemsHtml;
    }

    // Set total quantity
    setText('os-total-quantity', totalQuantity);

    // Set total amount
    setText('os-total', (typeof data.total_fee !== 'undefined' && data.total_fee !== null) ? formatPHP(data.total_fee).replace(/^[^0-9-]+/, '') : '-');

    // Set status with appropriate badge color
    const statusEl = document.getElementById('os-status');
    if (statusEl) {
      const status = data.status || 'pending';
      statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      // Update badge color based on status
      statusEl.className = 'badge';
      if (status === 'completed' || status === 'delivered') {
        statusEl.classList.add('bg-success');
      } else if (status === 'processing' || status === 'confirmed') {
        statusEl.classList.add('bg-primary');
      } else if (status === 'cancelled' || status === 'rejected') {
        statusEl.classList.add('bg-danger');
      } else {
        statusEl.classList.add('bg-warning', 'text-dark');
      }
    }
    // wire track link to this order
    const trackLink = document.getElementById('trackLink');
    if (trackLink) {
      const idForLink = data.orderId || data.order_id || orderId;
      // navigate to the homepage with the orderId query so the site's Track modal (on index.html)
      // will auto-open and show the order details. There is no standalone track.html in /public.
      trackLink.href = `/?orderId=${encodeURIComponent(idForLink)}`;
    }
    // wire messenger track info (link and chat guide)
    const messengerCode = document.getElementById('os-messenger-code');
    if (messengerCode) {
      const idForCode = data.orderId || data.order_id || orderId;
      messengerCode.textContent = `track ${idForCode}`;
    }
    const messengerLink = document.getElementById('os-messenger-link');
    if (messengerLink) {
      messengerLink.href = 'https://www.messenger.com/t/847673415097754';
    }
    // Optional: Show track prompt modal after 8 seconds (less intrusive)
    // Users can also access Messenger link directly from the page
    try {
      const idForCode = data.orderId || data.order_id || orderId;
      const promptCodeEl = document.getElementById('trackPromptCode');
      if (promptCodeEl) promptCodeEl.textContent = `track ${idForCode}`;
      const confirmBtn = document.getElementById('trackPromptConfirm');
      const modalEl = document.getElementById('trackPromptModal');
      if (modalEl && confirmBtn) {
        // Show after 8 seconds (give user time to read the page first)
        // Only show if user hasn't left the page
        setTimeout(() => {
          try {
            // Check if user is still on the page
            if (document.hasFocus()) {
              const m = new bootstrap.Modal(modalEl);
              m.show();
            }
            // Wire confirm button to open Messenger
            const onConfirm = () => {
              const target = (messengerLink && messengerLink.href) ? messengerLink.href : 'https://www.messenger.com/t/847673415097754';
              window.open(target, '_blank'); // Open in new tab instead of redirecting
              // Close modal
              const modalInstance = bootstrap.Modal.getInstance(modalEl);
              if (modalInstance) modalInstance.hide();
            };
            confirmBtn.addEventListener('click', onConfirm, { once: true });
          } catch (e) { /* ignore */ }
        }, 8000); // Increased from 3s to 8s
      }
    } catch (modalErr) {}
    // wire save button in navbar (no footer should be included in the saved image)
    const saveBtn = document.getElementById('saveOrderBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        try {
          // create canvas and draw order details (hi-dpi aware)
          const cssWidth = 1200, cssHeight = 600;
          const dpr = window.devicePixelRatio || 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(cssWidth * dpr);
          canvas.height = Math.round(cssHeight * dpr);
          canvas.style.width = cssWidth + 'px';
          canvas.style.height = cssHeight + 'px';
          const ctx = canvas.getContext('2d');
          ctx.scale(dpr, dpr);

          // outer background (soft pink)
          const g = ctx.createLinearGradient(0,0,0,cssHeight);
          g.addColorStop(0, '#fffafc');
          g.addColorStop(1, '#fff1f6');
          ctx.fillStyle = g;
          ctx.fillRect(0,0,cssWidth,cssHeight);

          // card area
          const pad = 40;
          const cardW = cssWidth - pad*2;
          const cardH = cssHeight - pad*2;
          const cardX = pad, cardY = pad;
          // white card with subtle shadow
          ctx.fillStyle = '#ffffff';
          roundRect(ctx, cardX, cardY, cardW, cardH, 14, true, false);
          ctx.shadowColor = 'rgba(15,23,42,0.06)';
          ctx.shadowBlur = 18;
          // header text
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = '#3a2b33';
          ctx.font = '700 28px Arial';
          ctx.fillText('Chammy Florals', cardX + 28, cardY + 48);
          ctx.fillStyle = '#ff6f9b';
          ctx.font = '700 20px Arial';
          ctx.fillText('Order Receipt', cardX + 28, cardY + 78);

          // divider
          ctx.strokeStyle = 'rgba(16,24,40,0.06)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cardX+20, cardY+92); ctx.lineTo(cardX+cardW-20, cardY+92); ctx.stroke();

          // details left column
          ctx.fillStyle = '#111';
          ctx.font = '600 18px Arial';
          let y = cardY + 124;
          const leftX = cardX + 28;
          const detailLineHeight = 28;
          const orderIdText = `Tracking ID: ${data.orderId || data.order_id || orderId}`;
          ctx.fillText(orderIdText, leftX, y); y += detailLineHeight + 6;

          // Status
          ctx.font = '16px Arial';
          ctx.fillStyle = '#333';
          ctx.fillText(`Status: ${data.status || 'Pending'}`, leftX, y); y += detailLineHeight + 10;

          // Helper function to get color value for canvas
          function getColorValueForCanvas(colorData) {
            if (!colorData) return null;

            if (typeof colorData === 'object') {
              return colorData.value || colorData.hex || colorData.color || null;
            }

            if (typeof colorData === 'string') {
              const str = colorData.trim();
              if (str.startsWith('#') || str.startsWith('rgb')) {
                return str;
              }
            }

            return null;
          }

          // Items section
          ctx.font = '600 16px Arial';
          ctx.fillStyle = '#111';
          ctx.fillText('Order Items:', leftX, y); y += detailLineHeight;

          ctx.font = '14px Arial';
          ctx.fillStyle = '#333';

          let totalQuantity = 0;

          if (Array.isArray(data.items) && data.items.length) {
            // Show all items with quantities and color swatches
            data.items.forEach((it, idx) => {
              const name = it.name || it.flower_type || 'Item';
              const colorName = formatColor(it.color || it.color_name || it.colorType || '');
              const colorValue = getColorValueForCanvas(it.color || it.color_name || it.colorType);
              const qty = it.quantity || it.qty || 1;
              totalQuantity += qty;

              // Draw item number and name
              const label = `${idx + 1}. ${name}`;
              ctx.fillText(label, leftX + 10, y);

              // Draw color swatch if available
              if (colorValue) {
                const swatchX = leftX + 10 + ctx.measureText(label).width + 8;
                const swatchY = y - 10;

                // Draw color circle
                ctx.fillStyle = colorValue;
                ctx.beginPath();
                ctx.arc(swatchX + 6, swatchY + 6, 6, 0, Math.PI * 2);
                ctx.fill();

                // Draw border
                ctx.strokeStyle = '#ccc';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Draw color name
                ctx.fillStyle = '#666';
                ctx.font = '12px Arial';
                ctx.fillText(`(${colorName})`, swatchX + 16, y);
                ctx.font = '14px Arial';
                ctx.fillStyle = '#333';
              } else if (colorName) {
                // Just show color name if no color value
                const colorTextX = leftX + 10 + ctx.measureText(label).width + 8;
                ctx.fillStyle = '#666';
                ctx.font = '12px Arial';
                ctx.fillText(`(${colorName})`, colorTextX, y);
                ctx.font = '14px Arial';
                ctx.fillStyle = '#333';
              }

              // Draw quantity
              ctx.fillText(`Qty: ${qty}`, leftX + 450, y);
              y += 24;
            });
          } else {
            // Fallback to old format
            const displayName = data.flower_type || 'Item';
            const colorName = formatColor(data.color || data.color_name || '');
            const colorValue = getColorValueForCanvas(data.color || data.color_name);
            const qty = data.quantity || 1;
            totalQuantity = qty;

            // Draw item
            const label = `1. ${displayName}`;
            ctx.fillText(label, leftX + 10, y);

            // Draw color swatch if available
            if (colorValue) {
              const swatchX = leftX + 10 + ctx.measureText(label).width + 8;
              const swatchY = y - 10;

              // Draw color circle
              ctx.fillStyle = colorValue;
              ctx.beginPath();
              ctx.arc(swatchX + 6, swatchY + 6, 6, 0, Math.PI * 2);
              ctx.fill();

              // Draw border
              ctx.strokeStyle = '#ccc';
              ctx.lineWidth = 1;
              ctx.stroke();

              // Draw color name
              ctx.fillStyle = '#666';
              ctx.font = '12px Arial';
              ctx.fillText(`(${colorName})`, swatchX + 16, y);
              ctx.font = '14px Arial';
              ctx.fillStyle = '#333';
            } else if (colorName) {
              const colorTextX = leftX + 10 + ctx.measureText(label).width + 8;
              ctx.fillStyle = '#666';
              ctx.font = '12px Arial';
              ctx.fillText(`(${colorName})`, colorTextX, y);
              ctx.font = '14px Arial';
              ctx.fillStyle = '#333';
            }

            ctx.fillText(`Qty: ${qty}`, leftX + 450, y);
            y += 24;
          }

          // Total quantity
          y += 6;
          ctx.font = '600 15px Arial';
          ctx.fillStyle = '#111';
          ctx.fillText(`Total Quantity: ${totalQuantity}`, leftX + 10, y);
          y += detailLineHeight;

          // right column: total amount
          const rightX = cardX + cardW - 280;
          let ry = cardY + 140;
          ctx.fillStyle = '#6c6c6c'; ctx.font = '14px Arial';
          ctx.fillText('Total Amount', rightX, ry); ry += 30;
          ctx.fillStyle = '#ff6f9b'; ctx.font = '700 32px Arial';
          ctx.fillText(formatPHP(data.total_fee || 0), rightX, ry); ry += 50;

          // download
          const url = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = url;
          a.download = `chammy-order-${(data.orderId||orderId)}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch (err) {
          console.error('Failed to save image:', err);
          alertError('Failed to generate image.');
        }
      });
    }
  } catch (err) {
    if (contentEl) contentEl.innerHTML = '<div class="alert alert-danger">Failed to load order details. <a href="/">Go back</a></div>';
  }
})();

// helper: rounded rectangle
function roundRect(ctx, x, y, w, h, r) {
  const radius = r || 6;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fill();
}
