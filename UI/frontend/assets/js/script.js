const rowsPerPage = 9;

const tableState = {
  table: null,
  pageType: '',
  rows: [],
  filteredRows: [],
  currentPage: 1,
};

const importState = {
  entity: '',
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

function parseNameParts(record) {
  if (!record) {
    return { lastName: '-', firstName: '-', middleName: '-' };
  }

  if (record.last_name || record.first_name || record.middle_name) {
    return {
      lastName: escapeText(record.last_name),
      firstName: escapeText(record.first_name),
      middleName: escapeText(record.middle_name),
    };
  }

  const fullName = String(record.name || '').trim();
  if (!fullName) {
    return { lastName: '-', firstName: '-', middleName: '-' };
  }

  const [lastRaw, firstRaw = ''] = fullName.split(',');
  const firstParts = firstRaw.trim().split(/\s+/).filter(Boolean);

  return {
    lastName: escapeText((lastRaw || '').trim()),
    firstName: escapeText(firstParts[0] || '-'),
    middleName: escapeText(firstParts.slice(1).join(' ') || '-'),
  };
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('appToast');
  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.className = `app-toast show ${type}`;

  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toast.className = 'app-toast';
  }, 2600);
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
        yearLevel: escapeText(record.year_level),
        course: escapeText(record.course),
        typeValue: '',
        dateValue: normalizeDate(record.created_at),
        record,
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
        position: escapeText(record.position),
        typeValue: '',
        dateValue: normalizeDate(record.created_at),
        record,
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
        typeValue: escapeText(record.record_type),
        dateValue: normalizeDate(record.log_date),
      };
    case 'users':
      return {
        cells: [
          escapeText(record.employee_number),
          escapeText(record.username),
          escapeText(record.name),
          escapeText(record.email),
          escapeText(record.role),
          escapeText(record.status),
          escapeText(record.created_at),
          escapeText(record.updated_at),
        ],
        searchText: [record.employee_number, record.username, record.name, record.email, record.role, record.status].join(' ').toLowerCase(),
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

    if (tableState.pageType === 'students' || tableState.pageType === 'employees' || tableState.pageType === 'users') {
      const actionCell = document.createElement('td');
      const actionWrap = document.createElement('div');
      actionWrap.className = 'row-actions';

      const viewBtn = document.createElement('button');
      viewBtn.className = 'row-action-btn view';
      viewBtn.textContent = 'View';
      viewBtn.onclick = (event) => {
        event.preventDefault();
        if (tableState.pageType === 'students') {
          openViewStudentModal(record);
        } else if (tableState.pageType === 'employees') {
          openViewEmployeeModal(record);
        } else if (tableState.pageType === 'users') {
          openViewUserModal(record);
        }
      };

      const editBtn = document.createElement('button');
      editBtn.className = 'row-action-btn edit';
      editBtn.textContent = 'Edit';
      editBtn.onclick = (event) => {
        event.preventDefault();
        if (tableState.pageType === 'students') {
          openEditStudentModal(record);
        } else if (tableState.pageType === 'employees') {
          openEditEmployeeModal(record);
        } else if (tableState.pageType === 'users') {
          openEditUserModal(record);
        }
      };

      actionWrap.appendChild(viewBtn);
      actionWrap.appendChild(editBtn);
      actionCell.appendChild(actionWrap);
      row.appendChild(actionCell);
    }

    tbody.appendChild(row);
  });

  // Add empty rows to pad to 9 rows
  const emptyRowsNeeded = rowsPerPage - pageRows.length;
  const colCount = table.querySelectorAll('thead th').length;
  for (let i = 0; i < emptyRowsNeeded; i++) {
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'empty-row';
    for (let j = 0; j < colCount; j++) {
      const cell = document.createElement('td');
      cell.textContent = '';
      emptyRow.appendChild(cell);
    }
    tbody.appendChild(emptyRow);
  }

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

  const yearLevelSelect = document.getElementById('yearLevelSelect');
  const courseSelect = document.getElementById('courseSelect');
  const positionSelect = document.getElementById('positionSelect');

  const yearLevelVal = (yearLevelSelect?.value || 'all').trim().toLowerCase();
  const courseVal = (courseSelect?.value || 'all').trim().toLowerCase();
  const positionVal = (positionSelect?.value || 'all').trim().toLowerCase();

  tableState.filteredRows = tableState.rows.filter((record) => {
    const model = buildRowModel(tableState.pageType, record);
    const matchesSearch = !searchVal || model.searchText.includes(searchVal);
    const matchesType = !typeVal || typeVal === 'all' || model.typeValue.toLowerCase() === typeVal;
    const matchesDate = !dateVal || model.dateValue === dateVal;
    const matchesDepartment = !departmentVal || departmentVal === 'all' || model.department.toLowerCase() === departmentVal;
    const matchesYearLevel = !yearLevelVal || yearLevelVal === 'all' || model.yearLevel?.toLowerCase() === yearLevelVal;
    const matchesCourse = !courseVal || courseVal === 'all' || model.course?.toLowerCase() === courseVal;
    const matchesPosition = !positionVal || positionVal === 'all' || model.position?.toLowerCase() === positionVal;

    return matchesSearch && matchesType && matchesDate && matchesDepartment && matchesYearLevel && matchesCourse && matchesPosition;
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
  
  bindAdditionalFilterControls();
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

  // Show skeleton
  const skeleton = document.querySelector('.table-skeleton');
  if (skeleton) skeleton.style.display = 'flex';
  table.style.visibility = 'hidden';

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

    if (tableState.pageType === 'students') {
      populateYearLevelSelect(rows);
      populateCourseSelect(rows);
    } else if (tableState.pageType === 'employees') {
      populatePositionSelect(rows);
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
  } finally {
    // Hide skeleton and show table
    if (skeleton) skeleton.style.display = 'none';
    table.style.visibility = 'visible';
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

// ===== ADD USER MODAL =====
function openAddUserModal() {
  const modal = document.getElementById('addUserModal');
  if (!modal) return;
  modal.querySelectorAll('input').forEach((el) => (el.value = ''));
  const roleSelect = document.getElementById('role');
  const statusSelect = document.getElementById('status');
  if (roleSelect) roleSelect.value = '';
  if (statusSelect) statusSelect.value = 'Active';
  resetAddUserPasswordField();
  modal.classList.add('show');
}

function closeAddUserModal() {
  const modal = document.getElementById('addUserModal');
  if (modal) modal.classList.remove('show');
  resetAddUserPasswordField();
}

function resetAddUserPasswordField() {
  const passwordInput = document.getElementById('password');
  const toggleButton = document.getElementById('passwordToggleBtn');
  const eyeShowIcon = toggleButton?.querySelector('.eye-icon-show');
  const eyeHideIcon = toggleButton?.querySelector('.eye-icon-hide');

  if (!passwordInput || !eyeShowIcon || !eyeHideIcon) return;

  passwordInput.type = 'password';
  eyeShowIcon.style.display = 'block';
  eyeHideIcon.style.display = 'none';
}

function saveAddUser() {
  const get = (id) => document.getElementById(id)?.value.trim() || '';
  const username = get('username');
  const firstName = get('first_name');
  const lastName = get('last_name');
  const email = get('email');
  const password = get('password');
  const role = get('role');

  if (!username || !firstName || !lastName || !email || !password || !role) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }
  // TODO: send POST to backend
  showToast('User added successfully.', 'success');
  closeAddUserModal();
}

function togglePasswordVisibility() {
  const passwordInput = document.getElementById('password');
  const toggleButton = document.getElementById('passwordToggleBtn');
  const eyeShowIcon = toggleButton?.querySelector('.eye-icon-show');
  const eyeHideIcon = toggleButton?.querySelector('.eye-icon-hide');

  if (!passwordInput || !eyeShowIcon || !eyeHideIcon) return;
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    eyeShowIcon.style.display = 'none';
    eyeHideIcon.style.display = 'block';
  } else {
    passwordInput.type = 'password';
    eyeShowIcon.style.display = 'block';
    eyeHideIcon.style.display = 'none';
  }
}

// ===== VIEW USER MODAL =====
function openViewUserModal(record) {
  const modal = document.getElementById('viewUserModal');
  if (!modal) return;

  const parts = parseNameParts(record);
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = escapeText(value);
  };

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = escapeText(value);
  };

  setValue('viewUserUsername', record.username);
  setValue('viewUserFirstName', parts.firstName);
  setValue('viewUserMiddleName', parts.middleName);
  setValue('viewUserLastName', parts.lastName);
  setValue('viewUserEmail', record.email);
  setValue('viewUserRole', record.role);
  setValue('viewUserStatus', record.status);
  setValue('viewUserEmployeeNo', record.employee_number);
  setText('viewUserCreatedAt', record.created_at || '-');
  setText('viewUserUpdatedAt', record.updated_at || '-');

  modal.classList.add('show');
}

