import { Bullet } from "./bullet";
import { Ship } from "./ship";
import { RenderedObject } from "./renderedObject";
import { Fleet } from "./fleet";
import { Tile } from "./tile";
import { CustomContainer } from "../rendering/customContainer";
import { FX } from "./fx";
import type { Vector2 } from "../math/vector2";

export interface GroupState {
  ID: number;
  Caption?: string;
  Type?: number;
  ZIndex?: number;
  CustomData?: string;
  /** Renderer is a Fleet instance when a group has an active fleet. */
  renderer?: Fleet;
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
  /** Renderer is the visual controller for this body (ship, bullet, tile, etc.). */
  renderer?: RenderedObject | Ship | Bullet | Tile;
  group?: GroupState | null;
  zIndex?: number;
  obsolete?: number;
}

export class Cache {
  container: CustomContainer;
  bodies: Record<string, BodyState>;
  groups: Record<string, GroupState>;
  private bodiesMap: Map<number, BodyState>;
  private groupsMap: Map<number, GroupState>;
  private bodiesByGroup: Map<number, Set<BodyState>>;
  private sortedGroups: GroupState[];
  private groupsDirty: boolean;
  private defaultGroup: GroupState;
  static count = 0;

  constructor(container: CustomContainer) {
    this.container = container;
    this.bodies = {};
    this.groups = {};
    this.bodiesMap = new Map();
    this.groupsMap = new Map();
    this.bodiesByGroup = new Map();
    this.sortedGroups = [];
    this.groupsDirty = true;
    this.defaultGroup = { ID: 0 };
    this.clear();
  }

  private addBodyToGroup(body: BodyState, groupID: number): void {
    let set = this.bodiesByGroup.get(groupID);
    if (!set) {
      set = new Set<BodyState>();
      this.bodiesByGroup.set(groupID, set);
    }
    set.add(body);
  }

  private removeBodyFromGroup(body: BodyState, groupID: number): void {
    const set = this.bodiesByGroup.get(groupID);
    if (set) {
      set.delete(body);
      if (set.size === 0 && groupID !== 0) {
        this.bodiesByGroup.delete(groupID);
      }
    }
  }

  private sortGroups(): void {
    this.sortedGroups = Array.from(this.groupsMap.values());
    this.sortedGroups.sort((a, b) => (a.ZIndex ?? 0) - (b.ZIndex ?? 0));
    this.groupsDirty = false;
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
    this.bodiesMap.clear();
    this.groupsMap.clear();
    this.bodiesByGroup.clear();
    this.sortedGroups = [];
    this.groupsDirty = true;
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
      const deleteKey = deletes[i];
      if (deleteKey === undefined) continue;
      const key = `b-${deleteKey}`;

      const body = this.bodiesMap.get(deleteKey) ?? this.bodies[key];
      if (body) {
        this.removeBodyFromGroup(body, body.Group || 0);
        this.bodiesMap.delete(deleteKey);
        delete this.bodies[key];
        Cache.count--;

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
    }

    // delete groups that should no longer exist
    for (i = 0; i < groupDeletes.length; i++) {
      const deleteKey = groupDeletes[i];
      if (deleteKey === undefined) continue;
      const key = `g-${deleteKey}`;
      const group = this.groupsMap.get(deleteKey) ?? this.groups[key];

      if (group) {
        if (group.renderer) group.renderer.destroy();
        this.groupsMap.delete(deleteKey);
        this.bodiesByGroup.delete(deleteKey);
        delete this.groups[key];
        this.groupsDirty = true;
      }
    }

    // update groups that should be here
    for (i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (!group) continue;
      let existing =
        this.groupsMap.get(group.ID) ?? this.groups[`g-${group.ID}`];

      if (!existing) {
        if (group.Type == 1) group.renderer = new Fleet(this.container, this);

        existing = group;
        this.groupsDirty = true;
      } else {
        if (existing.ZIndex !== group.ZIndex) {
          this.groupsDirty = true;
        }
        existing.ID = group.ID;
        existing.Caption = group.Caption;
        existing.Type = group.Type;
        existing.ZIndex = group.ZIndex;
        existing.CustomData = group.CustomData;
      }

      if (existing.renderer) existing.renderer.update(existing, myFleetID);

      this.groupsMap.set(group.ID, existing);
      this.groups[`g-${group.ID}`] = existing;
    }

    // update objects that should be here
    for (i = 0; i < updates.length; i++) {
      const update = updates[i];
      if (!update) continue;
      const key = `b-${update.ID}`;
      let existing = this.bodiesMap.get(update.ID) ?? this.bodies[key];

      this.bodiesMap.set(update.ID, update);
      this.bodies[key] = update;

      if (existing) {
        if (existing.Group !== update.Group) {
          this.removeBodyFromGroup(existing, existing.Group || 0);
          this.addBodyToGroup(update, update.Group || 0);
        } else {
          const groupSet = this.bodiesByGroup.get(update.Group || 0);
          if (groupSet) {
            groupSet.delete(existing);
            groupSet.add(update);
          } else {
            this.addBodyToGroup(update, update.Group || 0);
          }
        }

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

        let group: GroupState | null = null;
        if (update.Group != 0) group = this.getGroup(update.Group) ?? null;
        update.group = group;
        update.zIndex = 0;
        if (group) update.zIndex = group.ZIndex || 0;

        if (update.renderer) update.renderer.update(update);
      }

      if (!existing) {
        this.addBodyToGroup(update, update.Group || 0);

        let group: GroupState | null = null;
        if (update.Group != 0) {
          group = this.getGroup(update.Group) ?? null;
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
    if (this.groupsDirty) {
      this.sortGroups();
    }

    const group0Bodies = this.bodiesByGroup.get(0);
    if (group0Bodies) {
      for (const body of group0Bodies) {
        action.call(thisObj, body);
      }
    }

    for (let i = 0; i < this.sortedGroups.length; i++) {
      const group = this.sortedGroups[i];
      if (group && group.ID !== 0) {
        const bodiesInGroup = this.bodiesByGroup.get(group.ID);
        if (bodiesInGroup) {
          for (const body of bodiesInGroup) {
            action.call(thisObj, body);
          }
        }
      }
    }
  }

  foreachGroup(action: (group: GroupState) => void, thisObj?: unknown): void {
    if (this.groupsDirty) {
      this.sortGroups();
    }

    action.call(thisObj, this.defaultGroup);

    for (let i = 0; i < this.sortedGroups.length; i++) {
      const group = this.sortedGroups[i];
      if (group) {
        action.call(thisObj, group);
      }
    }
  }

  getGroup(groupID: number): GroupState | undefined {
    return this.groupsMap.get(groupID) ?? this.groups[`g-${groupID}`];
  }
}
