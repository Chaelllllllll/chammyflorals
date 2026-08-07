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
        ${Number(order.customization_fee) > 0 ? `<li><strong>Customization Fee:</strong> <span style="color: #ff69b4; font-weight: bold;">₱${escapeHtml(Number(order.customization_fee).toFixed(2))}</span></li>` : ''}
        ${order.voucher_code ? `<li><strong>Voucher Applied:</strong> <span style="background: #28a745; color: white; padding: 4px 12px; border-radius: 6px; font-weight: bold;">${escapeHtml(order.voucher_code)}</span></li>` : ''}
        ${order.voucher_discount ? `<li><strong>Discount:</strong> <span style="color: #28a745; font-weight: bold;">-₱${escapeHtml(String(order.voucher_discount))}</span></li>` : ''}
        ${order.original_total && order.voucher_discount ? `<li><strong>Original Total:</strong> <span style="text-decoration: line-through; color: #999;">₱${escapeHtml(String(order.original_total))}</span></li>` : ''}
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
      ${Number(order.customization_fee) > 0 ? `<strong>Customization Fee:</strong> <span style="color: #ff69b4; font-weight: bold;">₱${escapeHtml(Number(order.customization_fee).toFixed(2))}</span><br/>` : ''}
      ${order.voucher_code ? `<strong>Voucher Applied:</strong> <span style="background: #28a745; color: white; padding: 4px 12px; border-radius: 6px; font-weight: bold;">${escapeHtml(order.voucher_code)}</span> (Saved ₱${escapeHtml(String(order.voucher_discount || '0'))})<br/>` : ''}
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
        ${Number(order.customization_fee) > 0 ? `<li><strong>Customization Fee:</strong> <span style="color: #ff69b4; font-weight: bold;">₱${escapeHtml(Number(order.customization_fee).toFixed(2))}</span></li>` : ''}
        ${order.voucher_code ? `<li><strong>Voucher Applied:</strong> <span style="background: #28a745; color: white; padding: 4px 12px; border-radius: 6px; font-weight: bold;">${escapeHtml(order.voucher_code)}</span></li>` : ''}
        ${order.voucher_discount ? `<li><strong>Discount:</strong> <span style="color: #28a745; font-weight: bold;">-₱${escapeHtml(String(order.voucher_discount))}</span></li>` : ''}
        ${order.original_total && order.voucher_discount ? `<li><strong>Original Total:</strong> <span style="text-decoration: line-through; color: #999;">₱${escapeHtml(String(order.original_total))}</span></li>` : ''}
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

function emailVerificationTemplate(name, otp) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, rgba(255,233,241,0.3) 0%, rgba(255,255,255,0.9) 100%);">
      <div style="text-align: center; padding: 30px; background: white; border-radius: 15px; box-shadow: 0 4px 20px rgba(255, 111, 155, 0.15);">
        <div style="font-size: 48px; margin-bottom: 20px;">🌸</div>
        <h2 style="color: #ff6f9b; font-size: 28px; margin-bottom: 10px;">Welcome to Chammy Florals!</h2>
        <p style="color: #666; font-size: 16px; margin-bottom: 30px;">Hi ${escapeHtml(name)},</p>
        <p style="color: #333; font-size: 15px; margin-bottom: 20px;">Thank you for creating an account with us. To complete your registration, please verify your email address using the code below:</p>
        
        <div style="background: linear-gradient(135deg, #ff6f9b 0%, #ff99bb 100%); color: white; font-size: 36px; font-weight: bold; letter-spacing: 8px; padding: 20px; border-radius: 10px; margin: 30px 0; box-shadow: 0 4px 15px rgba(255, 111, 155, 0.3);">
          ${escapeHtml(otp)}
        </div>
        
        <p style="color: #666; font-size: 14px; margin-top: 20px;">This code will expire in <strong>10 minutes</strong>.</p>
        <p style="color: #666; font-size: 14px;">If you didn't create an account with Chammy Florals, please ignore this email.</p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #f0f0f0;">
          <p style="color: #999; font-size: 12px; margin: 0;">This is an automated message, please do not reply.</p>
          <p style="color: #999; font-size: 12px; margin: 5px 0 0 0;">© 2026 Chammy Florals. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;
  return { subject: 'Verify Your Email - Chammy Florals', html };
}

function passwordResetTemplate(name, resetLink) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, rgba(255,233,241,0.3) 0%, rgba(255,255,255,0.9) 100%);">
      <div style="text-align: center; padding: 30px; background: white; border-radius: 15px; box-shadow: 0 4px 20px rgba(255, 111, 155, 0.15);">
        <div style="font-size: 48px; margin-bottom: 20px;">🔒</div>
        <h2 style="color: #ff6f9b; font-size: 28px; margin-bottom: 10px;">Password Reset Request</h2>
        <p style="color: #666; font-size: 16px; margin-bottom: 30px;">Hi ${escapeHtml(name)},</p>
        <p style="color: #333; font-size: 15px; margin-bottom: 20px;">We received a request to reset your password. Click the button below to create a new password:</p>
        
        <a href="${escapeHtml(resetLink)}" style="display: inline-block; background: linear-gradient(135deg, #ff6f9b 0%, #ff99bb 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 10px; font-weight: bold; font-size: 16px; margin: 20px 0; box-shadow: 0 4px 15px rgba(255, 111, 155, 0.3);">
          Reset Password
        </a>
        
        <p style="color: #666; font-size: 14px; margin-top: 20px;">Or copy and paste this link into your browser:</p>
        <p style="color: #ff6f9b; font-size: 13px; word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 5px;">
          ${escapeHtml(resetLink)}
        </p>
        
        <p style="color: #666; font-size: 14px; margin-top: 25px;">This link will expire in <strong>1 hour</strong>.</p>
        <p style="color: #666; font-size: 14px;">If you didn't request a password reset, please ignore this email or contact us if you have concerns.</p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #f0f0f0;">
          <p style="color: #999; font-size: 12px; margin: 0;">This is an automated message, please do not reply.</p>
          <p style="color: #999; font-size: 12px; margin: 5px 0 0 0;">© 2026 Chammy Florals. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;
  return { subject: 'Reset Your Password - Chammy Florals', html };
}

module.exports = { 
  orderConfirmationTemplate, 
  statusUpdateTemplate, 
  deliveredTemplate,
  emailVerificationTemplate,
  passwordResetTemplate 
};
