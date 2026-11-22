/**
 * @file High-level Spaceone.io gameplay audio dispatcher and state-gating facade.
 * @module audio/gameAudio
 *
 * @remarks
 * Translates client world snapshot updates, fleet transitions, and UI interactions
 * into spatially positioned, rate-limited `AudioManager` calls while suppressing
 * burst artifacts during initial arena joins or backgrounded tabs.
 */

import { audioManager } from "./audioManager";
import { SoundPriority } from "./soundManifest";

const GAME_AUDIO_CONSTANTS = {
  /** Number of initial server snapshots suppressed after arena switch/reset. */
  INITIAL_SNAPSHOT_SUPPRESS_COUNT: 2,
  /** Grace window (ms) after death during which world explosions/death pad finish cleanly. */
  POST_DEATH_AUDIBLE_GRACE_MS: 1600,
  /** Grace window (ms) after spawn during which initial fleet ship additions don't chime. */
  POST_SPAWN_SHIP_GAIN_GRACE_MS: 500,
  /** Interval (ms) between periodic radar sonar pings while remaining out of bounds. */
  DANGER_ZONE_REPEAT_MS: 1250,
  /** World margin outside arena border within which food deaths still count as pickups. */
  FOOD_PICKUP_OOB_MARGIN: 60,
  /** Volley gain boost cap from log2 ship count. */
  VOLLEY_GAIN_LOG_CAP: 0.28,
  /** Volley gain slope per log2 ship count. */
  VOLLEY_GAIN_LOG_SLOPE: 0.055,
  /** Volley pitch drop cap from log2 ship count. */
  VOLLEY_PITCH_DROP_CAP: 0.14,
  /** Volley pitch drop slope per log2 ship count. */
  VOLLEY_PITCH_DROP_SLOPE: 0.025,
  /** Own vs enemy laser volume multipliers. */
  OWN_LASER_GAIN_MULT: 1.05,
  ENEMY_LASER_GAIN_MULT: 0.72,
  /** Own vs enemy boost volume multipliers. */
  OWN_BOOST_GAIN_MULT: 1.05,
  ENEMY_BOOST_GAIN_MULT: 0.65,
} as const;

let isAlive = false;
let isSpectating = false;
let deathGraceUntil = 0;
let worldSize = 1000;
let ownFleetID = 0;
let suppressSnapshotsRemaining = 0;
let lastDangerPingTime = 0;
let wasInDangerZone = false;

function isGameplayAudible(now = performance.now()): boolean {
  if (suppressSnapshotsRemaining > 0) return false;
  return isAlive || isSpectating || now < deathGraceUntil;
}

/**
 * Facade exposing semantic gameplay and UI audio triggers to client subsystems.
 */
