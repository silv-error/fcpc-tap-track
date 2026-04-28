import sqlite3

from database import DatabaseManager


def format_full_name(person: dict) -> str:
    last_name = person.get("last_name") or ""
    first_name = person.get("first_name") or ""
    middle_name = person.get("middle_name") or ""
    suffix = person.get("suffix") or ""

    full_name = f"{last_name}, {first_name}".strip(", ")

    if middle_name:
        full_name += f" {middle_name}"

    if suffix:
        full_name += f" {suffix}"

    return full_name.strip()


def seed_students_and_employees():
    database_manager = DatabaseManager()

    dummy_students = [
        {
            "student_number": "STU-0001",
            "last_name": "Dela Cruz",
            "first_name": "Juan",
            "middle_name": "",
            "suffix": "",
            "course": "BSCS",
            "year_level": "4th Year",
            "department": "CCS",
            "rfid_uid": "5F70E3E8",
        },
        {
            "student_number": "STU-0002",
            "last_name": "Fajardo",
            "first_name": "Ryan",
            "middle_name": "",
            "suffix": "",
            "course": "BSIT",
            "year_level": "3rd Year",
            "department": "CCS",
            "rfid_uid": "BF2ED7E8",
        },
        {
            "student_number": "STU-0003",
            "last_name": "Silverio",
            "first_name": "Joe",
            "middle_name": "Francisco",
            "suffix": "",
            "course": "BSIT",
            "year_level": "4th Year",
            "department": "CCS",
            "rfid_uid": "AF8FD5E8",
        },
    ]

    dummy_employees = [
        {
            "employee_number": "EMP-0001",
            "last_name": "Santos",
            "first_name": "Maria",
            "middle_name": "",
            "suffix": "",
            "department": "Admin Office",
            "position": "Administrative Staff",
            "rfid_uid": "ABC12345",
        },
    ]

    print("Seeding students...")

    for student in dummy_students:
        student_name = format_full_name(student)

        try:
            database_manager.add_student(
                student_number=student["student_number"],
                last_name=student["last_name"],
                first_name=student["first_name"],
                middle_name=student["middle_name"],
                suffix=student["suffix"],
                course=student["course"],
                year_level=student["year_level"],
                department=student["department"],
                rfid_uid=student["rfid_uid"],
                is_active=1,
            )

            print(
                f"Added student: {student_name} "
                f"- {student['student_number']} "
                f"- {student['rfid_uid']}"
            )

        except sqlite3.IntegrityError as error:
            print(
                f"Skipped existing student: {student_name} "
                f"- {student['rfid_uid']} "
                f"({error})"
            )

        except ValueError as error:
            print(
                f"Skipped student: {student_name} "
                f"- {student['rfid_uid']} "
                f"({error})"
            )

    print()
    print("Seeding employees...")

    for employee in dummy_employees:
        employee_name = format_full_name(employee)

        try:
            database_manager.add_employee(
                employee_number=employee["employee_number"],
                last_name=employee["last_name"],
                first_name=employee["first_name"],
                middle_name=employee["middle_name"],
                suffix=employee["suffix"],
                department=employee["department"],
                position=employee["position"],
                rfid_uid=employee["rfid_uid"],
                is_active=1,
            )

            print(
                f"Added employee: {employee_name} "
                f"- {employee['employee_number']} "
                f"- {employee['rfid_uid']}"
            )

        except sqlite3.IntegrityError as error:
            print(
                f"Skipped existing employee: {employee_name} "
                f"- {employee['rfid_uid']} "
                f"({error})"
            )

        except ValueError as error:
            print(
                f"Skipped employee: {employee_name} "
                f"- {employee['rfid_uid']} "
                f"({error})"
            )

    print()
    print("Seeding completed.")


if __name__ == "__main__":
    seed_students_and_employees()