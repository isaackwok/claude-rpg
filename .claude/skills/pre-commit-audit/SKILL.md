---
name: pre-commit-audit
description: Audit changed code before committing to check if tests, CLAUDE.md, skills, agents, plans, or specs need updates. Use this skill whenever the user says "audit", "pre-commit check", "check before commit", "sync docs", "update plan", or any variation of reviewing project artifacts before a git commit. Also use when the user is about to commit and has made significant code changes — even if they don't explicitly ask for an audit.
---

# Pre-Commit Audit

Review the current git diff and check whether supporting project artifacts need updates. Present findings as a checklist and ask the user before making any changes.

## Why This Matters

Code changes often have ripple effects — a new Phaser scene needs tests, a renamed event breaks a skill's assumptions, a completed feature should be marked done in the plan. This audit catches those gaps before they get committed, keeping the project's docs, tests, and tooling in sync with the actual code.

## Workflow

### Step 1: Gather the Diff

Run `git diff` (unstaged) and `git diff --cached` (staged) to see all pending changes. Also run `git diff --name-only` to get a quick list of changed files.

If there are no changes at all, tell the user and stop.

### Step 2: Analyze and Report

For each category below, analyze the diff and determine if action is needed. Compile findings into a single checklist report — don't make changes yet.

#### 2a. Tests

Look at the changed files and assess whether new tests are needed:

- **New modules/classes/components** — Do they have corresponding test files? Check `tests/e2e/` for E2E tests.
- **New public functions or event handlers** — Are they covered by existing tests?
- **Changed behavior** — Could the change break existing tests?

Report which files likely need new or updated tests, and briefly say why (e.g., "New `QuestBoard` component has no test coverage").

#### 2b. CLAUDE.md

Check if the diff introduces architectural changes that should be documented in `CLAUDE.md`:

- **New directories or major files** added to the project structure
- **New commands** (npm scripts, CLI tools)
- **New conventions** (patterns, naming, data flow changes)
- **New dependencies** that affect the tech stack description
- **Phase progress** — if work advances the current implementation phase

Compare against the current `CLAUDE.md` content to avoid suggesting things already documented.

#### 2c. Skills (`.claude/skills/`)

Read each existing skill's `SKILL.md` and check whether the diff affects them:

- **Renamed or moved files** that a skill references by path
- **Changed APIs or interfaces** that a skill's instructions depend on
- **New patterns** that make a skill's guidance outdated

Only flag skills that are concretely affected by the diff — don't speculatively suggest updates.

#### 2d. Agents (`.claude/agents/`)

Same approach as skills — read each agent's `.md` file and check if the diff affects:

- **Event names** the agent listens for or reviews
- **File paths** the agent references
- **Conventions** the agent enforces that have changed

#### 2e. Plans & Specs (`docs/superpowers/`)

Check the current plan and spec files:

- **Completed steps** — If the diff implements something described in the plan, suggest marking it done
- **New decisions** — If the diff introduces an approach not covered in the spec, note it
- **Scope changes** — If the diff deviates from the plan, flag it for discussion

### Step 3: Present the Checklist

Format findings as a clear checklist grouped by category. For each item, include:

- What needs to change
- Why (tied back to the specific diff)
- Suggested action (brief)

Example format:

```
## Pre-Commit Audit Results

### Tests
- [ ] `QuestBoard` component (new in src/renderer/src/components/) — needs E2E test
- [x] Existing NPC tests — no changes needed

### CLAUDE.md
- [ ] Add `QuestBoard` to Architecture section — new component in renderer

### Skills
- [x] All skills — no impact from this diff

### Agents
- [ ] `event-bridge-reviewer` — references `npc:interact` event which was renamed to `npc:dialogue`

### Plans
- [ ] Phase 1 plan step 4.2 — "React overlay scaffold" is now complete, mark as done
```

Use [x] for items that are fine (no action needed) and [ ] for items that need attention.

### Step 4: Ask Before Acting

After presenting the checklist, ask the user which items they'd like you to fix. Wait for their response before making any changes.

Something like: "Which of these should I update? You can say 'all', pick specific numbers, or skip any."

### Step 5: Apply Changes

For each approved item, make the change. Group related changes together (e.g., all CLAUDE.md updates in one edit). After applying, show a brief summary of what was changed.

## Important Notes

- This is a lightweight audit, not an exhaustive review. Focus on obvious gaps that the diff reveals.
- Don't suggest tests for trivial changes (config tweaks, asset updates, typo fixes).
- Don't suggest CLAUDE.md updates for minor implementation details — only architectural or convention-level changes.
- When checking skills/agents, read the actual file content rather than guessing from the filename.
- If the diff is very large, focus on the most impactful changes rather than trying to audit everything.
