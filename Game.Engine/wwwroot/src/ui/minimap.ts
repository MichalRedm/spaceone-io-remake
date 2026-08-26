import { Settings } from "./settings";
import * as PIXI from "pixi.js";
import { Vector2 } from "../math/vector2";
import type { Dimension2 } from "../math/dimension2";
import type { LeaderboardData } from "./leaderboard";

const minimapSize = 180;
const minimapMarginBottom = 15;
const minimapMarginRight = 15;

const colors: Record<string, number> = {
  red: 0xff0000,
  pink: 0xff00cb,
  orange: 0xffa500,
  yellow: 0xffff00,
  cyan: 0x00ffff,
  blue: 0x2255ff,
  green: 0x00ff00,
};

export class Minimap {
  ctx: PIXI.Graphics;
  worldSize = 6000;

  constructor(stage: PIXI.Container, size: Dimension2) {
    this.ctx = new PIXI.Graphics();
    this.ctx.visible = Settings.displayMinimap;
    this.size(size);
    stage.addChild(this.ctx);
  }

  size(size: Dimension2): void {
    this.ctx.position.set(
      size.width - minimapSize - minimapMarginRight,
      size.height - minimapSize - minimapMarginBottom,
    );
  }

  checkDisplay(): void {
    if (Settings.displayMinimap !== this.ctx.visible) {
      this.ctx.visible = Settings.displayMinimap;
      if (!this.ctx.visible) {
        this.ctx.clear();
      }
    }
  }

  update(data: LeaderboardData, worldSize: number, fleetID: number): void {
    if (!this.ctx.visible) return;
    if (worldSize > 0) this.worldSize = worldSize;

    this.ctx.clear();

    // Minimap boundary box
    this.ctx.beginFill(0x071530, 0.5);
    this.ctx.lineStyle(1, 0x1a4580, 0.8);
    this.ctx.drawRect(0, 0, minimapSize, minimapSize);
    this.ctx.endFill();

    if (!data?.Entries) return;

    for (let i = 0; i < data.Entries.length; i++) {
      const entry = data.Entries[i];
      if (!entry || !entry.Position) continue;

      const normX = (entry.Position.x + this.worldSize) / (this.worldSize * 2);
      const normY = (entry.Position.y + this.worldSize) / (this.worldSize * 2);

      const px = Math.max(2, Math.min(minimapSize - 2, normX * minimapSize));
      const py = Math.max(2, Math.min(minimapSize - 2, normY * minimapSize));

      const isSelf = entry.FleetID === fleetID;
      const isLeader = i === 0;

      const color = isSelf
        ? 0x00ff00
        : (colors[entry.Color?.toLowerCase() ?? ""] ?? 0xffffff);
      const radius = isSelf ? 3.5 : isLeader ? 3 : 2;

      this.ctx.beginFill(color, isSelf ? 1.0 : 0.85);
      this.ctx.drawCircle(px, py, radius);
      this.ctx.endFill();
    }
  }
}
