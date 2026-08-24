import * as PIXI from "pixi.js";
import { initializeAtlasTextures } from "./atlasLoader";
import { textureCache } from "./models/textureCache";

// Ensure all atlas textures are initialized into textureCache
initializeAtlasTextures();

// State
const state = {
  // Ship
  shipColor: "cyan",
  shipSize: 3.1,
  shipAngle: 0,
  boostHullSize: 3.41,
  boostHullAlpha: 1.0,
  dashOffsetX: -80,
  dashOffsetY: 0,
  dashSize: 3.25,
  isBoosting: false,
  boostStartTime: 0,

  // Bullet
  bulletColor: "cyan",
  bulletTipSize: 2.5,
  laserOffsetX: -80,
  laserOffsetY: 0,
  laserTrailSize: 12.5,
  sparkleScaleStart: 0.38,
  sparkleFreq: 0.025,
  sparkleLife: 0.2,

  // Food
  foodColor: "cyan",
  foodCoreSize: 1.2,
  foodGlowSize: 6.0,
  foodGlowMinAlpha: 0.4,
};

// Pixi Setup
const canvas = document.getElementById("tuner-canvas") as HTMLCanvasElement;
const app = new PIXI.Application({
  view: canvas,
  resizeTo: window,
  backgroundColor: 0x07090e,
  antialias: true,
});

const mainStage = new PIXI.Container();
app.stage.addChild(mainStage);

// Grid lines & labels
const gridGfx = new PIXI.Graphics();
mainStage.addChild(gridGfx);

// Station text labels
const titleStyle = new PIXI.TextStyle({
  fontFamily: "Segoe UI, sans-serif",
  fontSize: 13,
  fontWeight: "bold",
  fill: "#45a29e",
  letterSpacing: 1,
});

const shipTitle = new PIXI.Text("SHIP & BOOST PREVIEW", titleStyle);
shipTitle.anchor.set(0.5, 0.5);

const bulletTitle = new PIXI.Text("BULLET & TRAIL PREVIEW", titleStyle);
bulletTitle.anchor.set(0.5, 0.5);

const foodTitle = new PIXI.Text("FOOD & GLOW PREVIEW", titleStyle);
foodTitle.anchor.set(0.5, 0.5);

mainStage.addChild(shipTitle, bulletTitle, foodTitle);

function drawBackground() {
  gridGfx.clear();
  const w = app.screen.width;
  const h = app.screen.height;

  // Subtle space background grid
  gridGfx.lineStyle(1, 0x161c28, 0.5);
  for (let x = 0; x < w; x += 50) {
    gridGfx.moveTo(x, 0);
    gridGfx.lineTo(x, h);
  }
  for (let y = 0; y < h; y += 50) {
    gridGfx.moveTo(0, y);
    gridGfx.lineTo(w, y);
  }

  // Crosshairs & divider stations
  gridGfx.lineStyle(1, 0x222d42, 0.8);
  const cx1 = w * 0.25;
  const cx2 = w * 0.58;
  const cx3 = w * 0.85;
  const cy = h * 0.5;

  [cx1, cx2, cx3].forEach((cx) => {
    gridGfx.moveTo(cx - 40, cy);
    gridGfx.lineTo(cx + 40, cy);
    gridGfx.moveTo(cx, cy - 40);
    gridGfx.lineTo(cx, cy + 40);
  });

  shipTitle.position.set(cx1, cy - 140);
  bulletTitle.position.set(cx2, cy - 140);
  foodTitle.position.set(cx3, cy - 140);
}

// Station Containers
const shipStation = new PIXI.Container();
const bulletStation = new PIXI.Container();
const foodStation = new PIXI.Container();
mainStage.addChild(shipStation, bulletStation, foodStation);

// Sprites
let shipSprite: PIXI.Sprite | null = null;
let boostHullSprite: PIXI.Sprite | null = null;
let dashTrailSprite: PIXI.Sprite | null = null;

let bulletTipSprite: PIXI.Sprite | null = null;
let laserTrailSprite: PIXI.Sprite | null = null;

