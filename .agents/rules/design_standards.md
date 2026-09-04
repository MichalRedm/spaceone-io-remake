# Frontend Design Standards & Design System Specification

> [!IMPORTANT]
> **Trigger Paths**: `Game.Engine/wwwroot/**`, `Game.Engine/wwwroot/src/styles/**`, `Game.Engine/wwwroot/src/ui/**`, `Game.Engine/wwwroot/index.html`
> **When to Read**: MUST be read before creating, modifying, or styling any UI component, button, modal dialog, HUD indicator, layout template, or SCSS stylesheet.

This document serves as the authoritative **Source of Truth** for the visual aesthetics, design tokens, component architecture, layout hierarchy, and interaction design of the **Spaceone.io Remake** web client. All frontend development must strictly adhere to these standards to ensure pixel-perfect fidelity with the classic Spaceone.io arcade experience.

---

## 1. Design Philosophy & Aesthetic Identity

**Spaceone.io** is a fast-paced, high-stakes 2D multiplayer space combat arena. Its visual identity balances retro arcade vibrancy with clean, modern sci-fi HUD telemetry:

1. **Arcade Neon Vibrancy**: High-contrast, luminous glowing borders (`box-shadow: 0 0 30px ...`), 50/50 horizontal split-gradient buttons, and saturated primary neon accents (Blue `#0052ff`, Yellow `#fae40b`, Green `#71ff00`, Pink `#c21a6e`, Purple `#8718bb`).
2. **Deep Starfield & Glassmorphism Surfaces**: UI panels and modal dialogs float above the deep black canvas starfield using dark translucent navy backgrounds (`rgba(61, 120, 255, 0.2)` to `rgba(10, 25, 55, 0.95)`) framed with crisp 2px/3px neon borders and diffuse ambient glows.
3. **Zero-Friction Combat Ergonomics**: In-game HUD overlays (leaderboard, autofire, danger warnings, player names, cooldown bar) are positioned cleanly on the screen periphery or centered above the ship, ensuring maximum situational visibility during intense fleet skirmishes.
4. **Strict View-State Lifecycle Layering**: UI elements are explicitly separated into lifecycle states (`view-state--menu`, `view-state--alive`, `view-state--game`, `view-state--spectating`), guaranteeing that spawnscreen menus and in-game combat HUDs never visually overlap or interfere.

---

## 2. Design Tokens & SCSS Architecture

All stylesheets in `Game.Engine/wwwroot/src/styles/` adhere to the **7-1 Sass Directory Pattern**:
```
src/styles/
├── abstracts/      # Variables, functions, mixins (no CSS output)
│   ├── _functions.scss
│   ├── _index.scss
│   ├── _mixins.scss
│   └── _variables.scss
├── base/           # Global resets, typography, root lifecycle, keyframe animations
│   ├── _animations.scss
│   ├── _index.scss
│   ├── _reset.scss
│   ├── _root.scss
│   └── _typography.scss
├── components/     # Reusable UI widgets & in-game HUD indicators
│   ├── _arena-share.scss
│   ├── _buttons.scss
│   ├── _cookie-banner.scss
│   ├── _cooldown-bar.scss
│   ├── _ctf-hud.scss
│   ├── _emoji-picker.scss
│   ├── _hud-indicators.scss
│   ├── _index.scss
│   ├── _leaderboard.scss
│   ├── _modals.scss
│   ├── _panels.scss
│   ├── _ship-selector.scss
│   ├── _social-links.scss
│   ├── _support-panel.scss
│   ├── _touch-controls.scss
│   └── _world-selector.scss
├── layout/         # Major structural view containers & viewports
│   ├── _container.scss
│   ├── _footer.scss
│   ├── _game-canvas.scss
│   ├── _index.scss
│   ├── _overlays.scss
│   └── _spawnscreen.scss
├── views/          # Standalone modal dialogs & views
│   ├── _arena-modal.scss
│   ├── _changelog-modal.scss
│   ├── _index.scss
│   ├── _settings-modal.scss
│   └── _worlds-modal.scss
└── main.scss       # Root manifest importing all layers
```

