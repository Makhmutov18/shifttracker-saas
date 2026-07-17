import ast
import sys
import unittest
import uuid
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.schemas import ShiftCreate, ShiftUpdate, ShiftOut  # noqa: E402


API_PATH = BACKEND_DIR / "app" / "routers" / "api.py"
API_SOURCE = API_PATH.read_text(encoding="utf-8")
API_MODULE = ast.parse(API_SOURCE)


def _endpoint_source(name: str) -> str:
    endpoint = next(
        node
        for node in API_MODULE.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == name
    )
    return ast.get_source_segment(API_SOURCE, endpoint) or ""


class ActualVenueShiftTests(unittest.TestCase):
    def test_old_create_payload_keeps_home_venue_fallback(self) -> None:
        payload = ShiftCreate(
            date="2026-07-18",
            start_time="09:00:00",
            end_time="18:00:00",
        )
        self.assertIsNone(payload.venue_id)

    def test_create_and_update_contracts_accept_venue_id(self) -> None:
        venue_id = uuid.uuid4()
        self.assertEqual(
            ShiftCreate(
                date="2026-07-18",
                start_time="09:00:00",
                end_time="18:00:00",
                venue_id=venue_id,
            ).venue_id,
            venue_id,
        )
        self.assertEqual(ShiftUpdate(venue_id=venue_id).venue_id, venue_id)
        self.assertIn("venue_name", ShiftOut.model_fields)

    def test_create_uses_selected_active_venue_and_audits_it(self) -> None:
        source = _endpoint_source("create_shift")
        self.assertIn("shift_data.venue_id or user.venue_id", source)
        self.assertIn("await _get_active_venue", source)
        self.assertIn("venue_id=actual_venue_id", source)
        self.assertIn("venue_id=shift.venue_id", source)
        self.assertIn('"venue_id": str(shift.venue_id)', source)

    def test_pending_scope_uses_actual_shift_venue_only(self) -> None:
        source = _endpoint_source("list_pending_shifts")
        self.assertIn("Shift.venue_id == user.venue_id", source)
        self.assertNotIn("User.venue_id == user.venue_id", source)

    def test_update_scope_and_pending_venue_guard(self) -> None:
        source = _endpoint_source("update_shift")
        self.assertIn("Shift.venue_id == user.venue_id", source)
        self.assertNotIn("User.venue_id == user.venue_id", source)
        self.assertIn('shift.status != "pending"', source)
        self.assertIn("status_code=409", source)
        self.assertIn("await _get_active_venue", source)

    def test_venue_change_does_not_trigger_payroll_recalculation(self) -> None:
        source = _endpoint_source("update_shift")
        recalculate_guard = (
            "shift_data.start_time is not None or shift_data.end_time is not None "
            "or shift_data.revenue is not None"
        )
        self.assertIn(recalculate_guard, source)
        self.assertNotIn("shift_data.venue_id is not None or", source)

    def test_update_audit_uses_actual_venue_and_records_change(self) -> None:
        source = _endpoint_source("update_shift")
        self.assertIn("venue_id=shift.venue_id", source)
        self.assertIn('old_value["venue_id"]', source)
        self.assertIn('new_value["venue_id"]', source)

    def test_active_venues_endpoint_is_read_only_and_sorted(self) -> None:
        source = _endpoint_source("list_active_venues")
        self.assertIn("Venue.is_active == True", source)
        self.assertIn("order_by(Venue.name)", source)
        self.assertNotIn("session.add", source)
        self.assertNotIn("session.commit", source)


if __name__ == "__main__":
    unittest.main()
