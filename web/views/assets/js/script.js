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

const exportState = {
  entity: '',
};

const realtimeState = {
  timer: null,
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

function formatLongDate(value) {
  if (!value || value === '-') return '-';
  try {
    const date = new Date(value);
    const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = date.toLocaleDateString('en-US', dateOptions);
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateStr} ${timeStr}`;
  } catch {
    return String(value);
  }
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
  if (page === 'students.php')  return 'students';
  if (page === 'employee.php')  return 'employees';
  if (page === 'attendance.php') return 'attendance';
  if (page === 'users.php')     return 'users';
  return 'generic';
}

function getEndpoint(table) {
  return table?.dataset?.endpoint || '';
}

const USER_OVERRIDES_STORAGE_KEY = 'fcpc-users-ui-overrides';

function getUserRecordKey(record) {
  const candidates = [record?.id, record?.employee_id, record?.employee_number, record?.username, record?.email];
  const key = candidates.find((value) => value !== null && value !== undefined && String(value).trim() !== '' && String(value).trim() !== '-');
  return String(key ?? '');
}

function readUserOverrides() {
  try {
    const raw = localStorage.getItem(USER_OVERRIDES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('Unable to read user overrides:', error);
    return {};
  }
}

function writeUserOverrides(overrides) {
  try {
    localStorage.setItem(USER_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch (error) {
    console.warn('Unable to persist user overrides:', error);
  }
}

function mergeUserOverrides(rows) {
  const overrides = readUserOverrides();

  return rows.map((record) => {
    const key = getUserRecordKey(record);
    if (!key || !overrides[key]) return record;
    return { ...record, ...overrides[key] };
  });
}

function saveUserOverride(record, updates) {
  const key = getUserRecordKey(record);
  if (!key) return record;

  const overrides = readUserOverrides();
  overrides[key] = { ...(overrides[key] || {}), ...updates };
  writeUserOverrides(overrides);

  return { ...record, ...overrides[key] };
}

function buildRowModel(pageType, record) {
  switch (pageType) {
    case 'students':
      return {
        cells: [
          escapeText(record.student_number),
          escapeText(record.rfid_uid),
          escapeText(record.name),
          escapeText(record.program),
          escapeText(record.year_level),
          escapeText(record.department),
        ],
        searchText: [record.student_number, record.rfid_uid, record.name, record.program, record.year_level, record.department].join(' ').toLowerCase(),
        department: escapeText(record.department),
        yearLevel: escapeText(record.year_level),
        program: escapeText(record.program),
        category: escapeText(record.category),
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
          record.is_active ? 'Active' : 'Inactive',
        ],
        searchText: [record.employee_number, record.username, record.name, record.email, record.role, record.is_active ? 'Active' : 'Inactive'].join(' ').toLowerCase(),
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
    const end   = Math.min(totalPages - 1, tableState.currentPage + 1);

    if (start > 2) pages.push('...');

    for (let index = start; index <= end; index += 1) {
      if (!pages.includes(index)) pages.push(index);
    }

    if (end < totalPages - 1) pages.push('...');
    if (!pages.includes(totalPages)) pages.push(totalPages);
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
    if (page === tableState.currentPage) button.classList.add('active');
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

function triggerPaginationTransition() {
  const table = tableState.table;
  if (!table) return;

  const wrapper = table.closest('.table-wrapper');
  if (!wrapper) return;

  wrapper.classList.remove('pagination-transition');
  void wrapper.offsetWidth;
  wrapper.classList.add('pagination-transition');

  window.clearTimeout(triggerPaginationTransition._timer);
  triggerPaginationTransition._timer = window.setTimeout(() => {
    wrapper.classList.remove('pagination-transition');
  }, 240);
}

function renderCurrentPage() {
  const table = tableState.table;
  if (!table) return;

  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const filteredRows = tableState.filteredRows;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  tableState.currentPage = Math.min(tableState.currentPage, totalPages);

  const start    = (tableState.currentPage - 1) * rowsPerPage;
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

    if (record.department)  row.dataset.department = record.department;
    if (model.typeValue)    row.dataset.type        = model.typeValue;
    if (model.dateValue)    row.dataset.date        = model.dateValue;
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
        } else {
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
        } else {
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

  // Pad to rowsPerPage with empty rows to keep table height stable
  const colCount = table.querySelectorAll('thead th').length;
  for (let i = pageRows.length; i < rowsPerPage; i++) {
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'empty-row';
    for (let j = 0; j < colCount; j++) {
      emptyRow.appendChild(document.createElement('td'));
    }
    tbody.appendChild(emptyRow);
  }

  updatePagination(totalPages);
}

function populateDepartmentSelect() {
  const departmentSelect = document.getElementById('departmentSelect');
  if (!departmentSelect) return;

  const existingValue = departmentSelect.value || 'all';
  const studentDepartments = [
    'College of Accountancy',
    'College of Allied Medical Sciences',
    'College of Business Management',
    'College of Criminal Justice',
    'College of Education',
    'College of Computer Studies',
    'College of Arts and Sciences',
    'College of Engineering',
    'Basic Education',
    'Senior High School (Academic)',
    'Senior High School (Technical-Vocational)',
    'Senior High School (Information and Communication Technology)',
    'Senior High School (Agriculture and Fishery Arts)',
    'Senior High School (Arts and Design)',
  ];
  const employeeDepartments = [
    'College of Accountancy',
    'College of Allied Medical Sciences',
    'College of Business Management',
    'College of Criminal Justice',
    'College of Education',
    'College of Computer Studies',
    'College of Arts and Sciences',
    'College of Engineering',
    'Basic Education',
    'Senior High School (Academic)',
    'Senior High School (Technical-Vocational)',
    'Senior High School (Information and Communication Technology)',
    'Senior High School (Agriculture and Fishery Arts)',
    'Senior High School (Arts and Design)',
  ];
  const departments = tableState.pageType === 'students' ? studentDepartments : employeeDepartments;

  departmentSelect.innerHTML = '<option value="all">All Departments</option>';
  departments.forEach((department) => {
    const option = document.createElement('option');
    option.value = department;
    option.textContent = department;
    departmentSelect.appendChild(option);
  });

  if ([...departmentSelect.options].some((o) => o.value === existingValue)) {
    departmentSelect.value = existingValue;
  }
}

function populateYearLevelSelect(rows) {
  const select = document.getElementById('yearLevelSelect');
  if (!select) return;

  const existingValue = select.value || 'all';
  const yearLevels = [
    'Kindergarten',
    'Elementary',
    'Junior High School',
    'Senior High School',
    'College',
  ];

  select.innerHTML = '<option value="all">All Year Levels</option>';
  yearLevels.forEach((yearLevel) => {
    const option = document.createElement('option');
    option.value = yearLevel;
    option.textContent = yearLevel;
    select.appendChild(option);
  });

  if ([...select.options].some((o) => o.value === existingValue)) {
    select.value = existingValue;
  }
}

function populateCategorySelect(rows) {
  const select = document.getElementById('categorySelect');
  if (!select) return;

  const existingValue = select.value || 'all';
  const categories = [...new Set(rows.map((row) => row.category).filter(Boolean))].sort();

  select.innerHTML = '<option value="all">All Categories</option>';
  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  if ([...select.options].some((o) => o.value === existingValue)) {
    select.value = existingValue;
  }
}

function populateStrandSelect(rows) {
  const select = document.getElementById('strandSelect');
  if (!select) return;

  const existingValue = select.value || 'all';
  const strands = [...new Set(rows.map((row) => row.strand).filter(Boolean))].sort();

  select.innerHTML = '<option value="all">All Strands</option>';
  strands.forEach((strand) => {
    const option = document.createElement('option');
    option.value = strand;
    option.textContent = strand;
    select.appendChild(option);
  });

  if ([...select.options].some((o) => o.value === existingValue)) {
    select.value = existingValue;
  }
}

function populateCourseSelect(rows) {
  const select = document.getElementById('programSelect');
  if (!select) return;

  const existingValue = select.value || 'all';
  const courses = [
    'Bachelor of Science in Accountancy',
    'Bachelor of Science in Management Accounting',
    'Bachelor of Science in Accounting Information System',
    'Bachelor of Science in Internal Auditing',
    'Bachelor of Science in Nursing',
    'Bachelor of Science in Midwifery',
    'Bachelor of Science in Hospitality Management',
    'Bachelor of Science in Tourism Management',
    'Bachelor of Science in Office Management',
    'Bachelor of Science in Business Administration Major in Finance Management',
    'Bachelor of Science in Business Administration Major in Marketing Management',
    'Bachelor of Science in Criminology',
    'Bachelor of Elementary Education',
    'Bachelor of Secondary Education Major in: English, Science, Mathematics, Social Studies, Values Education, and Filipino',
    'Certificate in Teaching Education',
    'Bachelor of Physical Education',
    'Bachelor of Technology & Livelihood Education',
    'Bachelor of Science in Information Technology with CISCO Certification program',
    'Bachelor of Science in Information Technology with specialization in Software Engineering',
    'Bachelor of Science in Information Technology with specialization in Cybersecurity',
    'Bachelor of Science in Computer Science',
    'Bachelor or Arts in Communication',
    'Bachelor of Science in Biology',
    'Bachelor of Science in Psychology',
    'Bachelor or Arts in Psychology',
    'Bachelor of Science in Civil Engineering',
    'Kindergarten',
    'Elementary',
    'Junior High School (With STE Programs)',
    'Senior High School',
    'General Academic Strand (GAS)',
    'Accountancy, Business and Management (ABM)',
    'Humanities and Social Sciences Strand (HUMSS)',
    'Science, Technology, Engineering, and Mathematics Strand (STEM)',
    'Home Economics',
    'Tourism Promotion Services (NC II)',
    'Front Office Services (NC II)',
    'Beauty/Nail Care (NC II)',
    'Bread and Pastry Production (NC II)',
    'Food and Beverage Services (NC II)',
    'Hair Dressing (NC II)',
    'Cookery (NC II)',
    'Commercial Cooking (NC II)',
    'Caregiving (NC II)',
    'Contact Center Services (NC II)',
    'Computer Hardware Servicing (NC II)',
    'Technical Drafting (NC II)',
    'Crop Production (NC II)',
    'Organic Agriculture (NC II)',
    'Performing Arts',
    'Visual Arts',
  ];

  select.innerHTML = '<option value="all">All Programs</option>';
  courses.forEach((course) => {
    const option = document.createElement('option');
    option.value = course;
    option.textContent = course;
    select.appendChild(option);
  });

  if ([...select.options].some((o) => o.value === existingValue)) {
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

  if ([...select.options].some((o) => o.value === existingValue)) {
    select.value = existingValue;
  }
}

function applyFilters(resetToFirstPage = true) {
  const searchInput      = document.getElementById('searchInput');
  const typeSelect       = document.getElementById('typeSelect');
  const dateInput        = document.getElementById('dateInput');
  const departmentSelect = document.getElementById('departmentSelect');
  const yearLevelSelect  = document.getElementById('yearLevelSelect');
  const programSelect     = document.getElementById('programSelect');
  const categorySelect   = document.getElementById('categorySelect');
  const positionSelect   = document.getElementById('positionSelect');

  const searchVal     = (searchInput?.value      || '').trim().toLowerCase();
  const typeVal       = (typeSelect?.value        || 'all').trim().toLowerCase();
  const dateVal       = normalizeDate(dateInput?.value || '');
  const departmentVal = (departmentSelect?.value  || 'all').trim().toLowerCase();
  const yearLevelVal  = (yearLevelSelect?.value   || 'all').trim().toLowerCase();
  const programVal     = (programSelect?.value      || 'all').trim().toLowerCase();
  const categoryVal   = (categorySelect?.value   || 'all').trim().toLowerCase();
  const positionVal   = (positionSelect?.value    || 'all').trim().toLowerCase();

  tableState.filteredRows = tableState.rows.filter((record) => {
    const model = buildRowModel(tableState.pageType, record);
    return (
      (!searchVal     || model.searchText.includes(searchVal))                              &&
      (!typeVal       || typeVal       === 'all' || model.typeValue.toLowerCase()  === typeVal)  &&
      (!dateVal       || model.dateValue === dateVal)                                        &&
      (!departmentVal || departmentVal === 'all' || model.department.toLowerCase() === departmentVal) &&
      (!yearLevelVal  || yearLevelVal  === 'all' || model.yearLevel?.toLowerCase()  === yearLevelVal) &&
      (!programVal     || programVal     === 'all' || model.program?.toLowerCase()     === programVal)    &&
      (!categoryVal   || categoryVal   === 'all' || model.category?.toLowerCase()   === categoryVal)    &&
      (!positionVal   || positionVal   === 'all' || model.position?.toLowerCase()   === positionVal)
    );
  });

  if (resetToFirstPage) {
    tableState.currentPage = 1;
  }
  renderCurrentPage();
}

function bindAdditionalFilterControls() {
  ['yearLevelSelect', 'programSelect', 'categorySelect', 'positionSelect'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      tableState.currentPage = 1;
      applyFilters();
    });
  });
}

function bindTableControls() {
  document.getElementById('searchInput')?.addEventListener('input', applyFilters);
  document.getElementById('typeSelect')?.addEventListener('change', applyFilters);
  document.getElementById('dateInput')?.addEventListener('change', applyFilters);
  document.getElementById('departmentSelect')?.addEventListener('change', applyFilters);
  bindAdditionalFilterControls();
}

async function loadTableData() {
  const table = document.querySelector('.data-table[data-endpoint]');
  if (!table) return;

  const endpoint = getEndpoint(table);
  if (!endpoint) return;

  tableState.table    = table;
  tableState.pageType = inferPageType(table);

  const tbody = table.querySelector('tbody');
  if (tbody) tbody.innerHTML = '';

  const skeleton = document.querySelector('.table-skeleton');
  if (skeleton) skeleton.style.display = 'flex';
  table.style.visibility = 'hidden';

  try {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });

    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

    const payload = await response.json();
    const rows    = Array.isArray(payload.data) ? payload.data : [];

    if (tableState.pageType === 'users') {
      tableState.rows = mergeUserOverrides(rows);
    } else {
      tableState.rows = rows;
    }
    tableState.filteredRows = tableState.rows.slice();

    if (tableState.pageType === 'students' || tableState.pageType === 'employees') {
      populateDepartmentSelect();
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
    document.querySelector('.pagination')?.style.setProperty('display', 'none');
  } finally {
    if (skeleton) skeleton.style.display = 'none';
    table.style.visibility = 'visible';
  }
}

function goToPage(pageNum) {
  const totalPages = Math.max(1, Math.ceil(tableState.filteredRows.length / rowsPerPage));
  if (pageNum < 1 || pageNum > totalPages) return;
  tableState.currentPage = pageNum;
  triggerPaginationTransition();
  renderCurrentPage();
}

function nextPage() {
  const totalPages = Math.max(1, Math.ceil(tableState.filteredRows.length / rowsPerPage));
  if (tableState.currentPage < totalPages) goToPage(tableState.currentPage + 1);
}

function prevPage() {
  if (tableState.currentPage > 1) goToPage(tableState.currentPage - 1);
}

function navigateWithTransition(href) {
  const overlay = document.getElementById('pageTransitionOverlay');
  if (overlay) overlay.classList.add('active');
  setTimeout(() => { window.location.href = href; }, 300);
}

function togglePassword() {
  const input = document.getElementById('password');
  const btn   = document.querySelector('.toggle-password');
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

async function handleLogin(e) {
  if (e) e.preventDefault();

  const email    = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;
  const btn      = document.querySelector('#loginForm .btn-login');
  const message  = document.getElementById('loginMessage');

  const showLoginMessage = (text, type = 'error') => {
    if (!message) return;
    message.textContent = text;
    message.className = `login-message ${type}`;
    message.hidden = false;
  };

  const clearLoginMessage = () => {
    if (!message) return;
    message.textContent = '';
    message.className = 'login-message';
    message.hidden = true;
  };

  if (!email || !password) {
    showLoginMessage('Please enter your email/username and password.');
    return;
  }

  clearLoginMessage();

  if (btn) { btn.disabled = true; btn.textContent = 'Logging in…'; }

  try {
    const res  = await fetch('login.php', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
      body:    JSON.stringify({ email, password }),
    });

    const contentType = res.headers.get('content-type') || '';
    const json = contentType.includes('application/json')
      ? await res.json()
      : { success: false, message: await res.text() };

    if (json.success) {
      showLoginMessage(json.message || 'Login successful.', 'success');
      navigateWithTransition('users.php');
    } else {
      showLoginMessage(json.message || 'Invalid credentials.');
    }
  } catch (err) {
    showLoginMessage('Unable to reach the server. Please try again.');
    console.error('Login error:', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Log in'; }
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

    const columns  = table.querySelectorAll('thead th').length || 5;
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
  const modal      = document.getElementById('logoutModal');
  const confirmBtn = document.getElementById('logoutConfirm');
  const cancelBtn  = document.getElementById('logoutCancel');
  if (!modal) return;

  modal.classList.add('show');

  const confirmHandler = async () => {
    try {
      await fetch('logout.php', { method: 'POST', headers: { 'X-CSRF-Token': getCsrfToken(), 'Accept': 'application/json' } });
    } catch (e) {
      console.warn('Logout request failed:', e);
    } finally {
      navigateWithTransition('index.php');
    }
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

// ── Export ───────────────────────────────────────────────────────────────────

function getExportPageLabel(pageType) {
  if (pageType === 'students') return 'Student';
  if (pageType === 'employees') return 'Employee';
  if (pageType === 'attendance') return 'Attendance';
  return 'Record';
}

function getUniqueFieldValues(rows, field) {
  return [...new Set(rows.map((row) => escapeText(row?.[field])).filter((value) => value && value !== '-'))].sort((a, b) => a.localeCompare(b));
}

function getExportHeadersAndRows(pageType, rows) {
  switch (pageType) {
    case 'students':
      return {
        headers: ['Student No.', 'RFID UID', 'Name', 'Program', 'Year Level', 'Department'],
        rows: rows.map((record) => [
          escapeText(record.student_number),
          escapeText(record.rfid_uid),
          escapeText(record.name),
          escapeText(record.program),
          escapeText(record.year_level),
          escapeText(record.department),
        ]),
      };
    case 'employees':
      return {
        headers: ['Employee No.', 'RFID UID', 'Name', 'Position', 'Department'],
        rows: rows.map((record) => [
          escapeText(record.employee_number),
          escapeText(record.rfid_uid),
          escapeText(record.name),
          escapeText(record.position),
          escapeText(record.department),
        ]),
      };
    case 'attendance':
      return {
        headers: ['Date', 'ID', 'Name', 'Time In', 'Time Out'],
        rows: rows.map((record) => [
          escapeText(record.log_date),
          escapeText(record.reference_number),
          escapeText(record.name),
          escapeText(record.time_in),
          escapeText(record.time_out),
        ]),
      };
    default:
      return { headers: [], rows: [] };
  }
}

function getExportSortValue(pageType, record, sortKey) {
  const parts = parseNameParts(record);

  switch (pageType) {
    case 'students':
      if (sortKey === 'student_number') return escapeText(record.student_number);
      if (sortKey === 'department') return escapeText(record.department);
      if (sortKey === 'program') return escapeText(record.program);
      if (sortKey === 'year_level') return escapeText(record.year_level);
      return parts.lastName;
    case 'employees':
      if (sortKey === 'employee_number') return escapeText(record.employee_number);
      if (sortKey === 'department') return escapeText(record.department);
      if (sortKey === 'position') return escapeText(record.position);
      return parts.lastName;
    case 'attendance':
      if (sortKey === 'reference_number') return escapeText(record.reference_number);
      if (sortKey === 'type') return escapeText(record.record_type);
      if (sortKey === 'name') return escapeText(record.name);
      return escapeText(record.log_date);
    default:
      return '';
  }
}

function getExportModalBody(pageType, rows) {
  const optionsFromRows = (field, allLabel) => {
    const uniqueValues = getUniqueFieldValues(rows, field);
    const options = [`<option value="all">${allLabel}</option>`];

    uniqueValues.forEach((value) => {
      options.push(`<option value="${value.replace(/"/g, '&quot;')}">${value}</option>`);
    });

    return options.join('');
  };

  if (pageType === 'students') {
    return `
      <div class="export-body-grid">
        <div class="export-field export-field-full" style="position:relative;">
          <label for="exportSearchInput">Search</label>
          <input id="exportSearchInput" type="text" class="export-control" placeholder="Enter Name or Student Number" autocomplete="off" oninput="onExportSearchInput()" onfocus="onExportSearchInput()" />
          <div id="exportSearchResults" style="position:absolute; left:0; right:0; top:100%; margin-top:6px; border:1px solid #d0d7de; border-radius:8px; max-height:220px; overflow-y:auto; display:none; background:#fff; box-shadow:0 8px 24px rgba(15,23,42,0.12); z-index:50;"></div>
        </div>

        <div class="export-section-label export-field-full">Filter</div>

        <div class="export-field">
          <label for="exportDepartmentSelect">Department</label>
          <select id="exportDepartmentSelect" class="export-control export-select">
            <option value="all">All Departments</option>
            <option value="College of Accountancy">College of Accountancy</option>
            <option value="College of Allied Medical Sciences">College of Allied Medical Sciences</option>
            <option value="College of Business Management">College of Business Management</option>
            <option value="College of Criminal Justice">College of Criminal Justice</option>
            <option value="College of Education">College of Education</option>
            <option value="College of Computer Studies">College of Computer Studies</option>
            <option value="College of Arts and Sciences">College of Arts and Sciences</option>
            <option value="College of Engineering">College of Engineering</option>
            <option value="Basic Education">Basic Education</option>
            <option value="Senior High School (Academic)">Senior High School (Academic)</option>
            <option value="Senior High School (Technical-Vocational)">Senior High School (Technical-Vocational)</option>
            <option value="Senior High School (Information and Communication Technology)">Senior High School (Information and Communication Technology)</option>
            <option value="Senior High School (Agriculture and Fishery Arts)">Senior High School (Agriculture and Fishery Arts)</option>
            <option value="Senior High School (Arts and Design)">Senior High School (Arts and Design)</option>
          </select>
        </div>

        <div class="export-field">
          <label for="exportProgramSelect">Program</label>
          <select id="exportProgramSelect" class="export-control export-select">
            <option value="all">All Programs</option>
            <option value="Bachelor of Science in Accountancy">Bachelor of Science in Accountancy</option>
            <option value="Bachelor of Science in Management Accounting">Bachelor of Science in Management Accounting</option>
            <option value="Bachelor of Science in Accounting Information System">Bachelor of Science in Accounting Information System</option>
            <option value="Bachelor of Science in Internal Auditing">Bachelor of Science in Internal Auditing</option>
            <option value="Bachelor of Science in Nursing">Bachelor of Science in Nursing</option>
            <option value="Bachelor of Science in Midwifery">Bachelor of Science in Midwifery</option>
            <option value="Bachelor of Science in Hospitality Management">Bachelor of Science in Hospitality Management</option>
            <option value="Bachelor of Science in Tourism Management">Bachelor of Science in Tourism Management</option>
            <option value="Bachelor of Science in Office Management">Bachelor of Science in Office Management</option>
            <option value="Bachelor of Science in Business Administration Major in Finance Management">Bachelor of Science in Business Administration Major in Finance Management</option>
            <option value="Bachelor of Science in Business Administration Major in Marketing Management">Bachelor of Science in Business Administration Major in Marketing Management</option>
            <option value="Bachelor of Science in Criminology">Bachelor of Science in Criminology</option>
            <option value="Bachelor of Elementary Education">Bachelor of Elementary Education</option>
            <option value="Bachelor of Secondary Education Major in: English, Science, Mathematics, Social Studies, Values Education, and Filipino">Bachelor of Secondary Education Major in: English, Science, Mathematics, Social Studies, Values Education, and Filipino</option>
            <option value="Certificate in Teaching Education">Certificate in Teaching Education</option>
            <option value="Bachelor of Physical Education">Bachelor of Physical Education</option>
            <option value="Bachelor of Technology & Livelihood Education">Bachelor of Technology & Livelihood Education</option>
            <option value="Bachelor of Science in Information Technology with CISCO Certification program">Bachelor of Science in Information Technology with CISCO Certification program</option>
            <option value="Bachelor of Science in Information Technology with specialization in Software Engineering">Bachelor of Science in Information Technology with specialization in Software Engineering</option>
            <option value="Bachelor of Science in Information Technology with specialization in Cybersecurity">Bachelor of Science in Information Technology with specialization in Cybersecurity</option>
            <option value="Bachelor of Science in Computer Science">Bachelor of Science in Computer Science</option>
            <option value="Bachelor or Arts in Communication">Bachelor or Arts in Communication</option>
            <option value="Bachelor of Science in Biology">Bachelor of Science in Biology</option>
            <option value="Bachelor of Science in Psychology">Bachelor of Science in Psychology</option>
            <option value="Bachelor or Arts in Psychology">Bachelor or Arts in Psychology</option>
            <option value="Bachelor of Science in Civil Engineering">Bachelor of Science in Civil Engineering</option>
            <option value="Kindergarten">Kindergarten</option>
            <option value="Elementary">Elementary</option>
            <option value="Junior High School (With STE Programs)">Junior High School (With STE Programs)</option>
            <option value="Senior High School">Senior High School</option>
            <option value="General Academic Strand (GAS)">General Academic Strand (GAS)</option>
            <option value="Accountancy, Business and Management (ABM)">Accountancy, Business and Management (ABM)</option>
            <option value="Humanities and Social Sciences Strand (HUMSS)">Humanities and Social Sciences Strand (HUMSS)</option>
            <option value="Science, Technology, Engineering, and Mathematics Strand (STEM)">Science, Technology, Engineering, and Mathematics Strand (STEM)</option>
            <option value="Home Economics">Home Economics</option>
            <option value="Tourism Promotion Services (NC II)">Tourism Promotion Services (NC II)</option>
            <option value="Front Office Services (NC II)">Front Office Services (NC II)</option>
            <option value="Beauty/Nail Care (NC II)">Beauty/Nail Care (NC II)</option>
            <option value="Bread and Pastry Production (NC II)">Bread and Pastry Production (NC II)</option>
            <option value="Food and Beverage Services (NC II)">Food and Beverage Services (NC II)</option>
            <option value="Hair Dressing (NC II)">Hair Dressing (NC II)</option>
            <option value="Cookery (NC II)">Cookery (NC II)</option>
            <option value="Commercial Cooking (NC II)">Commercial Cooking (NC II)</option>
            <option value="Caregiving (NC II)">Caregiving (NC II)</option>
            <option value="Contact Center Services (NC II)">Contact Center Services (NC II)</option>
            <option value="Computer Hardware Servicing (NC II)">Computer Hardware Servicing (NC II)</option>
            <option value="Technical Drafting (NC II)">Technical Drafting (NC II)</option>
            <option value="Crop Production (NC II)">Crop Production (NC II)</option>
            <option value="Organic Agriculture (NC II)">Organic Agriculture (NC II)</option>
            <option value="Performing Arts">Performing Arts</option>
            <option value="Visual Arts">Visual Arts</option>
          </select>
        </div>

        <div class="export-field export-field-full" style="position:relative;">
          <label>Year Level</label>
          <div class="export-checkbox-row">
            <label class="export-checkbox">
              <input type="checkbox" id="exportYearLevelAll" class="export-year-level-all" />
              <span>All</span>
            </label>
            ${['1st Year', '2nd Year', '3rd Year', '4th Year'].map((level) => `
              <label class="export-checkbox">
                <input type="checkbox" name="exportYearLevel" value="${level}" class="export-year-level-item" />
                <span>${level}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="export-section-label export-field-full">Sort By</div>

        <div class="export-field">
          <label for="exportPrimarySort">Primary Sort</label>
          <select id="exportPrimarySort" class="export-control export-select">
            <option value="last_name">Last Name (A-Z)</option>
            <option value="student_number">Student No. (A-Z)</option>
            <option value="department">Department (A-Z)</option>
            <option value="program">Program (A-Z)</option>
            <option value="year_level">Year Level (A-Z)</option>
          </select>
        </div>

        <div class="export-field">
          <label for="exportSortOrder">Order</label>
          <select id="exportSortOrder" class="export-control export-select">
            <option value="asc">Ascending (A-Z)</option>
            <option value="desc">Descending (Z-A)</option>
          </select>
        </div>
      </div>
    `;
  }

  if (pageType === 'employees') {
    return `
      <div class="export-body-grid">
        <div class="export-field export-field-full" style="position:relative;">
          <label for="exportSearchInput">Search</label>
          <input id="exportSearchInput" type="text" class="export-control" placeholder="Enter Name or Employee Number" autocomplete="off" oninput="onExportSearchInput()" onfocus="onExportSearchInput()" />
          <div id="exportSearchResults" style="position:absolute; left:0; right:0; top:100%; margin-top:6px; border:1px solid #d0d7de; border-radius:8px; max-height:220px; overflow-y:auto; display:none; background:#fff; box-shadow:0 8px 24px rgba(15,23,42,0.12); z-index:50;"></div>
        </div>

        <div class="export-section-label export-field-full">Filter</div>

        <div class="export-field">
          <label for="exportDepartmentSelect">Department</label>
          <select id="exportDepartmentSelect" class="export-control export-select">
            <option value="all">All Departments</option>
            <option value="College of Accountancy">College of Accountancy</option>
            <option value="College of Allied Medical Sciences">College of Allied Medical Sciences</option>
            <option value="College of Business Management">College of Business Management</option>
            <option value="College of Criminal Justice">College of Criminal Justice</option>
            <option value="College of Education">College of Education</option>
            <option value="College of Computer Studies">College of Computer Studies</option>
            <option value="College of Arts and Sciences">College of Arts and Sciences</option>
            <option value="College of Engineering">College of Engineering</option>
            <option value="Basic Education">Basic Education</option>
            <option value="Senior High School (Academic)">Senior High School (Academic)</option>
            <option value="Senior High School (Technical-Vocational)">Senior High School (Technical-Vocational)</option>
            <option value="Senior High School (Information and Communication Technology)">Senior High School (Information and Communication Technology)</option>
            <option value="Senior High School (Agriculture and Fishery Arts)">Senior High School (Agriculture and Fishery Arts)</option>
            <option value="Senior High School (Arts and Design)">Senior High School (Arts and Design)</option>
          </select>
        </div>

        <div class="export-field">
          <label for="exportPositionSelect">Position</label>
          <select id="exportPositionSelect" class="export-control export-select">
            ${optionsFromRows('position', 'All Positions')}
          </select>
        </div>

        <div class="export-section-label export-field-full">Sort By</div>

        <div class="export-field">
          <label for="exportPrimarySort">Primary Sort</label>
          <select id="exportPrimarySort" class="export-control export-select">
            <option value="last_name">Last Name (A-Z)</option>
            <option value="employee_number">Employee No. (A-Z)</option>
            <option value="department">Department (A-Z)</option>
            <option value="position">Position (A-Z)</option>
          </select>
        </div>

        <div class="export-field">
          <label for="exportSortOrder">Order</label>
          <select id="exportSortOrder" class="export-control export-select">
            <option value="asc">Ascending (A-Z)</option>
            <option value="desc">Descending (Z-A)</option>
          </select>
        </div>
      </div>
    `;
  }

  if (pageType === 'attendance') {
    return `
      <div class="export-body-grid">
        <div class="export-field export-field-full" style="position:relative;">
          <label for="exportSearchInput">Search</label>
          <input id="exportSearchInput" type="text" class="export-control"
            placeholder="Search by Name or ID Number" autocomplete="off"
            oninput="onExportSearchInput()" onfocus="onExportSearchInput()" />
          <div id="exportSearchResults"
            style="position:absolute; left:0; right:0; top:100%; margin-top:6px;
                   border:1px solid #d0d7de; border-radius:8px; max-height:220px;
                   overflow-y:auto; display:none; background:#fff;
                   box-shadow:0 8px 24px rgba(15,23,42,0.12); z-index:50;">
          </div>
        </div>
 
        <div class="export-section-label export-field-full">Filter By (Date Range)</div>
 
        <div class="export-field">
          <label for="exportDateFrom">From</label>
          <input id="exportDateFrom" type="date" class="export-control" />
        </div>
 
        <div class="export-field">
          <label for="exportDateTo">To</label>
          <input id="exportDateTo" type="date" class="export-control" />
        </div>
 
        <div class="export-field export-field-full">
          <label>User Type</label>
          <div class="export-checkbox-row">
            ${['All', 'Student', 'Employee'].map((value) => `
              <label class="export-checkbox">
                <input type="checkbox" name="exportUserType" value="${value}" />
                <span>${value}</span>
              </label>
            `).join('')}
          </div>
        </div>
 
        <div class="export-section-label export-field-full">Sort By</div>
 
        <div class="export-field">
          <label for="exportPrimarySort">Primary Sort</label>
          <select id="exportPrimarySort" class="export-control export-select">
            <option value="log_date">Date</option>
            <option value="reference_number">ID Number</option>
            <option value="name">Name</option>
            <option value="type">Type</option>
          </select>
        </div>
 
        <div class="export-field">
          <label for="exportSortOrder">Order</label>
          <select id="exportSortOrder" class="export-control export-select">
            <option value="desc">Descending (New)</option>
            <option value="asc">Ascending (Old)</option>
          </select>
        </div>
      </div>
    `;
  }

  return '';
}

function openExportModal() {
  const modal = document.getElementById('exportModal');
  const title = document.getElementById('exportModalTitle');
  const body = document.getElementById('exportModalBody');
  if (!modal || !title || !body) return;

  const pageType = tableState.pageType;
  if (!pageType || pageType === 'generic') {
    showToast('Export is not available on this page.', 'error');
    return;
  }

  exportState.entity = pageType;
  const rows = Array.isArray(tableState.rows) ? tableState.rows : [];

  title.textContent = `Export ${getExportPageLabel(pageType)} Records`;
  body.innerHTML = getExportModalBody(pageType, rows);
  initExportSearchSuggestions(pageType, rows);

  if (pageType === 'students') {
    initStudentExportCourseState();
    initStudentExportYearLevelState();
  }

  modal.classList.add('show');
}

function closeExportModal() {
  document.getElementById('exportModal')?.classList.remove('show');
}

function initExportSearchSuggestions(pageType, rows) {
  tableState.exportSearchPageType = pageType;
  tableState.exportSearchRows = Array.isArray(rows) ? rows.slice() : [];
  tableState.exportSearchQuery = '';

  const input = document.getElementById('exportSearchInput');
  if (input) {
    input.value = '';
    input.focus();
  }

  renderExportSearchSuggestions('');
}

function getExportSearchCandidate(record, pageType) {
  if (pageType === 'students') {
    return {
      id: escapeText(record.student_number),
      name: escapeText(record.name),
      department: escapeText(record.department),
      display: `${escapeText(record.student_number)} — ${escapeText(record.name)}${record.department && record.department !== '-' ? ` (${escapeText(record.department)})` : ''}`,
      searchText: [record.student_number, record.name, record.department].join(' ').toLowerCase(),
    };
  }

  if (pageType === 'employees') {
    return {
      id: escapeText(record.employee_number),
      name: escapeText(record.name),
      department: escapeText(record.department),
      display: `${escapeText(record.employee_number)} — ${escapeText(record.name)}${record.department && record.department !== '-' ? ` (${escapeText(record.department)})` : ''}`,
      searchText: [record.employee_number, record.name, record.department].join(' ').toLowerCase(),
    };
  }

  if (pageType === 'attendance') {
    return {
      id: escapeText(record.reference_number),
      name: escapeText(record.name),
      department: escapeText(record.department),
      display: `${escapeText(record.reference_number)} — ${escapeText(record.name)}${record.department && record.department !== '-' ? ` (${escapeText(record.department)})` : ''}`,
      searchText: [record.reference_number, record.name, record.department, record.record_type, record.log_date].join(' ').toLowerCase(),
    };
  }

  return null;
}

function renderExportSearchSuggestions(query) {
  const box = document.getElementById('exportSearchResults');
  if (!box) return;

  const pageType = tableState.exportSearchPageType;
  const rows = Array.isArray(tableState.exportSearchRows) ? tableState.exportSearchRows : [];
  const normalizedQuery = String(query || '').trim().toLowerCase();

  if (!normalizedQuery) {
    box.innerHTML = '';
    box.style.display = 'none';
    return;
  }

  const matches = [];
  rows.forEach((record) => {
    const candidate = getExportSearchCandidate(record, pageType);
    if (!candidate) return;

    if (
      candidate.searchText.includes(normalizedQuery) ||
      candidate.display.toLowerCase().includes(normalizedQuery) ||
      candidate.id.toLowerCase().includes(normalizedQuery) ||
      candidate.name.toLowerCase().includes(normalizedQuery)
    ) {
      matches.push(candidate);
    }
  });

  const uniqueMatches = [];
  const seen = new Set();
  matches.forEach((item) => {
    const key = `${item.id}::${item.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    uniqueMatches.push(item);
  });

  const limitedMatches = uniqueMatches.slice(0, 12);

  if (!limitedMatches.length) {
    box.innerHTML = '<div style="padding:10px 14px;color:#888;font-size:13px;">No matching records found.</div>';
    box.style.display = 'block';
    return;
  }

  box.innerHTML = limitedMatches.map((item) => `
    <div class="export-result-item"
      style="padding:9px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #eee;"
      onmouseenter="this.style.background='#e8eaf6'"
      onmouseleave="this.style.background=''"
      onclick="selectExportSearchResult(${JSON.stringify(item).replace(/"/g, '&quot;')})">
      <strong>${item.id}</strong> — ${item.name}
      ${item.department && item.department !== '-' ? `<span style="color:#888;margin-left:6px;">(${item.department})</span>` : ''}
    </div>
  `).join('');
  box.style.display = 'block';
}

