-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 28, 2026 at 09:19 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `rfid_attendance`
--

-- --------------------------------------------------------

--
-- Table structure for table `attendance_logs`
--

CREATE TABLE `attendance_logs` (
  `id` int(11) NOT NULL,
  `student_id` int(11) DEFAULT NULL,
  `employee_id` int(11) DEFAULT NULL,
  `log_date` date NOT NULL,
  `time_in` time NOT NULL,
  `time_out` time DEFAULT NULL,
  `status` enum('Timed In','Timed Out') NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `attendance_logs`
--

INSERT INTO `attendance_logs` (`id`, `student_id`, `employee_id`, `log_date`, `time_in`, `time_out`, `status`, `created_at`, `updated_at`) VALUES
(1, 1, NULL, '2026-04-28', '08:00:00', '12:00:00', 'Timed Out', '2026-04-28 14:51:42', '2026-04-28 14:51:42'),
(2, 2, NULL, '2026-04-28', '09:15:00', NULL, 'Timed In', '2026-04-28 14:51:42', '2026-04-28 14:51:42'),
(3, NULL, 1, '2026-04-28', '07:30:00', '16:30:00', 'Timed Out', '2026-04-28 14:51:42', '2026-04-28 14:51:42'),
(4, NULL, 2, '2026-04-28', '08:45:00', NULL, 'Timed In', '2026-04-28 14:51:42', '2026-04-28 14:51:42');

-- --------------------------------------------------------

--
-- Table structure for table `employees`
--

CREATE TABLE `employees` (
  `id` int(11) NOT NULL,
  `employee_number` varchar(50) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `suffix` varchar(10) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `position` varchar(100) DEFAULT NULL,
  `rfid_uid` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `employees` MODIFY `rfid_uid` VARCHAR(255) NULL DEFAULT NULL;

--
-- Dumping data for table `employees`
--

INSERT INTO `employees` (`id`, `employee_number`, `last_name`, `first_name`, `middle_name`, `suffix`, `department`, `position`, `rfid_uid`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'EMP-101', 'Villanueva', 'Elena', 'Cruz', NULL, 'Registrar', 'Clerk', 'I9J0K1L2', 1, '2026-04-28 14:50:58', '2026-04-28 14:50:58'),
(2, 'EMP-102', 'Garcia', 'Ricardo', 'Perez', NULL, 'IT Dept', 'IT Officer I', 'M3N4O5P6', 1, '2026-04-28 14:50:58', '2026-04-28 14:50:58');

-- --------------------------------------------------------

--
-- Table structure for table `rfid_scan_logs`
--

CREATE TABLE `rfid_scan_logs` (
  `id` int(11) NOT NULL,
  `rfid_uid` varchar(100) NOT NULL,
  `scan_result` enum('SUCCESS','FAILED') NOT NULL,
  `user_type` enum('Student','Employee') DEFAULT NULL,
  `action` varchar(100) DEFAULT NULL,
  `message` text NOT NULL,
  `scanned_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `students`
--

CREATE TABLE `students` (
  `id` int(11) NOT NULL,
  `student_number` varchar(50) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `suffix` varchar(10) DEFAULT NULL,
  `course` varchar(100) DEFAULT NULL,
  `year_level` varchar(50) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `rfid_uid` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `students` MODIFY `rfid_uid` VARCHAR(255) NULL DEFAULT NULL;

--
-- Dumping data for table `students`
--

INSERT INTO `students` (`id`, `student_number`, `last_name`, `first_name`, `middle_name`, `suffix`, `course`, `year_level`, `department`, `rfid_uid`, `is_active`, `created_at`, `updated_at`) VALUES
(1, '2024-0001', 'Santos', 'Maria', 'Clara', NULL, 'BSIT', '2nd Year', 'CICS', 'A1B2C3D4', 1, '2026-04-28 14:50:03', '2026-04-28 14:50:03'),
(2, '2024-0002', 'Reyes', 'Juan', 'Luna', NULL, 'BSCS', '1st Year', 'CICS', 'E5F6G7H8', 1, '2026-04-28 14:50:03', '2026-04-28 14:50:03');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `suffix` varchar(10) DEFAULT NULL,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('Admin','Superadmin') NOT NULL DEFAULT 'Admin',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE users ADD COLUMN employee_id INT NULL AFTER id;
ALTER TABLE users ADD CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees(id);

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `last_name`, `first_name`, `middle_name`, `suffix`, `email`, `password_hash`, `role`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'supadmin', 'Doe', 'Jane', 'Smith', NULL, 'supadmin@gmail.com', 'hash_pw_123', 'Superadmin', 1, '2026-04-28 14:49:04', '2026-04-28 14:49:04'),
(2, 'admin', 'Brown', 'Robert', NULL, NULL, 'admin@gmail.com', 'hash_pw_456', 'Admin', 1, '2026-04-28 14:49:04', '2026-04-28 14:49:04');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `attendance_logs`
--
ALTER TABLE `attendance_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `student_id` (`student_id`),
  ADD KEY `employee_id` (`employee_id`);

--
-- Indexes for table `employees`
--
ALTER TABLE `employees`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `employee_number` (`employee_number`),
  ADD UNIQUE KEY `rfid_uid` (`rfid_uid`);

--
-- Indexes for table `rfid_scan_logs`
--
ALTER TABLE `rfid_scan_logs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `students`
--
ALTER TABLE `students`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `student_number` (`student_number`),
  ADD UNIQUE KEY `rfid_uid` (`rfid_uid`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `attendance_logs`
--
ALTER TABLE `attendance_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `employees`
--
ALTER TABLE `employees`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `rfid_scan_logs`
--
ALTER TABLE `rfid_scan_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `students`
--
ALTER TABLE `students`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `attendance_logs`
--
ALTER TABLE `attendance_logs`
  ADD CONSTRAINT `attendance_logs_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `attendance_logs_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