### 2.1 Color Palette Tokens (`abstracts/_variables.scss`)

```scss
// Brand & Base Palette
$color-bg-dark: #000000;
$color-text-main: #ffffff;
$color-text-muted: #aaaaaa;
$color-text-subtle: #7a9cd6;
$color-text-ice: #dbe8ff;

// Blue Spectrum (Primary UI Theme)
$color-blue-primary: #0052ff;
$color-blue-navy: #060b19;
$color-blue-deep: #072562;
$color-blue-header: rgba(0, 30, 80, 0.6);
$color-blue-border: #3262d1;
$color-blue-border-light: rgba(61, 120, 255, 0.4);
$color-blue-panel-bg: rgba(61, 120, 255, 0.2);
$color-blue-hover-bg: rgba(61, 120, 255, 0.35);
$color-blue-glow: #005dfe;
$color-blue-accent: #3d78ff;
$color-blue-button-start: #0c5af5;
$color-blue-button-end: #003ef5;

// Yellow & Gold Spectrum (Play Button, Accents, Leaders)
$color-yellow-primary: #fae40b;
$color-yellow-dark: #f5c807;
$color-yellow-border: #feff00;
$color-yellow-bright: #ffe600;

// Green Spectrum (Spawn Button Gradients, Success)
$color-green-light: #b1ff00;
$color-green-dark: #71ff00;
$color-green-text: #225500;
$color-green-lime: lime;

// Pink Spectrum (Action Buttons, Ship Skins)
$color-pink-primary: #c21a6e;
$color-pink-dark: #af1763;
$color-pink-border: #e73f93;
$color-pink-glow: #c0186f;

// Purple Spectrum (Fullscreen Button, Secondary CTAs)
$color-purple-primary: #8718bb;
$color-purple-dark: #70139b;
$color-purple-border: #a42ddb;
$color-purple-shadow: #ba65e2;
$color-purple-glow: #a24bca;

// Danger & Feedback
$color-danger: #ff0000;
$color-danger-glow: rgba(255, 0, 0, 0.23);
$color-danger-fill-glow: rgba(255, 0, 0, 0.16);

// Overlays & Backdrop
$color-overlay-dark: rgba(0, 0, 0, 0.7);
$color-overlay-heavy: rgba(0, 0, 0, 0.75);
$color-panel-glass: rgba(10, 25, 55, 0.95);
```

### 2.2 Typography & Font Rendering Tokens

```scss
$font-family-main: "Exo 2", sans-serif;
$font-family-clock: "Alarm Clock", monospace;
```

> [!WARNING]
> **Subpixel Anti-Aliasing & Faux-Bold Integrity Rule**:
> `Exo 2` is loaded via Google Fonts at default weight (`400`). When rendering heavy weights (`font-weight: 900` or `font-weight: 600`), the browser applies high-quality synthetic bolding.
> **DO NOT** apply `transition: transform ...` or CSS `transform` directly on idle buttons or text containers unless active/animating. Applying hardware-accelerated transforms to idle buttons promotes them to GPU composite layers on Windows, which disables ClearType subpixel anti-aliasing and forces thin, washed-out grayscale font rendering.

### 2.3 Stacking Context & Z-Index Scale

```scss
$z-index-canvas: -1;      // WebGL background canvas layer
$z-index-background: 0;   // Static starfield & backdrop overlays
$z-index-base: 1;         // Standard in-game HUD indicators & spectate button
$z-index-controls: 2;     // Interactive controls & fullscreen button
$z-index-floating: 4;     // Tooltips, popovers, floating selectors
$z-index-modal: 1000;     // Spawnscreen dialogues, settings, worlds, changelog
$z-index-alert: 1100;     // Connection dropped / error banners
$z-index-top: 2000;       // Top-level toast notifications & debug overlays
```

### 2.4 Motion & Animation Tokens

```scss
$transition-fast: 0.15s ease;
$transition-medium: 0.2s ease;
$transition-slow: 0.3s ease;
$transition-fade: 0.5s ease;
```