function onExportSearchInput() {
  const input = document.getElementById('exportSearchInput');
  if (!input) return;

  tableState.exportSearchQuery = input.value || '';
  renderExportSearchSuggestions(tableState.exportSearchQuery);
}

function selectExportSearchResult(result) {
  const input = document.getElementById('exportSearchInput');
  const box = document.getElementById('exportSearchResults');

  if (input) {
    input.value = result.id && result.name ? `${result.id} — ${result.name}` : (result.id || result.name || '');
  }

  if (box) {
    box.style.display = 'none';
    box.innerHTML = '';
  }

  tableState.exportSearchQuery = input?.value || '';
}

function initStudentExportCourseState() {
  const departmentSelect = document.getElementById('exportDepartmentSelect');
  const courseSelect = document.getElementById('exportCourseSelect');
  if (!departmentSelect || !courseSelect) return;

  const allCourses = [...new Set(Object.values(departmentCoursesMap).flat())];

  const renderCourseOptions = (courses, selectedValue) => {
    courseSelect.innerHTML = '<option value="all">All Courses</option>';

    courses.forEach((course) => {
      const option = document.createElement('option');
      option.value = course;
      option.textContent = course;
      courseSelect.appendChild(option);
    });

    if ([...courseSelect.options].some((option) => option.value === selectedValue)) {
      courseSelect.value = selectedValue;
    } else {
      courseSelect.value = 'all';
    }
  };

  const applyState = () => {
    const selectedDepartment = departmentSelect.value || 'all';
    const currentCourse = courseSelect.value || 'all';

    if (selectedDepartment === 'all') {
      renderCourseOptions(allCourses, currentCourse);
      return;
    }

    renderCourseOptions(departmentCoursesMap[selectedDepartment] || [], currentCourse);
  };

  departmentSelect.addEventListener('change', applyState);
  applyState();
}

