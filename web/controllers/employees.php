<?php

require_once __DIR__ . '/../config/session.php';
session_start();

require_once __DIR__ . '/../config/connection.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/csrf.php';

use PhpOffice\PhpSpreadsheet\IOFactory;

if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PATCH', 'PUT', 'DELETE'], true)) {
    validate_csrf_token();
}

match ($_SERVER['REQUEST_METHOD']) {
    'GET'   => handle_get($con),
    'POST'  => handle_post($con),
    'PATCH' => handle_patch($con),
    default => json_response(['success' => false, 'message' => 'Method not allowed.'], 405),
};

function find_rfid_uid_owner(mysqli $con, string $rfidUid, ?string $excludeType = null, int $excludeId = 0): ?array
{
    $normalizedUid = trim($rfidUid);
    if ($normalizedUid === '') {
        return null;
    }

    $studentRows = fetch_all_rows_prepared(
        $con,
        "
            SELECT id, student_number, last_name, first_name, middle_name, suffix
            FROM students
            WHERE UPPER(rfid_uid) = UPPER(?)
            LIMIT 1
        ",
        's',
        $normalizedUid,
    );

    if (!empty($studentRows)) {
        $owner = $studentRows[0];
        if (!(strtolower((string) $excludeType) === 'student' && (int) $owner['id'] === $excludeId)) {
            return [
                'type'       => 'Student',
                'id'         => (int) $owner['id'],
                'reference'  => (string) $owner['student_number'],
                'name'       => format_display_name(
                    (string) $owner['last_name'],
                    (string) $owner['first_name'],
                    $owner['middle_name'] ?? null,
                    $owner['suffix'] ?? null,
                ),
            ];
        }
    }

    $employeeRows = fetch_all_rows_prepared(
        $con,
        "
            SELECT id, employee_number, last_name, first_name, middle_name, suffix
            FROM employees
            WHERE UPPER(rfid_uid) = UPPER(?)
            LIMIT 1
        ",
        's',
        $normalizedUid,
    );

    if (!empty($employeeRows)) {
        $owner = $employeeRows[0];
        if (!(strtolower((string) $excludeType) === 'employee' && (int) $owner['id'] === $excludeId)) {
            return [
                'type'       => 'Employee',
                'id'         => (int) $owner['id'],
                'reference'  => (string) $owner['employee_number'],
                'name'       => format_display_name(
                    (string) $owner['last_name'],
                    (string) $owner['first_name'],
                    $owner['middle_name'] ?? null,
                    $owner['suffix'] ?? null,
                ),
            ];
        }
    }

    return null;
}

// ── GET /api/employees.php ────────────────────────────────────────────────────
// No user input — mysqli_query is fine here.

function handle_get(mysqli $con): void
{
    $action = $_GET['action'] ?? '';

    if ($action === 'validate-rfid') {
        handle_validate_rfid_uid($con);
        return;
    }

    $sql = "
        SELECT
            id,
            employee_number,
            last_name,
            first_name,
            middle_name,
            suffix,
            department,
            position,
            rfid_uid,
            CASE
                WHEN rfid_uid IS NOT NULL AND rfid_uid <> '' THEN 'Registered'
                ELSE 'Unregistered'
            END AS status,
            is_active,
            created_at,
            updated_at
        FROM employees
        ORDER BY last_name ASC, first_name ASC, employee_number ASC
    ";

    $employees = fetch_all_rows($con, $sql);

    json_response([
        'success' => true,
        'data'    => array_map(static function (array $employee): array {
            return [
                'id'              => (int) $employee['id'],
                'employee_number' => $employee['employee_number'],
                'rfid_uid'        => $employee['rfid_uid']  ?: '-',
                'name'            => format_display_name(
                    $employee['last_name'],
                    $employee['first_name'],
                    $employee['middle_name'],
                    $employee['suffix'],
                ),
                'position'   => $employee['position']  ?: '-',
                'department' => $employee['department'] ?: '-',
                'status'     => $employee['status'],
                'is_active'  => (bool) $employee['is_active'],
                'created_at' => $employee['created_at'],
                'updated_at' => $employee['updated_at'],
            ];
        }, $employees),
    ]);
}
// ── Validate RFID UID ──────────────────────────────────────────────────────────

