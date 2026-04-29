<?php

require_once __DIR__ . '/../../connection.php';
require_once __DIR__ . '/helpers.php';

$sql = "
    SELECT
        id,
        employee_number,
        last_name,
        first_name,
        middle_name,
        suffix,
        department,
        position,
        rfid_uid,
        is_active,
        created_at,
        updated_at
    FROM employees
    ORDER BY last_name ASC, first_name ASC, employee_number ASC
";

$employees = fetch_all_rows($con, $sql);

json_response([
    'success' => true,
    'data'    => array_map(static function (array $employee): array {
        return [
            'id'              => (int) $employee['id'],
            'employee_number' => $employee['employee_number'],
            'rfid_uid'        => $employee['rfid_uid'] ?: '-',
            'name'            => format_display_name(
                $employee['last_name'],
                $employee['first_name'],
                $employee['middle_name'],
                $employee['suffix'],
            ),
            'position'        => $employee['position']   ?: '-',
            'department'      => $employee['department']  ?: '-',
            'is_active'       => (bool) $employee['is_active'],
            'created_at'      => $employee['created_at'],
            'updated_at'      => $employee['updated_at'],
        ];
    }, $employees),
]);