function initStudentExportYearLevelState() {
  const departmentSelect = document.getElementById('exportDepartmentSelect');
  if (!departmentSelect) return;

  const applyState = () => {
    const selectedDepartment = (departmentSelect.value || '').toLowerCase();
    const disableYearLevels = selectedDepartment === 'basic education' || selectedDepartment.startsWith('senior high school');
    const allYearLevels = document.getElementById('exportYearLevelAll');
    const yearLevelItems = [...document.querySelectorAll('input[name="exportYearLevel"]')];

    if (allYearLevels) {
      allYearLevels.disabled = disableYearLevels;
      if (disableYearLevels) allYearLevels.checked = false;
    }

    yearLevelItems.forEach((input) => {
      input.disabled = disableYearLevels;
      if (disableYearLevels) input.checked = false;
    });
  };

  departmentSelect.addEventListener('change', applyState);
  applyState();
}

function collectExportRows(pageType) {
  const rows = Array.isArray(tableState.rows) ? tableState.rows.slice() : [];
  const searchVal = (document.getElementById('exportSearchInput')?.value || '').trim().toLowerCase();
  const primarySort = document.getElementById('exportPrimarySort')?.value || 'last_name';
  const sortOrder = document.getElementById('exportSortOrder')?.value || 'asc';

  const filteredRows = rows.filter((record) => {
    const model = buildRowModel(pageType, record);

    if (searchVal && !model.searchText.includes(searchVal)) {
      return false;
    }

    if (pageType === 'students') {
      const departmentVal = (document.getElementById('exportDepartmentSelect')?.value || 'all').toLowerCase();
      const courseVal = (document.getElementById('exportCourseSelect')?.value || 'all').toLowerCase();
      const allYearLevels = document.getElementById('exportYearLevelAll')?.checked || false;
      const selectedYearLevels = [...document.querySelectorAll('input[name="exportYearLevel"]:checked')].map((input) => input.value.toLowerCase());
      const yearLevelValue = (model.yearLevel || '').toLowerCase();

      if (departmentVal !== 'all' && model.department.toLowerCase() !== departmentVal) return false;
      if (programVal !== 'all' && model.program.toLowerCase() !== programVal) return false;
      
      // If "All" is checked, skip year level filter; otherwise filter by selected year levels
      if (!allYearLevels && selectedYearLevels.length > 0 && !selectedYearLevels.includes(yearLevelValue)) {
        return false;
      }
    }

    if (pageType === 'employees') {
      const departmentVal = (document.getElementById('exportDepartmentSelect')?.value || 'all').toLowerCase();
      const positionVal = (document.getElementById('exportPositionSelect')?.value || 'all').toLowerCase();

      if (departmentVal !== 'all' && model.department.toLowerCase() !== departmentVal) return false;
      if (positionVal !== 'all' && model.position.toLowerCase() !== positionVal) return false;
    }

    if (pageType === 'attendance') {
      const dateFrom = normalizeDate(document.getElementById('exportDateFrom')?.value || '');
      const dateTo = normalizeDate(document.getElementById('exportDateTo')?.value || '');
      const selectedTypes = [...document.querySelectorAll('input[name="exportUserType"]:checked')].map((input) => input.value.toLowerCase());
      const isAllSelected = selectedTypes.includes('all') || !selectedTypes.length;
      const modelType = (model.typeValue || '').toLowerCase();

      if (dateFrom && model.dateValue < dateFrom) return false;
      if (dateTo && model.dateValue > dateTo) return false;
      if (!isAllSelected && !selectedTypes.includes(modelType)) return false;
    }

    return true;
  });

  filteredRows.sort((left, right) => {
    const leftValue = getExportSortValue(pageType, left, primarySort).toString().toLowerCase();
    const rightValue = getExportSortValue(pageType, right, primarySort).toString().toLowerCase();
    const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
    return sortOrder === 'desc' ? comparison * -1 : comparison;
  });

  return filteredRows;
}

