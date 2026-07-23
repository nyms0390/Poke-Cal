import { t } from "../i18n.js";

const FIELD_GROUPS = [
  {
    key: "format",
    label: "field.format",
    className: "radio-group segmented-tag",
    options: [
      ["doubles", "field.doubles"],
      ["singles", "field.singles"],
    ],
  },
  {
    key: "weather",
    label: "field.weather",
    className: "radio-group",
    options: [
      ["", "field.none"],
      ["SunnyDay", "field.sun"],
      ["RainDance", "field.rain"],
      ["Sandstorm", "field.sand"],
      ["Snowscape", "field.snow"],
    ],
  },
  {
    key: "terrain",
    label: "field.terrain",
    className: "radio-group",
    options: [
      ["", "field.none"],
      ["Electric Terrain", "field.electric"],
      ["Grassy Terrain", "field.grassy"],
      ["Misty Terrain", "field.misty"],
      ["Psychic Terrain", "field.psychic"],
    ],
  },
];

export function mountAmbientFieldControls(
  container,
  { namePrefix = "ambient", onChange = () => {}, toggleElements = [] } = {},
) {
  if (!container) return { sync() {} };
  const documentRef = container.ownerDocument;
  const inputs = new Map();
  const groups = FIELD_GROUPS.map((group) => {
    const fieldset = documentRef.createElement("fieldset");
    fieldset.className = group.className;
    const legend = translatedElement(documentRef, "legend", group.label);
    const options = documentRef.createElement("div");
    options.className = "radio-options";

    const groupInputs = group.options.map(([value, labelKey]) => {
      const input = documentRef.createElement("input");
      input.type = "radio";
      input.name = `${namePrefix}-field-${group.key}`;
      input.value = value;
      input.addEventListener("input", () => {
        if (input.checked) onChange({ key: group.key, value: input.value });
      });
      const label = documentRef.createElement("label");
      label.className = "radio-option";
      label.append(input, translatedElement(documentRef, "span", labelKey));
      options.append(label);
      return input;
    });
    inputs.set(group.key, groupInputs);
    fieldset.append(legend, options);
    return fieldset;
  });

  const gravity = documentRef.createElement("input");
  gravity.type = "checkbox";
  gravity.id = `${namePrefix}-field-gravity`;
  gravity.addEventListener("input", () => {
    onChange({ key: "gravity", value: gravity.checked });
  });
  inputs.set("gravity", [gravity]);
  const gravityLabel = documentRef.createElement("label");
  gravityLabel.className = "inline-toggle";
  gravityLabel.append(gravity, translatedElement(documentRef, "span", "field.gravity"));
  const toggles = documentRef.createElement("div");
  toggles.className = "inline-toggles";
  toggles.append(gravityLabel, ...toggleElements);

  container.classList.add("ambient-field-controls");
  container.replaceChildren(...groups, toggles);

  return {
    sync(state = {}) {
      for (const input of inputs.get("format")) input.checked = input.value === state.format;
      for (const input of inputs.get("weather")) input.checked = input.value === state.weather;
      for (const input of inputs.get("terrain")) input.checked = input.value === state.terrain;
      gravity.checked = Boolean(state.gravity);
    },
  };
}

function translatedElement(documentRef, tagName, key) {
  const element = documentRef.createElement(tagName);
  element.dataset.i18n = key;
  element.textContent = t(key);
  return element;
}
