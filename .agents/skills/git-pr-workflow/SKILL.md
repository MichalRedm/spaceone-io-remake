---
name: git-pr-workflow
description: End-to-end Git development workflow for spaceone-io-remake. Guides branch creation with standardized names, atomic Conventional Commits, local CI verification, context updates, and Pull Request creation via gh CLI using temporary markdown body files.
---

# Spaceone Remake Git & Pull Request Workflow

Use this skill when developing any feature, bugfix, physics calibration, refactor, or maintenance task on the **Spaceone.io Remake** repository.

---

## Process

### Step 1: Branch Creation & GitHub Issues Protocol
Before modifying any files, verify you are on `main` and branch out:

```bash
git checkout main
git pull origin main
git checkout -b <branch-name>
```

#### Branch Naming Guidelines
- **Issue-Linked Work** (if a GitHub issue exists or is assigned):
  - Features: `feat/<issue-num>-<short-description>`
  - Fixes: `fix/<issue-num>-<short-description>`
  - Refactors: `refactor/<issue-num>-<short-description>`
  - Physics Tuning: `tune/<issue-num>-<short-description>`
- **Direct Prompt Work** (interactive user tasks without existing issues):
  - Features: `feat/<short-description>`
  - Fixes: `fix/<short-description>`
  - Refactors: `refactor/<short-description>`
  - Physics Tuning: `tune/<short-description>`
  - Chores / Docs: `chore/<short-description>` or `docs/<short-description>`

*Note: Do not create redundant GitHub issues for direct prompt tasks just to close them immediately. PR descriptions serve as the primary artifact.*

---

### Step 2: Implement & Commit with Conventional Commits
Write atomic commits as you complete discrete, logical units of work:

```bash
git add <files>
git commit -m "<type>[optional scope]: <description>"
```

- **Allowed types**: `feat`, `fix`, `refactor`, `style`, `test`, `docs`, `chore`
- **Scope**: Noun describing affected area (`engine`, `client`, `physics`, `robots`, `protocol`, `assets`, `telemetry`, `analysis`, `agents`, `ci`), or omitted for broad chores.
- **Linguistic rule**: Imperative, present tense (e.g., `feat(client): add ship trail particle effects`)
- **Atomic Checklist** (ensure all 3 are "Yes" before committing):
  1. *Single Purpose*: Diff solves exactly one problem or feature.
  2. *State Stability*: Codebase compiles (`dotnet build`) at this commit checkpoint.
  3. *Diff Isolation*: Logic changes are isolated from formatting/style changes.
- Refer to [git_and_pr_standards.md](../../rules/git_and_pr_standards.md#2-conventional-commits--atomic-commit-protocol) for complete guidelines.

#### Tracking Out-of-Scope Issues (Optional)
If you discover bugs, physics discrepancies, or technical debt outside the scope of your active branch:
1. Write the issue body to `.tmp_issue_body.md` using the standard Issue templates (see [git_and_pr_standards.md](../../rules/git_and_pr_standards.md#6-standardized-github-issue-structure)).
2. Create the issue via `gh issue create --title "<type>(<scope>): <description>" --body-file .tmp_issue_body.md`.
3. Delete `.tmp_issue_body.md`.
4. Remain focused on your current branch.

---

### Step 3: Mandatory Local CI Verification
Run the exact local verification commands prior to pushing:

```bash
# 1. Backend C# build verification
dotnet build Game.Engine.sln

# 2. Web client formatting & build check
cd Game.Engine/wwwroot
npm run format
npm run build
cd ../..

# 3. Physics analysis syntax verification (if analysis scripts were modified)
python -m py_compile analysis/**/*.py
```

*Ensure there are 0 compiler errors, 0 build failures, and bundle generation succeeds before proceeding.*

---

### Step 4: Check & Synchronize `.agents/` Context
Evaluate if your changes triggered any self-maintenance updates (refer to `agent-maintenance` skill):
- Updated kinematics or equations? -> update [`.agents/context/physics_model.md`](../../context/physics_model.md)
- Added or modified network models? -> update [`.agents/context/network_protocol.md`](../../context/network_protocol.md)
- Completed milestone or roadmap goals? -> check off `[x]` in [`.agents/project_context.md`](../../project_context.md)
- Added dependencies or new rules? -> update [`.agents/rules/`](../../rules/)

Include any necessary `.agents/` updates in your branch commits.

---

### Step 5: Push Branch & Monitor CI
Push your branch to GitHub and observe the remote workflow run (if configured):

```bash
git push -u origin <branch-name>
```

Track the Actions run:
```bash
gh run list --limit 1
gh run watch <run-id> --exit-status
```

---

### Step 6: Create Pull Request via Temporary Body File
To prevent escaping errors and broken markdown on Windows/PowerShell shells, **never pass inline multi-line markdown strings** to `gh`. Always use a temporary file:

1. **Write PR body to `.tmp_pr_body.md`**:
```markdown
## Summary
- Bullet point overview of high-level changes.
- Key outcomes and simulation/gameplay impacts.

## Motivation
- Why this change is necessary.
- Issue reference: `Closes #<issue-num>` or `Resolves #<issue-num>` (if applicable).

## Key Changes (Optional / For multi-part features)
### 1. <Subsystem / Feature Area 1>
- Specific technical modifications made.
### 2. <Subsystem / Feature Area 2>
- Specific technical modifications made.

## Verification
- [x] `dotnet build Game.Engine.sln` succeeded with 0 errors
- [x] `npm run build` succeeded in `Game.Engine/wwwroot`
- [x] <Specific gameplay, kinematic benchmark, or manual verification performed>
```

2. **Execute `gh pr create`**:
```bash
gh pr create --title "<type>(<scope>): <short description>" --body-file .tmp_pr_body.md
```

3. **Delete `.tmp_pr_body.md`**:
```powershell
Remove-Item .tmp_pr_body.md
```
