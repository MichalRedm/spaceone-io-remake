# Git & Pull Request Standards

> [!IMPORTANT]
> **Trigger Paths**: Any workspace Git source control action (branching, committing, pushing, PR/issue creation).
> **When to Read**: MUST be read before staging changes, formatting Conventional Commits, running pre-push CI verification, or opening GitHub PRs/issues.

This rule document governs all version control, branching, committing, issue tracking, and pull request operations across the **Spaceone.io Remake** repository. All AI assistants and contributors must operate strictly according to this protocol.

---

## 1. Branching Strategy & GitHub Issues Protocol

Never commit directly to the `main` branch. The `main` branch is protected by a GitHub Ruleset that strictly blocks direct pushes and force pushes, requiring all changes to pass CI checks and be merged via a Pull Request. Merged feature branches are automatically deleted upon merge (`delete_branch_on_merge`).

Always create a feature, fix, or refactor branch before writing code:

```bash
git checkout main
git pull origin main
git checkout -b <branch-name>
```

### Hybrid GitHub Issues Protocol
We follow a pragmatic, context-aware approach to GitHub Issues:

1. **Issue-Linked Work**: If an issue already exists on GitHub or the user provides an issue number:
   - Branch name: `feat/<issue-num>-<short-description>` or `fix/<issue-num>-<short-description>`
   - Link in PR: Include `Closes #<issue-num>` or `Resolves #<issue-num>` in the PR body.
2. **Direct Prompt Work (Default)**: For interactive feature requests, physics calibrations, refactors, and bugfixes without pre-existing issues:
   - Branch name: `feat/<short-description>`, `fix/<short-description>`, `refactor/<short-description>`, etc.
   - Do NOT create redundant intermediate GitHub issues just to immediately close them. The Pull Request body serves as the primary artifact.
3. **Out-of-Scope Bug & Tech Debt Tracking**: If you discover defects, physics divergences, missing tests, or architectural debts outside the active task scope:
   - File a new GitHub Issue using the standard Issue templates (see Section 6) via `gh issue create --body-file .tmp_issue_body.md`.
   - Keep the active branch strictly focused on its primary objective.

### Branch Naming Conventions
- **New Features**: `feat/<short-description>` or `feat/<issue-number>-<short-description>`
- **Bug Fixes**: `fix/<short-description>` or `fix/<issue-number>-<short-description>`
- **Refactoring**: `refactor/<short-description>` or `refactor/<issue-number>-<short-description>`
- **Physics Calibration**: `feat/physics-<short-description>` or `tune/<short-description>`
- **Documentation**: `docs/<short-description>`
- **Chores / Tooling**: `chore/<short-description>`

*Examples:* `feat/laser-sprite-atlas`, `fix/fleet-cohesion-jitter`, `refactor/spatial-rbush-query`, `tune/thrust-drag-curve`

---

## 2. Conventional Commits & Atomic Commit Protocol

All commit messages must strictly adhere to the Conventional Commits specification:

```
<type>[optional scope]: <description>
```

### Allowed Types
- `feat`: A new feature or simulation capability is introduced.
- `fix`: A bug, collision glitch, or physics defect is patched.
- `refactor`: Code rewriting without changing external behavior or fixing a bug.
- `style`: Formatting changes that do not alter code logic (e.g., whitespace, linter formatting). Game UI / visual rendering styling should be categorized as `feat` or `fix`.
- `test`: Adding, updating, or correcting tests or physics benchmark harnesses.
- `docs`: Documentation-only changes.
- `chore`: Updating build tasks, configurations, dependencies, or agent context.

### Scope Guidelines
The `[optional scope]` provides context on what module or architectural layer the commit affects:
1. **Noun-Based**: Must be a single, meaningful lowercase noun describing the affected area:
   - `engine`: Core C# game server, game rooms, world loop (`Game.Engine`)
   - `client`: WebGL / Pixi.js frontend client (`Game.Engine/wwwroot`)
   - `physics`: Kinematics, collision detection, drag models, fleet cohesion
   - `robots`: AI bot behaviors, context steering, genetic evolution (`Game.Robots`)
   - `protocol`: FlatBuffers schema, binary serialization, WebSocket networking
   - `assets`: Texture atlases, sprites, audio, UI graphics
   - `telemetry`: Gameplay session logs, CSV datasets, recording parsers
   - `analysis`: Python physics calibration scripts, regression/loss algorithms
   - `agents`: AI context files, rules, skills, and documentation in `.agents/`
   - `ci`: Build scripts, GitHub Actions, Docker, or solution configurations
2. **Short & Lowercase**: Keep it brief (one word) and strictly lowercase (e.g., `fix(physics): ...`).
3. **No File Paths**: Do NOT use file names or relative file paths as scopes (e.g., `fix(Hook.cs)` is invalid).
4. **When to Omit**: Omit the scope if the commit affects multiple areas equally or represents a broad chore (e.g., `chore: update dependencies`).

### Linguistic Rule
- Write `<description>` in the **imperative, present tense** (e.g., `feat(client): implement interpolated ship rendering`, NOT `implemented` or `implementing`).

### Granularity Protocol (Atomic Commits Checklist)
Before staging and committing changes, evaluate this internal 3-point checklist. If any answer is **"No"**, split the changes into smaller, discrete commits:
1. **Single Purpose**: Does this commit solve exactly one logical problem or implement exactly one discrete feature/fix?
2. **State Stability**: If this individual commit is checked out independently, does the codebase build cleanly (`dotnet build`) and do all tests pass?
3. **Diff Isolation**: Are logic changes kept separated from formatting, styling, or unrelated refactoring changes?

