/**
 * @file Spatial entity and hierarchical group cache.
 * @module models/cache
 *
 * @remarks
 * Maintains client-side state for all active bodies (`BodyState`) and groupings (`GroupState`)
 * synced from authoritative server snapshots. Performs delta updates, object pooling, visual controller
 * instantiation (`Ship`, `Bullet`, `Tile`, `RenderedObject`), and z-ordered iteration passes.
 */

import { Bullet } from "./bullet";
import { Ship } from "./ship";
import { RenderedObject } from "./renderedObject";
import { Fleet } from "./fleet";
import { Tile } from "./tile";
import { Flag } from "./flag";
import { CustomContainer } from "../rendering/customContainer";
import { FX } from "./fx";
import type { Vector2 } from "../math/vector2";

/**
 * State representing a logical grouping of entities (e.g. a player fleet).
 */
export interface GroupState {
  /** Authoritative unique group identifier. */
  ID: number;
  /** Fleet caption or player display name. */
  Caption?: string;
  /** Group type index (e.g. 1 = Fleet). */
  Type?: number;
  /** Vertical z-index layering order. */
  ZIndex?: number;
  /** Custom JSON string or parsed object attached by the server. */
  CustomData?: string;
  /** Renderer is a Fleet instance when a group has an active fleet. */
  renderer?: Fleet;
}

/**
 * State snapshot of an individual kinematic entity (ship, projectile, food, obstacle).
 */
export interface BodyState {
  /** Authoritative unique entity identifier. */
  ID: number;
  /** Timestamp when original kinematics were defined in milliseconds. */
  DefinitionTime: number;
  /** Heading angle at definition time in radians. */
  OriginalAngle: number;
  /** Angular velocity in radians per millisecond. */
  AngularVelocity: number;
  /** World position coordinates at definition time. */
  OriginalPosition: { x: number; y: number };
  /** Linear momentum / velocity vector in world units per millisecond. */
  Momentum: { x: number; y: number };
  /** Collision radius or visual scale size. */
  Size: number;
  /** Texture or sprite name symbol (e.g. `'ship_red'`, `'bullet_cyan'`). */
  Sprite: string | null;
  /** Bitmask mode flags (boost, shields, upgrades). */
  Mode: number;
  /** Parent group identifier (0 if unassociated). */
  Group: number;
  /** Current interpolated angle in radians. */
  Angle?: number;
  /** Current interpolated world position. */
  Position?: Vector2 | { x: number; y: number };
  /** Previous snapshot state for kinematic projection. */
  previous?: BodyState | false;
  /** Visual controller responsible for display list management. */
  renderer?: RenderedObject | Ship | Bullet | Tile;
  /** Parent group state reference. */
  group?: GroupState | null;
  /** Computed display z-index. */
  zIndex?: number;
  /** Timestamp when entity was marked obsolete. */
  obsolete?: number;
}

