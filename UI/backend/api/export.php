<?php

require_once __DIR__ . '/../../connection.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/../../../vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Color;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

$exportType = $_POST['type'] ?? '';
$filters = json_decode($_POST['filters'] ?? '{}', true);

if (!$exportType || !in_array($exportType, ['students', 'employees', 'attendance'], true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid export type.']);
    exit;
}

try {
    $data = [];
    $headers = [];

    if ($exportType === 'students') {
        $sql = "SELECT id, student_number, rfid_uid, last_name, first_name, middle_name, course, year_level, department, created_at FROM students ORDER BY last_name ASC, first_name ASC";
        $data = fetch_all_rows($con, $sql);
        $headers = ['Student No.', 'RFID UID', 'Name', 'Course', 'Year Level', 'Department'];

        if (!empty($filters['search'])) {
            $search = strtolower($filters['search']);
            $data = array_filter($data, function ($row) use ($search) {
                $fullName = strtolower(trim($row['last_name'] . ', ' . $row['first_name'] . ' ' . ($row['middle_name'] ?? '')));
                $studentNo = strtolower($row['student_number']);
                return strpos($fullName, $search) !== false || strpos($studentNo, $search) !== false;
            });
        }

        if (!empty($filters['department']) && $filters['department'] !== 'all') {
            $dept = strtolower($filters['department']);
            $data = array_filter($data, function ($row) use ($dept) {
                return strtolower($row['department']) === $dept;
            });
        }

        if (!empty($filters['course']) && $filters['course'] !== 'all') {
            $course = strtolower($filters['course']);
            $data = array_filter($data, function ($row) use ($course) {
                return strtolower($row['course']) === $course;
            });
        }

        if (!empty($filters['yearLevels']) && is_array($filters['yearLevels'])) {
            $levels = array_map('strtolower', $filters['yearLevels']);
            $data = array_filter($data, function ($row) use ($levels) {
                return in_array(strtolower($row['year_level']), $levels, true);
            });
        }

    } elseif ($exportType === 'employees') {
        $sql = "SELECT id, employee_number, rfid_uid, last_name, first_name, middle_name, position, department, created_at FROM employees ORDER BY last_name ASC, first_name ASC";
        $data = fetch_all_rows($con, $sql);
        $headers = ['Employee No.', 'RFID UID', 'Name', 'Position', 'Department'];

        if (!empty($filters['search'])) {
            $search = strtolower($filters['search']);
            $data = array_filter($data, function ($row) use ($search) {
                $fullName = strtolower(trim($row['last_name'] . ', ' . $row['first_name'] . ' ' . ($row['middle_name'] ?? '')));
                $empNo = strtolower($row['employee_number']);
                return strpos($fullName, $search) !== false || strpos($empNo, $search) !== false;
            });
        }

        if (!empty($filters['department']) && $filters['department'] !== 'all') {
            $dept = strtolower($filters['department']);
            $data = array_filter($data, function ($row) use ($dept) {
                return strtolower($row['department']) === $dept;
            });
        }

        if (!empty($filters['position']) && $filters['position'] !== 'all') {
            $pos = strtolower($filters['position']);
            $data = array_filter($data, function ($row) use ($pos) {
                return strtolower($row['position']) === $pos;
            });
        }

    } elseif ($exportType === 'attendance') {
        $sql = "
            SELECT
                a.id,
                a.student_id,
                a.employee_id,
                a.log_date,
                a.time_in,
                a.time_out,
                a.status,
                CASE
                    WHEN a.student_id  IS NOT NULL THEN 'Student'
                    WHEN a.employee_id IS NOT NULL THEN 'Employee'
                    ELSE 'Unknown'
                END AS record_type,
                s.student_number  AS s_reference_number,
                s.last_name       AS s_last_name,
                s.first_name      AS s_first_name,
                s.department      AS s_department,
                e.employee_number AS e_reference_number,
                e.last_name       AS e_last_name,
                e.first_name      AS e_first_name,
                e.department      AS e_department
            FROM attendance_logs a
            LEFT JOIN students  s ON s.id = a.student_id
            LEFT JOIN employees e ON e.id = a.employee_id
            ORDER BY a.log_date DESC, a.time_in DESC
        ";

        $data = fetch_all_rows($con, $sql);
        $headers = ['Date', 'ID', 'Name', 'Time In', 'Time Out'];

        if (!empty($filters['search'])) {
            $search = strtolower($filters['search']);
            $data = array_filter($data, function ($row) use ($search) {
                $name = '';
                if ($row['s_first_name']) {
                    $name = strtolower(trim($row['s_last_name'] . ', ' . $row['s_first_name']));
                } elseif ($row['e_first_name']) {
                    $name = strtolower(trim($row['e_last_name'] . ', ' . $row['e_first_name']));
                }
                $refNum = strtolower($row['s_reference_number'] ?? $row['e_reference_number'] ?? '');
                return strpos($name, $search) !== false || strpos($refNum, $search) !== false;
            });
        }

        if (!empty($filters['dateFrom'])) {
            $dateFrom = $filters['dateFrom'];
            $data = array_filter($data, function ($row) use ($dateFrom) {
                return $row['log_date'] >= $dateFrom;
            });
        }

        if (!empty($filters['dateTo'])) {
            $dateTo = $filters['dateTo'];
            $data = array_filter($data, function ($row) use ($dateTo) {
                return $row['log_date'] <= $dateTo;
            });
        }

        if (!empty($filters['userTypes']) && is_array($filters['userTypes'])) {
            $types = array_map('strtolower', $filters['userTypes']);
            if (!in_array('all', $types, true)) {
                $data = array_filter($data, function ($row) use ($types) {
                    return in_array(strtolower($row['record_type']), $types, true);
                });
            }
        }
    }

    $data = array_values($data);

    $spreadsheet = new Spreadsheet();
    $sheet = $spreadsheet->getActiveSheet();

    $titleLabel = match ($exportType) {
        'students'   => 'Student',
        'employees'  => 'Employee',
        'attendance' => 'Attendance',
        default      => 'Record',
    };

    $generatedDate = date('m/d/Y H:i');
    $lastCol = chr(64 + count($headers));
    $row = 1;

    // ── School name ──────────────────────────────────────────────────────────
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

    // ── Blank row ─────────────────────────────────────────────────────────────
    $row++;

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

    // ── Blank row ─────────────────────────────────────────────────────────────
    $row++;

    // ── Table headers ─────────────────────────────────────────────────────────
    $headerRow = $row;
    foreach ($headers as $col => $header) {
        $colLetter = chr(65 + $col);
        $sheet->setCellValue("{$colLetter}{$row}", $header);

        $style = $sheet->getStyle("{$colLetter}{$row}");
        // FIX: use getColor()->setRGB() for font color, setRGB() for fill (no FF prefix)
        $style->getFont()->setBold(true)->setSize(11)->getColor()->setRGB('FFFFFF');
        $style->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('1F0063');
        $style->getAlignment()
              ->setHorizontal(Alignment::HORIZONTAL_CENTER)
              ->setVertical(Alignment::VERTICAL_CENTER)
              ->setWrapText(true);
        // FIX: Border::BORDER_THIN instead of BorderStyle::THIN
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
            $name = trim($record['last_name'] . ', ' . $record['first_name'] . ' ' . ($record['middle_name'] ?? ''));
            $rowData = [
                $record['student_number'],
                $record['rfid_uid'] ?? '-',
                $name,
                $record['course'],
                $record['year_level'],
                $record['department'],
            ];
        } elseif ($exportType === 'employees') {
            $name = trim($record['last_name'] . ', ' . $record['first_name'] . ' ' . ($record['middle_name'] ?? ''));
            $rowData = [
                $record['employee_number'],
                $record['rfid_uid'] ?? '-',
                $name,
                $record['position'],
                $record['department'],
            ];
        } else {
            $name   = '';
            $refNum = '';
            if (!empty($record['s_first_name'])) {
                $name   = trim($record['s_last_name'] . ', ' . $record['s_first_name']);
                $refNum = $record['s_reference_number'];
            } elseif (!empty($record['e_first_name'])) {
                $name   = trim($record['e_last_name'] . ', ' . $record['e_first_name']);
                $refNum = $record['e_reference_number'];
            }

            $timeIn  = $record['time_in']  ? substr($record['time_in'],  0, 5) : '-';
            $timeOut = $record['time_out'] ? substr($record['time_out'], 0, 5) : '-';

            $rowData = [
                $record['log_date'],
                $refNum,
                $name,
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
            // FIX: Border::BORDER_THIN + getColor()->setRGB()
            $cellStyle->getBorders()->getAllBorders()
                      ->setBorderStyle(Border::BORDER_THIN)
                      ->getColor()->setRGB('C0C0C0');
        }

        $sheet->getRowDimension($row)->setRowHeight(16);
        $row++;
    }

    // ── Column widths ─────────────────────────────────────────────────────────
    $columnWidths = match ($exportType) {
        'students'   => [18, 18, 30, 18, 14, 30],
        'employees'  => [18, 18, 30, 18, 30],
        'attendance' => [14, 14, 25, 12, 12],
        default      => [12],
    };

    foreach ($columnWidths as $col => $width) {
        $sheet->getColumnDimension(chr(65 + $col))->setWidth($width);
    }

    // ── Output ────────────────────────────────────────────────────────────────
    $writer   = new Xlsx($spreadsheet);
    $fileName = "{$exportType}-records-" . date('YmdHis') . '.xlsx';

    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header("Content-Disposition: attachment; filename=\"{$fileName}\"");
    header('Cache-Control: max-age=0');

    $writer->save('php://output');
    exit;

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Export failed: ' . $e->getMessage()]);
    exit;
}