<?php

require_once __DIR__ . '/../config/session.php';
session_start();

require_once __DIR__ . '/../config/connection.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/csrf.php';

$currentRole = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($currentRole !== 'superadmin') {
    json_response(['success' => false, 'message' => 'Forbidden. Superadmin access required.'], 403);
}

if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PATCH', 'PUT', 'DELETE'])) {
    validate_csrf_token();
}
match ($_SERVER['REQUEST_METHOD']) {
    'GET'   => handle_get($con),
    'POST'  => handle_post($con),
    'PATCH' => handle_patch($con),
    default => json_response(['success' => false, 'message' => 'Method not allowed.'], 405),
};

// ── GET /api/users.php ────────────────────────────────────────────────────────

function handle_get(mysqli $con): void
{
    $sql = "
        SELECT
            u.id,
            e.employee_number,
            u.username,
            u.last_name,
            u.first_name,
            u.middle_name,
            u.suffix,
            u.email,
            u.role,
            u.is_active,
            u.created_at,
            u.updated_at
        FROM users u
        LEFT JOIN employees e ON e.id = u.employee_id
        ORDER BY u.last_name ASC, u.first_name ASC, u.username ASC
    ";

    $users = fetch_all_rows($con, $sql);

    json_response([
        'success' => true,
        'data'    => array_map(static function (array $user): array {
            return [
                'id'              => (int) $user['id'],
                'employee_number' => $user['employee_number'] ?: '-',
                'username'        => $user['username'],
                'name'            => format_display_name(
                    $user['last_name'],
                    $user['first_name'],
                    $user['middle_name'],
                    $user['suffix'],
                ),
                'email'      => $user['email'],
                'role'       => $user['role'],
                'is_active'  => (bool) $user['is_active'],
                'created_at' => $user['created_at'],
                'updated_at' => $user['updated_at'],
            ];
        }, $users),
    ]);
}

// ── POST /api/users.php ───────────────────────────────────────────────────────