function handle_validate_rfid_uid(mysqli $con): void
{
    $rfidUid = trim($_GET['rfid_uid'] ?? '');
    $excludeId = isset($_GET['exclude_id']) ? (int) $_GET['exclude_id'] : 0;

    if ($rfidUid === '') {
        json_response([
            'success' => false,
            'message' => 'RFID UID is required.',
        ], 422);
    }

    $rfidOwner = find_rfid_uid_owner($con, $rfidUid, 'employee', $excludeId);

    if ($rfidOwner !== null) {
        json_response([
            'success' => false,
            'message' => sprintf(
                'RFID UID already exists (assigned to %s: %s)',
                $rfidOwner['type'],
                $rfidOwner['name'],
            ),
            'exists' => true,
            'owner' => $rfidOwner,
        ]);
    }

    json_response([
        'success' => true,
        'message' => 'RFID UID is available.',
        'exists' => false,
    ]);
}
// ── POST /api/employees.php ───────────────────────────────────────────────────

function handle_post(mysqli $con): void
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (str_contains($contentType, 'multipart/form-data')) {
        handle_import($con);
    } else {
        handle_add($con);
    }
}

function handle_add(mysqli $con): void
{
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $firstName      = trim($body['first_name']     ?? '');
    $middleName     = trim($body['middle_name']     ?? '') ?: null;
    $lastName       = trim($body['last_name']       ?? '');
    $employeeNumber = trim($body['employee_number'] ?? '');
    $department     = trim($body['department']      ?? '');
    $position       = trim($body['position']        ?? '');
    $rfidUid        = trim($body['rfid_uid']        ?? '') ?: null;

    $errors = [];
    if ($firstName      === '') $errors[] = 'First name is required.';
    if ($lastName       === '') $errors[] = 'Last name is required.';
    if ($employeeNumber === '') $errors[] = 'Employee number is required.';

    if ($errors) {
        json_response(['success' => false, 'message' => implode(' ', $errors)], 422);
    }

    $duplicateEmployeeRows = fetch_all_rows_prepared(
        $con,
        "
            SELECT id
            FROM employees
            WHERE employee_number = ?
            LIMIT 1
        ",
        's',
        $employeeNumber,
    );

    if (!empty($duplicateEmployeeRows)) {
        json_response(['success' => false, 'message' => 'Employee number already exists.'], 409);
    }

    if ($rfidUid !== null) {
        $rfidOwner = find_rfid_uid_owner($con, $rfidUid);
        if ($rfidOwner !== null) {
            json_response([
                'success' => false,
                'message' => sprintf(
                    'RFID UID %s is already assigned to %s: %s (%s).',
                    $rfidUid,
                    $rfidOwner['type'],
                    $rfidOwner['name'],
                    $rfidOwner['reference'],
                ),
            ], 409);
        }
    }

    // ── 2. Insert ─────────────────────────────────────────────────────────────
    $stmt = mysqli_prepare($con, "
        INSERT INTO employees
            (employee_number, first_name, middle_name, last_name,
             department, position, rfid_uid, is_active, created_at, updated_at)
        VALUES
            (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
    ");

    if (!$stmt) {
        error_log('Prepare failed: ' . mysqli_error($con));
        json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
    }

    mysqli_stmt_bind_param(
        $stmt, 'sssssss',
        $employeeNumber,
        $firstName,
        $middleName,   // NULL binds safely as 's'
        $lastName,
        $department,
        $position,
        $rfidUid,      // NULL binds safely as 's'
    );

    if (!mysqli_stmt_execute($stmt)) {
        error_log('Execute failed: ' . mysqli_stmt_error($stmt));
        json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
    }

    $newId = mysqli_insert_id($con);
    mysqli_stmt_close($stmt);

    // ── Handle RFID: delete any erroneous attendance log and log the registration scan ──
    if ($rfidUid !== null) {
        // Delete any attendance log that was mistakenly created for this RFID during registration
        // (within the last 2 minutes) - this happens because hardware creates attendance before web form
        $delStmt = mysqli_prepare($con, "
            DELETE FROM attendance_logs
            WHERE rfid_uid = ?
            AND log_date = CURDATE()
            AND created_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
        ");
        
        if ($delStmt) {
            mysqli_stmt_bind_param($delStmt, 's', $rfidUid);
            mysqli_stmt_execute($delStmt);
            mysqli_stmt_close($delStmt);
        }

        // Log RFID scan as REGISTRATION
        $logStmt = mysqli_prepare($con, "
            INSERT INTO rfid_scan_logs (rfid_uid, scan_result, user_type, action, message, scanned_at)
            VALUES (?, 'SUCCESS', 'Employee', 'REGISTRATION', ?, NOW())
        ");
        
        if ($logStmt) {
            $logMessage = "Employee registration: {$firstName} {$lastName} (Employee #: {$employeeNumber})";
            mysqli_stmt_bind_param($logStmt, 'ss', $rfidUid, $logMessage);
            mysqli_stmt_execute($logStmt);
            mysqli_stmt_close($logStmt);
        }
    }

    json_response([
        'success' => true,
        'message' => 'Employee added successfully.',
        'data'    => ['id' => $newId],
    ], 201);
}

// ── PATCH /api/employees.php ──────────────────────────────────────────────────

function handle_patch(mysqli $con): void
{
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $id      = (int) ($body['id']     ?? 0);
    $rfidUid = trim($body['rfid_uid'] ?? '') ?: null;

    if ($id <= 0) {
        json_response(['success' => false, 'message' => 'Invalid employee ID.'], 422);
    }

    // ── 1. Duplicate rfid_uid check (only when a value is provided) ───────────
    if ($rfidUid !== null) {
        $rfidOwner = find_rfid_uid_owner($con, $rfidUid, 'employee', $id);
        if ($rfidOwner !== null) {
            json_response([
                'success' => false,
                'message' => sprintf(
                    'RFID UID %s is already assigned to %s: %s (%s).',
                    $rfidUid,
                    $rfidOwner['type'],
                    $rfidOwner['name'],
                    $rfidOwner['reference'],
                ),
            ], 409);
        }
    }

    // ── 2. Update ─────────────────────────────────────────────────────────────
    $stmt = mysqli_prepare($con, "
        UPDATE employees
        SET rfid_uid = ?, updated_at = NOW()
        WHERE id = ?
    ");

    if (!$stmt) {
        error_log('Prepare failed: ' . mysqli_error($con));
        json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
    }

    mysqli_stmt_bind_param($stmt, 'si', $rfidUid, $id);  // NULL binds safely as 's'

    if (!mysqli_stmt_execute($stmt)) {
        error_log('Execute failed: ' . mysqli_stmt_error($stmt));
        json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
    }

    if (mysqli_stmt_affected_rows($stmt) === 0) {
        json_response(['success' => false, 'message' => 'Employee not found.'], 404);
    }

    mysqli_stmt_close($stmt);

    // ── Handle RFID: delete any erroneous attendance log and log the update scan ──
    if ($rfidUid !== null) {
        // Delete any attendance log that was mistakenly created for this RFID during update
        // (within the last 2 minutes) - this happens because hardware creates attendance before web form
        $delStmt = mysqli_prepare($con, "
            DELETE FROM attendance_logs
            WHERE rfid_uid = ?
            AND log_date = CURDATE()
            AND created_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
        ");
        
        if ($delStmt) {
            mysqli_stmt_bind_param($delStmt, 's', $rfidUid);
            mysqli_stmt_execute($delStmt);
            mysqli_stmt_close($delStmt);
        }

        // Log RFID scan as RFID_UPDATE
        $logStmt = mysqli_prepare($con, "
            INSERT INTO rfid_scan_logs (rfid_uid, scan_result, user_type, action, message, scanned_at)
            VALUES (?, 'SUCCESS', 'Employee', 'RFID_UPDATE', ?, NOW())
        ");
        
        if ($logStmt) {
            $logMessage = "Employee RFID update: Employee ID #{$id}";
            mysqli_stmt_bind_param($logStmt, 'ss', $rfidUid, $logMessage);
            mysqli_stmt_execute($logStmt);
            mysqli_stmt_close($logStmt);
        }
    }

    json_response(['success' => true, 'message' => 'Employee RFID updated successfully.']);
}

// ── POST (multipart) — XLSX import ───────────────────────────────────────────

function handle_import(mysqli $con): void
{
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        json_response(['success' => false, 'message' => 'No file uploaded or upload error.'], 422);
    }

    $file = $_FILES['file'];

    if ($file['size'] > 25 * 1024 * 1024) {
        json_response(['success' => false, 'message' => 'File exceeds the 25 MB limit.'], 422);
    }

    if (strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) !== 'xlsx') {
        json_response(['success' => false, 'message' => 'Only .xlsx files are supported.'], 422);
    }

    try {
        $spreadsheet = IOFactory::load($file['tmp_name']);
    } catch (Throwable $e) {
        json_response(['success' => false, 'message' => 'Could not read the file: ' . $e->getMessage()], 422);
    }

    $rows = $spreadsheet->getActiveSheet()->toArray(null, true, true, false);

    if (count($rows) < 2) {
        json_response(['success' => false, 'message' => 'The file has no data rows.'], 422);
    }

    $colIndex = array_flip(
        array_map(static fn($h) => strtolower(trim((string) $h)), $rows[0])
    );

    $required = ['employee_number', 'first_name', 'last_name'];
    $missing  = array_filter($required, static fn($c) => !array_key_exists($c, $colIndex));

    if ($missing) {
        json_response([
            'success' => false,
            'message' => 'Missing required columns: ' . implode(', ', $missing),
        ], 422);
    }

    $get = static fn(array $row, string $key): string =>
        isset($colIndex[$key]) ? trim((string) ($row[$colIndex[$key]] ?? '')) : '';

    // Prepare statements once outside the loop for performance
    $stmtDupWithRfid = mysqli_prepare($con, "
        SELECT id FROM employees
        WHERE employee_number = ? OR rfid_uid = ?
        LIMIT 1
    ");

    $stmtDupNoRfid = mysqli_prepare($con, "
        SELECT id FROM employees
        WHERE employee_number = ?
        LIMIT 1
    ");

    $stmtInsert = mysqli_prepare($con, "
        INSERT INTO employees
            (employee_number, first_name, middle_name, last_name,
             department, position, rfid_uid, is_active, created_at, updated_at)
        VALUES
            (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
    ");

    if (!$stmtDupWithRfid || !$stmtDupNoRfid || !$stmtInsert) {
        error_log('Import prepare failed: ' . mysqli_error($con));
        json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
    }

    $inserted = 0;
    $skipped  = 0;
    $errors   = [];

    foreach (array_slice($rows, 1) as $i => $row) {
        $line           = $i + 2;
        $employeeNumber = $get($row, 'employee_number');
        $firstName      = $get($row, 'first_name');
        $lastName       = $get($row, 'last_name');

        // Skip fully blank rows silently
        if ($employeeNumber === '' && $firstName === '' && $lastName === '') continue;

        if ($employeeNumber === '' || $firstName === '' || $lastName === '') {
            $errors[] = "Row {$line}: employee_number, first_name, and last_name are required.";
            $skipped++;
            continue;
        }

        $middleName = $get($row, 'middle_name') ?: null;
        $department = $get($row, 'department');
        $position   = $get($row, 'position');
        $rfidUid    = $get($row, 'rfid_uid') ?: null;

        // ── Duplicate check ───────────────────────────────────────────────────
        if ($rfidUid !== null) {
            mysqli_stmt_bind_param($stmtDupWithRfid, 'ss', $employeeNumber, $rfidUid);
            mysqli_stmt_execute($stmtDupWithRfid);
            mysqli_stmt_store_result($stmtDupWithRfid);
            $isDup = mysqli_stmt_num_rows($stmtDupWithRfid) > 0;
            mysqli_stmt_reset($stmtDupWithRfid);
        } else {
            mysqli_stmt_bind_param($stmtDupNoRfid, 's', $employeeNumber);
            mysqli_stmt_execute($stmtDupNoRfid);
            mysqli_stmt_store_result($stmtDupNoRfid);
            $isDup = mysqli_stmt_num_rows($stmtDupNoRfid) > 0;
            mysqli_stmt_reset($stmtDupNoRfid);
        }

        if ($isDup) {
            $errors[] = "Row {$line}: duplicate employee_number or rfid_uid — skipped.";
            $skipped++;
            continue;
        }

        // ── Insert ────────────────────────────────────────────────────────────
        mysqli_stmt_bind_param(
            $stmtInsert, 'sssssss',
            $employeeNumber,
            $firstName,
            $middleName,   // NULL binds safely as 's'
            $lastName,
            $department,
            $position,
            $rfidUid,      // NULL binds safely as 's'
        );

        if (mysqli_stmt_execute($stmtInsert)) {
            $inserted++;
        } else {
            error_log("Import row {$line} failed: " . mysqli_stmt_error($stmtInsert));
            $errors[] = "Row {$line}: failed to insert — skipped.";
            $skipped++;
        }

        mysqli_stmt_reset($stmtInsert);
    }

    mysqli_stmt_close($stmtDupWithRfid);
    mysqli_stmt_close($stmtDupNoRfid);
    mysqli_stmt_close($stmtInsert);

    json_response([
        'success'  => true,
        'message'  => "Import complete. {$inserted} record(s) inserted, {$skipped} skipped.",
        'inserted' => $inserted,
        'skipped'  => $skipped,
        'errors'   => $errors,
    ]);
}