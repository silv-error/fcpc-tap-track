<?php

function json_response(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function format_middle_initial(?string $middleName): string
{
    $middleName = trim((string) $middleName);

    if ($middleName === '') {
        return '';
    }

    return strtoupper(substr($middleName, 0, 1)) . '.';
}

function format_display_name(string $lastName, string $firstName, ?string $middleName = null, ?string $suffix = null): string
{
    $parts = [$lastName . ',', $firstName];

    $middleInitial = format_middle_initial($middleName);
    if ($middleInitial !== '') {
        $parts[] = $middleInitial;
    }

    $displayName = trim(implode(' ', $parts));
    $suffix = trim((string) $suffix);

    if ($suffix !== '') {
        $displayName .= ' ' . $suffix;
    }

    return $displayName;
}

function fetch_all_rows(mysqli $con, string $sql): array
{
    $result = mysqli_query($con, $sql);

    if (!$result) {
        json_response([
            'success' => false,
            'message' => mysqli_error($con),
            'data' => [],
        ], 500);
    }

    $rows = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $rows[] = $row;
    }

    return $rows;
}