* **Pulsing Neon Glows**: Interactive buttons employ 2-second infinite keyframes (`pulse-yellow`, `pulse-blue`, `pulse-pink`, `pulse-purple`) oscillating `box-shadow` spread from full intensity to 50% opacity.
* **Floating Score Indicators (`plusScore`)**: Spawned score gains (`+5`, `+25`) animate over 2.5 seconds, rising 200px upward from `translate(-50%, -75%)` to `translate(-50%, calc(-75% - 200px))` with smooth opacity fade-in/out.

---

## 3. Responsive Layout & Viewport Hierarchy

```
+---------------------------------------------------------------------------------------------------+
| Top Viewport Controls (Fixed/Absolute)                                                            |
|                                                     [ SPECTATE 👁️ (Top: 45px, Right: 10px) ]       |
|                                                     [ FULLSCREEN ⛶ (Top: 100px, Right: 10px) ]   |
|                                                                                                   |
| [ Leaderboard (Top: 20px, Right: 20px - In-Game Only) ]                                           |
|                                                                                                   |
|                                 [ DANGER ZONE (Top: 10em, Center) ]                               |
|                                 [ KILL BANNER (Top: 4em, Center) ]                                |
|                                                                                                   |
|                      +----------------------------------------------------+                       |
|                      | SPAWNSCREEN DIALOG / MAIN MENU (Center Viewport)   |                       |
|                      |  - Game Title / Spaceone Logo                      |                       |
|                      |  - Ship & Color Selector Carousel                  |                       |
|                      |  - Player Nickname Input Box                       |                       |
|                      |  - [ PLAY ] (55px Green Split-Gradient CTA)        |                       |
|                      |  - Sub-dialog buttons: [⚙️ Settings] [🌍 Worlds]    |                       |
|                      +----------------------------------------------------+                       |
|                                                                                                   |
| [ Arena Record (Bottom: 16px, Left: 16px) ]                                                       |
| [ CAPTAIN'S LOG 📜 (Bottom: 35px, Left: 35px - Viewport Fixed) ]                                  |
| [ Autofire Indicator (Bottom: 14px, Right: 8px) ]                                                 |
+---------------------------------------------------------------------------------------------------+
```

---

## 4. Component Anatomy & Visual Contracts

### 4.1 Buttons & Interactive CTAs (`components/_buttons.scss`)

| Button Variant | Target Class | Dimensions & Box Model | Colors & Gradients | Visual Glow & Typography |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Spawn Button (PLAY)** | `.btn--spawn` / `#spawn` | `width: 100%`, `height: 55px`, `border-radius: 15px` | Top: `#b1ff00`, Bottom: `#71ff00`, Border: `3px solid #fae40b` | Text: `#225500`, `font-size: 1.6em`, `font-weight: 600`, `box-shadow: 0 0 30px #fae40b` |
| **Spectate Button** | `.btn--spectate` | `width: 180px`, `height: 45px`, `display: block`, `padding: 7px 0 0 15px` | Top: `#0c5af5`, Bottom: `#003ef5`, Border: `3px solid #3893f7` | Text: `#ffffff`, `font-size: 1.2em`, `font-weight: 900`, `box-shadow: 0 0 50px #005dfe` |
| **Fullscreen Button** | `.btn--fullscreen` | `width: 180px`, `height: 45px`, `display: block`, `padding: 7px 0 0 15px` | Top: `#8718bb`, Bottom: `#70139b`, Border: `3px solid #a42ddb` | Text: `#ffffff`, `font-size: 1.2em`, `font-weight: 900`, `box-shadow: 0 0 30px #a24bca` |
| **Pink Action Button** | `.btn--pink` | `width: 170px`, `height: 46px`, `border-radius: 15px` | Top: `#c21a6e`, Bottom: `#af1763`, Border: `3px solid #e73f93` | Text: `#ffffff`, `font-size: 1em`, `font-weight: 600`, `box-shadow: 0 0 30px #c0186f` |
| **Gold Action Button** | `.btn--gold` | `padding: 6px 16px`, `border-radius: 8px` | Top: `#fae40b`, Bottom: `#f5c807`, Border: `3px solid #feff00` | Text: `#000000`, `font-size: 1em`, `font-weight: 900`, `box-shadow: 0 0 30px #f5c807` |

