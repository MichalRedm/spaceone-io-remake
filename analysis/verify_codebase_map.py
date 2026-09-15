#!/usr/bin/env python3
"""
verify_codebase_map.py - Validates that all file paths referenced in
.agents/context/codebase_map.md physically exist in the repository.

Usage:
    python analysis/verify_codebase_map.py
"""

import sys
import re
from pathlib import Path

def main():
    repo_root = Path(__file__).resolve().parent.parent
    map_file = repo_root / ".agents" / "context" / "codebase_map.md"

    if not map_file.exists():
        print(f"[ERROR] Codebase map not found at {map_file}", file=sys.stderr)
        return 1

    content = map_file.read_text(encoding="utf-8")

    # Match paths in code blocks: e.g. `Game.Engine/Core/World.cs`
    pattern = re.compile(r"`([a-zA-Z0-9_\-\.\/]+(?:/[a-zA-Z0-9_\-\.\/]+)+\.[a-zA-Z0-9]+)`")
    matches = sorted(set(pattern.findall(content)))

    if not matches:
        print("[ERROR] No file paths detected in codebase map.", file=sys.stderr)
        return 1

    missing = []
    found = []

    for path_str in matches:
        # Ignore wildcard globs or directory patterns ending with / or *
        if "*" in path_str:
            continue
        
        target = repo_root / path_str
        if target.exists():
            found.append(path_str)
        else:
            missing.append(path_str)

    print("=" * 70)
    print(f"Codebase Map Link Verification ({len(found)}/{len(found) + len(missing)} valid)")
    print("=" * 70)

    for path_str in found:
        print(f"  [OK]      {path_str}")

    if missing:
        print("\n" + "=" * 70)
        print(f"FAILED: {len(missing)} broken file reference(s) found in codebase_map.md:")
        print("=" * 70)
        for path_str in missing:
            print(f"  [MISSING] {path_str}")
        return 1

    print("\n[SUCCESS] 100% of referenced file paths exist on disk.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
