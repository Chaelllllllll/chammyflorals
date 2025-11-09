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
    setText('os-flower-type', data.flower_type || '-');
    setText('os-quantity', data.quantity || '-');
  setText('os-total', (typeof data.total_fee !== 'undefined' && data.total_fee !== null) ? formatPHP(data.total_fee).replace(/^[^0-9-]+/, '') : '-');
    setText('os-status', data.status || '-');
    // wire track link to this order
    const trackLink = document.getElementById('trackLink');
    if (trackLink) {
      const idForLink = data.orderId || data.order_id || orderId;
      // navigate to the homepage with the orderId query so the site's Track modal (on index.html)
      // will auto-open and show the order details. There is no standalone track.html in /public.
      trackLink.href = `/?orderId=${encodeURIComponent(idForLink)}`;
    }
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
          const detailLineHeight = 34;
          const orderIdText = `Tracking ID: ${data.orderId || data.order_id || orderId}`;
          ctx.fillText(orderIdText, leftX, y); y += detailLineHeight;
          ctx.font = '16px Arial';
          ctx.fillStyle = '#333';
          ctx.fillText(`Flower Type: ${data.flower_type || '-'}`, leftX, y); y += detailLineHeight;
          ctx.fillText(`Quantity: ${data.quantity || '-'}`, leftX, y); y += detailLineHeight;
          ctx.fillText(`Status: ${data.status || '-'}`, leftX, y); y += detailLineHeight;

          // right column: total and CTA
          const rightX = cardX + cardW - 300;
          let ry = cardY + 140;
          ctx.fillStyle = '#6c6c6c'; ctx.font = '14px Arial';
          ctx.fillText('Total', rightX, ry); ry += 30;
          ctx.fillStyle = '#000'; ctx.font = '700 28px Arial';
          ctx.fillText(formatPHP(data.total_fee || 0), rightX, ry); ry += 50;

          // optional items table
          if (Array.isArray(data.items) && data.items.length) {
            ctx.font = '600 16px Arial'; ctx.fillStyle = '#333';
            ctx.fillText('Items', leftX, y + 10); y += 28;
            ctx.font = '14px Arial';
            data.items.forEach(it => {
              const label = `${it.name || it.flower_type || 'Item'} x${it.qty || it.quantity || 1}`;
              ctx.fillText(label, leftX, y);
              ctx.fillText(it.price ? formatPHP(it.price) : '', rightX, y);
              y += 26;
            });
          }

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
          alert('Failed to generate image.');
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