let foodCoreSprite: PIXI.Sprite | null = null;
let foodGlowSprite: PIXI.Sprite | null = null;

// Helper to get texture from cache
function getTex(name: string): PIXI.Texture {
  const clean = name.toLowerCase().replace(/\.[^/.]+$/, "");
  const cached = textureCache[clean] || textureCache[name];
  if (cached && cached.length > 0) return cached[0];

  // Try direct lookup with .png
  const cachedPng = textureCache[`${clean}.png`] || textureCache[`${name}.png`];
  if (cachedPng && cachedPng.length > 0) return cachedPng[0];

  return PIXI.Texture.WHITE;
}

function updateShipSprites() {
  const col = state.shipColor;

  if (!shipSprite) {
    shipSprite = new PIXI.Sprite();
    shipSprite.anchor.set(0.5, 0.5);
    shipStation.addChild(shipSprite);
  }
  shipSprite.texture = getTex(`ship_${col}`);

  if (!boostHullSprite) {
    boostHullSprite = new PIXI.Sprite();
    boostHullSprite.anchor.set(0.5, 0.5);
    shipStation.addChild(boostHullSprite);
  }
  boostHullSprite.texture = getTex(`particle_ship_${col}`);

  if (!dashTrailSprite) {
    dashTrailSprite = new PIXI.Sprite();
    dashTrailSprite.anchor.set(0.5, 0.5);
    shipStation.addChildAt(dashTrailSprite, 0);
  }
  dashTrailSprite.texture = getTex(`dash_trail_${col}`);
}

function updateBulletSprites() {
  const col = state.bulletColor;

  if (!laserTrailSprite) {
    laserTrailSprite = new PIXI.Sprite();
    laserTrailSprite.anchor.set(0.5, 0.5);
    bulletStation.addChild(laserTrailSprite);
  }
  laserTrailSprite.texture = getTex(`laser_${col}_trail`);

  if (!bulletTipSprite) {
    bulletTipSprite = new PIXI.Sprite();
    bulletTipSprite.anchor.set(0.5, 0.5);
    bulletStation.addChild(bulletTipSprite);
  }
  bulletTipSprite.texture = getTex(`laser_${col}`);
}

function updateFoodSprites() {
  const col = state.foodColor;

  if (!foodGlowSprite) {
    foodGlowSprite = new PIXI.Sprite();
    foodGlowSprite.anchor.set(0.5, 0.5);
    foodGlowSprite.blendMode = PIXI.BLEND_MODES.SCREEN;
    foodStation.addChild(foodGlowSprite);
  }
  foodGlowSprite.texture = getTex(`food_${col}_glow`);

  if (!foodCoreSprite) {
    foodCoreSprite = new PIXI.Sprite();
    foodCoreSprite.anchor.set(0.5, 0.5);
    foodStation.addChild(foodCoreSprite);
  }
  foodCoreSprite.texture = getTex(`food_${col}`);
}

// Sparkle particle pool for bullet preview
interface Sparkle {
  sprite: PIXI.Sprite;
  startX: number;
  startY: number;
  vx: number;
  vy: number;
  spawnTime: number;
  life: number;
}
const sparkles: Sparkle[] = [];
const sparkleContainer = new PIXI.Container();
bulletStation.addChildAt(sparkleContainer, 0);

