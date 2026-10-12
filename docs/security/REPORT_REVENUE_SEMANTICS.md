# Revenue in spreadsheet exports

Shift revenue remains available in the raw XLSX/CSV shift rows and approved shift totals. It is not actual venue revenue and never supplies a fallback for revenue or payroll share in the report overview.

Each payroll-run row uses its own saved `revenue_total`, only for a concrete venue. Missing or invalid negative values stay blank; an explicitly saved zero stays zero, with payroll share blank. The share reuses `calculate_payroll_share(PayrollRun.total_amount, revenue_total)` and converts its percentage to Excel's fractional percentage format. Employee snapshot aggregates remain unchanged.

## Monthly overview

A monthly revenue/share is shown only for a selected concrete venue with exactly one overlapping finalized/paid run whose saved period matches the entire report month. Draft/cancelled runs are not candidates. Partial, cross-month, multiple overlapping periods, missing revenue, and all-points scope leave these metrics blank rather than claiming a verified monthly figure.

The payroll-sheet revenue total follows that same monthly metric; it does not sum overlapping revenue snapshots. Individual run revenue remains available in the rows. Combining disjoint partial-period revenues or aggregating multiple venues requires an explicit coverage policy and is deliberately not inferred here.

There are no changes to accrual/payment amounts, salary formulas, snapshot storage, permissions, venue queries, download endpoints, or CSV composition. Existing full overlapping payroll snapshots remain in the report; their payment/accrual totals are not redefined by this change.

Regression coverage includes missing/zero/negative/unscoped revenue, partial and overlapping periods, draft/cancelled exclusion, saved-run versus item amounts, Excel percentage/blank cells, and actual PostgreSQL report loading with venue scope.
