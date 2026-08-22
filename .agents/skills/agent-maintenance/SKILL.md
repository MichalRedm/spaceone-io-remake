---
name: agent-maintenance
description: Maintain and update the .agents/ directory structure to reflect the current state of the repository after completing features, updating models, or altering dependencies.
---

# Agent Repo Maintenance Skill

Use this skill when you finish implementing a major feature, detect a shift in the tech stack or dependencies, modify database models/API endpoints, or resolve significant architectural debts.

## Maintenance Procedure

1. **Update Project Context (`.agents/project_context.md`)**:
   - Check off `[x]` finished roadmap tasks.
   - Add newly discovered or upcoming roadmap tasks `[ ]`.
   - Update the overarching objective or milestone focus if changed.

2. **Synchronize Data Models & Architecture (`.agents/context/`)**:
   - Update `architecture_overview.md`, `physics_model.md`, or `network_protocol.md` if interfaces, formulas, or schemas changed.

3. **Refine Rules & Standards (`.agents/rules/`)**:
   - Add new framework/tool conventions.
   - Append rows to the **Anti-Pattern & Pitfall Traps** tables when bugs or recurring edge cases are resolved.
   - Update `ci_standards.md` if build, lint, or test commands evolve.

4. **Commit Updates**:
   - Stage and commit `.agents/` documentation alongside feature code following the Conventional Commits protocol.