export const GameAudio = {
  /**
   * Initializes the underlying Web Audio manager and starts background asset prefetching.
   */
  init(): void {
    audioManager.init();
  },

  /**
   * Synchronizes the 2D audio listener position with the active camera frustum.
   *
   * @param worldX - Camera focus X in world units.
   * @param worldY - Camera focus Y in world units.
   * @param viewportWidth - Visible camera viewport width in world units.
   */
  setListener(worldX: number, worldY: number, viewportWidth: number): void {
    audioManager.setListener(worldX, worldY, viewportWidth);
  },

  /**
   * Updates lifecycle and arena state used to gate world sound effects.
   *
   * @param alive - Whether the local player fleet is alive.
   * @param spectating - Whether the client is actively spectating.
   * @param fleetId - Local player's fleet ID (or 0 if none).
   * @param currentWorldSize - Half-extent of the square arena in world units.
   */
  setState(
    alive: boolean,
    spectating: boolean,
    fleetId: number,
    currentWorldSize: number,
  ): void {
    isAlive = alive;
    isSpectating = spectating;
    ownFleetID = fleetId;
    if (currentWorldSize > 0) {
      worldSize = currentWorldSize;
    }
  },

  /**
   * Returns whether the client is actively in-game (alive or spectating),
   * independent of menu body CSS classes.
   */
  isInGame(): boolean {
    return isAlive || isSpectating;
  },

  /**
   * Returns the configured post-spawn grace window (ms) for suppressing initial ship-gain chimes.
   */
  getPostSpawnGraceMs(): number {
    return GAME_AUDIO_CONSTANTS.POST_SPAWN_SHIP_GAIN_GRACE_MS;
  },

  /**
   * Resets snapshot suppression counters on arena switch or cache clear.
   */
  onWorldReset(): void {
    suppressSnapshotsRemaining =
      GAME_AUDIO_CONSTANTS.INITIAL_SNAPSHOT_SUPPRESS_COUNT;
    wasInDangerZone = false;
    lastDangerPingTime = 0;
  },

  /**
   * Advances snapshot suppression counter at the end of a `Cache.update()` batch.
   */
  onSnapshotComplete(): void {
    if (suppressSnapshotsRemaining > 0) {
      suppressSnapshotsRemaining--;
    }
  },

  /**
   * Evaluates whether a world coordinate lies inside the active arena (plus small margin),
   * helping distinguish player food pickups from out-of-bounds decay.
   */
  isWithinArena(worldX: number, worldY: number): boolean {
    const limit = worldSize + GAME_AUDIO_CONSTANTS.FOOD_PICKUP_OOB_MARGIN;
    return Math.abs(worldX) <= limit && Math.abs(worldY) <= limit;
  },

  /**
   * Plays a single unified volley sound for a fleet laser burst, scaling fullness subtly with ship count.
   *
   * @param worldX - Centroid X of the volley in world units.
   * @param worldY - Centroid Y of the volley in world units.
   * @param bulletCount - Number of projectiles spawned in the volley.
   * @param isOwn - Whether the volley originated near the local player's fleet.
   */
  onLaserVolley(
    worldX: number,
    worldY: number,
    bulletCount: number,
    isOwn: boolean,
  ): void {
    if (!isGameplayAudible()) return;
    const countLog = Math.log2(Math.max(1, bulletCount));
    const baseMult = isOwn
      ? GAME_AUDIO_CONSTANTS.OWN_LASER_GAIN_MULT
      : GAME_AUDIO_CONSTANTS.ENEMY_LASER_GAIN_MULT;
    const gainScale =
      baseMult *
      (1.0 +
        Math.min(
          GAME_AUDIO_CONSTANTS.VOLLEY_GAIN_LOG_CAP,
          countLog * GAME_AUDIO_CONSTANTS.VOLLEY_GAIN_LOG_SLOPE,
        ));
    const pitchScale =
      1.0 -
      Math.min(
        GAME_AUDIO_CONSTANTS.VOLLEY_PITCH_DROP_CAP,
        countLog * GAME_AUDIO_CONSTANTS.VOLLEY_PITCH_DROP_SLOPE,
      );
    audioManager.play("laser_fire", {
      worldX,
      worldY,
      gainScale,
      pitchScale,
      priorityOverride: isOwn ? SoundPriority.High : SoundPriority.Medium,
    });
  },

  /**
   * Plays a subtle resonant impact sound when a projectile hits an obstacle or shielded hull.
   */
  onBulletHit(worldX: number, worldY: number): void {
    if (!isGameplayAudible()) return;
    audioManager.play("bullet_hit", { worldX, worldY });
  },

  /**
   * Plays a crystalline chime when a food/star orb is collected.
   */
  onFoodCollect(worldX: number, worldY: number): void {
    if (!isGameplayAudible()) return;
    audioManager.play("food_collect", { worldX, worldY });
  },

  /**
   * Plays a deep resonant explosion scaled subtly by ship radius.
   */
  onShipExplode(worldX: number, worldY: number, shipSize = 50): void {
    if (!isGameplayAudible()) return;
    const sizeRatio = Math.max(0.7, Math.min(1.3, shipSize / 50));
    audioManager.play("ship_explode", {
      worldX,
      worldY,
      gainScale: 0.85 + 0.15 * sizeRatio,
      pitchScale: 1.06 - 0.06 * sizeRatio,
    });
  },

  /**
   * Plays the atmospheric boost surge when a fleet initiates Split & Dash.
   */
  onFleetBoost(groupId: number, worldX: number, worldY: number): void {
    if (!isGameplayAudible()) return;
    const isOwn = ownFleetID !== 0 && groupId === ownFleetID;
    audioManager.play("boost", {
      worldX,
      worldY,
      gainScale: isOwn
        ? GAME_AUDIO_CONSTANTS.OWN_BOOST_GAIN_MULT
        : GAME_AUDIO_CONSTANTS.ENEMY_BOOST_GAIN_MULT,
      priorityOverride: isOwn ? SoundPriority.High : SoundPriority.Medium,
    });
  },

  /**
   * Plays a subtle ascending chime when the local fleet gains an earned ship.
   */
  onShipGain(): void {
    if (!isAlive) return;
    audioManager.play("ship_gain");
  },

  /**
   * Plays the kill confirmation stinger when the local player eliminates an opponent.
   */
  onKillConfirm(): void {
    if (!isGameplayAudible()) return;
    audioManager.play("kill_confirm");
  },

  /**
   * Plays the ethereal warp-in sound when the local player spawns into the arena.
   */
  onPlayerSpawn(): void {
    deathGraceUntil = 0;
    wasInDangerZone = false;
    audioManager.play("player_spawn");
  },

  /**
   * Plays the atmospheric power-down pad when the local player's fleet is destroyed.
   */
  onPlayerDeath(): void {
    deathGraceUntil =
      performance.now() + GAME_AUDIO_CONSTANTS.POST_DEATH_AUDIBLE_GRACE_MS;
    wasInDangerZone = false;
    audioManager.play("player_death");
  },

  /**
   * Updates the out-of-bounds sonar proximity ping while the player is alive outside arena bounds.
   *
   * @param isOutOfBounds - Whether the player's camera/fleet is currently in the Danger Zone.
   * @param now - Current `performance.now()` timestamp in milliseconds.
   */
  updateDangerZone(isOutOfBounds: boolean, now: number): void {
    if (!isAlive || !isOutOfBounds) {
      wasInDangerZone = false;
      return;
    }
    if (
      !wasInDangerZone ||
      now - lastDangerPingTime >= GAME_AUDIO_CONSTANTS.DANGER_ZONE_REPEAT_MS
    ) {
      wasInDangerZone = true;
      lastDangerPingTime = now;
      audioManager.play("danger_zone");
    }
  },

  /**
   * Plays either the CTF match event chime or the CTF victory fanfare.
   *
   * @param isVictory - True for game-over victory announcements, false for flag/score alerts.
   */
  onCtfAnnouncement(isVictory: boolean): void {
    if (!isGameplayAudible()) return;
    audioManager.play(isVictory ? "ctf_victory" : "ctf_event");
  },

  /**
   * Plays a crisp glassy micro-tick for menu and control toggles.
   */
  onUiClick(): void {
    audioManager.play("ui_click");
  },
};
