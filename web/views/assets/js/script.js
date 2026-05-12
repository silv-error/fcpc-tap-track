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

function setSelectOptions(select, options, allLabel) {
  if (!select) return;
  const existingValue = select.value || 'all';
  select.innerHTML = `<option value="all">${allLabel}</option>`;
  options.forEach((optionValue) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    select.appendChild(option);
  });
  if ([...select.options].some((option) => option.value === existingValue)) {
    select.value = existingValue;
  }
}

function buildOptionsMarkup(options, allLabel) {
  return [
    `<option value="all">${allLabel}</option>`,
    ...options.map((optionValue) => `<option value="${optionValue.replace(/"/g, '&quot;')}">${optionValue}</option>`),
  ].join('');
}

// ── Static data constants ─────────────────────────────────────────────────────

const BASIC_YEAR_LEVELS = [
  'Pre-kinder 1', 'Pre-kinder 2', 'Kinder',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
];

const TERTIARY_YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

const TERTIARY_DEPARTMENTS = [
  'College of Accountancy',
  'College of Allied Medical Sciences',
  'College of Business Management',
  'College of Criminal Justice',
  'College of Education',
  'College of Computer Studies',
  'College of Arts and Sciences',
  'College of Engineering',
];

const COLLEGE_PROGRAMS_MAP = {
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
  'College of Criminal Justice': ['Bachelor of Science in Criminology'],
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
  'College of Engineering': ['Bachelor of Science in Civil Engineering'],
};

const ALL_TERTIARY_PROGRAMS = Object.values(COLLEGE_PROGRAMS_MAP).flat();

const GRADUATE_PROGRAMS_MAP = {
  'Professional Track': [
    'Master in Education, Major in Science',
    'Master of Science in Hospitality Management',
    'Master of Arts in Nursing',
    'Master in Information Technology',
  ],
  'Academic Track': [
    'Master of Arts in Education, Major in English',
    'Master of Arts in Education, Major in Mathematics',
    'Master of Arts in Education, Major in Educational Management',
  ],
};

const ALL_GRADUATE_PROGRAMS = Object.values(GRADUATE_PROGRAMS_MAP).flat();

const BASIC_EDUCATION_PROGRAM_OPTIONS = [
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

const TERTIARY_PROGRAM_OPTIONS = ALL_TERTIARY_PROGRAMS;

const STRAND_OPTIONS = [
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

// Grade levels where strand is shown instead of program
const STRAND_YEAR_LEVELS = ['Grade 11', 'Grade 12'];
// Grade levels where neither program nor strand filter appears
const NO_PROGRAM_YEAR_LEVELS = [
  'Pre-kinder 1', 'Pre-kinder 2', 'Kinder',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
];

function getStudentProgramOptions(category) {
  if (category === 'Basic Education') return BASIC_EDUCATION_PROGRAM_OPTIONS;
  if (category === 'Tertiary') return TERTIARY_PROGRAM_OPTIONS;
  if (category === 'Graduate School') return ALL_GRADUATE_PROGRAMS;
  return [...BASIC_EDUCATION_PROGRAM_OPTIONS, ...TERTIARY_PROGRAM_OPTIONS, ...ALL_GRADUATE_PROGRAMS];
}

function parseNameParts(record) {
  if (!record) return { lastName: '-', firstName: '-', middleName: '-' };

  if (record.last_name || record.first_name || record.middle_name) {
    return {
      lastName:   escapeText(record.last_name),
      firstName:  escapeText(record.first_name),
      middleName: escapeText(record.middle_name),
    };
  }

  const fullName = String(record.name || '').trim();
  if (!fullName) return { lastName: '-', firstName: '-', middleName: '-' };

  const nameParts = fullName.split(/\s+/);
  return {
    lastName:   escapeText(nameParts[0] || '-'),
    firstName:  escapeText(nameParts[1] || '-'),
    middleName: escapeText(nameParts.slice(2).join(' ') || '-'),
  };
}

function showToast(message, type = 'success') {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `app-toast show ${type}`;
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => { toast.className = 'app-toast'; }, 2600);
}

function inferPageType(table) {
  if (table?.dataset?.tableType) return table.dataset.tableType;
  const page = window.location.pathname.split('/').pop();
  if (page === 'students.php')   return 'students';
  if (page === 'employee.php')   return 'employees';
  if (page === 'attendance.php') return 'attendance';
  if (page === 'users.php')      return 'users';
  return 'generic';
}

function getEndpoint(table) {
  return table?.dataset?.endpoint || '';
}

const USER_OVERRIDES_STORAGE_KEY = 'fcpc-users-ui-overrides';

function getUserRecordKey(record) {
  const candidates = [record?.id, record?.employee_id, record?.employee_number, record?.username, record?.email];
  const key = candidates.find((v) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-');
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
          escapeText(record.status || (record.rfid_uid && record.rfid_uid !== '-' ? 'registered' : 'unregistered')),
          escapeText(record.name),
          escapeText(record.program),
          escapeText(record.year_level),
          escapeText(record.department),
        ],
        searchText: [record.student_number, record.rfid_uid, record.status, record.name, record.program, record.year_level, record.department, record.strand].join(' ').toLowerCase(),
        department: escapeText(record.department),
        yearLevel:  escapeText(record.year_level),
        program:    escapeText(record.program),
        strand:     escapeText(record.strand || ''),
        category:   escapeText(record.category),
        typeValue:  '',
        dateValue:  normalizeDate(record.created_at),
        record,
      };
    case 'employees':
      return {
        cells: [
          escapeText(record.employee_number),
          escapeText(record.rfid_uid),
          escapeText(record.status || (record.rfid_uid && record.rfid_uid !== '-' ? 'registered' : 'unregistered')),
          escapeText(record.name),
          escapeText(record.position),
          escapeText(record.department),
        ],
        searchText: [record.employee_number, record.rfid_uid, record.status, record.name, record.position, record.department].join(' ').toLowerCase(),
        department: escapeText(record.department),
        position:   escapeText(record.position),
        typeValue:  '',
        dateValue:  normalizeDate(record.created_at),
        record,
      };
    case 'attendance':
      return {
        cells: [
          escapeText(record.log_date),
          escapeText(record.rfid_uid),
          escapeText(record.name),
          escapeText(record.registration_status || 'Unregistered'),
          formatTime(record.time_in),
          formatTime(record.time_out),
        ],
        searchText: [record.rfid_uid, record.name, record.department, record.registration_status, record.status, record.record_type, record.log_date].join(' ').toLowerCase(),
        department: escapeText(record.department),
        program:    escapeText(record.program || ''),
        yearLevel:  escapeText(record.year_level || ''),
        strand:     escapeText(record.strand || ''),
        category:   escapeText(record.category || ''),
        statusValue: escapeText(record.registration_status || 'Unregistered'),
        typeValue:  escapeText(record.record_type),
        dateValue:  normalizeDate(record.log_date),
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
        typeValue:  escapeText(record.role),
        dateValue:  normalizeDate(record.created_at),
      };
    default:
      return {
        cells:      Object.values(record).map(escapeText),
        searchText: Object.values(record).join(' ').toLowerCase(),
        department: '',
        typeValue:  '',
        dateValue:  '',
      };
  }
}

function renderNoDataRow(table, message) {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const row  = document.createElement('tr');
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
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    const start = Math.max(2, tableState.currentPage - 1);
    const end   = Math.min(totalPages - 1, tableState.currentPage + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) { if (!pages.includes(i)) pages.push(i); }
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
  if (totalPages <= 1) { paginationDiv.style.display = 'none'; return; }
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
  const totalPages   = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
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
    const row   = document.createElement('tr');

    if (record.department) row.dataset.department = record.department;
    if (model.typeValue)   row.dataset.type        = model.typeValue;
    if (model.dateValue)   row.dataset.date        = model.dateValue;
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
      viewBtn.className   = 'row-action-btn view';
      viewBtn.textContent = 'View';
      viewBtn.onclick = (e) => {
        e.preventDefault();
        if (tableState.pageType === 'students')       openViewStudentModal(record);
        else if (tableState.pageType === 'employees') openViewEmployeeModal(record);
        else                                           openViewUserModal(record);
      };

      const editBtn = document.createElement('button');
      editBtn.className   = 'row-action-btn edit';
      editBtn.textContent = 'Edit';
      editBtn.onclick = (e) => {
        e.preventDefault();
        if (tableState.pageType === 'students')       openEditStudentModal(record);
        else if (tableState.pageType === 'employees') openEditEmployeeModal(record);
        else                                           openEditUserModal(record);
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
    for (let j = 0; j < colCount; j++) emptyRow.appendChild(document.createElement('td'));
    tbody.appendChild(emptyRow);
  }

  updatePagination(totalPages);
}

// ── Student filter helpers ────────────────────────────────────────────────────