let lastSparkleTime = 0;
function updateSparkles(now: number) {
  if (now - lastSparkleTime > state.sparkleFreq * 1000) {
    lastSparkleTime = now;
    const tex = getTex(`particle_${state.bulletColor}`);
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5, 0.5);
    sp.blendMode = PIXI.BLEND_MODES.SCREEN;
    sparkleContainer.addChild(sp);

    sparkles.push({
      sprite: sp,
      startX: bulletTipSprite?.position.x || 0,
      startY: bulletTipSprite?.position.y || 0,
      vx: -(30 + Math.random() * 20),
      vy: (Math.random() - 0.5) * 15,
      spawnTime: now,
      life: state.sparkleLife * 1000,
    });
  }

  for (let i = sparkles.length - 1; i >= 0; i--) {
    const s = sparkles[i];
    const age = now - s.spawnTime;
    const p = age / s.life;
    if (p >= 1.0) {
      sparkleContainer.removeChild(s.sprite);
      s.sprite.destroy();
      sparkles.splice(i, 1);
      continue;
    }

    const currentScale = state.sparkleScaleStart * (1.0 - p * 0.8);
    s.sprite.scale.set(currentScale, currentScale);
    s.sprite.alpha = 1.0 - p;
    const dt = age * 0.001;
    s.sprite.x = s.startX + s.vx * dt;
    s.sprite.y = s.startY + s.vy * dt;
  }
}

// Render Tick Loop
app.ticker.add(() => {
  const now = performance.now();
  const w = app.screen.width;
  const h = app.screen.height;

  drawBackground();

  // Position Stations
  shipStation.position.set(w * 0.25, h * 0.5);
  bulletStation.position.set(w * 0.58, h * 0.5);
  foodStation.position.set(w * 0.85, h * 0.5);

  const baseObjectSize = 50; // standard body size

  // --- 1. SHIP STATION ---
  if (shipSprite && boostHullSprite && dashTrailSprite) {
    const angleRad = (state.shipAngle * Math.PI) / 180;
    const shipScale = (baseObjectSize * state.shipSize) / 121;
    shipSprite.scale.set(shipScale, shipScale);
    shipSprite.rotation = angleRad + Math.PI / 2;
    shipSprite.alpha = 1.0;

    // Boost Hull Overlay
    const boostHullScale = (baseObjectSize * state.boostHullSize) / 110;
    boostHullSprite.scale.set(boostHullScale, boostHullScale);
    boostHullSprite.rotation = angleRad + Math.PI / 2;

    if (state.isBoosting) {
      const elapsed = now - state.boostStartTime;
      const progress = Math.min(1.0, elapsed / 500);
      boostHullSprite.alpha = Math.max(0.0, 1.0 - progress);

      // Dash Trail
      const trailScale = (baseObjectSize * state.dashSize) / 127;
      const offX = state.dashOffsetX * trailScale;
      const offY = state.dashOffsetY * trailScale;
      dashTrailSprite.position.x =
        offX * Math.cos(angleRad) - offY * Math.sin(angleRad);
      dashTrailSprite.position.y =
        offY * Math.cos(angleRad) + offX * Math.sin(angleRad);
      dashTrailSprite.scale.set(trailScale, trailScale);
      dashTrailSprite.rotation = angleRad - Math.PI / 2;

      if (elapsed < 50) {
        dashTrailSprite.alpha = 0;
      } else {
        const trailProg = Math.min(1.0, (elapsed - 50) / 450);
        dashTrailSprite.alpha = Math.max(0.0, 1.0 - trailProg);
      }

      if (progress >= 1.0) state.isBoosting = false;
    } else {
      boostHullSprite.alpha = state.boostHullAlpha;

      const trailScale = (baseObjectSize * state.dashSize) / 127;
      const offX = state.dashOffsetX * trailScale;
      const offY = state.dashOffsetY * trailScale;
      dashTrailSprite.position.x =
        offX * Math.cos(angleRad) - offY * Math.sin(angleRad);
      dashTrailSprite.position.y =
        offY * Math.cos(angleRad) + offX * Math.sin(angleRad);
      dashTrailSprite.scale.set(trailScale, trailScale);
      dashTrailSprite.rotation = angleRad - Math.PI / 2;
      dashTrailSprite.alpha = state.boostHullAlpha;
    }
  }

  // --- 2. BULLET STATION ---
  if (bulletTipSprite && laserTrailSprite) {
    const bulletSize = 10;
    const tipScale = (bulletSize * state.bulletTipSize) / 42;
    bulletTipSprite.scale.set(tipScale, tipScale);
    bulletTipSprite.rotation = Math.PI / 2;
    bulletTipSprite.position.set(0, 0);

    const trailScale = (bulletSize * state.laserTrailSize) / 211;
    laserTrailSprite.scale.set(trailScale, trailScale);
    laserTrailSprite.position.set(
      state.laserOffsetX * trailScale,
      state.laserOffsetY * trailScale,
    );
    laserTrailSprite.rotation = -Math.PI / 2;

    updateSparkles(now);
  }

  // --- 3. FOOD STATION ---
  if (foodCoreSprite && foodGlowSprite) {
    const foodSize = 50;
    const coreScale = (foodSize * state.foodCoreSize) / 19;
    foodCoreSprite.scale.set(coreScale, coreScale);

    const glowScale = (foodSize * state.foodGlowSize) / 57;
    foodGlowSprite.scale.set(glowScale, glowScale);

    const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * 2 * Math.PI);
    const glowAlpha =
      state.foodGlowMinAlpha + (1.0 - state.foodGlowMinAlpha) * pulse;
    foodGlowSprite.alpha = glowAlpha;
  }
});