function closeViewUserModal() {
  const modal = document.getElementById('viewUserModal');
  if (modal) modal.classList.remove('show');
}

// ===== EDIT USER MODAL =====
function openEditUserModal(record) {
  const modal = document.getElementById('editUserModal');
  if (!modal) {
    showToast('Edit modal not found.', 'error');
    return;
  }

  const parts = parseNameParts(record);
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = escapeText(value);
  };

  setValue('editUserUsername', record.username);
  setValue('editUserFirstName', parts.firstName);
  setValue('editUserMiddleName', parts.middleName);
  setValue('editUserLastName', parts.lastName);
  setValue('editUserEmail', record.email);
  setValue('editUserEmployeeNo', record.employee_number);
  
  const roleSelect = document.getElementById('editUserRole');
  if (roleSelect) roleSelect.value = record.role || '';
  
  const statusSelect = document.getElementById('editUserStatus');
  if (statusSelect) statusSelect.value = record.status || 'Active';

  modal._record = record;
  modal.classList.add('show');
}

function closeEditUserModal() {
  const modal = document.getElementById('editUserModal');
  if (modal) modal.classList.remove('show');
}

function saveEditUser() {
  const get = (id) => document.getElementById(id)?.value.trim() || '';
  const username = get('editUserUsername');
  const firstName = get('editUserFirstName');
  const lastName = get('editUserLastName');
  const email = get('editUserEmail');
  const role = get('editUserRole');
  const status = get('editUserStatus');

  if (!username || !firstName || !lastName || !email || !role || !status) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  // TODO: send PATCH/PUT to backend with updated user data
  showToast('User updated successfully.', 'success');
  closeEditUserModal();
}

