import { is } from "css-select";
import * as sass from "sass";
import { Buffer } from "buffer";

if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
}

export interface ThemeRule {
  selector: string;
  obj: Record<string, string[]>;
}

export interface ElementQueryProps {
  element?: string;
  id?: string;
  class?: string;
}

export function parseScssIntoRules(scss: string): ThemeRule[] {
  try {
    if (sass && typeof (sass as any).compileString === "function") {
      return parseCssIntoRules((sass as any).compileString(scss).css);
    } else if (sass && typeof (sass as any).renderSync === "function") {
      return parseCssIntoRules(
        (sass as any).renderSync({ data: scss }).css.toString("utf8"),
      );
    }
  } catch (e) {
    console.warn("Failed to compile SCSS, parsing directly:", e);
  }
  return parseCssIntoRules(scss);
}

export function parseCssIntoRules(css?: string): ThemeRule[] {
  const cleanCss = (css ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  const ruleList: ThemeRule[] = [];
  const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRegex.exec(cleanCss)) !== null) {
    const selectorGroup = (match[1] ?? "").trim();
    const body = (match[2] ?? "").trim();
    const blockOBJ: Record<string, string[]> = {};
    const decls = body.split(";");
    for (const decl of decls) {
      const colonIdx = decl.indexOf(":");
      if (colonIdx === -1) continue;
      const prop = decl.substring(0, colonIdx).trim();
      const valStr = decl.substring(colonIdx + 1).trim();
      if (!prop || !valStr) continue;
      const values: string[] = [];
      const tokenRegex = /(?:"[^"]*"|'[^']*'|rgba?\([^)]+\)|[^\s,]+)/g;
      let valMatch: RegExpExecArray | null;
      while ((valMatch = tokenRegex.exec(valStr)) !== null) {
        values.push(valMatch[0]);
      }
      if (values.length > 0) {
        blockOBJ[prop] = values;
      }
    }
    const selectors = selectorGroup
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sel of selectors) {
      ruleList.push({ selector: sel, obj: blockOBJ });
    }
  }
  return ruleList;
}

export function selectorMatches(
  selector: string,
  selectProps: ElementQueryProps,
): boolean {
  const thing: any = {
    type: "tag",
    name: selectProps.element ?? "",
    attribs: {
      id: selectProps.id ?? "",
      class: selectProps.class ?? "",
    },
  };
  return is(thing, selector);
}

export function queryProperties(
  element: ElementQueryProps,
  ruleList?: ThemeRule[],
): Record<string, string[]> {
  const res: Record<string, string[]> = {};
  if (!ruleList) return res;
  for (let i = 0; i < ruleList.length; i++) {
    const rule = ruleList[i];
    if (rule && selectorMatches(rule.selector, element)) {
      for (const p in rule.obj) {
        if (res[p] === undefined) {
          res[p] = [];
        }
        const existing = res[p] ?? [];
        const rawValues = rule.obj[p] ?? [];
        res[p] = rawValues
          .map((x) => (x === "inherit" ? existing : [x]))
          .reduce((a, b) => a.concat(b), []);
      }
    }
  }
  return res;
}