async function handleExport() {
  const pageType = exportState.entity || tableState.pageType;
  if (!pageType || pageType === 'generic') {
    showToast('Export is not available on this page.', 'error');
    return;
  }

  // Collect filters based on page type
  const filters = {};

  if (pageType === 'students') {
    filters.search = (document.getElementById('exportSearchInput')?.value || '').trim();
    filters.department = document.getElementById('exportDepartmentSelect')?.value || 'all';
    filters.program = document.getElementById('exportProgramSelect')?.value || 'all';
    const allYearLevels = document.getElementById('exportYearLevelAll')?.checked || false;
    const selectedYearLevels = [...document.querySelectorAll('input[name="exportYearLevel"]:checked')].map((input) => input.value);
    filters.yearLevels = allYearLevels ? [] : selectedYearLevels;
    filters.allYearLevels = allYearLevels;
  } else if (pageType === 'employees') {
    filters.search = (document.getElementById('exportSearchInput')?.value || '').trim();
    filters.department = document.getElementById('exportDepartmentSelect')?.value || 'all';
    filters.position = document.getElementById('exportPositionSelect')?.value || 'all';
  } else if (pageType === 'attendance') {
    filters.search = (document.getElementById('exportSearchInput')?.value || '').trim();
    filters.dateFrom = document.getElementById('exportDateFrom')?.value || '';
    filters.dateTo = document.getElementById('exportDateTo')?.value || '';
    filters.userTypes = [...document.querySelectorAll('input[name="exportUserType"]:checked')].map((input) => input.value);
  }

  const formData = new FormData();
  formData.append('type', pageType);
  formData.append('filters', JSON.stringify(filters));

  try {
    const response = await fetch('../api/export.php', {
      method: 'POST',
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
      throw new Error('Export failed. Please try again.');
    }

    // Get the blob and download it
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const contentDisposition = response.headers.get('content-disposition') || '';
    const match = contentDisposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
    const serverFileName = match?.[1] ? decodeURIComponent(match[1].trim()) : '';

    link.href = url;
    link.download = serverFileName || `${pageType}-records.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Export completed successfully.', 'success');
    closeExportModal();
  } catch (error) {
    console.error('Export error:', error);
    showToast('Export failed. Please try again.', 'error');
  }
}

// ── Shared API helper ─────────────────────────────────────────────────────────

function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content ?? '';
}

async function apiRequest(endpoint, method, body) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  };

  // Attach token for all state-changing methods
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    headers['X-CSRF-Token'] = getCsrfToken();
  }

  const response = await fetch(endpoint, {
    method,
    headers,
    body: JSON.stringify(body),
  });

  const payload = await response.json();

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || `Request failed (${response.status})`);
  }

  return payload;
}

// ── Reload helper — refreshes table without a full page reload ────────────────

async function reloadTable() {
  const table = tableState.table;
  if (!table) return;

  const endpoint = getEndpoint(table);
  if (!endpoint) return;

  try {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Status ${response.status}`);

    const payload = await response.json();
    const rows    = Array.isArray(payload.data) ? payload.data : [];

    tableState.rows = tableState.pageType === 'users' ? mergeUserOverrides(rows) : rows;
    tableState.filteredRows = tableState.rows.slice();

    if (tableState.pageType === 'students' || tableState.pageType === 'employees') {
      populateDepartmentSelect();
    }

    if (tableState.pageType === 'students') {
      populateYearLevelSelect(rows);
      populateCourseSelect(rows);
    } else if (tableState.pageType === 'employees') {
      populatePositionSelect(rows);
    }

    applyFilters(false);
  } catch (error) {
    console.error('Failed to reload table:', error);
  }
}

