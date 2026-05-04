<?php

require_once __DIR__ . '/../config/session.php';
session_start();

if (empty($_SESSION['user_id'])) {
    header('Location: index.php');
    exit;
} 

require_once __DIR__ . '/../api/csrf.php';
?>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Users | FCPC Attendance Tracker</title>
  <link rel="stylesheet" href="assets/css/styles.css" />
  <meta name="csrf-token" content="<?= htmlspecialchars(generate_csrf_token()) ?>">
</head>
<body>

<!-- Page Transition Overlay -->
<div class="page-transition-overlay" id="pageTransitionOverlay"></div>

<div class="dashboard-layout">

  <!-- SIDEBAR -->
  <aside class="sidebar">
    <div class="sidebar-user">
      <div class="sidebar-avatar">
        <img src="images/default-logo.png" alt="Default Logo" />
      </div>
      <div class="sidebar-user-info">
        <h3><?= htmlspecialchars($_SESSION['full_name'] ?? 'User') ?></h3>
        <p><?= htmlspecialchars($_SESSION['role'] ?? 'Administrator') ?></p>
      </div>
    </div>

    <nav class="sidebar-nav">
      <a href="users.php" class="active">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
        </svg>
        Users
      </a>
      <a href="students.php">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6L21 9l-9-6zm0 4.2L17.53 10 12 12.8 6.47 10 12 7.2zM7 12.7l5 2.73 5-2.73v3.16L12 18.6l-5-2.74v-3.16z"/>
        </svg>
        Students
      </a>
      <a href="employee.php">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4zm8-4h2v2h-2v2h-2v-2h-2v-2h2V8h2v2z"/>
        </svg>
        Employees
      </a>
      <a href="attendance.php">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
        </svg>
        Attendance
      </a>
    </nav>

    <div class="sidebar-logout">
      <button class="btn-logout" onclick="handleLogout()">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Log out
      </button>
    </div>
  </aside>

  <!-- MAIN -->
  <div class="main-content">

    <header class="top-header">
      <button class="menu-toggle" onclick="toggleSidebar()" aria-label="Toggle menu">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div class="header-logo">
        <img src="images/fcpc-logo.png" alt="FCPC Logo" height="36" />
      </div>
    </header>

    <main class="page-content">
      <h1 class="page-title">Users</h1>
      <hr class="page-divider" />

      <div class="filters-row" style="display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 24px;">
        <div style="display: flex; gap: 20px; align-items: flex-end;">
          <div class="filter-group">
            <label for="searchInput">Search</label>
            <input type="text" id="searchInput" class="filter-input" placeholder="Search by Name/ID" />
          </div>
          <div class="filter-group">
            <label for="typeSelect">Role</label>
            <select id="typeSelect" class="filter-select">
              <option value="all">All</option>
              <option value="Admin">Admin</option>
              <option value="Superadmin">Superadmin</option>
            </select>
          </div>
        </div>

        <button id="addUserBtn" class="btn-add" onclick="openAddUserModal()" style="background-color: #1a237e; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; white-space: nowrap;">
          + Add User
        </button>
      </div>

      <div class="table-wrapper">
        <div class="table-skeleton" style="display:none;">
          <div class="skeleton-row"></div><div class="skeleton-row"></div>
          <div class="skeleton-row"></div><div class="skeleton-row"></div>
          <div class="skeleton-row"></div><div class="skeleton-row"></div>
          <div class="skeleton-row"></div><div class="skeleton-row"></div>
          <div class="skeleton-row"></div>
        </div>
        <table class="data-table" data-endpoint="../api/users.php" data-table-type="users">
          <thead>
            <tr>
              <th>Employee No.</th>
              <th>Username</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="pagination">
        <button class="pg-btn" id="prevBtn" aria-label="Previous page" onclick="prevPage()">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div id="pageNumbers"></div>
        <button class="pg-btn" id="nextBtn" aria-label="Next page" onclick="nextPage()">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>
    </main>

  </div>
