# MVP Next Step

The shortest safe step to a usable MVP is to close the loop on one shift flow:

1. Employee creates a shift.
2. Admin sees it in the pending queue.
3. Admin approves or edits it.
4. Employee sees the updated result in history and profile.
5. Owner sees the month summary and export.

## What this means in practice

We should focus next on:

- making shift creation reliable and easy to complete on mobile;
- making the pending approval queue the single admin action surface;
- making the monthly summary obviously readable for the owner;
- keeping all role checks and Telegram auth in place;
- avoiding new product branches until this loop is stable.

## Minimal implementation target

If we only do one thing next, it should be:

- improve the shift approval/update flow end-to-end so it is obvious which shift was created, what changed, and what the final payroll result is.

That is the smallest step that turns the repo from a draft into a credible MVP.
