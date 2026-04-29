<?php
ob_start(); // buffer any accidental output
require_once __DIR__ . '/../../connection.php';
require_once __DIR__ . '/helpers.php';

match ($_SERVER['REQUEST_METHOD']) {
    'GET'  => handle_get($con),
    'POST' => handle_post($con),
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
                //'id'         => (int) $user['id'],
                'employee_number' => $user['employee_number'] ?: '-',  
                'username'   => $user['username'],
                'name'       => format_display_name(
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

    // employee_id is the employees.id (PK), required so we can pull name fields
    $employeeId = (int) ($body['employee_id'] ?? 0);
    $username   = trim($body['username'] ?? '');
    $email      = trim($body['email']    ?? '');
    $role       = trim($body['role']     ?? '');
    $status     = trim($body['status']   ?? 'Active');

    $errors = [];
    if ($employeeId <= 0) $errors[] = 'A valid employee must be selected.';
    if ($username   === '') $errors[] = 'Username is required.';
    if ($email      === '') $errors[] = 'Email is required.';
    if ($role       === '') $errors[] = 'Role is required.';
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL))   $errors[] = 'Invalid email address.';
    if (!in_array($role,   ['Admin', 'Superadmin'], true))             $errors[] = 'Invalid role.';
    if (!in_array($status, ['Active', 'Inactive'],  true))             $errors[] = 'Invalid status.';

    if ($errors) {
        json_response(['success' => false, 'message' => implode(' ', $errors)], 422);
    }

    // ── Verify the employee exists and grab their name fields ─────────────────
    $emp = mysqli_query($con, "
        SELECT id, employee_number, first_name, middle_name, last_name, suffix
        FROM employees
        WHERE id = {$employeeId}
        LIMIT 1
    ");

    if (!$emp) {
        json_response(['success' => false, 'message' => mysqli_error($con)], 500);
    }

    if (mysqli_num_rows($emp) === 0) {
        json_response(['success' => false, 'message' => 'Employee not found.'], 404);
    }

    $employee = mysqli_fetch_assoc($emp);

    // ── Make sure this employee isn't already a user ──────────────────────────
    $alreadyUser = mysqli_query($con, "
        SELECT id FROM users WHERE employee_id = {$employeeId} LIMIT 1
    ");

    if ($alreadyUser && mysqli_num_rows($alreadyUser) > 0) {
        json_response(['success' => false, 'message' => 'This employee already has a user account.'], 409);
    }

    // ── Duplicate username / email check ──────────────────────────────────────
    $usernameEscaped = mysqli_real_escape_string($con, $username);
    $emailEscaped    = mysqli_real_escape_string($con, $email);

    $dup = mysqli_query($con, "
        SELECT id FROM users
        WHERE username = '{$usernameEscaped}' OR email = '{$emailEscaped}'
        LIMIT 1
    ");

    if (!$dup) {
        json_response(['success' => false, 'message' => mysqli_error($con)], 500);
    }

    if (mysqli_num_rows($dup) > 0) {
        json_response(['success' => false, 'message' => 'Username or email already exists.'], 409);
    }

    // ── Insert — name fields come from the employees table ────────────────────
    $isActive      = $status === 'Active' ? 1 : 0;
    $firstEscaped  = mysqli_real_escape_string($con, $employee['first_name']);
    $middleEscaped = mysqli_real_escape_string($con, $employee['middle_name'] ?? '');
    $lastEscaped   = mysqli_real_escape_string($con, $employee['last_name']);
    $roleEscaped   = mysqli_real_escape_string($con, $role);

    $sql = "
        INSERT INTO users
            (employee_id, username, first_name, middle_name, last_name,
             email, role, is_active, created_at, updated_at)
        VALUES
            ({$employeeId}, '{$usernameEscaped}', '{$firstEscaped}',
             '{$middleEscaped}', '{$lastEscaped}', '{$emailEscaped}',
             '{$roleEscaped}', {$isActive}, NOW(), NOW())
    ";

    if (!mysqli_query($con, $sql)) {
        json_response(['success' => false, 'message' => mysqli_error($con)], 500);
    }

    json_response([
        'success' => true,
        'message' => 'User added successfully.',
        'data'    => ['id' => mysqli_insert_id($con)],
    ], 201);
}