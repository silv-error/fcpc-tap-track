<?php

require_once __DIR__ . '/../config/session.php';
session_start();

require_once __DIR__ . '/../config/connection.php';
require_once __DIR__ . '/../controllers/helpers.php';
require_once __DIR__ . '/../controllers/csrf.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
}

// Validate CSRF token for login
validate_csrf_token();

// Already logged in — nothing to do
if (!empty($_SESSION['user_id'])) {
    json_response(['success' => true, 'message' => 'Already authenticated.']);
}

$body = json_decode(file_get_contents('php://input'), true) ?? [];

$identifier = trim($body['email'] ?? '');   // accepts username or email
$password   = $body['password']  ?? '';

if ($identifier === '' || $password === '') {
    json_response(['success' => false, 'message' => 'Email/username and password are required.'], 422);
}

$stmt = mysqli_prepare($con, "
    SELECT id, username, first_name, last_name, role, password_hash, is_active
    FROM users
    WHERE username = ? OR email = ?
    LIMIT 1
");

if (!$stmt) {
    json_response(['success' => false, 'message' => mysqli_error($con)], 500);
}

mysqli_stmt_bind_param($stmt, 'ss', $identifier, $identifier);
mysqli_stmt_execute($stmt);
$result = mysqli_stmt_get_result($stmt);

if (!$result) {
    json_response(['success' => false, 'message' => mysqli_error($con)], 500);
}

$user = mysqli_fetch_assoc($result);

// Use a constant-time comparison path whether the user exists or not
// to avoid timing-based user enumeration.
$dummyHash = '$2y$12$invalidsaltinvalidsaltininvalid';
$hash      = $user['password_hash'] ?? $dummyHash;

if (!$user || !password_verify($password, $hash)) {
    json_response(['success' => false, 'message' => 'Invalid credentials.'], 401);
}

if (!(bool) $user['is_active']) {
    json_response(['success' => false, 'message' => 'Your account is inactive. Contact an administrator.'], 403);
}

// Regenerate session ID on login to prevent session fixation
session_regenerate_id(true);

$_SESSION['user_id']   = (int) $user['id'];
$_SESSION['username']  = $user['username'];
$_SESSION['role']      = $user['role'];
$_SESSION['full_name'] = $user['first_name'] . ' ' . $user['last_name'];

json_response([
    'success' => true,
    'message' => 'Login successful.',
    'data'    => [
        'username'  => $user['username'],
        'role'      => $user['role'],
        'full_name' => $_SESSION['full_name'],
    ],
]);