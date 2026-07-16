# Codex Task Base

Use this file as the default process for every Codex task in this repository. A task prompt only needs to describe the specific problem, expected result and relevant files.

This file does not replace `AI_RULES.md`, `AI_HANDOFF.md` or specialised project documents.

## 1. Start every task

```bash
git status --short
git pull --ff-only origin main
git rev-parse HEAD
```

If the working tree contains unrelated changes, do not overwrite or include them. Report the conflict before continuing.

Always read:

- `AI_RULES.md`
- `AI_HANDOFF.md`

Additionally read:

- `UX_UI_DESIGN_RULES.md` for frontend, Mini App, web-admin or visual work;
- `WEB_ADMIN_AUTH_PLAN.md` for web-admin auth, sessions, cookies, OAuth or security work.

## 2. Scope and safety

- Change only what the task requires.
- Inspect the current implementation before editing.
- Fix the root cause without unrelated refactors.
- Do not change backend, API contracts, database schema, auth, permissions or payroll formulas unless explicitly requested.
- Do not add dependencies unless explicitly approved and genuinely necessary.
- Do not commit secrets, `.env`, dumps, backups or debug logs.
- Keep existing stable flows working.
- Commit only relevant files.

## 3. Timebox

- Do not turn a focused fix into a broad refactor or research task.
- For simple local fixes, browser QA is limited to two focused verification cycles unless the task explicitly requires more.
- Do not repeat already passed scenarios after every minor edit.
- Once the main regression scenario passes, finish the required checks, commit and push.
- If a task runs longer than 15 minutes, stop expanding scope and complete the smallest correct fix.
- Read additional plugin skills only when they are genuinely needed for the task.
- If blocked after two reasonable attempts, report the blocker instead of continuing indefinitely.

## 4. UI defaults

For UI tasks:

- keep UI text in Russian;
- reuse existing CSS variables and surface classes;
- support light and dark themes;
- keep touch targets at least `44×44 px`;
- check Mini App at `360 px` and `390 px`;
- account for Telegram safe areas and dock overlap;
- preserve loading, error, empty and permission states;
- do not add gradients, glow, fake analytics, card-inside-card or generic AI-SaaS styling;
- preserve accessibility, focus states and reduced motion where relevant.

Do not claim real Telegram QA unless the result was actually tested inside Telegram. Browser or mock testing must be described as such.

## 5. Validation

Always run:

```bash
git diff --check
```

For frontend changes:

```bash
cd frontend
npm run build
cd ..
```

For backend changes:

```bash
python -m compileall backend/app
```

Run any additional focused checks required by the task. Do not report a check as passed unless it was actually run.

## 6. Git finish

After checks pass:

```bash
git status --short
git add <only relevant files>
git commit -m "<clear task-specific message>"
git push origin main
git status --short
```

Do not force-push. The final working tree must be clean unless an unrelated pre-existing change was intentionally left untouched.

## 7. Final report

Keep the report short and factual:

- what changed;
- files changed;
- checks and QA actually performed;
- limitations or unverified environments;
- full commit hash;
- push result;
- final `git status`.

Do not paste a long diff or repeat this document.

## 8. Minimal task prompt format

Future prompts can use this format:

```text
Follow CODEX_TASK_BASE.md.

Task: <specific problem and expected result>.
Files: <likely files, if known>.
Do not change: <important exclusions, only when needed>.
Check: <task-specific behaviour to verify>.
Commit: <commit message>.
```
