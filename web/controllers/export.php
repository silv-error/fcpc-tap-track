<?php

require_once __DIR__ . '/../config/session.php';
session_start();

require_once __DIR__ . '/../config/connection.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/auth_check.php';

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

// Read and validate input AFTER auth check
$exportType = $_POST['type'] ?? '';
$filters    = json_decode($_POST['filters'] ?? '{}', true) ?? [];

if (!$exportType || !in_array($exportType, ['students', 'employees', 'attendance'], true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid export type.']);
    exit;
}

function build_search_terms(string $search): array
{
    $search = strtolower(trim($search));
    if ($search === '') return [];

    $terms = [$search];

    // "EMP-101 — Garcia, Ricardo" → also try just "EMP-101"
    foreach ([' — ', ' - ', ' '] as $sep) {
        if (str_contains($search, $sep)) {
            $part = trim(explode($sep, $search, 2)[0]);
            if ($part !== '') $terms[] = $part;
            break;
        }
    }

    return array_values(array_unique(array_filter($terms)));
}

/**
 * Extract a clean identifier from the search string for use in the filename.
 * "EMP-101 — Garcia, Ricardo (IT Dept)" → "EMP-101"
 * "2024-0001 — Santos, Maria" → "2024-0001"
 * If nothing useful is found, returns 'all'.
 */
function extract_filename_identifier(string $search): string
{
    $search = trim($search);
    if ($search === '' || strtolower($search) === 'all') return 'all';

    // Take the part before the first separator
    foreach ([' — ', ' - '] as $sep) {
        if (str_contains($search, $sep)) {
            $search = trim(explode($sep, $search, 2)[0]);
            break;
        }
    }

    // Sanitize: keep alphanumeric, dash, underscore, dot
    $clean = preg_replace('/[^a-zA-Z0-9.\-_]+/', '-', $search);
    $clean = trim((string) $clean, '-._');

    return $clean !== '' ? strtolower($clean) : 'all';
}

function sanitize_filename_piece(?string $value, string $fallback = 'all'): string
{
    $value = trim((string) ($value ?? ''));
    if ($value === '') return $fallback;

    $value = strtolower($value);
    $value = preg_replace('/[^a-z0-9._-]+/', '-', $value);
    $value = trim((string) $value, '-._');

    return $value !== '' ? $value : $fallback;
}

function attendance_display_name(array $row): string
{
    if (!empty($row['s_first_name'])) {
        return trim((string) ($row['s_last_name'] . ', ' . $row['s_first_name']));
    }

    if (!empty($row['e_first_name'])) {
        return trim((string) ($row['e_last_name'] . ', ' . $row['e_first_name']));
    }

    return '';
}

function get_export_sort_value(string $exportType, array $row, string $sortKey): string
{
    $sortKey = strtolower(trim($sortKey));

    if ($exportType === 'students') {
        return match ($sortKey) {
            'student_number' => (string) ($row['student_number'] ?? ''),
            'department'     => (string) ($row['department'] ?? ''),
            'program'        => (string) ($row['program'] ?? ''),
            'year_level'     => (string) ($row['year_level'] ?? ''),
            default          => (string) ($row['last_name'] ?? ''),
        };
    }

    if ($exportType === 'employees') {
        return match ($sortKey) {
            'employee_number' => (string) ($row['employee_number'] ?? ''),
            'department'      => (string) ($row['department'] ?? ''),
            'position'        => (string) ($row['position'] ?? ''),
            default           => (string) ($row['last_name'] ?? ''),
        };
    }

    if ($exportType === 'attendance') {
        return match ($sortKey) {
            'reference_number' => (string) ($row['rfid_uid'] ?? ''),
            'name'             => attendance_display_name($row),
            'type'             => (string) ($row['record_type'] ?? ''),
            default            => trim((string) (($row['log_date'] ?? '') . ' ' . ($row['time_in'] ?? ''))),
        };
    }

    return '';
}

function sort_export_rows(array &$data, string $exportType, string $sortKey, string $sortOrder): void
{
    $sortOrder = strtolower(trim($sortOrder));
    if ($sortOrder !== 'desc') {
        $sortOrder = 'asc';
    }

    usort($data, function (array $left, array $right) use ($exportType, $sortKey, $sortOrder): int {
        $leftValue  = strtolower(get_export_sort_value($exportType, $left, $sortKey));
        $rightValue = strtolower(get_export_sort_value($exportType, $right, $sortKey));
        $cmp = strnatcasecmp($leftValue, $rightValue);

        return $sortOrder === 'desc' ? $cmp * -1 : $cmp;
    });
}

try {
    $data    = [];
    $headers = [];

    if ($exportType === 'students') {
        $sql = "
            SELECT id, student_number, rfid_uid, last_name, first_name, middle_name,
                   category, program, year_level, strand, department, created_at,
                   CASE
                       WHEN rfid_uid IS NOT NULL AND rfid_uid <> '' THEN 'Registered'
                       ELSE 'Unregistered'
                   END AS status
            FROM students
            ORDER BY last_name ASC, first_name ASC
        ";
        $data    = fetch_all_rows($con, $sql);
        
        // Determine which columns to export based on category
        $exportCategory = $filters['category'] ?? 'all';
        $includeStrand = $exportCategory === 'all' || $exportCategory === 'Basic Education';
        
        // Build headers based on category
        if ($includeStrand) {
            $headers = ['Student No.', 'RFID UID', 'Status', 'Student Name', 'Program', 'Year Level', 'Department', 'Strand'];
        } else {
            $headers = ['Student No.', 'RFID UID', 'Status', 'Student Name', 'Program', 'Year Level', 'Department'];
        }

        if (!empty($filters['search'])) {
            $searchTerms = build_search_terms((string) $filters['search']);
            $data = array_filter($data, function ($row) use ($searchTerms) {
                $fullName  = strtolower(trim($row['last_name'] . ', ' . $row['first_name'] . ' ' . ($row['middle_name'] ?? '')));
                $studentNo = strtolower((string) ($row['student_number'] ?? ''));
                $rfid      = strtolower((string) ($row['rfid_uid'] ?? ''));
                $status    = strtolower((string) ($row['status'] ?? ''));

                foreach ($searchTerms as $term) {
                    if (str_contains($fullName, $term) || str_contains($studentNo, $term) || str_contains($rfid, $term) || str_contains($status, $term)) {
                        return true;
                    }
                }
                return false;
            });
        }

        // Apply category filter
        if (!empty($exportCategory) && $exportCategory !== 'all') {
            $categoryLower = strtolower($exportCategory);
            $data = array_filter($data, fn($row) => strtolower($row['category'] ?? '') === $categoryLower);
        }

        // Apply category-specific filter rules
        if ($exportCategory === 'Basic Education') {
            // Department filter not applicable for Basic Education
            // But can still filter by Program, Year Level, and Strand if specified
        } elseif ($exportCategory === 'Tertiary' || $exportCategory === 'Graduate School') {
            // These categories use Department and Program, not Strand
        }

        if (!empty($filters['department']) && $filters['department'] !== 'all') {
            $dept = strtolower($filters['department']);
            $data = array_filter($data, fn($row) => strtolower($row['department']) === $dept);
        }

        if (!empty($filters['program']) && $filters['program'] !== 'all') {
            $program = strtolower($filters['program']);
            $data = array_filter($data, fn($row) => strtolower($row['program']) === $program);
        }

        if (!empty($filters['yearLevel']) && $filters['yearLevel'] !== 'all') {
            $yearLevel = strtolower($filters['yearLevel']);
            $data = array_filter($data, fn($row) => strtolower($row['year_level']) === $yearLevel);
        }

        if (!empty($filters['strand']) && $filters['strand'] !== 'all') {
            $strand = strtolower($filters['strand']);
            $data = array_filter($data, fn($row) => strtolower($row['strand'] ?? '') === $strand);
        }

        sort_export_rows($data, $exportType, (string) ($filters['primarySort'] ?? 'last_name'), (string) ($filters['sortOrder'] ?? 'asc'));

    } elseif ($exportType === 'employees') {
        $sql = "
            SELECT id, employee_number, rfid_uid, last_name, first_name, middle_name,
                   position, department, created_at,
                   CASE
                       WHEN rfid_uid IS NOT NULL AND rfid_uid <> '' THEN 'Registered'
                       ELSE 'Unregistered'
                   END AS status
            FROM employees
            ORDER BY last_name ASC, first_name ASC
        ";
        $data    = fetch_all_rows($con, $sql);
        $headers = ['Employee No.', 'RFID UID', 'Status', 'Employee Name', 'Position', 'Department'];

        if (!empty($filters['search'])) {
            $searchTerms = build_search_terms((string) $filters['search']);
            $data = array_filter($data, function ($row) use ($searchTerms) {
                $fullName = strtolower(trim($row['last_name'] . ', ' . $row['first_name'] . ' ' . ($row['middle_name'] ?? '')));
                $empNo    = strtolower((string) ($row['employee_number'] ?? ''));
                $rfid     = strtolower((string) ($row['rfid_uid'] ?? ''));
                $status   = strtolower((string) ($row['status'] ?? ''));

                foreach ($searchTerms as $term) {
                    if (str_contains($fullName, $term) || str_contains($empNo, $term) || str_contains($rfid, $term) || str_contains($status, $term)) {
                        return true;
                    }
                }
                return false;
            });
        }

        if (!empty($filters['department']) && $filters['department'] !== 'all') {
            $dept = strtolower($filters['department']);
            $data = array_filter($data, fn($row) => strtolower($row['department']) === $dept);
        }

        if (!empty($filters['position']) && $filters['position'] !== 'all') {
            $pos = strtolower($filters['position']);
            $data = array_filter($data, fn($row) => strtolower($row['position']) === $pos);
        }

        sort_export_rows($data, $exportType, (string) ($filters['primarySort'] ?? 'last_name'), (string) ($filters['sortOrder'] ?? 'asc'));

    } elseif ($exportType === 'attendance') {
        $sql = "
            SELECT
                a.id,
                COALESCE(NULLIF(TRIM(a.rfid_uid), ''), '-') AS rfid_uid,
                a.registration_status,
                a.log_date,
                a.time_in,
                a.time_out,
                a.status,
                CASE
                    WHEN s.id IS NOT NULL THEN 'Student'
                    WHEN e.id IS NOT NULL THEN 'Employee'
                    ELSE 'Unregistered'
                END AS record_type,
                s.student_number  AS s_reference_number,
                s.last_name       AS s_last_name,
                s.first_name      AS s_first_name,
                s.category        AS s_category,
                s.program         AS s_program,
                s.year_level      AS s_year_level,
                s.strand          AS s_strand,
                s.department      AS s_department,
                e.employee_number AS e_reference_number,
                e.last_name       AS e_last_name,
                e.first_name      AS e_first_name,
                e.department      AS e_department
            FROM attendance_logs a
            LEFT JOIN students  s ON UPPER(s.rfid_uid) = UPPER(a.rfid_uid)
            LEFT JOIN employees e ON UPPER(e.rfid_uid) = UPPER(a.rfid_uid)
            ORDER BY a.log_date DESC, a.time_in DESC
        ";

        $data    = fetch_all_rows($con, $sql);
        $headers = ['Date', 'RFID UID', 'Name', 'Status', 'Time In', 'Time Out'];

        if (!empty($filters['search'])) {
            $searchTerms = build_search_terms((string) $filters['search']);
            $data = array_filter($data, function ($row) use ($searchTerms) {
                $name = strtolower(attendance_display_name($row));
                $refNum = strtolower((string) ($row['rfid_uid'] ?? ''));
                $status = strtolower((string) ($row['registration_status'] ?? ''));
                $recordType = strtolower((string) ($row['record_type'] ?? ''));
                $logDate = strtolower((string) ($row['log_date'] ?? ''));

                foreach ($searchTerms as $term) {
                    if (str_contains($name, $term) || str_contains($refNum, $term) || str_contains($status, $term) || str_contains($recordType, $term) || str_contains($logDate, $term)) {
                        return true;
                    }
                }
                return false;
            });
        }

        if (!empty($filters['dateFrom'])) {
            $dateFrom = $filters['dateFrom'];
            $data = array_filter($data, fn($row) => $row['log_date'] >= $dateFrom);
        }

        if (!empty($filters['dateTo'])) {
            $dateTo = $filters['dateTo'];
            $data = array_filter($data, fn($row) => $row['log_date'] <= $dateTo);
        }

        $statusFilter = strtolower(trim((string) ($filters['status'] ?? 'all')));
        if ($statusFilter !== '' && $statusFilter !== 'all') {
            $data = array_filter($data, fn($row) => strtolower((string) ($row['registration_status'] ?? '')) === $statusFilter);
        }

        if (!empty($filters['userTypes']) && is_array($filters['userTypes'])) {
            $types = array_map('strtolower', $filters['userTypes']);
            if (!in_array('all', $types, true)) {
                $data = array_filter($data, fn($row) => in_array(strtolower((string) ($row['record_type'] ?? '')), $types, true));
            }
        }

        $departmentFilter = strtolower(trim((string) ($filters['department'] ?? 'all')));
        if ($departmentFilter !== '' && $departmentFilter !== 'all') {
            $data = array_filter($data, function ($row) use ($departmentFilter) {
                $recordType = strtolower((string) ($row['record_type'] ?? ''));

                if ($recordType === 'student') {
                    return strtolower((string) ($row['s_department'] ?? '')) === $departmentFilter;
                }

                if ($recordType === 'employee') {
                    return strtolower((string) ($row['e_department'] ?? '')) === $departmentFilter;
                }

                return true;
            });
        }

        $categoryFilter = strtolower(trim((string) ($filters['category'] ?? 'all')));
        if ($categoryFilter !== '' && $categoryFilter !== 'all') {
            $data = array_filter($data, fn($row) => strtolower((string) ($row['record_type'] ?? '')) !== 'student' || strtolower((string) ($row['s_category'] ?? '')) === $categoryFilter);
        }

        $programFilter = strtolower(trim((string) ($filters['program'] ?? 'all')));
        if ($programFilter !== '' && $programFilter !== 'all') {
            $data = array_filter($data, fn($row) => strtolower((string) ($row['record_type'] ?? '')) !== 'student' || strtolower((string) ($row['s_program'] ?? '')) === $programFilter);
        }

        $yearLevelFilter = strtolower(trim((string) ($filters['yearLevel'] ?? 'all')));
        if ($yearLevelFilter !== '' && $yearLevelFilter !== 'all') {
            $data = array_filter($data, fn($row) => strtolower((string) ($row['record_type'] ?? '')) !== 'student' || strtolower((string) ($row['s_year_level'] ?? '')) === $yearLevelFilter);
        }

        $strandFilter = strtolower(trim((string) ($filters['strand'] ?? 'all')));
        if ($strandFilter !== '' && $strandFilter !== 'all') {
            $data = array_filter($data, fn($row) => strtolower((string) ($row['record_type'] ?? '')) !== 'student' || strtolower((string) ($row['s_strand'] ?? '')) === $strandFilter);
        }

        sort_export_rows($data, $exportType, (string) ($filters['primarySort'] ?? 'log_date'), (string) ($filters['sortOrder'] ?? 'desc'));
    }

    $data = array_values($data);

    // ── Build filename ────────────────────────────────────────────────────────
    $datePart   = date('Ymd');
    $searchRaw  = trim((string) ($filters['search'] ?? ''));
    $identifier = extract_filename_identifier($searchRaw);

    if ($exportType === 'students') {
        $fileName = "student-{$identifier}-{$datePart}.xlsx";
    } elseif ($exportType === 'employees') {
        $fileName = "employee-{$identifier}-{$datePart}.xlsx";
    } else {
        // Attendance: build context from identifier + type + date range
        $contextParts = [];

        if ($identifier !== 'all') {
            $contextParts[] = $identifier;
        }

        if (!empty($filters['userTypes']) && is_array($filters['userTypes'])) {
            $types = array_filter(array_map('strtolower', $filters['userTypes']), fn($t) => $t !== 'all' && $t !== '');
            $types = array_values(array_unique($types));
            if (count($types) === 1) {
                $contextParts[] = sanitize_filename_piece($types[0]);
            }
        }

        $dateFrom = trim((string) ($filters['dateFrom'] ?? ''));
        $dateTo   = trim((string) ($filters['dateTo']   ?? ''));
        if ($dateFrom !== '' || $dateTo !== '') {
            $rangeLabel     = ($dateFrom !== '' && $dateTo !== '')
                ? "{$dateFrom}-to-{$dateTo}"
                : ($dateFrom !== '' ? $dateFrom : $dateTo);
            $contextParts[] = sanitize_filename_piece($rangeLabel);
        }

        if (empty($contextParts)) {
            $contextParts[] = 'all';
        }

        $fileName = 'attendance-' . implode('-', $contextParts) . "-{$datePart}.xlsx";
    }

    // ── Build spreadsheet ─────────────────────────────────────────────────────
    $spreadsheet = new Spreadsheet();
    $sheet       = $spreadsheet->getActiveSheet();

    $titleLabel = match ($exportType) {
        'students'   => 'Student',
        'employees'  => 'Employee',
        'attendance' => 'Attendance',
        default      => 'Record',
    };

    $generatedDate = date('m/d/Y H:i');
    $lastCol       = chr(64 + count($headers));
    $row           = 1;

    // ── School name ───────────────────────────────────────────────────────────
    $sheet->setCellValue("A{$row}", 'FIRST CITY PROVIDENTIAL COLLEGE');
    $sheet->mergeCells("A{$row}:{$lastCol}{$row}");
    $sheet->getStyle("A{$row}")->getFont()->setBold(true)->setSize(14);
    $sheet->getStyle("A{$row}")->getAlignment()
          ->setHorizontal(Alignment::HORIZONTAL_CENTER)
          ->setVertical(Alignment::VERTICAL_CENTER);
    $sheet->getRowDimension($row)->setRowHeight(20);
    $row++;

    // ── Address ───────────────────────────────────────────────────────────────
    $sheet->setCellValue("A{$row}", 'Blk 7 Phase F, Francisco Homes, Narra, SJDM, 3023 Bulacan.');
    $sheet->mergeCells("A{$row}:{$lastCol}{$row}");
    $sheet->getStyle("A{$row}")->getFont()->setSize(11);
    $sheet->getStyle("A{$row}")->getAlignment()
          ->setHorizontal(Alignment::HORIZONTAL_CENTER)
          ->setVertical(Alignment::VERTICAL_CENTER);
    $sheet->getRowDimension($row)->setRowHeight(15);
    $row++;

    $row++; // blank

    // ── Title ─────────────────────────────────────────────────────────────────
    $sheet->setCellValue("A{$row}", "{$titleLabel} Records");
    $sheet->mergeCells("A{$row}:{$lastCol}{$row}");
    $sheet->getStyle("A{$row}")->getFont()->setBold(true)->setSize(12);
    $sheet->getStyle("A{$row}")->getAlignment()
          ->setHorizontal(Alignment::HORIZONTAL_CENTER)
          ->setVertical(Alignment::VERTICAL_CENTER);
    $sheet->getRowDimension($row)->setRowHeight(18);
    $row++;

    // ── Generated date ────────────────────────────────────────────────────────
    $sheet->setCellValue("A{$row}", "Generated On: {$generatedDate}");
    $sheet->mergeCells("A{$row}:{$lastCol}{$row}");
    $sheet->getStyle("A{$row}")->getFont()->setSize(11)->setItalic(true);
    $sheet->getStyle("A{$row}")->getAlignment()
          ->setHorizontal(Alignment::HORIZONTAL_CENTER)
          ->setVertical(Alignment::VERTICAL_CENTER);
    $sheet->getRowDimension($row)->setRowHeight(15);
    $row++;

    $row++; // blank

    // ── Table headers ─────────────────────────────────────────────────────────
    $headerRow = $row;
    foreach ($headers as $col => $header) {
        $colLetter = chr(65 + $col);
        $sheet->setCellValue("{$colLetter}{$row}", $header);

        $style = $sheet->getStyle("{$colLetter}{$row}");
        $style->getFont()->setBold(true)->setSize(11)->getColor()->setRGB('FFFFFF');
        $style->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('1F0063');
        $style->getAlignment()
              ->setHorizontal(Alignment::HORIZONTAL_CENTER)
              ->setVertical(Alignment::VERTICAL_CENTER)
              ->setWrapText(true);
        $style->getBorders()->getAllBorders()
              ->setBorderStyle(Border::BORDER_THIN)
              ->getColor()->setRGB('000000');
    }
    $sheet->getRowDimension($headerRow)->setRowHeight(20);
    $row++;

    // ── Data rows ─────────────────────────────────────────────────────────────
    foreach ($data as $dataIndex => $record) {
        $isEvenRow = $dataIndex % 2 === 0;

        if ($exportType === 'students') {
            $name    = trim($record['last_name'] . ', ' . $record['first_name'] . ' ' . ($record['middle_name'] ?? ''));
            $status  = $record['status'] ?: 'Unregistered';
            $exportCategory = $filters['category'] ?? 'all';
            $includeStrand = $exportCategory === 'all' || $exportCategory === 'Basic Education';
            
            if ($includeStrand) {
                $rowData = [
                    $record['student_number'],
                    $record['rfid_uid'] ?: '-',
                    $status,
                    $name,
                    $record['program'] ?: '-',
                    $record['year_level'] ?: '-',
                    $record['department'] ?: '-',
                    $record['strand'] ?: '-',
                ];
            } else {
                $rowData = [
                    $record['student_number'],
                    $record['rfid_uid'] ?: '-',
                    $status,
                    $name,
                    $record['program'] ?: '-',
                    $record['year_level'] ?: '-',
                    $record['department'] ?: '-',
                ];
            }
        } elseif ($exportType === 'employees') {
            $name    = trim($record['last_name'] . ', ' . $record['first_name'] . ' ' . ($record['middle_name'] ?? ''));
            $rowData = [
                $record['employee_number'],
                $record['rfid_uid'] ?: '-',
                $record['status'] ?: 'Unregistered',
                $name,
                $record['position'],
                $record['department'],
            ];
        } else {
            $name   = '';
            $refNum = $record['rfid_uid'] ?: '-';
            if (!empty($record['s_first_name'])) {
                $name   = trim($record['s_last_name'] . ', ' . $record['s_first_name']);
            } elseif (!empty($record['e_first_name'])) {
                $name   = trim($record['e_last_name'] . ', ' . $record['e_first_name']);
            }

            $timeIn  = $record['time_in']  ? substr($record['time_in'],  0, 5) : '-';
            $timeOut = $record['time_out'] ? substr($record['time_out'], 0, 5) : '-';

            $rowData = [
                $record['log_date'],
                $refNum,
                $name,
                ucfirst(strtolower((string) ($record['registration_status'] ?? 'Unregistered'))),
                $timeIn,
                $timeOut,
            ];
        }

        foreach ($rowData as $col => $value) {
            $colLetter = chr(65 + $col);
            $sheet->setCellValue("{$colLetter}{$row}", $value ?? '-');

            $cellStyle = $sheet->getStyle("{$colLetter}{$row}");
            if ($isEvenRow) {
                $cellStyle->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('F0F0F0');
            }
            $cellStyle->getAlignment()
                      ->setHorizontal(Alignment::HORIZONTAL_LEFT)
                      ->setVertical(Alignment::VERTICAL_CENTER);
            $cellStyle->getBorders()->getAllBorders()
                      ->setBorderStyle(Border::BORDER_THIN)
                      ->getColor()->setRGB('C0C0C0');
        }

        $sheet->getRowDimension($row)->setRowHeight(16);
        $row++;
    }

    // ── Column widths ─────────────────────────────────────────────────────────
    $columnWidths = match ($exportType) {
        'students'   => [18, 18, 16, 30, 68, 14, 30, 50],
        'employees'  => [18, 18, 18, 30, 18, 30],
        'attendance' => [14, 14, 25, 18, 12, 12],
        default      => [12],
    };

    foreach ($columnWidths as $col => $width) {
        $sheet->getColumnDimension(chr(65 + $col))->setWidth($width);
    }

    // ── Output ────────────────────────────────────────────────────────────────
    $writer = new Xlsx($spreadsheet);

    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header("Content-Disposition: attachment; filename=\"{$fileName}\"");
    header('Cache-Control: max-age=0');

    $writer->save('php://output');
    exit;

} catch (Exception $e) {
    error_log('Export failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Export failed. Please try again.']);
    exit;
}