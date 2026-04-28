// ===== PAGINATION =====
let currentPage = 1;
const rowsPerPage = 9;

function initPagination() {
  const table = document.querySelector('.data-table');
  if (!table) return;

  const rows = Array.from(table.querySelectorAll('tbody tr:not(.empty-row)'));
  const totalPages = Math.ceil(rows.length / rowsPerPage);

  if (totalPages <= 1) {
    const paginationDiv = document.querySelector('.pagination');
    if (paginationDiv) {
      paginationDiv.style.display = 'none';
    }
    return;
  }

  renderPageNumbers(totalPages);
  showPage(currentPage, rows, totalPages);
}

function renderPageNumbers(totalPages) {
  const pageNumbersDiv = document.getElementById('pageNumbers');
  if (!pageNumbersDiv) return;

  pageNumbersDiv.innerHTML = '';

  // Show first few pages and current page context
  const maxVisible = 4;
  const pages = [];

  if (totalPages <= maxVisible) {
    // Show all pages if total is small
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);

    // Show pages around current page
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) {
      pages.push('...');
    }

    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) {
        pages.push(i);
      }
    }

    if (end < totalPages - 1) {
      pages.push('...');
    }

    // Always show last page
    if (!pages.includes(totalPages)) {
      pages.push(totalPages);
    }
  }

  // Render buttons
  pages.forEach((page) => {
    if (page === '...') {
      const span = document.createElement('span');
      span.className = 'pagination-ellipsis';
      span.textContent = '...';
      pageNumbersDiv.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.className = 'pg-btn';
      if (page === currentPage) {
        btn.classList.add('active');
      }
      btn.textContent = page;
      btn.onclick = () => goToPage(page);
      pageNumbersDiv.appendChild(btn);
    }
  });
}

function showPage(pageNum, rows, totalPages) {
  const table = document.querySelector('.data-table');
  if (!table) return;

  const tbody = table.querySelector('tbody');
  const allRows = Array.from(table.querySelectorAll('tbody tr:not(.empty-row)'));
  const start = (pageNum - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const visibleDataRows = allRows.slice(start, end);

  allRows.forEach((row, index) => {
    row.style.display = (index >= start && index < end) ? '' : 'none';
  });

  // Remove existing empty rows
  const existingEmptyRows = tbody.querySelectorAll('tr.empty-row');
  existingEmptyRows.forEach(row => row.remove());

  // Add empty rows to pad current page to 9 rows
  const emptyRowsNeeded = rowsPerPage - visibleDataRows.length;
  for (let i = 0; i < emptyRowsNeeded; i++) {
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'empty-row';
    // Create the same number of cells as the visible data rows
    if (visibleDataRows.length > 0) {
      const cellCount = visibleDataRows[0].querySelectorAll('td').length;
      for (let j = 0; j < cellCount; j++) {
        const cell = document.createElement('td');
        cell.textContent = '';
        emptyRow.appendChild(cell);
      }
    }
    tbody.appendChild(emptyRow);
  }

  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  if (prevBtn) prevBtn.disabled = pageNum === 1;
  if (nextBtn) nextBtn.disabled = pageNum === totalPages;

  renderPageNumbers(totalPages);
}

function goToPage(pageNum) {
  const table = document.querySelector('.data-table');
  if (!table) return;

  const rows = Array.from(table.querySelectorAll('tbody tr:not(.empty-row)'));
  const totalPages = Math.ceil(rows.length / rowsPerPage);

  if (pageNum < 1 || pageNum > totalPages) return;

  currentPage = pageNum;
  showPage(currentPage, rows, totalPages);
}

function nextPage() {
  const table = document.querySelector('.data-table');
  if (!table) return;

  const rows = Array.from(table.querySelectorAll('tbody tr:not(.empty-row)'));
  const totalPages = Math.ceil(rows.length / rowsPerPage);

  if (currentPage < totalPages) {
    goToPage(currentPage + 1);
  }
}

function prevPage() {
  if (currentPage > 1) {
    goToPage(currentPage - 1);
  }
}

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
    document.documentElement.classList.toggle('sidebar-collapsed', isCollapsed);
    // Save state to localStorage
    localStorage.setItem('sidebar-collapsed', isCollapsed ? '1' : '0');
  }
}

