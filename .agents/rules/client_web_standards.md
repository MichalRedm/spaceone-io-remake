# Web Client & Rendering Standards

> [!IMPORTANT]
> **Trigger Paths**: `Game.Engine/wwwroot/**`
> **When to Read**: MUST be read before modifying the Pixi.js renderer, client networking, HUD components, or asset pipelines.

## 1. Core Principles & Stack
- **Framework**: HTML5 Canvas / WebGL via Pixi.js (`pixi.js`, `pixi-layers`, `pixi-particles`).
- **Render Interpolation**: The client receives snapshot updates from the server and must interpolate entity positions and rotations smoothly across render frames to prevent stuttering.
- **Sprite Atlas Precision**: All ship skins, projectiles, foods, and particles must map to texture atlases (`reference/space1-original/assets/atlas/`) with exact UV frame boundaries.
- **Input Handling**: Capture mouse position and keyboard events, computing normalized heading vectors and firing state for WebSocket transmission.

## 2. Declarative Code Standards (Golden Patterns)

```javascript
// Frame interpolation for smooth movement
const alpha = (now - lastServerUpdate) / serverTickInterval;
interpolatedX = prevX + (targetX - prevX) * Math.min(1.0, alpha);
sprite.position.set(interpolatedX, interpolatedY);

// Sprite creation from preloaded texture atlas
const shipTexture = PIXI.Texture.from('Ship_Red.png');
const shipSprite = new PIXI.Sprite(shipTexture);
shipSprite.anchor.set(0.5, 0.5);
```

---

## 3. Anti-Pattern & Pitfall Traps

| Anti-Pattern Trap | Why It Fails | Golden Pattern |
| :--- | :--- | :--- |
| **Snapping positions directly on packet receive** | Results in jarring visual jitter whenever network packets arrive unevenly. | Store previous & current server states; interpolate position smoothly using render delta-time. |
| **Loading loose images individually** | Increases HTTP requests and breaks batch rendering in WebGL. | Pack textures into consolidated sprite atlases (`.json` + `.png`) and load via cache. |
| **Direct DOM manipulation inside render loop** | Forces layout reflows on every 60 FPS frame, degrading framerate. | Update canvas UI via Pixi.js display objects; keep HTML DOM changes to out-of-loop events. |
