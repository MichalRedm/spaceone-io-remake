import { is } from "css-select";

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
  const clean = (scss ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  const rulesMap = new Map<string, Record<string, string[]>>();
  flattenScss(clean, [""], rulesMap);

  const ruleList: ThemeRule[] = [];
  for (const [selector, obj] of rulesMap.entries()) {
    ruleList.push({ selector, obj });
  }
  return ruleList;
}

function flattenScss(
  content: string,
  parentSelectors: string[],
  rulesMap: Map<string, Record<string, string[]>>,
  propertyPrefix = "",
): void {
  let i = 0;
  const len = content.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(content[i])) i++;
    if (i >= len) break;

    const braceIdx = content.indexOf("{", i);
    const semiIdx = content.indexOf(";", i);

    // If no more braces
    if (braceIdx === -1) {
      if (semiIdx !== -1) {
        const declStr = content.substring(i, semiIdx).trim();
        addDeclToMap(declStr, parentSelectors, rulesMap, propertyPrefix);
        i = semiIdx + 1;
        continue;
      }
      break;
    }

    // If semicolon comes before brace, it's a direct declaration
    if (semiIdx !== -1 && semiIdx < braceIdx) {
      const declStr = content.substring(i, semiIdx).trim();
      addDeclToMap(declStr, parentSelectors, rulesMap, propertyPrefix);
      i = semiIdx + 1;
      continue;
    }

    // Selector followed by '{'
    const rawSelector = content.substring(i, braceIdx).trim();
    i = braceIdx + 1;

    // Find matching '}'
    let depth = 1;
    const blockStart = i;
    while (i < len && depth > 0) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") depth--;
      i++;
    }
    const blockBody = content.substring(blockStart, i - 1);

    if (rawSelector.endsWith(":")) {
      const prefixSegment = rawSelector.slice(0, -1).trim();
      const nextPrefix = propertyPrefix
        ? `${propertyPrefix}-${prefixSegment}`
        : prefixSegment;
      flattenScss(blockBody, parentSelectors, rulesMap, nextPrefix);
    } else {
      const currentSelectors = rawSelector
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const combinedSelectors: string[] = [];
      for (const parent of parentSelectors) {
        for (const current of currentSelectors) {
          if (!parent) {
            combinedSelectors.push(current);
          } else if (current.includes("&")) {
            combinedSelectors.push(current.replace(/&/g, parent));
          } else {
            combinedSelectors.push(`${parent} ${current}`);
          }
        }
      }

      flattenScss(blockBody, combinedSelectors, rulesMap, "");
    }
  }
}

function addDeclToMap(
  declStr: string,
  selectors: string[],
  rulesMap: Map<string, Record<string, string[]>>,
  propertyPrefix = "",
): void {
  const colonIdx = declStr.indexOf(":");
  if (colonIdx === -1) return;
  const rawProp = declStr.substring(0, colonIdx).trim();
  const prop = propertyPrefix ? `${propertyPrefix}-${rawProp}` : rawProp;
  const valStr = declStr.substring(colonIdx + 1).trim();
  if (!prop || !valStr) return;

  const values: string[] = [];
  const tokenRegex = /(?:"[^"]*"|'[^']*'|rgba?\([^)]+\)|[^\s,]+)/g;
  let valMatch: RegExpExecArray | null;
  while ((valMatch = tokenRegex.exec(valStr)) !== null) {
    values.push(valMatch[0]);
  }
  if (values.length === 0) return;

  for (const sel of selectors) {
    if (!sel) continue;
    let obj = rulesMap.get(sel);
    if (!obj) {
      obj = {};
      rulesMap.set(sel, obj);
    }
    obj[prop] = values;
  }
}

export function parseCssIntoRules(css?: string): ThemeRule[] {
  return parseScssIntoRules(css ?? "");
}

export function selectorMatches(
  selector: string,
  selectProps: ElementQueryProps,
): boolean {
  if (!selector || selector.trim() === "") return false;
  try {
    const thing: any = {
      type: "tag",
      name: selectProps.element ?? "",
      attribs: {
        id: selectProps.id ?? "",
        class: selectProps.class ?? "",
      },
    };
    return is(thing, selector);
  } catch {
    return false;
  }
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
