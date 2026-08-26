import { Bullet } from "./models/bullet";
import { Ship } from "./models/ship";
import { RenderedObject } from "./models/renderedObject";
import { Fleet } from "./models/fleet";
import { Tile } from "./models/tile";
import { CustomContainer } from "./CustomContainer";
import { FX } from "./models/fx";
import type { Vector2 } from "./Vector2";

export interface GroupState {
  ID: number;
  Caption?: string;
  Type?: number;
  ZIndex?: number;
  CustomData?: string;
  renderer?: any;
}

export interface BodyState {
  ID: number;
  DefinitionTime: number;
  OriginalAngle: number;
  AngularVelocity: number;
  OriginalPosition: { x: number; y: number };
  Momentum: { x: number; y: number };
  Size: number;
  Sprite: string | null;
  Mode: number;
  Group: number;
  Angle?: number;
  Position?: Vector2 | { x: number; y: number };
  previous?: BodyState | false;
  renderer?: any;
  group?: GroupState | null;
  zIndex?: number;
  obsolete?: number;
}

export class Cache {
  container: CustomContainer;
  bodies: Record<string, BodyState>;
  groups: Record<string, GroupState>;
  static count = 0;

  constructor(container: CustomContainer) {
    this.container = container;
    this.bodies = {};
    this.groups = {};
    this.clear();
  }

  clear(): void {
    this.foreach((body) => {
      if (body?.renderer) body.renderer.destroy();
    }, this);

    this.foreachGroup((group) => {
      if (group?.renderer) group.renderer.destroy();
    });

    this.bodies = {};
    this.groups = {};
    Cache.count = 0;
  }

  empty(): void {
    this.clear();
  }

  refreshSprites(): void {
    this.foreach((body) => {
      if (body?.renderer) body.renderer.refreshSprite();
    }, this);
  }

