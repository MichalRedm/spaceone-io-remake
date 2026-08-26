# TypeScript Coding Standards & Style Guide

> [!IMPORTANT]
> **Trigger Paths**: `Game.Engine/wwwroot/src/**/*.ts`
> **When to Read**: MUST be read before defining types, interfaces, PixiJS models, network contracts, or client utility methods.

This document defines the strict coding standards, architectural rules, and style conventions for writing TypeScript in **Spaceone.io Remake** within `Game.Engine/wwwroot/src/`.

---

## 1. Function Declarations vs. Arrow Functions

To maintain consistency, readability, and clean debugging stack traces:

### Rule 1.1: Top-Level Named Functions
- **Always use `function` declarations** (or `async function`) for all top-level named entities:
  - Utility and helper functions: `export function escapeHtml(str?: string): string { ... }`
  - Parser routines: `export function parseScssIntoRules(scss: string): ThemeRule[] { ... }`
  - Network handlers: `export function handleWorldView(view: NetWorldView): void { ... }`
  - UI initialization: `export function bootstrapPopups(): void { ... }`

```typescript
// ✅ RECOMMENDED: Top-level function declaration
export function queryProperties(element: ElementQueryProps, ruleList?: ThemeRule[]): PropertyMap {
  ...
}

// ❌ AVOID: Top-level arrow function assignment
export const queryProperties = (element: ElementQueryProps, ruleList?: ThemeRule[]): PropertyMap => {
  ...
};
```

### Rule 1.2: Arrow Functions
- **Use arrow functions (`() => {}`) exclusively for**:
  - Array higher-order callbacks: `.map(x => x.id)`, `.filter(...)`, `.reduce(...)`
  - Event listener callbacks: `button.addEventListener('click', (e) => { ... })`
  - Closures, timers, and small local helper callbacks inside functions: `setTimeout(() => { ... }, 1000)`
  - Promise chains: `.then((res) => res.json())`

---

## 2. Quotes & Formatting Standards

Code formatting is standardized across the entire repository via Prettier:

1. **TypeScript Files (`.ts`)**: Use double quotes (`"..."`) or single quotes consistently, with semicolons (`;`) terminating statements.
2. **Template Literals**: Use backticks (`` `...` ``) only when string interpolation (`${value}`) or multi-line strings are required. Do not use backticks for plain static strings.
3. **Indentation**: 2 spaces (no tabs).

---

## 3. Strict Type Safety & The Zero-`any` Policy

TypeScript is used to provide compile-time safety and self-documenting APIs. Bypassing the compiler undermines the entire codebase.

### Rule 3.1: Zero `any` Policy
- **Avoid `any`** in parameter types, return types, variable annotations, or type casts (`as any`).
- `tsconfig.json` enforces `"noImplicitAny": true` and strict type checks.

### Rule 3.2: Use `unknown` for Dynamic or External Network Data
- When data type is truly dynamic, unknown at compile time, or coming from external untrusted inputs / WebSocket payloads:
  - Annotate as `unknown`.
  - Narrow the type using `typeof`, `instanceof`, or custom type guards before accessing properties.

```typescript
// ✅ RECOMMENDED: Safe unknown error handling
try {
  await apiCall();
} catch (err: unknown) {
  if (err instanceof Error) {
    console.error(err.message);
  } else {
    console.error('Unexpected error', err);
  }
}
```

---

## 4. `interface` vs. `type` & Naming Conventions

### Rule 4.1: When to Use `interface`
Use `interface` for all structured object contracts, models, and component options:
- Pixi.js model properties: `export interface ShipRenderOptions { ... }`
- Theme rule structures: `export interface ThemeRule { selector: string; obj: Record<string, string[]>; }`
- Network packet schemas and DTOs: `export interface LeaderboardEntry { ... }`

### Rule 4.2: When to Use `type`
Use `type` (type alias) for non-object or compound type definitions:
- String literal unions: `export type PopupName = 'changelog' | 'instructions';`
- Primitive aliases or coordinate tuples: `export type Coordinates = [number, number];`
- Mapped / utility types: `export type Nullable<T> = T | null;`

### Rule 4.3: Interface Naming (No `I` Prefix)
- **Do NOT prefix interfaces with `I`** (avoid Hungarian notation like `IShip` or `IThemeRule`).
- Use clear domain nouns: `ThemeRule`, `RenderOptions`, `LeaderboardEntry`.

---

## 5. Type-Only Imports (`import type`)

### Rule 5.1: Enforce `import type`
Always use `import type` when importing types, interfaces, or type aliases that have no runtime representation:

```typescript
// ✅ RECOMMENDED: Type-only import
import type { Vector2 } from "../math/vector2";
import type { CustomContainer } from "../rendering/customContainer";

// ❌ AVOID: Runtime import of pure types
import { CustomContainer } from "../rendering/customContainer"; // when only used as a type annotation
```

---

## 6. Null, Undefined, and Safe Operators

### Rule 6.1: Prefer Nullish Coalescing (`??`) Over Logical OR (`||`)
Use `??` when providing fallback values to avoid unintentionally overriding valid falsy values (`0`, `""`, `false`):
```typescript
// ✅ RECOMMENDED:
const tileSize = textureDefinition["tile-size"] ?? 32;
const score = entry.Score ?? 0;

// ❌ DANGEROUS:
const score = entry.Score || 0; // If score is 0, evaluates to right operand!
```

### Rule 6.2: Safe Navigation with Optional Chaining (`?.`)
Use optional chaining (`element?.classList?.add(...)`) instead of verbose nested boolean checks.

---

## 7. Anti-Pattern & Pitfall Traps

| Anti-Pattern Trap | Why It Fails | Golden Pattern |
| :--- | :--- | :--- |
| **Using `any` or `as any`** | Destroys compiler safety and introduces subtle runtime crashes. | Define explicit interfaces or use `unknown` with type narrowing. |
| **Global `window.PIXI` Overwriting** | Overwrites the mutable Pixi namespace with frozen module namespaces. | Import `bootstrap.ts` first and use typed global declarations. |
| **Direct DOM Manipulation in Render Loop** | Triggers layout reflows on every 60 FPS frame. | Update canvas UI via Pixi display objects; perform DOM updates out-of-loop. |
| **Untyped FlatBuffers Access** | Results in missing packet fields or mismatched byte offsets. | Use generated FlatBuffers types from `src/network/game_generated.ts`. |
