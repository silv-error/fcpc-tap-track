<?php

require_once __DIR__ . '/../config/session.php';
session_start();

require_once __DIR__ . '/../config/connection.php'; 
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth_check.php';

// All name/department formatting is intentionally left to PHP (see helpers.php)
// so the query stays DB-agnostic
$sql = "
    SELECT
        a.id,
        a.rfid_uid,
        a.registration_status,
        a.log_date,
        a.time_in,
        a.time_out,
        a.status,
        a.created_at,
        a.updated_at,

        CASE
            WHEN s.id IS NOT NULL THEN 'Student'
            WHEN e.id IS NOT NULL THEN 'Employee'
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
    LEFT JOIN students  s ON UPPER(s.rfid_uid) = UPPER(a.rfid_uid)
    LEFT JOIN employees e ON UPPER(e.rfid_uid) = UPPER(a.rfid_uid)
    ORDER BY a.log_date DESC, a.time_in DESC, a.id DESC
";

$logs = fetch_all_rows($con, $sql);

json_response([
    'success' => true,
    'data'    => array_map(static function (array $log): array {
        $rfid = trim((string) ($log['rfid_uid'] ?? ''));

        return [
            'id'               => (int) $log['id'],
            'rfid_uid'         => $rfid !== '' ? $rfid : '-',
            'record_type'      => $log['record_type'],
            'reference_number' => resolve_reference_number($log),
            'name'             => resolve_display_name($log),
            'department'       => resolve_department($log),
            'log_date'         => $log['log_date'],
            'time_in'          => $log['time_in'],
            'time_out'         => $log['time_out'] ?: '-',
            'status'           => $log['status'],
            'registration_status' => resolve_registration_status($log),
            'created_at'       => $log['created_at'],
            'updated_at'       => $log['updated_at'],
        ];
    }, $logs),
]);