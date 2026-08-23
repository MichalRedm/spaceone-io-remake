import { is } from "css-select";
import * as sass from "sass";
import { Buffer } from "buffer";

// in case your code is isomorphic
if (typeof window !== "undefined") window.Buffer = Buffer;

function parseScssIntoRules(scss) {
  try {
    if (sass && typeof sass.compileString === "function") {
      return parseCssIntoRules(sass.compileString(scss).css);
    } else if (sass && typeof sass.renderSync === "function") {
      return parseCssIntoRules(
        sass.renderSync({ data: scss }).css.toString("utf8"),
      );
    }
  } catch (e) {
    console.warn("Failed to compile SCSS, parsing directly:", e);
  }
  return parseCssIntoRules(scss);
}

function parseCssIntoRules(css) {
  const cleanCss = (css || "").replace(/\/\*[\s\S]*?\*\//g, "");
  const ruleList = [];
  const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
  let match;
  while ((match = ruleRegex.exec(cleanCss)) !== null) {
    const selectorGroup = match[1].trim();
    const body = match[2].trim();
    const blockOBJ = {};
    const decls = body.split(";");
    for (const decl of decls) {
      const colonIdx = decl.indexOf(":");
      if (colonIdx === -1) continue;
      const prop = decl.substring(0, colonIdx).trim();
      const valStr = decl.substring(colonIdx + 1).trim();
      if (!prop || !valStr) continue;
      const values = [];
      const tokenRegex = /(?:"[^"]*"|'[^']*'|rgba?\([^)]+\)|[^\s,]+)/g;
      let valMatch;
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

function selectorMatches(selector, selectProps) {
  var thing = {
    type: "tag",
    name: selectProps.element,
    attribs: {
      id: selectProps.id,
      class: selectProps.class,
    },
  };
  return is(thing, selector);
}

function queryProperties(element, ruleList) {
  var res = {};
  if (!ruleList) return res;
  for (var i = 0; i < ruleList.length; i++) {
    if (selectorMatches(ruleList[i].selector, element)) {
      for (var p in ruleList[i].obj) {
        if (res[p] == undefined) {
          res[p] = [];
        }
        res[p] = ruleList[i].obj[p]
          .map((x) => (x == "inherit" ? res[p] : [x]))
          .reduce((a, b) => a.concat(b), []);
      }
    }
  }
  return res;
}

export { parseCssIntoRules, queryProperties, parseScssIntoRules };