function openViewStudentModal(record) {
  const modal = document.getElementById('viewStudentModal');
  if (!modal) return;

  const parts = parseNameParts(record);
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = escapeText(value);
  };

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = escapeText(value);
  };

  setValue('viewStudentLastName', parts.lastName);
  setValue('viewStudentFirstName', parts.firstName);
  setValue('viewStudentMiddleName', parts.middleName);
  setValue('viewStudentCourse', record.course);
  setValue('viewStudentYearLevel', record.year_level);
  setValue('viewStudentDepartment', record.department);
  setValue('viewStudentNumber', record.student_number);
  setValue('viewStudentRfid', record.rfid_uid);
  setText('viewStudentCreatedAt', record.created_at || '-');
  setText('viewStudentUpdatedAt', record.updated_at || '-');

  modal.classList.add('show');
}

function closeViewStudentModal() {
  const modal = document.getElementById('viewStudentModal');
  if (modal) modal.classList.remove('show');
}

function openViewEmployeeModal(record) {
  const modal = document.getElementById('viewEmployeeModal');
  if (!modal) return;

  const parts = parseNameParts(record);
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = escapeText(value);
  };

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = escapeText(value);
  };

  setValue('viewEmployeeLastName', parts.lastName);
  setValue('viewEmployeeFirstName', parts.firstName);
  setValue('viewEmployeeMiddleName', parts.middleName);
  setValue('viewEmployeePosition', record.position);
  setValue('viewEmployeeDepartment', record.department);
  setValue('viewEmployeeNumber', record.employee_number);
  setValue('viewEmployeeRfid', record.rfid_uid);
  setText('viewEmployeeCreatedAt', record.created_at || '-');
  setText('viewEmployeeUpdatedAt', record.updated_at || '-');

  modal.classList.add('show');
}

function closeViewEmployeeModal() {
  const modal = document.getElementById('viewEmployeeModal');
  if (modal) modal.classList.remove('show');
}

function openImportModal(entity) {
  const modal = document.getElementById('importModal');
  if (!modal) return;

  importState.entity = entity;
  const title = document.getElementById('importModalTitle');
  if (title) {
    title.textContent = `Upload ${entity === 'students' ? 'Student' : 'Employee'} File`;
  }

  modal.classList.add('show');
}

function closeImportModal() {
  const modal = document.getElementById('importModal');
  if (modal) modal.classList.remove('show');
}

