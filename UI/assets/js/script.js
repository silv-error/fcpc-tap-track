// ===== PAGE TRANSITIONS =====
function navigateWithTransition(href) {
  const overlay = document.getElementById('pageTransitionOverlay');
  if (overlay) {
    overlay.classList.add('active');
  }
  
  setTimeout(() => {
    window.location.href = href;
  }, 300);
}

// ===== TOGGLE PASSWORD VISIBILITY =====
function togglePassword() {
  const input = document.getElementById('password');
  const btn = document.querySelector('.toggle-password');
  if (!input) return;

  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none"
        viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>`;
  } else {
    input.type = 'password';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none"
        viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>`;
  }
}

// ===== LOGIN FORM =====
function handleLogin(e) {
  if (e) e.preventDefault();

  const email = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;

  if (!email || !password) {
    alert('Please enter your email/username and password.');
    return;
  }

  // Demo credentials
  if (email === 'admin' && password === 'admin123') {
    navigateWithTransition('users.html');
  } else {
    alert('Invalid credentials. Use admin / admin123 for demo.');
  }
}

// ===== SIDEBAR TOGGLE =====
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    // Save state to localStorage
    localStorage.setItem('sidebar-collapsed', isCollapsed ? '1' : '0');
  }
}

// ===== TABLE SEARCH & FILTER =====
function initTableFilter() {
  const searchInput = document.getElementById('searchInput');
  const typeSelect = document.getElementById('typeSelect');
  const dateInput = document.getElementById('dateInput');

  function filterTable() {
    const searchVal = (searchInput?.value || '').toLowerCase();
    const typeVal = (typeSelect?.value || 'all').toLowerCase();
    const dateVal = (dateInput?.value || '');

    const rows = document.querySelectorAll('.data-table tbody tr:not(.empty-row)');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (!cells.length) return;

      const rowText = Array.from(cells).map(c => c.textContent.toLowerCase()).join(' ');
      const matchSearch = !searchVal || rowText.includes(searchVal);
      const matchType = !typeVal || typeVal === 'all' || rowText.includes(typeVal);
      const matchDate = !dateVal || rowText.includes(dateVal);

      row.style.display = (matchSearch && matchType && matchDate) ? '' : 'none';
    });
  }

  searchInput?.addEventListener('input', filterTable);
  typeSelect?.addEventListener('change', filterTable);
  dateInput?.addEventListener('change', filterTable);
}

// ===== DATE PICKER TRIGGER =====
function openDatePicker() {
  const input = document.getElementById('dateInput');
  if (input) input.showPicker ? input.showPicker() : input.click();
}

// ===== LOGOUT =====
function handleLogout() {
  const modal = document.getElementById('logoutModal');
  const confirmBtn = document.getElementById('logoutConfirm');
  const cancelBtn = document.getElementById('logoutCancel');

  if (!modal) return;

  modal.classList.add('show');

  const confirmHandler = () => {
    navigateWithTransition('index.html');
  };

  const cancelHandler = () => {
    modal.classList.remove('show');
    confirmBtn.removeEventListener('click', confirmHandler);
    cancelBtn.removeEventListener('click', cancelHandler);
  };

  confirmBtn.addEventListener('click', confirmHandler);
  cancelBtn.addEventListener('click', cancelHandler);
}

// ===== INIT ON DOM READY =====
document.addEventListener('DOMContentLoaded', () => {
  // Restore sidebar state from localStorage
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    const collapsed = localStorage.getItem('sidebar-collapsed');
    if (collapsed === '1') {
      sidebar.classList.add('collapsed');
    }
  }

  // Login form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  // Table filter
  initTableFilter();

  // Active sidebar link and tab transitions
  const currentPage = window.location.pathname.split('/').pop();
  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage) {
      link.classList.add('active');
    }
    
    // Add click handler for tab transitions
    link.addEventListener('click', (e) => {
      if (href !== currentPage) {
        e.preventDefault();
        navigateWithTransition(href);
      }
    });
  });
});