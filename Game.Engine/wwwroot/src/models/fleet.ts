/**
 * @file Multi-ship fleet container, captain nametag, and chat balloon controller.
 * @module models/fleet
 */

import { getPlotly } from "../ui/plotlySubset";
import { Settings } from "../ui/settings";
import * as PIXI from "pixi.js";
import type { CustomContainer } from "../rendering/customContainer";
import type { Ship } from "./ship";
import type { Cache, GroupState } from "./cache";
import type { Interpolator } from "../rendering/interpolator";
import type { Camera } from "../rendering/camera";

/**
 * Controller managing a collection of ships belonging to a single player fleet.
 *
 * @remarks
 * Renders the fleet captain's username label (`PIXI.Text`), in-game speech chat balloons,
 * and handles Plotly telemetry integration for physics calibration debugging.
 */
export class Fleet {
  /** Root game rendering container. */
  container: CustomContainer;
  /** Player nickname caption. */
  caption?: string | null;
  /** Active constituent ships belonging to this fleet. */
  ships: Ship[];
  /** Authoritative group ID. */
  ID: number;
  /** PixiJS text display object for player nickname. */
  text: PIXI.Text;
  /** PixiJS text display object for chat message balloon. */
  textChat: PIXI.Text;
  /** Current chat bubble text string, or `null` if none active. */
  chat?: string | null;
  /** Telemetry plot data payload if enabled for debugging. */
  plotly?: { data: any; layout: any } | null;
  /** Whether Plotly is currently rendering into the debug container. */
  usingPlotly = false;

  /**
   * Constructs a Fleet controller and registers nametag and chat text objects on the stage.
   *
   * @param container - Root game rendering container.
   * @param _cache - Optional entity cache reference.
   */
  constructor(container: CustomContainer, _cache?: Cache) {
    this.container = container;
    this.caption = null;
    this.ships = [];
    this.ID = 0;
    this.text = new PIXI.Text("", {
      fontFamily: [Settings.font, "NotoColorEmoji"],
      fontSize: Settings.nameSize * 4,
      fill: 0xffffff,
    });
    this.text.scale.x = 0.25;
    this.text.scale.y = 0.25;
    this.text.style.stroke = "black";
    this.text.style.strokeThickness = 8;
    this.text.parentGroup = this.container.bodyGroup;
    this.text.zOrder = 350;

    this.textChat = new PIXI.Text("", {
      fontFamily: "FontAwesome",
      fontSize: Settings.nameSize,
      fill: 0xffffff,
    });
    this.textChat.parentGroup = this.container.bodyGroup;
    this.textChat.zOrder = 351;
    this.chat = null;
    this.plotly = null;
    this.text.anchor.set(0.5, 0.5);
    this.textChat.anchor.set(0.5, 0.5);
    this.text.position.x = 0;
    this.text.position.y = 0;
    this.textChat.position.x = 0;
    this.textChat.position.y = 0;

    this.container.addChild(this.text);
    this.container.addChild(this.textChat);
  }

  /**
   * Adds a ship instance to this fleet's membership.
   *
   * @param ship - Ship to register.
   */
  addShip(ship: Ship): void {
    this.ships.push(ship);
    ship.fleet = this;
  }

  /**
   * Removes a ship instance from this fleet's membership.
   *
   * @param ship - Ship to remove.
   */
  removeShip(ship: Ship): void {
    this.ships = this.ships.filter((s) => s !== ship);
  }

  /**
   * Ingests group update data from server snapshot (customData, caption, chat).
   *
   * @param groupUpdate - Group state payload.
   * @param myFleetID - Local player's own fleet ID.
   */
  update(groupUpdate: GroupState, myFleetID: number): void {
    this.caption = groupUpdate.Caption ?? null;
    this.ID = groupUpdate.ID;

    if (groupUpdate.CustomData && typeof groupUpdate.CustomData === "object") {
      const customData = groupUpdate.CustomData as Record<string, any>;
      if (customData["chat"]) this.chat = String(customData["chat"]);
      else this.chat = null;

      if (customData["plotly"]) this.plotly = customData["plotly"];
      else this.plotly = null;
    }

    if (this.plotly && this.ID === myFleetID && this.container.plotly) {
      if (!this.container.plotly.used) {
        this.container.plotly.used = true;
        this.usingPlotly = true;
        console.log("setting plotly use");
      }
      getPlotly().then((Plotly) => {
        if (this.usingPlotly && this.container.plotly && this.plotly) {
          Plotly.react(
            this.container.plotly,
            this.plotly.data,
            this.plotly.layout,
            {
              displayModeBar: false,
              staticPlot: true,
            },
          );
        }
      });
    }

    if (this.usingPlotly && this.ID !== myFleetID) {
      if (this.container.plotly) {
        this.container.plotly.used = false;
      }
      this.usingPlotly = false;
    }
  }

  /**
   * Updates centroid positioning of nametag and chat text relative to all alive fleet ships.
   *
   * @param time - Authoritative render timestamp in milliseconds.
   * @param interpolator - Kinematic interpolation service.
   * @param myFleetID - Local player's fleet ID.
   * @param isSpectating - Whether client is currently in spectator mode.
   * @param camera - Optional camera for frustum culling.
   */
  preRender(
    time: number,
    interpolator: Interpolator,
    myFleetID: number,
    isSpectating: boolean,
    camera?: Camera,
  ): void {
    if (this.ships.length > 0 && (this.ID !== myFleetID || isSpectating)) {
      if (this.text.visible !== Settings.namesEnabled)
        this.text.visible = Settings.namesEnabled;

      if (Settings.nameSize) {
        if (this.caption) this.text.text = this.caption;
        else this.text.text = "";

        if (this.chat) this.textChat.text = this.chat;
        else this.textChat.text = "";

        let accX = 0,
          accY = 0,
          count = 0;

        for (let i = 0; i < this.ships.length; i++) {
          const ship = this.ships[i];
          if (ship && ship.body) {
            const posX =
              ship.lastPosition.x !== 0 || ship.lastPosition.y !== 0
                ? ship.lastPosition.x
                : (ship.body.Position?.x ?? ship.body.OriginalPosition.x);
            const posY =
              ship.lastPosition.x !== 0 || ship.lastPosition.y !== 0
                ? ship.lastPosition.y
                : (ship.body.Position?.y ?? ship.body.OriginalPosition.y);
            accX += posX;
            accY += posY;
            count++;
          }
        }

        if (count > 0) {
          const offsetY = 0;
          const posX = accX / count;
          const posY = accY / count + offsetY;
          this.text.position.x = posX;
          this.text.position.y = posY;
          this.textChat.position.x = posX;
          this.textChat.position.y = posY - 200;

          const inView = !camera || camera.isWorldPointInView(posX, posY, 350);
          if (this.text.renderable !== inView) this.text.renderable = inView;
          if (this.textChat.renderable !== inView)
            this.textChat.renderable = inView;
        }
      }
    } else {
      this.text.visible = false;
      this.textChat.visible = false;
    }
  }

  /**
   * Cleans up nametag, chat bubble, and Plotly resources from the scene.
   */
  destroy(): void {
    this.container.removeChild(this.text);
    this.container.removeChild(this.textChat);
    this.text.destroy({ children: true, texture: true, baseTexture: true });
    this.textChat.destroy({ children: true, texture: true, baseTexture: true });
    if (this.usingPlotly) {
      if (this.container.plotly) {
        this.container.plotly.used = false;
      }
      console.log("unsetting plotly use");
    }
  }
}