function handleImportFile(file) {
  if (!file) return;

  const fileName = String(file.name || '').toLowerCase();
  const maxSize = 25 * 1024 * 1024;

  if (!fileName.endsWith('.xlsx')) {
    showToast('Import failed: only .xlsx files are allowed.', 'error');
    return;
  }

  if (file.size > maxSize) {
    showToast('Import failed: file is larger than 25 MB.', 'error');
    return;
  }

  showToast(`Import file accepted for ${importState.entity || 'selected'} records.`, 'success');
  closeImportModal();
}

function bindImportControls() {
  const openBtn = document.getElementById('openImportBtn');
  const fileInput = document.getElementById('importFileInput');
  const dropzone = document.getElementById('importDropzone');

  const entity = tableState.pageType === 'students' ? 'students' : tableState.pageType === 'employees' ? 'employees' : '';

  openBtn?.addEventListener('click', () => {
    if (!entity) return;
    openImportModal(entity);
  });

  fileInput?.addEventListener('change', (event) => {
    const file = event.target?.files?.[0];
    handleImportFile(file);
    event.target.value = '';
  });

  if (dropzone) {
    dropzone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropzone.classList.add('is-dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('is-dragover');
    });

    dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-dragover');
      const file = event.dataTransfer?.files?.[0];
      handleImportFile(file);
    });
  }
}

function bindAddButtons() {
  const addStudentBtn = document.getElementById('addStudentBtn');
  const addEmployeeBtn = document.getElementById('addEmployeeBtn');

  addStudentBtn?.addEventListener('click', () => {
    showToast('Add Student form will open here.', 'success');
  });

  addEmployeeBtn?.addEventListener('click', () => {
    showToast('Add Employee form will open here.', 'success');
  });
}

function closeAddUserModal() {
  const modal = document.getElementById('addUserModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

// ===== EDIT STUDENT MODAL =====
function openEditStudentModal(record) {
  const modal = document.getElementById('editStudentModal');
  if (!modal) {
    showToast('Edit modal not found.', 'error');
    return;
  }

  const parts = parseNameParts(record);
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = escapeText(value);
  };

  setValue('editStudentFirstName', parts.firstName);
  setValue('editStudentMiddleName', parts.middleName);
  setValue('editStudentLastName', parts.lastName);
  setValue('editStudentNumber', record.student_number);
  setValue('editStudentCourse', record.course);
  setValue('editStudentYearLevel', record.year_level);
  setValue('editStudentDepartment', record.department);
  setValue('editStudentRfid', record.rfid_uid);

  modal._record = record;
  modal.classList.add('show');
}

function closeEditStudentModal() {
  const modal = document.getElementById('editStudentModal');
  if (modal) modal.classList.remove('show');
}

function saveEditStudent() {
  const rfid = document.getElementById('editStudentRfid')?.value.trim();
  if (!rfid) {
    showToast('RFID UID cannot be empty.', 'error');
    return;
  }
  // TODO: send PATCH/PUT to backend with updated rfid
  showToast('Student RFID updated successfully.', 'success');
  closeEditStudentModal();
}

function openAddStudentModal() {
  const modal = document.getElementById('addStudentModal');
  if (!modal) return;
  modal.querySelectorAll('input').forEach((el) => (el.value = ''));
  modal.classList.add('show');
}

function closeAddStudentModal() {
  const modal = document.getElementById('addStudentModal');
  if (modal) modal.classList.remove('show');
}

function saveAddStudent() {
  const get = (id) => document.getElementById(id)?.value.trim() || '';
  const firstName = get('addStudentFirstName');
  const lastName = get('addStudentLastName');
  const studentNumber = get('addStudentNumber');

  if (!firstName || !lastName || !studentNumber) {
    showToast('First name, last name, and student number are required.', 'error');
    return;
  }
  // TODO: send POST to backend
  showToast('Student added successfully.', 'success');
  closeAddStudentModal();
}

// ===== EDIT EMPLOYEE MODAL =====
function openEditEmployeeModal(record) {
  const modal = document.getElementById('editEmployeeModal');
  if (!modal) {
    showToast('Edit modal not found.', 'error');
    return;
  }

  const parts = parseNameParts(record);
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = escapeText(value);
  };

  setValue('editEmployeeFirstName', parts.firstName);
  setValue('editEmployeeMiddleName', parts.middleName);
  setValue('editEmployeeLastName', parts.lastName);
  setValue('editEmployeeNumber', record.employee_number);
  setValue('editEmployeeDepartment', record.department);
  setValue('editEmployeePosition', record.position);
  setValue('editEmployeeRfid', record.rfid_uid);

  modal._record = record;
  modal.classList.add('show');
}

