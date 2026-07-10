# Payroll Runs Design

## Purpose

This document describes how payroll should evolve in **Порядок.Смены** without breaking the current MVP.

Today the product already calculates payroll from:

- approved shifts;
- bonuses;
- deductions.

That works for the MVP, but real cafes usually pay on a schedule that is more complex than a simple "one month, one payout" flow.

Common examples:

- 10th and 25th of the month;
- 15th and 30th of the month;
- 30-40% advance and the rest later;
- payment for the first half of the month;
- payment for the second half of the previous month;
- custom manual periods.

The product should support these cases in a safe, staged way.

## Terms

### Accrued

The amount that has been earned but has not yet necessarily been paid out.

In the product this includes:

- approved shifts;
- bonuses;
- deductions.

### Paid

The amount that has already been marked as paid out.

This is a factual business event, not a recalculation.

### Remaining to pay

The difference between accrued and paid.

This tells the owner or manager what is still due.

### Calculation period

The date range that is used to calculate a payroll run.

Examples:

- 1-15 of the month;
- 16-31 of the month;
- a custom manual interval.

### Payroll calculation

The computed result for a selected calculation period.

It answers:

- who should be included;
- how much each person has accrued;
- what the total is.

### Actual payment

The moment when an admin or owner marks money as paid.

The system does not move money by itself. It only records that the payment was completed.

### Payment schedule

The preferred cadence for when a cafe pays employees.

Examples:

- twice per month;
- once per month;
- advance plus settlement;
- custom manual schedule.

## Main Principle

Shifts and adjustments create accruals.

Actual money payment is a separate event.

The system must not treat "calculated" and "paid" as the same thing.

This distinction is important because:

- a shift can be approved today but paid later;
- an owner can pay part of the month now and the rest later;
- a correction can happen after accrual but before payment;
- the team needs history of what was accrued and what was actually paid.

## MVP Approach

The first version should use a manual payroll run.

### Flow

1. Admin chooses a period.
2. System calculates:
   - approved shifts;
   - bonuses;
   - deductions.
3. System shows employees and amounts.
4. Admin forms a payroll run.
5. Admin marks the run as paid.
6. Employee sees:
   - accrued;
   - paid;
   - remaining.

### Why this works for MVP

Manual periods cover:

- 1-15;
- 16-31;
- full month;
- non-standard date ranges;
- different cafes with different rules.

This gives the product flexibility without forcing a complex schedule engine too early.

## Why Manual Periods Are Better First

Manual periods are the safest MVP path because they:

- work for any payout rhythm;
- avoid hardcoding 10/25 or 15/30 as a product assumption;
- let each cafe keep its own routine;
- reduce implementation risk;
- keep the current payroll summary useful.

This approach avoids building a complex scheduling system before real usage patterns are confirmed.

## Future Entities

These entities are not required immediately, but they are the natural product direction.

### payroll_runs

Purpose:

- stores one payroll calculation / payment cycle;
- records the selected period and payment status.

Main fields:

- id;
- venue_id or workspace scope;
- period_start;
- period_end;
- status;
- calculated_total;
- paid_total;
- created_by;
- paid_at;
- notes;
- created_at.

Relations:

- belongs to a venue or workspace;
- contains many payroll_run_items;
- may be linked to one or more payroll_payments later.

### payroll_run_items

Purpose:

- stores the employee-level breakdown inside one payroll run.

Main fields:

- id;
- payroll_run_id;
- user_id;
- accrued_amount;
- paid_amount;
- shifts_amount;
- bonuses_amount;
- deductions_amount;
- hours;
- shifts_count;
- note;
- created_at.

Relations:

- belongs to payroll_runs;
- references users;
- may optionally reference shifts / adjustments in a future detailed view.

### payroll_payments

Purpose:

- stores actual payment events.

Main fields:

- id;
- payroll_run_id;
- user_id;
- amount;
- paid_at;
- payment_method;
- external_reference;
- created_by;
- note;
- created_at.

Relations:

- belongs to a payroll run;
- references a user;
- may support partial payments in later stages.

### payroll_schedule_settings

Purpose:

- stores the preferred payment schedule for a venue or workspace.

Main fields:

- id;
- venue_id or workspace_id;
- schedule_type;
- first_day;
- second_day;
- advance_percent;
- custom_rules;
- timezone;
- active;
- created_at;
- updated_at.

Relations:

- belongs to a venue or workspace;
- informs future automated run generation.

## Screens

### Admin

- Payrolls / Выплаты.
- Create payroll run.
- Run details.
- Mark as paid.

### Employee

- Payrolls / Выплаты.
- Accrued.
- Paid.
- Remaining.
- Payment history.

## Risks

The payroll system must avoid these mistakes:

- confusing accrued and paid;
- changing a finalized payment retroactively without a clear history;
- breaking the current payroll summary;
- mixing deductions with general cafe expenses;
- overbuilding бухгалтерия-like complexity in MVP;
- making the product depend on a single payment rhythm.

The safest product behavior is:

- calculate from approved data;
- store payment as a separate event;
- preserve historical snapshots where needed;
- keep manual control first.

## Recommended Implementation Plan

### Phase 1: Product model only

- document terms;
- confirm the business flow;
- define how accrued / paid / remaining should be shown.

### Phase 2: Backend payroll run models

- add payroll_runs;
- add payroll_run_items;
- add payroll_payments;
- keep the current payroll summary intact.

### Phase 3: Manual payroll run creation

- admin selects a date period;
- system calculates the run;
- admin confirms and marks it as paid.

### Phase 4: Employee status view

- employee sees accrued / paid / remaining;
- payment history becomes visible.

### Phase 5: Schedules and notifications

- add schedule presets;
- add reminders and notifications;
- automate run suggestions carefully.

## Position in the Roadmap

This design should be implemented after the MVP has enough real usage to validate payout patterns.

It should not block:

- current shift creation;
- approve / reject;
- current payroll summary;
- the live pilot;
- early manual sales.

## Related Documents

- [ROADMAP_TO_LAUNCH.md](ROADMAP_TO_LAUNCH.md)
- [PILOT_PLAN.md](PILOT_PLAN.md)
- [AI_HANDOFF.md](AI_HANDOFF.md)
