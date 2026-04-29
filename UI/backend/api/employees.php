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

// ── GET /api/employees.php ────────────────────────────────────────────────────

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
                'rfid_uid'        => $employee['rfid_uid']   ?: '-',
                'name'            => format_display_name(
                    $employee['last_name'],
                    $employee['first_name'],
                    $employee['middle_name'],
                    $employee['suffix'],
                ),
                'position'        => $employee['position']   ?: '-',
                'department'      => $employee['department']  ?: '-',
                'is_active'       => (bool) $employee['is_active'],
                'created_at'      => $employee['created_at'],
                'updated_at'      => $employee['updated_at'],
            ];
        }, $employees),
    ]);
}

// ── POST /api/employees.php ───────────────────────────────────────────────────
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

    $firstName      = trim($body['first_name']      ?? '');
    $middleName     = trim($body['middle_name']      ?? '');
    $lastName       = trim($body['last_name']        ?? '');
    $employeeNumber = trim($body['employee_number']  ?? '');
    $department     = trim($body['department']       ?? '');
    $position       = trim($body['position']         ?? '');
    $rfidUid        = trim($body['rfid_uid']         ?? '');

    $errors = [];
    if ($firstName      === '') $errors[] = 'First name is required.';
    if ($lastName       === '') $errors[] = 'Last name is required.';
    if ($employeeNumber === '') $errors[] = 'Employee number is required.';

    if ($errors) {
        json_response(['success' => false, 'message' => implode(' ', $errors)], 422);
    }

    $enEscaped   = mysqli_real_escape_string($con, $employeeNumber);
    $rfidEscaped = mysqli_real_escape_string($con, $rfidUid);

    $dupWhere = "employee_number = '{$enEscaped}'";
    if ($rfidEscaped !== '') {
        $dupWhere .= " OR rfid_uid = '{$rfidEscaped}'";
    }

    $dup = mysqli_query($con, "SELECT id FROM employees WHERE {$dupWhere} LIMIT 1");
    if (!$dup) {
        json_response(['success' => false, 'message' => mysqli_error($con)], 500);
    }

    if (mysqli_num_rows($dup) > 0) {
        json_response(['success' => false, 'message' => 'Employee number or RFID UID already exists.'], 409);
    }

    $rfidValue = $rfidEscaped !== '' ? "'{$rfidEscaped}'" : 'NULL';

    $sql = "
        INSERT INTO employees
            (employee_number, first_name, middle_name, last_name,
             department, position, rfid_uid, is_active, created_at, updated_at)
        VALUES
            ('{$enEscaped}',
             '" . mysqli_real_escape_string($con, $firstName)  . "',
             '" . mysqli_real_escape_string($con, $middleName) . "',
             '" . mysqli_real_escape_string($con, $lastName)   . "',
             '" . mysqli_real_escape_string($con, $department) . "',
             '" . mysqli_real_escape_string($con, $position)   . "',
             {$rfidValue}, 1, NOW(), NOW())
    ";

    if (!mysqli_query($con, $sql)) {
        json_response(['success' => false, 'message' => mysqli_error($con)], 500);
    }

    json_response([
        'success' => true,
        'message' => 'Employee added successfully.',
        'data'    => ['id' => mysqli_insert_id($con)],
    ], 201);
}

// ── PATCH /api/employees.php ──────────────────────────────────────────────────

function handle_patch(mysqli $con): void
{
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $id      = (int) ($body['id']      ?? 0);
    $rfidUid = trim($body['rfid_uid']  ?? '');

    if ($id <= 0) {
        json_response(['success' => false, 'message' => 'Invalid employee ID.'], 422);
    }

    $rfidEscaped = mysqli_real_escape_string($con, $rfidUid);

    if ($rfidEscaped !== '') {
        $dup = mysqli_query($con, "
            SELECT id FROM employees
            WHERE rfid_uid = '{$rfidEscaped}' AND id != {$id}
            LIMIT 1
        ");

        if (!$dup) {
            json_response(['success' => false, 'message' => mysqli_error($con)], 500);
        }

        if (mysqli_num_rows($dup) > 0) {
            json_response(['success' => false, 'message' => 'RFID UID is already assigned to another employee.'], 409);
        }
    }

    $rfidValue = $rfidEscaped !== '' ? "'{$rfidEscaped}'" : 'NULL';

    if (!mysqli_query($con, "
        UPDATE employees
        SET rfid_uid = {$rfidValue}, updated_at = NOW()
        WHERE id = {$id}
    ")) {
        json_response(['success' => false, 'message' => mysqli_error($con)], 500);
    }

    if (mysqli_affected_rows($con) === 0) {
        json_response(['success' => false, 'message' => 'Employee not found.'], 404);
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

    $inserted = 0;
    $skipped  = 0;
    $errors   = [];

    foreach (array_slice($rows, 1) as $i => $row) {
        $line           = $i + 2;
        $employeeNumber = $get($row, 'employee_number');
        $firstName      = $get($row, 'first_name');
        $lastName       = $get($row, 'last_name');

        if ($employeeNumber === '' && $firstName === '' && $lastName === '') continue;

        if ($employeeNumber === '' || $firstName === '' || $lastName === '') {
            $errors[] = "Row {$line}: employee_number, first_name, and last_name are required.";
            $skipped++;
            continue;
        }

        $enEscaped   = mysqli_real_escape_string($con, $employeeNumber);
        $rfidUid     = $get($row, 'rfid_uid');
        $rfidEscaped = mysqli_real_escape_string($con, $rfidUid);

        $dupWhere = "employee_number = '{$enEscaped}'";
        if ($rfidEscaped !== '') $dupWhere .= " OR rfid_uid = '{$rfidEscaped}'";

        $dup = mysqli_query($con, "SELECT id FROM employees WHERE {$dupWhere} LIMIT 1");
        if (mysqli_num_rows($dup) > 0) {
            $errors[] = "Row {$line}: duplicate employee_number or rfid_uid — skipped.";
            $skipped++;
            continue;
        }

        $rfidValue = $rfidEscaped !== '' ? "'{$rfidEscaped}'" : 'NULL';

        $sql = "
            INSERT INTO employees
                (employee_number, first_name, middle_name, last_name,
                 department, position, rfid_uid, is_active, created_at, updated_at)
            VALUES
                ('{$enEscaped}',
                 '" . mysqli_real_escape_string($con, $firstName)                . "',
                 '" . mysqli_real_escape_string($con, $get($row, 'middle_name')) . "',
                 '" . mysqli_real_escape_string($con, $lastName)                 . "',
                 '" . mysqli_real_escape_string($con, $get($row, 'department'))  . "',
                 '" . mysqli_real_escape_string($con, $get($row, 'position'))    . "',
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