# AGENTS.md - Master Instructions & Context for AI Assistants

Welcome to the **Spaceone.io Remake** repository! This file serves as the primary entry point, high-level context map, and deterministic rule routing matrix for AI coding assistants.

---

## 🏛️ Project Architecture & Overview

This project remakes the classic 2D multiplayer fleet combat game **Spaceone.io** using a high-performance authoritative C# game server (based on Daud.io) and a WebGL/Pixi.js client. Gameplay sessions and original assets are preserved in `reference/space1-original/` to drive exact visual fidelity and empirical ML physics calibration in `analysis/`.

---

## 🚦 Mandatory Rule Routing Matrix

Before writing or modifying any code, identify your target area and **read the corresponding rule file FIRST**:

| When working on / modifying... | Target Paths / Globs | Mandatory File to Read FIRST | Key Invariants & Pitfalls to Check |
| :--- | :--- | :--- | :--- |
| **Game Server & Physics Engine** | `Game.Engine/**`, `Game.API.*/**` | [`.agents/rules/game_engine_standards.md`](.agents/rules/game_engine_standards.md)<br>[`.agents/context/physics_model.md`](.agents/context/physics_model.md) | • Fixed-timestep tick loop invariants<br>• Thread safety & spatial partitioning (RBush)<br>• FlatBuffers protocol synchronization |
| **Web Client & Rendering** | `Game.Engine/wwwroot/**` | [`.agents/rules/client_web_standards.md`](.agents/rules/client_web_standards.md) | • Pixi.js sprite atlas coordinate mapping<br>• Render interpolation & smooth camera lag<br>• Asset pipeline isolation from server builds |
| **Robots & AI Behaviors** | `Game.Robots/**` | [`.agents/rules/robot_ai_standards.md`](.agents/rules/robot_ai_standards.md) | • Context-steering vector arithmetic<br>• Flocking & fleet avoidance heuristics<br>• Genetic algorithm controller constraints |
| **Physics Analysis & ML Tuning** | `analysis/**` | [`.agents/rules/physics_tuning_standards.md`](.agents/rules/physics_tuning_standards.md) | • Ground-truth telemetry loss metrics<br>• Kinematic feature extraction & curve fitting<br>• Isolated dataset generation scripts |
| **CI & Local Verification** | Monorepo root / CI scripts | [`.agents/rules/ci_standards.md`](.agents/rules/ci_standards.md) | • Multi-toolchain build checks (`dotnet`, `npm`)<br>• Clean output verification before pushing |
| **Git, Commits, CI, PRs & Issues** | Source control operations | [`.agents/skills/git-pr-workflow/SKILL.md`](.agents/skills/git-pr-workflow/SKILL.md)<br>[`.agents/rules/git_and_pr_standards.md`](.agents/rules/git_and_pr_standards.md) | • Atomic Conventional Commits (`feat(scope): ...`)<br>• Mandatory `.tmp_pr_body.md` for PR creation<br>• Hybrid issue protocol & pre-push local CI |

---

## 🔄 Operational Phase Gates

Every task must progress sequentially through these 5 lifecycle gates:

```
[ Gate 1: Rule & Contract Intake ] ➔ [ Gate 2: Implementation ] ➔ [ Gate 3: Local CI Verification ] ➔ [ Gate 4: Context Maintenance ] ➔ [ Gate 5: Git & PR Protocol ]
```

1. **Gate 1: Rule & Contract Intake (MANDATORY)**:
   - Identify files to be modified. Read the required rule files from the *Rule Routing Matrix* using `view_file`.
   - Inspect existing game hooks, models, or telemetry formats before altering logic.
2. **Gate 2: Implementation**:
   - Write clean, deterministic code adhering to golden patterns and avoiding anti-pattern traps in `.agents/rules/`.
3. **Gate 3: Local CI Verification**:
   - Execute all local verification commands (`dotnet build Game.Engine.sln`, client format & build).
4. **Gate 4: Context Self-Maintenance**:
   - Follow [`.agents/skills/agent-maintenance/SKILL.md`](.agents/skills/agent-maintenance/SKILL.md) whenever engine mechanics, models, or roadmap items evolve.
5. **Gate 5: Git & PR Protocol**:
   - Follow [`.agents/skills/git-pr-workflow/SKILL.md`](.agents/skills/git-pr-workflow/SKILL.md): Stage and commit with atomic Conventional Commits; push and create PR via temporary `.tmp_pr_body.md`.

---

## ⚙️ Core CLI Tools & Build Commands

Always run these commands from their respective working directories:

| Purpose | Working Directory | Command |
| :--- | :--- | :--- |
| **Build Backend Solution** | Monorepo root | `dotnet build Game.Engine.sln` |
| **Run Game Server** | `Game.Engine` | `dotnet run` |
| **Install Client Packages** | `Game.Engine/wwwroot` | `npm install` |
| **Build Web Client** | `Game.Engine/wwwroot` | `npm run build` |
| **Format Client Code** | `Game.Engine/wwwroot` | `npm run format` |

---

## 🚨 Operational Boundaries & Escalation

- **Always**:
  - Consult the *Mandatory Rule Routing Matrix* before writing or modifying code.
  - Follow [git-pr-workflow](.agents/skills/git-pr-workflow/SKILL.md) for branch naming, atomic commits, and PR creation via `.tmp_pr_body.md`.
  - Verify backend compilation (`dotnet build`) and frontend bundling before committing.
- **Ask First (Human Escalation Gateways)**:
  - Introducing new native NuGet or npm dependencies.
  - Changing network serialization protocols or breaking backward compatibility.
  - Modifying core game loop tick frequency or spatial partitioning algorithms.
- **Never (Safety & Workflow Anti-Patterns)**:
  - Never commit `.env` files, secrets, tokens, or temporary debug logs.
  - Never suppress compiler warnings or linter errors to force builds to pass.
  - Never push directly to `main` without verified branch PR.

---

## 📁 Repository Layout & Navigation Map

- `AGENTS.md`: Master entry point & rule routing matrix (this file)
- `README.md`: Public project documentation
- `Game.Engine/`: Authoritative C# ASP.NET Core game server, physics simulation & WebSockets
  - `wwwroot/`: Pixi.js 2D frontend web client & game UI
- `Game.API.Common/` & `Game.API.Client/`: Shared networking contracts & API client library
- `Game.Robots/`: Autonomous bot logic, context steering & evolutionary algorithms
- `Game.Util/`: Server administration, stress testing & automation CLI tools
- `reference/space1-original/`: Original Spaceone.io assets, wasm client, decoders & telemetry recordings
- `analysis/`: Kinematic analysis scripts, physics experiments & ML parameter optimization
- `.agents/`: Agent configuration schema, rules, architectural context, and maintenance skills
  - `rules/`: Modular standards (`game_engine`, `client_web`, `robot_ai`, `physics_tuning`, `ci`, `git_and_pr`, `agent_maintenance`)
  - `context/`: Deep domain context (`architecture_overview`, `physics_model`, `network_protocol`)
  - `skills/`: Project-specific skills (`git-pr-workflow`, `agent-maintenance`)
