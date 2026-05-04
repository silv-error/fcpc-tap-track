<?php
require_once 'config/connection.php';

$hash = password_hash('admin123', PASSWORD_BCRYPT);
$hash = mysqli_real_escape_string($con, $hash);

mysqli_query($con, "
    INSERT INTO users (employee_id, username, first_name, last_name, email, role, password_hash, is_active, created_at, updated_at)
    VALUES (NULL, 'spadmin', 'Test', 'SPadmin', 'spadmin@fcpc.edu.ph', 'Superadmin', '{$hash}', 1, NOW(), NOW())
");

echo mysqli_affected_rows($con) ? 'User created.' : mysqli_error($con); 