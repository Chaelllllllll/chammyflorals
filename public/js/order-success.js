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
    setText('os-total', data.total_fee || '-');
    setText('os-status', data.status || '-');
    // wire save button in navbar (no footer should be included in the saved image)
    const saveBtn = document.getElementById('saveOrderBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        try {
          // create canvas and draw order details
          const width = 1200, height = 420;
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          // background gradient
          const g = ctx.createLinearGradient(0,0,0,height);
          g.addColorStop(0, '#fff7fb');
          g.addColorStop(1, '#ffeef6');
          ctx.fillStyle = g;
          ctx.fillRect(0,0,width,height);
          // header
          ctx.fillStyle = '#333';
          ctx.font = 'bold 36px Arial';
          ctx.fillText('Chammy Florals - Order Receipt', 40, 70);
          // order details
          ctx.font = '20px Arial';
          const lines = [
            `Tracking ID: ${data.orderId || data.order_id || orderId}`,
            `Flower Type: ${data.flower_type || '-'}`,
            `Quantity: ${data.quantity || '-'}`,
            `Total Fee: ₱${data.total_fee || '-'}`,
            `Status: ${data.status || '-'}`,
          ];
          ctx.fillStyle = '#111';
          let y = 140;
          lines.forEach((line, i) => {
            ctx.font = i === 0 ? 'bold 28px Arial' : '20px Arial';
            ctx.fillText(line, 60, y);
            y += 50;
          });
          // intentionally do NOT draw the page footer in the saved image
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
