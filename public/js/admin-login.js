// Form submission
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
      // Don't log tokens to console in production
      localStorage.setItem('adminToken', result.token);
      window.location.href = '/admin/dashboard.html';
    } else {
      showErrorModal(result.error || 'Login failed');
    }
  } catch (error) {
    console.error('Login Error:', error);
    showErrorModal(error.message || 'Login failed. Please try again.');
  }
});

// Password toggle
document.getElementById('passwordToggle').addEventListener('click', () => {
  const passwordInput = document.getElementById('adminPassword');
  const eyeIcon = document.getElementById('eyeIcon');
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  eyeIcon.classList.toggle('bi-eye', isPassword);
  eyeIcon.classList.toggle('bi-eye-slash', !isPassword);
  eyeIcon.innerHTML = isPassword
    ? `<path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.211.135-.52.165-.756.165-.255 0-.492-.05-.713-.134l-.815.815A7.028 7.028 0 0 0 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8l.77-.771a6.028 6.028 0 0 0 2.79-.588l.815.815c.221.084.458.134.713.134.236 0 .545-.03.756-.165.635-.635 1.13-1.275 1.465-1.755.073-.105.137-.201.195-.288zM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>`
    : `<path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>`;
});

// Error modal
function showErrorModal(message) {
  const errorModalContent = document.getElementById('errorModalContent');
  errorModalContent.textContent = message;
  const errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
  errorModal.show();
}

// Check if already logged in
(async () => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    try {
  const response = await fetch('/api/admin/verify-token', {
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