// DOM Binding
function setupUI() {
  const getEl = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;

  // Tabs
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      const tabId = (btn as HTMLElement).dataset.tab;
      if (tabId) getEl(tabId).classList.add("active");
      updateExport();
    });
  });

  // Reset All Button
  getEl("reset-all-btn").addEventListener("click", () => {
    state.shipSize = 3.1;
    state.shipAngle = 0;
    state.boostHullSize = 3.41;
    state.boostHullAlpha = 1.0;
    state.dashOffsetX = -80;
    state.dashOffsetY = 0;
    state.dashSize = 3.25;

    state.bulletTipSize = 2.5;
    state.laserOffsetX = -80;
    state.laserOffsetY = 0;
    state.laserTrailSize = 12.5;
    state.sparkleScaleStart = 0.38;
    state.sparkleFreq = 0.025;
    state.sparkleLife = 0.2;

    state.foodCoreSize = 1.2;
    state.foodGlowSize = 6.0;
    state.foodGlowMinAlpha = 0.4;

    // Update inputs
    getEl<HTMLInputElement>("ship-size").value = "3.1";
    getEl("ship-size-val").textContent = "3.10";
    getEl<HTMLInputElement>("ship-angle").value = "0";
    getEl("ship-angle-val").textContent = "0°";
    getEl<HTMLInputElement>("boost-hull-size").value = "3.41";
    getEl("boost-hull-size-val").textContent = "3.41";
    getEl<HTMLInputElement>("boost-hull-alpha").value = "1.0";
    getEl("boost-hull-alpha-val").textContent = "1.00";
    getEl<HTMLInputElement>("dash-offset-x").value = "-80";
    getEl("dash-offset-x-val").textContent = "-80";
    getEl<HTMLInputElement>("dash-offset-y").value = "0";
    getEl("dash-offset-y-val").textContent = "0";
    getEl<HTMLInputElement>("dash-size").value = "3.25";
    getEl("dash-size-val").textContent = "3.25";

    getEl<HTMLInputElement>("bullet-tip-size").value = "2.5";
    getEl("bullet-tip-size-val").textContent = "2.50";
    getEl<HTMLInputElement>("laser-offset-x").value = "-80";
    getEl("laser-offset-x-val").textContent = "-80";
    getEl<HTMLInputElement>("laser-offset-y").value = "0";
    getEl("laser-offset-y-val").textContent = "0";
    getEl<HTMLInputElement>("laser-trail-size").value = "12.5";
    getEl("laser-trail-size-val").textContent = "12.50";
    getEl<HTMLInputElement>("sparkle-scale-start").value = "0.38";
    getEl("sparkle-scale-start-val").textContent = "0.38";
    getEl<HTMLInputElement>("sparkle-freq").value = "0.025";
    getEl("sparkle-freq-val").textContent = "0.025s";
    getEl<HTMLInputElement>("sparkle-life").value = "0.20";
    getEl("sparkle-life-val").textContent = "0.20s";

    getEl<HTMLInputElement>("food-core-size").value = "1.2";
    getEl("food-core-size-val").textContent = "1.20";
    getEl<HTMLInputElement>("food-glow-size").value = "6.0";
    getEl("food-glow-size-val").textContent = "6.00";
    getEl<HTMLInputElement>("food-glow-min-alpha").value = "0.4";
    getEl("food-glow-alpha-val").textContent = "0.40 - 1.00";

    updateExport();
  });

  // Ship controls
  getEl<HTMLSelectElement>("ship-color").addEventListener("change", (e) => {
    state.shipColor = (e.target as HTMLSelectElement).value;
    updateShipSprites();
    updateExport();
  });
  getEl<HTMLInputElement>("ship-size").addEventListener("input", (e) => {
    state.shipSize = parseFloat((e.target as HTMLInputElement).value);
    getEl("ship-size-val").textContent = state.shipSize.toFixed(2);
    updateExport();
  });
  getEl<HTMLInputElement>("ship-angle").addEventListener("input", (e) => {
    state.shipAngle = parseInt((e.target as HTMLInputElement).value, 10);
    getEl("ship-angle-val").textContent = `${state.shipAngle}°`;
  });
  getEl<HTMLInputElement>("boost-hull-size").addEventListener("input", (e) => {
    state.boostHullSize = parseFloat((e.target as HTMLInputElement).value);
    getEl("boost-hull-size-val").textContent = state.boostHullSize.toFixed(2);
    updateExport();
  });
  getEl<HTMLInputElement>("boost-hull-alpha").addEventListener("input", (e) => {
    state.boostHullAlpha = parseFloat((e.target as HTMLInputElement).value);
    getEl("boost-hull-alpha-val").textContent = state.boostHullAlpha.toFixed(2);
  });
  getEl<HTMLInputElement>("dash-offset-x").addEventListener("input", (e) => {
    state.dashOffsetX = parseInt((e.target as HTMLInputElement).value, 10);
    getEl("dash-offset-x-val").textContent = state.dashOffsetX.toString();
    updateExport();
  });
  getEl<HTMLInputElement>("dash-offset-y").addEventListener("input", (e) => {
    state.dashOffsetY = parseInt((e.target as HTMLInputElement).value, 10);
    getEl("dash-offset-y-val").textContent = state.dashOffsetY.toString();
    updateExport();
  });
  getEl<HTMLInputElement>("dash-size").addEventListener("input", (e) => {
    state.dashSize = parseFloat((e.target as HTMLInputElement).value);
    getEl("dash-size-val").textContent = state.dashSize.toFixed(2);
    updateExport();
  });
  getEl("trigger-boost-btn").addEventListener("click", () => {
    state.isBoosting = true;
    state.boostStartTime = performance.now();
  });

  // Bullet controls
  getEl<HTMLSelectElement>("bullet-color").addEventListener("change", (e) => {
    state.bulletColor = (e.target as HTMLSelectElement).value;
    updateBulletSprites();
    updateExport();
  });
  getEl<HTMLInputElement>("bullet-tip-size").addEventListener("input", (e) => {
    state.bulletTipSize = parseFloat((e.target as HTMLInputElement).value);
    getEl("bullet-tip-size-val").textContent = state.bulletTipSize.toFixed(2);
    updateExport();
  });
  getEl<HTMLInputElement>("laser-offset-x").addEventListener("input", (e) => {
    state.laserOffsetX = parseInt((e.target as HTMLInputElement).value, 10);
    getEl("laser-offset-x-val").textContent = state.laserOffsetX.toString();
    updateExport();
  });
  getEl<HTMLInputElement>("laser-offset-y").addEventListener("input", (e) => {
    state.laserOffsetY = parseInt((e.target as HTMLInputElement).value, 10);
    getEl("laser-offset-y-val").textContent = state.laserOffsetY.toString();
    updateExport();
  });
  getEl<HTMLInputElement>("laser-trail-size").addEventListener("input", (e) => {
    state.laserTrailSize = parseFloat((e.target as HTMLInputElement).value);
    getEl("laser-trail-size-val").textContent = state.laserTrailSize.toFixed(2);
    updateExport();
  });
  getEl<HTMLInputElement>("sparkle-scale-start").addEventListener(
    "input",
    (e) => {
      state.sparkleScaleStart = parseFloat(
        (e.target as HTMLInputElement).value,
      );
      getEl("sparkle-scale-start-val").textContent =
        state.sparkleScaleStart.toFixed(2);
      updateExport();
    },
  );
  getEl<HTMLInputElement>("sparkle-freq").addEventListener("input", (e) => {
    state.sparkleFreq = parseFloat((e.target as HTMLInputElement).value);
    getEl("sparkle-freq-val").textContent = `${state.sparkleFreq.toFixed(3)}s`;
    updateExport();
  });
  getEl<HTMLInputElement>("sparkle-life").addEventListener("input", (e) => {
    state.sparkleLife = parseFloat((e.target as HTMLInputElement).value);
    getEl("sparkle-life-val").textContent = `${state.sparkleLife.toFixed(2)}s`;
    updateExport();
  });

  // Food controls
  getEl<HTMLSelectElement>("food-color").addEventListener("change", (e) => {
    state.foodColor = (e.target as HTMLSelectElement).value;
    updateFoodSprites();
    updateExport();
  });
  getEl<HTMLInputElement>("food-core-size").addEventListener("input", (e) => {
    state.foodCoreSize = parseFloat((e.target as HTMLInputElement).value);
    getEl("food-core-size-val").textContent = state.foodCoreSize.toFixed(2);
    updateExport();
  });
  getEl<HTMLInputElement>("food-glow-size").addEventListener("input", (e) => {
    state.foodGlowSize = parseFloat((e.target as HTMLInputElement).value);
    getEl("food-glow-size-val").textContent = state.foodGlowSize.toFixed(2);
    updateExport();
  });
  getEl<HTMLInputElement>("food-glow-min-alpha").addEventListener(
    "input",
    (e) => {
      state.foodGlowMinAlpha = parseFloat((e.target as HTMLInputElement).value);
      getEl("food-glow-alpha-val").textContent =
        `${state.foodGlowMinAlpha.toFixed(2)} - 1.00`;
    },
  );

  // Copy button
  getEl("copy-btn").addEventListener("click", () => {
    const text = getEl("export-code").textContent || "";
    navigator.clipboard.writeText(text).then(() => {
      const orig = getEl("copy-btn").textContent;
      getEl("copy-btn").textContent = "Copied to Clipboard!";
      setTimeout(() => {
        getEl("copy-btn").textContent = orig;
      }, 1500);
    });
  });

  updateShipSprites();
  updateBulletSprites();
  updateFoodSprites();
  updateExport();
}

function updateExport() {
  const code = `// --- SCSS TextureMap Settings ---
food_core {
  size: ${state.foodCoreSize.toFixed(2)};
}
food_glow {
  size: ${state.foodGlowSize.toFixed(2)};
}
particle_ship (boost hull) {
  size: ${state.boostHullSize.toFixed(2)};
}
dash_trail {
  size: ${state.dashSize.toFixed(2)};
  offset: { x: ${state.dashOffsetX}; y: ${state.dashOffsetY}; }
}
laser_trail {
  size: ${state.laserTrailSize.toFixed(2)};
  offset: { x: ${state.laserOffsetX}; y: ${state.laserOffsetY}; }
}

// --- Emitter Settings (emitters.json) ---
bullet_emitter {
  scale: { start: ${state.sparkleScaleStart.toFixed(2)}, end: 0.05 },
  frequency: ${state.sparkleFreq.toFixed(3)},
  lifetime: { min: ${(state.sparkleLife * 0.75).toFixed(2)}, max: ${state.sparkleLife.toFixed(2)} }
}`;

  const el = document.getElementById("export-code");
  if (el) el.textContent = code;
}

window.addEventListener("DOMContentLoaded", () => {
  setupUI();
});
