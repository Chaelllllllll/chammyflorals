// Check authentication
const adminToken = localStorage.getItem('adminToken');
if (!adminToken) {
    window.location.href = '/admin/login.html';
}

// Logout functionality
document.getElementById('logoutButton').addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminName');
        window.location.href = '/admin/login.html';
    }
});

// Announcements Management
const API_URL = '/api/announcements';
let editingId = null;
let allAnnouncements = []; // Store all announcements for filtering
const imageInputEl = document.getElementById('image');

// Toggle form visibility
document.getElementById('createAnnouncementBtn').addEventListener('click', () => {
    document.getElementById('announcementFormContainer').style.display = 'block';
    document.getElementById('title').focus();
});

document.getElementById('cancelBtn').addEventListener('click', () => {
    resetForm();
    document.getElementById('announcementFormContainer').style.display = 'none';
});

// Search and filter functionality
document.getElementById('searchInput').addEventListener('input', filterAnnouncements);
document.getElementById('statusFilter').addEventListener('change', filterAnnouncements);
document.getElementById('typeFilter').addEventListener('change', filterAnnouncements);

function filterAnnouncements() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;
    
    const filtered = allAnnouncements.filter(ann => {
        const matchesSearch = ann.title.toLowerCase().includes(searchTerm) || 
                            ann.description.toLowerCase().includes(searchTerm);
        const matchesStatus = statusFilter === 'all' || 
                            (statusFilter === 'active' && ann.is_active) ||
                            (statusFilter === 'inactive' && !ann.is_active);
        const matchesType = typeFilter === 'all' || ann.type === typeFilter;
        
        return matchesSearch && matchesStatus && matchesType;
    });
    
    displayAnnouncements(filtered);
    updateMetrics();
}

// Update metrics
function updateMetrics() {
    const total = allAnnouncements.length;
    const active = allAnnouncements.filter(a => a.is_active).length;
    const inactive = total - active;
    
    document.getElementById('metricTotal').textContent = total;
    document.getElementById('metricActive').textContent = active;
    document.getElementById('metricInactive').textContent = inactive;
}

// Load all announcements
async function loadAnnouncements() {
    try {
        const response = await fetch(`${API_URL}/admin`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminName');
            window.location.href = '/admin/login.html';
            return;
        }
        
        if (!response.ok) {
            throw new Error('Failed to load announcements');
        }
        
        const data = await response.json();
        allAnnouncements = data.announcements || data;
        displayAnnouncements(allAnnouncements);
        updateMetrics();
    } catch (error) {
        document.getElementById('announcementsList').innerHTML = `
            <div class="alert alert-danger">
                <i class="fa fa-exclamation-triangle me-2"></i>Failed to load announcements: ${error.message}
            </div>
        `;
    }
}

