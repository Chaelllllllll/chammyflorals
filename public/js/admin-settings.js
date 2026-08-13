// Admin Settings functionality
(function() {
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : '';

  // Ensure admin is logged in
  const token = localStorage.getItem('adminToken');
  if (!token) {
    window.location.href = '/customer-login.html';
    return;
  }

  // --- Initialize UI ---
  document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Custom Order Placement Status
    try {
      const statusRes = await fetch(`${API_URL}/api/admin/settings/custom-order-status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (statusRes.ok) {
        const { status } = await statusRes.json();
        const toggle = document.getElementById('customOrderStatusSwitch');
        const label = document.getElementById('customOrderStatusLabel');
        if (toggle && label) {
          toggle.checked = status === 'open';
          label.textContent = status === 'open' ? 'Open' : 'Closed';
        }
      }
    } catch (err) {
      console.error('Failed to load custom order status:', err);
    }

    // Add switch change listener
    document.getElementById('customOrderStatusSwitch')?.addEventListener('change', async (e) => {
      const toggle = e.target;
      const label = document.getElementById('customOrderStatusLabel');
      const status = toggle.checked ? 'open' : 'closed';
      
      if (label) label.textContent = toggle.checked ? 'Open' : 'Closed';
      
      try {
        const res = await fetch(`${API_URL}/api/admin/settings/custom-order-status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status })
        });
        
        if (!res.ok) throw new Error('Failed to update status');
        if (typeof window.alertSuccess === 'function') {
          window.alertSuccess(`Custom order status updated to ${status.toUpperCase()}`);
        }
      } catch (err) {
        if (typeof window.alertError === 'function') {
          window.alertError('Failed to update custom order status: ' + err.message);
        } else {
          alert('Failed to update custom order status: ' + err.message);
        }
        toggle.checked = !toggle.checked;
        if (label) label.textContent = toggle.checked ? 'Open' : 'Closed';
      }
    });

    // 2. Muntinlupa Meetup Places Configuration
    let currentMeetupPlaces = [];

    const renderMeetupPlaces = () => {
      const select = document.getElementById('meetupPlacesSelect');
      if (!select) return;
      select.innerHTML = '';
      if (currentMeetupPlaces.length === 0) {
        select.innerHTML = '<option value="" disabled selected>No places configured</option>';
      } else {
        currentMeetupPlaces.forEach((place, index) => {
          const opt = document.createElement('option');
          opt.value = index;
          opt.textContent = place;
          select.appendChild(opt);
        });
      }
    };

    const saveMeetupPlaces = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/settings/meetup-places`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ places: currentMeetupPlaces })
        });
        if (!res.ok) throw new Error('Failed to update meetup places');
        if (typeof window.alertSuccess === 'function') {
          window.alertSuccess('Meetup places updated successfully');
        }
      } catch (err) {
        if (typeof window.alertError === 'function') {
          window.alertError('Failed to update meetup places: ' + err.message);
        } else {
          alert('Failed to update meetup places: ' + err.message);
        }
      }
    };

    try {
      const meetupRes = await fetch(`${API_URL}/api/admin/settings/meetup-places`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (meetupRes.ok) {
        const { places } = await meetupRes.json();
        currentMeetupPlaces = places || [];
        renderMeetupPlaces();
      }
    } catch (err) {
      console.error('Failed to load meetup places:', err);
    }

    // Add listener for meetup places
    document.getElementById('addMeetupPlaceBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('newMeetupPlaceInput');
      const val = input.value.trim();
      if (!val) return;
      
      if (currentMeetupPlaces.includes(val)) {
        if (typeof window.alertError === 'function') {
          window.alertError('Place already exists in the list');
        } else {
          alert('Place already exists in the list');
        }
        return;
      }
      
      currentMeetupPlaces.push(val);
      renderMeetupPlaces();
      input.value = '';
      
      const btn = document.getElementById('addMeetupPlaceBtn');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Adding...';
      
      await saveMeetupPlaces();
      
      btn.disabled = false;
      btn.innerHTML = originalText;
    });

    // Delete listener for meetup places
    document.getElementById('deleteMeetupPlaceBtn')?.addEventListener('click', async () => {
      const select = document.getElementById('meetupPlacesSelect');
      const selectedIndex = select.value;
      if (selectedIndex === "" || selectedIndex === null) return;
      
      currentMeetupPlaces.splice(parseInt(selectedIndex, 10), 1);
      renderMeetupPlaces();
      
      const btn = document.getElementById('deleteMeetupPlaceBtn');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Removing...';
      
      await saveMeetupPlaces();
      
      btn.disabled = false;
      btn.innerHTML = originalText;
    });

  });
})();
