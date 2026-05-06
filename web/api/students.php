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

// ── GET /api/students.php ─────────────────────────────────────────────────────
// Supports:
// GET /api/students.php
// GET /api/students.php?action=latest-rfid
// GET /api/students.php?action=latest-rfid&last_id=0

function handle_get(mysqli $con): void
{
    $action = $_GET['action'] ?? '';

    if ($action === 'latest-rfid') {
        handle_get_latest_rfid_uid($con);
        return;
    }

    $sql = "
        SELECT
            id,
            student_number,
            last_name,
            first_name,
            middle_name,
            suffix,
            course,
            year_level,
            department,
            rfid_uid,
            is_active,
            created_at,
            updated_at
        FROM students
        ORDER BY last_name ASC, first_name ASC, student_number ASC
    ";

    $students = fetch_all_rows($con, $sql);

    json_response([
        'success' => true,
        'data'    => array_map(static function (array $student): array {
            return [
                'id'             => (int) $student['id'],
                'student_number' => $student['student_number'],
                'rfid_uid'       => $student['rfid_uid'] ?: '-',
                'name'           => format_display_name(
                    $student['last_name'],
                    $student['first_name'],
                    $student['middle_name'],
                    $student['suffix'],
                ),
                'course'         => $student['course'] ?: '-',
                'year_level'     => $student['year_level'] ?: '-',
                'department'     => $student['department'] ?: '-',
                'is_active'      => (bool) $student['is_active'],
                'created_at'     => $student['created_at'],
                'updated_at'     => $student['updated_at'],
            ];
        }, $students),
    ]);
}

// ── GET /api/students.php?action=latest-rfid ──────────────────────────────────
// Used by JavaScript polling in Add Student modal.
// last_id prevents the same UID from being repeatedly returned.

function handle_get_latest_rfid_uid(mysqli $con): void
{
    $tableCheck = mysqli_query($con, "SHOW TABLES LIKE 'rfid_uid_buffer'");

    if (!$tableCheck || mysqli_num_rows($tableCheck) === 0) {
        json_response([
            'success' => false,
            'message' => 'RFID buffer table does not exist.',
        ], 500);
    }

    $lastId = isset($_GET['last_id']) ? (int) $_GET['last_id'] : 0;

    $stmt = mysqli_prepare($con, "
        SELECT id, rfid_uid, created_at
        FROM rfid_uid_buffer
        WHERE id > ?
        ORDER BY id DESC
        LIMIT 1
    ");

    if (!$stmt) {
        error_log('Prepare failed: ' . mysqli_error($con));

        json_response([
            'success' => false,
            'message' => 'A database error occurred.',
        ], 500);
    }

    mysqli_stmt_bind_param($stmt, 'i', $lastId);
    mysqli_stmt_execute($stmt);
    mysqli_stmt_bind_result($stmt, $id, $rfidUid, $createdAt);

    if (!mysqli_stmt_fetch($stmt)) {
        mysqli_stmt_close($stmt);

        json_response([
            'success' => false,
            'message' => 'No new RFID UID found.',
            'last_id' => $lastId,
        ]);
    }

    mysqli_stmt_close($stmt);

    json_response([
        'success'    => true,
        'id'         => (int) $id,
        'rfid_uid'   => trim((string) $rfidUid),
        'created_at' => $createdAt,
    ]);
}

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

// ── POST /api/students.php ────────────────────────────────────────────────────

function handle_post(mysqli $con): void
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (str_contains($contentType, 'multipart/form-data')) {
        handle_import($con);
    } else {
        handle_add($con);
    }
}

// ── ADD STUDENT ────────────────────────────────────────────────────────────────

