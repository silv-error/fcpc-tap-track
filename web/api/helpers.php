<?php

// ── Python UI log notifier ────────────────────────────────────────────────────
// Sends a fire-and-forget POST to the local Python HTTP log listener so that
// every API response appears in the Tkinter HTTP Request Log panel.
// If Python is not running the call silently fails (timeout = 100 ms).

define('PYTHON_LOG_RECEIVER', 'http://127.0.0.1:5678/http-log');

// Files that must never report themselves (would cause an infinite loop).
define('LOG_EXCLUDED_SCRIPTS', ['http_log_receiver.php']);

function _notify_python_ui(int $statusCode, array $payload): void
{
    // Use PHP_SELF (the actual script being executed) rather than REQUEST_URI
    // (which includes the full subpath prefix like /rfid-attendance-system/web/).
    $script = basename($_SERVER['PHP_SELF'] ?? $_SERVER['SCRIPT_FILENAME'] ?? '');
    if (in_array($script, LOG_EXCLUDED_SCRIPTS, true)) {
        return;
    }

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    // Use just the filename (e.g. students.php) so the log is clean regardless
    // of how deep the XAMPP subfolder is. Append ?action= when present.
    $action   = $_GET['action'] ?? $_POST['action'] ?? '';
    $endpoint = $action !== '' ? "{$script}?action={$action}" : $script;

    // Logged-in user from session (set by auth_check.php).
    $userId   = $_SESSION['user_id']   ?? null;
    $username = $_SESSION['username']  ?? null;

    $userLabel = '-';
    if ($userId !== null) {
        $userLabel = $username !== null
            ? "{$username} (ID: {$userId})"
            : "ID: {$userId}";
    }

    // Build a short human-readable detail from the response payload.
    $detail = '';
    if (isset($payload['message'])) {
        $detail = (string) $payload['message'];
    } elseif (isset($payload['success'])) {
        $detail = $payload['success'] ? 'OK' : 'Failed';
    }

    $body = json_encode([
        'method'   => $method,
        'endpoint' => $endpoint,
        'status'   => $statusCode,
        'user'     => $userLabel,
        'detail'   => mb_substr($detail, 0, 120),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $ch = curl_init(PYTHON_LOG_RECEIVER);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT_MS     => 100,   // never slow down the real response
        CURLOPT_CONNECTTIMEOUT_MS => 80,
        CURLOPT_NOSIGNAL       => 1,     // required for sub-second timeouts
    ]);
    curl_exec($ch);
    curl_close($ch);
}

// ── Core response helper ──────────────────────────────────────────────────────

function json_response(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    // Notify Python UI — runs after the response body is queued, before exit.
    _notify_python_ui($statusCode, $payload);

    exit;
}

// ── Name / display helpers ────────────────────────────────────────────────────

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
    foreach (['s', 'e'] as $prefix) {
        $last  = trim((string) ($row["{$prefix}_last_name"]  ?? ''));
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
        error_log('fetch_all_rows failed: ' . mysqli_error($con));
        json_response([
            'success' => false,
            'message' => 'A database error occurred.',
            'data'    => [],
        ], 500);
    }

    $rows = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $rows[] = $row;
    }

    return $rows;
}

/**
 * Executes a prepared statement and returns all rows as an associative array.
 *
 * @param mysqli  $con    Database connection
 * @param string  $types  bind_param type string (e.g. 'si', 'ss')
 * @param mixed   ...$params  Values to bind, in placeholder order
 */
function fetch_all_rows_prepared(mysqli $con, string $sql, string $types, mixed ...$params): array
{
    $stmt = mysqli_prepare($con, $sql);

    if (!$stmt) {
        error_log('Prepare failed: ' . mysqli_error($con));
        json_response(['success' => false, 'message' => 'A database error occurred.', 'data' => []], 500);
    }

    if ($types !== '' && $params !== []) {
        mysqli_stmt_bind_param($stmt, $types, ...$params);
    }

    if (!mysqli_stmt_execute($stmt)) {
        error_log('Execute failed: ' . mysqli_stmt_error($stmt));
        json_response(['success' => false, 'message' => 'A database error occurred.', 'data' => []], 500);
    }

    $result = mysqli_stmt_get_result($stmt);
    $rows   = [];

    while ($row = mysqli_fetch_assoc($result)) {
        $rows[] = $row;
    }

    mysqli_stmt_close($stmt);

    return $rows;
}