</div>

<!-- Logout Modal -->
<div id="logoutModal" class="modal">
  <div class="modal-overlay"></div>
  <div class="modal-content">
    <h2 class="modal-title">This page says</h2>
    <p class="modal-message">Are you sure you want to log out?</p>
    <div class="modal-buttons">
      <button id="logoutConfirm" class="modal-btn modal-btn-confirm">OK</button>
      <button id="logoutCancel" class="modal-btn modal-btn-cancel">Cancel</button>
    </div>
  </div>
</div>

<!-- Add User Modal -->
<div id="addUserModal" class="modal">
  <div class="modal-overlay" onclick="closeAddUserModal()"></div>
  <div class="modal-content overview-modal-content">
    <div class="overview-header">Add New User</div>

    <div id="empSearchSection">
      <div class="overview-field" style="margin-bottom:8px;">
        <label for="empSearchInput">Search Employee (Name or ID):</label>
        <input id="empSearchInput" type="text" class="edit-input-active"
          placeholder="Type employee number or name..." autocomplete="off"
          oninput="onEmpSearchInput()" />
      </div>
      <div id="empSearchResults" style="border:1px solid #ccc; border-radius:4px; max-height:180px; overflow-y:auto; display:none;"></div>
    </div>

    <div id="empSelectedBanner" style="display:none; background:#e8eaf6; border-radius:6px; padding:8px 12px; font-size:14px; align-items:center; justify-content:space-between;">
      <span id="empSelectedLabel"></span>
      <button type="button" onclick="clearSelectedEmployee()" style="background:none;border:none;cursor:pointer;color:#c62828;font-size:18px;line-height:1;">&#x2715;</button>
    </div>

    <div id="empUserFields" style="display:none;">
      <div class="overview-grid" style="margin-top:10px;">
        <div class="overview-field">
          <label>Employee No.:</label>
          <input id="viewEmpNo" type="text" class="edit-input-active" readonly style="background:#f5f5f5;color:#555;" />
        </div>
        <div class="overview-field">
          <label>First Name:</label>
          <input id="viewFirstName" type="text" class="edit-input-active" readonly style="background:#f5f5f5;color:#555;" />
        </div>
        <div class="overview-field">
          <label>Middle Name:</label>
          <input id="viewMiddleName" type="text" class="edit-input-active" readonly style="background:#f5f5f5;color:#555;" />
        </div>
        <div class="overview-field">
          <label>Last Name:</label>
          <input id="viewLastName" type="text" class="edit-input-active" readonly style="background:#f5f5f5;color:#555;" />
        </div>
        <div class="overview-field">
          <label>Department:</label>
          <input id="viewDepartment" type="text" class="edit-input-active" readonly style="background:#f5f5f5;color:#555;" />
        </div>
        <div class="overview-field">
          <label for="newUsername">Username: <span style="color:red">*</span></label>
          <input id="newUsername" type="text" class="edit-input-active" placeholder="Username" />
        </div>
        <div class="overview-field">
          <label for="newEmail">Email: <span style="color:red">*</span></label>
          <input id="newEmail" type="email" class="edit-input-active" placeholder="email@fcpc.edu.ph" />
        </div>
        <div class="overview-field">
          <label for="newRole">Role: <span style="color:red">*</span></label>
          <select id="newRole" class="edit-input-active overview-select">
            <option value="">Select Role</option>
            <option value="Admin">Admin</option>
            <option value="Superadmin">Super Admin</option>
          </select>
        </div>
        <div class="overview-field">
          <label for="newStatus">Status:</label>
          <select id="newStatus" class="edit-input-active overview-select">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <div class="overview-field overview-field-full">
          <label for="newUserPassword">Password: <span style="color:red">*</span></label>
          <div class="password-wrapper">
            <input id="newUserPassword" type="password" name="password"
              class="edit-input-active" placeholder="Min. 8 characters" autocomplete="new-password" />
            <button type="button" class="toggle-password"
              onclick="toggleModalPassword('newUserPassword', this)" aria-label="Toggle password visibility">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none"
                viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="overview-divider"></div>
    <div class="overview-actions">
      <button type="button" class="overview-back-btn overview-cancel-btn" onclick="closeAddUserModal()">Cancel</button>
      <button type="button" class="overview-back-btn" id="saveUserBtn" onclick="saveAddUser()" style="display:none;">Add User</button>
    </div>
  </div>
