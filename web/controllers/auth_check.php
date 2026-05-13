<?php
 
/**
 * auth_check.php
 *
 * Include at the top of every protected API endpoint.
 * Assumes session_start() has already been called, or calls it here.
 * Returns 401 JSON and exits if the request is not authenticated.
 */
 
require_once __DIR__ . '/../config/session.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
 
if (empty($_SESSION['user_id'])) {
    // Helpers may not be loaded yet at this point, so respond manually.
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'Unauthenticated.']);
    exit;
}