// Display announcements
function displayAnnouncements(announcements) {
    const list = document.getElementById('announcementsList');

    if (!announcements || announcements.length === 0) {
        list.innerHTML = '<p class="text-center text-muted py-4">No announcements yet. Create your first announcement above!</p>';
        return;
    }

    list.innerHTML = announcements.map(ann => `
        <div class="announcement-item">
            <div class="row g-3">
                ${ann.image_url ? `
                    <div class="col-md-4">
                        <img src="${ann.image_url}" alt="${ann.title}" class="img-fluid" 
                             style="width: 100%; height: 200px; object-fit: cover; border-radius: 8px;"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div class="announcement-placeholder-admin" style="display: none; width: 100%; height: 200px; align-items: center; justify-content: center; background: linear-gradient(135deg, #fff6f9 0%, #ffe9f0 100%); border-radius: 8px;">
                            <i class="fa fa-bullhorn" style="font-size: 50px; color: #ff6f9b; opacity: 0.3;"></i>
                        </div>
                    </div>
                ` : `
                    <div class="col-md-4">
                        <div class="announcement-placeholder-admin" style="display: flex; width: 100%; height: 200px; align-items: center; justify-content: center; background: linear-gradient(135deg, #fff6f9 0%, #ffe9f0 100%); border-radius: 8px;">
                            <i class="fa fa-bullhorn" style="font-size: 50px; color: #ff6f9b; opacity: 0.3;"></i>
                        </div>
                    </div>
                `}
                <div class="col-md-8">
                    <div class="mb-2">
                        <h5 class="mb-0" style="color: #ff6f9b; font-weight: 600;">${ann.title}</h5>
                    </div>
                    <p class="mb-3 text-muted">${ann.description}</p>
                    <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
                        <span class="badge ${ann.is_active ? 'badge-active' : 'badge-inactive'}">
                            <i class="fa ${ann.is_active ? 'fa-check-circle' : 'fa-ban'} me-1"></i>
                            ${ann.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <span class="badge" style="background: #ff6f9b;">
                            <i class="fa fa-tag me-1"></i>${ann.type.replace('_', ' ').toUpperCase()}
                        </span>
                        <small class="text-muted">
                            <i class="fa fa-calendar me-1"></i>
                            Created: ${new Date(ann.created_at).toLocaleDateString()}
                        </small>
                    </div>
                    <div class="d-flex gap-2 justify-content-end">
                        <button class="btn btn-sm me-2" style="background: #ffb3d9; border-color: #ffb3d9; color: white;" onclick="editAnnouncement('${ann.id}')" title="Edit">
                            <i class="fa fa-edit me-1"></i>Edit
                        </button>
                        <button class="btn btn-sm" style="background: #ff6f9b; border-color: #ff6f9b; color: white;" onclick="deleteAnnouncement('${ann.id}')" title="Delete">
                            <i class="fa fa-trash me-1"></i>Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Create or update announcement
document.getElementById('announcementForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    
    formData.append('title', document.getElementById('title').value);
    formData.append('description', document.getElementById('description').value);
    formData.append('type', document.getElementById('type').value);
    formData.append('is_active', document.getElementById('is_active').checked);
    
    const imageFile = document.getElementById('image').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }
    
    try {
        const url = editingId ? `${API_URL}/${editingId}` : API_URL;
        const method = editingId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${adminToken}`
            },
            body: formData
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminName');
            window.location.href = '/admin/login.html';
            return;
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save announcement');
        }
        
        alert(editingId ? 'Announcement updated successfully!' : 'Announcement created successfully!');
        resetForm();
        document.getElementById('announcementFormContainer').style.display = 'none';
        loadAnnouncements();
    } catch (error) {
        alert('Failed to save announcement: ' + error.message);
    }
});

// Edit announcement
window.editAnnouncement = async function(id) {
    try {
        const ann = allAnnouncements.find(a => a.id === id);

        if (ann) {
            editingId = id;
            document.getElementById('announcementId').value = id;
            document.getElementById('title').value = ann.title;
            document.getElementById('description').value = ann.description;
            document.getElementById('type').value = ann.type;
            document.getElementById('is_active').checked = ann.is_active;
            
            document.getElementById('formTitle').textContent = 'Edit Announcement';
            document.getElementById('submitBtnText').textContent = 'Update Announcement';
            document.getElementById('announcementFormContainer').style.display = 'block';
            
            // Scroll to form
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (error) {
        alert('Error loading announcement details: ' + error.message);
    }
};

// Delete announcement
window.deleteAnnouncement = async function(id) {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    
    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminName');
            window.location.href = '/admin/login.html';
            return;
        }
        
        if (!response.ok) {
            throw new Error('Failed to delete announcement');
        }
        
        alert('Announcement deleted successfully!');
        loadAnnouncements();
    } catch (error) {
        alert('Failed to delete announcement: ' + error.message);
    }
};

// Reset form
function resetForm() {
    editingId = null;
    document.getElementById('announcementForm').reset();
    document.getElementById('announcementId').value = '';
    document.getElementById('formTitle').textContent = 'Create New Announcement';
    document.getElementById('submitBtnText').textContent = 'Create Announcement';
    document.getElementById('is_active').checked = true;
    if (imageInputEl) imageInputEl.value = '';
}

// Initial load
loadAnnouncements();
