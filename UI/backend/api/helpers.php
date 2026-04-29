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
    $suffix      = trim((string) $suffix);

    if ($suffix !== '') {
        $displayName .= ' ' . $suffix;
    }

    return $displayName;
}

/**
 * Resolves the display name for an attendance log row.
 *
 * Accepts the flat row returned by the JOIN query and builds the name entirely
 * in PHP so the SQL stays DB-agnostic (works with both MySQL and SQLite).
 *
 * Expected row keys (nullable):
 *   s_last_name, s_first_name, s_middle_name, s_suffix   – from students
 *   e_last_name, e_first_name, e_middle_name, e_suffix   – from employees
 */
function resolve_display_name(array $row): string
{
    // Prefer student, fall back to employee, fall back to placeholder
    foreach (['s', 'e'] as $prefix) {
        $last = trim((string) ($row["{$prefix}_last_name"]  ?? ''));
        $first = trim((string) ($row["{$prefix}_first_name"] ?? ''));

        if ($last !== '' && $first !== '') {
            return format_display_name(
                $last,
                $first,
                $row["{$prefix}_middle_name"] ?? null,
                $row["{$prefix}_suffix"]      ?? null,
            );
        }
    }

    return '-';
}

/**
 * Resolves the reference number (student_number / employee_number) for a log row.
 */
function resolve_reference_number(array $row): string
{
    return trim((string) ($row['s_reference_number'] ?? ''))
        ?: trim((string) ($row['e_reference_number'] ?? ''))
        ?: '-';
}

/**
 * Resolves the department for a log row.
 */
function resolve_department(array $row): string
{
    return trim((string) ($row['s_department'] ?? ''))
        ?: trim((string) ($row['e_department'] ?? ''))
        ?: '-';
}

function fetch_all_rows(mysqli $con, string $sql): array
{
    $result = mysqli_query($con, $sql);

    if (!$result) {
        json_response([
            'success' => false,
            'message' => mysqli_error($con),
            'data'    => [],
        ], 500);
    }

    $rows = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $rows[] = $row;
    }

    return $rows;
}