function handle_add(mysqli $con): void
{
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $firstName     = trim($body['first_name'] ?? '');
    $middleName    = trim($body['middle_name'] ?? '');
    $lastName      = trim($body['last_name'] ?? '');
    $studentNumber = trim($body['student_number'] ?? '');
    $course        = trim($body['course'] ?? '');
    $yearLevel     = trim($body['year_level'] ?? '');
    $department    = trim($body['department'] ?? '');
    $rfidUid       = trim($body['rfid_uid'] ?? '') ?: null;

    $errors = [];

    if ($firstName === '') {
        $errors[] = 'First name is required.';
    }

    if ($lastName === '') {
        $errors[] = 'Last name is required.';
    }

    if ($studentNumber === '') {
        $errors[] = 'Student number is required.';
    }

    if ($course === '') {
        $errors[] = 'Course is required.';
    }

    if ($yearLevel === '') {
        $errors[] = 'Year level is required.';
    }

    if ($department === '') {
        $errors[] = 'Department is required.';
    }

    if ($errors) {
        json_response([
            'success' => false,
            'message' => implode(' ', $errors),
        ], 422);
    }

    $duplicateStudentRows = fetch_all_rows_prepared(
        $con,
        "
            SELECT id
            FROM students
            WHERE student_number = ?
            LIMIT 1
        ",
        's',
        $studentNumber,
    );

    if (!empty($duplicateStudentRows)) {
        json_response([
            'success' => false,
            'message' => 'Student number already exists.',
        ], 409);
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

    $stmt = mysqli_prepare($con, "
        INSERT INTO students
            (
                student_number,
                first_name,
                middle_name,
                last_name,
                course,
                year_level,
                department,
                rfid_uid,
                is_active,
                created_at,
                updated_at
            )
        VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
    ");

    if (!$stmt) {
        error_log('Prepare failed: ' . mysqli_error($con));

        json_response([
            'success' => false,
            'message' => 'A database error occurred.',
        ], 500);
    }

    mysqli_stmt_bind_param(
        $stmt,
        'ssssssss',
        $studentNumber,
        $firstName,
        $middleName,
        $lastName,
        $course,
        $yearLevel,
        $department,
        $rfidUid,
    );

    if (!mysqli_stmt_execute($stmt)) {
        error_log('Execute failed: ' . mysqli_stmt_error($stmt));

        json_response([
            'success' => false,
            'message' => 'A database error occurred.',
        ], 500);
    }

    $newId = mysqli_insert_id($con);
    mysqli_stmt_close($stmt);

    json_response([
        'success' => true,
        'message' => 'Student added successfully.',
        'data'    => [
            'id' => $newId,
        ],
    ], 201);
}

// ── PATCH /api/students.php ───────────────────────────────────────────────────

function handle_patch(mysqli $con): void
{
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $id      = (int) ($body['id'] ?? 0);
    $rfidUid = trim($body['rfid_uid'] ?? '') ?: null;

    if ($id <= 0) {
        json_response([
            'success' => false,
            'message' => 'Invalid student ID.',
        ], 422);
    }

    if ($rfidUid !== null) {
        $rfidOwner = find_rfid_uid_owner($con, $rfidUid, 'student', $id);
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

    $stmt = mysqli_prepare($con, "
        UPDATE students
        SET rfid_uid = ?, updated_at = NOW()
        WHERE id = ?
    ");

    if (!$stmt) {
        error_log('Prepare failed: ' . mysqli_error($con));

        json_response([
            'success' => false,
            'message' => 'A database error occurred.',
        ], 500);
    }

    mysqli_stmt_bind_param($stmt, 'si', $rfidUid, $id);

    if (!mysqli_stmt_execute($stmt)) {
        error_log('Execute failed: ' . mysqli_stmt_error($stmt));

        json_response([
            'success' => false,
            'message' => 'A database error occurred.',
        ], 500);
    }

    if (mysqli_stmt_affected_rows($stmt) === 0) {
        mysqli_stmt_close($stmt);

        json_response([
            'success' => false,
            'message' => 'Student not found or no changes were made.',
        ], 404);
    }

    mysqli_stmt_close($stmt);

    json_response([
        'success' => true,
        'message' => 'Student RFID updated successfully.',
    ]);
}

// ── POST multipart — XLSX import ──────────────────────────────────────────────

function handle_import(mysqli $con): void
{
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        json_response([
            'success' => false,
            'message' => 'No file uploaded or upload error.',
        ], 422);
    }

    $file = $_FILES['file'];

    if ($file['size'] > 25 * 1024 * 1024) {
        json_response([
            'success' => false,
            'message' => 'File exceeds the 25 MB limit.',
        ], 422);
    }

    if (strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) !== 'xlsx') {
        json_response([
            'success' => false,
            'message' => 'Only .xlsx files are supported.',
        ], 422);
    }

    try {
        $spreadsheet = IOFactory::load($file['tmp_name']);
    } catch (Throwable $e) {
        json_response([
            'success' => false,
            'message' => 'Could not read the file: ' . $e->getMessage(),
        ], 422);
    }

    $rows = $spreadsheet->getActiveSheet()->toArray(null, true, true, false);

    if (count($rows) < 2) {
        json_response([
            'success' => false,
            'message' => 'The file has no data rows.',
        ], 422);
    }

    $colIndex = array_flip(
        array_map(static fn($h) => strtolower(trim((string) $h)), $rows[0])
    );

    $required = ['student_number', 'first_name', 'last_name'];
    $missing = array_filter(
        $required,
        static fn($c) => !array_key_exists($c, $colIndex)
    );

    if ($missing) {
        json_response([
            'success' => false,
            'message' => 'Missing required columns: ' . implode(', ', $missing),
        ], 422);
    }

    $get = static fn(array $row, string $key): string =>
        isset($colIndex[$key])
            ? trim((string) ($row[$colIndex[$key]] ?? ''))
            : '';

    $stmtDupWithRfid = mysqli_prepare($con, "
        SELECT id
        FROM students
        WHERE student_number = ? OR rfid_uid = ?
        LIMIT 1
    ");

    $stmtDupNoRfid = mysqli_prepare($con, "
        SELECT id
        FROM students
        WHERE student_number = ?
        LIMIT 1
    ");

    $stmtInsert = mysqli_prepare($con, "
        INSERT INTO students
            (
                student_number,
                first_name,
                middle_name,
                last_name,
                course,
                year_level,
                department,
                rfid_uid,
                is_active,
                created_at,
                updated_at
            )
        VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
    ");

    if (!$stmtDupWithRfid || !$stmtDupNoRfid || !$stmtInsert) {
        error_log('Import prepare failed: ' . mysqli_error($con));

        json_response([
            'success' => false,
            'message' => 'A database error occurred.',
        ], 500);
    }

    $inserted = 0;
    $skipped = 0;
    $errors = [];

    foreach (array_slice($rows, 1) as $i => $row) {
        $line = $i + 2;

        $studentNumber = $get($row, 'student_number');
        $firstName     = $get($row, 'first_name');
        $lastName      = $get($row, 'last_name');

        if ($studentNumber === '' && $firstName === '' && $lastName === '') {
            continue;
        }

        if ($studentNumber === '' || $firstName === '' || $lastName === '') {
            $errors[] = "Row {$line}: student_number, first_name, and last_name are required.";
            $skipped++;
            continue;
        }

        $middleName = $get($row, 'middle_name') ?: null;
        $course     = $get($row, 'course');
        $yearLevel  = $get($row, 'year_level');
        $department = $get($row, 'department');
        $rfidUid    = $get($row, 'rfid_uid') ?: null;

        if ($rfidUid !== null) {
            mysqli_stmt_bind_param(
                $stmtDupWithRfid,
                'ss',
                $studentNumber,
                $rfidUid
            );

            mysqli_stmt_execute($stmtDupWithRfid);
            mysqli_stmt_store_result($stmtDupWithRfid);

            $isDup = mysqli_stmt_num_rows($stmtDupWithRfid) > 0;

            mysqli_stmt_reset($stmtDupWithRfid);
        } else {
            mysqli_stmt_bind_param(
                $stmtDupNoRfid,
                's',
                $studentNumber
            );

            mysqli_stmt_execute($stmtDupNoRfid);
            mysqli_stmt_store_result($stmtDupNoRfid);

            $isDup = mysqli_stmt_num_rows($stmtDupNoRfid) > 0;

            mysqli_stmt_reset($stmtDupNoRfid);
        }

        if ($isDup) {
            $errors[] = "Row {$line}: duplicate student_number or rfid_uid — skipped.";
            $skipped++;
            continue;
        }

        mysqli_stmt_bind_param(
            $stmtInsert,
            'ssssssss',
            $studentNumber,
            $firstName,
            $middleName,
            $lastName,
            $course,
            $yearLevel,
            $department,
            $rfidUid,
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