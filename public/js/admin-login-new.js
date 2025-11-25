// Check if already logged in
(async () => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    try {
      const response = await fetch('/api/admin/verify-token', {
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
let setupMode = false;

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  const email = document.getElementById('adminEmail').value;
  const password = document.getElementById('adminPassword').value;
  const totpCode = document.getElementById('adminTOTP') ? document.getElementById('adminTOTP').value : '';

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, totp: totpCode }),
    });

    const result = await response.json();

    if (response.ok) {
      // Check if TOTP setup is required
      if (result.setupRequired) {
        setupMode = true;
        pendingEmail = email;
        pendingPassword = password;
        showTOTPSetup(result.qrCode, result.secret);
        return;
      }

      // Check if TOTP code is required
      if (result.requiresTOTP) {
        showTOTPInput();
        return;
      }

      // Normal login success
      if (result.token) {
        localStorage.setItem('adminToken', result.token);
        window.location.href = '/admin/dashboard.html';
        return;
      }
    }
    
    showErrorModal(result.error || 'Login failed');
  } catch (error) {
    console.error('Login Error:', error);
    showErrorModal(error.message || 'Login failed. Please try again.');
  }
});

function showTOTPSetup(qrCodeUrl, secret) {
  const setupBox = document.getElementById('totpSetupBox');
  if (!setupBox) {
    // Create setup UI
    const form = document.getElementById('adminLoginForm');
    const setupDiv = document.createElement('div');
    setupDiv.id = 'totpSetupBox';
    setupDiv.className = 'mt-3';
    setupDiv.innerHTML = `
      <div class="card">
        <div class="card-body">
          <h5>Setup Google Authenticator</h5>
          <p>Scan this QR code with Google Authenticator app:</p>
          <div class="text-center mb-3">
            <img id="qrCodeImage" src="${qrCodeUrl}" alt="QR Code" style="max-width: 250px;" />
          </div>
          <p class="text-muted small">Or enter this secret manually: <code id="totpSecret">${secret}</code></p>
          <div class="mb-3">
            <label for="setupTOTPCode" class="form-label">Enter 6-digit code from app:</label>
            <input type="text" class="form-control" id="setupTOTPCode" inputmode="numeric" pattern="\\d{6}" maxlength="6" required />
          </div>
          <button type="button" id="enableTOTPBtn" class="btn btn-pink w-100">Enable Google Authenticator</button>
        </div>
      </div>
    `;
    form.parentElement.appendChild(setupDiv);
    
    // Add event listener
    document.getElementById('enableTOTPBtn').addEventListener('click', enableTOTP);
  } else {
    document.getElementById('qrCodeImage').src = qrCodeUrl;
    document.getElementById('totpSecret').textContent = secret;
    setupBox.style.display = 'block';
  }
  
  // Hide login form
  document.getElementById('adminLoginForm').style.display = 'none';
}

function showTOTPInput() {
  const totpBox = document.getElementById('totpInputBox');
  if (!totpBox) {
    // Create TOTP input if it doesn't exist
    const form = document.getElementById('adminLoginForm');
    const passDiv = form.querySelector('div:has(#adminPassword)') || form.querySelector('div:nth-child(2)');
    const totpDiv = document.createElement('div');
    totpDiv.className = 'mb-3';
    totpDiv.id = 'totpInputBox';
    totpDiv.innerHTML = `
      <label for="adminTOTP" class="form-label">Authenticator Code</label>
      <input type="text" class="form-control" id="adminTOTP" inputmode="numeric" pattern="\\d{6}" maxlength="6" required autofocus />
      <div class="invalid-feedback">Please enter the 6-digit code.</div>
    `;
    passDiv.parentElement.insertBefore(totpDiv, passDiv.nextSibling);
    document.getElementById('adminTOTP').focus();
  } else {
    totpBox.style.display = 'block';
    document.getElementById('adminTOTP').focus();
  }
}

async function enableTOTP() {
  const totpCode = document.getElementById('setupTOTPCode').value;
  if (!totpCode || !/^\d{6}$/.test(totpCode)) {
    showErrorModal('Please enter the 6-digit code from Google Authenticator');
    return;
  }

  try {
    const response = await fetch('/api/admin/login/enable-totp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, password: pendingPassword, totp: totpCode }),
    });

    const result = await response.json();

    if (response.ok && result.token) {
      localStorage.setItem('adminToken', result.token);
      window.location.href = '/admin/dashboard.html';
    } else {
      showErrorModal(result.error || 'Failed to enable Google Authenticator');
    }
  } catch (error) {
    console.error('Enable TOTP Error:', error);
    showErrorModal('Failed to enable Google Authenticator');
  }
}

// Error modal
function showErrorModal(message) {
  const errorModalContent = document.getElementById('errorModalContent');
  if (errorModalContent) {
    errorModalContent.textContent = message;
    const errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
    errorModal.show();
  } else {
    alert(message);
  }
}