function closeEditEmployeeModal() {
  const modal = document.getElementById('editEmployeeModal');
  if (modal) modal.classList.remove('show');
}

function saveEditEmployee() {
  const rfid = document.getElementById('editEmployeeRfid')?.value.trim();
  if (!rfid) {
    showToast('RFID UID cannot be empty.', 'error');
    return;
  }
  // TODO: send PATCH/PUT to backend with updated rfid
  showToast('Employee RFID updated successfully.', 'success');
  closeEditEmployeeModal();
}

function openAddEmployeeModal() {
  const modal = document.getElementById('addEmployeeModal');
  if (!modal) return;
  modal.querySelectorAll('input').forEach((el) => (el.value = ''));
  modal.classList.add('show');
}

function closeAddEmployeeModal() {
  const modal = document.getElementById('addEmployeeModal');
  if (modal) modal.classList.remove('show');
}

function saveAddEmployee() {
  const get = (id) => document.getElementById(id)?.value.trim() || '';
  const firstName = get('addEmployeeFirstName');
  const lastName = get('addEmployeeLastName');
  const employeeNumber = get('addEmployeeNumber');

  if (!firstName || !lastName || !employeeNumber) {
    showToast('First name, last name, and employee number are required.', 'error');
    return;
  }
  // TODO: send POST to backend
  showToast('Employee added successfully.', 'success');
  closeAddEmployeeModal();
}

// ===== BIND ADD BUTTONS =====
function bindAddButtons() {
  const addStudentBtn = document.getElementById('addStudentBtn');
  const addEmployeeBtn = document.getElementById('addEmployeeBtn');

  addStudentBtn?.addEventListener('click', openAddStudentModal);
  addEmployeeBtn?.addEventListener('click', openAddEmployeeModal);
}

// ===== POPULATE FILTER SELECTS =====
function populateYearLevelSelect(rows) {
  const select = document.getElementById('yearLevelSelect');
  if (!select) return;

  const existingValue = select.value || 'all';
  const yearLevels = [...new Set(rows.map((row) => row.year_level).filter(Boolean))].sort();

  select.innerHTML = '<option value="all">All Year Levels</option>';
  yearLevels.forEach((yearLevel) => {
    const option = document.createElement('option');
    option.value = yearLevel;
    option.textContent = yearLevel;
    select.appendChild(option);
  });

  if ([...select.options].some((option) => option.value === existingValue)) {
    select.value = existingValue;
  }
}

function populateCourseSelect(rows) {
  const select = document.getElementById('courseSelect');
  if (!select) return;

  const existingValue = select.value || 'all';
  const courses = [...new Set(rows.map((row) => row.course).filter(Boolean))].sort();

  select.innerHTML = '<option value="all">All Courses</option>';
  courses.forEach((course) => {
    const option = document.createElement('option');
    option.value = course;
    option.textContent = course;
    select.appendChild(option);
  });

  if ([...select.options].some((option) => option.value === existingValue)) {
    select.value = existingValue;
  }
}

function populatePositionSelect(rows) {
  const select = document.getElementById('positionSelect');
  if (!select) return;

  const existingValue = select.value || 'all';
  const positions = [...new Set(rows.map((row) => row.position).filter(Boolean))].sort();

  select.innerHTML = '<option value="all">All Positions</option>';
  positions.forEach((position) => {
    const option = document.createElement('option');
    option.value = position;
    option.textContent = position;
    select.appendChild(option);
  });

  if ([...select.options].some((option) => option.value === existingValue)) {
    select.value = existingValue;
  }
}

// ===== BIND ADDITIONAL FILTER CONTROLS =====
function bindAdditionalFilterControls() {
  const yearLevelSelect = document.getElementById('yearLevelSelect');
  const courseSelect = document.getElementById('courseSelect');
  const positionSelect = document.getElementById('positionSelect');

  yearLevelSelect?.addEventListener('change', () => {
    tableState.currentPage = 1;
    applyFilters();
  });
  
  courseSelect?.addEventListener('change', () => {
    tableState.currentPage = 1;
    applyFilters();
  });
  
  positionSelect?.addEventListener('change', () => {
    tableState.currentPage = 1;
    applyFilters();
  });
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
  bindImportControls();
  bindAddButtons();

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
