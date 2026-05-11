<?php

require_once __DIR__ . '/../config/session.php';
session_start();

require_once __DIR__ . '/../controllers/csrf.php';
require_once __DIR__ . '/../controllers/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
}

// Validate CSRF token for logout
validate_csrf_token();

$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params['path'],
        $params['domain'],
        $params['secure'],
        $params['httponly'],
    );
}

session_destroy();

json_response(['success' => true, 'message' => 'Logged out successfully.']);