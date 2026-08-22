# CI Standards & Local Verification Rules

> [!IMPORTANT]
> **Trigger Paths**: `.github/workflows/**`, `Game.Engine.sln`, `package.json`, `Game.Engine/wwwroot/package.json`
> **When to Read**: MUST be read before pushing commits or creating pull requests.

To maintain code quality and prevent CI build failures, all changes must be verified locally before pushing.

## Mandatory Local Verification Checklist

| Target Area | Verification Command | Expected Output |
| :--- | :--- | :--- |
| **Backend Solution** | `dotnet build Game.Engine.sln` | Build succeeded with 0 Errors. |
| **Client Formatting** | `cd Game.Engine/wwwroot && npm run format` | Prettier formats code cleanly. |
| **Client Build** | `cd Game.Engine/wwwroot && npm run build` | Vite bundle succeeds. |
| **Analysis Scripts** | `python -m py_compile analysis/**/*.py` | Syntax and imports valid. |

---

## Failure Resolution Protocol
1. **Compilation Errors**: Inspect compiler errors, verify NuGet package compatibility, and check method signatures before re-running `dotnet build`.
2. **Bundle Errors**: Ensure all asset paths and module imports exist in `Game.Engine/wwwroot`.
3. **No Warning Suppressions**: Never suppress compilation warnings using `#pragma warning disable` without clear justification.
