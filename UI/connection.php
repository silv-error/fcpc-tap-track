<?php
$host = "localhost";
$user = "root";
$pass = "";
$db   = "rfid_attendance";

$con = mysqli_connect($host, $user, $pass, $db);

// Better error handling
if (!$con) {
    die("Database connection failed: " . mysqli_connect_error());
}

mysqli_set_charset($con, 'utf8mb4');
?>
