<?php

header('Content-Type: application/json');

$host = "localhost";
$username = "root";
$password = "";
$database = "rfid_attendance";

$conn = new mysqli($host, $username, $password, $database);

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed."
    ]);
    exit;
}

$conn->set_charset("utf8mb4");

$conn->begin_transaction();

try {
    $select = $conn->prepare("
        SELECT id, rfid_uid
        FROM rfid_uid_buffer
        WHERE is_used = 0
        ORDER BY id DESC
        LIMIT 1
    ");

    if (!$select) {
        throw new Exception('Prepare failed.');
    }

    $select->execute();
    $result = $select->get_result();

    if (!$result || $result->num_rows === 0) {
        $select->close();
        $conn->commit();

        echo json_encode([
            "success" => false,
            "message" => "No RFID UID found."
        ]);
        exit;
    }

    $row = $result->fetch_assoc();
    $select->close();

    $update = $conn->prepare("
        UPDATE rfid_uid_buffer
        SET is_used = 1
        WHERE id = ?
    ");

    $update->bind_param("i", $row["id"]);
    $update->execute();

    $conn->commit();

    echo json_encode([
        "success" => true,
        "rfid_uid" => $row["rfid_uid"]
    ]);
} catch (Exception $e) {
    $conn->rollback();

    echo json_encode([
        "success" => false,
        "message" => "Failed to get RFID UID."
    ]);
}

$conn->close();

?>