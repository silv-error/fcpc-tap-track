<?php

require_once __DIR__ . '/../../connection.php';
require_once __DIR__ . '/helpers.php';

$sql = "
    SELECT
        id,
        student_number,
        last_name,
        first_name,
        middle_name,
        suffix,
        course,
        year_level,
        department,
        rfid_uid,
        is_active,
        created_at,
        updated_at
    FROM students
    ORDER BY last_name ASC, first_name ASC, student_number ASC
";

$students = fetch_all_rows($con, $sql);

$data = array_map(static function (array $student): array {
    return [
        'id' => (int) $student['id'],
        'student_number' => $student['student_number'],
        'rfid_uid' => $student['rfid_uid'],
        'last_name' => $student['last_name'],
        'first_name' => $student['first_name'],
        'middle_name' => $student['middle_name'],
        'name' => format_display_name(
            $student['last_name'],
            $student['first_name'],
            $student['middle_name'],
            $student['suffix']
        ),
        'course' => $student['course'] ?: '-',
        'year_level' => $student['year_level'] ?: '-',
        'department' => $student['department'] ?: '-',
        'is_active' => (bool) $student['is_active'],
        'created_at' => $student['created_at'],
        'updated_at' => $student['updated_at'],
    ];
}, $students);

json_response([
    'success' => true,
    'data' => $data,
]);