### Execution Triggers
- **Commit Trigger**: Commit as soon as a single, logical unit of work (as defined by the checklist) is fully implemented and locally verified (or to create a safe fallback point prior to attempting experimental changes).
- **Push Trigger**: Push to remote when a branch is complete and ready for PR review, or when saving progress to prevent data loss.

### Repository Hygiene & Sensitive Data Safeguards
Before staging files (`git add`), verify repository hygiene:
1. **No Sensitive Info**: Check for secrets, credentials, bot tokens, API keys, or `.env` files.
2. **No Build/Local Artifacts**: Ensure build output (`bin/`, `obj/`, `dist/`, `.cache/`), scratch files, and OS metadata are ignored or not staged.
3. **Gitignore Compliance**: Check `.gitignore` before committing new file types.

---

## 3. Mandatory Pre-Push Verification

Before executing `git push`, you MUST run local CI equivalents:

```bash
# 1. Backend build & compilation check
dotnet build Game.Engine.sln

# 2. Web Client formatting & bundling check
cd Game.Engine/wwwroot
npm run format
npm run build
cd ../..

# 3. Physics analysis syntax verification (if analysis files modified)
python -m py_compile analysis/**/*.py
```

*Ensure there are 0 compiler errors, 0 build failures, and bundle generation succeeds before proceeding.*

---

## 4. Push & CI Workflow Monitoring

1. Push your branch to the remote origin:
   ```bash
   git push -u origin <branch-name>
   ```
2. Monitor GitHub Actions CI in real-time (if configured):
   ```bash
   gh run list --limit 1
   gh run watch <run-id> --exit-status
   ```
3. If remote CI fails, immediately inspect logs (`gh run view <run-id> --log`), resolve discrepancies locally, commit, and re-push.

---

## 5. Standardized Pull Request Protocol

### ⚠️ Critical Rule: Mandatory Temporary Body File
**NEVER** pass multi-line or formatted markdown directly via inline CLI arguments (`gh pr create --body "..."`). On Windows/PowerShell shells, inline quotes, newlines, backticks, and markdown formatting get mangled, causing syntax errors or broken PR formatting.

**Always use a temporary markdown file:**
1. Write the PR content to `.tmp_pr_body.md`.
2. Run `gh pr create --title "<type>(<scope>): <description>" --body-file .tmp_pr_body.md`.
3. Delete `.tmp_pr_body.md` immediately after PR creation.

### Pull Request Structure Standard
Every PR description must follow this structure:

```markdown
## Summary
- Bullet point overview of high-level changes.
- Key outcomes and simulation/gameplay impacts.

## Motivation
- Why this change is necessary.
- Context on the problem solved or feature introduced.
- Issue reference: `Closes #<issue-num>` or `Resolves #<issue-num>` (if applicable).

## Key Changes (Optional / For multi-part features)
### 1. <Subsystem / Feature Area 1>
- Specific technical modifications made.
### 2. <Subsystem / Feature Area 2>
- Specific technical modifications made.

## Verification
- [x] `dotnet build Game.Engine.sln` succeeded with 0 errors
- [x] Client bundle built cleanly (`npm run build` in `Game.Engine/wwwroot`)
- [x] <Specific gameplay, kinematic benchmark, or manual verification performed>
```

---

## 6. Standardized GitHub Issue Structure

When creating GitHub Issues for new features, bug reports, physics discrepancies, or technical debt, always use a temporary file (`.tmp_issue_body.md`) and adhere to these standardized templates:

### Bug / Physics Discrepancy Report (`fix`)
```markdown
## Problem Summary
<Clear, concise description of the defect, physics inaccuracy, or rendering glitch.>

## Steps to Reproduce
1. Start local server via `dotnet run --project Game.Engine`
2. Open client at `http://localhost:5000`
3. Execute actions '...'
4. Observe unexpected behavior '...'

## Expected vs Actual Behavior
- **Expected**: <What should happen according to original Spaceone mechanics>
- **Actual**: <What currently happens in the remake simulation>

## Affected Area & Environment
- Module: `engine` | `client` | `physics` | `robots` | `protocol` | `assets`
- Reference comparison: (e.g., divergence from `reference/space1-original/recordings/complete.csv`)
```

### Feature / Enhancement Request (`feat`)
```markdown
## Feature Summary & Context
<High-level overview of the proposed gameplay feature, visual effect, or bot capability.>

## Proposed Solution & Implementation Details
- <Key server-side additions in Game.Engine>
- <Pixi.js rendering or sprite atlas integrations in wwwroot>
- <Protocol or FlatBuffers schema adjustments>

## Acceptance Criteria
- [ ] <Requirement 1 fulfilled>
- [ ] <Requirement 2 fulfilled>
- [ ] `dotnet build Game.Engine.sln` and client build pass cleanly with 0 errors.
```

### Refactoring & Technical Debt (`refactor`)
```markdown
## Current State & Pain Points
<Detailed description of existing architectural debts, performance bottlenecks, or code duplication.>

## Proposed Refactoring Strategy
- <Target components to decompose/optimize (e.g. spatial indexing, tick loop allocs)>
- <Design pattern or data structure improvement>

## Acceptance Criteria
- [ ] Existing simulation behavior preserved without regressions.
- [ ] Zero runtime allocations in critical tick loop paths.
- [ ] All CI builds and local verifications pass cleanly.
```

---

## 7. Context Self-Maintenance Check

Before submitting a Pull Request for significant changes:
- Check if `.agents/project_context.md`, `.agents/context/physics_model.md`, `.agents/context/architecture_overview.md`, `.agents/context/network_protocol.md`, or `.agents/rules/` require updates to reflect the new state.
- Include those context updates in the branch commits.
