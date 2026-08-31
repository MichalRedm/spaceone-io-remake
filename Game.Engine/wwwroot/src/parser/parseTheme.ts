/**
 * @file SCSS/CSS theme rule parser, AST flattener, and CSS selector engine for dynamic sprite styling.
 * @module parser/parseTheme
 *
 * @remarks
 * Parses nested SCSS stylesheet rules into flattened CSS rules and provides `queryProperties()`
 * using `css-select` to evaluate element descriptors (`{ element: 'ship_cyan', class: 'boost' }`)
 * against style definitions to resolve sprite textures, colors, emitters, and offsets.
 */

import { is } from "css-select";

/**
 * Flattened CSS/SCSS theme rule mapping a selector to key-value property arrays.
 */
export interface ThemeRule {
  /** CSS selector string (e.g. `'.boost.shield'`, `'ship0'`). */
  selector: string;
  /** Property bag mapping CSS property names to token arrays. */
  obj: Record<string, string[]>;
}

/**
 * Element query descriptor tested against CSS selectors.
 */
export interface ElementQueryProps {
  /** Tag / element name (e.g. `'ship0'`, `'bullet_cyan'`). */
  element?: string;
  /** Element ID (e.g. `'ship'`). */
  id?: string;
  /** Space-separated class list (e.g. `'boost shield'`). */
  class?: string;
}

/**
 * Parses raw SCSS source code into flattened theme rules.
 *
 * @param scss - Raw SCSS stylesheet string.
 * @returns Array of flattened `ThemeRule` objects.
 */
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

/**
 * Recursively parses and flattens nested SCSS blocks into a flat selector map.
 *
 * @param content - SCSS block body string.
 * @param parentSelectors - Array of parent selectors from outer scopes.
 * @param rulesMap - Map collecting flattened selectors and declarations.
 * @param propertyPrefix - Hierarchical property name prefix.
 */
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

/**
 * Tokenizes a single property declaration string and stores token arrays into the rules map.
 *
 * @param declStr - Raw declaration string (e.g. `'offset-x: 10px'`).
 * @param selectors - Target selectors.
 * @param rulesMap - Target rules map.
 * @param propertyPrefix - Optional property prefix.
 */
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

/**
 * Parses raw CSS into flattened theme rules.
 *
 * @param css - Raw CSS string.
 * @returns Array of theme rules.
 */
export function parseCssIntoRules(css?: string): ThemeRule[] {
  return parseScssIntoRules(css ?? "");
}

/**
 * Evaluates whether an element query descriptor satisfies a given CSS selector.
 *
 * @param selector - CSS selector string.
 * @param selectProps - Element query properties.
 * @returns `true` if selector matches, otherwise `false`.
 */
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

const _queryCache = new WeakMap<
  ThemeRule[],
  Map<string, Record<string, string[]>>
>();

/**
 * Queries and merges all matching CSS properties for an element descriptor from a list of theme rules.
 *
 * @param element - Element query descriptor.
 * @param ruleList - List of active theme rules.
 * @returns Property dictionary mapping CSS keys to resolved token arrays.
 */
export function queryProperties(
  element: ElementQueryProps,
  ruleList?: ThemeRule[],
): Record<string, string[]> {
  if (!ruleList || ruleList.length === 0) return {};

  let cacheForRules = _queryCache.get(ruleList);
  if (!cacheForRules) {
    cacheForRules = new Map<string, Record<string, string[]>>();
    _queryCache.set(ruleList, cacheForRules);
  }

  const cacheKey = `${element.element ?? ""}|${element.id ?? ""}|${element.class ?? ""}`;
  const cached = cacheForRules.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const res: Record<string, string[]> = {};
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

  cacheForRules.set(cacheKey, res);
  return res;
}
