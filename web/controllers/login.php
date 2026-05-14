<?php

require_once __DIR__ . '/../config/session.php';
session_start();

require_once __DIR__ . '/../config/connection.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/csrf.php';

const LOGIN_LOCKOUT_THRESHOLD = 10;
const LOGIN_LOCKOUT_MINUTES = 15;

function login_mark_failure(mysqli $con, ?int $userId): array
{
    if ($userId === null) {
        $sessionAttempts = (int) ($_SESSION['login_failed_attempts'] ?? 0) + 1;
        $_SESSION['login_failed_attempts'] = $sessionAttempts;

        return [
            'remaining_attempts' => max(0, LOGIN_LOCKOUT_THRESHOLD - $sessionAttempts),
        ];
    }

    $attempts = 0;
    $lockUntil = null;
    $lockoutThreshold = LOGIN_LOCKOUT_THRESHOLD;
    $lockoutMinutes = LOGIN_LOCKOUT_MINUTES;

    $updateStmt = mysqli_prepare($con, "
        UPDATE users
        SET failed_login_attempts = failed_login_attempts + 1,
            locked_until = CASE
                WHEN failed_login_attempts + 1 >= ? THEN DATE_ADD(NOW(), INTERVAL ? MINUTE)
                ELSE locked_until
            END,
            updated_at = NOW()
        WHERE id = ?
    ");

    if ($updateStmt) {
        mysqli_stmt_bind_param($updateStmt, 'iii', $lockoutThreshold, $lockoutMinutes, $userId);
    }

    if ($updateStmt && mysqli_stmt_execute($updateStmt)) {
        mysqli_stmt_close($updateStmt);

        $selectStmt = mysqli_prepare($con, "
            SELECT failed_login_attempts, locked_until
            FROM users
            WHERE id = ?
            LIMIT 1
        ");

        if ($selectStmt) {
            mysqli_stmt_bind_param($selectStmt, 'i', $userId);
            mysqli_stmt_execute($selectStmt);
            $result = mysqli_stmt_get_result($selectStmt);
            if ($result && ($row = mysqli_fetch_assoc($result))) {
                $attempts = (int) ($row['failed_login_attempts'] ?? 0);
                $lockUntil = $row['locked_until'] ?? null;
            }
            mysqli_stmt_close($selectStmt);
        }
    }

    $response = [
        'remaining_attempts' => max(0, LOGIN_LOCKOUT_THRESHOLD - $attempts),
    ];

    if ($lockUntil !== null) {
        $response['locked_until'] = $lockUntil;
    }

    return $response;
}

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
$rememberMe = (bool) ($body['rememberMe'] ?? false);

if ($identifier === '' || $password === '') {
    json_response(['success' => false, 'message' => 'Email/username and password are required.'], 422);
}

$stmt = mysqli_prepare($con, "
    SELECT id, username, first_name, last_name, role, password_hash, is_active, failed_login_attempts, locked_until
    FROM users
    WHERE username = ? OR email = ?
    LIMIT 1
");

if (!$stmt) {
    error_log('Login prepare failed: ' . mysqli_error($con));
    json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
}

mysqli_stmt_bind_param($stmt, 'ss', $identifier, $identifier);
mysqli_stmt_execute($stmt);
$result = mysqli_stmt_get_result($stmt);

if (!$result) {
    error_log('Login get_result failed: ' . mysqli_error($con));
    json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
}

$user = mysqli_fetch_assoc($result);

// Use a constant-time comparison path whether the user exists or not
// to avoid timing-based user enumeration.
$dummyHash = '$2y$12$invalidsaltinvalidsaltininvalid';
$hash      = $user['password_hash'] ?? $dummyHash;

if ($user && !empty($user['locked_until'])) {
    $isLocked = false;
    $lockCheckStmt = mysqli_prepare($con, "
        SELECT (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked
        FROM users
        WHERE id = ?
        LIMIT 1
    ");

    if ($lockCheckStmt) {
        mysqli_stmt_bind_param($lockCheckStmt, 'i', $user['id']);
        mysqli_stmt_execute($lockCheckStmt);
        $lockResult = mysqli_stmt_get_result($lockCheckStmt);
        if ($lockResult && ($lockRow = mysqli_fetch_assoc($lockResult))) {
            $isLocked = (bool) ($lockRow['is_locked'] ?? false);
        }
        mysqli_stmt_close($lockCheckStmt);
    }

    if ($isLocked) {
        json_response([
            'success' => false,
            'message' => 'Your account is temporarily locked. Please try again later.',
            'locked_until' => $user['locked_until'],
        ], 423);
    }

    $resetStmt = mysqli_prepare($con, "
        UPDATE users
        SET failed_login_attempts = 0,
            locked_until = NULL,
            updated_at = NOW()
        WHERE id = ?
    ");

    if ($resetStmt) {
        mysqli_stmt_bind_param($resetStmt, 'i', $user['id']);
        mysqli_stmt_execute($resetStmt);
        mysqli_stmt_close($resetStmt);
        $user['failed_login_attempts'] = 0;
        $user['locked_until'] = null;
    }
}

if (!$user || !password_verify($password, $hash)) {
    $failurePayload = login_mark_failure($con, $user ? (int) $user['id'] : null);

    $response = [
        'success' => false,
        'message' => 'Invalid credentials.',
        'remaining_attempts' => $failurePayload['remaining_attempts'] ?? 0,
    ];

    if (!empty($failurePayload['locked_until'])) {
        $response['locked_until'] = $failurePayload['locked_until'];
        $response['message'] = 'Your account is temporarily locked. Please try again later.';
    }

    json_response($response, !empty($failurePayload['locked_until']) ? 423 : 401);
}

if (!(bool) $user['is_active']) {
    json_response(['success' => false, 'message' => 'Your account is inactive. Contact an administrator.'], 403);
}

// Regenerate session ID on login to prevent session fixation
session_regenerate_id(true);
$_SESSION['login_failed_attempts'] = 0;

$clearStmt = mysqli_prepare($con, "
    UPDATE users
    SET failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
    WHERE id = ?
");

if ($clearStmt) {
    mysqli_stmt_bind_param($clearStmt, 'i', $user['id']);
    mysqli_stmt_execute($clearStmt);
    mysqli_stmt_close($clearStmt);
}

$_SESSION['user_id']   = (int) $user['id'];
$_SESSION['username']  = $user['username'];
$_SESSION['role']      = $user['role'];
$_SESSION['full_name'] = $user['first_name'] . ' ' . $user['last_name'];

if ($rememberMe) {
    setcookie('remember_token', bin2hex(random_bytes(32)), [
        'expires'  => time() + (14 * 24 * 60 * 60),
        'httponly' => true,
        'secure'   => isset($_SERVER['HTTPS']),
        'samesite' => 'Lax',
    ]);
}

json_response([
    'success' => true,
    'message' => 'Login successful.',
    'data'    => [
        'username'  => $user['username'],
        'role'      => $user['role'],
        'full_name' => $_SESSION['full_name'],
    ],
]);
