const rowsPerPage = 9;

const tableState = {
  table: null,
  pageType: '',
  rows: [],
  filteredRows: [],
  currentPage: 1,
};

function escapeText(value) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function normalizeDate(value) {
  if (!value) return '';
  return String(value).split('T')[0].trim();
}

function formatTime(value) {
  if (!value || value === '-') return '-';
  return String(value).slice(0, 5);
}

function inferPageType(table) {
  if (table?.dataset?.tableType) {
    return table.dataset.tableType;
  }

  const page = window.location.pathname.split('/').pop();
  if (page === 'students.html') return 'students';
  if (page === 'employee.html') return 'employees';
  if (page === 'attendance.html') return 'attendance';
  if (page === 'users.html') return 'users';
  return 'generic';
}

function getEndpoint(table) {
  return table?.dataset?.endpoint || '';
}

function buildRowModel(pageType, record) {
  switch (pageType) {
    case 'students':
      return {
        cells: [
          escapeText(record.student_number),
          escapeText(record.rfid_uid),
          escapeText(record.name),
          escapeText(record.course),
          escapeText(record.year_level),
          escapeText(record.department),
        ],
        searchText: [record.student_number, record.rfid_uid, record.name, record.course, record.year_level, record.department].join(' ').toLowerCase(),
        department: escapeText(record.department),
        typeValue: '',
        dateValue: normalizeDate(record.created_at),
      };
    case 'employees':
      return {
        cells: [
          escapeText(record.employee_number),
          escapeText(record.rfid_uid),
          escapeText(record.name),
          escapeText(record.position),
          escapeText(record.department),
        ],
        searchText: [record.employee_number, record.rfid_uid, record.name, record.position, record.department].join(' ').toLowerCase(),
        department: escapeText(record.department),
        typeValue: '',
        dateValue: normalizeDate(record.created_at),
      };
    case 'attendance':
      return {
        cells: [
          escapeText(record.log_date),
          escapeText(record.reference_number),
          escapeText(record.name),
          formatTime(record.time_in),
          formatTime(record.time_out),
          escapeText(record.created_at),
          escapeText(record.updated_at),
        ],
        searchText: [record.reference_number, record.name, record.department, record.status, record.record_type, record.log_date].join(' ').toLowerCase(),
        department: escapeText(record.department),
        typeValue: escapeText(record.status),
        dateValue: normalizeDate(record.log_date),
      };
    case 'users':
      return {
        cells: [
          escapeText(record.id),
          escapeText(record.name),
          escapeText(record.email),
          escapeText(record.role),
          escapeText(record.status),
          escapeText(record.created_at),
          escapeText(record.updated_at),
        ],
        searchText: [record.id, record.username, record.name, record.email, record.role, record.status].join(' ').toLowerCase(),
        department: '',
        typeValue: escapeText(record.role),
        dateValue: normalizeDate(record.created_at),
      };
    default:
      return {
        cells: Object.values(record).map(escapeText),
        searchText: Object.values(record).join(' ').toLowerCase(),
        department: '',
        typeValue: '',
        dateValue: '',
      };
  }
}

function renderNoDataRow(table, message) {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const row = document.createElement('tr');
  row.className = 'empty-row';

  const cell = document.createElement('td');
  cell.colSpan = table.querySelectorAll('thead th').length || 1;
  cell.textContent = message;
  row.appendChild(cell);
  tbody.appendChild(row);
}

function renderPageNumbers(totalPages) {
  const pageNumbersDiv = document.getElementById('pageNumbers');
  if (!pageNumbersDiv) return;

  pageNumbersDiv.innerHTML = '';

  const maxVisible = 4;
  const pages = [];

  if (totalPages <= maxVisible) {
    for (let index = 1; index <= totalPages; index += 1) {
      pages.push(index);
    }
  } else {
    pages.push(1);

    const start = Math.max(2, tableState.currentPage - 1);
    const end = Math.min(totalPages - 1, tableState.currentPage + 1);

    if (start > 2) {
      pages.push('...');
    }

    for (let index = start; index <= end; index += 1) {
      if (!pages.includes(index)) {
        pages.push(index);
      }
    }

    if (end < totalPages - 1) {
      pages.push('...');
    }

    if (!pages.includes(totalPages)) {
      pages.push(totalPages);
    }
  }

  pages.forEach((page) => {
    if (page === '...') {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'pagination-ellipsis';
      ellipsis.textContent = '...';
      pageNumbersDiv.appendChild(ellipsis);
      return;
    }

    const button = document.createElement('button');
    button.className = 'pg-btn';
    if (page === tableState.currentPage) {
      button.classList.add('active');
    }
    button.textContent = page;
    button.onclick = () => goToPage(page);
    pageNumbersDiv.appendChild(button);
  });
}

