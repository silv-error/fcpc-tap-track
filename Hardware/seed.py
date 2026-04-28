import sqlite3

from database import DatabaseManager


def seed_users():
    database_manager = DatabaseManager()

    dummy_users = [
        {
            "user_number": "STU-0001",
            "full_name": "Juan Dela Cruz",
            "user_type": "Student",
            "department": "BSCS",
            "rfid_uid": "5F70E3E8",
        },
        {
            "user_number": "EMP-0001",
            "full_name": "Maria Santos",
            "user_type": "Employee",
            "department": "Admin Office",
            "rfid_uid": "ABC12345",
        },
        {
            "user_number": "STU-0002",
            "full_name": "Ryan Fajardo",
            "user_type": "Student",
            "department": "BSIT",
            "rfid_uid": "BF2ED7E8",
        },
    ]

    for user in dummy_users:
        try:
            database_manager.add_user(
                user_number=user["user_number"],
                full_name=user["full_name"],
                user_type=user["user_type"],
                department=user["department"],
                rfid_uid=user["rfid_uid"],
                is_active=1,
            )

            print(f"Added: {user['full_name']} - {user['rfid_uid']}")

        except sqlite3.IntegrityError:
            print(f"Skipped existing user: {user['full_name']} - {user['rfid_uid']}")

    print("Seeding completed.")


if __name__ == "__main__":
    seed_users()