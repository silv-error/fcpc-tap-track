<?php
ob_start();
require_once __DIR__ . '/../../connection.php';
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
}

$q = trim($_GET['q'] ?? '');

if (strlen($q) < 1) {
    json_response(['success' => true, 'data' => []]);
}

$escaped = mysqli_real_escape_string($con, $q);

// Search by employee_number OR name; exclude employees already registered as users
$sql = "
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
          e.employee_number LIKE '%{$escaped}%'
          OR e.first_name   LIKE '%{$escaped}%'
          OR e.last_name    LIKE '%{$escaped}%'
      )
    ORDER BY e.last_name ASC, e.first_name ASC
    LIMIT 10
";

$result = mysqli_query($con, $sql);

if (!$result) {
    json_response(['success' => false, 'message' => mysqli_error($con)], 500);
}

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
            ($row['suffix']     ? ' ' . $row['suffix']                : '')
        ),
    ];
}

json_response(['success' => true, 'data' => $employees]);