function updatePagination(totalPages) {
  const paginationDiv = document.querySelector('.pagination');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  if (!paginationDiv) return;

  if (totalPages <= 1) {
    paginationDiv.style.display = 'none';
    return;
  }

  paginationDiv.style.display = 'flex';
  if (prevBtn) prevBtn.disabled = tableState.currentPage === 1;
  if (nextBtn) nextBtn.disabled = tableState.currentPage >= totalPages;

  renderPageNumbers(totalPages);
}

function renderCurrentPage() {
  const table = tableState.table;
  if (!table) return;

  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const filteredRows = tableState.filteredRows;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  tableState.currentPage = Math.min(tableState.currentPage, totalPages);

  const start = (tableState.currentPage - 1) * rowsPerPage;
  const pageRows = filteredRows.slice(start, start + rowsPerPage);

  tbody.innerHTML = '';

  if (!pageRows.length) {
    renderNoDataRow(table, 'No matching records found.');
    updatePagination(0);
    return;
  }

  pageRows.forEach((record) => {
    const model = buildRowModel(tableState.pageType, record);
    const row = document.createElement('tr');

    if (record.department) {
      row.dataset.department = record.department;
    }
    if (model.typeValue) {
      row.dataset.type = model.typeValue;
    }
    if (model.dateValue) {
      row.dataset.date = model.dateValue;
    }
    row.dataset.searchText = model.searchText;

    model.cells.forEach((cellValue) => {
      const cell = document.createElement('td');
      cell.textContent = cellValue;
      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });

  updatePagination(totalPages);
}

function populateDepartmentSelect(rows) {
  const departmentSelect = document.getElementById('departmentSelect');
  if (!departmentSelect) return;

  const existingValue = departmentSelect.value || 'all';
  const departments = [...new Set(rows.map((row) => row.department).filter(Boolean))].sort();

  departmentSelect.innerHTML = '<option value="all">All Departments</option>';
  departments.forEach((department) => {
    const option = document.createElement('option');
    option.value = department;
    option.textContent = department;
    departmentSelect.appendChild(option);
  });

  if ([...departmentSelect.options].some((option) => option.value === existingValue)) {
    departmentSelect.value = existingValue;
  }
}

function applyFilters() {
  const searchInput = document.getElementById('searchInput');
  const typeSelect = document.getElementById('typeSelect');
  const dateInput = document.getElementById('dateInput');
  const departmentSelect = document.getElementById('departmentSelect');

  const searchVal = (searchInput?.value || '').trim().toLowerCase();
  const typeVal = (typeSelect?.value || 'all').trim().toLowerCase();
  const dateVal = normalizeDate(dateInput?.value || '');
  const departmentVal = (departmentSelect?.value || 'all').trim().toLowerCase();

  tableState.filteredRows = tableState.rows.filter((record) => {
    const model = buildRowModel(tableState.pageType, record);
    const matchesSearch = !searchVal || model.searchText.includes(searchVal);
    const matchesType = !typeVal || typeVal === 'all' || model.typeValue.toLowerCase() === typeVal;
    const matchesDate = !dateVal || model.dateValue === dateVal;
    const matchesDepartment = !departmentVal || departmentVal === 'all' || model.department.toLowerCase() === departmentVal;

    return matchesSearch && matchesType && matchesDate && matchesDepartment;
  });

  tableState.currentPage = 1;
  renderCurrentPage();
}

function bindTableControls() {
  const searchInput = document.getElementById('searchInput');
  const typeSelect = document.getElementById('typeSelect');
  const dateInput = document.getElementById('dateInput');
  const departmentSelect = document.getElementById('departmentSelect');

  searchInput?.addEventListener('input', applyFilters);
  typeSelect?.addEventListener('change', applyFilters);
  dateInput?.addEventListener('change', applyFilters);
  departmentSelect?.addEventListener('change', applyFilters);
}

async function loadTableData() {
  const table = document.querySelector('.data-table[data-endpoint]');
  if (!table) return;

  const endpoint = getEndpoint(table);
  if (!endpoint) return;

  tableState.table = table;
  tableState.pageType = inferPageType(table);

  const tbody = table.querySelector('tbody');
  if (tbody) {
    tbody.innerHTML = '';
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload.data) ? payload.data : [];

    tableState.rows = rows;
    tableState.filteredRows = rows.slice();

    if (tableState.pageType === 'students' || tableState.pageType === 'employees') {
      populateDepartmentSelect(rows);
    }

    bindTableControls();
    renderCurrentPage();
  } catch (error) {
    console.error('Failed to load table data:', error);
    renderNoDataRow(table, 'Unable to load records.');
    const paginationDiv = document.querySelector('.pagination');
    if (paginationDiv) {
      paginationDiv.style.display = 'none';
    }
  }
}

function goToPage(pageNum) {
  const totalPages = Math.max(1, Math.ceil(tableState.filteredRows.length / rowsPerPage));
  if (pageNum < 1 || pageNum > totalPages) return;

  tableState.currentPage = pageNum;
  renderCurrentPage();
}

function nextPage() {
  const totalPages = Math.max(1, Math.ceil(tableState.filteredRows.length / rowsPerPage));
  if (tableState.currentPage < totalPages) {
    goToPage(tableState.currentPage + 1);
  }
}

function prevPage() {
  if (tableState.currentPage > 1) {
    goToPage(tableState.currentPage - 1);
  }
}

function navigateWithTransition(href) {
  const overlay = document.getElementById('pageTransitionOverlay');
  if (overlay) {
    overlay.classList.add('active');
  }

  setTimeout(() => {
    window.location.href = href;
  }, 300);
}

function togglePassword() {
  const input = document.getElementById('password');
  const btn = document.querySelector('.toggle-password');
  if (!input || !btn) return;

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

function handleLogin(e) {
  if (e) e.preventDefault();

  const email = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;

  if (!email || !password) {
    alert('Please enter your email/username and password.');
    return;
  }

  if (email === 'admin' && password === 'admin123') {
    navigateWithTransition('users.html');
  } else {
    alert('Invalid credentials. Use admin / admin123 for demo.');
  }
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const isCollapsed = sidebar.classList.toggle('collapsed');
  document.documentElement.classList.toggle('sidebar-collapsed', isCollapsed);
  localStorage.setItem('sidebar-collapsed', isCollapsed ? '1' : '0');
}

function initLoadingSkeletons() {
  const wrappers = document.querySelectorAll('.table-wrapper');
  if (!wrappers.length) return;

  wrappers.forEach((wrapper) => {
    const table = wrapper.querySelector('.data-table');
    if (!table || table.dataset.endpoint) return;

    const columns = table.querySelectorAll('thead th').length || 5;
    const rowCount = 6;

    const skeleton = document.createElement('div');
    skeleton.className = 'table-skeleton';
    skeleton.style.setProperty('--skeleton-cols', columns);

    const header = document.createElement('div');
    header.className = 'skeleton-header';
    for (let column = 0; column < columns; column += 1) {
      const cell = document.createElement('span');
      cell.className = 'skeleton-cell';
      header.appendChild(cell);
    }
    skeleton.appendChild(header);

    for (let row = 0; row < rowCount; row += 1) {
      const rowEl = document.createElement('div');
      rowEl.className = 'skeleton-row';
      for (let column = 0; column < columns; column += 1) {
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
    confirmBtn?.removeEventListener('click', confirmHandler);
    cancelBtn?.removeEventListener('click', cancelHandler);
  };

  confirmBtn?.addEventListener('click', confirmHandler);
  cancelBtn?.addEventListener('click', cancelHandler);
}

function openDatePicker() {
  const input = document.getElementById('dateInput');
  if (input) input.showPicker ? input.showPicker() : input.click();
}

document.addEventListener('DOMContentLoaded', async () => {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    const collapsed = localStorage.getItem('sidebar-collapsed');
    if (collapsed === '1') {
      sidebar.classList.add('collapsed');
    }
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed === '1');
  }

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  initLoadingSkeletons();

  await loadTableData();

  const currentPage = window.location.pathname.split('/').pop();
  document.querySelectorAll('.sidebar-nav a').forEach((link) => {
    const href = link.getAttribute('href');
    if (href === currentPage) {
      link.classList.add('active');
    }

    link.addEventListener('click', (event) => {
      if (href !== currentPage) {
        event.preventDefault();
        navigateWithTransition(href);
      }
    });
  });
});
