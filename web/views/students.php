<?php

require_once __DIR__ . '/../config/session.php';
session_start();

if (empty($_SESSION['user_id'])) {
  header('Location: login.php');
    exit;
}

require_once __DIR__ . '/../controllers/csrf.php';
?>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Students | FCPC Attendance Tracker</title>
  <script>
    if (localStorage.getItem('sidebar-collapsed') === '1') {
      document.documentElement.classList.add('sidebar-collapsed');
    }
  </script>
  <link rel="stylesheet" href="assets/css/styles.css" />
  <link rel="icon" type="image/x-icon" href="images/favicon.ico" />
  <link rel="shortcut icon" type="image/x-icon" href="images/favicon.ico" />
  <link rel="apple-touch-icon" href="images/favicon.ico" />
  <meta name="theme-color" content="#ffffff" />
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
      <a href="users.php">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
        </svg>
        Users
      </a>
      <a href="students.php" class="active">
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
      <h1 class="page-title">Students</h1>
      <hr class="page-divider" />

      <div class="table-toolbar">
        <div class="filters-row table-toolbar-filters">
          <div class="filter-group">
            <label for="searchInput">Search</label>
            <input
              type="text"
              id="searchInput"
              class="filter-input"
              placeholder="Search by Student No./RFID UID/Name"
            />
          </div>
          <div class="filter-group">
            <label for="categorySelect">Category</label>
            <select id="categorySelect" class="filter-select">
              <option value="all">All</option>
              <option value="Basic Education">Basic Education</option>
              <option value="Tertiary">Tertiary</option>
              <option value="Graduate School">Graduate School</option>
            </select>
          </div>
          <div class="filter-group" id="departmentFilterGroup">
            <label for="departmentSelect">Department</label>
            <select id="departmentSelect" class="filter-select">
              <option value="all">All Departments</option>
            </select>
          </div>
          <div class="filter-group">
            <label for="yearLevelSelect">Year Level</label>
            <select id="yearLevelSelect" class="filter-select">
              <option value="all">All Year Levels</option>
            </select>
          </div>
          <div class="filter-group" id="programFilterGroup">
            <label for="programSelect" id="programFilterLabel">Program</label>
            <select id="programSelect" class="filter-select">
              <option value="all">All Programs</option>
            </select>
          </div>
        </div>
        <div class="table-toolbar-actions">
          <button id="addStudentBtn" class="toolbar-btn toolbar-btn-primary" type="button">+ Add Student</button>
          <button id="openImportBtn" class="toolbar-btn toolbar-btn-secondary" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3v10"/>
              <path d="M8.5 9.5 12 13l3.5-3.5"/>
              <path d="M5 15.5V19h14v-3.5"/>
            </svg>
            <span>Import</span>
          </button>
          <button id="openExportBtn" class="toolbar-btn toolbar-btn-secondary" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 21V11"/>
              <path d="m8.5 14.5 3.5-3.5 3.5 3.5"/>
              <path d="M5 8.5V5h14v3.5"/>
            </svg>
            <span>Export</span>
          </button>
        </div>
      </div>

      <div class="table-wrapper">
        <table class="data-table" data-endpoint="../controllers/students.php" data-table-type="students">
          <thead>
            <tr>
              <th>Student No.</th>
              <th>RFID UID</th>
              <th>Status</th>
              <th>Student Name</th>
              <th>Program</th>
              <th>Year Level</th>
              <th>Department</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <!-- Pagination -->
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


<!-- View Student Modal -->
<div id="viewStudentModal" class="modal">
  <div class="modal-overlay"></div>
  <div class="modal-content overview-modal-content">
    <div class="overview-header">Information Overview</div>
    <div class="overview-grid">
      <div class="overview-field">
        <label for="viewStudentFirstName">First Name:</label>
        <input id="viewStudentFirstName" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="viewStudentMiddleName">Middle Name:</label>
        <input id="viewStudentMiddleName" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="viewStudentLastName">Last Name:</label>
        <input id="viewStudentLastName" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="viewStudentNumber">Student No.:</label>
        <input id="viewStudentNumber" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="viewStudentCategory">Category:</label>
        <input id="viewStudentCategory" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="viewStudentProgram">Program:</label>
        <input id="viewStudentProgram" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="viewStudentYearLevel">Year Level:</label>
        <input id="viewStudentYearLevel" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="viewStudentStrand">Strand:</label>
        <input id="viewStudentStrand" type="text" readonly />
      </div>
      <div class="overview-field overview-field-full">
        <label for="viewStudentDepartment">Department:</label>
        <input id="viewStudentDepartment" type="text" readonly />
      </div>
      <div class="overview-field overview-field-full">
        <label for="viewStudentRfid">RFID UID:</label>
        <input id="viewStudentRfid" type="text" readonly />
      </div>
    </div>
    <div class="overview-divider"></div>
    <div class="overview-meta-row">
      <div>
        <span>Created At:</span>
        <strong id="viewStudentCreatedAt">-</strong>
      </div>
      <div>
        <span>Updated At:</span>
        <strong id="viewStudentUpdatedAt">-</strong>
      </div>
    </div>
    <div class="overview-actions">
      <button type="button" class="overview-back-btn" onclick="closeViewStudentModal()">Back</button>
    </div>
  </div>
