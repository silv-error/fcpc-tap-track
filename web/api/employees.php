<?php

require_once __DIR__ . '/../config/session.php';
session_start();

require_once __DIR__ . '/../config/connection.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/csrf.php';

use PhpOffice\PhpSpreadsheet\IOFactory;

if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PATCH', 'PUT', 'DELETE'])) {
    validate_csrf_token();
}

match ($_SERVER['REQUEST_METHOD']) {
    'GET'   => handle_get($con),
    'POST'  => handle_post($con),
    'PATCH' => handle_patch($con),
    default => json_response(['success' => false, 'message' => 'Method not allowed.'], 405),
};

// ── GET /api/employees.php ────────────────────────────────────────────────────
// No user input — mysqli_query is fine here.

function handle_get(mysqli $con): void
{
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
                'is_active'  => (bool) $employee['is_active'],
                'created_at' => $employee['created_at'],
                'updated_at' => $employee['updated_at'],
            ];
        }, $employees),
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

    // ── 1. Duplicate employee_number / rfid_uid check ─────────────────────────
    if ($rfidUid !== null) {
        $stmt = mysqli_prepare($con, "
            SELECT id FROM employees
            WHERE employee_number = ? OR rfid_uid = ?
            LIMIT 1
        ");

        if (!$stmt) {
            error_log('Prepare failed: ' . mysqli_error($con));
            json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
        }

        mysqli_stmt_bind_param($stmt, 'ss', $employeeNumber, $rfidUid);
    } else {
        $stmt = mysqli_prepare($con, "
            SELECT id FROM employees
            WHERE employee_number = ?
            LIMIT 1
        ");

        if (!$stmt) {
            error_log('Prepare failed: ' . mysqli_error($con));
            json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
        }

        mysqli_stmt_bind_param($stmt, 's', $employeeNumber);
    }

    mysqli_stmt_execute($stmt);
    mysqli_stmt_store_result($stmt);

    if (mysqli_stmt_num_rows($stmt) > 0) {
        json_response(['success' => false, 'message' => 'Employee number or RFID UID already exists.'], 409);
    }

    mysqli_stmt_close($stmt);

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
        $stmt = mysqli_prepare($con, "
            SELECT id FROM employees
            WHERE rfid_uid = ? AND id != ?
            LIMIT 1
        ");

        if (!$stmt) {
            error_log('Prepare failed: ' . mysqli_error($con));
            json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
        }

        mysqli_stmt_bind_param($stmt, 'si', $rfidUid, $id);
        mysqli_stmt_execute($stmt);
        mysqli_stmt_store_result($stmt);

        if (mysqli_stmt_num_rows($stmt) > 0) {
            json_response(['success' => false, 'message' => 'RFID UID is already assigned to another employee.'], 409);
        }

        mysqli_stmt_close($stmt);
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