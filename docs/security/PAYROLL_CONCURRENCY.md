# Payroll concurrency hardening

## Confirmed defects

- Source conflict checks did not lock shifts or adjustments. Two transactions could both create runs containing the same source because link uniqueness covers only `(payroll_run_id, source_id)`.
- Finalize and cancel read an unlocked run, while payment creation locked it. A cancellation could therefore overwrite the status after a payment was recorded.
- Draft revenue updates could race finalization and change revenue after the draft was fixed.
- A locking SELECT without `populate_existing` could retain stale amounts from SQLAlchemy's identity map.
- Creation selected source IDs and then queried preview separately, allowing newly inserted sources to affect amounts without corresponding snapshot links.

The concurrent-creation regression test failed against the previous implementation on real PostgreSQL before the fix.

## Implementation

- Preview and creation share `_load_payroll_sources` and `_build_payroll_preview`. Formulas, eligibility, monthly adjustment attribution and venue scope are unchanged.
- Creation selects and locks eligible shifts in ID order, then adjustments in ID order, using `FOR UPDATE OF` only the source table. Conflict checks, snapshot items and links use exactly those selected rows within the existing transaction.
- Overlapping dates are not a conflict on their own. Disjoint sources can be used concurrently, including different venues. Cancelled runs continue to release sources for reuse.
- Finalize, cancel, revenue editing and payments lock the same `PayrollRun` row before validating its state. Payment locks then proceed to items. All writes retain their existing transaction and rollback behavior.
- Locking queries refresh already loaded run/item values. Payment completion refreshes all items after autoflush, so cached balances cannot decide the status.
- There are no process-local mutexes, new tables, migrations, endpoints or dependencies. PostgreSQL locks coordinate all application replicas and are released by commit/rollback/session cleanup.

## Verification

Eleven focused real-PostgreSQL cases cover concurrent shift reservation, adjustment-only reservation, cancellation/payment in both orders, duplicate full payment with cached objects, final payment with other employees cached, finalize/revenue conflict, cancel/finalize conflict, rollback and source lock release, disjoint venues, and a new shift inserted after source selection.

Concurrency tests hold one real transaction before commit, then verify the other is blocked using `pg_blocking_pids`, not just a timing assumption. Tests run only against an explicitly disposable local database.

Verified on 2026-10-12 with an isolated PostgreSQL 18 cluster: the full integration suite passed twice (**29 tests each run**), including the 11 new cases. The root backend unittest suite passed **197 tests**. Compile and `git diff --check` passed. Docker/PostgreSQL 16 and production were not exercised.

## Limits

- These guarantees apply to the application mutation paths, not arbitrary direct database writes bypassing them.
- New sources arriving after selection are not included in that saved snapshot. Preview remains read-only and does not reserve sources.
- Clients without an operation key may still record two valid partial payments. The subsequent [payment idempotency change](PAYMENT_IDEMPOTENCY.md) protects retries carrying the same key; row locks alone protect balances and status transitions, not duplicate user intent.
- Negative accrual handling and attributing monthly adjustments to partial-month periods are product decisions and were not changed.
- No production deployment or live Telegram/browser QA is part of this change.
