import { fetch } from "whatwg-fetch";
import * as dat from "dat.gui";

export const gui = new dat.GUI({ width: 500 });

const hooks: Record<string, any> = {};

const token: Promise<string> = fetch("/api/v1/user/authenticate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json; charset=utf-8",
  },
  body: JSON.stringify({
    Identifier: {
      UserKey: "Administrator",
    },
    password: prompt("What is the password"),
  }),
})
  .then((r) => r.json())
  .then(({ response }) => response.token)
  .then((r: string) => {
    fetch("/api/v1/server/hook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${r}`,
      },
      body: "{}",
    })
      .then((res) => res.json())
      .then(({ response }) => {
        const obj = JSON.parse(response);
        for (const key in obj) {
          hooks[key] = obj[key] === 0 ? obj[key] + 0.01 : obj[key];
        }
        for (const key in hooks) {
          if (typeof hooks[key] === "boolean") {
            gui.add(hooks, key).onChange(bindParam(key));
          } else if (typeof hooks[key] !== "function") {
            let min: number;
            let max: number;
            let step: number | undefined;
            if (hooks[key] < 0) {
              min = -1;
              max = 0;
              step = 0.000001;
            } else if (hooks[key] <= 1) {
              min = 0;
              max = 1;
              step = 0.000001;
            } else {
              min = 0;
              max = 10 ** Math.ceil(Math.log10(hooks[key] + 1));
              step = 1;
            }

            if (step !== undefined) {
              gui.add(hooks, key, min, max, step).onChange(bindParam(key));
            } else {
              gui.add(hooks, key, min, max).onChange(bindParam(key));
            }
          }
        }
      });

    return r;
  });

export async function sendHook(attr: string): Promise<void> {
  const changer: Record<string, any> = {};
  changer[attr] = hooks[attr];
  await fetch("/api/v1/server/hook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${await token}`,
    },
    body: JSON.stringify(changer),
  });
}

export function bindParam(a: string): () => Promise<void> {
  return () => sendHook(a);
}
