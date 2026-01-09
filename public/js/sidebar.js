// Sidebar toggle functionality with auto-hide
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mainContent = document.getElementById('mainContent') || document.querySelector('.main-content');

// Initialize sidebar state on page load
function initSidebar() {
  if (window.innerWidth > 992) {
    // Desktop: start open (not collapsed)
    sidebar.classList.remove('collapsed');
    if (sidebarToggle) {
      sidebarToggle.classList.remove('collapsed');
      const icon = sidebarToggle.querySelector('i');
      if (icon) icon.className = 'fas fa-chevron-left';
    }
    if (mainContent) mainContent.classList.remove('expanded');
  }
}

function toggleSidebar() {
  if (window.innerWidth > 992) {
    // Desktop behavior
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    if (isCollapsed) {
      // Open sidebar
      sidebar.classList.remove('collapsed');
      sidebarToggle.classList.remove('collapsed');
      if (mainContent) mainContent.classList.remove('expanded');
      const icon = sidebarToggle.querySelector('i');
      if (icon) icon.className = 'fas fa-chevron-left';
    } else {
      // Close sidebar
      sidebar.classList.add('collapsed');
      sidebarToggle.classList.add('collapsed');
      if (mainContent) mainContent.classList.add('expanded');
      const icon = sidebarToggle.querySelector('i');
      if (icon) icon.className = 'fas fa-chevron-right';
    }
  } else {
    // Mobile behavior
    sidebar.classList.toggle('show');
    sidebarOverlay.classList.toggle('show');
    sidebarToggle.classList.toggle('sidebar-open');
    document.body.style.overflow = sidebar.classList.contains('show') ? 'hidden' : '';
  }
}

if (sidebarToggle) {
  sidebarToggle.addEventListener('click', toggleSidebar);
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', () => {
    if (window.innerWidth <= 992) {
      toggleSidebar();
    }
  });
}

// Close sidebar when clicking on a link
const sidebarLinks = document.querySelectorAll('.sidebar-nav-link');
sidebarLinks.forEach(link => {
  if (!link.querySelector('.fa-sign-out-alt')) {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 992) {
        // Mobile only: close overlay
        sidebar.classList.remove('show');
        sidebarOverlay.classList.remove('show');
        document.body.style.overflow = '';
      }
      // Desktop: keep sidebar open, don't auto-collapse
    });
  }
});

// Handle window resize
window.addEventListener('resize', () => {
  if (window.innerWidth > 992) {
    sidebar.classList.remove('show');
    sidebarOverlay.classList.remove('show');
    document.body.style.overflow = '';
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', initSidebar);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initSidebar();
}
