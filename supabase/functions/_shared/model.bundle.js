// src/model/types.js
var RANKS = ["C", "B", "A", "S"];
var ATTRIBUTES = {
  water: { name: "\uBB3C", color: "#3688ba" },
  fire: { name: "\uBD88", color: "#d7553d" },
  grass: { name: "\uD480", color: "#4d8660" },
  neutral: { name: "\uBB34\uC18D\uC131", color: "#777d89" },
  dark: { name: "\uC5B4\uB460", color: "#79549e" },
  light: { name: "\uBE5B", color: "#aa7a21" }
};
var ELEMENT_TYPES = ["text", "image", "rect", "attribute", "rank", "dice", "keywords", "effect"];
function newId() {
  return globalThis.crypto?.randomUUID?.() || "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
}

// src/model/problem-details.js
function valueLabel(value) {
  if (value === void 0) return "\uC5C6\uC74C";
  if (value === null) return "null";
  if (typeof value === "string") {
    if (/^data:/i.test(value)) return "\u201C\uB370\uC774\uD130 URL\u201D";
    if (/^[A-Za-z0-9+/]{80,}={0,2}$/.test(value)) return "\u201C\uC778\uCF54\uB529 \uB370\uC774\uD130 (" + value.length + "\uC790)\u201D";
    const text2 = value.replace(/[\s\u0000-\u001f\u007f]+/g, " ");
    return "\u201C" + (text2.length > 60 ? text2.slice(0, 59) + "\u2026" : text2) + "\u201D";
  }
  if (Array.isArray(value)) return "\uBC30\uC5F4 (" + value.length + "\uAC1C)";
  if (typeof value === "object") return "\uAC1D\uCCB4";
  if (typeof value === "function") return "\uD568\uC218";
  return String(value);
}
var list = (value) => Array.isArray(value) ? value : [];
var skillInfo = (card, id5) => {
  const passive = list(card?.passives).find((skill) => skill?.id === id5);
  if (passive) return { skill: passive, kind: "\uD328\uC2DC\uBE0C \uC2A4\uD0AC" };
  const active = list(card?.actives).find((skill) => skill?.id === id5);
  return { skill: active, kind: active ? "\uC561\uD2F0\uBE0C \uC2A4\uD0AC" : "\uC2A4\uD0AC" };
};
var skillLabel = (card, id5) => {
  const { skill, kind } = skillInfo(card, id5);
  return kind + (typeof skill?.name === "string" && skill.name.trim() ? " " + valueLabel(skill.name) : " ID " + valueLabel(id5));
};
function cardProblemLabel(card, element, skillId) {
  if (!card && !element && skillId === void 0) return "";
  const back = !card || !card.kind && !card.id && card.name === void 0;
  const owner = back ? "\uACF5\uD1B5 \uB4B7\uBA74" : typeof card.name === "string" && card.name.trim() ? "\uCE74\uB4DC " + valueLabel(card.name) : "\uCE74\uB4DC ID " + valueLabel(card.id);
  let part = "";
  if (skillId !== void 0) part = skillLabel(card, skillId) + " \uC774\uB984";
  else if (element) {
    const field = element.binding?.field;
    const fields = { name: "\uCE74\uB4DC \uC774\uB984", hp: "HP", art: "\uCE74\uB4DC \uADF8\uB9BC", "item.effect": "\uC544\uC774\uD15C \uD6A8\uACFC", "item.keywords": "\uC544\uC774\uD15C \uD0A4\uC6CC\uB4DC" };
    if (Object.hasOwn(fields, field)) part = fields[field];
    else if (typeof field === "string" && field.startsWith("skill.")) {
      const suffix = { "skill.name": "\uC774\uB984", "skill.effect": "\uD6A8\uACFC", "skill.dice": "\uC8FC\uC0AC\uC704", "skill.keywords": "\uD0A4\uC6CC\uB4DC" }[field] || "\uC5F0\uACB0 \uC694\uC18C";
      part = skillLabel(card, element.binding?.skillId) + " " + suffix;
    } else if (element.type === "text" && typeof element.content === "string" && element.content.trim()) part = "\uD14D\uC2A4\uD2B8 " + valueLabel(element.content);
    else {
      const kind = { text: "\uD14D\uC2A4\uD2B8", image: "\uADF8\uB9BC", rect: "\uC0AC\uAC01\uD615", attribute: "\uC18D\uC131", rank: "\uB4F1\uAE09", dice: "\uC8FC\uC0AC\uC704", keywords: "\uD0A4\uC6CC\uB4DC", effect: "\uC774\uD399\uD2B8" }[element.type] || "\uC694\uC18C";
      const images = list(card?.elements).filter((item) => item?.type === "image");
      const imageIndex = element.type === "image" ? images.findIndex((item) => item === element || element.id !== void 0 && item?.id === element.id) : -1;
      part = kind + (imageIndex >= 0 ? " " + (imageIndex + 1) + "\uBC88" : "") + (element.id !== void 0 ? " (ID " + valueLabel(element.id) + ")" : "");
    }
  }
  return owner + (part ? " \xB7 " + part : "");
}

// src/model/text-ranges.js
var segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
function textBoundaries(text2) {
  return [.../* @__PURE__ */ new Set([0, ...[...segmenter.segment(text2)].map((s) => s.index), text2.length])];
}

