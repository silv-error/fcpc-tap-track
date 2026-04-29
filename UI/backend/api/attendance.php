<?php

require_once __DIR__ . '/../../connection.php';
require_once __DIR__ . '/helpers.php';

// All name/department formatting is intentionally left to PHP (see helpers.php)
// so the query stays DB-agnostic and works identically with MySQL and SQLite.
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
            WHEN a.student_id  IS NOT NULL THEN 'Student'
            WHEN a.employee_id IS NOT NULL THEN 'Employee'
            ELSE 'Unknown'
        END AS record_type,

        s.student_number  AS s_reference_number,
        s.last_name       AS s_last_name,
        s.first_name      AS s_first_name,
        s.middle_name     AS s_middle_name,
        s.suffix          AS s_suffix,
        s.department      AS s_department,

        e.employee_number AS e_reference_number,
        e.last_name       AS e_last_name,
        e.first_name      AS e_first_name,
        e.middle_name     AS e_middle_name,
        e.suffix          AS e_suffix,
        e.department      AS e_department

    FROM attendance_logs a
    LEFT JOIN students  s ON s.id = a.student_id
    LEFT JOIN employees e ON e.id = a.employee_id
    ORDER BY a.log_date DESC, a.time_in DESC, a.id DESC
";

$logs = fetch_all_rows($con, $sql);

json_response([
    'success' => true,
    'data'    => array_map(static function (array $log): array {
        return [
            'id'               => (int) $log['id'],
            'record_type'      => $log['record_type'],
            'reference_number' => resolve_reference_number($log),
            'name'             => resolve_display_name($log),
            'department'       => resolve_department($log),
            'log_date'         => $log['log_date'],
            'time_in'          => $log['time_in'],
            'time_out'         => $log['time_out'] ?: '-',
            'status'           => $log['status'],
            'created_at'       => $log['created_at'],
            'updated_at'       => $log['updated_at'],
        ];
    }, $logs),
]);