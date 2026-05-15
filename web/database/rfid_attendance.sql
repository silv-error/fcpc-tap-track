-- ============================================
-- RFID Attendance System Database Schema
-- ============================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

-- ============================================
-- Create Database
-- ============================================

CREATE DATABASE IF NOT EXISTS `rfid_attendance`
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_general_ci;

USE `rfid_attendance`;

-- ============================================
-- Disable Foreign Key Checks
-- ============================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- Drop Tables in Correct Dependency Order
-- ============================================

DROP TABLE IF EXISTS `attendance_logs`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `rfid_uid_buffer`;
DROP TABLE IF EXISTS `students`;
DROP TABLE IF EXISTS `employees`;
DROP TABLE IF EXISTS `rfid_scan_logs`;

-- ============================================
-- Table: students
-- ============================================

CREATE TABLE `students` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `student_number` VARCHAR(50) NOT NULL,
    `category` VARCHAR(50) DEFAULT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `middle_name` VARCHAR(100) DEFAULT NULL,
    `suffix` VARCHAR(10) DEFAULT NULL,
    `program` VARCHAR(100) DEFAULT NULL,
    `year_level` VARCHAR(50) DEFAULT NULL,
    `strand` VARCHAR(150) DEFAULT NULL,
    `department` VARCHAR(100) DEFAULT NULL,
    `rfid_uid` VARCHAR(255) DEFAULT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `student_number` (`student_number`),
    UNIQUE KEY `rfid_uid` (`rfid_uid`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci;

-- ============================================
-- Table: employees
-- ============================================

CREATE TABLE `employees` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `employee_number` VARCHAR(50) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `middle_name` VARCHAR(100) DEFAULT NULL,
    `suffix` VARCHAR(10) DEFAULT NULL,
    `department` VARCHAR(100) DEFAULT NULL,
    `position` VARCHAR(100) DEFAULT NULL,
    `rfid_uid` VARCHAR(255) DEFAULT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `employee_number` (`employee_number`),
    UNIQUE KEY `rfid_uid` (`rfid_uid`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci;

-- ============================================
-- Table: rfid_scan_logs
-- ============================================

CREATE TABLE `rfid_scan_logs` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `rfid_uid` VARCHAR(100) NOT NULL,
    `scan_result` ENUM('SUCCESS', 'FAILED') NOT NULL,
    `user_type` ENUM('Student', 'Employee') DEFAULT NULL,
    `action` VARCHAR(100) DEFAULT NULL,
    `message` TEXT NOT NULL,
    `scanned_at` DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci;

-- ============================================
-- Table: rfid_uid_buffer
-- ============================================

CREATE TABLE `rfid_uid_buffer` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `rfid_uid` VARCHAR(255) NOT NULL,
    `is_used` TINYINT(1) NOT NULL DEFAULT 0,
    `used_by_student_id` INT(11) DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `used_by_student_id` (`used_by_student_id`),
    KEY `rfid_uid` (`rfid_uid`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci;

-- ============================================
-- Table: users
-- ============================================

CREATE TABLE `users` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `employee_id` INT(11) DEFAULT NULL,
    `username` VARCHAR(50) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `middle_name` VARCHAR(100) DEFAULT NULL,
    `suffix` VARCHAR(10) DEFAULT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('Admin','Superadmin') NOT NULL DEFAULT 'Admin',
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `failed_login_attempts` INT(11) NOT NULL DEFAULT 0,
    `locked_until` DATETIME DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `username` (`username`),
    UNIQUE KEY `email` (`email`),
    KEY `employee_id` (`employee_id`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci;

-- Test Users
INSERT INTO users (
  employee_id,
  username,
  first_name,
  last_name,
  email,
  role,
  password_hash,
  is_active,
  created_at,
  updated_at
) VALUES (
  NULL,
  'spadmin',
  'Test',
  'SPadmin',
  'spadmin@fcpc.edu.ph',
  'Superadmin',
  '$2y$10$H2UDJhbVf/oVR/xBH2iUkeUsLeF4xBNbfXC9v8P3yGPYqkp6rlWca',
  1,
  NOW(),
  NOW()
);

INSERT INTO users (
  employee_id,
  username,
  first_name,
  last_name,
  email,
  role,
  password_hash,
  is_active,
  created_at,
  updated_at
) VALUES (
  NULL,
  'admin',
  'Test',
  'Admin',
  'admin@fcpc.edu.ph',
  'Admin',
  '$2y$10$H2UDJhbVf/oVR/xBH2iUkeUsLeF4xBNbfXC9v8P3yGPYqkp6rlWca',
  1,
  NOW(),
  NOW()
);

-- ============================================
-- Table: attendance_logs
-- ============================================

CREATE TABLE `attendance_logs` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,

    -- NEW
    `rfid_uid` VARCHAR(255) NOT NULL,

    `student_id` INT(11) DEFAULT NULL,
    `employee_id` INT(11) DEFAULT NULL,

    -- NEW
    `registration_status` ENUM('registered', 'unregistered')
    NOT NULL DEFAULT 'unregistered',

    `log_date` DATE NOT NULL,
    `time_in` TIME NOT NULL,
    `time_out` TIME DEFAULT NULL,

    `status` ENUM('Timed In', 'Timed Out') NOT NULL,

    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `student_id` (`student_id`),
    KEY `employee_id` (`employee_id`),
    KEY `rfid_uid` (`rfid_uid`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci;


ALTER TABLE `attendance_logs`
ADD CONSTRAINT `fk_attendance_student`
FOREIGN KEY (`student_id`) REFERENCES `students`(`id`)
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE `attendance_logs`
ADD CONSTRAINT `fk_attendance_employee`
FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`)
ON DELETE SET NULL
ON UPDATE CASCADE;

-- ============================================
-- Insert Sample Employees
-- ============================================

INSERT INTO `employees` (
    `id`,
    `employee_number`,
    `last_name`,
    `first_name`,
    `middle_name`,
    `department`,
    `position`,
    `rfid_uid`
)
VALUES
(
    1,
    'EMP-101',
    'Villanueva',
    'Elena',
    'Cruz',
    'Registrar',
    'Clerk',
    'I9J0K1L2'
),
(
    2,
    'EMP-102',
    'Garcia',
    'Ricardo',
    'Perez',
    'IT Dept',
    'IT Officer I',
    'M3N4O5P6'
);

-- ============================================
-- Add Foreign Keys AFTER Tables Exist
-- ============================================

ALTER TABLE `rfid_uid_buffer`
ADD CONSTRAINT `fk_rfid_uid_buffer_student`
FOREIGN KEY (`used_by_student_id`) REFERENCES `students`(`id`)
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE `users`
ADD CONSTRAINT `fk_users_employee`
FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`)
ON DELETE SET NULL
ON UPDATE CASCADE;

-- ============================================
-- Re-enable Foreign Key Checks
-- ============================================

SET FOREIGN_KEY_CHECKS = 1;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;