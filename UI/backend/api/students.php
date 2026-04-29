<?php

require_once __DIR__ . '/../../connection.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/../../../vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\IOFactory;

match ($_SERVER['REQUEST_METHOD']) {
    'GET'   => handle_get($con),
    'POST'  => handle_post($con),
    'PATCH' => handle_patch($con),
    default => json_response(['success' => false, 'message' => 'Method not allowed.'], 405),
};

// ── GET /api/students.php ─────────────────────────────────────────────────────

function handle_get(mysqli $con): void
{
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
                'rfid_uid'       => $student['rfid_uid']   ?: '-',
                'name'           => format_display_name(
                    $student['last_name'],
                    $student['first_name'],
                    $student['middle_name'],
                    $student['suffix'],
                ),
                'course'         => $student['course']     ?: '-',
                'year_level'     => $student['year_level'] ?: '-',
                'department'     => $student['department'] ?: '-',
                'is_active'      => (bool) $student['is_active'],
                'created_at'     => $student['created_at'],
                'updated_at'     => $student['updated_at'],
            ];
        }, $students),
    ]);
}

// ── POST /api/students.php ────────────────────────────────────────────────────
// Handles both single-add (JSON) and bulk import (multipart with a file).

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

    $firstName     = trim($body['first_name']     ?? '');
    $middleName    = trim($body['middle_name']     ?? '');
    $lastName      = trim($body['last_name']       ?? '');
    $studentNumber = trim($body['student_number']  ?? '');
    $course        = trim($body['course']          ?? '');
    $yearLevel     = trim($body['year_level']      ?? '');
    $department    = trim($body['department']      ?? '');
    $rfidUid       = trim($body['rfid_uid']        ?? '');

    $errors = [];
    if ($firstName     === '') $errors[] = 'First name is required.';
    if ($lastName      === '') $errors[] = 'Last name is required.';
    if ($studentNumber === '') $errors[] = 'Student number is required.';

    if ($errors) {
        json_response(['success' => false, 'message' => implode(' ', $errors)], 422);
    }

    $snEscaped   = mysqli_real_escape_string($con, $studentNumber);
    $rfidEscaped = mysqli_real_escape_string($con, $rfidUid);

    $dupWhere = "student_number = '{$snEscaped}'";
    if ($rfidEscaped !== '') {
        $dupWhere .= " OR rfid_uid = '{$rfidEscaped}'";
    }

    $dup = mysqli_query($con, "SELECT id FROM students WHERE {$dupWhere} LIMIT 1");
    if (!$dup) {
        json_response(['success' => false, 'message' => mysqli_error($con)], 500);
    }

    if (mysqli_num_rows($dup) > 0) {
        json_response(['success' => false, 'message' => 'Student number or RFID UID already exists.'], 409);
    }

    $rfidValue = $rfidEscaped !== '' ? "'{$rfidEscaped}'" : 'NULL';

    $sql = "
        INSERT INTO students
            (student_number, first_name, middle_name, last_name,
             course, year_level, department, rfid_uid, is_active, created_at, updated_at)
        VALUES
            ('{$snEscaped}',
             '" . mysqli_real_escape_string($con, $firstName)  . "',
             '" . mysqli_real_escape_string($con, $middleName) . "',
             '" . mysqli_real_escape_string($con, $lastName)   . "',
             '" . mysqli_real_escape_string($con, $course)     . "',
             '" . mysqli_real_escape_string($con, $yearLevel)  . "',
             '" . mysqli_real_escape_string($con, $department) . "',
             {$rfidValue}, 1, NOW(), NOW())
    ";

    if (!mysqli_query($con, $sql)) {
        json_response(['success' => false, 'message' => mysqli_error($con)], 500);
    }

    json_response([
        'success' => true,
        'message' => 'Student added successfully.',
        'data'    => ['id' => mysqli_insert_id($con)],
    ], 201);
}

// ── PATCH /api/students.php ───────────────────────────────────────────────────