function isModalOpen() {
  return Boolean(document.querySelector('.modal.show'));
}

function startRealtimeTableRefresh() {
  if (!tableState.table || tableState.pageType !== 'attendance') {
    return;
  }

  const refreshMs = 1000;

  stopRealtimeTableRefresh();

  realtimeState.timer = window.setInterval(() => {
    if (document.hidden || isModalOpen()) return;
    reloadTable();
  }, refreshMs);
}

function stopRealtimeTableRefresh() {
  if (realtimeState.timer !== null) {
    window.clearInterval(realtimeState.timer);
    realtimeState.timer = null;
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────

// openAddUserModal / closeAddUserModal / saveAddUser are defined inline in
// users.php (the employee-search modal script) and take precedence here.
// These stubs are kept so other pages that include script.js don't break.
function openAddUserModal() {
  document.getElementById('addUserModal')?.classList.add('show');
}

function closeAddUserModal() {
  document.getElementById('addUserModal')?.classList.remove('show');
}

function openViewUserModal(record) {
  const modal = document.getElementById('viewUserModal');
  if (!modal) return;

  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.value = escapeText(value);
  };

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = escapeText(value);
  };

  setValue('viewUserEmployeeNumber', record.employee_number);
  setValue('viewUserName', record.name);
  setValue('viewUserUsername', record.username);
  setValue('viewUserEmail', record.email);
  setValue('viewUserRole', record.role);
  setValue('viewUserStatus', record.is_active ? 'Active' : 'Inactive');
  setText('viewUserCreatedAt', formatLongDate(record.created_at));
  setText('viewUserUpdatedAt', formatLongDate(record.updated_at));

  modal.classList.add('show');
}