#### Button Sizing & Layout Invariants:
* **Split Gradient Rule**: All neon action buttons MUST use the 50/50 linear gradient syntax: `linear-gradient(to bottom, $gradient-top 50%, $gradient-bottom 50%)`.
* **Pill Alignment Rule**: `.btn--spectate` and `.btn--fullscreen` rely on `display: block; text-align: left; padding: 7px 0 0 15px;` to maintain exact vertical centering of faux-bold text and icon alignment. Do not switch these to flexbox centering without accounting for font baseline ascents.
* **Icon Box-Sizing**: Icon images inside buttons (e.g. `#spectate-eye`) MUST declare `box-sizing: content-box; width: 32px; padding-left: 20px;` so global `border-box` resets do not collapse the graphic width.

### 4.2 Modal Dialogs & Glassmorphism Panels (`components/_modals.scss`, `views/*`)

* **Glassmorphism Backdrop**: Modals must declare `@include glassmorphism` with translucent dark navy fill (`rgba(10, 25, 55, 0.95)`), 2px solid border (`#3262d1`), and subtle backdrop blur (`backdrop-filter: blur(8px)`).
* **Modal Header Bar**: Header bands use deep blue shading (`rgba(0, 30, 80, 0.6)`) with high-contrast white header text and 1px bottom divider.
* **Close Buttons (`.modal__close`)**: Floated right with `color: #aaaaaa`, transitioning to `color: #ffffff; text-shadow: 0 0 10px #ffffff;` on hover.
* **Viewport Anchoring**: Fixed overlay elements that must remain accessible across all menu/game states (such as the `#changelogButton` Captain's Log trigger) MUST be positioned via `position: fixed; z-index: 100;` outside the main spawnscreen container.

### 4.3 In-Game HUD & Indicators (`components/_hud-indicators.scss`, `components/_leaderboard.scss`)

* **Leaderboard (`.leaderboard`)**:
  * Positioned at `top: 20px; right: 20px; width: 260px;`.
  * **Table Layout & Truncation Rule**: Tables declare `table-layout: fixed; width: 100%; border-collapse: collapse;` with strict `24px` row heights. Name cells (`.name`) must declare `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` to prevent multiline breakage, and score cells (`.score`) declare `width: 60px; text-align: right; font-variant-numeric: tabular-nums;`.
  * **Player Row Highlighting Rule**: All opposing player rows MUST render in default white (`#ffffff`). ONLY the local player's own row (`.leaderboard__row--self`) receives the dynamic ship color modifier (`.leaderboard__row--cyan`, `.leaderboard__row--pink`, etc.).
* **Danger Zone Warning (`.danger-zone-warning`)**:
  * Positioned at `top: 10em; left: 50%; transform: translate(-50%, -50%); width: 128px; display: none;`.
  * Shown dynamically via chained modifier specificity: `&.danger-zone-warning--visible { display: block; }`.
* **Floating Score Indicators (`.score-popup`, `.plusScore`)**:
  * Positioned inside `#plusScoreContainer` at screen midpoint (`top: 50%; left: 50%; transform: translate(-50%, -50%)`).
  * Floating score numbers MUST declare `white-space: nowrap;` and translate from `translate(-50%, -75%)` to ensure perfect horizontal centering over the ship.
* **Cooldown Bar (`.cooldown-bar`)**:
  * Positioned at `bottom: 5vh; left: 50%; transform: translateX(-50%); width: 200px; height: 12px;`.
  * Glowing border (`border: 2px solid $color-blue-border; box-shadow: 0 0 10px $color-blue-primary;`).
  * Fill states: `.cooldown-bar__fill--ready` (solid `#0052ff`) vs recharging transition.

---

## 5. BEM Methodology & DOM State Management Standards

All HTML markup, SCSS rules, and TypeScript DOM interactions must strictly follow **Block-Element-Modifier (BEM)** naming.

### 5.1 BEM Syntax Format
* **Block**: Standalone entity (`.btn`, `.modal`, `.leaderboard`, `.cooldown-bar`, `.spawnscreen`)
* **Element**: Sub-part belonging to the block (`.modal__header`, `.modal__body`, `.modal__close`, `.leaderboard__table`, `.cooldown-bar__fill`)
* **Modifier**: State or variant flag (`.btn--spawn`, `.btn--spectate`, `.modal--settings`, `.leaderboard__row--self`, `.danger-zone-warning--visible`)

### 5.2 View-State Lifecycle Classes
UI visibility across gameplay phases is governed by dedicated view-state classes:
* `.view-state--menu`: Spawnscreen and pre-spawn UI controls.
* `.view-state--alive`: In-game flight HUD (cooldown bar, player name, autofire, leader arrow).
* `.view-state--game`: Game telemetry visible during flight and spectate (leaderboard, arena record).
* `.view-state--spectating`: Spectator mode camera banner and launch buttons.

### 5.3 Prohibition of Direct Inline Styling in TypeScript
* **Rule**: TypeScript modules MUST NEVER manipulate inline styles for static UI properties (e.g. `el.style.display = 'block'`, `el.style.color = 'red'`).
* **Golden Pattern**: Toggle semantic CSS classes or call centralized visibility utilities:
  ```typescript
  // BAD: Direct inline style mutation
  dangerZoneWarning.style.display = isDanger ? "block" : "none";

  // GOOD: Semantic BEM class toggle
  dangerZoneWarning.classList.toggle("danger-zone-warning--visible", isDanger);

  // GOOD: Centralized DOM visibility transition helper
  fadeIn(".visibility", 500);
  hide(".visibility3");
  ```

---

## 6. Anti-Pattern & Pitfall Traps Table

| Anti-Pattern Trap | Why It Fails | Golden Pattern |
| :--- | :--- | :--- |
| **Adding `transition: transform` to Idle Buttons** | On Windows, CSS transform transitions force GPU composite layer promotion, disabling ClearType subpixel anti-aliasing and making faux-bold text appear thin and washed out. | Use `transition: box-shadow $transition-fast` on base buttons. Only apply `transform` during `:active` or hover scaling when needed. |
| **Global `border-box` on Padded Graphic Icons** | With `box-sizing: border-box`, `width: 32px; padding-left: 20px;` shrinks the image content box to 12px width. | Explicitly apply `box-sizing: content-box; width: 32px; padding: 0 0 0 20px;` on button icon images (`#spectate-eye`). |
| **Nesting ID Selectors in Modifier Rules (`&--modifier, &#id`)** | Compiles to high-specificity selectors like `.btn#fullscreenButton` (`1,1,0`) which override low-specificity utility classes like `.visibility` (`0,1,0`), breaking initial page fade-in. | Keep BEM modifier rules strictly class-based (`&--fullscreen`), avoiding nested ID bindings that artificially inflate specificity. |
| **Colorizing All Leaderboard Rows** | Applying player skin colors to all leaderboard entries creates a distracting rainbow effect that destroys the contrast needed to find the local player. | Only apply `.leaderboard__row--<color>` when `entryIsSelf` is `true`; all other rows remain neutral white. |
| **Using `translate(-100%, ...)` for Screen Center Popups** | Translating an element `-100%` on the X-axis shifts its entire bounding box to the left of the anchor point, causing "+Score" popups to appear noticeably off-center. | Use `transform: translate(-50%, -75%)` so the horizontal midpoint of the text aligns with the anchor. |
| **Anchoring Persistent Buttons Inside Nested Modals** | Placing global trigger buttons (like `#changelogButton`) inside `.spawnscreen` hides them whenever the spawnscreen is closed or toggled. | Anchor persistent global triggers directly to `document.body` with `position: fixed; z-index: 100;`. |
| **Using Flexbox Centering for Text with Top-Weighted Glyphs** | Standard flexbox `align-items: center` calculates line height without font ascent tuning, causing uppercase title text to sit visually too high in pill buttons. | For pill buttons (`.btn--spectate`, `.btn--fullscreen`), use `display: block; text-align: left; padding: 7px 0 0 15px;` for exact optical centering. |
