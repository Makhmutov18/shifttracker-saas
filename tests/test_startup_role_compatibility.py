import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DATABASE_SOURCE = (REPO_ROOT / "backend" / "app" / "database.py").read_text(encoding="utf-8")
MODELS_SOURCE = (REPO_ROOT / "backend" / "app" / "models.py").read_text(encoding="utf-8")


class StartupRoleCompatibilityTests(unittest.TestCase):
    def test_owner_is_supported_and_not_demoted_at_startup(self) -> None:
        self.assertRegex(MODELS_SOURCE, r'owner\s*=\s*"owner"')
        self.assertIsNone(
            re.search(
                r"UPDATE\s+users\s+SET\s+role\s*=\s*'admin'\s+WHERE\s+role::text\s*=\s*'owner'",
                DATABASE_SOURCE,
                flags=re.IGNORECASE,
            )
        )

    def test_legacy_employee_role_can_still_be_normalized(self) -> None:
        self.assertRegex(
            DATABASE_SOURCE,
            r"UPDATE\s+users\s+SET\s+role\s*=\s*'barista'\s+WHERE\s+role::text\s*=\s*'employee'",
        )


if __name__ == "__main__":
    unittest.main()