/**
 * High-performance spatial entity cache and delta-sync manager.
 */
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

  /**
   * Constructs an empty entity cache bound to a rendering container.
   *
   * @param container - Root game rendering container.
   */
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

  /**
   * Destroys all visual controllers and clears all cached entities and groups.
   */
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

  /**
   * Alias for `clear()`.
   */
  empty(): void {
    this.clear();
  }

  /**
   * Triggers sprite and texture reload across all active body renderers.
   */
  refreshSprites(): void {
    this.foreach((body) => {
      if (body?.renderer) body.renderer.refreshSprite();
    }, this);
  }

  /**
   * Applies a delta snapshot update received from the server.
   *
   * @remarks
   * Handles deletion of removed entities and groups, triggers explosion effects for destroyed
   * bullets/food/ships, registers newly spawned objects, and updates existing kinematic records.
   *
   * @param updates - Array of updated body states.
   * @param deletes - Array of deleted body IDs.
   * @param groups - Array of updated group states.
   * @param groupDeletes - Array of deleted group IDs.
   * @param time - Authoritative server snapshot timestamp in milliseconds.
   * @param myFleetID - Local player's own fleet group ID.
   */
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

      const body = this.bodiesMap.get(deleteKey);
      if (body) {
        this.removeBodyFromGroup(body, body.Group || 0);
        this.bodiesMap.delete(deleteKey);
        Cache.count--;

        const spriteStr = String(body.Sprite || "");
        const renderer = body.renderer as RenderedObject | undefined;
        const pos =
          body.Position ??
          (renderer?.lastPosition &&
          (renderer.lastPosition.x !== 0 || renderer.lastPosition.y !== 0)
            ? renderer.lastPosition
            : body.OriginalPosition);
        const x = pos?.x ?? 0;
        const y = pos?.y ?? 0;

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
      const group = this.groupsMap.get(deleteKey);

      if (group) {
        if (group.renderer) group.renderer.destroy();
        this.groupsMap.delete(deleteKey);
        this.bodiesByGroup.delete(deleteKey);
        this.groupsDirty = true;
      }
    }

    // update groups that should be here
    for (i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (!group) continue;
      let existing = this.groupsMap.get(group.ID);

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
    }

    // update objects that should be here
    for (i = 0; i < updates.length; i++) {
      const update = updates[i];
      if (!update) continue;
      const existing = this.bodiesMap.get(update.ID);

      if (existing && existing === update) {
        let group: GroupState | null = null;
        if (update.Group != 0) group = this.getGroup(update.Group) ?? null;
        update.group = group;
        update.zIndex = group ? group.ZIndex || 0 : 0;

        const spriteStr = String(update.Sprite || "");
        const isFlag =
          spriteStr.startsWith("ctf_flag") || spriteStr.includes("flag");
        if (isFlag && !(update.renderer instanceof Flag)) {
          if (update.renderer) update.renderer.destroy();
          update.renderer = new Flag(this.container, this);
        }

        if (update.renderer) update.renderer.update(update);
        continue;
      }

      this.bodiesMap.set(update.ID, update);

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

        const spriteStr = String(update.Sprite || existing.Sprite || "");
        const isFlag =
          spriteStr.startsWith("ctf_flag") || spriteStr.includes("flag");
        if (isFlag && !(existing.renderer instanceof Flag)) {
          if (existing.renderer) existing.renderer.destroy();
          update.renderer = new Flag(this.container, this);
        } else {
          update.renderer = existing.renderer;
        }
        update.previous = false;

        existing.previous = false;
        existing.renderer = undefined;
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
              case 1: {
                let ship =
                  update.renderer instanceof Ship
                    ? update.renderer
                    : new Ship(this.container);
                update.renderer = ship;

                let fleet = group.renderer;
                if (!fleet) fleet = new Fleet(this.container, this);
                group.renderer = fleet;

                if (fleet) fleet.addShip(ship);
                break;
              }

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
          if (!update.renderer) {
            const spriteStr = String(update.Sprite || "");
            const isFlag =
              spriteStr.startsWith("ctf_flag") || spriteStr.includes("flag");
            if (isFlag) {
              update.renderer = new Flag(this.container, this);
            } else {
              update.renderer = new RenderedObject(this.container);
            }
          }

          update.group = group;
          update.zIndex = 0;
          if (group) update.zIndex = group.ZIndex || 0;

          if (update.renderer) update.renderer.update(update);
        }

        Cache.count++;
      }
    }
  }

  /**
   * Iterates through all active bodies in ascending group z-index order.
   *
   * @param action - Callback invoked for each body.
   * @param thisObj - Optional `this` context for callback execution.
   */
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

  /**
   * Iterates through all active groups in ascending z-index order.
   *
   * @param action - Callback invoked for each group.
   * @param thisObj - Optional `this` context for callback execution.
   */
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

  /**
   * Retrieves a cached group state object by its authoritative group ID.
   *
   * @param groupID - Group identifier.
   * @returns `GroupState` or `undefined` if not present.
   */
  getGroup(groupID: number): GroupState | undefined {
    return this.groupsMap.get(groupID);
  }

  /**
   * Retrieves a cached body state object by its authoritative body ID.
   *
   * @param bodyID - Body identifier.
   * @returns `BodyState` or `undefined` if not present.
   */
  getBody(bodyID: number): BodyState | undefined {
    return this.bodiesMap.get(bodyID);
  }
}