function closeViewUserModal() {
  document.getElementById('viewUserModal')?.classList.remove('show');
}

function openEditUserModal(record) {
  const modal = document.getElementById('editUserModal');
  if (!modal) { showToast('Edit modal not found.', 'error'); return; }

  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.value = escapeText(value);
  };

  setValue('editUserEmployeeNumber', record.employee_number);
  setValue('editUserName', record.name);
  setValue('editUserUsername', record.username);
  setValue('editUserEmail', record.email);
  setValue('editUserRole', record.role === 'Super Admin' ? 'Superadmin' : record.role);
  setValue('editUserStatus', record.is_active ? 'Active' : 'Inactive');

  modal._record = record;
  modal.classList.add('show');
}

function closeEditUserModal() {
  document.getElementById('editUserModal')?.classList.remove('show');
}

function openUpdateUserModal() {
  const modal = document.getElementById('updateUserModal');
  const confirmBtn = document.getElementById('updateUserConfirm');
  if (!modal) return;

  const closeModal = () => {
    modal.classList.remove('show');
    confirmBtn?.removeEventListener('click', closeModal);
  };

  confirmBtn?.addEventListener('click', closeModal);
  modal.classList.add('show');
}

async function saveEditUser() {
  const modal = document.getElementById('editUserModal');
  const record = modal?._record;

  if (!record) {
    showToast('User record not found.', 'error');
    return;
  }

  const username = document.getElementById('editUserUsername')?.value.trim() || '';
  const email = document.getElementById('editUserEmail')?.value.trim() || '';
  const role = document.getElementById('editUserRole')?.value || '';
  const status = document.getElementById('editUserStatus')?.value || '';

  if (!username) { showToast('Username is required.', 'error'); return; }
  if (!email) { showToast('Email is required.', 'error'); return; }
  if (!role) { showToast('Role is required.', 'error'); return; }

  saveUserOverride(record, {
    username,
    email,
    role: role === 'Superadmin' ? 'Superadmin' : role,
    is_active: status === 'Active',
    updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  });

  closeEditUserModal();
  await reloadTable();
  openUpdateUserModal();
}

// saveAddUser is fully handled by the inline <script> in users.php.
// Defining a no-op here prevents "not defined" errors on other pages.
if (typeof saveAddUser === 'undefined') {
  window.saveAddUser = function () {};
}

// ── Students ──────────────────────────────────────────────────────────────────

// Department to Courses Mapping for Add Student Modal
const departmentCoursesMap = {
  'Basic Education': [
    'Kindergarten',
    'Elementary',
    'Junior High School (With STE Programs)',
    'Senior High School',
  ],
  'Senior High School (Academic)': [
    'General Academic Strand (GAS)',
    'Accountancy, Business and Management (ABM)',
    'Humanities and Social Sciences Strand (HUMSS)',
    'Science, Technology, Engineering, and Mathematics Strand (STEM)',
  ],
  'Senior High School (Technical-Vocational)': [
    'Home Economics',
    'Tourism Promotion Services (NC II)',
    'Front Office Services (NC II)',
    'Beauty/Nail Care (NC II)',
    'Bread and Pastry Production (NC II)',
    'Food and Beverage Services (NC II)',
    'Hair Dressing (NC II)',
    'Cookery (NC II)',
    'Commercial Cooking (NC II)',
    'Caregiving (NC II)',
  ],
  'Senior High School (Information and Communication Technology)': [
    'Contact Center Services (NC II)',
    'Computer Hardware Servicing (NC II)',
    'Technical Drafting (NC II)',
  ],
  'Senior High School (Agriculture and Fishery Arts)': [
    'Crop Production (NC II)',
    'Organic Agriculture (NC II)',
  ],
  'Senior High School (Arts and Design)': [
    'Performing Arts',
    'Visual Arts',
  ],
  'College of Accountancy': [
    'Bachelor of Science in Accountancy',
    'Bachelor of Science in Management Accounting',
    'Bachelor of Science in Accounting Information System',
    'Bachelor of Science in Internal Auditing',
  ],
  'College of Allied Medical Sciences': [
    'Bachelor of Science in Nursing',
    'Bachelor of Science in Midwifery',
  ],
  'College of Business Management': [
    'Bachelor of Science in Hospitality Management',
    'Bachelor of Science in Tourism Management',
    'Bachelor of Science in Office Management',
    'Bachelor of Science in Business Administration Major in Finance Management',
    'Bachelor of Science in Business Administration Major in Marketing Management',
  ],
  'College of Criminal Justice': [
    'Bachelor of Science in Criminology',
  ],
  'College of Education': [
    'Bachelor of Elementary Education',
    'Bachelor of Secondary Education Major in: English, Science, Mathematics, Social Studies, Values Education, and Filipino',
    'Certificate in Teaching Education',
    'Bachelor of Physical Education',
    'Bachelor of Technology & Livelihood Education',
  ],
  'College of Computer Studies': [
    'Bachelor of Science in Information Technology with CISCO Certification program',
    'Bachelor of Science in Information Technology with specialization in Software Engineering',
    'Bachelor of Science in Information Technology with specialization in Cybersecurity',
    'Bachelor of Science in Computer Science',
  ],
  'College of Arts and Sciences': [
    'Bachelor or Arts in Communication',
    'Bachelor of Science in Biology',
    'Bachelor of Science in Psychology',
    'Bachelor or Arts in Psychology',
  ],
  'College of Engineering': [
    'Bachelor of Science in Civil Engineering',
  ],
};

// Update course options based on selected department
function updateCourseOptionsForAddStudent() {
  const departmentSelect = document.getElementById('addStudentDepartment');
  const programSelect = document.getElementById('addStudentProgram');

  if (!departmentSelect || !programSelect) return;

  const selectedDepartment = departmentSelect.value;
  const courses = departmentCoursesMap[selectedDepartment] || [];

  // Clear and disable program select if no department is selected
  if (!selectedDepartment) {
    programSelect.innerHTML = '<option value="">Select Program</option>';
    programSelect.disabled = true;
    programSelect.classList.add('disabled');
    return;
  }

  // Enable program select and populate with filtered courses
  programSelect.disabled = false;
  programSelect.classList.remove('disabled');
  programSelect.innerHTML = '<option value="">Select Program</option>';

  courses.forEach((course) => {
    const option = document.createElement('option');
    option.value = course;
    option.textContent = course;
    programSelect.appendChild(option);
  });
}

