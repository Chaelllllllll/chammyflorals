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

module.exports = { orderConfirmationTemplate, statusUpdateTemplate };