</div>

<!-- View User Modal -->
<div id="viewUserModal" class="modal">
  <div class="modal-overlay" onclick="closeViewUserModal()"></div>
  <div class="modal-content overview-modal-content">
    <div class="overview-header">User Overview</div>
    <div class="overview-grid">
      <div class="overview-field">
        <label>Employee No.:</label>
        <input id="viewUserEmployeeNumber" type="text" readonly />
      </div>
      <div class="overview-field">
        <label>Name:</label>
        <input id="viewUserName" type="text" readonly />
      </div>
      <div class="overview-field">
        <label>Username:</label>
        <input id="viewUserUsername" type="text" readonly />
      </div>
      <div class="overview-field">
        <label>Email:</label>
        <input id="viewUserEmail" type="text" readonly />
      </div>
      <div class="overview-field">
        <label>Role:</label>
        <input id="viewUserRole" type="text" readonly />
      </div>
      <div class="overview-field">
        <label>Status:</label>
        <input id="viewUserStatus" type="text" readonly />
      </div>
    </div>
    <div class="overview-divider"></div>
    <div class="overview-meta-row">
      <div><span>Created At:</span> <strong id="viewUserCreatedAt">-</strong></div>
      <div><span>Updated At:</span> <strong id="viewUserUpdatedAt">-</strong></div>
    </div>
    <div class="overview-actions">
      <button type="button" class="overview-back-btn" onclick="closeViewUserModal()">Back</button>
    </div>
  </div>
</div>

<!-- Edit User Modal -->
<div id="editUserModal" class="modal">
  <div class="modal-overlay" onclick="closeEditUserModal()"></div>
  <div class="modal-content overview-modal-content">
    <div class="overview-header">Edit User</div>
    <div class="overview-grid">
      <div class="overview-field">
        <label>Employee No.:</label>
        <input id="editUserEmployeeNumber" type="text" readonly />
      </div>
      <div class="overview-field">
        <label>Name:</label>
        <input id="editUserName" type="text" readonly />
      </div>
      <div class="overview-field">
        <label class="edit-label-active">Username:</label>
        <input id="editUserUsername" type="text" class="edit-input-active" />
      </div>
      <div class="overview-field">
        <label class="edit-label-active">Email:</label>
        <input id="editUserEmail" type="email" class="edit-input-active" />
      </div>
      <div class="overview-field">
        <label class="edit-label-active">Role:</label>
        <select id="editUserRole" class="edit-input-active overview-select">
          <option value="Admin">Admin</option>
          <option value="Superadmin">Super Admin</option>
        </select>
      </div>
      <div class="overview-field">
        <label class="edit-label-active">Status:</label>
        <select id="editUserStatus" class="edit-input-active overview-select">
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>
    </div>
    <div class="overview-divider"></div>
    <div class="overview-actions">
      <button type="button" class="overview-back-btn overview-cancel-btn" onclick="closeEditUserModal()">Cancel</button>
      <button type="button" class="overview-back-btn" onclick="saveEditUser()">Save</button>
    </div>
  </div>
</div>

<script>
    if (localStorage.getItem('sidebar-collapsed') === '1') {
      document.documentElement.classList.add('sidebar-collapsed');
    }
</script>

<script src="assets/js/script.js"></script>

