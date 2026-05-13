FCPC Tap Track — Web Application Documentation

Scope
- Focus: Web application only. Hardware integrations (RFID readers, Hardware/ folder) are excluded.
- Purpose: Provide a developer-facing reference describing features, endpoints, UI behavior, deployment requirements, and implemented security controls.

Architecture
- Backend: PHP (procedural API endpoints under web/api/), MySQL/MariaDB.
- Frontend: Vanilla JavaScript orchestrator at web/views/assets/js/script.js; HTML views in web/views/.
- Key data tables: students, employees, attendance_logs, rfid_uid_buffer (buffer table used by hardware bridge — documented but hardware excluded).

Key Files
- web/api/students.php — Student CRUD, import, latest-rfid, validate-rfid, owner lookup.
- web/api/employees.php — Employee CRUD, validate-rfid, owner lookup.
- web/api/export.php — XLSX export using PhpSpreadsheet.
- web/api/users.php — User account creation and update for employees.
- web/api/attendance.php — Attendance listing endpoint.
- web/views/login.php — Login form and authentication flow.
- web/views/users.php — User management page.
- web/views/attendance.php — Attendance listing and export page.
- web/views/students.php — Students UI and modals.
- web/views/employee.php — Employees UI and modals.
- web/views/assets/js/script.js — Main frontend logic (table rendering, modals, filters, RFID polling & validation).
- web/views/assets/css/styles.css — Styles.

Authentication & Access Control
- Login: [web/views/login.php](web/views/login.php#L1) handles credential submission, validates CSRF, checks account status, and starts the authenticated session.
- Logout: implemented in the web UI and session-backed views.
- Access control: authenticated views redirect to the login page when `$_SESSION['user_id']` is missing.

Features
1. User Management
- Student management: Add, Edit, View. Validation is server-side and client-side. Add/Edit implemented as modal dialogs. There is no delete operation in the current implementation.
- Employee management: Similar behavior for employees. There is no delete operation in the current implementation.
- User accounts: [web/views/users.php](web/views/users.php#L1) manages accounts linked to employees, with Add, View, and Edit flows plus active/inactive status.
- Bulk Import: XLSX import for students and employees with server-side validation and summary of inserted/skipped rows.

2. Filtering & Search
- Student filters: Category-first ordering (Category at top). Program/Strand fields enabled conditionally (e.g., Tertiary vs Basic Education). In the current implementation, filtering is handled in the frontend while the API returns the full list from [web/api/students.php](web/api/students.php#L1).
- Employee filters: Department and position are filtered in the frontend after the employee list is loaded.
- Attendance filters: Type and date are handled in the frontend after [web/api/attendance.php](web/api/attendance.php#L1) returns the full attendance log list.
- Live search: Integrated with filter UI and table rendering.

3. Exporting
- XLSX Export: Implemented with PhpSpreadsheet in web/api/export.php. Exports support Students/Employees/Attendance types with contextual filters.
- Export UI: Type-aware export modal injects context-specific filters to avoid DOM ID collisions and clarify options.

4. RFID (web-side behavior only)
- Buffer polling: Frontend polls web/api/students.php?action=latest-rfid with last_id and supports peek=1 to sync without consuming buffer rows.
- Modal-aware scanning: Scanning populates Add and Edit modal RFID inputs; Edit scanning passes exclude_id to validation to prevent false duplicate detection.
- Immediate validation: validate-rfid endpoints for students and employees provide owner information for duplicate detection.
- Clear buttons: Allow clearing the visible RFID input without mutating modal._record to avoid accidental persistence.

5. UI Patterns
- Modals: Single-file modal handling in script.js; modal._record used as a working copy, not mutated by clear operations.
- Toast notifications: showToast() used for immediate feedback on validation, saves, imports, and errors.
- ReadOnly RFID inputs on Edit: Prevent manual typing; scanning and clear operations are used instead.
- Attendance page: [web/views/attendance.php](web/views/attendance.php#L1) is list-only and provides search, type/date filtering, and export.

API Endpoints (Summary)
- web/api/students.php
  - GET without action — List students.
  - action=get — Get a single student.
  - action=create/update — CRUD operations (require CSRF and session checks).
  - action=latest-rfid — Returns latest rfid_uid buffer row with id; supports last_id and peek=1.
  - action=validate-rfid — Validate a UID; accepts rfid_uid and optional exclude_id.
  - action=import — Handle XLSX import.
- web/api/employees.php
  - Similar to students; includes action=validate-rfid.
- web/api/users.php
  - GET — List users.
  - POST — Create a user account for a selected employee.
  - PATCH — Update an existing user account by employee number.
- web/api/attendance.php
  - GET — Return the full attendance log list joined with student/employee reference data.
- web/api/export.php
  - Accepts filters and returns an XLSX file.

Security Features Implemented
- Authentication & Session Checks: APIs enforce session-based access control for protected actions.
- CSRF Protection: State-changing endpoints call validate_csrf_token() to verify CSRF tokens from forms and AJAX requests.
- Server-side Validation: Endpoints validate required fields, reject invalid input, and return structured JSON.
- Duplicate UID detection: validate-rfid endpoints search both students and employees; frontend prevents saving duplicates.
- Safe Error Responses: APIs return JSON with success/error flags to avoid HTML error pages being parsed by JS.
- Modal discipline: Clear operations do not mutate modal._record, reducing accidental data persistence.

Security Gaps & Recommendations
- Prepared statements: Audit all database queries to ensure use of prepared statements to prevent SQL injection.
- Role-based authorization: Add granular checks (admin, registrar, viewer) for sensitive operations like import/export/delete.
- Rate-limiting: Apply rate limiting to validation endpoints and login routes to prevent abuse.
- Centralized audit logging: Record imports, deletes, RFID reassignments with actor and timestamp.
- Upload hardening: Validate file types, size limits, and clean temporary files after import.
- Error handling: Disable detailed PHP error display in production; log errors server-side.

Deployment & Requirements
- PHP with extensions required by PhpSpreadsheet (zip, xml, gd as needed).
- MySQL/MariaDB database with provided schema SQL.
- Composer vendor/ directory with PhpSpreadsheet.

Testing Checklist
- Manual API calls to validate-rfid and list endpoints.
- Frontend flow tests: Add/Edit student/employee, import, export.
- Security tests: Attempting CRUD without CSRF token should fail; duplicate UID assignment should be blocked.