  update(
    updates: BodyState[],
    deletes: number[],
    groups: GroupState[],
    groupDeletes: number[],
    time: number,
    myFleetID: number,
  ): void {
    let i = 0;

    // delete objects that should no longer exist
    for (i = 0; i < deletes.length; i++) {
      let deleteKey = deletes[i];
      let key = `b-${deleteKey}`;
      if (key in this.bodies) Cache.count--;

      const body = this.bodies[key];
      if (body) {
        const spriteStr = String(body.Sprite || "");
        const renderer = body.renderer as RenderedObject | undefined;
        const x = renderer?.lastPosition?.x ?? body.OriginalPosition?.x ?? 0;
        const y = renderer?.lastPosition?.y ?? body.OriginalPosition?.y ?? 0;

        if (spriteStr.startsWith("fish")) {
          const color = spriteStr.split("_")[1] || "cyan";
          FX.spawnFoodExplosion(color, x, y);
        } else if (
          spriteStr.startsWith("bullet") ||
          spriteStr.startsWith("laser")
        ) {
          const now = performance.now();
          const spawnTime = renderer?.spawnTime ?? now;
          const lifetime = renderer?.bulletLifetime ?? 1840;
          const age = now - spawnTime;
          // Only explode if destroyed early by collision (before natural fade-out)
          if (age < lifetime - 100) {
            const parts = spriteStr.split("_");
            const color = parts.length > 1 ? parts[1] : "cyan";
            FX.spawnBulletExplosion(color, x, y);
          }
        }

        if (body.renderer) body.renderer.destroy();
      }
      delete this.bodies[key];
    }

    // delete groups that should no longer exist
    for (i = 0; i < groupDeletes.length; i++) {
      let deleteKey = groupDeletes[i];
      let key = `g-${deleteKey}`;
      let group = this.groups[key];
      if (!group) console.log("group delete on object not in cache");

      //console.log(`deleting group: ${key}`);

      if (group && group.renderer) group.renderer.destroy();
      delete this.groups[key];
    }

    // update groups that should be here
    for (i = 0; i < groups.length; i++) {
      const group = groups[i];
      let existing = this.groups[`g-${group.ID}`];

      if (!existing) {
        if (group.Type == 1) group.renderer = new Fleet(this.container, this);

        existing = group;
      } else {
        existing.ID = group.ID;
        existing.Caption = group.Caption;
        existing.Type = group.Type;
        existing.ZIndex = group.ZIndex;
        existing.CustomData = group.CustomData;
      }

      if (existing.renderer) existing.renderer.update(existing, myFleetID);

      this.groups[`g-${group.ID}`] = existing;
    }

    // update objects that should be here
    for (i = 0; i < updates.length; i++) {
      const update = updates[i];
      let existing = this.bodies[`b-${update.ID}`];

      this.bodies[`b-${update.ID}`] = update;

      if (existing) {
        update.renderer = existing.renderer;
        update.previous = existing;

        existing.previous = false;
        existing.renderer = false;
        existing.obsolete = time;

        if (update.Size === -1) update.Size = existing.Size;

        if (update.Sprite === null) update.Sprite = existing.Sprite;

        if (update.OriginalAngle === -999)
          update.OriginalAngle = existing.OriginalAngle;
        if (update.AngularVelocity === -999)
          update.AngularVelocity = existing.AngularVelocity;

        let group = null;
        if (update.Group != 0) group = this.getGroup(update.Group);
        update.group = group;
        update.zIndex = 0;
        if (group) update.zIndex = group.ZIndex || 0;

        if (update.renderer) update.renderer.update(update);
      }

      if (!existing) {
        let group = null;
        if (update.Group != 0) {
          group = this.groups[`g-${update.Group}`];
          if (group) {
            switch (group.Type) {
              case 1:
                let ship = update.renderer;
                if (!ship) ship = new Ship(this.container);
                update.renderer = ship;

                let fleet = group.renderer;
                if (!fleet) fleet = new Fleet(this.container, this);
                group.renderer = fleet;

                if (fleet) fleet.addShip(ship);
                break;

              case 3:
              case 4:
                let bullet = update.renderer;
                if (!bullet) bullet = new Bullet(this.container, this);
                update.renderer = bullet;
                break;

              case 6:
                let tile = update.renderer;
                if (!tile) tile = new Tile(this.container, this);
                update.renderer = tile;
                break;
            }
          }
        }

        if (update.Sprite === "boom") {
          const colors = [
            "cyan",
            "blue",
            "cyan",
            "green",
            "orange",
            "pink",
            "red",
            "yellow",
          ];
          const color = colors[update.Mode] || "cyan";
          FX.spawnShipExplosion(
            color,
            update.OriginalPosition?.x ?? 0,
            update.OriginalPosition?.y ?? 0,
            update.Size || 50,
          );
        } else {
          if (!update.renderer)
            update.renderer = new RenderedObject(this.container);

          update.group = group;
          update.zIndex = 0;
          if (group) update.zIndex = group.ZIndex || 0;

          if (update.renderer) update.renderer.update(update, myFleetID);
        }

        Cache.count++;
      }
    }
  }

  foreach(action: (body: BodyState) => void, thisObj?: unknown): void {
    this.foreachGroup((group) => {
      for (const key in this.bodies) {
        if (key.indexOf("b-") === 0) {
          const body = this.bodies[key];
          if (body && body.Group === group.ID) {
            action.call(thisObj, body);
          }
        }
      }
    }, this);
  }

  foreachGroup(action: (group: GroupState) => void, thisObj?: unknown): void {
    const sortedGroups: GroupState[] = [];

    for (const key in this.groups) {
      const group = this.groups[key];
      if (group) sortedGroups.push(group);
    }

    sortedGroups.sort((a, b) => (a.ZIndex ?? 0) - (b.ZIndex ?? 0));
    sortedGroups.unshift({ ID: 0 });

    for (const group of sortedGroups) {
      action.call(thisObj, group);
    }
  }

  getGroup(groupID: number): GroupState | undefined {
    return this.groups[`g-${groupID}`];
  }
}
