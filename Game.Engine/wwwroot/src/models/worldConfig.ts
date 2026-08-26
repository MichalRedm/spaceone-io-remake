export interface WorldHookConfig {
  shotThrust: number[];
  bulletLifeTable: number[];
  shotThrustConverter: number;
  spawnInvulnerabilityTime: number;
  invulnerabilityBlinkPeriod: number;
  boostDuration: number;
  boostPhase1SurgeMs: number;
  boostPhase2BurnMs: number;
  boostPhase3DurationMs: number;
}

export const DEFAULT_HOOK_CONFIG: Readonly<WorldHookConfig> = {
  shotThrust: [
    0, 41, 34.17, 30.71, 28.47, 26.85, 25.59, 24.58, 23.73, 23.01, 22.38, 21.82,
    21.33, 20.88, 20.48, 20.11, 19.77, 19.46, 19.17, 18.9, 18.65, 18.41, 18.19,
    17.97, 17.77, 17.58, 17.4, 17.23, 17.07, 16.91, 16.76, 16.62, 16.48, 16.35,
    16.22, 16.1, 15.98, 15.86, 15.75, 15.64, 15.54, 15.44, 15.34, 15.25, 15.16,
    15.07, 14.98, 14.89, 14.81, 14.73, 14.65, 14.58, 14.5, 14.43, 14.36, 14.29,
    14.22, 14.16, 14.09, 14.03, 13.97, 13.91, 13.85, 13.79, 13.73, 13.68, 13.62,
    13.57, 13.52, 13.46, 13.41, 13.36, 13.31, 13.27, 13.22, 13.17, 13.13, 13.08,
    13.04, 12.99, 12.95, 12.91, 12.87, 12.83, 12.79, 12.75, 12.71, 12.67, 12.63,
    12.59, 12.56, 12.52, 12.48, 12.45, 12.41, 12.38, 12.34, 12.21, 12.07, 12.03,
    12,
  ],
  bulletLifeTable: [
    0, 1560, 1760, 1840, 1960, 2040, 2160, 2160, 2240, 2280, 2240, 2320, 2400,
    2400, 2480, 2440, 2440, 2560, 2520, 2520, 2640, 2600, 2600, 2720, 2720,
    2680, 2680, 2680, 2840, 2800, 2800, 2800, 2760, 2760, 2760, 2920, 2920,
    2920, 2880, 2880, 2880, 2880, 2840, 2840, 3040, 3040, 3040, 3040, 3000,
    3000, 3000, 3040, 3040, 3040, 3040, 3080, 3080, 3080, 3080, 3120, 3120,
    3120, 3120, 3120, 3160, 3160, 3160, 3160, 3160, 3200, 3200, 3200, 3200,
    3200, 3240, 3240, 3240, 3240, 3240, 3240, 3280, 3280, 3280, 3280, 3280,
    3280, 3320, 3320, 3320, 3320, 3320, 3320, 3320, 3360, 3360, 3360, 3360,
    3360, 3360, 3400, 3400,
  ],
  shotThrustConverter: 0.0013,
  spawnInvulnerabilityTime: 3000,
  invulnerabilityBlinkPeriod: 250,
  boostDuration: 1000,
  boostPhase1SurgeMs: 160,
  boostPhase2BurnMs: 360,
  boostPhase3DurationMs: 640,
};

export class WorldConfig {
  private static config: WorldHookConfig = { ...DEFAULT_HOOK_CONFIG };

  public static get current(): WorldHookConfig {
    return this.config;
  }

  public static get shotThrust(): number[] {
    return this.config.shotThrust;
  }

  public static get bulletLifeTable(): number[] {
    return this.config.bulletLifeTable;
  }

  public static get shotThrustScale(): number {
    return this.config.shotThrustConverter * 10;
  }

  public static get spawnInvulnerabilityDurationMs(): number {
    return this.config.spawnInvulnerabilityTime;
  }

  public static get invulnerabilityBlinkPeriodMs(): number {
    return this.config.invulnerabilityBlinkPeriod;
  }

  public static get boostDurationMs(): number {
    return this.config.boostDuration;
  }

  public static get boostPhase1SurgeMs(): number {
    return this.config.boostPhase1SurgeMs;
  }

  public static get boostPhase2BurnMs(): number {
    return this.config.boostPhase2BurnMs;
  }

  public static get boostPhase3DurationMs(): number {
    return this.config.boostPhase3DurationMs;
  }

  public static resetToDefaults(): void {
    this.config = { ...DEFAULT_HOOK_CONFIG };
  }

  public static updateFromHook(serverHook: unknown): void {
    if (!serverHook || typeof serverHook !== "object") return;
    const hook = serverHook as Record<string, unknown>;

    const shotThrust = Array.isArray(hook.ShotThrust)
      ? (hook.ShotThrust as number[])
      : this.config.shotThrust;

    const bulletLifeTable = Array.isArray(hook.BulletLifeTable)
      ? (hook.BulletLifeTable as number[])
      : this.config.bulletLifeTable;

    const shotThrustConverter =
      typeof hook.ShotThrustConverter === "number"
        ? hook.ShotThrustConverter
        : this.config.shotThrustConverter;

    const spawnInvulnerabilityTime =
      typeof hook.SpawnInvulnerabilityTime === "number"
        ? hook.SpawnInvulnerabilityTime
        : this.config.spawnInvulnerabilityTime;

    const invulnerabilityBlinkPeriod =
      typeof hook.InvulnerabilityBlinkPeriod === "number"
        ? hook.InvulnerabilityBlinkPeriod
        : this.config.invulnerabilityBlinkPeriod;

    const boostDuration =
      typeof hook.BoostDuration === "number"
        ? hook.BoostDuration
        : this.config.boostDuration;

    // Recalculate boost phase breakdowns proportionally if custom boostDuration is provided
    const boostRatio = boostDuration / 1000.0;
    const boostPhase1SurgeMs = Math.round(160 * boostRatio);
    const boostPhase2BurnMs = Math.round(360 * boostRatio);
    const boostPhase3DurationMs = boostDuration - boostPhase2BurnMs;

    this.config = {
      shotThrust,
      bulletLifeTable,
      shotThrustConverter,
      spawnInvulnerabilityTime,
      invulnerabilityBlinkPeriod,
      boostDuration,
      boostPhase1SurgeMs,
      boostPhase2BurnMs,
      boostPhase3DurationMs,
    };
  }

  public static getShipCountFromSpeed(speed: number): number {
    const table = this.config.shotThrust;
    if (speed <= 0 || !table || table.length <= 1) return 1;
    let bestIdx = 1;
    let bestDiff = Math.abs(speed - (table[1] ?? 41.0));
    for (let i = 2; i < table.length; i++) {
      const val = table[i];
      if (val === undefined) continue;
      const diff = Math.abs(speed - val);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    const lastVal = table[table.length - 1] ?? 12.0;
    if (speed < lastVal) {
      const estimatedN = Math.round(Math.pow(41.0 / speed, 3.7987));
      return Math.max(table.length - 1, estimatedN);
    }
    return bestIdx;
  }
}
