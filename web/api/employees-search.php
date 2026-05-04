<?php

require_once __DIR__ . '/../config/session.php';
session_start();

require_once __DIR__ . '/../config/connection.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth_check.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
}

$q = trim($_GET['q'] ?? '');

if (strlen($q) < 1) {
    json_response(['success' => true, 'data' => []]);
}

// Wrap the search term in wildcards once — bound three times below.
$like = '%' . $q . '%';

$stmt = mysqli_prepare($con, "
    SELECT
        e.id,
        e.employee_number,
        e.first_name,
        e.middle_name,
        e.last_name,
        e.suffix,
        e.department
    FROM employees e
    LEFT JOIN users u ON u.employee_id = e.id
    WHERE u.id IS NULL
      AND (
          e.employee_number LIKE ?
          OR e.first_name   LIKE ?
          OR e.last_name    LIKE ?
      )
    ORDER BY e.last_name ASC, e.first_name ASC
    LIMIT 10
");

if (!$stmt) {
    error_log('Prepare failed: ' . mysqli_error($con));
    json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
}

// Bind the same $like value to all three LIKE placeholders.
mysqli_stmt_bind_param($stmt, 'sss', $like, $like, $like);

if (!mysqli_stmt_execute($stmt)) {
    error_log('Execute failed: ' . mysqli_stmt_error($stmt));
    json_response(['success' => false, 'message' => 'A database error occurred.'], 500);
}

$result    = mysqli_stmt_get_result($stmt);
$employees = [];

while ($row = mysqli_fetch_assoc($result)) {
    $employees[] = [
        'id'              => (int) $row['id'],
        'employee_number' => $row['employee_number'],
        'first_name'      => $row['first_name'],
        'middle_name'     => $row['middle_name'] ?? '',
        'last_name'       => $row['last_name'],
        'suffix'          => $row['suffix']      ?? '',
        'department'      => $row['department']  ?? '',
        'display_name'    => trim(
            $row['last_name'] . ', ' .
            $row['first_name'] .
            ($row['middle_name'] ? ' ' . $row['middle_name'][0] . '.' : '') .
            ($row['suffix']      ? ' ' . $row['suffix']                : '')
        ),
    ];
}

mysqli_stmt_close($stmt);

json_response(['success' => true, 'data' => $employees]);