function _showGroup(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function _hideGroup(id)  { document.getElementById(id)?.classList.add('hidden'); }
function _resetSelect(id){ const el = document.getElementById(id); if (el) el.value = 'all'; }

/**
 * Rebuilds ALL student filter dropdowns whenever the category changes.
 * This is the single source of truth for what is visible and what options exist.
 */
function onStudentCategoryChange() {
  const category = document.getElementById('categorySelect')?.value || 'all';

  // ── Department ──
if (category === 'Basic Education') {
  _hideGroup('departmentFilterGroup');
  _resetSelect('departmentSelect');
} else if (category === 'Graduate School') {
  setSelectOptions(document.getElementById('departmentSelect'), Object.keys(GRADUATE_PROGRAMS_MAP), 'All Departments');
  _showGroup('departmentFilterGroup');
  _resetSelect('departmentSelect');
} else {
  // Tertiary or "all"
  setSelectOptions(document.getElementById('departmentSelect'), TERTIARY_DEPARTMENTS, 'All Departments');
  _showGroup('departmentFilterGroup');
  _resetSelect('departmentSelect');
}
// ── Year Level ──
const yearLevelSelect = document.getElementById('yearLevelSelect');
if (category === 'Graduate School') {
  document.getElementById('yearLevelSelect')?.closest('.filter-group')?.classList.add('hidden');
  _resetSelect('yearLevelSelect');
} else if (category === 'Basic Education') {
  document.getElementById('yearLevelSelect')?.closest('.filter-group')?.classList.remove('hidden');
  setSelectOptions(yearLevelSelect, BASIC_YEAR_LEVELS, 'All Year Levels');
  _resetSelect('yearLevelSelect');
} else if (category === 'Tertiary') {
  document.getElementById('yearLevelSelect')?.closest('.filter-group')?.classList.remove('hidden');
  setSelectOptions(yearLevelSelect, TERTIARY_YEAR_LEVELS, 'All Year Levels');
  _resetSelect('yearLevelSelect');
} else {
  // 'all'
  document.getElementById('yearLevelSelect')?.closest('.filter-group')?.classList.remove('hidden');
  setSelectOptions(yearLevelSelect, [...BASIC_YEAR_LEVELS, ...TERTIARY_YEAR_LEVELS], 'All Year Levels');
  _resetSelect('yearLevelSelect');
}

  // ── Program / Strand (derived from category + year level) ──
  _resetSelect('programSelect');
  onStudentYearLevelChange(category);

  tableState.currentPage = 1;
  applyFilters();
}

/**
 * Rebuilds the Program/Strand filter group whenever the year level changes.
 * Pass `categoryOverride` when calling from onStudentCategoryChange to avoid
 * reading a stale DOM value.
 */
function onStudentYearLevelChange(categoryOverride) {
  const category  = categoryOverride !== undefined
    ? categoryOverride
    : (document.getElementById('categorySelect')?.value || 'all');
  const yearLevel = document.getElementById('yearLevelSelect')?.value || 'all';

  const programFilterGroup = document.getElementById('programFilterGroup');
  const programFilterLabel = document.getElementById('programFilterLabel');
  const programSelect      = document.getElementById('programSelect');

  if (!programFilterGroup) return;

  if (category === 'Basic Education') {
    if (NO_PROGRAM_YEAR_LEVELS.includes(yearLevel)) {
      // Pre-kinder 1 → Grade 10: hide program/strand entirely
      _hideGroup('programFilterGroup');
      _resetSelect('programSelect');
    } else if (STRAND_YEAR_LEVELS.includes(yearLevel)) {
      // Grade 11 / 12: show Strand options
      if (programFilterLabel) programFilterLabel.textContent = 'Strand';
      setSelectOptions(programSelect, STRAND_OPTIONS, 'All Strands');
      _showGroup('programFilterGroup');
      _resetSelect('programSelect');
    } else {
      // "all" year level selected under Basic Education — hide until a level is picked
      _hideGroup('programFilterGroup');
      _resetSelect('programSelect');
    }
  } else if (category === 'Tertiary') {
    // Always show program for Tertiary; filter by department if one is chosen
    if (programFilterLabel) programFilterLabel.textContent = 'Program';
    const dept         = document.getElementById('departmentSelect')?.value || 'all';
    const programs     = dept !== 'all' ? (COLLEGE_PROGRAMS_MAP[dept] || ALL_TERTIARY_PROGRAMS) : ALL_TERTIARY_PROGRAMS;
    setSelectOptions(programSelect, programs, 'All Programs');
    _showGroup('programFilterGroup');
    _resetSelect('programSelect');
  } else if (category === 'Graduate School') {
  if (programFilterLabel) programFilterLabel.textContent = 'Program';
  setSelectOptions(programSelect, ALL_GRADUATE_PROGRAMS, 'All Programs');
  _showGroup('programFilterGroup');
  _resetSelect('programSelect');
} else {
    // category === 'all'
  if (yearLevel === 'all') {
    if (programFilterLabel) programFilterLabel.textContent = 'Program';
    setSelectOptions(programSelect, [...BASIC_EDUCATION_PROGRAM_OPTIONS, ...ALL_TERTIARY_PROGRAMS, ...ALL_GRADUATE_PROGRAMS], 'All Programs');
    _showGroup('programFilterGroup');
    _resetSelect('programSelect');
    } else if (NO_PROGRAM_YEAR_LEVELS.includes(yearLevel)) {
      _hideGroup('programFilterGroup');
      _resetSelect('programSelect');
    } else if (STRAND_YEAR_LEVELS.includes(yearLevel)) {
      if (programFilterLabel) programFilterLabel.textContent = 'Strand';
      setSelectOptions(programSelect, STRAND_OPTIONS, 'All Strands');
      _showGroup('programFilterGroup');
      _resetSelect('programSelect');
    } else {
      // Tertiary year levels selected under "all" category
      if (programFilterLabel) programFilterLabel.textContent = 'Program';
      setSelectOptions(programSelect, ALL_TERTIARY_PROGRAMS, 'All Programs');
      _showGroup('programFilterGroup');
      _resetSelect('programSelect');
    }
  }
}

/**
 * When the department filter changes under Tertiary, narrow the program list.
 */
function onStudentDepartmentChange() {
  const category = document.getElementById('categorySelect')?.value || 'all';
  const dept = document.getElementById('departmentSelect')?.value || 'all';
  const programSelect = document.getElementById('programSelect');
  const programFilterLabel = document.getElementById('programFilterLabel');

  if (category === 'Tertiary') {
    const programs = dept !== 'all' ? (COLLEGE_PROGRAMS_MAP[dept] || ALL_TERTIARY_PROGRAMS) : ALL_TERTIARY_PROGRAMS;
    if (programFilterLabel) programFilterLabel.textContent = 'Program/Strand';
    setSelectOptions(programSelect, programs, 'All Programs/Strands');
    _resetSelect('programSelect');
  } else if (category === 'Graduate School') {
    const programs = dept !== 'all' ? (GRADUATE_PROGRAMS_MAP[dept] || ALL_GRADUATE_PROGRAMS) : ALL_GRADUATE_PROGRAMS;
    if (programFilterLabel) programFilterLabel.textContent = 'Program/Strand';
    setSelectOptions(programSelect, programs, 'All Programs/Strands');
    _resetSelect('programSelect');
  } else if (category === 'all') {
    let programs;
    if (dept !== 'all') {
      programs = COLLEGE_PROGRAMS_MAP[dept] || GRADUATE_PROGRAMS_MAP[dept] || [...BASIC_EDUCATION_PROGRAM_OPTIONS, ...ALL_TERTIARY_PROGRAMS, ...ALL_GRADUATE_PROGRAMS];
    } else {
      programs = [...BASIC_EDUCATION_PROGRAM_OPTIONS, ...ALL_TERTIARY_PROGRAMS, ...ALL_GRADUATE_PROGRAMS];
    }
    if (programFilterLabel) programFilterLabel.textContent = 'Program/Strand';
    setSelectOptions(programSelect, programs, 'All Programs/Strands');
    _showGroup('programFilterGroup');
    _resetSelect('programSelect');
  }

  tableState.currentPage = 1;
  applyFilters();
}

// ── Legacy populate wrappers (kept for reloadTable compatibility) ──────────────

function populateDepartmentSelect(category) {
  // Delegated to the new coordinator — only called for employees page now
  if (tableState.pageType !== 'students') {
    setSelectOptions(document.getElementById('departmentSelect'), TERTIARY_DEPARTMENTS, 'All Departments');
  }
}

function populateYearLevelSelect() { /* handled by onStudentCategoryChange */ }
function populateCourseSelect()    { /* handled by onStudentCategoryChange */ }
function populateCategorySelect()  { /* options are static in HTML */ }
function populateStrandSelect()    { /* handled by onStudentYearLevelChange */ }

function populatePositionSelect(rows) {
  const select = document.getElementById('positionSelect');
  if (!select) return;
  const positions = [...new Set(rows.map((r) => escapeText(r.position)).filter((v) => v && v !== '-'))].sort();
  setSelectOptions(select, positions, 'All Positions');
}

// ── applyFilters ──────────────────────────────────────────────────────────────

function applyFilters(resetPage = true) {
  const search     = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const type       = (document.getElementById('typeSelect')?.value || 'all').toLowerCase();
  const date       = normalizeDate(document.getElementById('dateInput')?.value || '');
  const status     = (document.getElementById('statusSelect')?.value || 'all').toLowerCase();
  const dept       = (document.getElementById('departmentSelect')?.value || 'all').toLowerCase();
  const category   = (document.getElementById('categorySelect')?.value || 'all').toLowerCase();
  const yearLevel  = (document.getElementById('yearLevelSelect')?.value || 'all').toLowerCase();
  const program    = (document.getElementById('programSelect')?.value || 'all').toLowerCase();
  const position   = (document.getElementById('positionSelect')?.value || 'all').toLowerCase();

  tableState.filteredRows = tableState.rows.filter((record) => {
    const model = buildRowModel(tableState.pageType, record);

    if (search && !model.searchText.includes(search)) return false;
    if (type !== 'all' && model.typeValue.toLowerCase() !== type) return false;
    if (date && model.dateValue !== date) return false;

    if (tableState.pageType === 'attendance') {
      if (status !== 'all' && (model.statusValue || '').toLowerCase() !== status) return false;
    }

    if (tableState.pageType === 'students') {
      if (category !== 'all' && model.category.toLowerCase() !== category) return false;
      if (dept !== 'all' && model.department.toLowerCase() !== dept) return false;
      if (yearLevel !== 'all' && model.yearLevel.toLowerCase() !== yearLevel) return false;

      // program filter doubles as strand filter depending on year level shown
      if (program !== 'all') {
        const matchProgram = model.program.toLowerCase() === program;
        const matchStrand  = model.strand.toLowerCase() === program;
        if (!matchProgram && !matchStrand) return false;
      }
    }

    if (tableState.pageType === 'employees') {
      if (dept !== 'all' && model.department.toLowerCase() !== dept) return false;
      if (position !== 'all' && model.position.toLowerCase() !== position) return false;
    }

    return true;
  });

  if (resetPage) tableState.currentPage = 1;
  renderCurrentPage();
}

// ── bindTableControls ─────────────────────────────────────────────────────────

function bindAdditionalFilterControls() {
  if (tableState.pageType === 'students') {
    // Category drives everything else
    document.getElementById('categorySelect')?.addEventListener('change', onStudentCategoryChange);
    // Year level drives program/strand
    document.getElementById('yearLevelSelect')?.addEventListener('change', () => {
      _resetSelect('programSelect');
      onStudentYearLevelChange();
      tableState.currentPage = 1;
      applyFilters();
    });
    // Department narrows programs under Tertiary
    document.getElementById('departmentSelect')?.addEventListener('change', onStudentDepartmentChange);
    // Program / Strand just filters
    document.getElementById('programSelect')?.addEventListener('change', () => {
      tableState.currentPage = 1;
      applyFilters();
    });
  }

  if (tableState.pageType === 'employees') {
    document.getElementById('positionSelect')?.addEventListener('change', () => {
      tableState.currentPage = 1;
      applyFilters();
    });
    document.getElementById('departmentSelect')?.addEventListener('change', () => {
      tableState.currentPage = 1;
      applyFilters();
    });
  }
}

function bindTableControls() {
  document.getElementById('searchInput')?.addEventListener('input', () => applyFilters());
  document.getElementById('typeSelect')?.addEventListener('change', () => applyFilters());
  document.getElementById('dateInput')?.addEventListener('change', () => applyFilters());
  bindAdditionalFilterControls();
}

// ── initStudentFilters ────────────────────────────────────────────────────────
// Sets initial visibility state when the page first loads (all = "all" selected)

function initStudentFilters() {
  setSelectOptions(document.getElementById('departmentSelect'), [...TERTIARY_DEPARTMENTS, ...Object.keys(GRADUATE_PROGRAMS_MAP)], 'All Departments');
  _showGroup('departmentFilterGroup');

  setSelectOptions(
    document.getElementById('yearLevelSelect'),
    [...BASIC_YEAR_LEVELS, ...TERTIARY_YEAR_LEVELS],
    'All Year Levels'
  );

  const programFilterLabel = document.getElementById('programFilterLabel');
  if (programFilterLabel) programFilterLabel.textContent = 'Program/Strand';
  setSelectOptions(
    document.getElementById('programSelect'),
    [...BASIC_EDUCATION_PROGRAM_OPTIONS, ...ALL_TERTIARY_PROGRAMS, ...ALL_GRADUATE_PROGRAMS],
    'All Programs/Strands'
  );
  _showGroup('programFilterGroup');
}

// ── loadTableData ─────────────────────────────────────────────────────────────

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

    tableState.rows         = tableState.pageType === 'users' ? mergeUserOverrides(rows) : rows;
    tableState.filteredRows = tableState.rows.slice();

    if (tableState.pageType === 'students') {
      initStudentFilters();
    } else if (tableState.pageType === 'employees') {
      populateDepartmentSelect();
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

  if (!email || !password) { showLoginMessage('Please enter your email/username and password.'); return; }

  clearLoginMessage();
  if (btn) { btn.disabled = true; btn.textContent = 'Logging in…'; }

  try {
    const res  = await fetch('../controllers/login.php', {
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
    for (let c = 0; c < columns; c++) {
      const cell = document.createElement('span');
      cell.className = 'skeleton-cell';
      header.appendChild(cell);
    }
    skeleton.appendChild(header);

    for (let r = 0; r < rowCount; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'skeleton-row';
      for (let c = 0; c < columns; c++) {
        const cell = document.createElement('span');
        cell.className = 'skeleton-cell';
        rowEl.appendChild(cell);
      }
      skeleton.appendChild(rowEl);
    }

    wrapper.appendChild(skeleton);
    wrapper.classList.add('loading');
    setTimeout(() => { wrapper.classList.remove('loading'); skeleton.remove(); }, 550);
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
      await fetch('../controllers/logout.php', { method: 'POST', headers: { 'X-CSRF-Token': getCsrfToken(), 'Accept': 'application/json' } });
    } catch (e) {
      console.warn('Logout request failed:', e);
    } finally {
      navigateWithTransition('login.php');
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

// ── Export ────────────────────────────────────────────────────────────────────

function getExportPageLabel(pageType) {
  if (pageType === 'students')   return 'Student';
  if (pageType === 'employees')  return 'Employee';
  if (pageType === 'attendance') return 'Attendance';
  return 'Record';
}

function getUniqueFieldValues(rows, field) {
  return [...new Set(rows.map((row) => escapeText(row?.[field])).filter((v) => v && v !== '-'))].sort((a, b) => a.localeCompare(b));
}

function getExportHeadersAndRows(pageType, rows) {
  switch (pageType) {
    case 'students':
      return {
        headers: ['Student No.', 'RFID UID', 'Status', 'Name', 'Program', 'Year Level', 'Department'],
        rows: rows.map((r) => [escapeText(r.student_number), escapeText(r.rfid_uid), escapeText(r.status || 'unregistered'), escapeText(r.name), escapeText(r.program), escapeText(r.year_level), escapeText(r.department)]),
      };
    case 'employees':
      return {
        headers: ['Employee No.', 'RFID UID', 'Status', 'Name', 'Position', 'Department'],
        rows: rows.map((r) => [escapeText(r.employee_number), escapeText(r.rfid_uid), escapeText(r.status || 'unregistered'), escapeText(r.name), escapeText(r.position), escapeText(r.department)]),
      };
    case 'attendance':
      return {
        headers: ['Date', 'RFID UID', 'Status', 'Name', 'Time In', 'Time Out'],
        rows: rows.map((r) => [escapeText(r.log_date), escapeText(r.rfid_uid), escapeText(r.registration_status || 'Unregistered'), escapeText(r.name), escapeText(r.time_in), escapeText(r.time_out)]),
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
      if (sortKey === 'department')     return escapeText(record.department);
      if (sortKey === 'program')        return escapeText(record.program);
      if (sortKey === 'year_level')     return escapeText(record.year_level);
      return parts.lastName;
    case 'employees':
      if (sortKey === 'employee_number') return escapeText(record.employee_number);
      if (sortKey === 'department')      return escapeText(record.department);
      if (sortKey === 'position')        return escapeText(record.position);
      return parts.lastName;
    case 'attendance':
      if (sortKey === 'reference_number') return escapeText(record.reference_number);
      if (sortKey === 'type')             return escapeText(record.record_type);
      if (sortKey === 'name')             return escapeText(record.name);
      return escapeText(record.log_date);
    default:
      return '';
  }
}

function getExportModalBody(pageType, rows) {
  const optionsFromRows = (field, allLabel) => {
    const uniqueValues = [...new Set(rows.map((row) => escapeText(row?.[field])).filter((value) => value && value !== '-'))].sort((a, b) => a.localeCompare(b));
    return [`<option value="all">${allLabel}</option>`, ...uniqueValues.map((value) => `<option value="${value.replace(/"/g, '&quot;')}">${value}</option>`)].join('');
  };

  if (pageType === 'students') {
    return `
      <div class="export-body-grid">
        <div class="export-field export-field-full" style="position:relative;">
        rows: rows.map((r) => [escapeText(r.log_date), escapeText(r.rfid_uid), escapeText(r.registration_status || 'Unregistered'), escapeText(r.name), escapeText(r.time_in), escapeText(r.time_out)]),
          <input id="exportSearchInput" type="text" class="export-control" placeholder="Enter Name or Student Number" autocomplete="off" oninput="onExportSearchInput()" onfocus="onExportSearchInput()" />
          <div id="exportSearchResults" style="position:absolute;left:0;right:0;top:100%;margin-top:6px;border:1px solid #d0d7de;border-radius:8px;max-height:220px;overflow-y:auto;display:none;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,0.12);z-index:50;"></div>
        </div>
        <div class="export-section-label export-field-full">Category</div>
        <div class="export-field export-field-full">
          <label for="exportCategorySelect">Category</label>
          <select id="exportCategorySelect" class="export-control export-select" onchange="updateExportFiltersForCategory(this.value)">
            <option value="all">All</option>
            <option value="Basic Education">Basic Education</option>
            <option value="Tertiary">Tertiary</option>
            <option value="Graduate School">Graduate School</option>
          </select>
        </div>
        <div class="export-section-label export-field-full">Filters</div>
        <div class="export-field export-filter-wrapper" data-filter="department">
          <label for="exportDepartmentSelect">Department</label>
          <select id="exportDepartmentSelect" class="export-control export-select" disabled>
            <option value="all">All Departments</option>
            ${TERTIARY_DEPARTMENTS.map((d) => `<option value="${d}">${d}</option>`).join('')}
            <option value="Professional Track">Professional Track</option>
            <option value="Academic Track">Academic Track</option>
            </select>
          <div class="export-filter-status" style="display:none;font-size:12px;color:#999;margin-top:4px;"></div>
        </div>
        <div class="export-field export-filter-wrapper" data-filter="program">
          <label for="exportProgramSelect">Program</label>
          <select id="exportProgramSelect" class="export-control export-select" disabled>
            ${buildOptionsMarkup(getStudentProgramOptions('all'), 'All Programs')}
          </select>
          <div class="export-filter-status" style="display:none;font-size:12px;color:#999;margin-top:4px;"></div>
        </div>
        <div class="export-field export-filter-wrapper" data-filter="yearLevel">
          <label for="exportYearLevelSelect">Year Level</label>
          <select id="exportYearLevelSelect" class="export-control export-select" disabled>
            <option value="all">All Year Levels</option>
            ${[...BASIC_YEAR_LEVELS, ...TERTIARY_YEAR_LEVELS].map((y) => `<option value="${y}">${y}</option>`).join('')}
          </select>
          <div class="export-filter-status" style="display:none;font-size:12px;color:#999;margin-top:4px;"></div>
        </div>
        <div class="export-field export-filter-wrapper" data-filter="strand">
          <label for="exportStrandSelect">Strand</label>
          <select id="exportStrandSelect" class="export-control export-select" disabled>
            ${buildOptionsMarkup(STRAND_OPTIONS, 'All Strands')}
          </select>
          <div class="export-filter-status" style="display:none;font-size:12px;color:#999;margin-top:4px;"></div>
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
      </div>`;
  }

  if (pageType === 'employees') {
    return `
      <div class="export-body-grid">
        <div class="export-field export-field-full" style="position:relative;">
          <label for="exportSearchInput">Search</label>
          <input id="exportSearchInput" type="text" class="export-control" placeholder="Enter Name or Employee Number" autocomplete="off" oninput="onExportSearchInput()" onfocus="onExportSearchInput()" />
          <div id="exportSearchResults" style="position:absolute;left:0;right:0;top:100%;margin-top:6px;border:1px solid #d0d7de;border-radius:8px;max-height:220px;overflow-y:auto;display:none;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,0.12);z-index:50;"></div>
        </div>
        <div class="export-section-label export-field-full">Filter</div>
        <div class="export-field">
          <label for="exportDepartmentSelect">Department</label>
          <select id="exportDepartmentSelect" class="export-control export-select">
            <option value="all">All Departments</option>
            ${TERTIARY_DEPARTMENTS.map((d) => `<option value="${d}">${d}</option>`).join('')}
            <option value="Senior High School (Academic)">Senior High School (Academic)</option>
            <option value="Senior High School (Technical-Vocational)">Senior High School (Technical-Vocational)</option>
            <option value="Senior High School (Information and Communication Technology)">Senior High School (ICT)</option>
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
      </div>`;
  }

  if (pageType === 'attendance') {
    return `
      <div class="export-body-grid">
        <div class="export-field export-field-full" style="position:relative;">
          <label for="exportSearchInput">Search</label>
          <input id="exportSearchInput" type="text" class="export-control" placeholder="Search by Name or RFID UID" autocomplete="off" oninput="onExportSearchInput()" onfocus="onExportSearchInput()" />
          <div id="exportSearchResults" style="position:absolute;left:0;right:0;top:100%;margin-top:6px;border:1px solid #d0d7de;border-radius:8px;max-height:220px;overflow-y:auto;display:none;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,0.12);z-index:50;"></div>
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
          <label>Type</label>
          <div class="export-checkbox-row">
            ${['All', 'Student', 'Employee'].map((v) => `
              <label class="export-checkbox">
                <input type="checkbox" name="exportUserType" value="${v}" onchange="updateAttendanceTypeFilters()" />
                <span>${v}</span>
              </label>`).join('')}
          </div>
        </div>

        <div class="export-field">
          <label for="exportStatusSelect">Status</label>
          <select id="exportStatusSelect" class="export-control export-select">
            <option value="all">All</option>
            <option value="registered">Registered</option>
            <option value="unregistered">Unregistered</option>
          </select>
        </div>

        <div id="attendanceDynamicFilters" class="export-field export-field-full"></div>
        <div class="export-section-label export-field-full">Sort By</div>
        <div class="export-field">
          <label for="exportPrimarySort">Primary Sort</label>
          <select id="exportPrimarySort" class="export-control export-select">
            <option value="log_date">Date</option>
            <option value="reference_number">RFID UID</option>
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
      </div>`;
  }

  return '';
}

function openExportModal() {
  const modal = document.getElementById('exportModal');
  const title = document.getElementById('exportModalTitle');
  const body  = document.getElementById('exportModalBody');
  if (!modal || !title || !body) return;

  const pageType = tableState.pageType;
  if (!pageType || pageType === 'generic') { showToast('Export is not available on this page.', 'error'); return; }

  exportState.entity = pageType;
  const rows = Array.isArray(tableState.rows) ? tableState.rows : [];

  title.textContent = `Export ${getExportPageLabel(pageType)} Records`;
  body.innerHTML = getExportModalBody(pageType, rows);
  initExportSearchSuggestions(pageType, rows);

  if (pageType === 'students')   updateExportFiltersForCategory('all');
  if (pageType === 'attendance') updateAttendanceTypeFilters();

  modal.classList.add('show');
}

function closeExportModal() {
  document.getElementById('exportModal')?.classList.remove('show');
}

function updateYearLevelOptions(category) {
  const yearLevelSelect = document.getElementById('exportYearLevelSelect');
  if (!yearLevelSelect) return;

  let levels = [];
  if (category === 'all')             levels = [...BASIC_YEAR_LEVELS, ...TERTIARY_YEAR_LEVELS];
  else if (category === 'Basic Education') levels = BASIC_YEAR_LEVELS;
  else if (category === 'Tertiary')   levels = TERTIARY_YEAR_LEVELS;
  else if (category === 'Graduate School') levels = [];

  yearLevelSelect.innerHTML = '<option value="all">All Year Levels</option>' +
    levels.map((y) => `<option value="${y}">${y}</option>`).join('');
}

function getStudentFiltersFragment() {
  return `
    <div class="export-section-label export-field-full">Student Filters</div>
    <div class="export-field export-filter-wrapper" data-filter="category">
      <label for="exportCategorySelect">Category</label>
      <select id="exportCategorySelect" class="export-control export-select" onchange="updateExportFiltersForCategory(this.value)">
        <option value="all">All</option>
        <option value="Basic Education">Basic Education</option>
        <option value="Tertiary">Tertiary</option>
        <option value="Graduate School">Graduate School</option>
      </select>
    </div>
    <div class="export-field export-filter-wrapper" data-filter="department">
      <label for="exportDepartmentSelect">Department</label>
      <select id="exportDepartmentSelect" class="export-control export-select">
        <option value="all">All Departments</option>
        ${TERTIARY_DEPARTMENTS.map((d) => `<option value="${d}">${d}</option>`).join('')}
      </select>
      <div class="export-filter-status" style="display:none;font-size:12px;color:#999;margin-top:4px;"></div>
    </div>
    <div class="export-field export-filter-wrapper" data-filter="program">
      <label for="exportProgramSelect">Program</label>
      <select id="exportProgramSelect" class="export-control export-select">
        <option value="all">All Programs</option>
        ${ALL_TERTIARY_PROGRAMS.map((p) => `<option value="${p}">${p}</option>`).join('')}
      </select>
      <div class="export-filter-status" style="display:none;font-size:12px;color:#999;margin-top:4px;"></div>
    </div>
    <div class="export-field export-filter-wrapper" data-filter="yearLevel">
      <label for="exportYearLevelSelect">Year Level</label>
      <select id="exportYearLevelSelect" class="export-control export-select">
        <option value="all">All Year Levels</option>
      </select>
      <div class="export-filter-status" style="display:none;font-size:12px;color:#999;margin-top:4px;"></div>
    </div>
    <div class="export-field export-filter-wrapper" data-filter="strand">
      <label for="exportStrandSelect">Strand</label>
      <select id="exportStrandSelect" class="export-control export-select">
        ${buildOptionsMarkup(STRAND_OPTIONS, 'All Strands')}
      </select>
      <div class="export-filter-status" style="display:none;font-size:12px;color:#999;margin-top:4px;"></div>
    </div>`;
}

function updateAttendanceTypeFilters() {
  const container = document.getElementById('attendanceDynamicFilters');
  if (!container) return;

  const checked = [...document.querySelectorAll('input[name="exportUserType"]:checked')].map((i) => i.value.toLowerCase());
  container.innerHTML = '';

  if (checked.includes('employee')) {
    container.insertAdjacentHTML('beforeend', `
      <div class="export-section-label export-field-full">Employee Filters</div>
      <div class="export-field">
        <label for="exportDepartmentSelect">Department</label>
        <select id="exportDepartmentSelect" class="export-control export-select">
          <option value="all">All Departments</option>
          ${TERTIARY_DEPARTMENTS.map((d) => `<option value="${d}">${d}</option>`).join('')}
        </select>
      </div>`);
  }

  if (checked.includes('student')) {
    container.insertAdjacentHTML('beforeend', getStudentFiltersFragment());
    updateYearLevelOptions(document.getElementById('exportCategorySelect')?.value || 'all');
    updateExportFiltersForCategory(document.getElementById('exportCategorySelect')?.value || 'all');
  }
}

function updateExportFiltersForCategory(category) {
  const departmentSelect = document.getElementById('exportDepartmentSelect');
  const programSelect    = document.getElementById('exportProgramSelect');
  const yearLevelSelect  = document.getElementById('exportYearLevelSelect');
  const strandSelect     = document.getElementById('exportStrandSelect');

  const filters = {
    department: document.querySelector('[data-filter="department"]'),
    program:    document.querySelector('[data-filter="program"]'),
    yearLevel:  document.querySelector('[data-filter="yearLevel"]'),
    strand:     document.querySelector('[data-filter="strand"]'),
  };

  const enableSelect  = (el) => { if (el) el.disabled = false; };
  const disableSelect = (el) => { if (el) { el.disabled = true; el.value = 'all'; } };

  const updateFilterStatus = (wrapper, enabled, message = '') => {
    if (!wrapper) return;
    const status = wrapper.querySelector('.export-filter-status');
    if (!status) return;
    if (enabled) { status.style.display = 'none'; }
    else         { status.textContent = message || 'Not applicable for this category'; status.style.display = 'block'; }
  };

  // Disable all first
  disableSelect(departmentSelect);
  disableSelect(programSelect);
  disableSelect(yearLevelSelect);
  disableSelect(strandSelect);

  updateYearLevelOptions(category);

  if (category === 'all') {
    enableSelect(departmentSelect);
    setSelectOptions(programSelect, getStudentProgramOptions('all'), 'All Programs');
    enableSelect(programSelect);
    enableSelect(yearLevelSelect);
    enableSelect(strandSelect);
    if (yearLevelSelect) yearLevelSelect.onchange = null;
    updateFilterStatus(filters.department, true);
    updateFilterStatus(filters.program,    true);
    updateFilterStatus(filters.yearLevel,  true);
    updateFilterStatus(filters.strand,     true);

  } else if (category === 'Basic Education') {
    enableSelect(departmentSelect);
    setSelectOptions(programSelect, getStudentProgramOptions('Basic Education'), 'All Programs');
    disableSelect(programSelect);
    enableSelect(yearLevelSelect);

    const updateStrandAvailability = () => {
      const yl = (yearLevelSelect?.value || '').toLowerCase();
      const applicable = yl === 'grade 11' || yl === 'grade 12';
      if (applicable) {
        setSelectOptions(strandSelect, STRAND_OPTIONS, 'All Strands');
        enableSelect(strandSelect);
        updateFilterStatus(filters.strand, true);
      } else {
        disableSelect(strandSelect);
        updateFilterStatus(filters.strand, false, 'Available for Grade 11/12 only');
      }
    };

    updateStrandAvailability();
    if (yearLevelSelect) yearLevelSelect.onchange = updateStrandAvailability;

    updateFilterStatus(filters.department, true);
    updateFilterStatus(filters.program,    false, 'Not applicable for Basic Education');
    updateFilterStatus(filters.yearLevel,  true);

  } else if (category === 'Tertiary') {
    enableSelect(departmentSelect);
    setSelectOptions(programSelect, getStudentProgramOptions('Tertiary'), 'All Programs');
    enableSelect(programSelect);
    enableSelect(yearLevelSelect);
    disableSelect(strandSelect);
    if (yearLevelSelect) yearLevelSelect.onchange = null;
    updateFilterStatus(filters.department, true);
    updateFilterStatus(filters.program,    true);
    updateFilterStatus(filters.yearLevel,  true);
    updateFilterStatus(filters.strand,     false, 'Not applicable for Tertiary');

  } else if (category === 'Graduate School') {
    enableSelect(departmentSelect);
    setSelectOptions(programSelect, getStudentProgramOptions('Graduate School'), 'All Programs');
    enableSelect(programSelect);
    disableSelect(yearLevelSelect);
    disableSelect(strandSelect);
    if (yearLevelSelect) yearLevelSelect.onchange = null;
    updateFilterStatus(filters.department, true);
    updateFilterStatus(filters.program,    true);
    updateFilterStatus(filters.yearLevel,  false, 'Not applicable for Graduate School');
    updateFilterStatus(filters.strand,     false, 'Not applicable for Graduate School');
  }
}

function initExportSearchSuggestions(pageType, rows) {
  tableState.exportSearchPageType = pageType;
  tableState.exportSearchRows     = Array.isArray(rows) ? rows.slice() : [];
  tableState.exportSearchQuery    = '';
  const input = document.getElementById('exportSearchInput');
  if (input) { input.value = ''; input.focus(); }
  renderExportSearchSuggestions('');
}

function getExportSearchCandidate(record, pageType) {
  if (pageType === 'students') {
    return {
      id:         escapeText(record.student_number),
      name:       escapeText(record.name),
      department: escapeText(record.department),
      display:    `${escapeText(record.student_number)} — ${escapeText(record.name)}`,
      searchText: [record.student_number, record.name, record.department].join(' ').toLowerCase(),
    };
  }
  if (pageType === 'employees') {
    return {
      id:         escapeText(record.employee_number),
      name:       escapeText(record.name),
      department: escapeText(record.department),
      display:    `${escapeText(record.employee_number)} — ${escapeText(record.name)}`,
      searchText: [record.employee_number, record.name, record.department].join(' ').toLowerCase(),
    };
  }
  if (pageType === 'attendance') {
    return {
      id:         escapeText(record.rfid_uid),
      name:       escapeText(record.name),
      department: escapeText(record.department),
      display:    `${escapeText(record.rfid_uid)} — ${escapeText(record.name)}`,
      searchText: [record.rfid_uid, record.name, record.department, record.registration_status, record.record_type, record.log_date].join(' ').toLowerCase(),
    };
  }
  return null;
}

function renderExportSearchSuggestions(query) {
  const box = document.getElementById('exportSearchResults');
  if (!box) return;

  const pageType        = tableState.exportSearchPageType;
  const rows            = Array.isArray(tableState.exportSearchRows) ? tableState.exportSearchRows : [];
  const normalizedQuery = String(query || '').trim().toLowerCase();

  if (!normalizedQuery) { box.innerHTML = ''; box.style.display = 'none'; return; }

  const matches = [];
  rows.forEach((record) => {
    const candidate = getExportSearchCandidate(record, pageType);
    if (!candidate) return;
    if (candidate.searchText.includes(normalizedQuery) || candidate.id.toLowerCase().includes(normalizedQuery) || candidate.name.toLowerCase().includes(normalizedQuery)) {
      matches.push(candidate);
    }
  });

  const seen    = new Set();
  const unique  = matches.filter((item) => { const key = `${item.id}::${item.name}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const limited = unique.slice(0, 12);

  if (!limited.length) {
    box.innerHTML = '<div style="padding:10px 14px;color:#888;font-size:13px;">No matching records found.</div>';
    box.style.display = 'block';
    return;
  }

  box.innerHTML = limited.map((item) => `
    <div class="export-result-item"
      style="padding:9px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #eee;"
      onmouseenter="this.style.background='#e8eaf6'"
      onmouseleave="this.style.background=''"
      onclick="selectExportSearchResult(${JSON.stringify(item).replace(/"/g, '&quot;')})">
      <strong>${item.id}</strong> — ${item.name}
      ${item.department && item.department !== '-' ? `<span style="color:#888;margin-left:6px;">(${item.department})</span>` : ''}
    </div>`).join('');
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
  const box   = document.getElementById('exportSearchResults');
  if (input) input.value = result.id && result.name ? `${result.id} — ${result.name}` : (result.id || result.name || '');
  if (box)   { box.style.display = 'none'; box.innerHTML = ''; }
  tableState.exportSearchQuery = input?.value || '';
}

function collectExportRows(pageType) {
  const rows      = Array.isArray(tableState.rows) ? tableState.rows.slice() : [];
  const searchVal = (document.getElementById('exportSearchInput')?.value || '').trim().toLowerCase();
  const primarySort = document.getElementById('exportPrimarySort')?.value || 'last_name';
  const sortOrder   = document.getElementById('exportSortOrder')?.value   || 'asc';

  const filteredRows = rows.filter((record) => {
    const model = buildRowModel(pageType, record);
    if (searchVal && !model.searchText.includes(searchVal)) return false;

    if (pageType === 'students') {
      const deptVal      = (document.getElementById('exportDepartmentSelect')?.value || 'all').toLowerCase();
      const programVal   = (document.getElementById('exportProgramSelect')?.value    || 'all').toLowerCase();
      const yearLevelVal = (document.getElementById('exportYearLevelSelect')?.value  || 'all').toLowerCase();
      const strandVal    = (document.getElementById('exportStrandSelect')?.value     || 'all').toLowerCase();
      if (deptVal      !== 'all' && model.department.toLowerCase() !== deptVal)          return false;
      if (programVal   !== 'all' && model.program.toLowerCase()    !== programVal)        return false;
      if (yearLevelVal !== 'all' && model.yearLevel.toLowerCase()  !== yearLevelVal)      return false;
      if (strandVal    !== 'all' && model.strand.toLowerCase()     !== strandVal)         return false;
    }

    if (pageType === 'employees') {
      const deptVal     = (document.getElementById('exportDepartmentSelect')?.value || 'all').toLowerCase();
      const positionVal = (document.getElementById('exportPositionSelect')?.value   || 'all').toLowerCase();
      if (deptVal     !== 'all' && model.department.toLowerCase() !== deptVal)   return false;
      if (positionVal !== 'all' && model.position.toLowerCase()   !== positionVal) return false;
    }

    if (pageType === 'attendance') {
      const dateFrom      = normalizeDate(document.getElementById('exportDateFrom')?.value || '');
      const dateTo        = normalizeDate(document.getElementById('exportDateTo')?.value   || '');
      const statusVal     = (document.getElementById('exportStatusSelect')?.value || 'all').toLowerCase();
      const selectedTypes = [...document.querySelectorAll('input[name="exportUserType"]:checked')].map((i) => i.value.toLowerCase());
      const isAllSelected = selectedTypes.includes('all') || !selectedTypes.length;
      const modelType     = (model.typeValue || '').toLowerCase();

      if (dateFrom && model.dateValue < dateFrom) return false;
      if (dateTo   && model.dateValue > dateTo)   return false;
      if (statusVal !== 'all' && (model.statusValue || '').toLowerCase() !== statusVal) return false;

      if (modelType === 'unregistered') {
        // Unregistered rows are controlled by the Status filter only.
      } else if (!isAllSelected && !selectedTypes.includes(modelType)) {
        return false;
      }

      const empDeptVal     = (document.getElementById('exportDepartmentSelect')?.value  || 'all').toLowerCase();
      const stuCategoryVal = (document.getElementById('exportCategorySelect')?.value    || 'all').toLowerCase();
      const stuDeptVal     = (document.getElementById('exportDepartmentSelect')?.value  || 'all').toLowerCase();
      const stuProgramVal  = (document.getElementById('exportProgramSelect')?.value     || 'all').toLowerCase();
      const stuYearVal     = (document.getElementById('exportYearLevelSelect')?.value   || 'all').toLowerCase();
      const stuStrandVal   = (document.getElementById('exportStrandSelect')?.value      || 'all').toLowerCase();

      if (modelType === 'employee' && empDeptVal !== 'all' && model.department.toLowerCase() !== empDeptVal) return false;
      if (modelType === 'student') {
        if (stuCategoryVal !== 'all' && (model.category   || '').toLowerCase() !== stuCategoryVal) return false;
        if (stuDeptVal     !== 'all' && (model.department || '').toLowerCase()  !== stuDeptVal)     return false;
        if (stuProgramVal  !== 'all' && (model.program    || '').toLowerCase()  !== stuProgramVal)  return false;
        if (stuYearVal     !== 'all' && (model.yearLevel  || '').toLowerCase()  !== stuYearVal)     return false;
        if (stuStrandVal   !== 'all' && (model.strand     || '').toLowerCase()  !== stuStrandVal)   return false;
      }
    }

    return true;
  });

  filteredRows.sort((a, b) => {
    const av = getExportSortValue(pageType, a, primarySort).toString().toLowerCase();
    const bv = getExportSortValue(pageType, b, primarySort).toString().toLowerCase();
    const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
    return sortOrder === 'desc' ? cmp * -1 : cmp;
  });

  return filteredRows;
}

async function handleExport() {
  const pageType = exportState.entity || tableState.pageType;
  if (!pageType || pageType === 'generic') { showToast('Export is not available on this page.', 'error'); return; }

  const filters = {};

  if (pageType === 'students') {
    filters.search     = (document.getElementById('exportSearchInput')?.value || '').trim();
    filters.category   = document.getElementById('exportCategorySelect')?.value  || 'all';
    filters.department = document.getElementById('exportDepartmentSelect')?.value || 'all';
    filters.program    = document.getElementById('exportProgramSelect')?.value    || 'all';
    filters.yearLevel  = document.getElementById('exportYearLevelSelect')?.value  || 'all';
    filters.strand     = document.getElementById('exportStrandSelect')?.value     || 'all';
  } else if (pageType === 'employees') {
    filters.search     = (document.getElementById('exportSearchInput')?.value || '').trim();
    filters.department = document.getElementById('exportDepartmentSelect')?.value || 'all';
    filters.position   = document.getElementById('exportPositionSelect')?.value   || 'all';
  } else if (pageType === 'attendance') {
    filters.search     = (document.getElementById('exportSearchInput')?.value || '').trim();
    filters.dateFrom   = document.getElementById('exportDateFrom')?.value || '';
    filters.dateTo     = document.getElementById('exportDateTo')?.value   || '';
    filters.userTypes  = [...document.querySelectorAll('input[name="exportUserType"]:checked')].map((i) => i.value);
    filters.department = document.getElementById('exportDepartmentSelect')?.value || 'all';
    filters.category   = document.getElementById('exportCategorySelect')?.value   || 'all';
    filters.program    = document.getElementById('exportProgramSelect')?.value     || 'all';
    filters.yearLevel  = document.getElementById('exportYearLevelSelect')?.value   || 'all';
    filters.strand     = document.getElementById('exportStrandSelect')?.value      || 'all';
  }

  const formData = new FormData();
  formData.append('type', pageType);
  formData.append('filters', JSON.stringify(filters));

  try {
    const response = await fetch('../controllers/export.php', { method: 'POST', body: formData });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
      throw new Error('Export failed. Please try again.');
    }

    const blob = await response.blob();
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const contentDisposition = response.headers.get('content-disposition') || '';
    const match = contentDisposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
    const serverFileName = match?.[1] ? decodeURIComponent(match[1].trim()) : '';
    link.href     = url;
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
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) headers['X-CSRF-Token'] = getCsrfToken();

  const response = await fetch(endpoint, { method, headers, body: JSON.stringify(body) });
  const payload  = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

// ── Reload helper ─────────────────────────────────────────────────────────────

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

    tableState.rows         = tableState.pageType === 'users' ? mergeUserOverrides(rows) : rows;
    tableState.filteredRows = tableState.rows.slice();

    if (tableState.pageType === 'employees') {
      populateDepartmentSelect();
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
  if (!tableState.table || tableState.pageType !== 'attendance') return;
  stopRealtimeTableRefresh();
  realtimeState.timer = window.setInterval(() => {
    if (document.hidden || isModalOpen()) return;
    reloadTable();
  }, 1000);
}

function stopRealtimeTableRefresh() {
  if (realtimeState.timer !== null) { window.clearInterval(realtimeState.timer); realtimeState.timer = null; }
}

// ── Users ─────────────────────────────────────────────────────────────────────

function openAddUserModal()  { document.getElementById('addUserModal')?.classList.add('show'); }
function closeAddUserModal() { document.getElementById('addUserModal')?.classList.remove('show'); }

function openViewUserModal(record) {
  const modal = document.getElementById('viewUserModal');
  if (!modal) return;

  const setValue = (id, v) => { const el = document.getElementById(id); if (el) el.value       = escapeText(v); };
  const setText  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = escapeText(v); };

  setValue('viewUserEmployeeNumber', record.employee_number);
  setValue('viewUserName',           record.name);
  setValue('viewUserUsername',       record.username);
  setValue('viewUserEmail',          record.email);
  setValue('viewUserRole',           record.role);
  setValue('viewUserStatus',         record.is_active ? 'Active' : 'Inactive');
  setText('viewUserCreatedAt',       formatLongDate(record.created_at));
  setText('viewUserUpdatedAt',       formatLongDate(record.updated_at));
  modal.classList.add('show');
}

function closeViewUserModal() { document.getElementById('viewUserModal')?.classList.remove('show'); }

function openEditUserModal(record) {
  const modal = document.getElementById('editUserModal');
  if (!modal) { showToast('Edit modal not found.', 'error'); return; }

  const setValue = (id, v) => { const el = document.getElementById(id); if (el) el.value = escapeText(v); };
  setValue('editUserEmployeeNumber', record.employee_number);
  setValue('editUserName',           record.name);
  setValue('editUserUsername',       record.username);
  setValue('editUserEmail',          record.email);
  setValue('editUserRole',           record.role === 'Super Admin' ? 'Superadmin' : record.role);
  setValue('editUserStatus',         record.is_active ? 'Active' : 'Inactive');

  modal._record = record;
  modal.classList.add('show');
}

function closeEditUserModal() { document.getElementById('editUserModal')?.classList.remove('show'); }

function openUpdateUserModal() {
  const modal      = document.getElementById('updateUserModal');
  const confirmBtn = document.getElementById('updateUserConfirm');
  if (!modal) return;
  const closeModal = () => { modal.classList.remove('show'); confirmBtn?.removeEventListener('click', closeModal); };
  confirmBtn?.addEventListener('click', closeModal);
  modal.classList.add('show');
}

async function saveEditUser() {
  const modal  = document.getElementById('editUserModal');
  const record = modal?._record;
  if (!record) { showToast('User record not found.', 'error'); return; }

  const username = document.getElementById('editUserUsername')?.value.trim() || '';
  const email    = document.getElementById('editUserEmail')?.value.trim()    || '';
  const role     = document.getElementById('editUserRole')?.value             || '';
  const status   = document.getElementById('editUserStatus')?.value          || '';

  if (!username) { showToast('Username is required.', 'error'); return; }
  if (!email)    { showToast('Email is required.', 'error');    return; }
  if (!role)     { showToast('Role is required.', 'error');     return; }

  saveUserOverride(record, {
    username,
    email,
    role:       role === 'Superadmin' ? 'Superadmin' : role,
    is_active:  status === 'Active',
    updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  });

  closeEditUserModal();
  await reloadTable();
  openUpdateUserModal();
}

if (typeof saveAddUser === 'undefined') { window.saveAddUser = function () {}; }

// ── Students ──────────────────────────────────────────────────────────────────

const departmentCoursesMap = {
  'Basic Education': ['Kindergarten', 'Elementary', 'Junior High School (With STE Programs)', 'Senior High School'],
  'Senior High School (Academic)': [
    'General Academic Strand (GAS)', 'Accountancy, Business and Management (ABM)',
    'Humanities and Social Sciences Strand (HUMSS)', 'Science, Technology, Engineering, and Mathematics Strand (STEM)',
  ],
  'Senior High School (Technical-Vocational)': [
    'Home Economics', 'Tourism Promotion Services (NC II)', 'Front Office Services (NC II)',
    'Beauty/Nail Care (NC II)', 'Bread and Pastry Production (NC II)', 'Food and Beverage Services (NC II)',
    'Hair Dressing (NC II)', 'Cookery (NC II)', 'Commercial Cooking (NC II)', 'Caregiving (NC II)',
  ],
  'Senior High School (Information and Communication Technology)': [
    'Contact Center Services (NC II)', 'Computer Hardware Servicing (NC II)', 'Technical Drafting (NC II)',
  ],
  'Senior High School (Agriculture and Fishery Arts)': ['Crop Production (NC II)', 'Organic Agriculture (NC II)'],
  'Senior High School (Arts and Design)': ['Performing Arts', 'Visual Arts'],
  'College of Accountancy': [
    'Bachelor of Science in Accountancy', 'Bachelor of Science in Management Accounting',
    'Bachelor of Science in Accounting Information System', 'Bachelor of Science in Internal Auditing',
  ],
  'College of Allied Medical Sciences': ['Bachelor of Science in Nursing', 'Bachelor of Science in Midwifery'],
  'College of Business Management': [
    'Bachelor of Science in Hospitality Management', 'Bachelor of Science in Tourism Management',
    'Bachelor of Science in Office Management',
    'Bachelor of Science in Business Administration Major in Finance Management',
    'Bachelor of Science in Business Administration Major in Marketing Management',
  ],
  'College of Criminal Justice': ['Bachelor of Science in Criminology'],
  'College of Education': [
    'Bachelor of Elementary Education',
    'Bachelor of Secondary Education Major in: English, Science, Mathematics, Social Studies, Values Education, and Filipino',
    'Certificate in Teaching Education', 'Bachelor of Physical Education', 'Bachelor of Technology & Livelihood Education',
  ],
  'College of Computer Studies': [
    'Bachelor of Science in Information Technology with CISCO Certification program',
    'Bachelor of Science in Information Technology with specialization in Software Engineering',
    'Bachelor of Science in Information Technology with specialization in Cybersecurity',
    'Bachelor of Science in Computer Science',
  ],
  'College of Arts and Sciences': [
    'Bachelor or Arts in Communication', 'Bachelor of Science in Biology',
    'Bachelor of Science in Psychology', 'Bachelor or Arts in Psychology',
  ],
  'College of Engineering': ['Bachelor of Science in Civil Engineering'],
};

function populateAddStudentDepartmentOptions() {
  const deptSelect    = document.getElementById('addStudentDepartment');
  const programSelect = document.getElementById('addStudentProgram');
  if (!deptSelect) return;

  deptSelect.innerHTML = '<option value="">Select Department</option>';
  Object.keys(departmentCoursesMap).forEach((key) => {
    if (key.startsWith('College')) {
      const opt = document.createElement('option');
      opt.value = opt.textContent = key;
      deptSelect.appendChild(opt);
    }
  });

  if (programSelect) {
    programSelect.innerHTML = '<option value="">Select Program</option>';
    programSelect.disabled  = true;
    programSelect.classList.add('disabled');
  }
}

function updateCourseOptionsForAddStudent() {
  const deptSelect    = document.getElementById('addStudentDepartment');
  const programSelect = document.getElementById('addStudentProgram');
  if (!deptSelect || !programSelect) return;

  const selected = deptSelect.value;
  const courses  = departmentCoursesMap[selected] || [];

  if (!selected) {
    programSelect.innerHTML = '<option value="">Select Program</option>';
    programSelect.disabled  = true;
    programSelect.classList.add('disabled');
    return;
  }

  programSelect.disabled = false;
  programSelect.classList.remove('disabled');
  programSelect.innerHTML = '<option value="">Select Program</option>';
  courses.forEach((course) => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = course;
    programSelect.appendChild(opt);
  });
}

function updateYearLevelOptionsForAddStudent() {
  const programSelect    = document.getElementById('addStudentProgram');
  const yearLevelSelect  = document.getElementById('addStudentYearLevel');
  if (!programSelect || !yearLevelSelect) return;

  const selected = programSelect.value;
  const collegiate  = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
  const elementary  = ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'];
  const juniorHigh  = ['Grade 7','Grade 8','Grade 9','Grade 10'];
  const seniorHigh  = ['Grade 11','Grade 12'];

  let options    = collegiate;
  let isDisabled = false;

  if (selected === 'Kindergarten')                             isDisabled = true;
  else if (selected === 'Elementary')                          options = elementary;
  else if (selected === 'Junior High School (With STE Programs)') options = juniorHigh;
  else if (selected === 'Senior High School')                  options = seniorHigh;

  yearLevelSelect.disabled = isDisabled;
  yearLevelSelect.classList.toggle('disabled', isDisabled);
  yearLevelSelect.innerHTML = '<option value="">Select Year Level</option>';
  if (!isDisabled) {
    options.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = o;
      yearLevelSelect.appendChild(opt);
    });
  }
}

function initAddStudentModalCourseFiltering() {
  populateAddStudentDepartmentOptions();
  document.getElementById('addStudentDepartment')?.addEventListener('change', updateCourseOptionsForAddStudent);
  document.getElementById('addStudentProgram')?.addEventListener('change', updateYearLevelOptionsForAddStudent);
}

function updateProgramOptionsForGraduate() {
  const deptSelect    = document.getElementById('addStudentDepartmentGraduate');
  const programSelect = document.getElementById('addStudentProgramGraduate');
  if (!deptSelect || !programSelect) return;

  const selected = deptSelect.value;
  const programs = selected ? (GRADUATE_PROGRAMS_MAP[selected] || []) : [];

  if (!selected) {
    programSelect.innerHTML = '<option value="">Select Program</option>';
    programSelect.disabled  = true;
    programSelect.classList.add('disabled');
    return;
  }

  programSelect.disabled = false;
  programSelect.classList.remove('disabled');
  programSelect.innerHTML = '<option value="">Select Program</option>';
  programs.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = p;
    programSelect.appendChild(opt);
  });
}
function initAddStudentModalCourseFiltering() {
  populateAddStudentDepartmentOptions();
  document.getElementById('addStudentDepartment')?.addEventListener('change', updateCourseOptionsForAddStudent);
  document.getElementById('addStudentProgram')?.addEventListener('change', updateYearLevelOptionsForAddStudent);
  document.getElementById('addStudentDepartmentGraduate')?.addEventListener('change', updateProgramOptionsForGraduate);
}

function openViewStudentModal(record) {
  const modal = document.getElementById('viewStudentModal');
  if (!modal) return;

  const parts    = parseNameParts(record);
  const setValue = (id, v) => { const el = document.getElementById(id); if (el) el.value       = escapeText(v); };
  const setText  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = escapeText(v); };

  setValue('viewStudentLastName',   parts.lastName);
  setValue('viewStudentFirstName',  parts.firstName);
  setValue('viewStudentMiddleName', parts.middleName);
  setValue('viewStudentNumber',     record.student_number);
  setValue('viewStudentCategory',   record.category);
  setValue('viewStudentProgram',    record.program);
  setValue('viewStudentYearLevel',  record.year_level);
  setValue('viewStudentStrand',     record.strand);
  setValue('viewStudentDepartment', record.department);
  setValue('viewStudentRfid',       record.rfid_uid);
  setText('viewStudentCreatedAt',   formatLongDate(record.created_at));
  setText('viewStudentUpdatedAt',   formatLongDate(record.updated_at));
  modal.classList.add('show');
}

function closeViewStudentModal() { document.getElementById('viewStudentModal')?.classList.remove('show'); }

function openEditStudentModal(record) {
  const modal = document.getElementById('editStudentModal');
  if (!modal) { showToast('Edit modal not found.', 'error'); return; }

  const parts    = parseNameParts(record);
  const setValue = (id, v) => { const el = document.getElementById(id); if (el) el.value = escapeText(v); };

  setValue('editStudentFirstName',  parts.firstName);
  setValue('editStudentMiddleName', parts.middleName);
  setValue('editStudentLastName',   parts.lastName);
  setValue('editStudentNumber',     record.student_number);
  setValue('editStudentCategory',   record.category);
  setValue('editStudentProgram',    record.program);
  setValue('editStudentYearLevel',  record.year_level);
  setValue('editStudentStrand',     record.strand);
  setValue('editStudentDepartment', record.department);
  setValue('editStudentRfid',       record.rfid_uid !== '-' ? record.rfid_uid : '');

  // Set RFID field to read-only (only RFID scanning can populate)
  const rfidInput = document.getElementById('editStudentRfid');
  if (rfidInput) rfidInput.readOnly = true;

  modal._record = record;
  window._editStudentId = record.id;
  modal.classList.add('show');
}

function closeEditStudentModal() {
  document.getElementById('editStudentModal')?.classList.remove('show');
  window._editStudentId = 0;
}

function clearEditStudentRfid() {
  const rfidInput = document.getElementById('editStudentRfid');
  
  if (rfidInput) {
    rfidInput.value = '';
    rfidInput.placeholder = 'Tap RFID card or use clear button...';
    rfidInput.readOnly = true;
  }
  
  showToast('RFID UID cleared. Ready to scan.', 'info');
  
  // Re-enable auto-fetch after clearing
  if (window.startRfidAutoFetch) {
    setTimeout(() => window.startRfidAutoFetch(), 300);
  }
}

async function saveEditStudent() {
  const modal  = document.getElementById('editStudentModal');
  const record = modal?._record;
  if (!record?.id) { showToast('Student record not found.', 'error'); return; }

  const rfid = document.getElementById('editStudentRfid')?.value.trim() || '';
  try {
    const endpoint = getEndpoint(tableState.table) || '../../controllers/students.php';
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

  modal.querySelectorAll('input').forEach((el)  => (el.value = ''));
  modal.querySelectorAll('select').forEach((el) => (el.value = ''));

  document.getElementById('addStudentBasicEducationFields').style.display = 'none';
  document.getElementById('addStudentTertiaryFields').style.display       = 'none';
  document.getElementById('addStudentGraduateFields').style.display       = 'none';
  document.getElementById('addStudentStrandFieldsBE').style.display       = 'none';

  document.getElementById('addStudentCategory')?.addEventListener('change', handleAddStudentCategoryChange);
  initAddStudentModalCourseFiltering();
  modal.classList.add('show');
}

function handleAddStudentCategoryChange() {
  const category = document.getElementById('addStudentCategory')?.value || '';
  document.getElementById('addStudentBasicEducationFields').style.display = 'none';
  document.getElementById('addStudentTertiaryFields').style.display       = 'none';
  document.getElementById('addStudentGraduateFields').style.display       = 'none';
  document.getElementById('addStudentStrandFieldsBE').style.display       = 'none';

  if (category === 'Basic Education') document.getElementById('addStudentBasicEducationFields').style.display = 'grid';
  else if (category === 'Tertiary')   document.getElementById('addStudentTertiaryFields').style.display       = 'grid';
  else if (category === 'Graduate School') document.getElementById('addStudentGraduateFields').style.display  = 'grid';
}

document.addEventListener('DOMContentLoaded', function () {
  const yearLevelBE = document.getElementById('addStudentYearLevelBE');
  if (yearLevelBE) {
    yearLevelBE.addEventListener('change', function () {
      const strandFields = document.getElementById('addStudentStrandFieldsBE');
      if (this.value === 'Grade 11' || this.value === 'Grade 12') strandFields.style.display = 'flex';
      else strandFields.style.display = 'none';
    });
  }
});

function closeAddStudentModal() { document.getElementById('addStudentModal')?.classList.remove('show'); }

function clearAddRfid(fieldId) {
  const rfidInput = document.getElementById(fieldId);
  if (rfidInput) {
    rfidInput.value = '';
    rfidInput.placeholder = 'Tap RFID card to scan...';
    rfidInput.readOnly = true;
    showToast('RFID UID cleared. Ready to scan.', 'info');
    // Re-enable auto-fetch after clearing
    if (window.startRfidAutoFetch) {
      setTimeout(() => window.startRfidAutoFetch(), 300);
    }
  }
}

async function saveAddStudent() {
  const get = (id) => document.getElementById(id)?.value.trim() || '';
  const category = get('addStudentCategory');
  if (!category) { showToast('Category is required.', 'error'); return; }

  const body = {
    first_name:     get('addStudentFirstName'),
    middle_name:    get('addStudentMiddleName'),
    suffix:         get('addStudentSuffix'),
    last_name:      get('addStudentLastName'),
    student_number: get('addStudentNumber'),
    category,
    rfid_uid:       get('addStudentRfid'),
  };

  if (!body.first_name || !body.last_name || !body.student_number) {
    showToast('First name, last name, and student number are required.', 'error');
    return;
  }

  if (category === 'Basic Education') {
    body.year_level = get('addStudentYearLevelBE');
    body.strand     = get('addStudentStrandBE');
    if (!body.year_level) { showToast('Year level is required for Basic Education.', 'error'); return; }
  } else if (category === 'Tertiary') {
    body.department = get('addStudentDepartment');
    body.program    = get('addStudentProgram');
    body.year_level = get('addStudentYearLevelTertiary');
    if (!body.department || !body.program || !body.year_level) {
      showToast('Department, program, and year level are required for Tertiary.', 'error'); return;
    }
 } else if (category === 'Graduate School') {
    body.department = get('addStudentDepartmentGraduate');
    body.program    = get('addStudentProgramGraduate');
    if (!body.department || !body.program) {
      showToast('Department and program are required for Graduate School.', 'error'); return;
    }
  }

  try {
    const endpoint = getEndpoint(tableState.table) || '../../controllers/students.php';
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
  const setValue = (id, v) => { const el = document.getElementById(id); if (el) el.value       = escapeText(v); };
  const setText  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = escapeText(v); };

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

function closeViewEmployeeModal() { document.getElementById('viewEmployeeModal')?.classList.remove('show'); }

function openEditEmployeeModal(record) {
  const modal = document.getElementById('editEmployeeModal');
  if (!modal) { showToast('Edit modal not found.', 'error'); return; }

  const parts    = parseNameParts(record);
  const setValue = (id, v) => { const el = document.getElementById(id); if (el) el.value = escapeText(v); };

  setValue('editEmployeeFirstName',  parts.firstName);
  setValue('editEmployeeMiddleName', parts.middleName);
  setValue('editEmployeeLastName',   parts.lastName);
  setValue('editEmployeeNumber',     record.employee_number);
  setValue('editEmployeeDepartment', record.department);
  setValue('editEmployeePosition',   record.position);
  setValue('editEmployeeRfid',       record.rfid_uid !== '-' ? record.rfid_uid : '');

  // Set RFID field to read-only (only RFID scanning can populate)
  const rfidInput = document.getElementById('editEmployeeRfid');
  if (rfidInput) rfidInput.readOnly = true;

  modal._record = record;
  window._editEmployeeId = record.id;
  modal.classList.add('show');
}

function closeEditEmployeeModal() {
  document.getElementById('editEmployeeModal')?.classList.remove('show');
  window._editEmployeeId = 0;
}

function clearEditEmployeeRfid() {
  const rfidInput = document.getElementById('editEmployeeRfid');
  
  if (rfidInput) {
    rfidInput.value = '';
    rfidInput.placeholder = 'Tap RFID card or use clear button...';
    rfidInput.readOnly = true;
  }
  
  showToast('RFID UID cleared. Ready to scan.', 'info');
  
  // Re-enable auto-fetch after clearing
  if (window.startRfidAutoFetch) {
    setTimeout(() => window.startRfidAutoFetch(), 300);
  }
}

async function saveEditEmployee() {
  const modal  = document.getElementById('editEmployeeModal');
  const record = modal?._record;
  if (!record?.id) { showToast('Employee record not found.', 'error'); return; }

  const rfid = document.getElementById('editEmployeeRfid')?.value.trim() || '';
  try {
    const endpoint = getEndpoint(tableState.table) || '../../controllers/employees.php';
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
  modal.querySelectorAll('input').forEach((el)  => (el.value = ''));
  modal.querySelectorAll('select').forEach((el) => (el.value = ''));
  modal.classList.add('show');
}

function closeAddEmployeeModal() { document.getElementById('addEmployeeModal')?.classList.remove('show'); }

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
    const endpoint = getEndpoint(tableState.table) || '../../controllers/employees.php';
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

function closeImportModal() { document.getElementById('importModal')?.classList.remove('show'); }

async function handleImportFile(file) {
  if (!file) return;
  const fileName = String(file.name || '').toLowerCase();
  const maxSize  = 25 * 1024 * 1024;
  if (!fileName.endsWith('.xlsx')) { showToast('Import failed: only .xlsx files are allowed.', 'error'); return; }
  if (file.size > maxSize)         { showToast('Import failed: file is larger than 25 MB.', 'error'); return; }

  const entity   = importState.entity;
  const endpoint = getEndpoint(tableState.table) || `../../controllers/${entity}.php`;
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json', 'X-CSRF-Token': getCsrfToken() }, body: formData });
    const payload  = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || `Import failed (${response.status})`);

    const { inserted = 0, skipped = 0, errors = [] } = payload;
    let message = `Import complete: ${inserted} inserted, ${skipped} skipped.`;
    if (errors.length) { console.warn('Import row errors:', errors); message += ` ${errors.length} row error(s) — check the console for details.`; }

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
  const entity    = tableState.pageType === 'students' ? 'students' : tableState.pageType === 'employees' ? 'employees' : '';

  openBtn?.addEventListener('click', () => { if (!entity) return; openImportModal(entity); });

  fileInput?.addEventListener('change', (e) => {
    handleImportFile(e.target?.files?.[0]);
    e.target.value = '';
  });

  if (dropzone) {
    dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); });
    dropzone.addEventListener('dragleave', ()  => { dropzone.classList.remove('is-dragover'); });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      handleImportFile(e.dataTransfer?.files?.[0]);
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
    link.addEventListener('click', (e) => {
      if (href !== currentPage) { e.preventDefault(); navigateWithTransition(href); }
    });
  });
});

window.addEventListener('beforeunload', stopRealtimeTableRefresh);

// ── Live RFID UID Auto-Fetch with Edit Modal Support ────────────────────────

(function () {
  console.log('Live RFID auto-fetch script loaded.');

  let rfidPollingTimer    = null;
  let latestRfidBufferId  = 0;
  let currentRfidContext  = null;
  let lastValidatedRfid   = null;

  const RFID_API_URL = '/fcpc-tap-track/web/controllers/students.php?action=latest-rfid';

  (async function initRfidBufferId() {
    try {
      const res  = await fetch(`${RFID_API_URL.replace('action=latest-rfid', 'action=rfid-buffer-max-id')}&t=${Date.now()}`, {
        headers: { Accept: 'application/json' }, cache: 'no-store',
      });
      const data = await res.json();
      if (data.success) {
        latestRfidBufferId = data.max_id;
        console.log('RFID buffer initialized at ID:', latestRfidBufferId);
      }
    } catch (e) {
      console.warn('Could not initialize RFID buffer ID:', e);
    }
  })();

  function getContextFromModal() {
    if (document.getElementById('addStudentModal')?.classList.contains('show')) return { type: 'addStudent', recordId: 0 };
    if (document.getElementById('editStudentModal')?.classList.contains('show')) return { type: 'editStudent', recordId: window._editStudentId || 0 };
    if (document.getElementById('addEmployeeModal')?.classList.contains('show')) return { type: 'addEmployee', recordId: 0 };
    if (document.getElementById('editEmployeeModal')?.classList.contains('show')) return { type: 'editEmployee', recordId: window._editEmployeeId || 0 };
    return null;
  }

  function getRfidUidInput() {
    const context = getContextFromModal();
    if (!context) return null;

    const inputIds = {
      'addStudent': 'addStudentRfid',
      'editStudent': 'editStudentRfid',
      'addEmployee': 'addEmployeeRfid',
      'editEmployee': 'editEmployeeRfid',
    };

    return document.getElementById(inputIds[context.type] || '');
  }

  async function validateRfidUid(rfidUid, moduleType, recordId = 0) {
    if (!rfidUid || rfidUid.trim() === '') return;
    if (lastValidatedRfid === rfidUid) return;
    lastValidatedRfid = rfidUid;

    const endpoint = moduleType.includes('student') ? 'students.php' : 'employees.php';
    const apiUrl = `../controllers/${endpoint}?action=validate-rfid&rfid_uid=${encodeURIComponent(rfidUid)}&exclude_id=${recordId}`;

    try {
      const response = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
      
      if (!response.ok) {
        console.error('API response status:', response.status);
        return;
      }
    
      const data = await response.json();

      if (!data.success && data.exists) {
        showToast(`RFID UID already exists: ${data.owner?.name || 'Unknown'}`, 'error');
        const rfidInput = getRfidUidInput();
        if (rfidInput) {
          rfidInput.value = '';
          rfidInput.placeholder = 'RFID UID already in use';
          setTimeout(() => {
            if (rfidInput.value === '') {
              rfidInput.placeholder = 'Tap RFID card now...';
            }
          }, 2000);
        }
        lastValidatedRfid = null;
      } else if (data.success) {
        showToast('RFID UID is valid', 'success');
      }
    } catch (error) {
      console.error('RFID validation error:', error);
    }
  }

  function startRfidAutoFetch() {
    const rfidInput = getRfidUidInput();
    if (!rfidInput) {
      console.error('RFID UID input field was not found.');
      return;
    }

    const context = getContextFromModal();
    if (!context) {
      console.warn('No modal detected');
      return;
    }

    console.log(`RFID auto-fetch started for: ${context.type}`);
    currentRfidContext = context;
    lastValidatedRfid = null;

    rfidInput.readOnly    = true;
    rfidInput.placeholder = 'Tap RFID card now...';
    stopRfidAutoFetch();
    rfidPollingTimer = setInterval(fetchLatestRfidUid, 700);
    fetchLatestRfidUid();
  }

  function stopRfidAutoFetch() {
    if (rfidPollingTimer !== null) {
      clearInterval(rfidPollingTimer);
      rfidPollingTimer = null;
      console.log('RFID auto-fetch stopped.');
    }
  }

  function fetchLatestRfidUid() {
    const rfidInput = getRfidUidInput();
    if (!rfidInput) {
      console.error('RFID UID input field was not found while polling.');
      return;
    }

    const url = `${RFID_API_URL}&last_id=${latestRfidBufferId}&t=${Date.now()}`;
    fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP error: ${r.status}`); return r.json(); })
      .then((data) => {
        console.log('RFID API response:', data);
        if (data.success && data.rfid_uid) {
          latestRfidBufferId    = Number(data.id) || latestRfidBufferId;
          rfidInput.value       = data.rfid_uid;
          rfidInput.placeholder = 'RFID UID captured';
          console.log('RFID UID inserted into input:', data.rfid_uid);

          const context = getContextFromModal();
          if (context) {
            validateRfidUid(data.rfid_uid, context.type, context.recordId);
          }
        }
      })
      .catch((error) => console.error('RFID fetch error:', error));
  }

  document.addEventListener('DOMContentLoaded', function () {
    console.log('RFID DOM listener ready.');

    // Click event listeners for modal buttons
    document.addEventListener('click', function (e) {
      const target      = e.target;
      const clickedText = target.textContent ? target.textContent.trim() : '';

      if (clickedText.includes('Add Student') || target.closest('#addStudentBtn')) {
        setTimeout(startRfidAutoFetch, 300);
      }
      if (clickedText.includes('Add Employee') || target.closest('#addEmployeeBtn')) {
        setTimeout(startRfidAutoFetch, 300);
      }

      if (clickedText.includes('Cancel') || clickedText.includes('Close') || target.closest('.modal-overlay')) {
        stopRfidAutoFetch();
        currentRfidContext = null;
      }
    });

    // Monitor RFID input fields for clearing - re-enable scanning when field is emptied
    const rfidFieldIds = ['addStudentRfid', 'editStudentRfid', 'addEmployeeRfid', 'editEmployeeRfid'];
    rfidFieldIds.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field) {
        // For Edit modals, keep the field read-only at all times
        const isEditModal = fieldId.includes('edit');
        if (isEditModal) {
          field.readOnly = true;
        }

        field.addEventListener('input', function () {
          // Ensure Edit modal RFID fields stay read-only
          if (isEditModal && !this.readOnly) {
            this.readOnly = true;
          }

          if (this.value.trim() === '' && rfidPollingTimer === null) {
            const context = getContextFromModal();
            if (context && (
              (context.type === 'addStudent' && fieldId === 'addStudentRfid') ||
              (context.type === 'editStudent' && fieldId === 'editStudentRfid') ||
              (context.type === 'addEmployee' && fieldId === 'addEmployeeRfid') ||
              (context.type === 'editEmployee' && fieldId === 'editEmployeeRfid')
            )) {
              console.log(`${fieldId} cleared, re-enabling RFID auto-fetch`);
              startRfidAutoFetch();
            }
          }
        });
      }
    });

    // Continuous modal state monitoring
    setInterval(function () {
      const context = getContextFromModal();
      if (context && rfidPollingTimer === null) {
        console.log(`Modal detected: ${context.type}, starting RFID auto-fetch`);
        startRfidAutoFetch();
      } else if (!context && rfidPollingTimer !== null) {
        console.log('Modal closed, stopping RFID auto-fetch');
        stopRfidAutoFetch();
      }
    }, 1000);
  });

  window.startRfidAutoFetch  = startRfidAutoFetch;
  window.stopRfidAutoFetch   = stopRfidAutoFetch;
  window.fetchLatestRfidUid  = fetchLatestRfidUid;
  window.validateRfidUid     = validateRfidUid;
})(); 