// Update year level options based on selected course
function updateYearLevelOptionsForAddStudent() {
  const programSelect = document.getElementById('addStudentProgram');
  const yearLevelSelect = document.getElementById('addStudentYearLevel');

  if (!programSelect || !yearLevelSelect) return;

  const selectedCourse = programSelect.value;

  // Default options for college (1st-4th Year)
  const collegeOptions = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
  const elementaryOptions = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
  const juniorHighOptions = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'];
  const seniorHighOptions = ['Grade 11', 'Grade 12'];

  let optionsToUse = collegeOptions;
  let isDisabled = false;

  if (selectedCourse === 'Kindergarten') {
    isDisabled = true;
  } else if (selectedCourse === 'Elementary') {
    optionsToUse = elementaryOptions;
  } else if (selectedCourse === 'Junior High School (With STE Programs)') {
    optionsToUse = juniorHighOptions;
  } else if (selectedCourse === 'Senior High School') {
    optionsToUse = seniorHighOptions;
  }

  yearLevelSelect.disabled = isDisabled;
  yearLevelSelect.classList.toggle('disabled', isDisabled);
  yearLevelSelect.innerHTML = '<option value="">Select Year Level</option>';

  if (!isDisabled) {
    optionsToUse.forEach((option) => {
      const optionElement = document.createElement('option');
      optionElement.value = option;
      optionElement.textContent = option;
      yearLevelSelect.appendChild(optionElement);
    });
  }
}

// Initialize course filtering when Add Student Modal is opened
function initAddStudentModalCourseFiltering() {
  const departmentSelect = document.getElementById('addStudentDepartment');
  const programSelect = document.getElementById('addStudentProgram');

  if (departmentSelect) {
    departmentSelect.addEventListener('change', updateCourseOptionsForAddStudent);
  }

  if (programSelect) {
    programSelect.addEventListener('change', updateYearLevelOptionsForAddStudent);
  }
}

function openViewStudentModal(record) {
  const modal = document.getElementById('viewStudentModal');
  if (!modal) return;

  const parts    = parseNameParts(record);
  const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.value     = escapeText(value); };
  const setText  = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = escapeText(value); };

  setValue('viewStudentLastName',   parts.lastName);
  setValue('viewStudentFirstName',  parts.firstName);
  setValue('viewStudentMiddleName', parts.middleName);
  setValue('viewStudentNumber',     record.student_number);
  setValue('viewStudentCategory',   record.category);
  setValue('viewStudentProgram',     record.program);
  setValue('viewStudentYearLevel',  record.year_level);
  setValue('viewStudentStrand',     record.strand);
  setValue('viewStudentDepartment', record.department);
  setValue('viewStudentRfid',       record.rfid_uid);
  setText('viewStudentCreatedAt',   formatLongDate(record.created_at));
  setText('viewStudentUpdatedAt',   formatLongDate(record.updated_at));

  modal.classList.add('show');
}

function closeViewStudentModal() {
  document.getElementById('viewStudentModal')?.classList.remove('show');
}

function openEditStudentModal(record) {
  const modal = document.getElementById('editStudentModal');
  if (!modal) { showToast('Edit modal not found.', 'error'); return; }

  const parts    = parseNameParts(record);
  const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.value = escapeText(value); };

  setValue('editStudentFirstName',  parts.firstName);
  setValue('editStudentMiddleName', parts.middleName);
  setValue('editStudentLastName',   parts.lastName);
  setValue('editStudentNumber',     record.student_number);
  setValue('editStudentCategory',   record.category);
  setValue('editStudentProgram',     record.program);
  setValue('editStudentYearLevel',  record.year_level);
  setValue('editStudentStrand',     record.strand);
  setValue('editStudentDepartment', record.department);
  setValue('editStudentRfid',       record.rfid_uid !== '-' ? record.rfid_uid : '');

  modal._record = record;
  modal.classList.add('show');
}

function closeEditStudentModal() {
  document.getElementById('editStudentModal')?.classList.remove('show');
}

async function saveEditStudent() {
  const modal  = document.getElementById('editStudentModal');
  const record = modal?._record;

  if (!record?.id) { showToast('Student record not found.', 'error'); return; }

  const rfid = document.getElementById('editStudentRfid')?.value.trim() || '';

  try {
    const endpoint = getEndpoint(tableState.table) || '../../api/students.php';
    await apiRequest(endpoint, 'PATCH', { id: record.id, rfid_uid: rfid });
    showToast('Student RFID updated successfully.', 'success');
    closeEditStudentModal();
    await reloadTable();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function openAddStudentModal() {
  const modal = document.getElementById('addStudentModal');
  if (!modal) return;
  
  modal.querySelectorAll('input').forEach((el) => (el.value = ''));
  modal.querySelectorAll('select').forEach((el) => (el.value = ''));
  
  // Hide all category-specific fields initially
  document.getElementById('addStudentBasicEducationFields').style.display = 'none';
  document.getElementById('addStudentTertiaryFields').style.display = 'none';
  document.getElementById('addStudentGraduateFields').style.display = 'none';
  document.getElementById('addStudentStrandFieldsBE').style.display = 'none';

  // Add event listener for category changes
  const categorySelect = document.getElementById('addStudentCategory');
  if (categorySelect) {
    categorySelect.addEventListener('change', handleAddStudentCategoryChange);
  }

  modal.classList.add('show');
}

function handleAddStudentCategoryChange() {
  const category = document.getElementById('addStudentCategory')?.value || '';
  
  // Hide all category-specific field groups
  document.getElementById('addStudentBasicEducationFields').style.display = 'none';
  document.getElementById('addStudentTertiaryFields').style.display = 'none';
  document.getElementById('addStudentGraduateFields').style.display = 'none';
  document.getElementById('addStudentStrandFieldsBE').style.display = 'none';
  
  // Show relevant fields based on category
  if (category === 'Basic Education') {
    document.getElementById('addStudentBasicEducationFields').style.display = 'block';
  } else if (category === 'Tertiary') {
    document.getElementById('addStudentTertiaryFields').style.display = 'block';
  } else if (category === 'Graduate School') {
    document.getElementById('addStudentGraduateFields').style.display = 'block';
  }
}

// Handle year level change for Basic Education to show/hide strand field
document.addEventListener('DOMContentLoaded', function() {
  const yearLevelBE = document.getElementById('addStudentYearLevelBE');
  if (yearLevelBE) {
    yearLevelBE.addEventListener('change', function() {
      const value = this.value;
      const strandFields = document.getElementById('addStudentStrandFieldsBE');
      if (value === 'Grade 11' || value === 'Grade 12') {
        strandFields.style.display = 'block';
      } else {
        strandFields.style.display = 'none';
      }
    });
  }
});

function closeAddStudentModal() {
  document.getElementById('addStudentModal')?.classList.remove('show');
}

async function saveAddStudent() {
  const get = (id) => document.getElementById(id)?.value.trim() || '';

  const category = get('addStudentCategory');
  
  if (!category) {
    showToast('Category is required.', 'error');
    return;
  }

  const body = {
    first_name:      get('addStudentFirstName'),
    middle_name:     get('addStudentMiddleName'),
    suffix:          get('addStudentSuffix'),
    last_name:       get('addStudentLastName'),
    student_number:  get('addStudentNumber'),
    category:        category,
    rfid_uid:        get('addStudentRfid'),
  };

  if (!body.first_name || !body.last_name || !body.student_number) {
    showToast('First name, last name, and student number are required.', 'error');
    return;
  }

  // Collect category-specific fields
  if (category === 'Basic Education') {
    body.year_level = get('addStudentYearLevelBE');
    body.strand = get('addStudentStrandBE');
    if (!body.year_level) {
      showToast('Year level is required for Basic Education.', 'error');
      return;
    }
  } else if (category === 'Tertiary') {
    body.department = get('addStudentDepartmentTertiary');
    body.program = get('addStudentProgramTertiary');
    body.year_level = get('addStudentYearLevelTertiary');
    if (!body.department || !body.program || !body.year_level) {
      showToast('Department, program, and year level are required for Tertiary.', 'error');
      return;
    }
  } else if (category === 'Graduate School') {
    body.department = get('addStudentDepartmentGraduate');
    body.program = get('addStudentProgramGraduate');
    if (!body.department || !body.program) {
      showToast('Department and program are required for Graduate School.', 'error');
      return;
    }
  }

  try {
    const endpoint = getEndpoint(tableState.table) || '../../api/students.php';
    await apiRequest(endpoint, 'POST', body);
    showToast('Student added successfully.', 'success');
    closeAddStudentModal();
    await reloadTable();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ── Employees ─────────────────────────────────────────────────────────────────

function openViewEmployeeModal(record) {
  const modal = document.getElementById('viewEmployeeModal');
  if (!modal) return;

  const parts    = parseNameParts(record);
  const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.value      = escapeText(value); };
  const setText  = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = escapeText(value); };

  setValue('viewEmployeeLastName',   parts.lastName);
  setValue('viewEmployeeFirstName',  parts.firstName);
  setValue('viewEmployeeMiddleName', parts.middleName);
  setValue('viewEmployeeNumber',     record.employee_number);
  setValue('viewEmployeeDepartment', record.department);
  setValue('viewEmployeePosition',   record.position);
  setValue('viewEmployeeRfid',       record.rfid_uid);
  setText('viewEmployeeCreatedAt',   formatLongDate(record.created_at));
  setText('viewEmployeeUpdatedAt',   formatLongDate(record.updated_at));

  modal.classList.add('show');
}

function closeViewEmployeeModal() {
  document.getElementById('viewEmployeeModal')?.classList.remove('show');
}

function openEditEmployeeModal(record) {
  const modal = document.getElementById('editEmployeeModal');
  if (!modal) { showToast('Edit modal not found.', 'error'); return; }

  const parts    = parseNameParts(record);
  const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.value = escapeText(value); };

  setValue('editEmployeeFirstName',  parts.firstName);
  setValue('editEmployeeMiddleName', parts.middleName);
  setValue('editEmployeeLastName',   parts.lastName);
  setValue('editEmployeeNumber',     record.employee_number);
  setValue('editEmployeeDepartment', record.department);
  setValue('editEmployeePosition',   record.position);
  setValue('editEmployeeRfid',       record.rfid_uid !== '-' ? record.rfid_uid : '');

  modal._record = record;
  modal.classList.add('show');
}

function closeEditEmployeeModal() {
  document.getElementById('editEmployeeModal')?.classList.remove('show');
}

async function saveEditEmployee() {
  const modal  = document.getElementById('editEmployeeModal');
  const record = modal?._record;

  if (!record?.id) { showToast('Employee record not found.', 'error'); return; }

  const rfid = document.getElementById('editEmployeeRfid')?.value.trim() || '';

  try {
    const endpoint = getEndpoint(tableState.table) || '../../api/employees.php';
    await apiRequest(endpoint, 'PATCH', { id: record.id, rfid_uid: rfid });
    showToast('Employee RFID updated successfully.', 'success');
    closeEditEmployeeModal();
    await reloadTable();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function openAddEmployeeModal() {
  const modal = document.getElementById('addEmployeeModal');
  if (!modal) return;
  modal.querySelectorAll('input').forEach((el) => (el.value = ''));
  modal.querySelectorAll('select').forEach((el) => (el.value = ''));
  modal.classList.add('show');
}

function closeAddEmployeeModal() {
  document.getElementById('addEmployeeModal')?.classList.remove('show');
}

async function saveAddEmployee() {
  const get = (id) => document.getElementById(id)?.value.trim() || '';

  const body = {
    first_name:      get('addEmployeeFirstName'),
    middle_name:     get('addEmployeeMiddleName'),
    suffix:          get('addEmployeeSuffix'),
    last_name:       get('addEmployeeLastName'),
    employee_number: get('addEmployeeNumber'),
    department:      get('addEmployeeDepartment'),
    position:        get('addEmployeePosition'),
    rfid_uid:        get('addEmployeeRfid'),
  };

  if (!body.first_name || !body.last_name || !body.employee_number || !body.department || !body.position) {
    showToast('First name, last name, employee number, department, and designation/position are required.', 'error');
    return;
  }

  try {
    const endpoint = getEndpoint(tableState.table) || '../../api/employees.php';
    await apiRequest(endpoint, 'POST', body);
    showToast('Employee added successfully.', 'success');
    closeAddEmployeeModal();
    await reloadTable();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ── Import ────────────────────────────────────────────────────────────────────

function openImportModal(entity) {
  const modal = document.getElementById('importModal');
  if (!modal) return;

  importState.entity = entity;
  const title = document.getElementById('importModalTitle');
  if (title) title.textContent = `Upload ${entity === 'students' ? 'Student' : 'Employee'} File`;

  modal.classList.add('show');
}

function closeImportModal() {
  document.getElementById('importModal')?.classList.remove('show');
}

async function handleImportFile(file) {
  if (!file) return;

  const fileName = String(file.name || '').toLowerCase();
  const maxSize  = 25 * 1024 * 1024;

  if (!fileName.endsWith('.xlsx')) {
    showToast('Import failed: only .xlsx files are allowed.', 'error');
    return;
  }

  if (file.size > maxSize) {
    showToast('Import failed: file is larger than 25 MB.', 'error');
    return;
  }

  const entity   = importState.entity;
  const endpoint = getEndpoint(tableState.table)
    || `../../api/${entity}.php`;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
    });

    const payload = await response.json();

    if (!response.ok || !payload.success) {
      throw new Error(payload.message || `Import failed (${response.status})`);
    }

    const { inserted = 0, skipped = 0, errors = [] } = payload;
    let message = `Import complete: ${inserted} inserted, ${skipped} skipped.`;

    if (errors.length) {
      console.warn('Import row errors:', errors);
      message += ` ${errors.length} row error(s) — check the console for details.`;
    }

    showToast(message, skipped > 0 ? 'warning' : 'success');
    closeImportModal();
    await reloadTable();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function bindImportControls() {
  const openBtn   = document.getElementById('openImportBtn');
  const fileInput = document.getElementById('importFileInput');
  const dropzone  = document.getElementById('importDropzone');

  const entity = tableState.pageType === 'students'
    ? 'students'
    : tableState.pageType === 'employees'
      ? 'employees'
      : '';

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
      handleImportFile(event.dataTransfer?.files?.[0]);
    });
  }
}

function bindExportControls() {
  document.getElementById('openExportBtn')?.addEventListener('click', openExportModal);
}

function bindAddButtons() {
  document.getElementById('addStudentBtn')?.addEventListener('click', openAddStudentModal);
  document.getElementById('addEmployeeBtn')?.addEventListener('click', openAddEmployeeModal);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const sidebar   = document.querySelector('.sidebar');
  const collapsed = localStorage.getItem('sidebar-collapsed');
  if (sidebar) sidebar.classList.toggle('collapsed', collapsed === '1');
  document.documentElement.classList.toggle('sidebar-collapsed', collapsed === '1');

  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);

  initLoadingSkeletons();

  await loadTableData();
  startRealtimeTableRefresh();
  bindImportControls();
  bindExportControls();
  bindAddButtons();

  const currentPage = window.location.pathname.split('/').pop();
  document.querySelectorAll('.sidebar-nav a').forEach((link) => {
    const href = link.getAttribute('href');
    if (href === currentPage) link.classList.add('active');

    link.addEventListener('click', (event) => {
      if (href !== currentPage) {
        event.preventDefault();
        navigateWithTransition(href);
      }
    });
  });
});

