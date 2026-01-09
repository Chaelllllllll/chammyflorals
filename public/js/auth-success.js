// auth-success.js - Handle authentication callback
(function() {
  try {
    console.log('Auth success page loaded');
    
    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const userDataEncoded = urlParams.get('user');
    
    console.log('Token present:', !!token);
    console.log('User data present:', !!userDataEncoded);
    
    if (!token || !userDataEncoded) {
      console.error('Missing authentication data');
      window.location.href = '/customer-login.html?error=missing_data';
      return;
    }
    
    // Decode user data
    const customer = JSON.parse(decodeURIComponent(userDataEncoded));
    
    console.log('Customer data:', customer);
    
    // Store in localStorage
    localStorage.setItem('auth_token', token);
    localStorage.setItem('customer', JSON.stringify(customer));
    
    console.log('Authentication successful for:', customer.email);
    console.log('Token stored in localStorage:', localStorage.getItem('auth_token') ? 'Yes' : 'No');
    
    // Small delay to ensure storage completes
    setTimeout(() => {
      console.log('Redirecting to home page...');
      window.location.href = '/index.html';
    }, 500);
  } catch (err) {
    console.error('Error processing authentication:', err);
    alert('Login successful but failed to store credentials. Please try logging in again.');
    window.location.href = '/customer-login.html';
  }
})();
