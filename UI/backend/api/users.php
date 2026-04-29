<?php

require_once __DIR__ . '/../../connection.php';
require_once __DIR__ . '/helpers.php';

$sql = "
    SELECT
        id,
        username,
        last_name,
        first_name,
        middle_name,
        suffix,
        email,
        role,
        is_active,
        created_at,
        updated_at
    FROM users
    ORDER BY last_name ASC, first_name ASC, username ASC
";

$users = fetch_all_rows($con, $sql);

json_response([
    'success' => true,
    'data'    => array_map(static function (array $user): array {
        return [
            'id'         => (int) $user['id'],
            'username'   => $user['username'],
            'name'       => format_display_name(
                $user['last_name'],
                $user['first_name'],
                $user['middle_name'],
                $user['suffix'],
            ),
            'email'      => $user['email'],
            'role'       => $user['role'],
            'is_active'  => (bool) $user['is_active'],
            'created_at' => $user['created_at'],
            'updated_at' => $user['updated_at'],
        ];
    }, $users),
]);