</div>

<div id="importModal" class="modal">
  <div class="modal-overlay" onclick="closeImportModal()"></div>
  <div class="modal-content import-modal-content">
    <div class="import-modal-header">
      <h2 id="importModalTitle" class="modal-title">Upload file</h2>
      <button class="import-close-btn" type="button" onclick="closeImportModal()">x</button>
    </div>
    <div id="importDropzone" class="import-dropzone">
      <div class="import-excel-icon">
        <img width="48" height="48" src="https://img.icons8.com/color/48/microsoft-excel-2025.png" alt="microsoft-excel-2025"/>
      </div>
      <p>Drag and Drop file here or <label for="importFileInput" class="import-choose-file">Choose file</label></p>
      <input type="file" id="importFileInput" accept=".xlsx" hidden />
    </div>
    <div class="import-meta-row">
      <span>Supported format: XLSX</span>
      <span>Maximum size: 25 MB</span>
    </div>
  </div>
</div>

<div id="exportModal" class="modal">
  <div class="modal-overlay" onclick="closeExportModal()"></div>
  <div class="modal-content overview-modal-content export-modal-content">
    <div id="exportModalTitle" class="overview-header">Export Student Records</div>
    <div id="exportModalBody" class="export-modal-body"></div>
    <div class="export-modal-actions">
      <button type="button" class="overview-back-btn overview-cancel-btn" onclick="closeExportModal()">Cancel</button>
      <button type="button" class="overview-back-btn" onclick="handleExport()">Export</button>
    </div>
  </div>
</div>

<!-- Edit Student Modal -->
<div id="editStudentModal" class="modal">
  <div class="modal-overlay" onclick="closeEditStudentModal()"></div>
  <div class="modal-content overview-modal-content">
    <div class="overview-header">Edit Student</div>
    <div class="overview-grid">
      <div class="overview-field">
        <label for="editStudentFirstName">First Name:</label>
        <input id="editStudentFirstName" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="editStudentMiddleName">Middle Name:</label>
        <input id="editStudentMiddleName" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="editStudentLastName">Last Name:</label>
        <input id="editStudentLastName" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="editStudentNumber">Student No.:</label>
        <input id="editStudentNumber" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="editStudentCategory">Category:</label>
        <input id="editStudentCategory" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="editStudentProgram">Program:</label>
        <input id="editStudentProgram" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="editStudentYearLevel">Year Level:</label>
        <input id="editStudentYearLevel" type="text" readonly />
      </div>
      <div class="overview-field">
        <label for="editStudentStrand">Strand:</label>
        <input id="editStudentStrand" type="text" readonly />
      </div>
      <div class="overview-field overview-field-full">
        <label for="editStudentDepartment">Department:</label>
        <input id="editStudentDepartment" type="text" readonly />
      </div>
      <div class="overview-field overview-field-full">
        <label for="editStudentRfid" class="edit-label-active">RFID UID:</label>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input id="editStudentRfid" type="text" class="edit-input-active" placeholder="Tap RFID card or use clear button..." style="flex: 1;" />
          <button type="button" class="toolbar-btn toolbar-btn-secondary" id="clearEditStudentRfid" onclick="clearEditStudentRfid()" title="Clear RFID UID">Clear</button>
        </div>
      </div>
    </div>
    <div class="overview-divider"></div>
    <div class="overview-actions">
      <button type="button" class="overview-back-btn overview-cancel-btn" onclick="closeEditStudentModal()">Cancel</button>
      <button type="button" class="overview-back-btn" onclick="saveEditStudent()">Save</button>
    </div>
  </div>
</div>

