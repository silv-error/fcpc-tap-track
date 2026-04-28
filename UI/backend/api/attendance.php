<?php

require_once __DIR__ . '/../../connection.php';
require_once __DIR__ . '/helpers.php';

$sql = "
    SELECT
        a.id,
        a.student_id,
        a.employee_id,
        a.log_date,
        a.time_in,
        a.time_out,
        a.status,
        a.created_at,
        a.updated_at,
        CASE
            WHEN a.student_id IS NOT NULL THEN 'Student'
            WHEN a.employee_id IS NOT NULL THEN 'Employee'
            ELSE 'Unknown'
        END AS record_type,
        COALESCE(s.student_number, e.employee_number, '-') AS reference_number,
        COALESCE(
            CONCAT(s.last_name, ', ', s.first_name, IFNULL(CONCAT(' ', LEFT(s.middle_name, 1), '.'), ''), IFNULL(CONCAT(' ', s.suffix), '')),
            CONCAT(e.last_name, ', ', e.first_name, IFNULL(CONCAT(' ', LEFT(e.middle_name, 1), '.'), ''), IFNULL(CONCAT(' ', e.suffix), '')),
            '-'
        ) AS display_name,
        COALESCE(s.department, e.department, '-') AS department
    FROM attendance_logs a
    LEFT JOIN students s ON s.id = a.student_id
    LEFT JOIN employees e ON e.id = a.employee_id
    ORDER BY a.log_date DESC, a.time_in DESC, a.id DESC
";

$logs = fetch_all_rows($con, $sql);

json_response([
    'success' => true,
    'data' => array_map(static function (array $log): array {
        return [
            'id' => (int) $log['id'],
            'record_type' => $log['record_type'],
            'reference_number' => $log['reference_number'],
            'name' => $log['display_name'],
            'department' => $log['department'],
            'log_date' => $log['log_date'],
            'time_in' => $log['time_in'],
            'time_out' => $log['time_out'] ?: '-',
            'status' => $log['status'],
            'created_at' => $log['created_at'],
            'updated_at' => $log['updated_at'],
        ];
    }, $logs),
]);
