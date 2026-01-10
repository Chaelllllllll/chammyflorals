// Check if already logged in
(async () => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    try {
      const response = await fetch('/api/admin/verify-token', {
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        });
      if (response.ok) {
        window.location.href = '/admin/dashboard.html';
      } else {
        localStorage.removeItem('adminToken');
      }
    } catch (error) {
      console.error('Token verification error:', error);
      localStorage.removeItem('adminToken');
    }
  }
})();

// Form submission
let pendingEmail = null;
let pendingPassword = null;

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  const email = document.getElementById('adminEmail').value;
  const password = document.getElementById('adminPassword').value;

  try {
  const response = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    let result;
    try {
      result = await response.json();
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError);
      throw new Error('Invalid server response');
    }

    if (response.ok) {
      // If server requires 2FA, show the 2FA input
      if (result && result.twoFactorRequired) {
        pendingEmail = email;
        pendingPassword = password;
        const twoBox = document.getElementById('twoFactorBox');
        const twoMsg = document.getElementById('twoFactorMessage');
          twoMsg.textContent = result.message || '2FA code sent to your Messenger.';
          twoBox.style.display = 'block';
          // disable login UI to avoid resubmits while code is pending
          const loginBtn = document.querySelector('#adminLoginForm button[type="submit"]');
          const emailInput = document.getElementById('adminEmail');
          const passInput = document.getElementById('adminPassword');
          const resendBtnEl = document.getElementById('admin2faResend');
          if (loginBtn) loginBtn.disabled = true;
          if (emailInput) emailInput.disabled = true;
          if (passInput) passInput.disabled = true;
          if (resendBtnEl) resendBtnEl.disabled = true;
          // focus code input
          const codeInput = document.getElementById('admin2faCode');
          if (codeInput) codeInput.focus();
          // start countdown if server provided remainingSeconds
          const remaining = Number(result.remainingSeconds || 0);
    startTwofaCountdown(remaining || 60);
        return;
      }
      // Otherwise normal token response
      if (result && result.token) {
        localStorage.setItem('adminToken', result.token);
        window.location.href = '/admin/dashboard.html';
        return;
      }
      showErrorModal(result.error || 'Login failed');
    } else {
      showErrorModal(result.error || 'Login failed');
    }
  } catch (error) {
    console.error('Login Error:', error);
    showErrorModal(error.message || 'Login failed. Please try again.');
  }
});

// Password toggle (guard against missing elements)
(() => {
  const toggle = document.getElementById('passwordToggle');
  if (!toggle) return; // no toggle UI on this page
  toggle.addEventListener('click', () => {
    const passwordInput = document.getElementById('adminPassword');
    const eyeIcon = document.getElementById('eyeIcon');
    if (!passwordInput) return;
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    if (!eyeIcon) return;
    eyeIcon.classList.toggle('bi-eye', isPassword);
    eyeIcon.classList.toggle('bi-eye-slash', !isPassword);
    eyeIcon.innerHTML = isPassword
      ? `<path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.211.135-.52.165-.756.165-.255 0-.492-.05-.713-.134l-.815.815A7.028 7.028 0 0 0 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8l.77-.771a6.028 6.028 0 0 0 2.79-.588l.815.815c.221.084.458.134.713.134.236 0 .545-.03.756-.165.635-.635 1.13-1.275 1.465-1.755.073-.105.137-.201.195-.288zM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>`
      : `<path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"`;
  });
})();

// Error modal
function showErrorModal(message) {
  const errorModalContent = document.getElementById('errorModalContent');
  errorModalContent.textContent = message;
  const errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
  errorModal.show();
}

// 2FA verify handler
const verifyBtn = document.getElementById('admin2faVerify');
if (verifyBtn) {
  verifyBtn.addEventListener('click', async () => {
    const code = document.getElementById('admin2faCode').value;
    if (!pendingEmail) return showErrorModal('No pending login. Please submit your email and password first.');
    if (!code || !/^[0-9]{6}$/.test(code)) return showErrorModal('Please enter the 6-digit code.');
    try {
      const resp = await fetch('/api/admin/login/verify', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, code }),
      });
      const json = await resp.json();
      if (resp.ok && json && json.token) {
        localStorage.setItem('adminToken', json.token);
        window.location.href = '/admin/dashboard.html';
      } else {
        showErrorModal(json.error || 'Invalid code');
      }
    } catch (err) {
      console.error('2FA verify error:', err);
      showErrorModal('Failed to verify code. Try again.');
    }
  });
}

// Resend 2FA (resubmits credentials stored in memory for convenience)
const resendBtn = document.getElementById('admin2faResend');
if (resendBtn) {
  resendBtn.addEventListener('click', async () => {
    if (!pendingEmail || !pendingPassword) return showErrorModal('No pending login to resend for.');
    // prevent resending if countdown running
    if (resendBtn.disabled) return showErrorModal('Please wait before requesting a new code.');
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pendingEmail, password: pendingPassword }) });
      const j = await r.json();
      const twoMsg = document.getElementById('twoFactorMessage');
      if (r.ok && j && j.twoFactorRequired) {
        twoMsg.textContent = j.message || 'Code resent.';
        // restart countdown if server provided remainingSeconds
        const rem = Number(j.remainingSeconds || 0);
  startTwofaCountdown(rem || 60);
      } else {
        twoMsg.textContent = j.error || 'Failed to resend code.';
      }
    } catch (err) {
      console.error('Resend error:', err);
      showErrorModal('Failed to resend code.');
    }
  });
}

// Start/stop countdown UI for 2FA resend and re-enable login when expired
let _twofaCountdownTimer = null;
function startTwofaCountdown(seconds) {
  // seconds: number of seconds remaining until resend allowed
  clearInterval(_twofaCountdownTimer);
  const loginBtn = document.querySelector('#adminLoginForm button[type="submit"]');
  const emailInput = document.getElementById('adminEmail');
  const passInput = document.getElementById('adminPassword');
  const resendBtnEl = document.getElementById('admin2faResend');
  const twoMsg = document.getElementById('twoFactorMessage');
  let remaining = Number(seconds) || 0;
  if (resendBtnEl) resendBtnEl.disabled = true;
  if (loginBtn) loginBtn.disabled = true;
  if (emailInput) emailInput.disabled = true;
  if (passInput) passInput.disabled = true;
  function tick() {
    if (remaining <= 0) {
      // re-enable UI
      if (resendBtnEl) resendBtnEl.disabled = false;
      if (loginBtn) loginBtn.disabled = false;
      if (emailInput) emailInput.disabled = false;
      if (passInput) passInput.disabled = false;
      if (twoMsg) twoMsg.textContent = 'You can request a new code now.';
      clearInterval(_twofaCountdownTimer);
      _twofaCountdownTimer = null;
      return;
    }
    if (twoMsg) twoMsg.textContent = `A code was sent. Please wait ${remaining} second${remaining === 1 ? '' : 's'} before requesting a new one.`;
    remaining -= 1;
  }
  tick();
  _twofaCountdownTimer = setInterval(tick, 1000);
}

// Check if already logged in
(async () => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    try {
  const response = await fetch('/api/admin/verify-token', {
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
      });
      let result;
      try {
        result = await response.json();
      } catch (jsonError) {
        console.error('JSON parse error on verify-token:', jsonError);
        localStorage.removeItem('adminToken');
        return;
      }
      if (response.ok && result.valid) {
        window.location.href = '/admin/dashboard.html';
      } else {
        localStorage.removeItem('adminToken');
      }
    } catch (error) {
      console.error('Token verification error:', error);
      localStorage.removeItem('adminToken');
    }
  }
})();