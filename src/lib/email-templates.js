function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function orderConfirmationTemplate(order) {
  const addons = Array.isArray(order.addons) && order.addons.length ? order.addons.join(', ') : 'None';
  const html = `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2 style="color:#ff69b4">Thank you for your order!</h2>
      <p>Hi ${escapeHtml(order.name)},</p>
      <p>We received your order. Here are the details:</p>
      <ul>
        <li><strong>Order ID:</strong> ${escapeHtml(order.order_id)}</li>
        <li><strong>Flower Type:</strong> ${escapeHtml(order.flower_type)}</li>
        <li><strong>Quantity:</strong> ${escapeHtml(String(order.quantity))}</li>
        <li><strong>Add-ons:</strong> ${escapeHtml(addons)}</li>
        <li><strong>Total Fee:</strong> ₱${escapeHtml(String(order.total_fee))}</li>
        <li><strong>Status:</strong> ${escapeHtml(order.status || 'pending')}</li>
      </ul>
      <p>You can track your order using this Order ID on our website.</p>
      <p style="font-size:0.9em;color:#666">If you have questions, reply to this email or contact our Facebook page.</p>
      <hr />
      <p style="font-size:0.8em;color:#999">Chammy Florals</p>
    </div>
  `;
  return { subject: `Chammy Florals - Order Confirmation (${order.order_id})`, html };
}

function statusUpdateTemplate(order, previousStatus) {
  const html = `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2 style="color:#ff69b4">Order Status Update</h2>
      <p>Hi ${escapeHtml(order.name)},</p>
      <p>Your order <strong>${escapeHtml(order.order_id)}</strong> status has changed.</p>
      <p><strong>Previous status:</strong> ${escapeHtml(previousStatus || 'N/A')}<br/>
      <strong>Current status:</strong> ${escapeHtml(order.status || 'updated')}</p>
      <p><strong>Flower Type:</strong> ${escapeHtml(order.flower_type)}<br/>
      <strong>Total Fee:</strong> ₱${escapeHtml(String(order.total_fee || '0'))}</p>
      <p>If you have any questions, please reply to this email.</p>
      <hr />
      <p style="font-size:0.8em;color:#999">Chammy Florals</p>
    </div>
  `;
  return { subject: `Chammy Florals - Order ${order.order_id} is now ${order.status}`, html };
}

function deliveredTemplate(order) {
  const addons = Array.isArray(order.addons) && order.addons.length ? order.addons.join(', ') : 'None';
  const html = `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2 style="color:#ff69b4">Thank you — your order has been delivered!</h2>
      <p>Hi ${escapeHtml(order.name)},</p>
      <p>We're happy to let you know that your order <strong>${escapeHtml(order.order_id)}</strong> has been delivered.</p>
      <ul>
        <li><strong>Order ID:</strong> ${escapeHtml(order.order_id)}</li>
        <li><strong>Flower Type:</strong> ${escapeHtml(order.flower_type)}</li>
        <li><strong>Quantity:</strong> ${escapeHtml(String(order.quantity))}</li>
        <li><strong>Add-ons:</strong> ${escapeHtml(addons)}</li>
        <li><strong>Total:</strong> ₱${escapeHtml(String(order.total_fee))}</li>
      </ul>
      ${order.receiver_name || typeof order.payment_received !== 'undefined' || order.delivered_by ? `
        <div style="margin-top:15px;padding:15px;background:#f0f8ff;border-left:4px solid #ff69b4;border-radius:6px;color:#333">
          <strong style="color:#ff69b4">Delivery Details</strong>
          <div style="margin-top:10px;line-height:1.8">
            ${order.receiver_name ? `<div>✓ <strong>Received By:</strong> ${escapeHtml(order.receiver_name)}</div>` : ''}
            ${typeof order.payment_received !== 'undefined' ? `<div><strong>Amount Received:</strong> ₱${escapeHtml(String(Number(order.payment_received).toFixed(2)))}</div>` : ''}
            ${order.delivered_by ? `<div><strong>Delivered By:</strong> ${escapeHtml(order.delivered_by)}</div>` : ''}
          </div>
        </div>
      ` : ''}
      ${order.delivery_notes ? `<div style="margin-top:10px;padding:10px;background:#fff6f9;border-radius:6px;color:#333"><strong>Delivery Notes:</strong><div style="margin-top:6px">${escapeHtml(order.delivery_notes)}</div></div>` : ''}
      <p>Thank you for choosing Chammy Florals. We hope our flowers made the moment special!</p>
      <p style="font-size:0.9em;color:#666">If you have feedback, please reply to this email — we'd love to hear from you.</p>
      <hr />
      <p style="font-size:0.8em;color:#999">Chammy Florals</p>
    </div>
  `;
  return { subject: `Chammy Florals - Order Delivered (${order.order_id})`, html };
}

module.exports = { orderConfirmationTemplate, statusUpdateTemplate, deliveredTemplate };
