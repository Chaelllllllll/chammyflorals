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

function unpaidOrderReminderTemplate(order, customMessage) {
  const addons = Array.isArray(order.addons) && order.addons.length
    ? (typeof order.addons[0] === 'object' ? order.addons.map(a => a.name || a.title || 'Add-on').join(', ') : order.addons.join(', '))
    : (order.addons && typeof order.addons === 'string' ? order.addons : 'None');

  // Format item list
  let itemsSummary = '';
  if (Array.isArray(order.items) && order.items.length) {
    itemsSummary = order.items.map(it => {
      const name = it.name || it.flower_type || it.product || 'Flower';
      const qty = it.quantity || it.qty || 1;
      const color = it.color ? (typeof it.color === 'object' ? (it.color.name || it.color.value || '') : it.color) : '';
      return `${escapeHtml(name)}${color ? ` (${escapeHtml(color)})` : ''} x${qty}`;
    }).join('<br/>');
  } else if (order.stems || order.fillers || order.wrapping) {
    const parts = [];
    if (Array.isArray(order.stems) && order.stems.length) {
      parts.push(`<strong>Stems:</strong> ` + order.stems.map(s => escapeHtml(s.name || s)).join(', '));
    }
    if (Array.isArray(order.fillers) && order.fillers.length) {
      parts.push(`<strong>Fillers:</strong> ` + order.fillers.map(f => escapeHtml(f.name || f)).join(', '));
    }
    if (Array.isArray(order.wrapping) && order.wrapping.length) {
      parts.push(`<strong>Wrapping:</strong> ` + order.wrapping.map(w => escapeHtml(w.name || w)).join(', '));
    }
    itemsSummary = parts.join('<br/>') || escapeHtml(order.flower_type || 'Custom Bouquet');
  } else {
    itemsSummary = `${escapeHtml(order.flower_type || 'Floral Item')} x${escapeHtml(String(order.quantity || 1))}`;
  }

  const totalFee = Number(order.total_fee || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const subtotal = order.subtotal ? Number(order.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
  const deliveryFee = order.delivery_fee ? Number(order.delivery_fee).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: linear-gradient(135deg, rgba(255,233,241,0.3) 0%, rgba(255,255,255,0.95) 100%); color: #333333;">
      <div style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(255, 111, 155, 0.15); border: 1px solid rgba(255, 111, 155, 0.2);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #ff6f9b 0%, #ff8fab 100%); padding: 30px 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Payment Reminder</h1>
          <p style="margin: 6px 0 0 0; font-size: 15px; opacity: 0.95;">Order #${escapeHtml(order.order_id)}</p>
        </div>

        <div style="padding: 28px 24px;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0;">Hi <strong>${escapeHtml(order.name || 'Valued Customer')}</strong>,</p>
          
          <p style="font-size: 15px; line-height: 1.6; color: #555555;">
            This is an automated reminder that your order currently has an <strong>unpaid balance</strong>.
          </p>

          ${customMessage ? `
            <div style="margin: 20px 0; padding: 16px; background: #fff5f8; border-left: 4px solid #ff6f9b; border-radius: 8px;">
              <strong style="color: #c41f5c; font-size: 14px; display: block; margin-bottom: 6px;">Note from Chammy Florals:</strong>
              <div style="font-size: 14px; line-height: 1.6; color: #444444; white-space: pre-line;">${escapeHtml(customMessage)}</div>
            </div>
          ` : ''}

          <!-- Order Summary Card -->
          <div style="background: #faf7f9; border-radius: 12px; padding: 20px; margin: 24px 0; border: 1px solid #f0e6eb;">
            <h3 style="margin: 0 0 14px 0; color: #ff6f9b; font-size: 16px; font-weight: 600; border-bottom: 1px solid #f0e6eb; padding-bottom: 8px;">
              Order Summary
            </h3>
            
            <div style="margin-bottom: 12px; font-size: 14px; line-height: 1.6;">
              <div style="color: #777777; font-size: 12px; text-transform: uppercase; font-weight: 600;">Items</div>
              <div style="color: #222222; margin-top: 2px;">${itemsSummary}</div>
            </div>

            ${addons !== 'None' ? `
              <div style="margin-bottom: 12px; font-size: 14px; line-height: 1.6;">
                <div style="color: #777777; font-size: 12px; text-transform: uppercase; font-weight: 600;">Add-ons</div>
                <div style="color: #222222; margin-top: 2px;">${escapeHtml(addons)}</div>
              </div>
            ` : ''}

            ${order.payment_method ? `
              <div style="margin-bottom: 12px; font-size: 14px; line-height: 1.6;">
                <div style="color: #777777; font-size: 12px; text-transform: uppercase; font-weight: 600;">Selected Payment Method</div>
                <div style="color: #222222; margin-top: 2px;">${escapeHtml(order.payment_method)}</div>
              </div>
            ` : ''}

            ${order.delivery_date ? `
              <div style="margin-bottom: 12px; font-size: 14px; line-height: 1.6;">
                <div style="color: #777777; font-size: 12px; text-transform: uppercase; font-weight: 600;">Delivery / Fulfillment Date</div>
                <div style="color: #222222; margin-top: 2px;">${escapeHtml(order.delivery_date)}${order.delivery_time ? ' at ' + escapeHtml(order.delivery_time) : ''}</div>
              </div>
            ` : ''}

            <!-- Pricing Breakdown -->
            <div style="margin-top: 16px; pt-3; border-top: 1px dashed #e0d0d8; font-size: 14px; line-height: 1.8;">
              ${subtotal ? `<div style="display: flex; justify-content: space-between;"><span style="color: #666;">Subtotal:</span><span>₱${subtotal}</span></div>` : ''}
              ${deliveryFee ? `<div style="display: flex; justify-content: space-between;"><span style="color: #666;">Delivery Fee:</span><span>₱${deliveryFee}</span></div>` : ''}
              ${Number(order.customization_fee) > 0 ? `<div style="display: flex; justify-content: space-between;"><span style="color: #666;">Customization Fee:</span><span>₱${Number(order.customization_fee).toFixed(2)}</span></div>` : ''}
              ${order.voucher_code ? `<div style="display: flex; justify-content: space-between; color: #28a745;"><span>Voucher (${escapeHtml(order.voucher_code)}):</span><span>-₱${escapeHtml(String(order.voucher_discount || '0.00'))}</span></div>` : ''}
              
              <div style="margin-top: 12px; padding: 12px; background: #ffffff; border-radius: 8px; border: 2px solid #ff6f9b; display: flex; justify-content: space-between; align-items: center;">
                <strong style="color: #333333; font-size: 15px;">Total Amount Due:</strong>
                <span style="color: #c41f5c; font-size: 20px; font-weight: 700;">₱${totalFee}</span>
              </div>
            </div>
          </div>

          <p style="font-size: 13px; line-height: 1.6; color: #777777; margin-top: 24px;">
            If you have already settled this payment or believe you received this message in error, please disregard this email or reply with your payment receipt reference.
          </p>

          <div style="margin-top: 30px; text-align: center;">
            <p style="color: #ff6f9b; font-weight: 600; font-size: 15px; margin: 0;">Thank you for choosing Chammy Florals!</p>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #fafafa; border-top: 1px solid #f0f0f0; padding: 20px 24px; text-align: center; font-size: 12px; color: #999999;">
          <p style="margin: 0;">Chammy Florals • Making every moment special</p>
          <p style="margin: 4px 0 0 0;">This is an automated payment regarding Order #${escapeHtml(order.order_id)}.</p>
        </div>

      </div>
    </div>
  `;

  return {
    subject: `Payment Reminder: Chammy Florals Order #${order.order_id} (₱${totalFee})`,
    html
  };
}

function productReviewInvitationTemplate(order, reviewLink, customMessage) {
  // Format item list
  let itemsSummary = '';
  if (Array.isArray(order.items) && order.items.length) {
    itemsSummary = order.items.map(it => {
      const name = it.name || it.flower_type || it.product || 'Flower';
      const qty = it.quantity || it.qty || 1;
      const color = it.color ? (typeof it.color === 'object' ? (it.color.name || it.color.value || '') : it.color) : '';
      return `${escapeHtml(name)}${color ? ` (${escapeHtml(color)})` : ''} x${qty}`;
    }).join('<br/>');
  } else if (order.stems || order.fillers || order.wrapping) {
    const parts = [];
    if (Array.isArray(order.stems) && order.stems.length) {
      parts.push(`<strong>Stems:</strong> ` + order.stems.map(s => escapeHtml(s.name || s)).join(', '));
    }
    if (Array.isArray(order.fillers) && order.fillers.length) {
      parts.push(`<strong>Fillers:</strong> ` + order.fillers.map(f => escapeHtml(f.name || f)).join(', '));
    }
    if (Array.isArray(order.wrapping) && order.wrapping.length) {
      parts.push(`<strong>Wrapping:</strong> ` + order.wrapping.map(w => escapeHtml(w.name || w)).join(', '));
    }
    itemsSummary = parts.join('<br/>') || escapeHtml(order.flower_type || 'Custom Bouquet');
  } else {
    itemsSummary = `${escapeHtml(order.flower_type || 'Floral Item')} x${escapeHtml(String(order.quantity || 1))}`;
  }

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: linear-gradient(135deg, rgba(255,233,241,0.3) 0%, rgba(255,255,255,0.95) 100%); color: #333333;">
      <div style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(255, 111, 155, 0.15); border: 1px solid rgba(255, 111, 155, 0.2);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #ff6f9b 0%, #ff8fab 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">We'd Love Your Feedback!</h1>
          <p style="margin: 6px 0 0 0; font-size: 15px; opacity: 0.95;">Order #${escapeHtml(order.order_id)}</p>
        </div>

        <div style="padding: 28px 24px;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0;">Hi <strong>${escapeHtml(order.name || 'Valued Customer')}</strong>,</p>
          
          <p style="font-size: 15px; line-height: 1.6; color: #555555;">
            Thank you for choosing <strong>Chammy Florals</strong>! We hope your order brought joy and made your moment extra special.
          </p>

          <p style="font-size: 15px; line-height: 1.6; color: #555555;">
            Your feedback helps us continue improving and crafting even more unforgettable arrangements. Could you please take a moment to share your experience with us?
          </p>

          ${customMessage ? `
            <div style="margin: 20px 0; padding: 16px; background: #fff5f8; border-left: 4px solid #ff6f9b; border-radius: 8px;">
              <strong style="color: #c41f5c; font-size: 14px; display: block; margin-bottom: 6px;">Message from Chammy Florals:</strong>
              <div style="font-size: 14px; line-height: 1.6; color: #444444; white-space: pre-line;">${escapeHtml(customMessage)}</div>
            </div>
          ` : ''}

          <!-- Order Summary Card -->
          <div style="background: #faf7f9; border-radius: 12px; padding: 18px 20px; margin: 24px 0; border: 1px solid #f0e6eb;">
            <div style="color: #777777; font-size: 12px; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;">Your Order Details</div>
            <div style="color: #222222; font-size: 14px; line-height: 1.6;">${itemsSummary}</div>
          </div>

          <!-- Call to Action Button -->
          <div style="text-align: center; margin: 32px 0 24px 0;">
            <a href="${escapeHtml(reviewLink)}" style="display: inline-block; background: linear-gradient(135deg, #ff6f9b 0%, #ff8fab 100%); color: #ffffff; text-decoration: none; padding: 15px 36px; border-radius: 10px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 15px rgba(255, 111, 155, 0.35);">
              Leave a Review
            </a>
          </div>

          <div style="text-align: center; margin-bottom: 24px;">
            <p style="font-size: 12px; color: #888888; margin: 0;">
              Or copy and paste this link into your browser:<br/>
              <a href="${escapeHtml(reviewLink)}" style="color: #ff6f9b; word-break: break-all; font-size: 12px;">${escapeHtml(reviewLink)}</a>
            </p>
          </div>

          <div style="margin-top: 30px; text-align: center; border-top: 1px solid #f0f0f0; pt-3; padding-top: 20px;">
            <p style="color: #ff6f9b; font-weight: 600; font-size: 15px; margin: 0;">Thank you for supporting Chammy Florals!</p>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #fafafa; border-top: 1px solid #f0f0f0; padding: 20px 24px; text-align: center; font-size: 12px; color: #999999;">
          <p style="margin: 0;">Chammy Florals • Making every moment special</p>
        </div>

      </div>
    </div>
  `;

  return {
    subject: `We'd love your feedback! Review your Chammy Florals order #${order.order_id}`,
    html
  };
}

module.exports = {
  orderConfirmationTemplate,
  statusUpdateTemplate,
  deliveredTemplate,
  emailVerificationTemplate,
  passwordResetTemplate,
  unpaidOrderReminderTemplate,
  productReviewInvitationTemplate
};

