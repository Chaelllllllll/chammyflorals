// customer-signup.js - Handle signup form submission
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://chamflorals.vercel.app';

function showAlert(message, type = 'danger') {
    const alertContainer = document.getElementById('alertContainer');
    alertContainer.innerHTML = `
        <div class="alert alert-${type}">
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}" style="margin-right: 8px;"></i>
            ${message}
        </div>
    `;
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alertContainer.innerHTML = '';
    }, 5000);
}

// Password strength checker
function checkPasswordStrength(password) {
    const strengthBar = document.getElementById('strengthBar');
    let strength = 0;
    
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
    if (password.match(/\d/)) strength++;
    if (password.match(/[^a-zA-Z\d]/)) strength++;
    
    strengthBar.className = 'password-strength-bar';
    if (strength <= 1) {
        strengthBar.classList.add('strength-weak');
    } else if (strength <= 3) {
        strengthBar.classList.add('strength-medium');
    } else {
        strengthBar.classList.add('strength-strong');
    }
}

// Form submission
document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signupForm');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    
    // Password strength indicator
    passwordInput.addEventListener('input', (e) => {
        checkPasswordStrength(e.target.value);
    });
    
    // Form submit
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const signupBtn = document.getElementById('signupBtn');
        const originalText = signupBtn.innerHTML;
        signupBtn.disabled = true;
        signupBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>Creating account...';

        const formData = {
            name: document.getElementById('name').value.trim(),
            email: document.getElementById('email').value.trim(),
            phone: document.getElementById('phone').value.trim(),
            address: document.getElementById('address').value.trim(),
            password: passwordInput.value,
            confirmPassword: confirmPasswordInput.value
        };

        // Validation
        if (formData.password !== formData.confirmPassword) {
            showAlert('Passwords do not match', 'danger');
            signupBtn.disabled = false;
            signupBtn.innerHTML = originalText;
            return;
        }

        if (formData.password.length < 8) {
            showAlert('Password must be at least 8 characters long', 'danger');
            signupBtn.disabled = false;
            signupBtn.innerHTML = originalText;
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/auth/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                // Store token and customer info
                localStorage.setItem('auth_token', data.token);
                localStorage.setItem('customer', JSON.stringify(data.customer));
                
                showAlert('Account created successfully! Redirecting...', 'success');
                
                // Redirect after short delay
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            } else {
                showAlert(data.error || 'Signup failed. Please try again.', 'danger');
                signupBtn.disabled = false;
                signupBtn.innerHTML = originalText;
            }
        } catch (error) {
            console.error('Signup error:', error);
            showAlert('An error occurred. Please try again.', 'danger');
            signupBtn.disabled = false;
            signupBtn.innerHTML = originalText;
        }
    });

    // Check if already logged in
    const token = localStorage.getItem('auth_token');
    if (token) {
        window.location.href = 'index.html';
    }
});