window.addEventListener('beforeunload', stopRealtimeTableRefresh);
// ============================================================
// LIVE RFID UID AUTO-FETCH FOR ADD STUDENT MODAL
// ============================================================

(function () {
  console.log("Live RFID auto-fetch script loaded.");

  let rfidPollingTimer = null;
  let latestRfidBufferId = 0;

  const RFID_API_URL = "/fcpc-tap-track/web/api/students.php?action=latest-rfid";

  function getRfidUidInput() {
    return (
      document.querySelector('input[name="rfid_uid"]') ||
      document.getElementById("rfid_uid") ||
      document.querySelector('input[placeholder="RFID UID"]') ||
      document.querySelector('input[placeholder*="RFID"]')
    );
  }

  function isAddStudentModalOpen() {
    const rfidInput = getRfidUidInput();

    if (!rfidInput) {
      return false;
    }

    const modal =
      rfidInput.closest(".modal") ||
      rfidInput.closest("[role='dialog']") ||
      rfidInput.closest("form") ||
      rfidInput.closest("div");

    if (!modal) {
      return false;
    }

    const style = window.getComputedStyle(modal);

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  function startRfidAutoFetch() {
    const rfidInput = getRfidUidInput();

    if (!rfidInput) {
      console.error("RFID UID input field was not found.");
      return;
    }

    console.log("RFID auto-fetch started.");

    rfidInput.readOnly = true;
    rfidInput.placeholder = "Tap RFID card now...";

    stopRfidAutoFetch();

    rfidPollingTimer = setInterval(fetchLatestRfidUid, 700);
    fetchLatestRfidUid();
  }

  function stopRfidAutoFetch() {
    if (rfidPollingTimer !== null) {
      clearInterval(rfidPollingTimer);
      rfidPollingTimer = null;
      console.log("RFID auto-fetch stopped.");
    }
  }

  function fetchLatestRfidUid() {
    const rfidInput = getRfidUidInput();

    if (!rfidInput) {
      console.error("RFID UID input field was not found while polling.");
      return;
    }

    const url = RFID_API_URL + "&last_id=" + latestRfidBufferId + "&t=" + Date.now();

    fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP error: " + response.status);
        }

        return response.json();
      })
      .then(function (data) {
        console.log("RFID API response:", data);

        if (data.success && data.rfid_uid) {
          latestRfidBufferId = Number(data.id) || latestRfidBufferId;

          rfidInput.value = data.rfid_uid;
          rfidInput.placeholder = "RFID UID captured";

          console.log("RFID UID inserted into input:", data.rfid_uid);
        }
      })
      .catch(function (error) {
        console.error("RFID fetch error:", error);
      });
  }

  function detectAddStudentModal() {
    const rfidInput = getRfidUidInput();

    if (rfidInput && rfidPollingTimer === null) {
      startRfidAutoFetch();
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    console.log("RFID DOM listener ready.");

    document.addEventListener("click", function (event) {
      const target = event.target;
      const clickedText = target.textContent ? target.textContent.trim() : "";

      if (
        clickedText.includes("Add Student") ||
        target.closest("[data-open-add-student]") ||
        target.closest("#openAddStudentModal")
      ) {
        setTimeout(startRfidAutoFetch, 300);
      }

      if (
        clickedText.includes("Cancel") ||
        clickedText.includes("Close") ||
        target.closest("[data-close-add-student]") ||
        target.closest("#closeAddStudentModal")
      ) {
        stopRfidAutoFetch();
      }
    });

    setInterval(function () {
      if (isAddStudentModalOpen()) {
        detectAddStudentModal();
      }
    }, 1000);
  });

  window.startRfidAutoFetch = startRfidAutoFetch;
  window.stopRfidAutoFetch = stopRfidAutoFetch;
  window.fetchLatestRfidUid = fetchLatestRfidUid;
})();