function handle_patch(mysqli $con): void
{
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $id      = (int) ($body['id']      ?? 0);
    $rfidUid = trim($body['rfid_uid']  ?? '');

    if ($id <= 0) {
        json_response(['success' => false, 'message' => 'Invalid student ID.'], 422);
    }

    $rfidEscaped = mysqli_real_escape_string($con, $rfidUid);

    if ($rfidEscaped !== '') {
        $dup = mysqli_query($con, "
            SELECT id FROM students
            WHERE rfid_uid = '{$rfidEscaped}' AND id != {$id}
            LIMIT 1
        ");

        if (!$dup) {
            json_response(['success' => false, 'message' => mysqli_error($con)], 500);
        }

        if (mysqli_num_rows($dup) > 0) {
            json_response(['success' => false, 'message' => 'RFID UID is already assigned to another student.'], 409);
        }
    }

    $rfidValue = $rfidEscaped !== '' ? "'{$rfidEscaped}'" : 'NULL';

    if (!mysqli_query($con, "
        UPDATE students
        SET rfid_uid = {$rfidValue}, updated_at = NOW()
        WHERE id = {$id}
    ")) {
        json_response(['success' => false, 'message' => mysqli_error($con)], 500);
    }

    if (mysqli_affected_rows($con) === 0) {
        json_response(['success' => false, 'message' => 'Student not found.'], 404);
    }

    json_response(['success' => true, 'message' => 'Student RFID updated successfully.']);
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

    $required = ['student_number', 'first_name', 'last_name'];
    $missing  = array_filter($required, static fn($c) => !array_key_exists($c, $colIndex));

    if ($missing) {
        json_response([
            'success' => false,
            'message' => 'Missing required columns: ' . implode(', ', $missing),
        ], 422);
    }

    $get = static fn(array $row, string $key): string =>
        isset($colIndex[$key]) ? trim((string) ($row[$colIndex[$key]] ?? '')) : '';

    $inserted = 0;
    $skipped  = 0;
    $errors   = [];

    foreach (array_slice($rows, 1) as $i => $row) {
        $line          = $i + 2;
        $studentNumber = $get($row, 'student_number');
        $firstName     = $get($row, 'first_name');
        $lastName      = $get($row, 'last_name');

        if ($studentNumber === '' && $firstName === '' && $lastName === '') continue;

        if ($studentNumber === '' || $firstName === '' || $lastName === '') {
            $errors[] = "Row {$line}: student_number, first_name, and last_name are required.";
            $skipped++;
            continue;
        }

        $snEscaped   = mysqli_real_escape_string($con, $studentNumber);
        $rfidUid     = $get($row, 'rfid_uid');
        $rfidEscaped = mysqli_real_escape_string($con, $rfidUid);

        $dupWhere = "student_number = '{$snEscaped}'";
        if ($rfidEscaped !== '') $dupWhere .= " OR rfid_uid = '{$rfidEscaped}'";

        $dup = mysqli_query($con, "SELECT id FROM students WHERE {$dupWhere} LIMIT 1");
        if (mysqli_num_rows($dup) > 0) {
            $errors[] = "Row {$line}: duplicate student_number or rfid_uid — skipped.";
            $skipped++;
            continue;
        }

        $rfidValue = $rfidEscaped !== '' ? "'{$rfidEscaped}'" : 'NULL';

        $sql = "
            INSERT INTO students
                (student_number, first_name, middle_name, last_name,
                 course, year_level, department, rfid_uid, is_active, created_at, updated_at)
            VALUES
                ('{$snEscaped}',
                 '" . mysqli_real_escape_string($con, $firstName)                . "',
                 '" . mysqli_real_escape_string($con, $get($row, 'middle_name')) . "',
                 '" . mysqli_real_escape_string($con, $lastName)                 . "',
                 '" . mysqli_real_escape_string($con, $get($row, 'course'))      . "',
                 '" . mysqli_real_escape_string($con, $get($row, 'year_level'))  . "',
                 '" . mysqli_real_escape_string($con, $get($row, 'department'))  . "',
                 {$rfidValue}, 1, NOW(), NOW())
        ";

        if (mysqli_query($con, $sql)) {
            $inserted++;
        } else {
            $errors[] = "Row {$line}: " . mysqli_error($con);
            $skipped++;
        }
    }

    json_response([
        'success'  => true,
        'message'  => "Import complete. {$inserted} record(s) inserted, {$skipped} skipped.",
        'inserted' => $inserted,
        'skipped'  => $skipped,
        'errors'   => $errors,
    ]);
}