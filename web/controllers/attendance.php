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
        -- Prefer rfid_uid stored in attendance_logs; fallback to student/employee record or buffer
        COALESCE(a.rfid_uid, s1.rfid_uid, s2.rfid_uid, e1.rfid_uid, e2.rfid_uid, b.rfid_uid) AS rfid_uid,
        -- registration_status stored on attendance_logs takes precedence; otherwise infer from joins/buffer
        COALESCE(a.registration_status, CASE WHEN s1.id IS NOT NULL OR s2.id IS NOT NULL OR e1.id IS NOT NULL OR e2.id IS NOT NULL OR b.is_used = 1 THEN 'registered' ELSE 'unregistered' END) AS registration_status,
        a.log_date,
        a.time_in,
        a.time_out,
        a.status,
        a.created_at,
        a.updated_at,
        -- Determine person by student_id/employee_id first, then by rfid_uid lookup
        CASE
            WHEN s1.id IS NOT NULL OR s2.id IS NOT NULL THEN 'Student'
            WHEN e1.id IS NOT NULL OR e2.id IS NOT NULL THEN 'Employee'
            ELSE 'Unknown'
        END AS record_type,

        -- Student fields (prefer join by id s1, fallback to s2 matched by rfid)
        COALESCE(s1.student_number, s2.student_number) AS s_reference_number,
        COALESCE(s1.last_name, s2.last_name)       AS s_last_name,
        COALESCE(s1.first_name, s2.first_name)     AS s_first_name,
        COALESCE(s1.middle_name, s2.middle_name)   AS s_middle_name,
        COALESCE(s1.suffix, s2.suffix)             AS s_suffix,
        COALESCE(s1.department, s2.department)     AS s_department,

        -- Employee fields (prefer join by id e1, fallback to e2 matched by rfid)
        COALESCE(e1.employee_number, e2.employee_number) AS e_reference_number,
        COALESCE(e1.last_name, e2.last_name)             AS e_last_name,
        COALESCE(e1.first_name, e2.first_name)           AS e_first_name,
        COALESCE(e1.middle_name, e2.middle_name)         AS e_middle_name,
        COALESCE(e1.suffix, e2.suffix)                   AS e_suffix,
        COALESCE(e1.department, e2.department)           AS e_department

    FROM attendance_logs a
    -- join by explicit student_id/employee_id when available
    LEFT JOIN students  s1 ON s1.id = a.student_id
    LEFT JOIN employees e1 ON e1.id = a.employee_id
    -- fallback joins by RFID UID stored on attendance_logs
    LEFT JOIN students  s2 ON UPPER(s2.rfid_uid) = UPPER(a.rfid_uid)
    LEFT JOIN employees e2 ON UPPER(e2.rfid_uid) = UPPER(a.rfid_uid)
    -- buffer lookup to capture raw scanned UID and is_used flag
    LEFT JOIN rfid_uid_buffer b ON UPPER(b.rfid_uid) = UPPER(a.rfid_uid)
    ORDER BY a.log_date DESC, a.time_in DESC, a.id DESC
";

$logs = fetch_all_rows($con, $sql);

json_response([
    'success' => true,
    'data'    => array_map(static function (array $log): array {
        $rfidUid = trim((string) ($log['rfid_uid'] ?? ''));

        return [
            'id'               => (int) $log['id'],
            'rfid_uid'         => $rfidUid !== '' ? $rfidUid : '-',
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