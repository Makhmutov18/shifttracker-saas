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

## 3. Fast execution mode

Default mode for implementation tasks is code-only.

- Do not open a browser.
- Do not start dev servers or mock servers.
- Do not create screenshots.
- Do not run visual QA or manually test multiple resolutions.
- Browser QA is allowed only when the task explicitly contains `VISUAL_QA_REQUIRED`.
- When browser QA is not requested, state that it was not performed.
- Do not expand a focused task into broad QA or research.
- If blocked after two reasonable attempts, report the blocker and stop.

## 4. UI defaults

For UI tasks:

- keep UI text in Russian;
- reuse existing CSS variables and surface classes;
- support light and dark themes;
- keep touch targets at least `44×44 px`;
- account for Telegram safe areas and dock overlap;
- preserve loading, error, empty and permission states;
- do not add gradients, glow, fake analytics, card-inside-card or generic AI-SaaS styling;
- preserve accessibility, focus states and reduced motion where relevant.

Do not claim real Telegram QA unless the result was actually tested inside Telegram. Browser or mock testing must be described as such.

For web-admin visual tasks, read `web-admin/DESIGN.md`. For frontend or landing design tasks, do not automatically apply the web-admin design system. Use the installed `design-taste-frontend` skill for landing pages and redesign audits when relevant. Preserve the existing stack: do not introduce Tailwind, Motion, GSAP, another icon library, or another design system unless explicitly requested. Existing React/Vite/CSS architecture remains authoritative. New and migrated web-admin surfaces use Phosphor, but do not perform global icon replacement in unrelated tasks.

## 5. Validation

Always run:

```bash
git diff --check
```

For Telegram Mini App changes:

```bash
cd frontend
npm run build
cd ..
```

For web-admin changes:

```bash
cd web-admin
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

`VISUAL_QA_REQUIRED` is optional and must be explicitly present to allow browser QA, screenshots, dev servers or mock servers.