function handle_post(mysqli $con): void
{
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
 
    $employeeId = (int)   ($body['employee_id'] ?? 0);
    $username   = trim($body['username']  ?? '');
    $email      = trim($body['email']     ?? '');
    $role       = trim($body['role']      ?? '');
    $status     = trim($body['status']    ?? 'Active');
    $password   = $body['password']       ?? '';
 
    $errors = [];
    if ($employeeId <= 0)   $errors[] = 'A valid employee must be selected.';
    if ($username   === '') $errors[] = 'Username is required.';
    if ($email      === '') $errors[] = 'Email is required.';
    if ($role       === '') $errors[] = 'Role is required.';
    if ($password   === '') $errors[] = 'Password is required.';
    if ($password   !== '' && strlen($password) < 8) $errors[] = 'Password must be at least 8 characters.';
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'Invalid email address.';
    if (!in_array($role,   ['Admin', 'Superadmin'], true)) $errors[] = 'Invalid role.';
    if (!in_array($status, ['Active', 'Inactive'],  true)) $errors[] = 'Invalid status.';
 
    if ($errors) {
        json_response(['success' => false, 'message' => implode(' ', $errors)], 422);
    }
 
    // ── 1. Verify employee exists ─────────────────────────────────────────────
    // $employeeId is an (int) cast so injection is not possible here, but we
    // use a prepared statement anyway for consistency.
    $employees = fetch_all_rows_prepared(
        $con,
        "
            SELECT id, first_name, middle_name, last_name, suffix
            FROM employees
            WHERE id = ?
            LIMIT 1
        ",
        'i',
        $employeeId,
    );

    if ($employees === []) {
        json_response(['success' => false, 'message' => 'Employee not found.'], 404);
    }
    $employee = $employees[0];
 
    // ── 2. Employee already a user? ───────────────────────────────────────────
    $existingUser = fetch_all_rows_prepared(
        $con,
        "
            SELECT id FROM users
            WHERE employee_id = ?
            LIMIT 1
        ",
        'i',
        $employeeId,
    );

    if ($existingUser !== []) {
        json_response(['success' => false, 'message' => 'This employee already has a user account.'], 409);
    }
 
    // ── 3. Duplicate username / email check ───────────────────────────────────
    $duplicateAccount = fetch_all_rows_prepared(
        $con,
        "
            SELECT id FROM users
            WHERE username = ? OR email = ?
            LIMIT 1
        ",
        'ss',
        $username,
        $email,
    );

    if ($duplicateAccount !== []) {
        json_response(['success' => false, 'message' => 'Username or email already exists.'], 409);
    }
 
    // ── 4. Insert ─────────────────────────────────────────────────────────────
    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    $isActive     = $status === 'Active' ? 1 : 0;
    $firstName    = $employee['first_name'];
    $middleName   = $employee['middle_name'] ?? '';
    $lastName     = $employee['last_name'];
 
    $stmt = mysqli_prepare($con, "
        INSERT INTO users
            (employee_id, username, first_name, middle_name, last_name,
             email, role, password_hash, is_active, created_at, updated_at)
        VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ");
 
    if (!$stmt) {
        error_log('Prepare failed: ' . mysqli_error($con));
        json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
    }
 
    mysqli_stmt_bind_param(
        $stmt, 'isssssssi',
        $employeeId,
        $username,
        $firstName,
        $middleName,
        $lastName,
        $email,
        $role,
        $passwordHash,
        $isActive,
    );
 
    if (!mysqli_stmt_execute($stmt)) {
        error_log('Execute failed: ' . mysqli_stmt_error($stmt));
        json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
    }
 
    $newId = mysqli_insert_id($con);
    mysqli_stmt_close($stmt);
 
    json_response([
        'success' => true,
        'message' => 'User added successfully.',
        'data'    => ['id' => $newId],
    ], 201);
}

// ── PATCH /api/users.php ──────────────────────────────────────────────────────

function handle_patch(mysqli $con): void
{
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
 
    $employeeNumber = trim($body['employee_number'] ?? '');
    $username       = trim($body['username']        ?? '');
    $email          = trim($body['email']           ?? '');
    $role           = trim($body['role']            ?? '');
    $status         = trim($body['status']          ?? '');
 
    $errors = [];
    if ($employeeNumber === '') $errors[] = 'Employee number is required.';
    if ($username       === '') $errors[] = 'Username is required.';
    if ($email          === '') $errors[] = 'Email is required.';
    if ($role           === '') $errors[] = 'Role is required.';
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'Invalid email address.';
    if (!in_array($role,   ['Admin', 'Superadmin'], true)) $errors[] = 'Invalid role.';
    if (!in_array($status, ['Active', 'Inactive'],  true)) $errors[] = 'Invalid status.';
 
    if ($errors) {
        json_response(['success' => false, 'message' => implode(' ', $errors)], 422);
    }
 
    // ── 1. Look up user by employee_number ────────────────────────────────────
    $users = fetch_all_rows_prepared(
        $con,
        "
            SELECT u.id
            FROM users u
            JOIN employees e ON e.id = u.employee_id
            WHERE e.employee_number = ?
            LIMIT 1
        ",
        's',
        $employeeNumber,
    );

    if ($users === []) {
        json_response(['success' => false, 'message' => 'User not found.'], 404);
    }
    $userId = (int) $users[0]['id'];
 
    // ── 2. Duplicate username / email check (excluding this user) ─────────────
    $conflictingUser = fetch_all_rows_prepared(
        $con,
        "
            SELECT id FROM users
            WHERE (username = ? OR email = ?)
              AND id != ?
            LIMIT 1
        ",
        'ssi',
        $username,
        $email,
        $userId,
    );

    if ($conflictingUser !== []) {
        json_response(['success' => false, 'message' => 'Username or email already in use by another account.'], 409);
    }
 
    // ── 3. Update ─────────────────────────────────────────────────────────────
    $isActive = $status === 'Active' ? 1 : 0;
 
    $stmt = mysqli_prepare($con, "
        UPDATE users
        SET username   = ?,
            email      = ?,
            role       = ?,
            is_active  = ?,
            updated_at = NOW()
        WHERE id = ?
    ");
 
    if (!$stmt) {
        error_log('Prepare failed: ' . mysqli_error($con));
        json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
    }
 
    mysqli_stmt_bind_param($stmt, 'sssii', $username, $email, $role, $isActive, $userId);
 
    if (!mysqli_stmt_execute($stmt)) {
        error_log('Execute failed: ' . mysqli_stmt_error($stmt));
        json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
    }
 
    mysqli_stmt_close($stmt);
 
    json_response(['success' => true, 'message' => 'User updated successfully.']);
}
