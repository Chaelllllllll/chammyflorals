// Dynamic Sidebar rendering and responsive control functionality

// Render the sidebar menu dynamically to maintain single-source-of-truth routing
function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const currentPath = window.location.pathname;

  const sections = [
    {
      label: "Main",
      items: [
        { href: "/admin/dashboard.html", icon: "fas fa-tachometer-alt", text: "Dashboard" }
      ]
    },
    {
      label: "Orders",
      items: [
        { href: "/admin/to-deliver.html", icon: "fas fa-truck", text: "To Deliver" },
        { href: "/admin/todo.html", icon: "fas fa-tasks", text: "To Do" },
        { href: "/admin/custom-orders.html", icon: "fas fa-palette", text: "Customized Orders" }
      ]
    },
    {
      label: "Store",
      items: [
        { href: "/admin/products.html", icon: "fas fa-box-open", text: "Products" },
        { href: "/admin/customization.html", icon: "fas fa-swatchbook", text: "Customized Products" },
        { href: "/admin/reviews.html", icon: "fas fa-star", text: "Reviews" },
        { href: "/admin/vouchers.html", icon: "fas fa-ticket-alt", text: "Vouchers" }
      ]
    },
    {
      label: "Communication",
      items: [
        { 
          href: "/admin/messages.html", 
          icon: "fas fa-comments", 
          text: "Messages",
          id: "messagesNavLink",
          badgeId: "messagesBadge"
        },
        { href: "/admin/announcements.html", icon: "fas fa-bullhorn", text: "Announcements" }
      ]
    },
    {
      label: "Analytics",
      items: [
        { href: "/admin/calendar.html", icon: "fas fa-calendar-alt", text: "Calendar" },
        { href: "/admin/reports.html", icon: "fas fa-chart-line", text: "Transactions" },
        { href: "/admin/analytics.html", icon: "fas fa-chart-area", text: "Analytics" }
      ]
    },
    {
      label: "Settings",
      items: [
        { href: "/admin/admins.html", icon: "fas fa-user-shield", text: "Admins" }
      ]
    }
  ];

  let html = `
    <div class="sidebar-header">
      <a href="/admin/dashboard.html" class="sidebar-brand">
        <i class="fas fa-spa me-2"></i>
        <span>Chammy Florals</span>
      </a>
    </div>
    <ul class="sidebar-nav">
  `;

  sections.forEach(section => {
    html += `<li class="sidebar-section-label">${section.label}</li>`;
    section.items.forEach(item => {
      // Handle active state matching path name exactly or relatively
      const isActive = (currentPath === item.href || currentPath.endsWith(item.href)) ? 'active' : '';
      const linkId = item.id ? `id="${item.id}"` : '';
      html += `
        <li class="sidebar-nav-item">
          <a href="${item.href}" class="sidebar-nav-link ${isActive}" ${linkId}>
            <i class="${item.icon}"></i>
            <span>${item.text}</span>
            ${item.badgeId ? `<span id="${item.badgeId}" class="badge bg-danger" style="display: none;">0</span>` : ''}
          </a>
        </li>
      `;
    });
  });

  html += `
      <!-- Logout -->
      <li class="sidebar-nav-item mt-4">
        <button class="btn btn-pink w-100" id="logoutButton">
          <i class="fas fa-sign-out-alt me-2"></i>Logout
        </button>
      </li>
    </ul>
  `;

  sidebar.innerHTML = html;
}

// Generate the sidebar markup first
renderSidebar();

const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mainContent = document.getElementById('mainContent') || document.querySelector('.main-content');

// Initialize sidebar state on page load
function initSidebar() {
  if (window.innerWidth > 992) {
    // Desktop: start open (not collapsed)
    if (sidebar) sidebar.classList.remove('collapsed');
    if (sidebarToggle) {
      sidebarToggle.classList.remove('collapsed');
      const icon = sidebarToggle.querySelector('i');
      if (icon) icon.className = 'fas fa-chevron-left';
    }
    if (mainContent) mainContent.classList.remove('expanded');
  }
}

function toggleSidebar() {
  if (!sidebar) return;
  if (window.innerWidth > 992) {
    // Desktop behavior
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    if (isCollapsed) {
      // Open sidebar
      sidebar.classList.remove('collapsed');
      if (sidebarToggle) sidebarToggle.classList.remove('collapsed');
      if (mainContent) mainContent.classList.remove('expanded');
      if (sidebarToggle) {
        const icon = sidebarToggle.querySelector('i');
        if (icon) icon.className = 'fas fa-chevron-left';
      }
    } else {
      // Close sidebar
      sidebar.classList.add('collapsed');
      if (sidebarToggle) sidebarToggle.classList.add('collapsed');
      if (mainContent) mainContent.classList.add('expanded');
      if (sidebarToggle) {
        const icon = sidebarToggle.querySelector('i');
        if (icon) icon.className = 'fas fa-chevron-right';
      }
    }
  } else {
    // Mobile behavior
    sidebar.classList.toggle('show');
    if (sidebarOverlay) {
      sidebarOverlay.classList.toggle('show');
    }
    if (sidebarToggle) sidebarToggle.classList.toggle('sidebar-open');
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
        if (sidebar) sidebar.classList.remove('show');
        if (sidebarOverlay) {
          sidebarOverlay.classList.remove('show');
        }
        document.body.style.overflow = '';
      }
    });
  }
});

// Handle window resize
window.addEventListener('resize', () => {
  if (window.innerWidth > 992) {
    if (sidebar) sidebar.classList.remove('show');
    if (sidebarOverlay) {
      sidebarOverlay.classList.remove('show');
    }
    document.body.style.overflow = '';
  }
});

// Bind logout trigger
const logoutBtn = document.getElementById('logoutButton');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    document.cookie = "adminToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = '/customer-login.html';
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  renderSidebar(); // Re-render in case element wasn't ready
  initSidebar();
  
  // Re-bind logout in case of re-render
  const rebindLogoutBtn = document.getElementById('logoutButton');
  if (rebindLogoutBtn) {
    rebindLogoutBtn.addEventListener('click', () => {
      localStorage.removeItem('adminToken');
      document.cookie = "adminToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      window.location.href = '/customer-login.html';
    });
  }
});
