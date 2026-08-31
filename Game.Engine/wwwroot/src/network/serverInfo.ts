/**
 * @file Server administration parameter tuning GUI and hook synchronization.
 * @module network/serverInfo
 */

import * as dat from "dat.gui";

/** Dat.gui panel instance for server hook modification. */
export const gui = new dat.GUI({ width: 500 });

const hooks: Record<string, number | boolean | string> = {};

/** REST API response format for admin authentication. */
interface AuthResponse {
  response: {
    token: string;
  };
}

/** REST API response format for server hook retrieval. */
interface HookResponse {
  response: string;
}

const token: Promise<string> = fetch("/api/v1/user/authenticate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json; charset=utf-8",
  },
  body: JSON.stringify({
    Identifier: {
      UserKey: "Administrator",
    },
    password: prompt("What is the password") ?? "",
  }),
})
  .then((r) => r.json() as Promise<AuthResponse>)
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
      .then((res) => res.json() as Promise<HookResponse>)
      .then(({ response }) => {
        const obj = JSON.parse(response) as Record<
          string,
          number | boolean | string
        >;
        for (const key in obj) {
          const val = obj[key];
          hooks[key] = val === 0 ? 0.01 : val;
        }
        for (const key in hooks) {
          const val = hooks[key];
          if (typeof val === "boolean") {
            gui.add(hooks, key).onChange(bindParam(key));
          } else if (typeof val === "number") {
            let min: number;
            let max: number;
            let step: number | undefined;
            if (val < 0) {
              min = -1;
              max = 0;
              step = 0.000001;
            } else if (val <= 1) {
              min = 0;
              max = 1;
              step = 0.000001;
            } else {
              min = 0;
              max = 10 ** Math.ceil(Math.log10(val + 1));
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

/**
 * Transmits an updated server hook configuration value to the backend REST API.
 *
 * @param attr - Property key to modify.
 */
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

/**
 * Creates an event handler closure binding a property key to `sendHook`.
 *
 * @param a - Property key.
 * @returns Async callback function.
 */
export function bindParam(a: string): () => Promise<void> {
  return () => sendHook(a);
}
