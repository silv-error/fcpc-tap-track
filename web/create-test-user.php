<?php
require_once 'config/connection.php';

$hash = password_hash('admin123', PASSWORD_BCRYPT);
$username = 'spadmin';
$firstName = 'Test';
$lastName = 'SPadmin';
$email = 'spadmin@fcpc.edu.ph';
$role = 'Superadmin';
$isActive = 1;

$stmt = mysqli_prepare($con, "
    INSERT INTO users (employee_id, username, first_name, last_name, email, role, password_hash, is_active, created_at, updated_at)
    VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
");

if ($stmt) {
    mysqli_stmt_bind_param($stmt, 'ssssssi', $username, $firstName, $lastName, $email, $role, $hash, $isActive);
    mysqli_stmt_execute($stmt);
    mysqli_stmt_close($stmt);
}

echo mysqli_affected_rows($con) ? 'User created.' : mysqli_error($con); 