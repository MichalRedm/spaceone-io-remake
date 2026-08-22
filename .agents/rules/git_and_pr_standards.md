# Git and Pull Request Standards

> [!IMPORTANT]
> **Trigger Paths**: `.git/**`, `AGENTS.md`
> **When to Read**: MUST be read before staging files, creating git commits, or submitting pull requests.

## 1. Commit Message Schema (Conventional Commits)
All commit messages must strictly follow the Conventional Commits specification:
`<type>[optional scope]: <description>`

- **Allowed Types**:
  - `feat`: New feature or capability
  - `fix`: Bug patch or issue fix
  - `refactor`: Code restructure without behavioral alteration
  - `style`: Formatting, whitespace, or cosmetic code changes
  - `test`: Adding or correcting tests
  - `docs`: Documentation updates
  - `chore`: Dependency updates, build configs, or tooling tasks
- **Linguistic Rule**: Imperative, present tense (`feat: add laser sprite atlas`, NOT `added`).

## 2. Granularity Protocol (Atomic Commits)
- **Single Purpose**: Each commit must solve exactly one problem or introduce one feature.
- **State Stability**: The project must compile (`dotnet build`) at every commit.
- **Diff Isolation**: Keep refactors/formatting separate from logical changes.

---

## 3. Anti-Pattern & Pitfall Traps

| Anti-Pattern Trap | Why It Fails | Golden Pattern |
| :--- | :--- | :--- |
| **Committing secrets or `.env` files** | Violates security and triggers GitHub Push Protection rejection. | Verify `.gitignore` and run secret scans before staging files. |
| **Vague commit messages (`fix stuff`)** | Destroys git history readability and automated changelog generation. | Use structured Conventional Commits (`fix(physics): clamp max fleet velocity`). |
| **Pushing without local build check** | Pushes broken code to remote repository and breaks CI. | Always run `dotnet build` and local verification before `git push`. |
