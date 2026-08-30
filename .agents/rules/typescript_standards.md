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

---

## 8. No `var` Declarations

`var` is function-scoped and hoisted, making temporal behavior unpredictable. Any declaration that should persist for the life of a module or function must use `const`; declarations that are reassigned must use `let`.

- **Use `const`** for any binding that is never reassigned.
- **Use `let`** for counters, accumulator variables, or any binding that changes after declaration.
- **Never use `var`** — this rule applies to all new code and to any file touched during a refactor.

```typescript
// ✅ RECOMMENDED:
const elem = document.documentElement;
let viewCounter = 0;

// ❌ AVOID:
var elem = document.documentElement;
var viewCounter = 0;
```

---

## 9. No Untyped `any` in Interfaces or Class Properties

`renderer?: any`, `body: any`, `customData: any`, and similar declarations on interfaces or class fields nullify compiler safety for the most critical domain objects downstream. Every property that has a finite set of possible shapes must be typed explicitly.

- Use a **union type** when a field can hold one of several known types.
- Use `unknown` + narrowing when the shape is genuinely indeterminate at compile time.

```typescript
// ❌ AVOID — collapses all type safety in cache.ts:
export interface BodyState {
  renderer?: any;
}

// ✅ RECOMMENDED — explicit union:
export interface BodyState {
  renderer?: RenderedObject | Ship | Bullet | Tile;
}
```

---

## 10. `TextureDefinition` — No Untyped `textureDefinition: any` Parameters

The texture definition object parsed from SCSS theme rules appears in 6+ method signatures as `any`. Always use the `TextureDefinition` interface (defined in `src/models/textureUtils.ts`) instead.

```typescript
// ❌ AVOID:
static loadTexture(textureDefinition: any, textureName: string): any { ... }

// ✅ RECOMMENDED:
import type { TextureDefinition } from "../models/textureUtils";
export function loadTexture(textureDefinition: TextureDefinition, textureName: string): PIXI.Texture[] | null { ... }
```

The canonical `TextureDefinition` interface shape:

```typescript
export interface TextureDefinition {
  file?: string;
  url?: string;
  animated?: boolean;
  loop?: boolean;
  emitter?: string | Record<string, unknown>;
  particle?: string;
  map?: boolean;
  tint?: string | number;
  alpha?: number;
  blendMode?: number;
  size?: string | number;
  scale?: string | number;
  rotate?: string | number;
  offset?: { x: number; y: number };
  "offset-x"?: number;
  "offset-y"?: number;
  "animation-speed"?: number;
  "tile-size"?: number;
  "tile-count"?: number;
  "image-width"?: number;
  "image-height"?: number;
  "tile-width"?: number;
  "tile-height"?: number;
}
```

---

## 11. No Inline HTML String Building for XSS-Sensitive Content

`innerHTML` assignments using string concatenation with server-supplied data are an XSS vector. Every user-controlled value injected into HTML must pass through `escapeHtml()`. Color values from the server must be validated against an explicit string-literal union allowlist before being placed inside a `style` attribute.

```typescript
// ❌ DANGEROUS — entry.Color is server-controlled and injected into style attribute:
const begin = `<tr style="color:${entry.Color}">`;

// ✅ RECOMMENDED — validate against an allowlist first:
const VALID_COLORS = new Set(["cyan", "blue", "green", "orange", "pink", "red", "yellow", "gray", "white"]);
const safeColor = VALID_COLORS.has(entry.Color ?? "") ? entry.Color : "white";
const begin = `<tr style="color:${safeColor}">`;
```

---

## 12. Named Constants for Magic Numbers in Animation & Physics

Numeric literals embedded directly in animation math (alpha thresholds, fade timing, curve constants) are untraceable and error-prone. Extract them to a named `const` object co-located with their consuming module.

- **Server-driven timings** (boost duration, invulnerability period, bullet lifetime) live in `WorldConfig`.
- **Client-side visual constants** (fade-in ramp ms, alpha thresholds, flicker frequencies) live in a module-level `ANIMATION_CONSTANTS` object in `spriteAnimator.ts`.

```typescript
// ❌ AVOID — opaque literals scattered across the render loop:
const fadeOut = remaining < 112.5 ? Math.max(0.0, remaining / 112.5) : 1.0;
layer.alpha = 0.25;

// ✅ RECOMMENDED — named and grouped:
const ANIMATION_CONSTANTS = {
  BULLET_FADE_OUT_MS: 112.5,
  BULLET_FADE_IN_MS: 56.25,
  INVULN_BLINK_DIM_ALPHA: 0.25,
  DASH_TRAIL_BASE_ALPHA: 0.85,
  DASH_TRAIL_FLICKER_AMP: 0.15,
} as const;

const fadeOut = remaining < ANIMATION_CONSTANTS.BULLET_FADE_OUT_MS
  ? Math.max(0.0, remaining / ANIMATION_CONSTANTS.BULLET_FADE_OUT_MS)
  : 1.0;
```

---

## 13. Single Responsibility: Extract Pure Static Utilities Out of Classes

Any `static` method on a class that does **not** access `this` or class-level static state is a plain function masquerading as a method. Extract it to a standalone exported function in a dedicated module.

```typescript
// ❌ AVOID — pure utility hidden inside RenderedObject:
export class RenderedObject {
  static parseMapKey(mapKey: string): { name: string; mapID: number } | false { ... }
  static getScaleWithHeight(textureDefinition: any, height: number): number { ... }
}

// ✅ RECOMMENDED — in src/models/textureUtils.ts:
export function parseMapKey(mapKey: string): { name: string; mapID: number } | false { ... }
export function getScaleWithHeight(def: TextureDefinition, height: number): number { ... }
```

Corollary: `calculateScaleWithHeight` is the single canonical scale utility; do **not** duplicate it in `RenderedObject`. Import from `src/rendering/atlasLoader.ts`.

---

## 14. `RenderedObject` as View Controller Only (Facade Pattern)

`RenderedObject` must be a thin **View controller** whose sole responsibility is owning PIXI display objects and delegating to injected services. It must not:
- Contain inline animation math (boost/invulnerability/fade curves) — delegate to `SpriteAnimator`.
- Contain texture/SCSS-rule querying logic — delegate to `TextureLoader`.
- Manage global group-state caches (`groupBoostTimes`, etc.) — these live in `SpriteAnimator`.

Anti-pattern: computing alpha channels, rotation offsets, and scale factors directly inside `moveSprites()`.
Golden pattern: `this.animator.animate(this, position, size, now)`.

| Responsibility | Owner |
| :--- | :--- |
| PIXI display object lifecycle (add/remove/destroy) | `RenderedObject` |
| Per-frame alpha, visibility, scale animation | `SpriteAnimator` |
| Texture resolution & SCSS rule querying | `TextureLoader` |
| Particle emitter construction | `TextureLoader` + `GroupParticle` |
| Pure math helpers (parseMapKey, getScale) | `textureUtils.ts` (standalone functions) |