// ===== TABLE LOADING SKELETONS =====
function initLoadingSkeletons() {
  const wrappers = document.querySelectorAll('.table-wrapper');
  if (!wrappers.length) return;

  wrappers.forEach((wrapper) => {
    const table = wrapper.querySelector('.data-table');
    if (!table) return;

    const columns = table.querySelectorAll('thead th').length || 5;
    const rowCount = 6;

    const skeleton = document.createElement('div');
    skeleton.className = 'table-skeleton';
    skeleton.style.setProperty('--skeleton-cols', columns);

    const header = document.createElement('div');
    header.className = 'skeleton-header';
    for (let col = 0; col < columns; col += 1) {
      const cell = document.createElement('span');
      cell.className = 'skeleton-cell';
      header.appendChild(cell);
    }
    skeleton.appendChild(header);

    for (let row = 0; row < rowCount; row += 1) {
      const rowEl = document.createElement('div');
      rowEl.className = 'skeleton-row';

      for (let col = 0; col < columns; col += 1) {
        const cell = document.createElement('span');
        cell.className = 'skeleton-cell';
        rowEl.appendChild(cell);
      }

      skeleton.appendChild(rowEl);
    }

    wrapper.appendChild(skeleton);
    wrapper.classList.add('loading');

    setTimeout(() => {
      wrapper.classList.remove('loading');
      skeleton.remove();
    }, 550);
  });
}

// ===== TABLE SEARCH & FILTER =====
function initTableFilter() {
  const searchInput = document.getElementById('searchInput');
  const typeSelect = document.getElementById('typeSelect');
  const dateInput = document.getElementById('dateInput');
  const departmentSelect = document.getElementById('departmentSelect');
  const table = document.querySelector('.data-table');
  const rows = table ? Array.from(table.querySelectorAll('tbody tr:not(.empty-row)')) : [];

  if (departmentSelect && rows.length) {
    const departments = [...new Set(rows.map((row) => row.dataset.department || '').filter(Boolean))].sort();

    departments.forEach((department) => {
      const option = document.createElement('option');
      option.value = department;
      option.textContent = department;
      departmentSelect.appendChild(option);
    });
  }

  function filterTable() {
    const searchVal = (searchInput?.value || '').toLowerCase();
    const typeVal = (typeSelect?.value || 'all').toLowerCase();
    const dateVal = (dateInput?.value || '');
    const departmentVal = (departmentSelect?.value || 'all').toLowerCase();

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (!cells.length) return;

      const rowText = Array.from(cells).map(c => c.textContent.toLowerCase()).join(' ');
      const rowDepartment = (row.dataset.department || rowText).toLowerCase();
      const matchSearch = !searchVal || rowText.includes(searchVal);
      const matchType = !typeVal || typeVal === 'all' || rowText.includes(typeVal);
      const matchDate = !dateVal || rowText.includes(dateVal);
      const matchDepartment = !departmentVal || departmentVal === 'all' || rowDepartment.includes(departmentVal);

      row.style.display = (matchSearch && matchType && matchDate && matchDepartment) ? '' : 'none';
    });
  }

  searchInput?.addEventListener('input', filterTable);
  typeSelect?.addEventListener('change', filterTable);
  dateInput?.addEventListener('change', filterTable);
  departmentSelect?.addEventListener('change', filterTable);
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
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed === '1');
  }

  // Login form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  // Table filter
  initTableFilter();

  // Pagination
  initPagination();

  // Loading skeleton
  initLoadingSkeletons();

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