// src/model/skill-references.js
var id = (value) => typeof value === "string" && value.length > 0 && value.length < 200 && !["__proto__", "constructor", "prototype"].includes(value);
var object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var boundary = (text2, at) => !(at > 0 && at < text2.length && /[\uD800-\uDBFF]/.test(text2[at - 1]) && /[\uDC00-\uDFFF]/.test(text2[at]));
function validateSkillReferences(skill, extra = {}) {
  if (skill.skillReferences === void 0) return [];
  const context = "\uC2A4\uD0AC " + (typeof skill.name === "string" ? valueLabel(skill.name) : "\uC774\uB984 \uC5C6\uC74C") + " (ID " + valueLabel(skill.id) + ")";
  const idRule2 = "ID\uB294 1~199\uC790\uC758 \uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD558\uBA70 \uC608\uC57D ID __proto__, constructor, prototype\uC740 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4";
  const bad = (field, value, rule, index, ref) => [{ code: "skill-reference-range", message: context + (index === void 0 ? "" : " \xB7 \uCC38\uC870 " + (index + 1) + "\uBC88 (ID " + valueLabel(ref?.id) + ")") + ": " + field + " \uAC12 " + valueLabel(value) + ". " + rule + ".", ...extra }];
  if (!Array.isArray(skill.skillReferences)) return bad("\uC2A4\uD0AC \uCC38\uC870 \uBAA9\uB85D", skill.skillReferences, "\uCC38\uC870 \uAC1D\uCCB4\uC758 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
  if (typeof skill.effect !== "string") return bad("\uC2A4\uD0AC \uD6A8\uACFC", skill.effect, "\uCC38\uC870 \uC704\uCE58\uB97C \uACC4\uC0B0\uD560 \uC218 \uC788\uB294 \uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
  const ids = /* @__PURE__ */ new Set();
  let end = 0;
  for (const [index, ref] of skill.skillReferences.entries()) {
    const fail = (field, value, rule) => bad(field, value, rule, index, ref);
    if (!object(ref)) return fail("\uCC38\uC870 \uC815\uBCF4", ref, "\uCC38\uC870 ID, \uB300\uC0C1 \uC2A4\uD0AC ID, \uC2DC\uC791\xB7\uB05D \uC704\uCE58\uAC00 \uC788\uB294 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    if (!id(ref.id)) return fail("\uCC38\uC870 ID", ref.id, idRule2);
    if (ids.has(ref.id)) return fail("\uCC38\uC870 ID", ref.id, "\uC774\uC804 \uCC38\uC870 " + (skill.skillReferences.findIndex((previous) => previous?.id === ref.id) + 1) + "\uBC88\uACFC \uC911\uBCF5\uB41C ID\uC785\uB2C8\uB2E4. \uCC38\uC870\uB9C8\uB2E4 \uC11C\uB85C \uB2E4\uB978 ID\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4");
    if (!id(ref.skillId)) return fail("\uB300\uC0C1 \uC2A4\uD0AC ID", ref.skillId, idRule2);
    if (!Number.isInteger(ref.start)) return fail("\uC2DC\uC791 \uC704\uCE58", ref.start, "0 \uC774\uC0C1\uC758 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    if (!Number.isInteger(ref.end)) return fail("\uB05D \uC704\uCE58", ref.end, "\uC2DC\uC791 \uC704\uCE58\uBCF4\uB2E4 \uD070 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    if (ref.start < 0) return fail("\uC2DC\uC791 \uC704\uCE58", ref.start, "0 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
    if (ref.start < end) return fail("\uC2DC\uC791 \uC704\uCE58", ref.start, "\uC774\uC804 \uCC38\uC870 " + index + "\uBC88\uC758 \uB05D \uC704\uCE58 " + valueLabel(end) + " \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4. \uCC38\uC870\uB294 \uC704\uCE58 \uC21C\uC11C\uB300\uB85C \uBC30\uCE58\uD558\uACE0 \uC11C\uB85C \uACB9\uCE58\uBA74 \uC548 \uB429\uB2C8\uB2E4");
    if (ref.end <= ref.start) return fail("\uB05D \uC704\uCE58", ref.end, "\uC2DC\uC791 \uC704\uCE58 " + valueLabel(ref.start) + "\uBCF4\uB2E4 \uCEE4\uC57C \uD569\uB2C8\uB2E4");
    if (ref.end > skill.effect.length) return fail("\uB05D \uC704\uCE58", ref.end, "\uD6A8\uACFC \uD14D\uC2A4\uD2B8 \uAE38\uC774 " + skill.effect.length + " (UTF-16) \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    if (!boundary(skill.effect, ref.start)) return fail("\uC2DC\uC791 \uC704\uCE58", ref.start, "\uBB38\uC790 \uC0AC\uC774\uC758 \uACBD\uACC4\uC5EC\uC57C \uD569\uB2C8\uB2E4. \uD604\uC7AC \uC704\uCE58\uB294 \uC774\uBAA8\uC9C0 \uB4F1 UTF-16 \uBB38\uC790 \uC911\uAC04\uC785\uB2C8\uB2E4");
    if (!boundary(skill.effect, ref.end)) return fail("\uB05D \uC704\uCE58", ref.end, "\uBB38\uC790 \uC0AC\uC774\uC758 \uACBD\uACC4\uC5EC\uC57C \uD569\uB2C8\uB2E4. \uD604\uC7AC \uC704\uCE58\uB294 \uC774\uBAA8\uC9C0 \uB4F1 UTF-16 \uBB38\uC790 \uC911\uAC04\uC785\uB2C8\uB2E4");
    ids.add(ref.id);
    end = ref.end;
  }
  return [];
}

// src/model/blend-modes.js
var DEFAULT_BLEND_MODE = "source-over";
var BLEND_MODES = [
  ["source-over", "\uC77C\uBC18"],
  ["multiply", "\uACF1\uD558\uAE30"],
  ["screen", "\uC2A4\uD06C\uB9B0"],
  ["overlay", "\uC624\uBC84\uB808\uC774"],
  ["darken", "\uC5B4\uB461\uAC8C"],
  ["lighten", "\uBC1D\uAC8C"],
  ["color-dodge", "\uC0C9\uC0C1 \uB2F7\uC9C0"],
  ["color-burn", "\uC0C9\uC0C1 \uBC88"],
  ["hard-light", "\uD558\uB4DC \uB77C\uC774\uD2B8"],
  ["soft-light", "\uC18C\uD504\uD2B8 \uB77C\uC774\uD2B8"],
  ["difference", "\uCC28\uC774"],
  ["exclusion", "\uC81C\uC678"],
  ["hue", "\uC0C9\uC870"],
  ["saturation", "\uCC44\uB3C4"],
  ["color", "\uC0C9\uC0C1"],
  ["luminosity", "\uAD11\uB3C4"],
  ["lighter", "\uB354\uD558\uAE30"],
  ["source-in", "\uD604\uC7AC \uB808\uC774\uC5B4 \xB7 \uC544\uB798\uC640 \uACB9\uCE5C \uBD80\uBD84"],
  ["source-out", "\uD604\uC7AC \uB808\uC774\uC5B4 \xB7 \uC544\uB798\uC640 \uC548 \uACB9\uCE5C \uBD80\uBD84"],
  ["source-atop", "\uD604\uC7AC \uB808\uC774\uC5B4 \xB7 \uC544\uB798 \uD22C\uBA85\uB3C4 \uC720\uC9C0"],
  ["destination-over", "\uC544\uB798 \uADF8\uB9BC\uC744 \uC55E\uC5D0"],
  ["destination-in", "\uC544\uB798 \uADF8\uB9BC \xB7 \uD604\uC7AC\uC640 \uACB9\uCE5C \uBD80\uBD84"],
  ["destination-out", "\uC544\uB798 \uADF8\uB9BC \xB7 \uD604\uC7AC\uB85C \uC9C0\uC6B0\uAE30"],
  ["destination-atop", "\uC544\uB798 \uADF8\uB9BC \xB7 \uD604\uC7AC \uD22C\uBA85\uB3C4 \uC720\uC9C0"],
  ["copy", "\uD604\uC7AC \uB808\uC774\uC5B4\uB9CC"],
  ["xor", "\uACB9\uCE5C \uBD80\uBD84 \uC81C\uC678"]
];
var supported = new Set(BLEND_MODES.map(([mode]) => mode));
var isBlendMode = (value) => supported.has(value);

// src/model/sprite-controls.js
var numeric = (label, value, min, max, step = 0.05, unit = "") => ({ type: "number", label, value, min, max, step, unit, optional: true });
var choice = (label, value, options) => ({ type: "select", label, value, options, optional: true });
var grouped = (group, field) => ({ ...field, group });
var crop = (label) => ({ ...numeric(label, 0, 0, 0.95, 0.01, "%"), displayScale: 100, group: "\uC774\uBBF8\uC9C0 \uC790\uB974\uAE30" });
var SPRITE_CONTROL_FIELDS = {
  renderMode: choice("\uBC30\uCE58 \uBC29\uC2DD", "particles", [["particles", "\uC5EC\uB7EC \uC785\uC790\uB85C \uB0A0\uB9AC\uAE30"], ["single", "\uD55C \uC7A5 \uACE0\uC815 \uC7A5\uC2DD"]]),
  cropLeft: crop("\uC67C\uCABD \uC790\uB974\uAE30"),
  cropRight: crop("\uC624\uB978\uCABD \uC790\uB974\uAE30"),
  cropTop: crop("\uC704\uCABD \uC790\uB974\uAE30"),
  cropBottom: crop("\uC544\uB798\uCABD \uC790\uB974\uAE30"),
  scaleX: numeric("\uAC00\uB85C \uB298\uB9AC\uAE30", 1, 0.05, 8, 0.05, "\uBC30"),
  scaleY: numeric("\uC138\uB85C \uB298\uB9AC\uAE30", 1, 0.05, 8, 0.05, "\uBC30"),
  mirror: choice("\uB4A4\uC9D1\uAE30", "none", [["none", "\uC548 \uB4A4\uC9D1\uAE30"], ["x", "\uC88C\uC6B0"], ["y", "\uC0C1\uD558"], ["both", "\uC88C\uC6B0 + \uC0C1\uD558"]]),
  anchorX: { ...numeric("\uAC00\uB85C \uD68C\uC804\uCD95", 0.5, 0, 1, 0.05, "%"), displayScale: 100 },
  anchorY: { ...numeric("\uC138\uB85C \uD68C\uC804\uCD95", 0.5, 0, 1, 0.05, "%"), displayScale: 100 },
  sheetColumns: numeric("\uC2DC\uD2B8 \uAC00\uB85C \uCE78", 1, 1, 16, 1),
  sheetRows: numeric("\uC2DC\uD2B8 \uC138\uB85C \uCE78", 1, 1, 16, 1),
  frameMode: choice("\uD504\uB808\uC784 \uC7AC\uC0DD", "fixed", [["fixed", "\uC120\uD0DD\uD55C \uD55C \uCEF7"], ["random", "\uC18C\uD658\uB9C8\uB2E4 \uB79C\uB364 \uD55C \uCEF7"], ["life", "\uC218\uBA85\uC5D0 \uB9DE\uCDB0 \uD55C \uBC88"], ["loop", "\uACC4\uC18D \uBC18\uBCF5"], ["pingpong", "\uC55E\uB4A4\uB85C \uBC18\uBCF5"], ["randomLoop", "\uB79C\uB364 \uCEF7 \uACC4\uC18D \uC7AC\uC0DD"]]),
  frameStart: numeric("\uC2DC\uC791 \uD504\uB808\uC784", 0, 0, 255, 1, "0\uBD80\uD130"),
  frameCount: numeric("\uC0AC\uC6A9\uD560 \uD504\uB808\uC784 \uC218", 0, 0, 256, 1, "0 = \uB0A8\uC740 \uC804\uCCB4"),
  frameRate: numeric("\uD504\uB808\uC784 \uC18D\uB3C4", 12, 0, 60, 1, "\uCEF7/\uCD08")
};
for (const key of ["scaleX", "scaleY", "mirror", "anchorX", "anchorY"]) SPRITE_CONTROL_FIELDS[key] = grouped("\uD06C\uAE30\xB7\uD68C\uC804 \uC911\uC2EC", SPRITE_CONTROL_FIELDS[key]);
for (const key of ["sheetColumns", "sheetRows", "frameMode", "frameStart", "frameCount", "frameRate"]) SPRITE_CONTROL_FIELDS[key] = grouped("\uC5EC\uB7EC \uCEF7 \uC7AC\uC0DD", SPRITE_CONTROL_FIELDS[key]);
function validateSpriteControls(params = {}) {
  const problems2 = [], value = (key) => params[key] ?? SPRITE_CONTROL_FIELDS[key].value;
  for (const [axis, first, last] of [["\uAC00\uB85C", "cropLeft", "cropRight"], ["\uC138\uB85C", "cropTop", "cropBottom"]]) {
    const a = value(first), b = value(last);
    if (Number.isFinite(a) && Number.isFinite(b) && a + b >= 1) problems2.push(axis + " \uC790\uB974\uAE30 \uD569 " + Number(((a + b) * 100).toPrecision(12)) + "% (" + SPRITE_CONTROL_FIELDS[first].label + " " + Number((a * 100).toPrecision(12)) + "% + " + SPRITE_CONTROL_FIELDS[last].label + " " + Number((b * 100).toPrecision(12)) + "%)\uB294 \uC774\uBBF8\uC9C0\uB97C \uBAA8\uB450 \uC9C0\uC6C1\uB2C8\uB2E4. \uB450 \uAC12\uC758 \uD569\uC744 100%\uBCF4\uB2E4 \uC791\uAC8C \uB0AE\uCD94\uC138\uC694.");
  }
  const columns = value("sheetColumns"), rows = value("sheetRows"), start = value("frameStart"), count2 = value("frameCount");
  if ([columns, rows].every((v) => Number.isInteger(v) && v >= 1 && v <= 16)) {
    const total = columns * rows;
    if (Number.isInteger(start) && start >= 0) {
      if (start >= total) problems2.push("\uC2DC\uC791 \uD504\uB808\uC784 " + start + "\uC740 \uC804\uCCB4 " + total + "\uCEF7\uC744 \uBC97\uC5B4\uB0A9\uB2C8\uB2E4. 0~" + (total - 1) + " \uC911 \uD558\uB098\uB85C \uB0AE\uCD94\uAC70\uB098 \uC2DC\uD2B8 \uCE78 \uC218\uB97C \uB298\uB9AC\uC138\uC694.");
      else if (Number.isInteger(count2) && count2 > total - start) problems2.push("\uC0AC\uC6A9\uD560 \uD504\uB808\uC784 \uC218 " + count2 + "\uC740 \uC2DC\uC791 \uD504\uB808\uC784 " + start + "\uBD80\uD130 \uB0A8\uC740 " + (total - start) + "\uCEF7\uC744 \uB118\uC2B5\uB2C8\uB2E4. " + (total - start) + " \uC774\uD558\uB85C \uC904\uC774\uAC70\uB098 0\uC73C\uB85C \uBC14\uAFB8\uC138\uC694.");
    }
  }
  return problems2;
}

// src/model/particle-motion.js
var PARTICLE_PATHS = [["natural", "\uAE30\uC874 \uC6C0\uC9C1\uC784"], ["straight", "\uC9C1\uC120"], ["fan", "\uBD80\uCC44\uAF34 \uD37C\uC9D0"], ["spiral", "\uBC14\uAE65\uC73C\uB85C \uB098\uC120"], ["vortex", "\uC548\uCABD\uC73C\uB85C \uC18C\uC6A9\uB3CC\uC774"], ["wave", "\uBB3C\uACB0 \uD754\uB4E4\uB9BC"], ["orbit", "\uC6D0 \uADA4\uB3C4"]];
var number = (label, value, min, max, step) => ({ type: "number", label, value, min, max, step, optional: true, group: "\uC774\uB3D9 \uD328\uD134" });
var PARTICLE_MOTION_FIELDS = {
  motionPattern: { type: "select", label: "\uCD94\uAC00 \uC774\uB3D9 \uD328\uD134", value: "natural", options: PARTICLE_PATHS, optional: true, group: "\uC774\uB3D9 \uD328\uD134" },
  pathDistance: number("\uD328\uD134 \uC774\uB3D9 \uAC70\uB9AC", 0.5, 0, 3, 0.05),
  pathTurns: number("\uD328\uD134 \uD68C\uC804 \uC218", 1, -8, 8, 0.1),
  pathAmplitude: number("\uBB3C\uACB0 \uC9C4\uD3ED", 0.15, 0, 2, 0.05)
};

// src/model/visual-effects.js
var numeric2 = (label, value, min, max, step = 0.05, unit = "") => ({ type: "number", label, value, min, max, step, unit });
var color = (label, value) => ({ type: "color", label, value });
var choice2 = (label, value, options) => ({ type: "select", label, value, options });
var count = numeric2("\uAC1C\uC218", 24, 1, 80, 1);
var life = numeric2("\uC218\uBA85", 2, 0.2, 6, 0.1, "\uCD08");
var direction = numeric2("\uC9C4\uD589 \uBC29\uD5A5", -90, -180, 180, 5, "\xB0");
var colorField = color("\uC0C9", "#ffb24b");
function particleFields({ color: primary, color2: secondary, count: amount, size, travel, spread, life: duration, direction: heading, fade, spin }) {
  const fields = { color: color("\uAE30\uBCF8 \uC0C9", primary), color2: color("\uBCF4\uC870 \uC0C9", secondary), count: { ...count, value: amount }, size: numeric2("\uD06C\uAE30", size, 5e-3, 0.3, 5e-3), travel: numeric2("\uC774\uB3D9 \uAC70\uB9AC", travel, 0, 2, 0.05), spread: numeric2("\uD769\uC5B4\uC9D0", spread, 0, 2, 0.05), life: { ...life, value: duration }, direction: { ...direction, value: heading }, fade: numeric2("\uB05D \uC0AC\uB77C\uC9D0", fade, 0.2, 4, 0.1) };
  if (spin !== void 0) fields.spin = numeric2("\uD68C\uC804 \uC18D\uB3C4", spin, -3, 3, 0.05, "\uD68C\uC804/\uCD08");
  return fields;
}
function particleCombination(name, layers) {
  return { name, category: "\uD769\uB0A0\uB9BC\xB7\uC785\uC790", layers: [{ kind: "outline", scope: "outside", params: { color: "#334a50", width: 0.12 } }, ...layers] };
}
var VISUAL_EFFECT_CATALOG = {
  bloom: { name: "Bloom \xB7 \uBC1D\uC740 \uBE5B \uBC88\uC9D0", hint: "\uBC1D\uAE30 \uAE30\uC900\uC744 \uB118\uB294 \uBD80\uBD84\uB9CC \uACE8\uB77C \uBE5B\uC744 \uD37C\uB728\uB824\uC694. \uBC1D\uC740 \uAE00\uC790\xB7\uADF8\uB9BC \uB610\uB294 \uBD88\uAF43 \uB4A4\uC5D0 \uACB9\uCCD0\uBCF4\uC138\uC694.", animated: false, filter: true, fields: { threshold: numeric2("\uBC1D\uAE30 \uAE30\uC900", 0.55, 0, 1, 0.05), knee: numeric2("\uAE30\uC900 \uACBD\uACC4 \uBD80\uB4DC\uB7EC\uC6C0", 0.35, 0, 1, 0.05), radius: numeric2("\uBC88\uC9D0 \uBC18\uACBD", 2, 0, 12, 0.1, "mm"), strength: numeric2("\uBE5B \uAC15\uB3C4", 1.1, 0, 3, 0.1), color: color("\uBE5B \uC0C9", "#ffffff") } },
  directionalBlur: { name: "\uBC29\uD5A5 \uD750\uB9BC", hint: "\uC815\uD55C \uBC29\uD5A5\uC73C\uB85C \uC794\uC0C1\uC744 \uD3B4\uC694. \uC0D8\uD50C \uC218\uB97C \uB192\uC774\uBA74 \uBD80\uB4DC\uB7EC\uC6CC\uC9C0\uACE0 \uACC4\uC0B0 \uC2DC\uAC04\uC774 \uB298\uC5B4\uB098\uC694.", animated: false, filter: true, fields: { distance: numeric2("\uC794\uC0C1 \uAE38\uC774", 1, 0, 8, 0.1, "mm"), angle: numeric2("\uC794\uC0C1 \uBC29\uD5A5", 0, -180, 180, 5, "\xB0"), samples: numeric2("\uC0D8\uD50C \uC218", 9, 3, 25, 1), strength: numeric2("\uAC15\uB3C4", 1, 0, 1, 0.05) } },
  displacement: { name: "\uAD50\uCC28 \uC77C\uB801\uC784", hint: "\uAC00\uB85C\xB7\uC138\uB85C \uC6C0\uC9C1\uC784\uC744 \uACB9\uCCD0 \uC5F4\uAE30\uB098 \uBB3C\uC18D\uCC98\uB7FC \uC77C\uB801\uC5EC\uC694. \uC6C0\uC9C1\uC784\uC744 \uB044\uBA74 \uAC19\uC740 \uBAA8\uC591\uC73C\uB85C \uACE0\uC815\uB3FC\uC694.", animated: true, filter: true, fields: { amount: numeric2("\uD754\uB4E4\uB9BC \uAC70\uB9AC", 0.45, 0, 3, 0.05, "mm"), wavelength: numeric2("\uBB34\uB2AC \uAC04\uACA9", 4, 0.5, 20, 0.5, "mm"), axis: choice2("\uBCC0\uD615 \uCD95", "both", [["both", "\uAC00\uB85C + \uC138\uB85C"], ["x", "\uAC00\uB85C"], ["y", "\uC138\uB85C"]]) } },
  heatHaze: { name: "\uC774\uAE00\uAC70\uB9BC \xB7 \uC5F4\uAE30 \uC65C\uACE1", hint: "\uBD88\uADDC\uCE59\uD55C \uC5F4\uAE30\uAC00 \uD750\uB974\uBA70 \uAE00\uC790\uB098 \uADF8\uB9BC\uC774 \uC544\uB978\uAC70\uB824\uC694. \uBD88\uAF43\xB7\uBC1C\uAD11 \uB4A4\uC5D0 \uACB9\uCCD0\uBCF4\uC138\uC694. \uC6C0\uC9C1\uC784\uC744 \uB044\uBA74 \uAC19\uC740 \uC7A5\uBA74\uC73C\uB85C \uACE0\uC815\uB3FC\uC694.", animated: true, filter: true, fields: { amount: numeric2("\uC774\uAE00\uAC70\uB9BC \uC138\uAE30", 0.22, 0, 3, 0.02, "mm"), wavelength: numeric2("\uC5F4\uAE30 \uBB34\uB2AC \uD06C\uAE30", 2.4, 0.5, 20, 0.1, "mm"), detail: numeric2("\uC794\uBB3C\uACB0", 0.65, 0, 1, 0.05), direction: numeric2("\uC5F4\uAE30 \uC774\uB3D9 \uBC29\uD5A5", -90, -180, 180, 5, "\xB0") } },
  sprite: { name: "\uC774\uBBF8\uC9C0\xB7\uB3C4\uD615 \uC785\uC790", hint: "\uB8EC\xB7\uBCC4\xB7\uAF43\uC78E \uB610\uB294 \uC9C1\uC811 \uAC00\uC838\uC628 \uADF8\uB9BC\uC744 \uB0A0\uB824\uC694. \uD06C\uAE30\xB7\uC774\uB3D9 \uAC70\uB9AC\uB294 \uB300\uC0C1 \uB192\uC774 \uAE30\uC900\uC774\uBA70, \uB05D \uD06C\uAE30\uB97C \uC904\uC774\uBA74 \uC791\uC544\uC838\uC694. \uBC30\uCE58 \uBCC0\uD654 0\uC740 \uAC19\uC740 \uACBD\uB85C\uB97C \uBC18\uBCF5\uD574\uC694.", animated: true, generative: true, fields: {
    shape: choice2("\uC785\uC790 \uBAA8\uC591", "star", [["image", "\uB0B4 \uC774\uBBF8\uC9C0"], ["star", "\uBCC4"], ["circle", "\uC6D0"], ["rune", "\uB8EC"], ["diamond", "\uC218\uC815"], ["petal", "\uAF43\uC78E"], ["snowflake", "\uB208 \uACB0\uC815"]]),
    assetId: { type: "asset", label: "\uC785\uC790 \uC774\uBBF8\uC9C0", value: null },
    tint: choice2("\uC774\uBBF8\uC9C0 \uC0C9 \uCC98\uB9AC", "original", [["original", "\uC6D0\uBCF8 \uC0C9 \uC720\uC9C0"], ["tint", "\uAE30\uBCF8 \uC0C9\uC73C\uB85C \uCE60\uD558\uAE30"], ["lifetime", "\uC218\uBA85\uC5D0 \uB530\uB77C \uB450 \uC0C9 \uC804\uD658"]]),
    color: color("\uC2DC\uC791 \uC0C9", "#d6edff"),
    color2: color("\uB05D \uC0C9", "#9c75ff"),
    count: numeric2("\uC785\uC790 \uC218", 24, 1, 120, 1),
    sizeStart: numeric2("\uC2DC\uC791 \uD06C\uAE30", 0.025, 0, 8, 5e-3, "\uB300\uC0C1 \uB192\uC774 \uBE44\uC728"),
    sizeEnd: numeric2("\uB05D \uD06C\uAE30", 0.06, 0, 8, 5e-3, "\uB300\uC0C1 \uB192\uC774 \uBE44\uC728"),
    alphaStart: numeric2("\uC2DC\uC791 \uD22C\uBA85\uB3C4", 1, 0, 1, 0.05),
    alphaEnd: numeric2("\uB05D \uD22C\uBA85\uB3C4", 0, 0, 1, 0.05),
    fadeIn: numeric2("\uC0DD\uC131 \uBD80\uB4DC\uB7EC\uC6C0", 0.1, 0, 0.5, 0.05, "\uC218\uBA85 \uBE44\uC728"),
    fadeOut: numeric2("\uC18C\uBA78 \uBD80\uB4DC\uB7EC\uC6C0", 0.35, 0, 1, 0.05, "\uC218\uBA85 \uBE44\uC728"),
    life: numeric2("\uC218\uBA85", 2, 0.2, 12, 0.1, "\uCD08"),
    direction,
    travel: numeric2("\uC774\uB3D9 \uAC70\uB9AC", 0.5, 0, 3, 0.05, "\uB300\uC0C1 \uB192\uC774 \uBE44\uC728"),
    spread: numeric2("\uD37C\uC9D0", 0.5, 0, 2, 0.05),
    drift: numeric2("\uC88C\uC6B0 \uD754\uB4E4\uB9BC", 0.15, 0, 1, 0.05),
    gravity: numeric2("\uC911\uB825", 0, -2, 2, 0.05, "\uB300\uC0C1 \uB192\uC774/\uCD08\xB2"),
    rotation: numeric2("\uC2DC\uC791 \uD68C\uC804", 0, -180, 180, 5, "\xB0"),
    spin: numeric2("\uD68C\uC804 \uC18D\uB3C4", 0.1, -3, 3, 0.05, "\uD68C\uC804/\uCD08"),
    randomness: numeric2("\uBC30\uCE58 \uBCC0\uD654", 1, 0, 1, 0.05),
    ...SPRITE_CONTROL_FIELDS
  } },
  outline: { name: "\uC678\uACFD\uC120", hint: "\uC6D0\uBCF8\uACFC \uC785\uC790\uC758 \uD22C\uBA85\uB3C4\uB97C \uB530\uB77C \uD14C\uB450\uB9AC\uB3C4 \uD568\uAED8 \uC605\uC5B4\uC838\uC694.", placement: "behind", animated: false, filter: true, fields: { color: colorField, width: numeric2("\uB450\uAED8", 0.5, 0.05, 5, 0.05, "mm") } },
  glow: { name: "\uBC1C\uAD11", placement: "behind", animated: true, filter: true, fields: { color: colorField, radius: numeric2("\uBC88\uC9D0", 2, 0, 12, 0.1, "mm"), strength: numeric2("\uAC15\uB3C4", 1, 0, 3, 0.1) } },
  shadow: { name: "\uADF8\uB9BC\uC790", placement: "behind", animated: false, filter: true, fields: { color: color("\uC0C9", "#152032"), offsetX: numeric2("\uAC00\uB85C \uAC70\uB9AC", 1, -12, 12, 0.1, "mm"), offsetY: numeric2("\uC138\uB85C \uAC70\uB9AC", 1, -12, 12, 0.1, "mm"), blur: numeric2("\uBC88\uC9D0", 1.5, 0, 12, 0.1, "mm") } },
  gradient: { name: "\uADF8\uB77C\uB370\uC774\uC158", placement: "surface", animated: true, filter: true, fields: { color: color("\uC2DC\uC791 \uC0C9", "#fff1a8"), color2: color("\uB05D \uC0C9", "#ed6039"), angle: numeric2("\uAC01\uB3C4", 90, -180, 180, 5, "\xB0"), strength: numeric2("\uAC15\uB3C4", 1, 0, 1, 0.05) } },
  flame: { name: "\uBD88\uAF43", placement: "behind", animated: true, generative: true, fields: { color: color("\uBC14\uAE65 \uC0C9", "#e74917"), color2: color("\uC911\uAC04 \uC0C9", "#ff9e24"), color3: color("\uC548\uCABD \uC0C9", "#fff0a3"), height: numeric2("\uB192\uC774", 0.68, 0.05, 2, 0.05), size: numeric2("\uBD88\uB369\uC774 \uD06C\uAE30", 0.1, 0.02, 0.6, 0.01), width: numeric2("\uD3ED", 0.14, 0.02, 0.6, 0.01), count: { ...count, value: 110, max: 260 }, sway: numeric2("\uD754\uB4E4\uB9BC", 0.4, 0, 1), life: { ...life, value: 1.8 }, direction } },
  smoke: { name: "\uC5F0\uAE30", placement: "behind", animated: true, generative: true, fields: { color: color("\uC0C9", "#79818c"), density: numeric2("\uB18D\uB3C4", 0.6, 0.05, 1), size: numeric2("\uB369\uC5B4\uB9AC \uD06C\uAE30", 0.09, 0.02, 1), height: numeric2("\uB192\uC774", 0.95, 0.05, 2, 0.05), spread: numeric2("\uD37C\uC9D0", 0.5, 0, 2), life: { ...life, value: 3.5 }, count: { ...count, value: 70, max: 200 }, direction } },
  ember: { name: "\uBD88\uD2F0", placement: "behind", animated: true, generative: true, fields: { color: color("\uC0C9", "#ffbc61"), count: { ...count, value: 40 }, size: numeric2("\uD06C\uAE30", 0.025, 5e-3, 0.2, 5e-3), tail: numeric2("\uAF2C\uB9AC \uAE38\uC774", 0.1, 0, 0.6, 0.01), life, direction } },
  mist: { name: "\uC548\uAC1C", placement: "behind", animated: true, generative: true, fields: { color: color("\uC0C9", "#b7d3d8"), density: numeric2("\uBC00\uB3C4", 0.35, 0.05, 1), spread: numeric2("\uD37C\uC9D0", 0.8, 0, 2), softness: numeric2("\uBD80\uB4DC\uB7EC\uC6C0", 0.8, 0, 1), size: numeric2("\uB369\uC5B4\uB9AC \uD06C\uAE30", 0.4, 0.05, 1), count: { ...count, value: 12 }, life: { ...life, value: 5 }, direction: { ...direction, value: -15 } } },
  lightning: { name: "\uBC88\uAC1C", placement: "behind", animated: true, generative: true, fields: { color: color("\uC0C9", "#b9e9ff"), width: numeric2("\uB450\uAED8", 0.3, 0.05, 3, 0.05, "mm"), branches: numeric2("\uAC08\uB77C\uC9D0", 3, 0, 8, 1), frequency: numeric2("\uBC1C\uC0DD \uBE48\uB3C4", 2, 0.2, 8, 0.1) } },
  ripple: { name: "\uD30C\uB3D9", hint: "\uB05D \uD06C\uAE30\uAC00 \uC2DC\uC791\uBCF4\uB2E4 \uC791\uC73C\uBA74 \uC548\uC73C\uB85C \uC904\uC5B4\uB4E4\uC5B4\uC694. 0\uC73C\uB85C \uB05D\uB0BC \uC218\uB3C4 \uC788\uC5B4\uC694.", placement: "behind", animated: true, generative: true, fields: { color: color("\uC0C9", "#79d9ff"), width: numeric2("\uB450\uAED8", 0.35, 0.05, 3, 0.05, "mm"), start: numeric2("\uC2DC\uC791 \uD06C\uAE30", 0.05, 0, 1), end: numeric2("\uB05D \uD06C\uAE30", 0.9, 0, 2), frequency: numeric2("\uBC1C\uC0DD \uBE48\uB3C4", 1, 0.2, 8, 0.1), count: { ...count, value: 3 }, life, fade: { ...numeric2("\uB05D \uC0AC\uB77C\uC9D0", 1, 0.2, 4, 0.1), optional: true } } },
  particle: { name: "\uBC18\uC9DD\uC774\uB294 \uC785\uC790", placement: "behind", animated: true, generative: true, fields: { shape: choice2("\uBAA8\uC591", "star", [["star", "\uBCC4"], ["snow", "\uB208"], ["dot", "\uC810"]]), color: color("\uC0C9", "#fff3b6"), count, size: numeric2("\uD06C\uAE30", 0.04, 5e-3, 0.3, 5e-3), spread: numeric2("\uD37C\uC9D0", 0.7, 0, 2), life: { ...life, value: 3.5 }, direction } },
  starlight: { name: "4\uAC01 \uBCC4\uBE5B", hint: "\uBC1D\uACE0 \uB465\uADFC \uC911\uC2EC\uC5D0\uC11C \uAC00\uB294 \uAD11\uC120\uC774 \uB124 \uBC29\uD5A5\uC73C\uB85C \uBED7\uACE0, \uB05D\uC73C\uB85C \uAC08\uC218\uB85D \uD22C\uBA85\uD574\uC838\uC694. \uBC18\uC9DD\uC784\uC744 0\uC73C\uB85C \uD558\uBA74 \uBC1D\uAE30\uB97C \uACE0\uC815\uD558\uACE0, \uD68C\uC804\uC740 \uB530\uB85C \uC870\uC808\uD574\uC694.", placement: "front", animated: true, generative: true, fields: {
    color: color("\uBE5B \uC0C9", "#b8dfff"),
    coreColor: color("\uC911\uC2EC \uC0C9", "#ffffff"),
    count: numeric2("\uAC1C\uC218", 12, 0, 160, 1),
    size: numeric2("\uBE5B \uD06C\uAE30", 0.12, 0, 2, 0.01, "\uB300\uC0C1 \uB192\uC774 \uBE44\uC728"),
    rays: numeric2("\uBCC4 \uC548\uCABD \uB450\uAED8", 0.22, 0.03, 0.65, 0.01),
    stretch: numeric2("\uC138\uB85C \uAE38\uC774", 1.45, 0.25, 4, 0.05, "\uBC30"),
    glow: numeric2("\uBE5B \uBC88\uC9D0", 0.65, 0, 2, 0.05),
    life: numeric2("\uBE5B \uC218\uBA85", 2.8, 0.1, 30, 0.1, "\uCD08"),
    twinkle: numeric2("\uBC18\uC9DD\uC784 \uC18D\uB3C4", 1, 0, 4, 0.05, "\uD68C/\uCD08"),
    rotation: numeric2("\uC2DC\uC791 \uD68C\uC804", 0, -180, 180, 5, "\xB0"),
    spin: numeric2("\uD68C\uC804 \uC18D\uB3C4", 0.1, -3, 3, 0.05, "\uD68C\uC804/\uCD08"),
    randomness: numeric2("\uBC30\uCE58 \uBCC0\uD654", 0, 0, 1, 0.05)
  } },
  aura: { name: "\uC624\uB77C\xB7\uAD11\uC120", placement: "behind", animated: true, generative: true, fields: { color: color("\uC0C9", "#b693ff"), length: numeric2("\uAD11\uC120 \uAE38\uC774", 0.5, 0.05, 2), count: { ...count, value: 20 } } },
  sweep: { name: "\uBE5B \uC2A4\uC715", placement: "surface", animated: true, filter: true, fields: { color: color("\uC0C9", "#ffffff"), width: numeric2("\uBE5B\uB760 \uD3ED", 0.3, 0.05, 1), angle: numeric2("\uAC01\uB3C4", -25, -80, 80, 5, "\xB0"), strength: numeric2("\uAC15\uB3C4", 0.8, 0, 1) } },
  pixelate: { name: "\uD53D\uC140\uD654", animated: false, filter: true, fields: { size: numeric2("\uCE78 \uD06C\uAE30", 0.6, 0.2, 3, 0.1, "mm") } },
  blur: { name: "\uD750\uB9BC", animated: false, filter: true, fields: { radius: numeric2("\uBC18\uACBD", 0.4, 0, 3, 0.1, "mm") } },
  colorAdjust: { name: "\uC0C9 \uC870\uC815", animated: false, filter: true, fields: { hue: numeric2("\uC0C9\uC870", 0, -180, 180, 1, "\xB0"), saturation: numeric2("\uCC44\uB3C4", 1, 0, 2), brightness: numeric2("\uBC1D\uAE30", 1, 0, 2) } },
  posterize: { name: "\uD3EC\uC2A4\uD130\uD654", animated: false, filter: true, fields: { levels: numeric2("\uB2E8\uACC4", 4, 2, 8, 1) } },
  halftone: { name: "\uD558\uD504\uD1A4 \uB9DD\uC810", animated: false, filter: true, fields: { size: numeric2("\uB9DD\uC810 \uD06C\uAE30", 0.6, 0.3, 2, 0.1, "mm"), angle: numeric2("\uAC01\uB3C4", 45, -90, 90, 1, "\xB0") } },
  chromatic: { name: "\uC0C9\uC218\uCC28", hint: "\uC790\uB3D9\uC740 \uC5B4\uB450\uC6B4 \uAE00\uC790\uC5D0 \uC0C9 \uD14C\uB450\uB9AC\uB97C, \uCEEC\uB7EC \uADF8\uB9BC\uC5D0 RGB \uCC44\uB110 \uBD84\uB9AC\uB97C \uC801\uC6A9\uD574\uC694.", animated: false, filter: true, fields: { distance: numeric2("\uBD84\uB9AC \uAC70\uB9AC", 0.3, 0, 1.5, 0.1, "mm"), angle: numeric2("\uBD84\uB9AC \uBC29\uD5A5", 0, -180, 180, 1, "\xB0"), mode: { ...choice2("\uBD84\uB9AC \uBC29\uC2DD", "auto", [["auto", "\uC790\uB3D9"], ["channels", "RGB \uCC44\uB110"], ["fringe", "\uC0C9 \uD14C\uB450\uB9AC"]]), optional: true }, color: { ...color("\uCCAB \uD14C\uB450\uB9AC \uC0C9", "#ec3868"), optional: true }, color2: { ...color("\uB458\uC9F8 \uD14C\uB450\uB9AC \uC0C9", "#168fba"), optional: true }, strength: { ...numeric2("\uAC15\uB3C4", 1, 0, 1, 0.05), optional: true } } },
  waveDistort: { name: "\uBB3C\uACB0 \uC65C\uACE1", animated: true, filter: true, fields: { amplitude: numeric2("\uC9C4\uD3ED", 0.6, 0, 3, 0.1, "mm"), wavelength: numeric2("\uD30C\uC7A5", 6, 1, 20, 0.5, "mm") } },
  erode: { name: "\uAC00\uC7A5\uC790\uB9AC \uCE68\uC2DD", animated: false, filter: true, fields: { depth: numeric2("\uAE4A\uC774", 0.3, 0, 2, 0.1, "mm"), roughness: numeric2("\uAC70\uCE60\uAE30", 0.6, 0, 1) } },
  innerGlow: { name: "\uC548\uCABD \uBC1C\uAD11", hint: "\uC6D0\uBCF8 \uC548\uCABD \uAC00\uC7A5\uC790\uB9AC\uC5D0 \uBE5B\uC744 \uB354\uD574\uC694.", animated: false, filter: true, fields: { color: color("\uBE5B \uC0C9", "#68bcdb"), width: numeric2("\uBE5B \uB450\uAED8", 0.6, 0.02, 12, 0.02, "mm"), strength: numeric2("\uAC15\uB3C4", 0.8, 0, 1, 0.05) } },
  innerShadow: { name: "\uC548\uCABD \uADF8\uB9BC\uC790", hint: "\uC548\uCABD \uAC00\uC7A5\uC790\uB9AC\uB97C \uC5B4\uB461\uAC8C \uB20C\uB7EC \uAE4A\uC774\uB97C \uB9CC\uB4E4\uC5B4\uC694.", animated: false, filter: true, fields: { color: color("\uADF8\uB9BC\uC790 \uC0C9", "#182936"), offsetX: numeric2("\uAC00\uB85C \uAC70\uB9AC", 0.4, -12, 12, 0.05, "mm"), offsetY: numeric2("\uC138\uB85C \uAC70\uB9AC", 0.6, -12, 12, 0.05, "mm"), blur: numeric2("\uBC88\uC9D0", 0.4, 0, 12, 0.05, "mm"), strength: numeric2("\uAC15\uB3C4", 0.7, 0, 1, 0.05) } },
  bevel: { name: "\uC591\uAC01\xB7\uC74C\uAC01", hint: "\uBE5B \uBC29\uD5A5\uACFC \uBC1D\uACE0 \uC5B4\uB450\uC6B4 \uAC00\uC7A5\uC790\uB9AC\uB85C \uD45C\uBA74\uC758 \uB192\uB0AE\uC774\uB97C \uD45C\uD604\uD574\uC694.", animated: false, filter: true, fields: { highlight: color("\uBC1D\uC740 \uBA74", "#fff3cf"), shadow: color("\uC5B4\uB450\uC6B4 \uBA74", "#6b4050"), size: numeric2("\uAE4E\uC778 \uBA74 \uB450\uAED8", 0.5, 0.02, 12, 0.02, "mm"), angle: numeric2("\uBE5B \uBC29\uD5A5", -55, -180, 180, 5, "\xB0"), strength: numeric2("\uAC15\uB3C4", 0.8, 0, 1, 0.05) } },
  extrude: { name: "\uB450\uAED8\xB7\uC785\uCCB4", hint: "\uC6D0\uBCF8 \uB4A4\uC5D0 \uB450\uAED8\uB97C \uB354\uD574 \uC785\uCCB4\uC801\uC778 \uBAA8\uC11C\uB9AC\uB97C \uB9CC\uB4E4\uC5B4\uC694.", animated: false, filter: true, fields: { color: color("\uC606\uBA74 \uC0C9", "#463655"), depth: numeric2("\uB450\uAED8", 1.2, 0, 4, 0.05, "mm"), angle: numeric2("\uC313\uB294 \uBC29\uD5A5", 45, -180, 180, 5, "\xB0") } },
  foil: { name: "\uAE08\uC18D \uBC18\uC0AC \uBB34\uB2AC", hint: "\uBC1D\uACE0 \uC5B4\uB450\uC6B4 \uBC18\uC0AC \uB760\uB97C \uC0C9\uC73C\uB85C \uD45C\uD604\uD574\uC694.", animated: true, filter: true, fields: { color: color("\uAE08\uC18D \uC0C9", "#d49b39"), color2: color("\uBC18\uC0AC \uC0C9", "#fff1b3"), size: numeric2("\uBC18\uC0AC \uB760 \uAC04\uACA9", 3, 0.02, 12, 0.1, "mm"), angle: numeric2("\uBC18\uC0AC \uBC29\uD5A5", -35, -180, 180, 5, "\xB0"), strength: numeric2("\uAC15\uB3C4", 1, 0, 1, 0.05) } },
  holographic: { name: "\uBB34\uC9C0\uAC1C \uBD84\uAD11 \uBB34\uB2AC", hint: "\uC6D0\uBCF8 \uC548\uC5D0 \uC5EC\uB7EC \uC0C9\uC758 \uBD84\uAD11 \uB760\uB97C \uB354\uD574\uC694.", animated: true, filter: true, fields: { size: numeric2("\uBD84\uAD11 \uB760 \uAC04\uACA9", 4, 0.02, 12, 0.1, "mm"), angle: numeric2("\uBD84\uAD11 \uBC29\uD5A5", -25, -180, 180, 5, "\xB0"), strength: numeric2("\uAC15\uB3C4", 0.85, 0, 1, 0.05) } },
  glitch: { name: "\uAE00\uB9AC\uCE58", hint: "\uAC00\uB85C \uB760\uB97C \uC870\uAE08\uC529 \uC5B4\uAE0B\uB098\uAC8C \uD574 \uB514\uC9C0\uD138 \uC7A1\uC74C\uC744 \uD45C\uD604\uD574\uC694.", animated: true, filter: true, fields: { distance: numeric2("\uC5B4\uAE0B\uB0A8 \uAC70\uB9AC", 0.7, 0, 4, 0.05, "mm"), bands: numeric2("\uB760 \uAC1C\uC218", 10, 1, 40, 1), strength: numeric2("\uAC15\uB3C4", 0.65, 0, 1, 0.05) } },
  scanlines: { name: "\uC8FC\uC0AC\uC120", hint: "\uC587\uACE0 \uC77C\uC815\uD55C \uC120\uC744 \uACB9\uCCD0 \uD654\uBA74\xB7\uC778\uC1C4 \uC9C8\uAC10\uC744 \uB9CC\uB4E4\uC5B4\uC694.", animated: false, filter: true, fields: { color: color("\uC120 \uC0C9", "#142d46"), spacing: numeric2("\uC120 \uAC04\uACA9", 0.45, 0.02, 12, 0.02, "mm"), width: numeric2("\uC120 \uB450\uAED8", 0.12, 0.02, 12, 0.02, "mm"), angle: numeric2("\uAE30\uC6B8\uAE30", 0, -180, 180, 5, "\xB0"), strength: numeric2("\uAC15\uB3C4", 0.45, 0, 1, 0.05) } },
  grain: { name: "\uC785\uC790 \uC9C8\uAC10", hint: "\uC2DC\uB4DC\uB85C \uACE0\uC815\uB41C \uC791\uC740 \uC785\uC790\uB97C \uC6D0\uBCF8 \uD45C\uBA74\uC5D0 \uB354\uD574\uC694.", animated: false, filter: true, fields: { size: numeric2("\uC785\uC790 \uD06C\uAE30", 0.15, 0.02, 12, 0.01, "mm"), strength: numeric2("\uAC15\uB3C4", 0.2, 0, 1, 0.05) } },
  duotone: { name: "\uB450 \uC0C9\uC870", hint: "\uBC1D\uAE30\uC5D0 \uB530\uB77C \uC5B4\uB450\uC6B4 \uC0C9\uACFC \uBC1D\uC740 \uC0C9\uC744 \uC11E\uC5B4 \uCE60\uD574\uC694.", animated: false, filter: true, fields: { color: color("\uC5B4\uB450\uC6B4 \uC0C9", "#30235a"), color2: color("\uBC1D\uC740 \uC0C9", "#ffc48d"), strength: numeric2("\uAC15\uB3C4", 1, 0, 1, 0.05) } },
  firefly: { name: "\uBC18\uB527\uBD88", hint: "\uC791\uC740 \uBE5B\uC774 \uD754\uB4E4\uB9AC\uBA70 \uD53C\uC5B4\uB098\uACE0 \uC11C\uC11C\uD788 \uC0AC\uB77C\uC838\uC694.", placement: "behind", animated: true, generative: true, fields: particleFields({ "color": "#b4d852", "color2": "#e5f5a2", "count": 24, "size": 0.028, "travel": 0.45, "spread": 0.65, "life": 3.2, "direction": -90, "fade": 1.1 }) },
  bubble: { name: "\uAE30\uD3EC\xB7\uBB3C\uBC29\uC6B8", hint: "\uC18D\uC774 \uD22C\uBA85\uD55C \uBB3C\uBC29\uC6B8\uC774 \uB5A0\uC624\uB974\uBA70 \uC605\uC5B4\uC838\uC694.", placement: "behind", animated: true, generative: true, fields: particleFields({ "color": "#339bbd", "color2": "#a9e3ea", "count": 18, "size": 0.065, "travel": 0.5, "spread": 0.45, "life": 3.8, "direction": -90, "fade": 0.8 }) },
  petal: { name: "\uAF43\uC78E", hint: "\uACE1\uC120 \uAF43\uC78E\uC774 \uBC14\uB78C\uC744 \uB530\uB77C \uD68C\uC804\uD558\uBA70 \uD769\uB0A0\uB824\uC694.", placement: "behind", animated: true, generative: true, fields: particleFields({ "color": "#e478a6", "color2": "#f3b0c9", "count": 24, "size": 0.055, "travel": 0.65, "spread": 0.65, "life": 3.5, "direction": 80, "fade": 1.1, "spin": 0.35 }) },
  leaf: { name: "\uB098\uBB47\uC78E", hint: "\uC78E\uB9E5\uC774 \uC788\uB294 \uB098\uBB47\uC78E\uC774 \uD68C\uC804\uD558\uBA70 \uB5A8\uC5B4\uC838\uC694.", placement: "behind", animated: true, generative: true, fields: particleFields({ "color": "#63994c", "color2": "#b5c468", "count": 22, "size": 0.06, "travel": 0.65, "spread": 0.7, "life": 3.5, "direction": 80, "fade": 1.2, "spin": 0.25 }) },
  snowflake: { name: "\uB208\uC1A1\uC774", hint: "\uAC00\uC9C0\uAC00 \uAC08\uB77C\uC9C4 \uB208 \uACB0\uC815\uC774 \uCC9C\uCC9C\uD788 \uB0B4\uB824\uC640\uC694.", placement: "behind", animated: true, generative: true, fields: particleFields({ "color": "#6badd0", "color2": "#d0e7f0", "count": 24, "size": 0.05, "travel": 0.6, "spread": 0.55, "life": 4, "direction": 90, "fade": 0.9, "spin": 0.16 }) },
  crystal: { name: "\uC218\uC815 \uC870\uAC01", hint: "\uBC1D\uACE0 \uC5B4\uB450\uC6B4 \uBA74\uC774 \uB098\uB25C \uC218\uC815 \uC870\uAC01\uC774 \uD769\uC5B4\uC838\uC694.", placement: "behind", animated: true, generative: true, fields: particleFields({ "color": "#6e7ac5", "color2": "#bdcfef", "count": 20, "size": 0.055, "travel": 0.4, "spread": 0.6, "life": 3.2, "direction": -90, "fade": 1.2, "spin": 0.2 }) },
  confetti: { name: "\uC0C9\uC885\uC774", hint: "\uB0A9\uC791\uD55C \uC0C9\uC885\uC774\uAC00 \uB4A4\uC9D1\uD788\uACE0 \uD68C\uC804\uD558\uBA70 \uB5A8\uC5B4\uC838\uC694.", placement: "behind", animated: true, generative: true, fields: particleFields({ "color": "#d95d7d", "color2": "#69a6be", "count": 32, "size": 0.045, "travel": 0.65, "spread": 0.9, "life": 3, "direction": 70, "fade": 1.2, "spin": 1.2 }) },
  comet: { name: "\uD61C\uC131\xB7\uBE5B \uAF2C\uB9AC", hint: "\uB05D\uC774 \uD22C\uBA85\uD574\uC9C0\uB294 \uAE34 \uAF2C\uB9AC\uC640 \uBE5B\uB098\uB294 \uBA38\uB9AC\uB97C \uB9CC\uB4E4\uC5B4\uC694.", placement: "behind", animated: true, generative: true, fields: particleFields({ "color": "#487fb9", "color2": "#8fcee2", "count": 12, "size": 0.035, "travel": 0.7, "spread": 0.3, "life": 2, "direction": -50, "fade": 1.25 }) },
  rain: { name: "\uBE57\uC904\uAE30", hint: "\uBC29\uD5A5\uC744 \uB530\uB77C \uAC00\uB290\uB2E4\uB780 \uBE57\uC904\uAE30\uC640 \uBB3C\uBC29\uC6B8\uC774 \uB0B4\uB824\uC640\uC694.", placement: "behind", animated: true, generative: true, fields: particleFields({ "color": "#3d7b9d", "color2": "#93b9cf", "count": 32, "size": 0.022, "travel": 0.8, "spread": 0.2, "life": 1.25, "direction": 100, "fade": 1 }) },
  dust: { name: "\uBD80\uC720 \uBA3C\uC9C0", hint: "\uBD80\uB4DC\uB7EC\uC6B4 \uC791\uC740 \uBA3C\uC9C0\uAC00 \uBE5B \uC18D\uC5D0 \uB5A0\uB2E4\uB140\uC694.", placement: "behind", animated: true, generative: true, fields: particleFields({ "color": "#ad865b", "color2": "#dfc797", "count": 28, "size": 0.035, "travel": 0.3, "spread": 0.9, "life": 4.5, "direction": -85, "fade": 1.5 }) },
  rune: { name: "\uB8EC \uC870\uAC01", hint: "\uAD6C\uBA4D\uACFC \uC120\uC774 \uC788\uB294 \uAE30\uD558\uD559 \uBB38\uC591\uC774 \uB5A0\uC62C\uB77C\uC694.", placement: "behind", animated: true, generative: true, fields: particleFields({ "color": "#7756a9", "color2": "#b995d6", "count": 18, "size": 0.06, "travel": 0.35, "spread": 0.5, "life": 3, "direction": -90, "fade": 1.4, "spin": 0.15 }) },
  vortex: { name: "\uC18C\uC6A9\uB3CC\uC774 \uC785\uC790", hint: "\uC785\uC790\uB4E4\uC774 \uB098\uC120 \uADA4\uC801\uC744 \uB530\uB77C \uD37C\uC9C0\uBA70 \uC0AC\uB77C\uC838\uC694.", placement: "behind", animated: true, generative: true, fields: particleFields({ "color": "#5466bb", "color2": "#b7a1dd", "count": 28, "size": 0.025, "travel": 0.4, "spread": 0.65, "life": 3.5, "direction": -90, "fade": 1.1, "spin": 0.65 }) },
  textWarp: { name: "\uAE00\uC790 \uD615\uD0DC \uC65C\uACE1", placement: "source", animated: false, textOnly: true, fields: { arc: numeric2("\uC544\uCE58", 0, -1, 1), wave: numeric2("\uBB3C\uACB0 \uB192\uC774", 0, 0, 1), wavelength: numeric2("\uBB3C\uACB0 \uAC04\uACA9", 0.5, 0.1, 2), skewDeg: numeric2("\uAE30\uC6B8\uC784", 0, -45, 45, 1, "\xB0"), scaleX: numeric2("\uAC00\uB85C \uBC30\uC728", 1, 0.25, 3), scaleY: numeric2("\uC138\uB85C \uBC30\uC728", 1, 0.25, 3) } }
};
for (const definition of Object.values(VISUAL_EFFECT_CATALOG)) if (definition.generative) Object.assign(definition.fields, PARTICLE_MOTION_FIELDS);
var VISUAL_EFFECT_PRESETS = {
  fourPointStarlight: { name: "4\uAC01 \uBCC4\uBE5B \uBC18\uC9DD\uC784", category: "\uBE5B\xB7\uC6C0\uC9C1\uC784", layers: [{ kind: "starlight", placement: "front", emit: { face: "area", openOnly: false }, params: { color: "#86c9ff", coreColor: "#ffffff", count: 12, size: 0.1, stretch: 1.5, glow: 0.85, twinkle: 1, spin: 0.04, randomness: 0 } }] },
  radiantBloom: { name: "\uB208\uBD80\uC2E0 \uBE5B", category: "\uBE5B\xB7\uC6C0\uC9C1\uC784", layers: [{ kind: "gradient", scope: "inside", params: { color: "#fffbea", color2: "#ffbb68" } }, { kind: "outline", scope: "outside", opacity: 0.9, params: { color: "#79502b", width: 0.14 } }, { kind: "bloom", params: { threshold: 0.35, knee: 0.5, radius: 1.5, strength: 1.7, color: "#ffe6b0" } }] },
  luminousRunes: { name: "\uB5A0\uC624\uB974\uB294 \uBE5B\uC758 \uBB38\uC591", category: "\uBE5B\xB7\uC6C0\uC9C1\uC784", layers: [{ kind: "sprite", placement: "front", params: { shape: "rune", color: "#607db5", color2: "#9154b3", count: 18, sizeStart: 0.12, sizeEnd: 0.22, travel: 0.9, life: 3, spin: 0.12, randomness: 0 } }, { kind: "bloom", params: { threshold: 0.3, radius: 0.7, strength: 1.5 } }] },
  lightStreak: { name: "\uBE5B\uC758 \uC794\uC0C1", category: "\uBE5B\xB7\uC6C0\uC9C1\uC784", layers: [{ kind: "gradient", scope: "inside", params: { color: "#80b5de", color2: "#395d9e" } }, { kind: "directionalBlur", opacity: 0.65, params: { distance: 1.2, angle: -25, samples: 11, strength: 0.75 } }, { kind: "bloom", params: { threshold: 0.4, radius: 0.7, strength: 0.7 } }] },
  liquidMirage: { name: "\uC218\uBA74\uC758 \uC2E0\uAE30\uB8E8", category: "\uBE5B\xB7\uC6C0\uC9C1\uC784", layers: [{ kind: "displacement", params: { amount: 0.28, wavelength: 3, axis: "both" } }, { kind: "sprite", placement: "front", opacity: 0.6, params: { shape: "circle", color: "#96ddf6", color2: "#d0c5ff", sizeStart: 8e-3, sizeEnd: 0.035, travel: 0.65, count: 18, life: 3.5, randomness: 0 } }, { kind: "bloom", params: { threshold: 0.55, radius: 0.5, strength: 0.6 } }] },
  fireflyGarden: particleCombination("\uBC18\uB527\uBD88 \uC815\uC6D0", [{ "kind": "firefly", "params": {} }, { "kind": "dust", "opacity": 0.55, "params": { "color": "#6d9960", "color2": "#b7cc82", "count": 12, "size": 0.018, "travel": 0.2 } }]),
  bubbleStream: particleCombination("\uBB3C\uBC29\uC6B8 \uD750\uB984", [{ "kind": "bubble", "params": {} }, { "kind": "ripple", "params": { "color": "#4491ac", "start": 0.03, "end": 0.65, "count": 2, "width": 0.13, "fade": 1.5 } }, { "kind": "outline", "scope": "outside", "opacity": 0.5, "params": { "color": "#3e718a", "width": 0.08 } }]),
  sakuraBreeze: particleCombination("\uBC9A\uAF43 \uBC14\uB78C", [{ "kind": "petal", "params": {} }, { "kind": "dust", "opacity": 0.5, "params": { "color": "#ce95ad", "color2": "#edc6d8", "count": 12, "size": 0.018, "travel": 0.3 } }]),
  forestBreeze: particleCombination("\uC232\uC758 \uBC14\uB78C", [{ "kind": "leaf", "params": {} }, { "kind": "firefly", "opacity": 0.7, "params": { "color": "#9dbd50", "color2": "#cde68d", "count": 12, "size": 0.018, "travel": 0.3 } }]),
  snowfall: particleCombination("\uB208\uAF43 \uB208\uBCF4\uB77C", [{ "kind": "snowflake", "params": {} }, { "kind": "particle", "opacity": 0.5, "params": { "shape": "dot", "color": "#6d9cb3", "count": 18, "size": 0.012, "spread": 0.4, "direction": 90 } }]),
  crystalShower: particleCombination("\uC218\uC815 \uBE44", [{ "kind": "crystal", "params": {} }, { "kind": "particle", "opacity": 0.6, "params": { "color": "#8f7bb3", "count": 12, "size": 0.017 } }]),
  festival: particleCombination("\uCD95\uC81C \uC0C9\uC885\uC774", [{ "kind": "confetti", "params": {} }, { "kind": "particle", "opacity": 0.55, "params": { "color": "#b27b30", "count": 12, "size": 0.018 } }]),
  meteorShower: particleCombination("\uBCC4\uB625\uBCC4 \uADA4\uC801", [{ "kind": "comet", "params": {} }, { "kind": "particle", "opacity": 0.5, "params": { "color": "#7193b2", "count": 14, "size": 0.016 } }]),
  rainfall: particleCombination("\uBE57\uBC29\uC6B8 \uD30C\uBB38", [{ "kind": "rain", "params": {} }, { "kind": "ripple", "params": { "color": "#527f9b", "start": 0.05, "end": 0.8, "count": 3, "width": 0.12, "fade": 1.7 } }, { "kind": "outline", "scope": "outside", "opacity": 0.45, "params": { "color": "#466478", "width": 0.08 } }]),
  goldenDust: particleCombination("\uD669\uAE08 \uBA3C\uC9C0", [{ "kind": "dust", "params": {} }, { "kind": "firefly", "opacity": 0.65, "params": { "color": "#b7903e", "color2": "#e4c976", "count": 14, "size": 0.02, "travel": 0.25 } }]),
  runeVortex: particleCombination("\uB8EC \uC18C\uC6A9\uB3CC\uC774", [{ "kind": "rune", "params": {} }, { "kind": "vortex", "opacity": 0.65, "params": { "count": 20, "size": 0.02, "travel": 0.35 } }]),
  soulVortex: particleCombination("\uC601\uD63C\uC758 \uC18C\uC6A9\uB3CC\uC774", [{ "kind": "vortex", "params": {} }, { "kind": "firefly", "opacity": 0.6, "params": { "color": "#6389a6", "color2": "#bad8e6", "count": 12, "size": 0.022, "travel": 0.25 } }, { "kind": "ripple", "opacity": 0.5, "params": { "color": "#757bb5", "count": 2, "start": 0.02, "end": 0.55, "width": 0.1, "fade": 1.8 } }]),
  flame: { name: "\uD0C0\uC624\uB974\uB294 \uBD88\uAF43", layers: [{ kind: "flame" }] },
  smoke: { name: "\uD53C\uC5B4\uC624\uB974\uB294 \uC5F0\uAE30", layers: [{ kind: "smoke" }] },
  burning: { name: "\uBD88\uD0C0\uB294 \uCE74\uB4DC", layers: [{ kind: "smoke" }, { kind: "flame" }, { kind: "ember" }] },
  burningText: { name: "\uBD88\uD0C0\uBA70 \uC774\uAE00\uAC70\uB9AC\uB294 \uAE00\uC790", category: "\uAE00\uC790\xB7\uC9C8\uAC10", layers: [
    { kind: "gradient", params: { color: "#fff5b5", color2: "#f16c18", angle: 90 } },
    { kind: "glow", params: { color: "#ff7f24", radius: 0.5, strength: 0.65 } },
    { kind: "flame", params: { count: 60, height: 0.52, size: 0.075, width: 0.1, life: 1.8 } },
    { kind: "ember", params: { count: 14, size: 0.015, tail: 0.07 } },
    { kind: "heatHaze", params: { amount: 0.16, wavelength: 1.8, detail: 0.7, direction: -90 } }
  ] },
  heatShimmer: { name: "\uC774\uAE00\uAC70\uB9AC\uB294 \uC5F4\uAE30", category: "\uAE00\uC790\xB7\uC9C8\uAC10", layers: [
    { kind: "gradient", params: { color: "#fff3ae", color2: "#e87928", angle: 90 } },
    { kind: "glow", scope: "outside", params: { color: "#ed652e", radius: 0.65, strength: 0.55 } },
    { kind: "heatHaze", params: { amount: 0.3, wavelength: 2.4, detail: 0.7, direction: -90 } }
  ] },
  frost: { name: "\uC11C\uB9AC \uC624\uB77C", layers: [{ kind: "aura", params: { color: "#70cfff" } }, { kind: "particle", params: { color: "#659cbc", shape: "snow" }, placement: "front" }, { kind: "glow", scope: "outside", params: { color: "#85dfff" } }] },
  poison: { name: "\uB3C5\uC548\uAC1C", layers: [{ kind: "smoke", params: { color: "#9759cc" } }, { kind: "mist", params: { color: "#ac6ed4" } }, { kind: "glow", scope: "outside", params: { color: "#9a48de" } }] },
  lightningAura: { name: "\uBC88\uAC1C \uC624\uB77C", layers: [{ kind: "aura", params: { color: "#79beff" } }, { kind: "lightning" }, { kind: "glow", scope: "outside", params: { color: "#b0d8ff" } }] },
  starlight: { name: "\uBCC4\uBE5B \uBC18\uC9DD\uC784", layers: [{ kind: "particle", placement: "front", params: { color: "#b98530" } }, { kind: "glow", scope: "outside", params: { color: "#fff0a0", radius: 1 } }] },
  darkAfterglow: { name: "\uC5B4\uB460\uC758 \uC794\uAD11", layers: [{ kind: "aura", params: { color: "#7846a8" } }, { kind: "smoke", params: { color: "#53386e" } }, { kind: "glow", scope: "outside", params: { color: "#c777f5" } }] },
  goldTitle: { name: "\uAE08\uBE5B \uC81C\uBAA9", layers: [{ kind: "outline", scope: "outside", params: { color: "#805221", width: 0.2 } }, { kind: "shadow", scope: "outside", opacity: 0.65, params: { offsetX: 0.3, offsetY: 0.5, blur: 0.5 } }, { kind: "gradient", scope: "inside", params: { color: "#fff3ba", color2: "#b57a25" } }, { kind: "sweep", scope: "inside" }] },
  neonText: { name: "\uB124\uC628 \uAE00\uC790", layers: [{ kind: "outline", scope: "outside", params: { color: "#faecff", width: 0.18 } }, { kind: "glow", scope: "outside", params: { color: "#e358f8", radius: 2.5 } }, { kind: "sweep", scope: "inside", params: { color: "#8bf6ff" } }] },
  rgbSplit: { name: "RGB \uBD84\uB9AC", category: "\uB514\uC9C0\uD138\xB7\uC778\uC1C4", layers: [
    { kind: "outline", scope: "outside", params: { color: "#343c4d", width: 0.12 } },
    { kind: "shadow", scope: "outside", opacity: 0.25, params: { color: "#344254", offsetX: 0.18, offsetY: 0.22, blur: 0.12 } },
    { kind: "chromatic", scope: "all", params: { distance: 0.38, angle: 0, mode: "auto", color: "#e84963", color2: "#168ba9", strength: 0.9 } },
    { kind: "scanlines", scope: "inside", opacity: 0.3, params: { color: "#263c52", spacing: 0.45, width: 0.06, strength: 0.18 } }
  ] },
  cyberGlitch: { name: "\uC0AC\uC774\uBC84 \uAE00\uB9AC\uCE58", category: "\uB514\uC9C0\uD138\xB7\uC778\uC1C4", layers: [
    { kind: "outline", scope: "outside", params: { color: "#243949", width: 0.16 } },
    { kind: "shadow", scope: "outside", opacity: 0.35, params: { color: "#183544", offsetX: 0.3, offsetY: 0.35, blur: 0.15 } },
    { kind: "duotone", scope: "inside", params: { color: "#142536", color2: "#76d9e7", strength: 0.5 } },
    { kind: "chromatic", scope: "all", params: { distance: 0.45, angle: 0, mode: "fringe", color: "#dc3c72", color2: "#168fba", strength: 0.85 } },
    { kind: "glitch", scope: "all", params: { distance: 0.7, bands: 10, strength: 0.55 }, motion: { enabled: true } },
    { kind: "scanlines", scope: "inside", params: { color: "#12354d", spacing: 0.45, width: 0.08, strength: 0.25 } }
  ] },
  hologram: { name: "\uD478\uB978 \uD640\uB85C\uADF8\uB7A8", category: "\uB514\uC9C0\uD138\xB7\uC778\uC1C4", layers: [
    { kind: "outline", scope: "outside", params: { color: "#25435d", width: 0.16 } },
    { kind: "shadow", scope: "outside", opacity: 0.35, params: { color: "#24465c", offsetX: 0.22, offsetY: 0.28, blur: 0.25 } },
    { kind: "holographic", scope: "inside", params: { size: 3, angle: -25, strength: 0.75 }, motion: { enabled: true } },
    { kind: "innerGlow", scope: "inside", params: { color: "#ace9f2", width: 0.3, strength: 0.45 } },
    { kind: "scanlines", scope: "inside", params: { color: "#28627b", spacing: 0.4, width: 0.06, strength: 0.22 } },
    { kind: "glow", scope: "outside", params: { color: "#71cbdc", radius: 0.6, strength: 0.22 }, motion: { enabled: false } }
  ] },
  roseGold: { name: "\uC7A5\uBBF8 \uAE08\uC18D", category: "\uAE08\uC18D\xB7\uC785\uCCB4", layers: [
    { kind: "outline", scope: "outside", params: { color: "#69423e", width: 0.16 } },
    { kind: "extrude", scope: "outside", params: { color: "#603b40", depth: 0.35, angle: 50 } },
    { kind: "foil", scope: "inside", params: { color: "#a35d5a", color2: "#ffe0b8", size: 6, angle: -35, strength: 0.85 }, motion: { enabled: false } },
    { kind: "bevel", scope: "inside", params: { highlight: "#fff0dc", shadow: "#8c4c4d", size: 0.28, angle: -55, strength: 0.7 } },
    { kind: "innerShadow", scope: "inside", params: { color: "#69343e", offsetX: 0.13, offsetY: 0.2, blur: 0.15, strength: 0.28 } }
  ] },
  silverChrome: { name: "\uC740\uBE5B \uD06C\uB86C", category: "\uAE08\uC18D\xB7\uC785\uCCB4", layers: [
    { kind: "outline", scope: "outside", params: { color: "#3f4b5a", width: 0.16 } },
    { kind: "extrude", scope: "outside", params: { color: "#3c4659", depth: 0.32, angle: 45 } },
    { kind: "foil", scope: "inside", params: { color: "#6e7b8c", color2: "#f3f7ff", size: 5, angle: -45, strength: 1 }, motion: { enabled: false } },
    { kind: "bevel", scope: "inside", params: { highlight: "#ffffff", shadow: "#46546a", size: 0.25, angle: -55, strength: 0.8 } },
    { kind: "innerShadow", scope: "inside", params: { color: "#24394b", offsetX: 0.12, offsetY: 0.18, blur: 0.15, strength: 0.3 } }
  ] },
  enchantedGold: { name: "\uB9C8\uBC95 \uD669\uAE08", category: "\uAE08\uC18D\xB7\uC785\uCCB4", layers: [
    { kind: "outline", scope: "outside", params: { color: "#654c25", width: 0.18 } },
    { kind: "shadow", scope: "outside", opacity: 0.45, params: { color: "#654321", offsetX: 0.28, offsetY: 0.35, blur: 0.28 } },
    { kind: "foil", scope: "inside", params: { color: "#ad711b", color2: "#fff0a6", size: 6, angle: -35, strength: 0.95 }, motion: { enabled: false } },
    { kind: "bevel", scope: "inside", params: { highlight: "#fff7cf", shadow: "#694219", size: 0.28, angle: -55, strength: 0.8 } },
    { kind: "glow", scope: "outside", params: { color: "#ffe07b", radius: 0.75, strength: 0.35 }, motion: { enabled: false } },
    { kind: "particle", placement: "front", opacity: 0.55, params: { color: "#b47b2b", count: 14, size: 0.018, spread: 0.35, life: 3 }, motion: { enabled: false } }
  ] },
  iceCrystal: { name: "\uC5BC\uC74C \uC218\uC815", category: "\uB9C8\uBC95\xB7\uC790\uC5F0", layers: [
    { kind: "outline", scope: "outside", params: { color: "#31586b", width: 0.16 } },
    { kind: "shadow", scope: "outside", opacity: 0.35, params: { color: "#325b73", offsetX: 0.22, offsetY: 0.3, blur: 0.25 } },
    { kind: "gradient", scope: "inside", params: { color: "#d8f6ff", color2: "#3c83af", angle: 90, strength: 0.9 }, motion: { enabled: false } },
    { kind: "bevel", scope: "inside", params: { highlight: "#f2ffff", shadow: "#32637f", size: 0.25, angle: -60, strength: 0.8 } },
    { kind: "innerGlow", scope: "inside", params: { color: "#e4fcff", width: 0.22, strength: 0.55 } },
    { kind: "particle", placement: "front", opacity: 0.5, params: { shape: "snow", color: "#3b789c", count: 14, size: 0.018, spread: 0.3 }, motion: { enabled: false } },
    { kind: "glow", scope: "outside", params: { color: "#9fd9ed", radius: 0.65, strength: 0.25 }, motion: { enabled: false } }
  ] },
  moltenLava: { name: "\uC6A9\uC554 \uC2EC\uC7A5", category: "\uB9C8\uBC95\xB7\uC790\uC5F0", layers: [
    { kind: "outline", scope: "outside", params: { color: "#533025", width: 0.18 } },
    { kind: "extrude", scope: "outside", params: { color: "#52251d", depth: 0.4, angle: 50 } },
    { kind: "gradient", scope: "inside", params: { color: "#ffbd4e", color2: "#b32a21", angle: 90, strength: 1 }, motion: { enabled: false } },
    { kind: "bevel", scope: "inside", params: { highlight: "#ffdf92", shadow: "#5b261f", size: 0.3, angle: -55, strength: 0.85 } },
    { kind: "innerGlow", scope: "inside", params: { color: "#ffd365", width: 0.22, strength: 0.45 } },
    { kind: "ember", placement: "behind", opacity: 0.5, params: { color: "#dd6c25", count: 15, size: 0.012, tail: 0.03 }, motion: { enabled: false } },
    { kind: "glow", scope: "outside", params: { color: "#f2a54c", radius: 0.6, strength: 0.2 }, motion: { enabled: false } }
  ] },
  poisonSlime: { name: "\uB3C5\uC131 \uC2AC\uB77C\uC784", category: "\uB9C8\uBC95\xB7\uC790\uC5F0", layers: [
    { kind: "outline", scope: "outside", params: { color: "#354c32", width: 0.18 } },
    { kind: "shadow", scope: "outside", opacity: 0.4, params: { color: "#344b29", offsetX: 0.25, offsetY: 0.3, blur: 0.3 } },
    { kind: "gradient", scope: "inside", params: { color: "#c0e965", color2: "#4a8c43", angle: 90, strength: 0.95 }, motion: { enabled: false } },
    { kind: "bevel", scope: "inside", params: { highlight: "#efffb3", shadow: "#3e5a28", size: 0.3, angle: -55, strength: 0.8 } },
    { kind: "innerGlow", scope: "inside", params: { color: "#daff9a", width: 0.2, strength: 0.4 } },
    { kind: "particle", placement: "front", opacity: 0.4, params: { shape: "dot", color: "#607d32", count: 12, size: 0.015, spread: 0.4 }, motion: { enabled: false } },
    { kind: "glow", scope: "outside", params: { color: "#afd960", radius: 0.65, strength: 0.18 }, motion: { enabled: false } }
  ] },
  shadowRelief: { name: "\uADF8\uB9BC\uC790 \uBD80\uC870", category: "\uAE08\uC18D\xB7\uC785\uCCB4", layers: [
    { kind: "outline", scope: "outside", params: { color: "#343043", width: 0.16 } },
    { kind: "extrude", scope: "outside", params: { color: "#353043", depth: 0.55, angle: 50 } },
    { kind: "duotone", scope: "inside", params: { color: "#252238", color2: "#c3b4cf", strength: 0.65 } },
    { kind: "bevel", scope: "inside", params: { highlight: "#d9cced", shadow: "#282236", size: 0.3, angle: -55, strength: 0.65 } },
    { kind: "innerShadow", scope: "inside", params: { color: "#1c1828", offsetX: 0.2, offsetY: 0.25, blur: 0.22, strength: 0.7 } }
  ] },
  stampedInk: { name: "\uC789\uD06C \uB3C4\uC7A5", category: "\uB514\uC9C0\uD138\xB7\uC778\uC1C4", layers: [
    { kind: "outline", scope: "outside", params: { color: "#4b3031", width: 0.1 } },
    { kind: "duotone", scope: "inside", params: { color: "#4e272b", color2: "#cf7d72", strength: 1 } },
    { kind: "innerShadow", scope: "inside", params: { color: "#49242a", offsetX: 0.15, offsetY: 0.15, blur: 0.12, strength: 0.4 } },
    { kind: "erode", scope: "all", params: { depth: 0.08, roughness: 0.28 } },
    { kind: "grain", scope: "inside", params: { size: 0.06, strength: 0.18 } }
  ] },
  retroPrint: { name: "\uB808\uD2B8\uB85C \uC778\uC1C4", category: "\uB514\uC9C0\uD138\xB7\uC778\uC1C4", layers: [
    { kind: "outline", scope: "outside", params: { color: "#313d46", width: 0.12 } },
    { kind: "shadow", scope: "outside", opacity: 0.3, params: { color: "#3d4954", offsetX: 0.2, offsetY: 0.25, blur: 0.1 } },
    { kind: "duotone", scope: "inside", params: { color: "#204d61", color2: "#e9b769", strength: 0.8 } },
    { kind: "halftone", scope: "inside", opacity: 0.45, params: { size: 0.32, angle: 30 } },
    { kind: "grain", scope: "inside", params: { size: 0.07, strength: 0.16 } },
    { kind: "chromatic", scope: "all", params: { distance: 0.15, angle: 0, mode: "fringe", color: "#db6758", color2: "#267799", strength: 0.4 } }
  ] },
  arcaneRune: { name: "\uBE44\uC804 \uB8EC", category: "\uB9C8\uBC95\xB7\uC790\uC5F0", layers: [
    { kind: "outline", scope: "outside", params: { color: "#47305e", width: 0.17 } },
    { kind: "shadow", scope: "outside", opacity: 0.4, params: { color: "#44335e", offsetX: 0.2, offsetY: 0.25, blur: 0.2 } },
    { kind: "gradient", scope: "inside", params: { color: "#d3b9ff", color2: "#8053ad", angle: 90, strength: 0.9 }, motion: { enabled: false } },
    { kind: "bevel", scope: "inside", params: { highlight: "#eee3ff", shadow: "#4d3069", size: 0.23, angle: -55, strength: 0.65 } },
    { kind: "aura", placement: "behind", opacity: 0.28, params: { color: "#8254b8", length: 0.16, count: 12 }, motion: { enabled: false } },
    { kind: "glow", scope: "outside", params: { color: "#a177d8", radius: 0.7, strength: 0.25 }, motion: { enabled: false } },
    { kind: "particle", placement: "front", opacity: 0.45, params: { color: "#925fa9", count: 12, size: 0.018, spread: 0.35 }, motion: { enabled: false } }
  ] },
  starryDream: { name: "\uBCC4\uBE5B \uAFC8\uACB0", category: "\uB9C8\uBC95\xB7\uC790\uC5F0", layers: [
    { kind: "outline", scope: "outside", params: { color: "#3d395d", width: 0.16 } },
    { kind: "shadow", scope: "outside", opacity: 0.4, params: { color: "#35314f", offsetX: 0.22, offsetY: 0.28, blur: 0.3 } },
    { kind: "gradient", scope: "inside", params: { color: "#e5cbfa", color2: "#7187bd", angle: 90, strength: 0.9 }, motion: { enabled: false } },
    { kind: "holographic", scope: "inside", opacity: 0.35, params: { size: 2.5, angle: -30, strength: 0.35 }, motion: { enabled: false } },
    { kind: "innerGlow", scope: "inside", params: { color: "#fff0fb", width: 0.2, strength: 0.35 } },
    { kind: "particle", placement: "front", opacity: 0.45, params: { color: "#97799e", count: 16, size: 0.02, spread: 0.4 }, motion: { enabled: false } },
    { kind: "glow", scope: "outside", params: { color: "#d2afec", radius: 0.75, strength: 0.2 }, motion: { enabled: false } }
  ] }
};
var object2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var safe = (k) => !["__proto__", "constructor", "prototype"].includes(k);
var validId = (v) => typeof v === "string" && v.length > 0 && v.length < 200 && safe(v);
var bounded = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
var definitionFor = (kind) => Object.hasOwn(VISUAL_EFFECT_CATALOG, kind) ? VISUAL_EFFECT_CATALOG[kind] : null;
var legacyKinds = /* @__PURE__ */ new Set(["outline", "glow", "shadow", "gradient", "flame", "smoke", "ember", "mist", "lightning", "ripple", "particle", "aura", "sweep", "textWarp"]);
function fieldsFor(kind, legacy) {
  const fields = { ...VISUAL_EFFECT_CATALOG[kind].fields };
  if (!legacy) return fields;
  if (kind === "flame") delete fields.size;
  if (kind === "smoke") delete fields.height;
  if (fields.count) fields.count = { ...fields.count, max: 80 };
  return fields;
}
function validateRecipe(value, target, legacy) {
  const problems2 = [];
  let context = "";
  const bad = (message) => problems2.push({ code: "visual-effect", message: context + message });
  const numericValue = (label, v, min, max, unit = "", integer = false, displayScale = 1) => {
    if (!bounded(v, min, max) || integer && !Number.isInteger(v)) {
      const display = (value2) => displayScale !== 1 && typeof value2 === "number" && Number.isFinite(value2) ? Number((value2 * displayScale).toPrecision(12)) : value2;
      bad(label + " \uAC12 " + valueLabel(display(v)) + "\uC740 \uD5C8\uC6A9 \uBC94\uC704\uB97C \uBC97\uC5B4\uB0A9\uB2C8\uB2E4. " + display(min) + "~" + display(max) + unit + (integer ? " \uC0AC\uC774\uC758 \uC815\uC218" : " \uC0AC\uC774\uC758 \uC218") + "\uB97C \uC785\uB825\uD558\uC138\uC694.");
    }
  };
  const choiceValue = (label, v, choices) => {
    if (!choices.includes(v)) bad(label + " \uAC12 " + valueLabel(v) + "\uC740 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. " + choices.join(" / ") + " \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
  };
  const boolValue = (label, v) => {
    if (typeof v !== "boolean") bad(label + " \uAC12 " + valueLabel(v) + "\uC740 \uCF1C\uC9D0/\uAEBC\uC9D0 \uAC12\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
  };
  const shapeKeys = (v, allowed, label) => {
    if (!object2(v)) {
      bad(label + "\uC774 \uD56D\uBAA9\uC744 \uB2F4\uC740 \uAC1D\uCCB4\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uD604\uC7AC \uAC12: " + valueLabel(v) + ".");
      return false;
    }
    for (const key of Object.keys(v)) if (!allowed.includes(key)) bad(label + "\uC5D0 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD56D\uBAA9 " + valueLabel(key) + "\uC774 \uC788\uC2B5\uB2C8\uB2E4.");
    return true;
  };
  if (!object2(value)) {
    bad("\uC774\uD399\uD2B8 \uC870\uD569\uC774 \uAC1D\uCCB4\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uD604\uC7AC \uAC12: " + valueLabel(value) + ".");
    return problems2;
  }
  const jsonProblem = (v, path = "\uC870\uD569", depth = 0) => {
    if (depth >= 20) return path + "\uC758 \uC911\uCCA9\uC774 \uC800\uC7A5 \uD55C\uB3C4\uC778 19\uB2E8\uACC4\uB97C \uB118\uC2B5\uB2C8\uB2E4.";
    if (v === null || ["string", "boolean"].includes(typeof v) || typeof v === "number" && Number.isFinite(v)) return "";
    if (typeof v !== "object") return path + " \uAC12 " + valueLabel(v) + "\uC740 \uD30C\uC77C\uC5D0 \uC800\uC7A5\uD560 \uC218 \uC5C6\uB294 \uAC12\uC785\uB2C8\uB2E4.";
    for (const [key, item] of Object.entries(v)) {
      if (!safe(key)) return path + "\uC5D0 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uB294 \uD56D\uBAA9 " + valueLabel(key) + "\uC774 \uC788\uC2B5\uB2C8\uB2E4.";
      const error = jsonProblem(item, path + (Array.isArray(v) ? "[" + key + "]" : "." + key), depth + 1);
      if (error) return error;
    }
    return "";
  };
  const unsafe = jsonProblem(value);
  if (unsafe) {
    bad(unsafe);
    return problems2;
  }
  shapeKeys(value, legacy ? ["seed", "layers"] : ["version", "seed", "layers", "frame"], "\uC774\uD399\uD2B8 \uC870\uD569");
  if (!legacy && value.version !== 2) bad("\uC9C0\uC6D0\uD558\uB294 \uC774\uD399\uD2B8 \uBC84\uC804\uC740 2\uC785\uB2C8\uB2E4. \uD604\uC7AC \uBC84\uC804: " + valueLabel(value.version) + ".");
  numericValue("\uBC30\uCE58 \uC2DC\uB4DC", value.seed, 0, 4294967295, "", true);
  if (!Array.isArray(value.layers)) {
    bad("\uD6A8\uACFC \uB808\uC774\uC5B4 \uBAA9\uB85D\uC774 \uBC30\uC5F4\uC774 \uC544\uB2D9\uB2C8\uB2E4. \uD604\uC7AC \uAC12: " + valueLabel(value.layers) + ".");
    return problems2;
  }
  if (value.layers.length > 12) {
    bad("\uD6A8\uACFC \uB808\uC774\uC5B4\uAC00 " + value.layers.length + "\uAC1C\uC5EC\uC11C \uCD5C\uB300 12\uAC1C\uB97C \uB118\uC2B5\uB2C8\uB2E4.");
    return problems2;
  }
  if (value.frame !== void 0) {
    if (!["frame", "any"].includes(target)) bad("\uD504\uB808\uC784 \uBC94\uC704\uB294 \uCE74\uB4DC \uD504\uB808\uC784\uC5D0\uB9CC \uC800\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uD604\uC7AC \uB300\uC0C1: " + valueLabel(target) + ".");
    if (shapeKeys(value.frame, ["scope", "bandMm"], "\uD504\uB808\uC784 \uBC94\uC704")) {
      choiceValue("\uD504\uB808\uC784 \uC801\uC6A9 \uBC94\uC704", value.frame.scope, ["border", "borderBleed", "full"]);
      numericValue("\uD14C\uB450\uB9AC \uB760 \uB450\uAED8", value.frame.bandMm, 2, 10, "mm");
    }
  }
  const ids = /* @__PURE__ */ new Set();
  let warps = 0;
  for (const [index, layer] of value.layers.entries()) {
    const definition = object2(layer) && definitionFor(layer.kind);
    context = index + 1 + "\uBC88 \uB808\uC774\uC5B4" + (definition ? " \xB7 " + definition.name : "") + ": ";
    if (!definition || legacy && !legacyKinds.has(layer.kind)) {
      bad("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD6A8\uACFC \uC885\uB958 " + valueLabel(layer?.kind) + "\uC785\uB2C8\uB2E4.");
      continue;
    }
    if (!validId(layer.id)) bad("\uB808\uC774\uC5B4 ID " + valueLabel(layer.id) + "\uC740 \uBE44\uC5B4 \uC788\uAC70\uB098 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uB294 \uC2DD\uBCC4\uC790\uC785\uB2C8\uB2E4.");
    else if (ids.has(layer.id)) bad("\uB808\uC774\uC5B4 ID " + valueLabel(layer.id) + "\uC774 \uC55E\uC120 \uB808\uC774\uC5B4\uC640 \uC911\uBCF5\uB429\uB2C8\uB2E4.");
    ids.add(layer.id);
    const common = ["id", "kind", "enabled", "opacity", "params", "motion", "blendMode"];
    const specific = legacy ? ["placement", "emitter", "rotationDeg", "origin"] : ["protectText", ...definition.generative ? ["placement", "emit", "rotationDeg", "origin"] : definition.textOnly ? ["placement"] : ["scope"]];
    shapeKeys(layer, [...common, ...specific], "\uB808\uC774\uC5B4");
    boolValue("\uB808\uC774\uC5B4 \uC0AC\uC6A9", layer.enabled);
    numericValue("\uBD88\uD22C\uBA85\uB3C4", layer.opacity, 0, 1);
    if (Object.hasOwn(layer, "blendMode")) {
      choiceValue("\uD63C\uD569 \uBAA8\uB4DC", layer.blendMode, BLEND_MODES.map(([mode]) => mode));
      if (definition.textOnly && layer.blendMode !== DEFAULT_BLEND_MODE) bad("\uAE00\uC790 \uD615\uD0DC \uC65C\uACE1\uC740 \uC6D0\uBCF8 \uBAA8\uC591\uB9CC \uBC14\uAFB8\uBBC0\uB85C \uC0C9 \uD63C\uD569 \uBAA8\uB4DC\uB97C \uC801\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    if (shapeKeys(layer.motion, ["enabled", "speed"], "\uC6C0\uC9C1\uC784")) {
      boolValue("\uC6C0\uC9C1\uC784 \uC0AC\uC6A9", layer.motion.enabled);
      numericValue("\uC7AC\uC0DD \uC18D\uB3C4", layer.motion.speed, 0.1, 3, "\uBC30");
    }
    if (!legacy) boolValue("\uAE00\uC790 \uBCF4\uD638", layer.protectText);
    if (legacy || definition.generative) {
      numericValue("\uD68C\uC804", layer.rotationDeg, -180, 180, "\xB0");
      if (shapeKeys(layer.origin, ["x", "y", "w", "h"], "\uBC1C\uC0DD \uC601\uC5ED")) for (const [key, label, min, max] of [["x", "\uAC00\uB85C \uC704\uCE58", -1, 2], ["y", "\uC138\uB85C \uC704\uCE58", -1, legacy ? 2 : 5], ["w", "\uBC1C\uC0DD \uD3ED", 0.05, 3], ["h", "\uBC1C\uC0DD \uB192\uC774", legacy ? 0.05 : 5e-3, 3]]) numericValue(label, layer.origin[key], min, max);
      if (legacy) choiceValue("\uBC1C\uC0DD \uBC29\uC2DD", layer.emitter, ["area", "bottom", "edge"]);
      else if (shapeKeys(layer.emit, ["face", "openOnly"], "\uBC1C\uC0DD \uBA74")) {
        choiceValue("\uBC1C\uC0DD \uBA74", layer.emit.face, ["up", "down", "side", "all", "inside", "area"]);
        boolValue("\uBE48 \uACF3\uB9CC \uBC1C\uC0DD", layer.emit.openOnly);
      }
    }
    if (definition.textOnly) {
      warps++;
      if (!["text", "any"].includes(target)) bad("\uAE00\uC790 \uD615\uD0DC \uC65C\uACE1\uC740 \uD14D\uC2A4\uD2B8\uC5D0\uB9CC \uC801\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uD604\uC7AC \uB300\uC0C1: " + valueLabel(target) + ".");
      if (layer.placement !== "source" || index !== 0) bad("\uAE00\uC790 \uD615\uD0DC \uC65C\uACE1\uC740 \uC870\uD569\uC758 \uCCAB \uBC88\uC9F8 \uB808\uC774\uC5B4\uC5EC\uC57C \uD569\uB2C8\uB2E4. \uD604\uC7AC \uC21C\uC11C: " + (index + 1) + "\uBC88, \uBC30\uCE58: " + valueLabel(layer.placement) + ".");
    } else if (legacy) choiceValue("\uC55E\uB4A4 \uBC30\uCE58", layer.placement, ["behind", "surface", "front"]);
    else if (definition.generative) choiceValue("\uC55E\uB4A4 \uBC30\uCE58", layer.placement, ["behind", "front"]);
    else choiceValue("\uD544\uD130 \uC801\uC6A9 \uBC94\uC704", layer.scope, ["all", "inside", "outside"]);
    if (!object2(layer.params)) {
      bad("\uC870\uC808 \uD56D\uBAA9\uC774 \uAC1D\uCCB4\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uD604\uC7AC \uAC12: " + valueLabel(layer.params) + ".");
      continue;
    }
    const fields = fieldsFor(layer.kind, legacy);
    for (const key of Object.keys(layer.params)) if (!Object.hasOwn(fields, key)) bad("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC870\uC808 \uD56D\uBAA9 " + valueLabel(key) + "\uC774 \uC788\uC2B5\uB2C8\uB2E4.");
    for (const [key, field] of Object.entries(fields)) {
      if (field.optional && !Object.hasOwn(layer.params, key)) continue;
      const v = layer.params[key];
      if (field.type === "number") numericValue(field.label, v, field.min, field.max, field.unit || "", field.step === 1, field.displayScale ?? 1);
      else if (field.type === "color" && (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v))) bad(field.label + " \uAC12 " + valueLabel(v) + "\uC740 #RRGGBB \uD615\uC2DD\uC758 \uC0C9\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
      else if (field.type === "select") choiceValue(field.label, v, field.options.map(([option]) => option));
      else if (field.type === "asset" && v !== null && !validId(v)) bad(field.label + " \uAC12 " + valueLabel(v) + "\uC740 \uC62C\uBC14\uB978 \uADF8\uB9BC ID\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uADF8\uB9BC\uC744 \uC120\uD0DD\uD558\uAC70\uB098 \uBE44\uC6CC\uB450\uC138\uC694.");
    }
    if (layer.kind === "sprite") for (const message of validateSpriteControls(layer.params)) bad(message);
  }
  context = "";
  if (warps > 1) bad("\uAE00\uC790 \uD615\uD0DC \uC65C\uACE1\uC774 " + warps + "\uAC1C\uC785\uB2C8\uB2E4. \uD55C \uC870\uD569\uC5D0\uB294 \uD558\uB098\uB9CC \uB458 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  return problems2;
}
function validateVisualEffects(value, target = "any") {
  return validateRecipe(value, target, object2(value) && !Object.hasOwn(value, "version"));
}

// src/model/variants.js
var VARIANT_FIELDS = ["name", "attribute", "attributes", "rank", "baseHp", "hpReduction", "artAssetId", "passives", "actives", "effect", "keywords", "nameKeywords", "textRanges", "template", "autoSkillLayout", "elements", "visualEffects"];
var object3 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var safe2 = (k) => !["__proto__", "constructor", "prototype"].includes(k);
var id2 = (k) => typeof k === "string" && k.length > 0 && k.length < 200 && safe2(k);
var keyed = (a) => Array.isArray(a) && a.every((v) => object3(v) && id2(v.id));
function validJson(value, depth = 0) {
  if (depth > 40) return false;
  if (value === null || ["string", "boolean"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((v) => validJson(v, depth + 1));
  return object3(value) && Object.entries(value).every(([k, v]) => safe2(k) && validJson(v, depth + 1));
}
function validPatch(patch, depth = 0) {
  if (!object3(patch) || depth > 40) return false;
  if (patch.legacyEffect) return Object.keys(patch).length === 1 && object3(patch.legacyEffect.fields) && validPatch(patch.legacyEffect, depth + 1);
  if (Object.hasOwn(patch, "value")) return Object.keys(patch).length === 1 && validJson(patch.value);
  if (patch.remove === true) return Object.keys(patch).length === 1;
  if (object3(patch.fields)) return Object.keys(patch).length === 1 && Object.entries(patch.fields).every(([k, v]) => safe2(k) && validPatch(v, depth + 1));
  const l = patch.list;
  return Object.keys(patch).length === 1 && object3(l) && Object.keys(l).every((k) => ["edits", "removed", "added", "order"].includes(k)) && object3(l.edits) && Object.entries(l.edits).every(([k, v]) => id2(k) && validPatch(v, depth + 1)) && Array.isArray(l.removed) && l.removed.every(id2) && keyed(l.added) && validJson(l.added) && (l.order === null || Array.isArray(l.order) && l.order.every(id2));
}
var diagnostic = (path, value, rule) => path + " \uAC12 " + valueLabel(value) + ". " + rule + ".";
var idRule = "ID\uB294 1~199\uC790\uC758 \uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD558\uBA70 \uC608\uC57D ID __proto__, constructor, prototype\uC740 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4";
function jsonDiagnostic(value, path, depth = 0) {
  if (depth > 40) return diagnostic(path + " \uC911\uCCA9 \uAE4A\uC774", depth, "40 \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  if (value === null || ["string", "boolean"].includes(typeof value)) return null;
  if (typeof value === "number") return Number.isFinite(value) ? null : diagnostic(path, value, "JSON \uC22B\uC790\uB294 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) if (index in value) {
      const detail = jsonDiagnostic(value[index], path + " " + (index + 1) + "\uBC88", depth + 1);
      if (detail) return detail;
    }
    return null;
  }
  if (object3(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (!safe2(key)) return diagnostic(path + " \uAC1D\uCCB4 \uD0A4", key, "\uC608\uC57D \uD0A4 __proto__, constructor, prototype\uC740 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
      const detail = jsonDiagnostic(item, path + "." + valueLabel(key), depth + 1);
      if (detail) return detail;
    }
    return null;
  }
  return diagnostic(path, value, "null, \uBB38\uC790\uC5F4, true/false, \uC720\uD55C\uD55C \uC22B\uC790, \uBC30\uC5F4 \uB610\uB294 \uAC1D\uCCB4\uC778 JSON \uAC12\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
}
function patchDiagnostic(patch, path, depth = 0) {
  if (!object3(patch)) return diagnostic(path, patch, "\uBCC0\uACBD \uB0B4\uC6A9\uC744 \uB098\uD0C0\uB0B4\uB294 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  if (depth > 40) return diagnostic(path + " \uC911\uCCA9 \uAE4A\uC774", depth, "40 \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  const keys = Object.keys(patch);
  if (keys.length !== 1) return diagnostic(path + " \uBCC0\uACBD \uD615\uD0DC \uC218 (" + keys.map(valueLabel).join(", ") + ")", keys.length, "value, remove, fields, list, legacyEffect \uC911 \uD558\uB098\uC758 \uD615\uD0DC\uB9CC \uC788\uC5B4\uC57C \uD569\uB2C8\uB2E4 (\uD544\uB4DC 1\uAC1C)");
  if (patch.legacyEffect) {
    if (!object3(patch.legacyEffect.fields)) return diagnostic(path + ".legacyEffect.fields", patch.legacyEffect.fields, "\uC774\uC804 \uC774\uD399\uD2B8\uC758 \uD544\uB4DC \uBCC0\uACBD \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    return patchDiagnostic(patch.legacyEffect, path + ".legacyEffect", depth + 1);
  }
  if (Object.hasOwn(patch, "value")) return jsonDiagnostic(patch.value, path + ".value");
  if (patch.remove === true) return null;
  if (object3(patch.fields)) {
    for (const [key, change] of Object.entries(patch.fields)) {
      if (!safe2(key)) return diagnostic(path + ".fields \uBCC0\uACBD \uD0A4", key, "\uC608\uC57D \uD0A4 __proto__, constructor, prototype\uC740 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
      const detail = patchDiagnostic(change, path + ".fields." + valueLabel(key), depth + 1);
      if (detail) return detail;
    }
    return null;
  }
  if (Object.hasOwn(patch, "remove")) return diagnostic(path + ".remove", patch.remove, "\uC0AD\uC81C \uBCC0\uACBD\uC740 true\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  if (Object.hasOwn(patch, "fields")) return diagnostic(path + ".fields", patch.fields, "\uD544\uB4DC\uBCC4 \uBCC0\uACBD \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  if (!Object.hasOwn(patch, "list")) return diagnostic(path + " \uBCC0\uACBD \uD615\uD0DC", keys[0], "value, remove, fields, list, legacyEffect \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  const list2 = patch.list, location = path + ".list";
  if (!object3(list2)) return diagnostic(location, list2, "edits, removed, added, order\uAC00 \uC788\uB294 \uBAA9\uB85D \uBCC0\uACBD \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  for (const key of Object.keys(list2)) if (!["edits", "removed", "added", "order"].includes(key)) return diagnostic(location + " \uD544\uB4DC", key, "edits, removed, added, order\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4");
  if (!object3(list2.edits)) return diagnostic(location + ".edits", list2.edits, "\uC218\uC815\uD560 \uD56D\uBAA9 ID\uB97C \uD0A4\uB85C \uD558\uB294 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  for (const [index, [key, change]] of Object.entries(list2.edits).entries()) {
    const item = location + ".edits " + (index + 1) + "\uBC88 (ID " + valueLabel(key) + ")";
    if (!id2(key)) return diagnostic(item + " \uC218\uC815 \uD56D\uBAA9 ID", key, idRule);
    const detail = patchDiagnostic(change, item, depth + 1);
    if (detail) return detail;
  }
  if (!Array.isArray(list2.removed)) return diagnostic(location + ".removed", list2.removed, "\uC0AD\uC81C\uD560 ID \uBB38\uC790\uC5F4\uC758 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
  for (let index = 0; index < list2.removed.length; index++) if (index in list2.removed && !id2(list2.removed[index])) return diagnostic(location + ".removed " + (index + 1) + "\uBC88 \uC0AD\uC81C ID", list2.removed[index], idRule);
  if (!Array.isArray(list2.added)) return diagnostic(location + ".added", list2.added, "\uCD94\uAC00\uD560 \uD56D\uBAA9 \uAC1D\uCCB4\uC758 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
  for (let index = 0; index < list2.added.length; index++) if (index in list2.added) {
    const item = list2.added[index], itemPath = location + ".added " + (index + 1) + "\uBC88 (ID " + valueLabel(item?.id) + ")";
    if (!object3(item)) return diagnostic(itemPath, item, "\uC720\uD6A8\uD55C ID\uAC00 \uC788\uB294 \uCD94\uAC00 \uD56D\uBAA9 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    if (!id2(item.id)) return diagnostic(itemPath + " \uCD94\uAC00 \uD56D\uBAA9 ID", item.id, idRule);
  }
  const jsonProblem = jsonDiagnostic(list2.added, location + ".added");
  if (jsonProblem) return jsonProblem;
  if (list2.order !== null) {
    if (!Array.isArray(list2.order)) return diagnostic(location + ".order", list2.order, "\uAE30\uC874 \uC21C\uC11C \uC720\uC9C0\uB294 null, \uC0C8 \uC21C\uC11C\uB294 ID \uBB38\uC790\uC5F4\uC758 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
    for (let index = 0; index < list2.order.length; index++) if (index in list2.order && !id2(list2.order[index])) return diagnostic(location + ".order " + (index + 1) + "\uBC88 \uC21C\uC11C ID", list2.order[index], idRule);
  }
  return null;
}
function variantDiagnostic(card, cards) {
  const variant = card.variant;
  if (!object3(variant)) return diagnostic("Variant \uC815\uBCF4", variant, "\uC6D0\uBCF8 ID, \uB77C\uBCA8, ID \uB300\uC751\uD45C, \uBCC0\uACBD \uB0B4\uC6A9\uC744 \uAC00\uC9C4 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  if (!id2(variant.parentId)) return diagnostic("\uC6D0\uBCF8 \uCE74\uB4DC ID", variant.parentId, idRule);
  if (!cards.has(variant.parentId)) return diagnostic("\uC6D0\uBCF8 \uCE74\uB4DC ID", variant.parentId, "\uC774 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uC874\uC7AC\uD558\uB294 \uCE74\uB4DC ID\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  if (cards.get(variant.parentId).kind !== card.kind) return diagnostic("\uCE74\uB4DC \uC885\uB958", card.kind, "\uC6D0\uBCF8 \uCE74\uB4DC ID " + valueLabel(variant.parentId) + "\uC758 \uC885\uB958 " + valueLabel(cards.get(variant.parentId).kind) + "\uC640 \uAC19\uC544\uC57C \uD569\uB2C8\uB2E4");
  if (typeof variant.label !== "string") return diagnostic("Variant \uB77C\uBCA8", variant.label, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
  if (variant.label.length > 120) return diagnostic("Variant \uB77C\uBCA8 \uAE38\uC774", variant.label.length, "120\uC790 \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  if (!object3(variant.ids)) return diagnostic("ID \uB300\uC751\uD45C", variant.ids, "\uC6D0\uBCF8 ID\uB97C \uD0A4\uB85C \uD558\uACE0 \uC0C8 ID\uB97C \uAC12\uC73C\uB85C \uD558\uB294 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  for (const [index, [key, value]] of Object.entries(variant.ids).entries()) {
    const location = "ID \uB300\uC751 " + (index + 1) + "\uBC88 (\uC6D0\uBCF8 ID " + valueLabel(key) + ")";
    if (!id2(key)) return diagnostic(location + " \uC6D0\uBCF8 ID", key, idRule);
    if (!id2(value)) return diagnostic(location + " \uC0C8 ID", value, idRule);
  }
  if (!object3(variant.overrides)) return diagnostic("\uBCC0\uACBD \uB0B4\uC6A9", variant.overrides, "\uBCC0\uACBD\uD560 \uCE74\uB4DC \uD56D\uBAA9\uC744 \uD0A4\uB85C \uD558\uB294 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  for (const [index, [key, patch]] of Object.entries(variant.overrides).entries()) {
    const path = "\uBCC0\uACBD \uB0B4\uC6A9 " + (index + 1) + "\uBC88 " + valueLabel(key);
    if (!VARIANT_FIELDS.includes(key)) return diagnostic(path + " \uBCC0\uACBD \uD56D\uBAA9", key, VARIANT_FIELDS.join(", ") + " \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    if (!validPatch(patch)) return patchDiagnostic(patch, path);
  }
  return null;
}
function validateVariants(project) {
  const problems2 = [], cards = new Map(project.cards.filter(object3).map((c) => [c.id, c]));
  const bad = (card, detail) => problems2.push({ code: "variant", message: cardProblemLabel(card) + " (\uCE74\uB4DC " + (project.cards.indexOf(card) + 1) + "\uBC88, ID " + valueLabel(card.id) + ") \xB7 Variant: " + detail, cardId: card.id });
  for (const card of cards.values()) {
    const v = card.variant;
    if (v === void 0) continue;
    if (!object3(v) || !id2(v.parentId) || !cards.has(v.parentId) || cards.get(v.parentId).kind !== card.kind || typeof v.label !== "string" || v.label.length > 120 || !object3(v.ids) || !Object.entries(v.ids).every(([k, value]) => id2(k) && id2(value)) || !object3(v.overrides) || !Object.entries(v.overrides).every(([k, patch]) => VARIANT_FIELDS.includes(k) && validPatch(patch))) {
      bad(card, variantDiagnostic(card, cards));
      continue;
    }
    const seen = /* @__PURE__ */ new Set([card.id]), chain = [card.id];
    let parent = cards.get(v.parentId);
    while (parent) {
      if (seen.has(parent.id)) {
        const order = chain.length <= 8 ? chain : [...chain.slice(0, 4), "\u2026", ...chain.slice(-3)];
        bad(card, diagnostic("\uC21C\uD658 \uC5F0\uACB0\uC758 \uBC18\uBCF5 \uCE74\uB4DC ID", parent.id, "\uC6D0\uBCF8 \uC5F0\uACB0\uC740 \uC21C\uD658\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD604\uC7AC \uC5F0\uACB0 \uC21C\uC11C: " + [...order, parent.id].map(valueLabel).join(" \u2192 ")));
        break;
      }
      seen.add(parent.id);
      chain.push(parent.id);
      parent = cards.get(parent.variant?.parentId);
    }
  }
  return problems2;
}

// src/model/text-style.js
var TEXT_STYLE_DEFAULTS = Object.freeze({ fontPt: 9, fontWeight: 400, fontStyle: "normal", letterSpacingMm: 0, lineHeight: 1.22, align: "left", underline: false });
var TEXT_STYLE_KEYS = Object.freeze(Object.keys(TEXT_STYLE_DEFAULTS));
function textStyleProblems(style) {
  if (!style || typeof style !== "object" || Array.isArray(style)) return [];
  const problems2 = [], finite2 = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  const check = (key, label, valid, rule) => {
    if (style[key] !== void 0 && !valid(style[key])) problems2.push({ key, label, value: style[key], rule });
  };
  check("fontPt", "\uAE00\uC790 \uD06C\uAE30", (v) => finite2(v, 0.01, Infinity), "0.01 pt \uC774\uC0C1\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  check("fontWeight", "\uAE00\uC790 \uAD75\uAE30", (v) => finite2(v, 100, 1e3), "100~1000\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  check("fontStyle", "\uAE30\uC6B8\uC784", (v) => ["normal", "italic"].includes(v), "normal \uB610\uB294 italic\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
  check("letterSpacingMm", "\uC790\uAC04", (v) => finite2(v, -1, 5), "-1~5 mm\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  check("lineHeight", "\uC904 \uAC04\uACA9", (v) => finite2(v, 0.8, 4), "0.8~4\uBC30\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  check("align", "\uAE00\uC790 \uC815\uB82C", (v) => ["left", "center", "right"].includes(v), "left, center, right \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  check("underline", "\uBC11\uC904", (v) => typeof v === "boolean", "true \uB610\uB294 false\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  return problems2;
}

// src/render/text.js
var PT_MM = 25.4 / 72;
var segmenter2 = new Intl.Segmenter("ko", { granularity: "grapheme" });

// src/model/card-templates.js
var object4 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var safe3 = (k) => !["__proto__", "constructor", "prototype"].includes(k);
var id3 = (v) => typeof v === "string" && v.length > 0 && v.length < 200 && safe3(v);
var finite = (v, min = -Infinity, max = Infinity) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
var own = (value, key) => object4(value) && Object.hasOwn(value, key);
var pick = (value, keys) => Object.fromEntries(keys.filter((key) => own(value, key)).map((key) => [key, clone(value[key])]));
var STYLE_KEYS = [...TEXT_STYLE_KEYS, "color", "fill", "strokeWidthMm", "fit", "cropX", "cropY", "visualEffects"];
var NAME_STYLE_KEYS = [...TEXT_STYLE_KEYS, "color", "visualEffects"];
var BINDINGS = { name: "text", hp: "text", art: "image", "item.effect": "text", "item.keywords": "keywords", "skill.name": "text", "skill.effect": "text", "skill.dice": "dice", "skill.keywords": "keywords" };
var roleKey = (role) => role.kind + ":" + role.index;
var dataUrl = (value, mime) => typeof value === "string" && value.startsWith("data:" + mime + ";base64,") && /^[A-Za-z0-9+/]+=*$/.test(value.slice(value.indexOf(",") + 1));
function validateCardTemplates(list2) {
  if (list2 === void 0) return [];
  const problems2 = [], bad = (path, message) => problems2.push({ code: "card-template", message: path + ": " + message });
  const shape = (value, keys, path) => {
    if (!object4(value)) {
      bad(path, "\uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
      return false;
    }
    for (const key of Object.keys(value)) if (!keys.includes(key)) bad(path, "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD56D\uBAA9 \u201C" + key + "\u201D\uC774 \uC788\uC2B5\uB2C8\uB2E4.");
    return true;
  };
  if (!Array.isArray(list2)) {
    bad("\uB0B4 \uCE74\uB4DC \uC11C\uC2DD \uBAA9\uB85D", "\uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
    return problems2;
  }
  const ids = /* @__PURE__ */ new Set();
  for (const [index, saved] of list2.entries()) {
    const path = "\uB0B4 \uCE74\uB4DC \uC11C\uC2DD " + (index + 1) + "\uBC88";
    if (!shape(saved, ["id", "name", "kind", "recipe", "assets", "paintings"], path)) continue;
    if (!id3(saved.id) || ids.has(saved.id)) bad(path, "\uC11C\uB85C \uB2E4\uB978 \uC720\uD6A8\uD55C \uC11C\uC2DD ID\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
    ids.add(saved.id);
    if (typeof saved.name !== "string" || !saved.name.trim() || saved.name !== saved.name.trim() || saved.name.length > 120 || /[\r\n]/.test(saved.name)) bad(path, "\uC774\uB984\uC740 \uC55E\uB4A4 \uACF5\uBC31\uACFC \uC904\uBC14\uAFC8 \uC5C6\uC774 1~120\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
    if (!["monster", "item"].includes(saved.kind)) bad(path, "\uCE74\uB4DC \uC885\uB958\uB294 monster \uB610\uB294 item\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
    const recipe = saved.recipe;
    if (!shape(recipe, ["widthMm", "heightMm", "autoSkillLayout", "elements", "skillStyles", "visualEffects"], path + " \uB514\uC790\uC778")) continue;
    for (const field of ["widthMm", "heightMm"]) if (!finite(recipe[field], 0.01)) bad(path, "\uCE74\uB4DC \uD06C\uAE30\uB294 0.01 mm \uC774\uC0C1\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
    if (typeof recipe.autoSkillLayout !== "boolean") bad(path, "\uAE30\uC220 \uC790\uB3D9 \uB9DE\uCDA4\uC740 true \uB610\uB294 false\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
    const assets = object4(saved.assets) ? saved.assets : {}, paintings = object4(saved.paintings) ? saved.paintings : {};
    if (!object4(saved.assets)) bad(path, "\uADF8\uB9BC \uC790\uB8CC\uB294 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
    if (!object4(saved.paintings)) bad(path, "\uADF8\uB9BC \uC6D0\uBCF8\uC740 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
    const referenced = /* @__PURE__ */ new Set(), effect = (value, target, location) => {
      for (const problem of validateVisualEffects(value, target)) bad(location, problem.message);
      for (const layer of Array.isArray(value?.layers) ? value.layers : []) if (layer?.params?.assetId !== null && layer?.params?.assetId !== void 0) {
        const assetId = layer.params.assetId;
        referenced.add(assetId);
        if (!id3(assetId) || !Object.hasOwn(assets, assetId)) bad(location, "\uC774\uD399\uD2B8 \uADF8\uB9BC\uC774 \uC11C\uC2DD \uC790\uB8CC\uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4.");
      }
    };
    const style = (value, location, target = "text", name = false) => {
      if (!shape(value, name ? NAME_STYLE_KEYS : STYLE_KEYS, location)) return;
      for (const problem of textStyleProblems(value)) bad(location, problem.label + " " + problem.rule + ".");
      for (const key of ["color", "fill"]) if (value[key] !== void 0 && (typeof value[key] !== "string" || value[key].length > 120)) bad(location, "\uC0C9\uC740 120\uC790 \uC774\uB0B4 \uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
      if (name && value.color !== void 0 && !/^#[0-9a-f]{6}$/i.test(value.color)) bad(location, "\uC774\uB984 \uC0C9\uC740 #RRGGBB \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
      if (value.strokeWidthMm !== void 0 && !finite(value.strokeWidthMm, 0)) bad(location, "\uC120 \uAD75\uAE30\uB294 0 \uC774\uC0C1\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
      if (value.fit !== void 0 && !["contain", "cover"].includes(value.fit)) bad(location, "\uADF8\uB9BC \uB9DE\uCDA4\uC740 contain \uB610\uB294 cover\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
      for (const key of ["cropX", "cropY"]) if (value[key] !== void 0 && !finite(value[key], 0, 1)) bad(location, "\uADF8\uB9BC \uC790\uB974\uAE30 \uC704\uCE58\uB294 0~1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
      if (value.visualEffects !== void 0) {
        if (!["text", "image", "effect"].includes(target)) bad(location, "\uC774 \uC694\uC18C\uC5D0\uB294 \uC774\uD399\uD2B8\uB97C \uC801\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        else effect(value.visualEffects, target, location + " \uC774\uD399\uD2B8");
      }
    };
    const role = (value, location) => {
      if (!shape(value, ["kind", "index"], location)) return;
      if (!["passive", "active"].includes(value.kind) || !Number.isSafeInteger(value.index) || value.index < 0) bad(location, "\uAE30\uC220 \uC5F0\uACB0\uC5D0\uB294 passive \uB610\uB294 active \uC885\uB958\uC640 0 \uC774\uC0C1\uC758 \uC21C\uC11C\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
    };
    if (recipe.visualEffects !== void 0) effect(recipe.visualEffects, "frame", path + " \uD504\uB808\uC784");
    if (!Array.isArray(recipe.elements)) bad(path, "\uC694\uC18C \uBAA9\uB85D\uC740 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
    else for (const [i, e] of recipe.elements.entries()) {
      const location = path + " \uC694\uC18C " + (i + 1) + "\uBC88";
      if (!shape(e, ["type", "rect", "style", "binding", "content", "assetId", "dice"], location)) continue;
      if (!ELEMENT_TYPES.includes(e.type)) bad(location, "\uC9C0\uC6D0\uD558\uB294 \uC694\uC18C \uC885\uB958\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
      if (shape(e.rect, ["x", "y", "w", "h"], location + " \uC704\uCE58\xB7\uD06C\uAE30")) {
        for (const key of ["x", "y", "w", "h"]) if (!finite(e.rect[key], ["w", "h"].includes(key) ? 0.01 : -Infinity)) bad(location, "\uC704\uCE58\uC640 \uD06C\uAE30\uB294 \uC720\uD55C\uD55C mm \uAC12\uC774\uBA70 \uD3ED\uACFC \uB192\uC774\uB294 0.01 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
      }
      style(e.style, location + " \uC2A4\uD0C0\uC77C", e.type);
      if (e.binding !== null) {
        if (shape(e.binding, ["field", "skill"], location + " \uC5F0\uACB0")) {
          const field = e.binding.field;
          if (BINDINGS[field] !== e.type) bad(location, "\uC5F0\uACB0 \uD544\uB4DC\uC640 \uC694\uC18C \uC885\uB958\uAC00 \uC77C\uCE58\uD574\uC57C \uD569\uB2C8\uB2E4.");
          if (typeof field === "string" && field.startsWith("skill.")) {
            role(e.binding.skill, location + " \uAE30\uC220 \uC5F0\uACB0");
            if (saved.kind !== "monster") bad(location, "\uBAAC\uC2A4\uD130\uB9CC \uAE30\uC220\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
          } else if (e.binding.skill !== void 0) bad(location, "\uAE30\uC220 \uC774\uC678\uC758 \uC5F0\uACB0\uC5D0\uB294 \uAE30\uC220 \uC21C\uC11C\uB97C \uB123\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
          if (field === "hp" && saved.kind !== "monster" || typeof field === "string" && field.startsWith("item.") && saved.kind !== "item") bad(location, "\uC5F0\uACB0 \uD544\uB4DC\uAC00 \uC11C\uC2DD\uC758 \uCE74\uB4DC \uC885\uB958\uC640 \uB2E4\uB985\uB2C8\uB2E4.");
        }
        if (["content", "assetId", "dice"].some((key) => own(e, key))) bad(location, "\uCE74\uB4DC \uC815\uBCF4\uC5D0 \uC5F0\uACB0\uB41C \uC694\uC18C\uC5D0\uB294 \uC6D0\uBCF8 \uCE74\uB4DC \uB0B4\uC6A9\uC744 \uC800\uC7A5\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      } else {
        if (e.content !== void 0 && (e.type !== "text" || typeof e.content !== "string")) bad(location, "\uC7A5\uC2DD \uBB38\uAD6C\uB294 \uC790\uC720 \uAE00\uC790\uC758 \uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
        if (e.assetId !== void 0) {
          if (e.type !== "image") bad(location, "\uC7A5\uC2DD \uADF8\uB9BC\uC740 \uC790\uC720 \uC774\uBBF8\uC9C0\uC5D0\uB9CC \uC5F0\uACB0\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
          else if (e.assetId !== null) {
            referenced.add(e.assetId);
            if (!id3(e.assetId) || !Object.hasOwn(assets, e.assetId)) bad(location, "\uC7A5\uC2DD \uADF8\uB9BC\uC774 \uC11C\uC2DD \uC790\uB8CC\uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4.");
          }
        }
        if (e.dice !== void 0) {
          if (e.type !== "dice") bad(location, "\uC790\uC720 \uC8FC\uC0AC\uC704\uB9CC \uC870\uAC74\uC744 \uB2F4\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
          else if (e.dice === null) continue;
          else if (!shape(e.dice, ["faces", "text", "color"], location + " \uC7A5\uC2DD \uC8FC\uC0AC\uC704")) bad(location, "\uC790\uC720 \uC8FC\uC0AC\uC704\uB9CC \uC870\uAC74\uC744 \uB2F4\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
          else if (!Array.isArray(e.dice.faces) || !e.dice.faces.every((v) => Number.isInteger(v) && v >= 1 && v <= 6) || new Set(e.dice.faces).size !== e.dice.faces.length || typeof e.dice.text !== "string" || typeof e.dice.color !== "string") bad(location, "\uC7A5\uC2DD \uC8FC\uC0AC\uC704\uC5D0\uB294 \uC911\uBCF5 \uC5C6\uB294 1~6 \uB208\uACFC \uBB38\uC790\uC5F4 \uBB38\uAD6C\xB7\uC0C9\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
        }
      }
      if (e.type === "rank" && saved.kind !== "monster") bad(location, "\uB4F1\uAE09 \uD45C\uC2DC\uB294 \uBAAC\uC2A4\uD130 \uC11C\uC2DD\uC5D0\uB9CC \uC800\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    }
    const skillRoles = /* @__PURE__ */ new Set();
    if (!Array.isArray(recipe.skillStyles)) bad(path, "\uAE30\uC220 \uC774\uB984 \uC2A4\uD0C0\uC77C\uC740 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
    else for (const [i, entry] of recipe.skillStyles.entries()) {
      const location = path + " \uAE30\uC220 \uC774\uB984 \uC2A4\uD0C0\uC77C " + (i + 1) + "\uBC88";
      if (!shape(entry, ["kind", "index", "nameStyle"], location)) continue;
      role(pick(entry, ["kind", "index"]), location);
      const key = roleKey(entry);
      if (skillRoles.has(key)) bad(location, "\uAC19\uC740 \uAE30\uC220 \uC21C\uC11C\uB97C \uB450 \uBC88 \uC800\uC7A5\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      skillRoles.add(key);
      if (entry.nameStyle !== void 0) style(entry.nameStyle, location, "text", true);
    }
    const originals = /* @__PURE__ */ new Set();
    for (const [key, a] of Object.entries(assets)) {
      const location = path + " \uADF8\uB9BC " + key;
      if (!shape(a, ["id", "mime", "dataUrl", "width", "height", "paintingId"], location)) continue;
      if (!id3(key) || a.id !== key) bad(location, "\uADF8\uB9BC \uC790\uB8CC \uD0A4\uC640 \uC720\uD6A8\uD55C ID\uAC00 \uAC19\uC544\uC57C \uD569\uB2C8\uB2E4.");
      if (!referenced.has(key)) bad(location, "\uC11C\uC2DD\uC5D0\uC11C \uC0AC\uC6A9\uD558\uC9C0 \uC54A\uB294 \uADF8\uB9BC \uC790\uB8CC\uC785\uB2C8\uB2E4.");
      if (!["image/png", "image/jpeg", "image/webp"].includes(a.mime) || !dataUrl(a.dataUrl, a.mime)) bad(location, "PNG/JPEG/WebP \uD615\uC2DD\uACFC \uC77C\uCE58\uD558\uB294 base64 \uADF8\uB9BC\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
      if (!Number.isSafeInteger(a.width) || a.width < 1 || !Number.isSafeInteger(a.height) || a.height < 1) bad(location, "\uADF8\uB9BC \uD06C\uAE30\uB294 1 px \uC774\uC0C1\uC758 \uC548\uC804\uD55C \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
      if (a.paintingId !== null) {
        originals.add(a.paintingId);
        if (!id3(a.paintingId) || !Object.hasOwn(paintings, a.paintingId)) bad(location, "\uD3B8\uC9D1 \uAC00\uB2A5\uD55C \uADF8\uB9BC \uC6D0\uBCF8\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      }
    }
    for (const [key, d] of Object.entries(paintings)) {
      const location = path + " \uADF8\uB9BC \uC6D0\uBCF8 " + key;
      if (!shape(d, ["id", "width", "height", "activeLayerId", "layers"], location)) continue;
      if (!id3(key) || d.id !== key || !originals.has(key)) bad(location, "\uC0AC\uC6A9\uD558\uB294 \uADF8\uB9BC \uC6D0\uBCF8\uC758 \uC790\uB8CC \uD0A4\uC640 ID\uAC00 \uAC19\uC544\uC57C \uD569\uB2C8\uB2E4.");
      if (!Number.isInteger(d.width) || d.width < 64 || d.width > 4096 || !Number.isInteger(d.height) || d.height < 64 || d.height > 4096) bad(location, "\uC6D0\uBCF8 \uD06C\uAE30\uB294 64~4096 px\uC758 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
      if (!Array.isArray(d.layers) || !d.layers.length) {
        bad(location, "\uADF8\uB9BC \uB808\uC774\uC5B4\uAC00 1\uC7A5 \uC774\uC0C1 \uD544\uC694\uD569\uB2C8\uB2E4.");
        continue;
      }
      const layers = /* @__PURE__ */ new Set();
      for (const layer of d.layers) {
        if (!shape(layer, ["id", "name", "visible", "locked", "opacity", "blendMode", "png"], location + " \uB808\uC774\uC5B4")) continue;
        if (!id3(layer.id) || layers.has(layer.id)) bad(location, "\uB808\uC774\uC5B4 ID\uB294 \uC720\uD6A8\uD558\uACE0 \uC11C\uB85C \uB2EC\uB77C\uC57C \uD569\uB2C8\uB2E4.");
        layers.add(layer.id);
        if (typeof layer.name !== "string" || typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean" || !finite(layer.opacity, 0, 1) || layer.blendMode !== void 0 && !isBlendMode(layer.blendMode) || !dataUrl(layer.png, "image/png")) bad(location, "\uADF8\uB9BC \uB808\uC774\uC5B4\uC758 \uC774\uB984\xB7\uD45C\uC2DC\xB7\uC7A0\uAE08\xB7\uBD88\uD22C\uBA85\uB3C4\xB7\uD63C\uD569 \uBAA8\uB4DC\xB7PNG\uB97C \uD655\uC778\uD558\uC138\uC694.");
      }
      if (!layers.has(d.activeLayerId)) bad(location, "\uC120\uD0DD \uB808\uC774\uC5B4\uAC00 \uADF8\uB9BC \uC6D0\uBCF8\uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
  }
  return problems2;
}

// src/model/project.js
function createProject() {
  const p = {
    format: "card-print-studio",
    version: 1,
    name: "\uB098\uC758 \uCE74\uB4DC \uB371",
    settings: { cardWidthMm: 63, cardHeightMm: 88, maxWidthMm: 63, maxHeightMm: 88, minFontPt: 7, rankRules: Object.fromEntries(RANKS.map((r, i) => [r, { baseHp: [100, 220, 340, 460][i], hpCap: null }])) },
    keywords: [],
    visualEffectPresets: [],
    cardTemplates: [],
    cards: [],
    back: { elements: [] },
    assets: {},
    paintings: {},
    print: { effectFrameSec: 1.2, paper: "A4", orientation: "portrait", marginMm: 6, gapMm: 4, duplex: false, flip: "long", backOffsetXmm: 0, backOffsetYmm: 0, cropMarks: true }
  };
  p.cards.push(createCard("monster", p));
  return p;
}
function createCard(kind, p) {
  const card = { id: newId(), kind, name: kind === "monster" ? "\uC0C8 \uBAAC\uC2A4\uD130" : "\uC0C8 \uC544\uC774\uD15C", quantity: 1, artAssetId: null, autoSkillLayout: true, template: kind === "monster" ? "monster-standard" : "item", elements: [] };
  if (kind === "monster") Object.assign(card, { rank: "C", attribute: "neutral", baseHp: p.settings.rankRules.C.baseHp, hpReduction: 0, passives: [], actives: [] });
  else if (kind === "item") Object.assign(card, { effect: "", keywords: [] });
  else throw new Error("\uCE74\uB4DC \uC885\uB958\uB97C \uD655\uC778\uD558\uC138\uC694.");
  return card;
}
var object5 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var number2 = (v, min = -Infinity) => typeof v === "number" && Number.isFinite(v) && v >= min;
var id4 = (v) => typeof v === "string" && v.length > 0 && v.length < 200 && !["__proto__", "constructor", "prototype"].includes(v);
var dataUrl2 = (v, mime) => typeof v === "string" && v.startsWith("data:" + mime + ";base64,") && /^[A-Za-z0-9+/]+=*$/.test(v.slice(v.indexOf(",") + 1));
function validateProject(p) {
  const errors = [];
  const bad = (code, message, extra = {}) => errors.push({ code, message, ...extra });
  const invalid = (code, context, field, value, rule, extra = {}) => bad(code, (context ? context + ": " : "") + field + " \uAC12 " + valueLabel(value) + ". " + rule + ".", extra);
  const idRule2 = "ID\uB294 1~199\uC790\uC758 \uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD558\uBA70 __proto__, constructor, prototype\uC740 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4";
  if (!object5(p)) {
    invalid("file-version", "", "\uD504\uB85C\uC81D\uD2B8 \uD30C\uC77C", p, "\uCE74\uB4DC \uD504\uB85C\uC81D\uD2B8 \uAC1D\uCCB4(format: card-print-studio, version: 1)\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4");
    return errors;
  }
  if (p.format !== "card-print-studio" || p.version !== 1) {
    if (p.format !== "card-print-studio") invalid("file-version", "", "\uD30C\uC77C \uD615\uC2DD", p.format, "card-print-studio\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    if (p.version !== 1) invalid("file-version", "", "\uD30C\uC77C \uBC84\uC804", p.version, "\uC9C0\uC6D0\uD558\uB294 \uBC84\uC804\uC740 \uC22B\uC790 1\uC785\uB2C8\uB2E4");
    return errors;
  }
  if (typeof p.name !== "string") invalid("deck-name", "", "\uB371 \uC774\uB984", p.name, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
  const s = p.settings;
  if (!object5(s)) {
    invalid("settings", "", "\uD504\uB85C\uC81D\uD2B8 \uC124\uC815", s, "\uC124\uC815 \uAC1D\uCCB4\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4");
    return errors;
  }
  for (const [key, label, unit] of [["cardWidthMm", "\uCE74\uB4DC \uD3ED", "mm"], ["cardHeightMm", "\uCE74\uB4DC \uB192\uC774", "mm"], ["maxWidthMm", "\uCD5C\uB300 \uCE74\uB4DC \uD3ED", "mm"], ["maxHeightMm", "\uCD5C\uB300 \uCE74\uB4DC \uB192\uC774", "mm"], ["minFontPt", "\uCD5C\uC18C \uAE00\uC790 \uD06C\uAE30", "pt"]])
    if (!number2(s[key], 0.01)) invalid("dimension", "", label, s[key], "0.01 " + unit + " \uC774\uC0C1\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  if (s.cardWidthMm > s.maxWidthMm) invalid("max-size", "", "\uCE74\uB4DC \uD3ED", s.cardWidthMm, "\uC124\uC815\uD55C \uCD5C\uB300 \uD3ED " + valueLabel(s.maxWidthMm) + " mm \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  if (s.cardHeightMm > s.maxHeightMm) invalid("max-size", "", "\uCE74\uB4DC \uB192\uC774", s.cardHeightMm, "\uC124\uC815\uD55C \uCD5C\uB300 \uB192\uC774 " + valueLabel(s.maxHeightMm) + " mm \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  for (const rank of RANKS) {
    const rule = s.rankRules?.[rank], context = "\uB4F1\uAE09 " + rank;
    if (!object5(rule)) {
      invalid("rank-rule", context, "\uCCB4\uB825 \uAE30\uC900", rule, "\uAE30\uBCF8 HP\uC640 HP \uC0C1\uD55C\uC774 \uC788\uB294 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
      continue;
    }
    if (!number2(rule.baseHp, 0)) invalid("rank-rule", context, "\uAE30\uBCF8 HP", rule.baseHp, "0 \uC774\uC0C1\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    if (!(rule.hpCap === null || number2(rule.hpCap, 0))) invalid("rank-rule", context, "HP \uC0C1\uD55C", rule.hpCap, "\uC81C\uD55C \uC5C6\uC74C\uC740 null, \uC0C1\uD55C\uC740 0 \uC774\uC0C1\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  }
  const print = p.print;
  if (!object5(print)) invalid("print-settings", "", "\uC778\uC1C4 \uC124\uC815", print, "\uC778\uC1C4 \uC124\uC815 \uAC1D\uCCB4\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4");
  else {
    for (const [key, label, choices] of [["paper", "\uC6A9\uC9C0", ["A4", "Letter"]], ["orientation", "\uC6A9\uC9C0 \uBC29\uD5A5", ["portrait", "landscape"]], ["flip", "\uC591\uBA74 \uB4A4\uC9D1\uAE30", ["long", "short"]]])
      if (!choices.includes(print[key])) invalid("print-settings", "\uC778\uC1C4", label, print[key], choices.join(" \uB610\uB294 ") + "\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    for (const [key, label] of [["duplex", "\uC591\uBA74 \uC778\uC1C4"], ["cropMarks", "\uC7AC\uB2E8\uC120 \uD45C\uC2DC"]])
      if (typeof print[key] !== "boolean") invalid("print-settings", "\uC778\uC1C4", label, print[key], "true \uB610\uB294 false\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    for (const [key, label] of [["marginMm", "\uC5EC\uBC31"], ["gapMm", "\uCE74\uB4DC \uAC04\uACA9"]])
      if (!number2(print[key], 0)) invalid("print-settings", "\uC778\uC1C4", label, print[key], "0 mm \uC774\uC0C1\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    for (const [key, label] of [["backOffsetXmm", "\uB4B7\uBA74 \uAC00\uB85C \uBCF4\uC815"], ["backOffsetYmm", "\uB4B7\uBA74 \uC138\uB85C \uBCF4\uC815"]])
      if (!number2(print[key])) invalid("print-settings", "\uC778\uC1C4", label, print[key], "mm \uB2E8\uC704\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  }
  if (print?.effectFrameSec !== void 0 && !number2(print.effectFrameSec, 0)) invalid("effect-frame", "", "\uC778\uC1C4 \uC774\uD399\uD2B8 \uC7A5\uBA74 \uC2DC\uAC04", print.effectFrameSec, "0\uCD08 \uC774\uC0C1\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  let structureInvalid = false;
  for (const [valid, label, value, rule] of [[Array.isArray(p.cards), "\uCE74\uB4DC \uBAA9\uB85D", p.cards, "\uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4"], [object5(p.back), "\uACF5\uD1B5 \uB4B7\uBA74", p.back, "\uC694\uC18C \uBAA9\uB85D\uC744 \uAC00\uC9C4 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4"], [object5(p.back) && Array.isArray(p.back.elements), "\uACF5\uD1B5 \uB4B7\uBA74 \uC694\uC18C \uBAA9\uB85D", p.back?.elements, "\uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4"], [object5(p.assets), "\uADF8\uB9BC \uC790\uB8CC", p.assets, "\uADF8\uB9BC ID\uB97C \uD0A4\uB85C \uD558\uB294 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4"], [object5(p.paintings), "\uADF8\uB9BC \uC6D0\uBCF8", p.paintings, "\uC6D0\uBCF8 ID\uB97C \uD0A4\uB85C \uD558\uB294 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4"]])
    if (!valid) {
      invalid("file-structure", "", label, value, rule);
      structureInvalid = true;
    }
  if (structureInvalid) return errors;
  errors.push(...validateVariants(p));
  const seen = /* @__PURE__ */ new Map();
  const checkId = (value, context, extra = {}) => {
    if (!id4(value)) invalid("duplicate-id", context, "ID", value, idRule2, extra);
    else if (seen.has(value)) invalid("duplicate-id", context, "ID", value, "\uC774\uBBF8 " + seen.get(value) + "\uC5D0\uC11C \uC0AC\uC6A9\uD55C \uC911\uBCF5 ID\uC785\uB2C8\uB2E4. \uC11C\uB85C \uB2E4\uB978 ID\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4", extra);
    if (!seen.has(value)) seen.set(value, context);
  };
  const assetRef = (value) => value === null || value === void 0 || id4(value) && Object.hasOwn(p.assets, value);
  const effectRecipe = (recipe, target, extra, context) => {
    errors.push(...validateVisualEffects(recipe, target).map((problem) => ({ ...problem, message: context + ": " + problem.message, ...extra })));
    for (const [index, layer] of (Array.isArray(recipe?.layers) ? recipe.layers : []).entries()) {
      const assetId = layer?.params?.assetId;
      if (layer?.kind === "sprite" && assetId !== null && assetId !== void 0 && !assetRef(assetId))
        invalid("asset-reference", context + " \xB7 \uCEE4\uC2A4\uD140 \uC785\uC790 \uB808\uC774\uC5B4 " + (index + 1) + " (ID " + valueLabel(layer.id) + ")", "\uADF8\uB9BC ID", assetId, "\uD504\uB85C\uC81D\uD2B8 \uADF8\uB9BC \uC790\uB8CC\uC5D0 \uC874\uC7AC\uD558\uB294 ID\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
    }
  };
  const textRanges = (owner, fields, extra, context) => {
    if (owner.textRanges === void 0) return;
    if (!object5(owner.textRanges)) {
      invalid("text-range", context, "\uAE00\uC790 \uAD6C\uAC04 \uBAA9\uB85D", owner.textRanges, "\uD14D\uC2A4\uD2B8 \uD544\uB4DC\uBCC4 \uBC30\uC5F4\uC744 \uAC00\uC9C4 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      return;
    }
    for (const [field, ranges] of Object.entries(owner.textRanges)) {
      const location = context + " \xB7 " + field + " \uAE00\uC790 \uAD6C\uAC04";
      if (!fields.includes(field)) {
        invalid("text-range", location, "\uD14D\uC2A4\uD2B8 \uD544\uB4DC", field, fields.join(", ") + " \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
        continue;
      }
      if (!Array.isArray(ranges)) {
        invalid("text-range", location, "\uAD6C\uAC04 \uBAA9\uB85D", ranges, "\uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
        continue;
      }
      const text2 = typeof owner[field] === "string" ? owner[field] : "", boundaries = new Set(textBoundaries(text2));
      let end = 0;
      for (const [index, r] of ranges.entries()) {
        const label = location + " " + (index + 1) + "\uBC88";
        if (!object5(r)) {
          invalid("text-range", label, "\uAD6C\uAC04", r, "ID, \uC2DC\uC791\xB7\uB05D \uC704\uCE58, \uC2A4\uD0C0\uC77C\uC744 \uAC00\uC9C4 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
          continue;
        }
        checkId(r.id, label, extra);
        if (!Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < end || r.end <= r.start || r.end > text2.length || !boundaries.has(r.start) || !boundaries.has(r.end))
          invalid("text-range", label, "\uC2DC\uC791\xB7\uB05D \uC704\uCE58", [r.start, r.end], "0~" + text2.length + " \uBC94\uC704\uC758 \uBB38\uC790 \uACBD\uACC4\uC5EC\uC57C \uD558\uBA70 \uC704\uCE58 \uC21C\uC11C\uB300\uB85C \uACB9\uCE58\uC9C0 \uC54A\uC544\uC57C \uD569\uB2C8\uB2E4", extra);
        if (Number.isInteger(r.end)) end = r.end;
        if (!object5(r.style)) {
          invalid("text-range", label, "\uAE00\uC790 \uC2A4\uD0C0\uC77C", r.style, "\uC2A4\uD0C0\uC77C \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
          continue;
        }
        if (r.style.color !== void 0 && (typeof r.style.color !== "string" || !/^#[0-9a-f]{6}$/i.test(r.style.color))) invalid("text-range", label, "\uAE00\uC790 \uC0C9", r.style.color, "#RRGGBB \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
        for (const problem of textStyleProblems(r.style)) invalid("text-range", label, problem.label, problem.value, problem.rule, extra);
        if (r.style.visualEffects !== void 0) effectRecipe(r.style.visualEffects, "text", extra, label);
      }
    }
  };
  if (p.visualEffectPresets !== void 0 && !Array.isArray(p.visualEffectPresets)) invalid("visual-effect-presets", "", "\uB0B4 \uC774\uD399\uD2B8 \uBAA9\uB85D", p.visualEffectPresets, "\uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
  for (const [index, preset] of (Array.isArray(p.visualEffectPresets) ? p.visualEffectPresets : []).entries()) {
    const context = "\uB0B4 \uC774\uD399\uD2B8 " + (index + 1) + "\uBC88" + (typeof preset?.name === "string" ? " " + valueLabel(preset.name) : "");
    if (!object5(preset)) {
      invalid("visual-effect-preset", context, "\uC800\uC7A5 \uC815\uBCF4", preset, "\uC774\uB984\uACFC \uB808\uC2DC\uD53C\uAC00 \uC788\uB294 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
      continue;
    }
    checkId(preset.id, context);
    if (typeof preset.name !== "string") invalid("visual-effect-preset", context, "\uC774\uB984", preset.name, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
    else {
      if (!preset.name.trim()) invalid("visual-effect-preset", context, "\uC774\uB984", preset.name, "\uACF5\uBC31\uB9CC \uC788\uB294 \uC774\uB984\uC740 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
      if (preset.name !== preset.name.trim()) invalid("visual-effect-preset", context, "\uC774\uB984", preset.name, "\uC774\uB984 \uC55E\uB4A4\uC5D0 \uACF5\uBC31\uC774 \uC5C6\uC5B4\uC57C \uD569\uB2C8\uB2E4");
      if (preset.name.length > 120) invalid("visual-effect-preset", context, "\uC774\uB984 \uAE38\uC774", preset.name.length, "120\uC790 \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4");
      if (/[\r\n]/.test(preset.name)) invalid("visual-effect-preset", context, "\uC774\uB984", preset.name, "\uC904\uBC14\uAFC8\uC744 \uD3EC\uD568\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
    }
    effectRecipe(preset.recipe, void 0, {}, context);
  }
  errors.push(...validateCardTemplates(p.cardTemplates));
  for (const [index, saved] of (Array.isArray(p.cardTemplates) ? p.cardTemplates : []).entries()) if (object5(saved)) checkId(saved.id, "\uB0B4 \uCE74\uB4DC \uC11C\uC2DD " + (index + 1) + "\uBC88");
  const dice = (value, extra, context) => {
    if (value === null || value === void 0) return;
    if (!object5(value)) {
      invalid("dice", context, "\uC8FC\uC0AC\uC704 \uC870\uAC74", value, "\uB208 \uBAA9\uB85D, \uBB38\uAD6C, \uC0C9\uC744 \uAC00\uC9C4 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      return;
    }
    if (!Array.isArray(value.faces)) invalid("dice", context, "\uC8FC\uC0AC\uC704 \uB208 \uBAA9\uB85D", value.faces, "\uC911\uBCF5 \uC5C6\uB294 1~6 \uC815\uC218\uC758 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
    else {
      const faces = /* @__PURE__ */ new Set();
      for (const [index, face] of value.faces.entries()) {
        if (!Number.isInteger(face) || face < 1 || face > 6) invalid("dice", context, "\uC8FC\uC0AC\uC704 " + (index + 1) + "\uBC88\uC9F8 \uB208", face, "1~6\uC758 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
        if (faces.has(face)) invalid("dice", context, "\uC911\uBCF5 \uC8FC\uC0AC\uC704 \uB208", face, "\uAC19\uC740 \uB208\uC744 \uB450 \uBC88 \uC9C0\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4", extra);
        faces.add(face);
      }
    }
    if (typeof value.text !== "string") invalid("dice", context, "\uC8FC\uC0AC\uC704 \uBB38\uAD6C", value.text, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
    if (typeof value.color !== "string") invalid("dice", context, "\uC8FC\uC0AC\uC704 \uC0C9", value.color, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
  };
  const keywordIds = /* @__PURE__ */ new Set(), keywordNames = /* @__PURE__ */ new Set();
  if (p.keywords !== void 0 && !Array.isArray(p.keywords)) invalid("keywords", "", "\uD0A4\uC6CC\uB4DC \uBAA9\uB85D", p.keywords, "\uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
  for (const [index, kw] of (Array.isArray(p.keywords) ? p.keywords : []).entries()) {
    const context = "\uD0A4\uC6CC\uB4DC " + (index + 1) + "\uBC88" + (typeof kw?.name === "string" ? " " + valueLabel(kw.name) : "");
    if (!object5(kw)) {
      invalid("keyword", context, "\uC800\uC7A5 \uC815\uBCF4", kw, "\uD0A4\uC6CC\uB4DC \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
      continue;
    }
    checkId(kw.id, context);
    keywordIds.add(kw.id);
    if (typeof kw.name !== "string") invalid("keyword", context, "\uC774\uB984", kw.name, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
    else {
      if (!kw.name.trim()) invalid("keyword", context, "\uC774\uB984", kw.name, "\uACF5\uBC31\uB9CC \uC788\uB294 \uC774\uB984\uC740 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
      if (kw.name !== kw.name.trim()) invalid("keyword", context, "\uC774\uB984", kw.name, "\uC774\uB984 \uC55E\uB4A4\uC5D0 \uACF5\uBC31\uC774 \uC5C6\uC5B4\uC57C \uD569\uB2C8\uB2E4");
      if (/[\r\n]/.test(kw.name)) invalid("keyword", context, "\uC774\uB984", kw.name, "\uC904\uBC14\uAFC8\uC744 \uD3EC\uD568\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
      if (keywordNames.has(kw.name.normalize("NFC"))) invalid("keyword", context, "\uC774\uB984", kw.name, "\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uC911\uBCF5 \uC774\uB984\uC785\uB2C8\uB2E4. \uC11C\uB85C \uB2E4\uB978 \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4");
      keywordNames.add(kw.name.normalize("NFC"));
    }
    if (typeof kw.description !== "string") invalid("keyword", context, "\uC124\uBA85", kw.description, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
    if (typeof kw.color !== "string" || !/^#[0-9a-f]{6}$/i.test(kw.color)) invalid("keyword", context, "\uC0C9", kw.color, "#RRGGBB \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4 (\uC608: #427963)");
    if (!assetRef(kw.iconAssetId)) invalid("keyword", context, "\uC544\uC774\uCF58 \uADF8\uB9BC ID", kw.iconAssetId, "\uD504\uB85C\uC81D\uD2B8 \uADF8\uB9BC \uC790\uB8CC\uC5D0 \uC874\uC7AC\uD558\uB294 ID\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    if (kw.visualEffects !== void 0) effectRecipe(kw.visualEffects, "text", {}, context + " \xB7 \uC804\uC6A9 \uC774\uD399\uD2B8");
  }
  const keywordRefs = (refs, extra, context) => {
    if (refs === void 0) return;
    if (!Array.isArray(refs)) {
      invalid("keyword-reference", context, "\uD0A4\uC6CC\uB4DC \uBAA9\uB85D", refs, "\uD0A4\uC6CC\uB4DC \uC5F0\uACB0\uC758 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
      return;
    }
    const ids = /* @__PURE__ */ new Set();
    for (const [index, ref] of refs.entries()) {
      const location = context + " \xB7 \uD0A4\uC6CC\uB4DC \uC5F0\uACB0 " + (index + 1) + "\uBC88";
      if (!object5(ref)) invalid("keyword-reference", location, "\uC5F0\uACB0 \uC815\uBCF4", ref, "keywordId\uC640 \uD45C\uC2DC \uBC29\uC2DD\uC774 \uC788\uB294 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      else {
        if (!keywordIds.has(ref.keywordId)) invalid("keyword-reference", location, "\uD0A4\uC6CC\uB4DC ID", ref.keywordId, "\uD504\uB85C\uC81D\uD2B8 \uD0A4\uC6CC\uB4DC \uBAA9\uB85D\uC5D0 \uC874\uC7AC\uD558\uB294 ID\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
        if (ids.has(ref.keywordId)) invalid("keyword-reference", location, "\uC911\uBCF5 \uD0A4\uC6CC\uB4DC ID", ref.keywordId, "\uD55C \uB300\uC0C1\uC5D0 \uAC19\uC740 \uD0A4\uC6CC\uB4DC\uB97C \uB450 \uBC88 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4", extra);
        if (!["inline", "badge", "both"].includes(ref.display)) invalid("keyword-reference", location, "\uD45C\uC2DC \uBC29\uC2DD", ref.display, "inline, badge, both \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      }
      ids.add(ref?.keywordId);
    }
  };
  const elements = (list2, card) => {
    const owner = cardProblemLabel(card) || "\uACF5\uD1B5 \uB4B7\uBA74";
    if (!Array.isArray(list2)) {
      invalid("elements", owner, "\uCE74\uB4DC \uC694\uC18C \uBAA9\uB85D", list2, "\uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", { cardId: card?.id });
      return;
    }
    for (const [index, e] of list2.entries()) {
      if (!object5(e)) {
        invalid("element", owner + " \xB7 \uC694\uC18C " + (index + 1) + "\uBC88", "\uC800\uC7A5 \uC815\uBCF4", e, "\uC694\uC18C \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", { cardId: card?.id });
        continue;
      }
      const context = cardProblemLabel(card, e), extra = { cardId: card?.id, elementId: e.id };
      checkId(e.id, context, extra);
      if (!ELEMENT_TYPES.includes(e.type)) invalid("element", context, "\uC694\uC18C \uC885\uB958", e.type, ELEMENT_TYPES.join(", ") + " \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      if (e.locked !== void 0 && typeof e.locked !== "boolean") invalid("element-lock", context, "\uD3EC\uC778\uD130 \uC7A0\uAE08", e.locked, "true \uB610\uB294 false\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      if (!object5(e.rect)) invalid("element", context, "\uC704\uCE58\xB7\uD06C\uAE30", e.rect, "x, y, w, h\uAC00 \uC788\uB294 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      else for (const [key, label, min] of [["x", "\uAC00\uB85C \uC704\uCE58", -Infinity], ["y", "\uC138\uB85C \uC704\uCE58", -Infinity], ["w", "\uD3ED", 0.01], ["h", "\uB192\uC774", 0.01]])
        if (!number2(e.rect[key], min)) invalid("element", context, label, e.rect[key], min === -Infinity ? "mm \uB2E8\uC704\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4" : "0.01 mm \uC774\uC0C1\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      if (!object5(e.style)) invalid("element", context, "\uC2A4\uD0C0\uC77C", e.style, "\uC2A4\uD0C0\uC77C \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      if (e.style?.visualEffects !== void 0) {
        if (!["text", "image", "effect"].includes(e.type)) invalid("visual-effect-target", context, "\uC774\uD399\uD2B8 \uB300\uC0C1 \uC885\uB958", e.type, "text, image, effect \uC694\uC18C\uC5D0\uB9CC \uC774\uD399\uD2B8\uB97C \uC801\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4", extra);
        else effectRecipe(e.style.visualEffects, e.type, extra, context);
      }
      for (const problem of textStyleProblems(e.style)) invalid(problem.key === "fontPt" ? "font" : "text-style", context, problem.label, problem.value, problem.rule, extra);
      if (!assetRef(e.assetId)) invalid("asset-reference", context, "\uADF8\uB9BC ID", e.assetId, "\uD504\uB85C\uC81D\uD2B8 \uADF8\uB9BC \uC790\uB8CC\uC5D0 \uC874\uC7AC\uD558\uB294 ID\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      if (e.content !== void 0 && typeof e.content !== "string") invalid("text", context, "\uC694\uC18C \uD14D\uC2A4\uD2B8", e.content, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
      textRanges(e, ["content"], extra, context);
      if (e.binding !== null && e.binding !== void 0) {
        const binding = e.binding, fields = ["name", "hp", "art", "item.effect", "skill.name", "skill.effect", "skill.dice", "skill.keywords", "item.keywords"];
        if (!object5(binding)) invalid("binding", context, "\uCE74\uB4DC \uC815\uBCF4 \uC5F0\uACB0", binding, "field\uAC00 \uC788\uB294 \uC5F0\uACB0 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
        else if (!fields.includes(binding.field)) invalid("binding", context, "\uC5F0\uACB0 \uD544\uB4DC", binding.field, fields.join(", ") + " \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
        else if (!card) invalid("binding", context, "\uCE74\uB4DC \uC815\uBCF4 \uC5F0\uACB0", binding.field, "\uACF5\uD1B5 \uB4B7\uBA74\uC5D0\uB294 \uCE74\uB4DC \uC815\uBCF4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4", extra);
        else if (binding.field.startsWith("skill.") && ![...Array.isArray(card.passives) ? card.passives : [], ...Array.isArray(card.actives) ? card.actives : []].some((sk) => sk?.id === binding.skillId))
          invalid("skill-reference", context, "\uC5F0\uACB0\uB41C \uC2A4\uD0AC ID", binding.skillId, "\uC774 \uCE74\uB4DC\uC758 \uD328\uC2DC\uBE0C \uB610\uB294 \uC561\uD2F0\uBE0C \uBAA9\uB85D\uC5D0 \uC874\uC7AC\uD558\uB294 ID\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      }
      dice(e.dice, extra, context);
    }
  };
  for (const [index, card] of p.cards.entries()) {
    if (!object5(card)) {
      invalid("card", "\uCE74\uB4DC " + (index + 1) + "\uBC88", "\uC800\uC7A5 \uC815\uBCF4", card, "\uCE74\uB4DC \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4");
      continue;
    }
    const context = cardProblemLabel(card), extra = { cardId: card.id };
    checkId(card.id, context, extra);
    if (!["monster", "item"].includes(card.kind)) invalid("card-info", context, "\uCE74\uB4DC \uC885\uB958", card.kind, "monster \uB610\uB294 item\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
    if (typeof card.name !== "string") invalid("card-info", context, "\uCE74\uB4DC \uC774\uB984", card.name, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
    if (!Number.isSafeInteger(card.quantity) || card.quantity < 1) invalid("card-info", context, "\uC218\uB7C9", card.quantity, "1 \uC774\uC0C1\uC758 \uC548\uC804\uD55C \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
    if (card.autoSkillLayout !== void 0 && typeof card.autoSkillLayout !== "boolean") invalid("card-info", context, "\uC2A4\uD0AC \uC790\uB3D9 \uBC30\uCE58", card.autoSkillLayout, "true \uB610\uB294 false\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
    if (card.visualEffects !== void 0) effectRecipe(card.visualEffects, "frame", extra, context + " \xB7 \uCE74\uB4DC \uD14C\uB450\uB9AC");
    keywordRefs(card.keywords, extra, context);
    keywordRefs(card.nameKeywords, extra, context + " \xB7 \uC81C\uBAA9");
    textRanges(card, card.kind === "item" ? ["name", "effect"] : ["name"], extra, context);
    if (!assetRef(card.artAssetId)) invalid("asset-reference", context, "\uCE74\uB4DC \uADF8\uB9BC ID", card.artAssetId, "\uD504\uB85C\uC81D\uD2B8 \uADF8\uB9BC \uC790\uB8CC\uC5D0 \uC874\uC7AC\uD558\uB294 ID\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
    if (["monster", "item"].includes(card.kind)) {
      const minimum = card.kind === "monster" ? 1 : 0, attributeCode = card.kind === "monster" ? "monster-info" : "item-info";
      const attributeRule = Object.keys(ATTRIBUTES).join(", ") + " \uC911 \uD558\uB098\uC778 \uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4";
      if ((card.kind === "monster" && card.attributes === void 0 || card.attribute !== void 0) && (typeof card.attribute !== "string" || !Object.hasOwn(ATTRIBUTES, card.attribute))) invalid(attributeCode, context, "\uC18D\uC131", card.attribute, attributeRule, extra);
      if (card.attributes !== void 0) {
        if (!Array.isArray(card.attributes)) invalid(attributeCode, context, "\uC18D\uC131 \uBAA9\uB85D", card.attributes, minimum + "~6\uAC1C \uC18D\uC131\uC758 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
        else {
          if (card.attributes.length < minimum || card.attributes.length > 6) invalid(attributeCode, context, "\uC18D\uC131 \uAC1C\uC218", card.attributes.length, minimum + "~6\uAC1C\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
          const selected = /* @__PURE__ */ new Map();
          for (const [index2, attribute] of card.attributes.entries()) {
            if (typeof attribute !== "string" || !Object.hasOwn(ATTRIBUTES, attribute)) invalid(attributeCode, context, index2 + 1 + "\uBC88 \uC18D\uC131", attribute, attributeRule, extra);
            else if (selected.has(attribute)) invalid(attributeCode, context, index2 + 1 + "\uBC88 \uC18D\uC131", attribute, selected.get(attribute) + 1 + "\uBC88 \uC18D\uC131\uACFC \uC911\uBCF5\uB429\uB2C8\uB2E4. \uAC01 \uC18D\uC131\uC740 \uD55C \uBC88\uB9CC \uC120\uD0DD\uD574\uC57C \uD569\uB2C8\uB2E4", extra);
            else selected.set(attribute, index2);
          }
        }
      }
    }
    if (card.kind === "monster") {
      if (!RANKS.includes(card.rank)) invalid("monster-info", context, "\uB4F1\uAE09", card.rank, RANKS.join(", ") + " \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      if (!number2(card.baseHp, 0)) invalid("monster-info", context, "\uAE30\uBCF8 HP", card.baseHp, "0 \uC774\uC0C1\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      if (!number2(card.hpReduction, 0)) invalid("monster-info", context, "HP \uCC28\uAC10\uB7C9", card.hpReduction, "0 \uC774\uC0C1\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      if (card.hpReduction > card.baseHp) invalid("monster-info", context, "HP \uCC28\uAC10\uB7C9", card.hpReduction, "\uAE30\uBCF8 HP " + valueLabel(card.baseHp) + " \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      for (const [field, kind] of [["passives", "\uD328\uC2DC\uBE0C"], ["actives", "\uC561\uD2F0\uBE0C"]]) {
        const skills = card[field];
        if (!Array.isArray(skills)) {
          invalid("skills", context, kind + " \uC2A4\uD0AC \uBAA9\uB85D", skills, "\uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
          continue;
        }
        for (const [skillIndex, sk] of skills.entries()) {
          const location = context + " \xB7 " + kind + " \uC2A4\uD0AC " + (typeof sk?.name === "string" && sk.name ? valueLabel(sk.name) : skillIndex + 1 + "\uBC88");
          if (!object5(sk)) {
            invalid("skill", location, "\uC800\uC7A5 \uC815\uBCF4", sk, "\uC2A4\uD0AC \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
            continue;
          }
          const detail = { ...extra, skillId: sk.id };
          checkId(sk.id, location, detail);
          if (typeof sk.name !== "string") invalid("skill", location, "\uC2A4\uD0AC \uC774\uB984", sk.name, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", detail);
          if (typeof sk.effect !== "string") invalid("skill", location, "\uC2A4\uD0AC \uD6A8\uACFC", sk.effect, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", detail);
          dice(sk.dice, detail, location);
          keywordRefs(sk.keywords, detail, location);
          keywordRefs(sk.nameKeywords, detail, location + " \xB7 \uC81C\uBAA9");
          textRanges(sk, ["name", "effect"], detail, location);
          if (sk.nameStyle !== void 0) {
            if (!object5(sk.nameStyle)) invalid("skill-name-style", location, "\uC774\uB984 \uC2A4\uD0C0\uC77C", sk.nameStyle, "\uC2A4\uD0C0\uC77C \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", detail);
            else {
              if (sk.nameStyle.color !== void 0 && (typeof sk.nameStyle.color !== "string" || !/^#[0-9a-f]{6}$/i.test(sk.nameStyle.color))) invalid("skill-name-style", location, "\uC774\uB984 \uAE00\uC790 \uC0C9", sk.nameStyle.color, "#RRGGBB \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4 (\uC608: #427963)", detail);
              for (const problem of textStyleProblems(sk.nameStyle)) invalid("skill-name-style", location, "\uC774\uB984 " + problem.label, problem.value, problem.rule, detail);
              if (sk.nameStyle.visualEffects !== void 0) effectRecipe(sk.nameStyle.visualEffects, "text", detail, location + " \uC774\uB984");
            }
          }
          errors.push(...validateSkillReferences(sk, detail).map((problem) => ({ ...problem, message: location + ": " + problem.message })));
          for (const [refIndex, ref] of (Array.isArray(sk.skillReferences) ? sk.skillReferences : []).entries()) if (ref && typeof ref === "object") checkId(ref.id, location + " \xB7 \uC2A4\uD0AC \uCC38\uC870 " + (refIndex + 1) + "\uBC88", detail);
        }
      }
    } else {
      if (typeof card.effect !== "string") invalid("item-effect", context, "\uC544\uC774\uD15C \uD6A8\uACFC \uC124\uBA85", card.effect, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
    }
    elements(card.elements, card);
  }
  elements(p.back.elements, null);
  for (const [key, asset] of Object.entries(p.assets)) {
    const context = "\uADF8\uB9BC \uC790\uB8CC " + valueLabel(key), extra = { assetId: key };
    if (!object5(asset)) {
      invalid("asset", context, "\uC800\uC7A5 \uC815\uBCF4", asset, "\uADF8\uB9BC \uC790\uB8CC \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      continue;
    }
    if (!id4(key)) invalid("asset", context, "\uC790\uB8CC \uD0A4", key, idRule2, extra);
    if (asset.id !== key) invalid("asset", context, "\uADF8\uB9BC ID", asset.id, "\uC790\uB8CC \uD0A4 " + valueLabel(key) + "\uC640 \uAC19\uC544\uC57C \uD569\uB2C8\uB2E4", extra);
    if (!["image/png", "image/jpeg", "image/webp"].includes(asset.mime)) invalid("asset", context, "\uADF8\uB9BC \uD615\uC2DD", asset.mime, "image/png, image/jpeg, image/webp \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
    if (!dataUrl2(asset.dataUrl, asset.mime)) invalid("asset", context, "\uD53D\uC140 \uB370\uC774\uD130", asset.dataUrl, "\uADF8\uB9BC \uD615\uC2DD " + valueLabel(asset.mime) + "\uACFC \uC77C\uCE58\uD558\uB294 base64 \uB370\uC774\uD130 URL\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", extra);
    if (!Number.isSafeInteger(asset.width) || asset.width < 1) invalid("asset", context, "\uD3ED", asset.width, "1 px \uC774\uC0C1\uC758 \uC548\uC804\uD55C \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
    if (!Number.isSafeInteger(asset.height) || asset.height < 1) invalid("asset", context, "\uB192\uC774", asset.height, "1 px \uC774\uC0C1\uC758 \uC548\uC804\uD55C \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
    if (!(asset.paintingId === null || id4(asset.paintingId) && Object.hasOwn(p.paintings, asset.paintingId))) invalid("asset", context, "\uADF8\uB9BC \uC6D0\uBCF8 ID", asset.paintingId, "\uC6D0\uBCF8\uC774 \uC5C6\uC73C\uBA74 null, \uC788\uC73C\uBA74 \uD504\uB85C\uC81D\uD2B8 \uADF8\uB9BC \uC6D0\uBCF8\uC5D0 \uC874\uC7AC\uD558\uB294 ID\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
  }
  for (const [key, drawing] of Object.entries(p.paintings)) {
    const context = "\uADF8\uB9BC \uC6D0\uBCF8 " + valueLabel(key), extra = { paintingId: key };
    if (!object5(drawing)) {
      invalid("painting", context, "\uC800\uC7A5 \uC815\uBCF4", drawing, "\uADF8\uB9BC \uC6D0\uBCF8 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
      continue;
    }
    let invalidDrawing = false;
    const drawingBad = (field, value, rule) => {
      invalid("painting", context, field, value, rule, extra);
      invalidDrawing = true;
    };
    if (!id4(key)) drawingBad("\uC6D0\uBCF8 \uD0A4", key, idRule2);
    if (drawing.id !== key) drawingBad("\uC6D0\uBCF8 ID", drawing.id, "\uC6D0\uBCF8 \uD0A4 " + valueLabel(key) + "\uC640 \uAC19\uC544\uC57C \uD569\uB2C8\uB2E4");
    for (const [field, label] of [["width", "\uD3ED"], ["height", "\uB192\uC774"]]) if (!Number.isInteger(drawing[field]) || drawing[field] < 64 || drawing[field] > 4096) drawingBad(label, drawing[field], "64~4096 px\uC758 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4");
    if (!Array.isArray(drawing.layers)) drawingBad("\uB808\uC774\uC5B4 \uBAA9\uB85D", drawing.layers, "\uB808\uC774\uC5B4\uAC00 1\uC7A5 \uC774\uC0C1\uC778 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
    else if (drawing.layers.length < 1) drawingBad("\uB808\uC774\uC5B4 \uC218", drawing.layers.length, "\uB808\uC774\uC5B4\uAC00 1\uC7A5 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4");
    if (invalidDrawing) continue;
    const layerIds = /* @__PURE__ */ new Set();
    for (const [index, layer] of drawing.layers.entries()) {
      const location = context + " \xB7 \uB808\uC774\uC5B4 " + (index + 1) + "\uBC88" + (typeof layer?.name === "string" ? " " + valueLabel(layer.name) : "");
      if (!object5(layer)) {
        invalid("layer", location, "\uC800\uC7A5 \uC815\uBCF4", layer, "\uB808\uC774\uC5B4 \uAC1D\uCCB4\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
        layerIds.add(layer?.id);
        continue;
      }
      const detail = { ...extra, layerId: layer.id };
      if (!id4(layer.id)) invalid("layer", location, "ID", layer.id, idRule2, detail);
      if (layerIds.has(layer.id)) invalid("layer", location, "\uC911\uBCF5 ID", layer.id, "\uC774 \uADF8\uB9BC\uC758 \uB2E4\uB978 \uB808\uC774\uC5B4\uC640 \uC11C\uB85C \uB2E4\uB978 ID\uC5EC\uC57C \uD569\uB2C8\uB2E4", detail);
      if (typeof layer.name !== "string") invalid("layer", location, "\uC774\uB984", layer.name, "\uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", detail);
      if (typeof layer.visible !== "boolean") invalid("layer", location, "\uD45C\uC2DC \uC124\uC815", layer.visible, "true \uB610\uB294 false\uC5EC\uC57C \uD569\uB2C8\uB2E4", detail);
      if (typeof layer.locked !== "boolean") invalid("layer", location, "\uC7A0\uAE08 \uC124\uC815", layer.locked, "true \uB610\uB294 false\uC5EC\uC57C \uD569\uB2C8\uB2E4", detail);
      if (!number2(layer.opacity, 0) || layer.opacity > 1) invalid("layer", location, "\uBD88\uD22C\uBA85\uB3C4", layer.opacity, "0~1\uC758 \uC720\uD55C\uD55C \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4", detail);
      if (layer.blendMode !== void 0 && !isBlendMode(layer.blendMode)) invalid("layer", location, "\uD63C\uD569 \uBAA8\uB4DC", layer.blendMode, "\uC9C0\uC6D0\uD558\uB294 26\uAC1C \uB808\uC774\uC5B4 \uD63C\uD569 \uBAA8\uB4DC \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4. \uC774\uC804 \uD30C\uC77C\uC740 \uC0DD\uB7B5\uD558\uBA74 \uC77C\uBC18(source-over)\uC73C\uB85C \uD45C\uC2DC\uD569\uB2C8\uB2E4", detail);
      if (!dataUrl2(layer.png, "image/png")) invalid("layer", location, "\uD53D\uC140 \uB370\uC774\uD130", layer.png, "image/png \uD615\uC2DD\uC758 base64 \uB370\uC774\uD130 URL\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4", detail);
      layerIds.add(layer.id);
    }
    if (!layerIds.has(drawing.activeLayerId)) invalid("active-layer", context, "\uC120\uD0DD\uB41C \uB808\uC774\uC5B4 ID", drawing.activeLayerId, "\uD604\uC7AC \uB808\uC774\uC5B4 ID " + [...layerIds].slice(0, 5).map(valueLabel).join(", ") + " \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4", extra);
  }
  return errors;
}

// src/model/image-header.js
var u32 = (b, o) => b[o] * 16777216 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3] >>> 0;
var le32 = (b, o) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + b[o + 3] * 16777216 >>> 0;
var word = (b, o) => (b[o] << 8) + b[o + 1];
var text = (b, o, n) => String.fromCharCode(...b.slice(o, o + n));
function sniffImage(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 12 && text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}
function imageSize(bytes, mime) {
  if (mime === "image/png") {
    if (bytes.length < 33 || [137, 80, 78, 71, 13, 10, 26, 10].some((n, i) => bytes[i] !== n) || u32(bytes, 8) !== 13 || text(bytes, 12, 4) !== "IHDR") return null;
    return [u32(bytes, 16), u32(bytes, 20)];
  }
  if (mime === "image/jpeg") {
    if (bytes[0] !== 255 || bytes[1] !== 216) return null;
    let cursor = 2;
    while (cursor < bytes.length) {
      if (bytes[cursor++] !== 255) return null;
      while (bytes[cursor] === 255) cursor++;
      const marker = bytes[cursor++];
      if (marker === 217 || marker === 218) return null;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (cursor + 2 > bytes.length) return null;
      const length = word(bytes, cursor);
      if (length < 2 || cursor + length > bytes.length) return null;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) return length >= 8 ? [word(bytes, cursor + 5), word(bytes, cursor + 3)] : null;
      cursor += length;
    }
    return null;
  }
  if (bytes.length < 25 || text(bytes, 0, 4) !== "RIFF" || text(bytes, 8, 4) !== "WEBP" || le32(bytes, 4) + 8 !== bytes.length) return null;
  const type = text(bytes, 12, 4);
  if (type === "VP8X" && bytes.length >= 30) return [1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)];
  if (type === "VP8L" && bytes[20] === 47) return [1 + bytes[21] + ((bytes[22] & 63) << 8), 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10)];
  if (type === "VP8 " && bytes.length >= 30 && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) return [bytes[26] + (bytes[27] << 8) & 16383, bytes[28] + (bytes[29] << 8) & 16383];
  return null;
}

// src/model/asset-library.js
var ASSET_LIBRARY_LIMITS = Object.freeze({ entries: 512, dimension: 8192, pixels: 16777216, assetBytes: 20 * 1024 * 1024, totalBytes: 64 * 1024 * 1024, nameLength: 120 });
var MAX_TEXT = 96 * 1024 * 1024;

// src/cloud/cloud-format.js
var refPattern = /^blob:sha256:([0-9a-f]{64})$/;
async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function slots(data, library = false) {
  const result = [];
  const asset = (value) => {
    if (value && typeof value === "object") result.push([value, "dataUrl", value.mime]);
  };
  if (library) asset(data?.asset);
  else {
    for (const value of Object.values(data?.assets ?? {})) asset(value);
    for (const drawing of Object.values(data?.paintings ?? {})) for (const layer of drawing?.layers ?? []) result.push([layer, "png", "image/png"]);
    for (const template of data?.cardTemplates ?? []) result.push(...slots(template));
  }
  return result;
}
function collectBlobRefs(value) {
  const refs = /* @__PURE__ */ new Set(), seen = /* @__PURE__ */ new WeakSet(), pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === "string") {
      const match = refPattern.exec(item);
      if (match) refs.add(match[1]);
    } else if (item && typeof item === "object" && !seen.has(item)) {
      seen.add(item);
      for (const child of Object.values(item)) pending.push(child);
    }
  }
  return [...refs].sort();
}
function cloudProjectForValidation(value) {
  const data = structuredClone(value);
  for (const [object7, key, mime] of slots(data)) if (typeof object7[key] === "string" && refPattern.test(object7[key])) object7[key] = "data:" + mime + ";base64,AAAA";
  return data;
}

// src/cloud/server-model.js
var object6 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var identifier = (v) => typeof v === "string" && v.length > 0 && v.length < 200;
var reject = (message) => {
  throw Object.assign(new Error(message), { code: "invalid-work" });
};
function boundedJson(data) {
  const seen = /* @__PURE__ */ new WeakSet(), pending = [[data, 0]];
  while (pending.length) {
    const [value, depth] = pending.pop();
    if (depth > 64) reject("\uC800\uC7A5 \uB370\uC774\uD130\uC758 \uC911\uCCA9\uC740 \uCD5C\uB300 64\uB2E8\uACC4\uC608\uC694.");
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) continue;
    if (typeof value !== "object" || seen.has(value)) reject("\uC800\uC7A5\uD560 \uC218 \uC5C6\uB294 JSON \uB370\uC774\uD130\uC608\uC694.");
    seen.add(value);
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) reject("\uC77C\uBC18 JSON \uAC1D\uCCB4\uB9CC \uC800\uC7A5\uD560 \uC218 \uC788\uC5B4\uC694.");
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) reject("\uC800\uC7A5\uD560 \uC218 \uC5C6\uB294 \uD56D\uBAA9 \uC774\uB984\uC774\uC5D0\uC694: " + key);
      pending.push([item, depth + 1]);
    }
  }
  if (new TextEncoder().encode(JSON.stringify(data)).length > 8 * 1024 * 1024) reject("\uC791\uC5C5 JSON\uC740 \uCD5C\uB300 8 MB\uAE4C\uC9C0 \uC800\uC7A5\uD560 \uC218 \uC788\uC5B4\uC694.");
}
function checkImages(assets = {}, paintings = {}) {
  if (!object6(assets) || !object6(paintings)) reject("\uADF8\uB9BC \uC790\uB8CC\uC640 \uC6D0\uBCF8\uC740 \uAC1D\uCCB4\uC5EC\uC57C \uD574\uC694.");
  for (const asset of Object.values(assets)) if (!/^blob:sha256:[0-9a-f]{64}$/.test(asset?.dataUrl)) reject("\uADF8\uB9BC\uC740 \uC5C5\uB85C\uB4DC\uB41C \uC774\uBBF8\uC9C0 \uCC38\uC870\uC5EC\uC57C \uD574\uC694.");
  for (const drawing of Object.values(paintings)) {
    if (!object6(drawing) || !Array.isArray(drawing.layers)) reject("\uADF8\uB9BC \uC6D0\uBCF8\uC758 \uB808\uC774\uC5B4\uB294 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD574\uC694.");
    for (const layer of drawing.layers) if (!/^blob:sha256:[0-9a-f]{64}$/.test(layer?.png)) reject("\uB808\uC774\uC5B4\uB294 \uC5C5\uB85C\uB4DC\uB41C \uC774\uBBF8\uC9C0 \uCC38\uC870\uC5EC\uC57C \uD574\uC694.");
  }
}
function problems(list2) {
  if (list2.length) reject(list2[0].message);
}
function validateCloudWork(data) {
  boundedJson(data);
  checkImages(data?.assets, data?.paintings);
  if (data?.cardTemplates !== void 0 && !Array.isArray(data.cardTemplates)) reject("\uCE74\uB4DC \uC11C\uC2DD \uBAA9\uB85D\uC740 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD574\uC694.");
  for (const template of data?.cardTemplates ?? []) checkImages(template?.assets, template?.paintings);
  const copy = cloudProjectForValidation(data);
  problems(validateProject(copy));
  return { cardCount: data.cards.length, blobRefs: collectBlobRefs(data) };
}
function validateCloudAsset(kind, data) {
  boundedJson(data);
  if (!object6(data) || data.kind !== kind || !object6(data.item) || !["effect_template", "image", "card_template", "keyword"].includes(kind)) reject("\uACF5\uC720 \uC5D0\uC14B\uC758 \uC885\uB958\uC640 \uB0B4\uC6A9\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694.");
  if (Object.keys(data).some((key) => !["kind", "item", "blobs", "assets", "paintings"].includes(key))) reject("\uACF5\uC720 \uC5D0\uC14B\uC5D0 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD56D\uBAA9\uC774 \uC788\uC5B4\uC694.");
  const refs = collectBlobRefs({ ...data, blobs: [] });
  if (!Array.isArray(data.blobs) || JSON.stringify(data.blobs) !== JSON.stringify(refs)) reject("\uACF5\uC720 \uC5D0\uC14B\uC758 \uC774\uBBF8\uC9C0 \uCC38\uC870 \uBAA9\uB85D\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC544\uC694.");
  checkImages(data.assets, data.paintings);
  const p = createProject();
  p.cards = [];
  p.assets = data.assets ?? {};
  p.paintings = data.paintings ?? {};
  if (kind === "card_template") {
    checkImages(data.item.assets, data.item.paintings);
    const copy = cloudProjectForValidation(data.item);
    problems(validateCardTemplates([copy]));
  } else if (kind === "image") {
    const { item } = data, { asset } = item;
    if (!identifier(item.id) || !/^[\w][\w.:-]{0,127}$/.test(item.id) || typeof item.name !== "string" || !item.name.trim() || item.name !== item.name.trim() || Array.from(item.name).length > 120 || /[\x00-\x1f\x7f]/.test(item.name) || !Number.isSafeInteger(item.createdAt) || item.createdAt < 0 || item.createdAt > 864e13 || !asset || item.id === asset.id || asset.paintingId !== null) reject("\uC774\uBBF8\uC9C0 \uBCF4\uAD00\uD568 \uD56D\uBAA9\uC758 \uC774\uB984\xB7ID\xB7\uC800\uC7A5 \uC2DC\uAC04\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694.");
    for (const key of ["width", "height"]) if (!Number.isSafeInteger(asset[key]) || asset[key] < 1 || asset[key] > ASSET_LIBRARY_LIMITS.dimension) reject("\uC774\uBBF8\uC9C0 \uD06C\uAE30\uB294 1~8192 px\uC5EC\uC57C \uD574\uC694.");
    if (asset.width * asset.height > ASSET_LIBRARY_LIMITS.pixels) reject("\uC774\uBBF8\uC9C0\uC758 \uC804\uCCB4 \uD53D\uC140 \uC218\uAC00 \uB108\uBB34 \uCEE4\uC694.");
    p.assets = { ...p.assets, [asset.id]: asset };
    checkImages(p.assets);
    problems(validateProject(cloudProjectForValidation(p)));
  } else {
    if (kind === "keyword") p.keywords = [data.item];
    else {
      problems(validateVisualEffects(data.item.recipe));
      p.visualEffectPresets = [data.item];
    }
    problems(validateProject(cloudProjectForValidation(p)));
  }
  return { blobRefs: refs };
}
export {
  collectBlobRefs,
  imageSize,
  sha256Hex,
  sniffImage,
  validateCloudAsset,
  validateCloudWork
};
