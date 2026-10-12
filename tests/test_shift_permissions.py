import sys
import unittest
import uuid
from datetime import date, datetime, time, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import httpx
from fastapi import FastAPI
from sqlalchemy.dialects import postgresql


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import PayModel, Shift, User, UserRole, Venue  # noqa: E402
from app.routers import api  # noqa: E402


class ShiftPermissionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.home = uuid.uuid4()
        self.other = uuid.uuid4()
        self.employee = self.make_user()
        self.shift = Shift(
            id=uuid.uuid4(), user_id=self.employee.id, user=self.employee,
            venue_id=self.home, venue=Venue(id=self.home, name="Home", is_active=True),
            date=date(2026, 6, 15), start_time=time(9), end_time=time(17),
            total_hours=Decimal("8.00"), salary_earned=Decimal("2000.00"),
            cashier_hours=None, revenue=Decimal("10000.00"), comment="Original",
            status="pending", created_at=datetime.now(timezone.utc),
        )
        self.actor = self.make_user("can_edit_team_shifts")
        self.queries = []
        self.session = Mock()
        self.session.execute = AsyncMock(side_effect=self.execute)
        self.session.commit = AsyncMock()
        self.session.rollback = AsyncMock()
        self.session.get = AsyncMock(return_value=self.employee)
        self.app = FastAPI()
        self.app.include_router(api.router)

        async def current_user():
            return self.actor

        async def db_session():
            return self.session

        self.app.dependency_overrides[api.get_current_user] = current_user
        self.app.dependency_overrides[api.get_session] = db_session
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app), base_url="http://test"
        )
        self.addAsyncCleanup(self.client.aclose)
        self.reload = AsyncMock(return_value=self.shift)
        self.active_venue = AsyncMock(return_value=Venue(id=self.other, name="Other", is_active=True))
        for target, name, mock in (
            (api, "_load_shift_response", self.reload),
            (api, "_get_active_venue", self.active_venue),
            (api, "notify_shift_approved", AsyncMock()),
            (api, "notify_shift_rejected", AsyncMock()),
        ):
            patcher = patch.object(target, name, mock)
            patcher.start()
            self.addCleanup(patcher.stop)

    def make_user(self, *permissions, role=UserRole.barista):
        return User(
            id=uuid.uuid4(), name="Test", telegram_id=None, role=role,
            venue_id=self.home, is_active=True,
            hourly_rate=Decimal("250.00"), revenue_percentage=Decimal("0.00"),
            pay_model=PayModel.hourly, permissions={key: True for key in permissions},
        )

    async def execute(self, query):
        # Mock storage evaluates the exact ID/scope predicates produced by the real router.
        compiled = query.compile(dialect=postgresql.dialect())
        self.queries.append(compiled)
        matches = True
        for key, value in compiled.params.items():
            if key.startswith("venue_id_") and value != self.shift.venue_id:
                matches = False
            if key.startswith("user_id_") and value != self.shift.user_id:
                matches = False
            if key.startswith("id_") and value != self.shift.id:
                matches = False
        result = Mock()
        result.scalar_one_or_none.return_value = self.shift if matches else None
        result.scalars.return_value.all.return_value = [self.shift] if matches else []
        return result

    async def update(self, payload):
        return await self.client.patch(f"/api/shifts/{self.shift.id}", json=payload)

    def snapshot(self):
        return tuple(getattr(self.shift, field) for field in (
            "venue_id", "start_time", "end_time", "cashier_hours", "revenue",
            "comment", "status", "salary_earned", "total_hours",
        ))

    async def assert_denied_without_changes(self, payload, status=403):
        before = self.snapshot()
        response = await self.update(payload)
        self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(self.snapshot(), before)
        self.session.commit.assert_not_awaited()
        self.reload.assert_not_awaited()

    async def test_editor_cannot_approve_reject_or_resend_status(self):
        for status in ("approved", "rejected", "pending"):
            with self.subTest(status=status):
                await self.assert_denied_without_changes({"status": status})

    async def test_editor_mixed_request_is_denied_atomically(self):
        await self.assert_denied_without_changes({"comment": "Changed", "status": "approved"})

    async def test_editor_can_edit_comment_without_status(self):
        response = await self.update({"comment": "Changed"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.shift.comment, "Changed")
        self.assertEqual(self.shift.status, "pending")
        self.assertEqual(self.shift.salary_earned, Decimal("2000.00"))

    async def test_editor_can_edit_times_using_existing_formula(self):
        response = await self.update({"end_time": "18:00:00"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.shift.total_hours, Decimal("9.00"))
        self.assertEqual(self.shift.salary_earned, Decimal("2250.00"))
        self.assertEqual(self.shift.status, "pending")

    async def test_approver_can_approve_and_reject_without_recalculation(self):
        self.actor = self.make_user("can_approve_shifts")
        for status in ("approved", "rejected"):
            self.shift.status = "pending"
            with self.subTest(status=status), patch.object(api, "calculate_salary") as calculate:
                response = await self.update({"status": status})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(self.shift.status, status)
                self.assertEqual(self.shift.salary_earned, Decimal("2000.00"))
                calculate.assert_not_called()

    async def test_approver_cannot_edit_operational_fields_even_with_status(self):
        self.actor = self.make_user("can_approve_shifts")
        for field, value in (
            ("start_time", "10:00:00"), ("end_time", "18:00:00"),
            ("cashier_hours", "2"), ("revenue", "100"), ("venue_id", str(self.home)),
        ):
            for include_status in (False, True):
                payload = {field: value}
                if include_status:
                    payload["status"] = "approved"
                with self.subTest(field=field, include_status=include_status):
                    await self.assert_denied_without_changes(payload)

    async def test_approver_can_attach_review_comment(self):
        self.actor = self.make_user("can_approve_shifts")
        response = await self.update({"status": "rejected", "comment": "Review reason"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.shift.comment, "Review reason")

    async def test_approver_cannot_edit_comment_without_pending_review(self):
        self.actor = self.make_user("can_approve_shifts")
        await self.assert_denied_without_changes({"comment": "Changed"})
        self.shift.status = "approved"
        await self.assert_denied_without_changes({"status": "approved", "comment": "Changed"})
        await self.assert_denied_without_changes({"status": "pending", "comment": "Changed"})

    async def test_combined_permissions_allow_combined_request(self):
        self.actor = self.make_user("can_edit_team_shifts", "can_approve_shifts")
        response = await self.update({"status": "approved", "comment": "Changed", "end_time": "18:00:00"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.shift.status, "approved")
        self.assertEqual(self.shift.salary_earned, Decimal("2250.00"))

    async def test_owner_and_default_admin_keep_both_capabilities(self):
        for role in (UserRole.owner, UserRole.admin):
            self.actor = self.make_user(role=role)
            self.shift.status = "pending"
            with self.subTest(role=role):
                response = await self.update({"status": "approved", "comment": "Checked"})
                self.assertEqual(response.status_code, 200, response.text)

    async def test_explicit_admin_permission_denial_is_respected(self):
        self.actor = self.make_user(role=UserRole.admin)
        self.actor.permissions = {"can_approve_shifts": False}
        await self.assert_denied_without_changes({"status": "approved"})

    async def test_employee_and_read_only_permissions_cannot_mutate(self):
        for permission in (None, "can_view_team_shifts", "can_view_team_payroll", "can_manage_team"):
            self.actor = self.make_user(*([permission] if permission else []))
            for payload in ({"status": "approved"}, {"comment": "Changed"}):
                with self.subTest(permission=permission, payload=payload):
                    await self.assert_denied_without_changes(payload)

    async def test_editor_cannot_move_shift_to_another_venue(self):
        await self.assert_denied_without_changes({"venue_id": str(self.other)})
        self.active_venue.assert_not_awaited()

    async def test_owner_and_admin_can_move_pending_shift(self):
        for role in (UserRole.owner, UserRole.admin):
            self.actor = self.make_user(role=role)
            self.shift.venue_id = self.home
            with self.subTest(role=role):
                response = await self.update({"venue_id": str(self.other)})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(self.shift.venue_id, self.other)
                self.assertEqual(self.shift.salary_earned, Decimal("2000.00"))

    async def test_non_pending_shift_still_cannot_change_venue(self):
        self.actor = self.make_user(role=UserRole.owner)
        self.shift.status = "approved"
        await self.assert_denied_without_changes({"venue_id": str(self.other)}, status=409)

    async def test_actual_venue_scope_blocks_shift_even_if_employee_home_matches(self):
        self.shift.venue_id = self.other
        for permission in ("can_edit_team_shifts", "can_approve_shifts"):
            self.actor = self.make_user(permission)
            with self.subTest(permission=permission):
                await self.assert_denied_without_changes({"comment": "Changed"}, status=404)
                self.assertIn("shifts.venue_id =", str(self.queries[-1]))

    async def test_unknown_shift_returns_404(self):
        response = await self.client.patch(f"/api/shifts/{uuid.uuid4()}", json={"comment": "Changed"})
        self.assertEqual(response.status_code, 404)
        self.session.commit.assert_not_awaited()

    async def test_invalid_status_does_not_mutate_other_fields(self):
        self.actor = self.make_user(role=UserRole.owner)
        await self.assert_denied_without_changes({"status": "invalid", "comment": "Changed"}, status=400)

    async def test_team_viewer_history_uses_actual_venue_not_personal_scope(self):
        self.actor = self.make_user("can_view_team_shifts")
        response = await self.client.get("/api/shifts", params={"month": 6, "year": 2026})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([row["id"] for row in response.json()], [str(self.shift.id)])
        self.assertIn("shifts.venue_id =", str(self.queries[-1]))
        self.assertNotIn("shifts.user_id =", str(self.queries[-1].statement.whereclause))

    async def test_team_viewer_cannot_select_foreign_venue(self):
        self.actor = self.make_user("can_view_team_shifts")
        self.shift.venue_id = self.other
        response = await self.client.get("/api/shifts", params={"venue_id": str(self.other)})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), [])

    async def test_employee_history_stays_personal(self):
        self.actor = self.employee
        self.shift.venue_id = self.other
        response = await self.client.get("/api/shifts", params={"month": 6, "year": 2026})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()), 1)
        self.assertIn("shifts.user_id =", str(self.queries[-1].statement.whereclause))
        self.assertNotIn("shifts.venue_id =", str(self.queries[-1].statement.whereclause))

    async def test_pending_list_remains_available_to_editors_and_approvers(self):
        for permission in ("can_edit_team_shifts", "can_approve_shifts"):
            self.actor = self.make_user(permission)
            with self.subTest(permission=permission):
                response = await self.client.get("/api/shifts/pending")
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(len(response.json()), 1)
                self.assertIn("shifts.venue_id =", str(self.queries[-1]))

    async def test_pending_list_still_denies_ordinary_employee(self):
        self.actor = self.employee
        response = await self.client.get("/api/shifts/pending")
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
