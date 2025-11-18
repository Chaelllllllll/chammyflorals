// Sidebar toggle functionality
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function toggleSidebar() {
  sidebar.classList.toggle('show');
  sidebarOverlay.classList.toggle('show');
  sidebarToggle.classList.toggle('sidebar-open');
  document.body.style.overflow = sidebar.classList.contains('show') ? 'hidden' : '';
}

if (sidebarToggle) {
  sidebarToggle.addEventListener('click', toggleSidebar);
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', toggleSidebar);
}

// Close sidebar when clicking on a link (mobile)
const sidebarLinks = document.querySelectorAll('.sidebar-nav-link');
sidebarLinks.forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth <= 992) {
      toggleSidebar();
    }
  });
});

// Handle window resize
window.addEventListener('resize', () => {
  if (window.innerWidth > 992) {
    sidebar.classList.remove('show');
    sidebarOverlay.classList.remove('show');
    document.body.style.overflow = '';
  }
});
