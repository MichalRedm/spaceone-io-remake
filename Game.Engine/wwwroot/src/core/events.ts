/**
 * @file Game telemetry and analytics event dispatcher.
 * @module core/events
 */

/**
 * Dispatches player lifecycle, gameplay, and navigation events to Google Analytics / Tag Manager.
 */
export class Events {
  /**
   * Pushes a custom analytics event to `window.dataLayer`.
   *
   * @param category - High-level event category (e.g. `'life'`, `'room'`, `'other'`).
   * @param action - Action identifier (e.g. `'spawn'`, `'death'`, `'spectate'`).
   * @param value - Optional numeric metric (e.g. seconds played) or string label.
   */
  static Report(
    category: string,
    action: string,
    value?: number | string,
  ): void {
    (<any>window).dataLayer = (<any>window).dataLayer || [];
    function gtag(...args: any[]): void {
      (<any>window).dataLayer.push(args);
    }
    gtag("event", action, { event_category: category, value: value });
  }

  /**
   * Dispatches a player fleet spawn telemetry event.
   */
  static Spawn(): void {
    Events.Report("life", "spawn");
  }

  /**
   * Dispatches a player death event with lifespan duration.
   *
   * @param secondsPlayed - Lifespan duration in seconds for the fleet session.
   */
  static Death(secondsPlayed: number): void {
    Events.Report("life", "death", secondsPlayed);
  }

  /**
   * Dispatches an event when the user switches to spectating mode.
   */
  static Spectate(): void {
    Events.Report("other", "spectate");
  }

  /**
   * Dispatches an event when the user switches world rooms or arena instances.
   *
   * @param room - Target room or world key.
   */
  static changeRoom(room: string): void {
    Events.Report("room", room);
  }
}