<script>
(function () {
  let _selectedEmployee = null;
  let _searchTimer      = null;

  // ── Add User ────────────────────────────────────────────────────────────────

  window.openAddUserModal = function () {
    resetAddUserModal();
    document.getElementById('addUserModal').classList.add('show');
  };

  window.closeAddUserModal = function () {
    document.getElementById('addUserModal').classList.remove('show');
  };

  function resetAddUserModal() {
    _selectedEmployee = null;
    document.getElementById('empSearchInput').value       = '';
    document.getElementById('empSearchResults').innerHTML = '';
    document.getElementById('empSearchResults').style.display  = 'none';
    document.getElementById('empSelectedBanner').style.display = 'none';
    document.getElementById('empUserFields').style.display     = 'none';
    document.getElementById('saveUserBtn').style.display       = 'none';
    document.getElementById('newUsername').value     = '';
    document.getElementById('newEmail').value        = '';
    document.getElementById('newUserPassword').value = '';
    document.getElementById('newRole').value         = '';
    document.getElementById('newStatus').value       = 'Active';
    const pwInput = document.getElementById('newUserPassword');
    if (pwInput) pwInput.type = 'password';
  }

  window.onEmpSearchInput = function () {
    clearTimeout(_searchTimer);
    const q   = document.getElementById('empSearchInput').value.trim();
    const box = document.getElementById('empSearchResults');

    if (q.length < 1) {
      box.style.display = 'none';
      box.innerHTML     = '';
      return;
    }

    _searchTimer = setTimeout(async () => {
      try {
        const res  = await fetch(`../api/employees-search.php?q=${encodeURIComponent(q)}`);
        const json = await res.json();

        if (!json.success || json.data.length === 0) {
          box.innerHTML    = '<div style="padding:10px 14px;color:#888;font-size:13px;">No matching employees found.</div>';
          box.style.display = 'block';
          return;
        }

        box.innerHTML = json.data.map((emp) => `
          <div class="emp-result-item"
            style="padding:9px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #eee;"
            onmouseenter="this.style.background='#e8eaf6'"
            onmouseleave="this.style.background=''"
            onclick="selectEmployee(${JSON.stringify(emp).replace(/"/g, '&quot;')})">
            <strong>${emp.employee_number}</strong> — ${emp.display_name}
            ${emp.department ? `<span style="color:#888;margin-left:6px;">(${emp.department})</span>` : ''}
          </div>`).join('');
        box.style.display = 'block';
      } catch (e) {
        console.error('Employee search failed:', e);
      }
    }, 300);
  };

  window.selectEmployee = function (emp) {
    _selectedEmployee = emp;
    document.getElementById('empSearchResults').style.display = 'none';
    document.getElementById('empSearchInput').value           = '';
    document.getElementById('empSelectedLabel').textContent   =
      `Selected: ${emp.employee_number} — ${emp.display_name}`;
    document.getElementById('empSelectedBanner').style.display = 'flex';
    document.getElementById('viewEmpNo').value      = emp.employee_number;
    document.getElementById('viewFirstName').value  = emp.first_name;
    document.getElementById('viewMiddleName').value = emp.middle_name || '';
    document.getElementById('viewLastName').value   = emp.last_name;
    document.getElementById('viewDepartment').value = emp.department || '';
    document.getElementById('empUserFields').style.display = 'block';
    document.getElementById('saveUserBtn').style.display   = '';
  };

  window.clearSelectedEmployee = function () {
    _selectedEmployee = null;
    document.getElementById('empSelectedBanner').style.display = 'none';
    document.getElementById('empUserFields').style.display     = 'none';
    document.getElementById('saveUserBtn').style.display       = 'none';
  };

  window.toggleModalPassword = function (inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input || !btn) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.innerHTML = isHidden
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  };

  window.saveAddUser = async function () {
    if (!_selectedEmployee) {
      showToast('Please select an employee first.', 'error');
      return;
    }

    const username = document.getElementById('newUsername').value.trim();
    const email    = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role     = document.getElementById('newRole').value;
    const status   = document.getElementById('newStatus').value;

    if (!username)           { showToast('Username is required.', 'error'); return; }
    if (!email)              { showToast('Email is required.', 'error'); return; }
    if (!role)               { showToast('Please select a role.', 'error'); return; }
    if (!password)           { showToast('Password is required.', 'error'); return; }
    if (password.length < 8) { showToast('Password must be at least 8 characters.', 'error'); return; }

    const btn = document.getElementById('saveUserBtn');
    btn.disabled    = true;
    btn.textContent = 'Saving…';

    try {
      const res = await fetch('../api/users.php', {
        method:  'POST',
        headers: { 
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content ?? '',
         },
        body: JSON.stringify({ employee_id: _selectedEmployee.id, username, email, password, role, status }),
      });

      const json = await res.json();

      if (json.success) {
        showToast('User added successfully.', 'success');
        closeAddUserModal();
        if (typeof reloadTable === 'function') reloadTable();
        else location.reload();
      } else {
        showToast(json.message || 'Failed to add user.', 'error');
      }
    } catch (e) {
      showToast('An unexpected error occurred.', 'error');
      console.error(e);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Add User';
    }
  };

  // ── View User ───────────────────────────────────────────────────────────────

  window.openViewUserModal = function (record) {
    const modal = document.getElementById('viewUserModal');
    if (!modal) return;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '-';
    };
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || '-';
    };

    set('viewUserEmployeeNumber', record.employee_number);
    set('viewUserName',           record.name);
    set('viewUserUsername',       record.username);
    set('viewUserEmail',          record.email);
    set('viewUserRole',           record.role);
    set('viewUserStatus',         record.is_active ? 'Active' : 'Inactive');
    setText('viewUserCreatedAt',  record.created_at);
    setText('viewUserUpdatedAt',  record.updated_at);

    modal.classList.add('show');
  };

  window.closeViewUserModal = function () {
    document.getElementById('viewUserModal')?.classList.remove('show');
  };

  // ── Edit User ───────────────────────────────────────────────────────────────

  window.openEditUserModal = function (record) {
    const modal = document.getElementById('editUserModal');
    if (!modal) return;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    set('editUserEmployeeNumber', record.employee_number);
    set('editUserName',           record.name);
    set('editUserUsername',       record.username);
    set('editUserEmail',          record.email);
    set('editUserRole',           record.role);
    set('editUserStatus',         record.is_active ? 'Active' : 'Inactive');

    modal._record = record;
    modal.classList.add('show');
  };

  window.closeEditUserModal = function () {
    document.getElementById('editUserModal')?.classList.remove('show');
  };

  window.saveEditUser = async function () {
    const modal  = document.getElementById('editUserModal');
    const record = modal?._record;

    if (!record) { showToast('User record not found.', 'error'); return; }

    const username = document.getElementById('editUserUsername').value.trim();
    const email    = document.getElementById('editUserEmail').value.trim();
    const role     = document.getElementById('editUserRole').value;
    const status   = document.getElementById('editUserStatus').value;

    if (!username) { showToast('Username is required.', 'error'); return; }
    if (!email)    { showToast('Email is required.', 'error'); return; }
    if (!role)     { showToast('Please select a role.', 'error'); return; }

    try {
      const res = await fetch('../api/users.php', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          employee_number: record.employee_number,
          username,
          email,
          role,
          status,
        }),
      });

      const json = await res.json();

      if (json.success) {
        showToast('User updated successfully.', 'success');
        closeEditUserModal();
        if (typeof reloadTable === 'function') reloadTable();
        else location.reload();
      } else {
        showToast(json.message || 'Failed to update user.', 'error');
      }
    } catch (e) {
      showToast('An unexpected error occurred.', 'error');
      console.error(e);
    }
  };

})();
</script>

</body>
</html>