export class Events {
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

  static Spawn(): void {
    Events.Report("life", "spawn");
  }

  static Death(secondsPlayed: number): void {
    Events.Report("life", "death", secondsPlayed);
  }

  static Spectate(): void {
    Events.Report("other", "spectate");
  }

  static changeRoom(room: string): void {
    Events.Report("room", room);
  }
}
