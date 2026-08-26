import { getPlotly } from "../plotly-subset";
import { Settings } from "../settings";
import * as PIXI from "pixi.js";
import type { CustomContainer } from "../CustomContainer";
import type { Ship } from "./ship";
import type { Cache, GroupState } from "../cache";
import type { Interpolator } from "../interpolator";

export class Fleet {
  container: CustomContainer;
  caption?: string | null;
  ships: Ship[];
  ID: number;
  text: PIXI.Text;
  textChat: PIXI.Text;
  chat?: string | null;
  plotly?: { data: any; layout: any } | null;
  usingPlotly = false;

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

    this.textChat = new PIXI.Text("", {
      fontFamily: "FontAwesome",
      fontSize: Settings.nameSize,
      fill: 0xffffff,
    });
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

  addShip(ship: Ship): void {
    this.ships.push(ship);
    ship.fleet = this;
  }

  removeShip(ship: Ship): void {
    this.ships = this.ships.filter((s) => s !== ship);
  }

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

  preRender(time: number, interpolator: Interpolator, myFleetID: number): void {
    if (this.ships.length > 0 && this.ID !== myFleetID) {
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

        this.ships.forEach((ship) => {
          if (ship.body) {
            const position = interpolator.projectObject(ship.body, time);
            accX += position.x;
            accY += position.y;
            count++;
          }
        });

        if (count > 0) {
          const offsetY = 0;
          this.text.position.x = accX / count;
          this.text.position.y = accY / count + offsetY;
          this.textChat.position.x = accX / count;
          this.textChat.position.y = accY / count + offsetY - 200;
        }
      }
    } else {
      this.text.visible = false;
      this.textChat.visible = false;
    }
  }

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