<!-- Add Student Modal -->
<div id="addStudentModal" class="modal">
  <div class="modal-overlay" onclick="closeAddStudentModal()"></div>
  <div class="modal-content overview-modal-content">
    <div class="overview-header">Add Student</div>
    <div class="overview-grid">
      <!-- Fixed Fields -->
      <div class="overview-field">
        <label for="addStudentFirstName">First Name:<span class="field-required">*</span></label>
        <input id="addStudentFirstName" type="text" class="edit-input-active" placeholder="First name" />
      </div>
      <div class="overview-field">
        <label for="addStudentMiddleName">Middle Name:</label>
        <input id="addStudentMiddleName" type="text" class="edit-input-active" placeholder="Middle name" />
      </div>
      <div class="overview-field">
        <label for="addStudentLastName">Last Name:<span class="field-required">*</span></label>
        <input id="addStudentLastName" type="text" class="edit-input-active" placeholder="Last name" />
      </div>
      <div class="overview-field">
        <label for="addStudentSuffix">Suffix:</label>
        <input id="addStudentSuffix" type="text" class="edit-input-active" placeholder="e.g. Jr., III" />
      </div>
      <div class="overview-field">
        <label for="addStudentNumber">Student No.:<span class="field-required">*</span></label>
        <input id="addStudentNumber" type="text" class="edit-input-active" placeholder="Student No." />
      </div>
      <div class="overview-field">
        <label for="addStudentCategory">Category:<span class="field-required">*</span></label>
        <select id="addStudentCategory" class="edit-input-active overview-select">
          <option value="">Select Category</option>
          <option value="Basic Education">Basic Education</option>
          <option value="Tertiary">Tertiary</option>
          <option value="Graduate School">Graduate School</option>
        </select>
      </div>
      
      <!-- Basic Education Fields -->
      <div id="addStudentBasicEducationFields" class="overview-subgrid" style="display: none;">
        <div class="overview-field">
          <label for="addStudentYearLevelBE">Year Level:</label>
          <select id="addStudentYearLevelBE" class="edit-input-active overview-select">
            <option value="">Select Year Level</option>
            <option value="Pre-kinder 1">Pre-kinder 1</option>
            <option value="Pre-kinder 2">Pre-kinder 2</option>
            <option value="Kinder">Kinder</option>
            <option value="Grade 1">Grade 1</option>
            <option value="Grade 2">Grade 2</option>
            <option value="Grade 3">Grade 3</option>
            <option value="Grade 4">Grade 4</option>
            <option value="Grade 5">Grade 5</option>
            <option value="Grade 6">Grade 6</option>
            <option value="Grade 7">Grade 7</option>
            <option value="Grade 8">Grade 8</option>
            <option value="Grade 9">Grade 9</option>
            <option value="Grade 10">Grade 10</option>
            <option value="Grade 11">Grade 11</option>
            <option value="Grade 12">Grade 12</option>
          </select>
        </div>
        <div id="addStudentStrandFieldsBE" class="overview-field" style="display: none;">
          <label for="addStudentStrandBE">Strand:</label>
          <select id="addStudentStrandBE" class="edit-input-active overview-select">
            <option value="">Select Strand</option>
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
      </div>
      
      <!-- Tertiary Fields -->
      <div id="addStudentTertiaryFields" class="overview-subgrid" style="display: none;">
        <div class="overview-field">
          <label for="addStudentDepartment">Department:</label>
          <select id="addStudentDepartment" class="edit-input-active overview-select">
            <option value="">Select Department</option>
          </select>
        </div>
        <div class="overview-field">
          <label for="addStudentProgram">Program:</label>
          <select id="addStudentProgram" class="edit-input-active overview-select" disabled>
            <option value="">Select Program</option>
          </select>
        </div>
        <div class="overview-field">
          <label for="addStudentYearLevelTertiary">Year Level:</label>
          <select id="addStudentYearLevelTertiary" class="edit-input-active overview-select">
            <option value="">Select Year Level</option>
            <option value="1st Year">1st Year</option>
            <option value="2nd Year">2nd Year</option>
            <option value="3rd Year">3rd Year</option>
            <option value="4th Year">4th Year</option>
          </select>
        </div>
      </div>
      
<!-- Graduate School Fields -->
<div id="addStudentGraduateFields" class="overview-subgrid" style="display: none;">
  <div class="overview-field">
    <label for="addStudentDepartmentGraduate">Department:</label>
    <select id="addStudentDepartmentGraduate" class="edit-input-active overview-select">
      <option value="">Select Department</option>
      <option value="Professional Track">Professional Track</option>
      <option value="Academic Track">Academic Track</option>
    </select>
  </div>
  <div class="overview-field">
    <label for="addStudentProgramGraduate">Program:</label>
    <select id="addStudentProgramGraduate" class="edit-input-active overview-select" disabled>
      <option value="">Select Program</option>
    </select>
  </div>
</div>
      
      <!-- RFID UID (always visible at end) -->
      <div class="overview-field overview-field-full">
        <label for="addStudentRfid">RFID UID:</label>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input
            id="addStudentRfid"
            type="text"
            class="edit-input-active"
            placeholder="Tap RFID card to scan..."
            readonly
            style="flex: 1;"
          />
          <button type="button" class="toolbar-btn toolbar-btn-secondary" onclick="clearAddRfid('addStudentRfid')" title="Clear RFID UID">Clear</button>
        </div>
      </div>
    </div>
    <div class="overview-divider"></div>
    <div class="overview-actions">
      <button type="button" class="overview-back-btn overview-cancel-btn" onclick="closeAddStudentModal()">Cancel</button>
      <button type="button" class="overview-back-btn" onclick="saveAddStudent()">Add</button>
    </div>
  </div>
</div>


<div id="appToast" class="app-toast"></div>

<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="assets/js/script.js?v=<?= time(); ?>"></script>
</body>
</html>