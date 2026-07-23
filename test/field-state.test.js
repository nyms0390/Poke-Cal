import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAmbientFieldControl,
  createAmbientFieldState,
} from "../src/ui/field-state.js";

test("creates only the shared ambient field settings", () => {
  assert.deepEqual(createAmbientFieldState({
    weather: "SunnyDay",
    terrain: "Electric Terrain",
    gravity: true,
    trickRoom: true,
  }), {
    format: "doubles",
    weather: "SunnyDay",
    terrain: "Electric Terrain",
    gravity: true,
  });
});

test("updates ambient field settings immutably and ignores unsupported controls", () => {
  const state = createAmbientFieldState();
  const sunny = applyAmbientFieldControl(state, { key: "weather", value: "SunnyDay" });
  const gravity = applyAmbientFieldControl(sunny, { key: "gravity", value: true });

  assert.equal(state.weather, "");
  assert.equal(sunny.weather, "SunnyDay");
  assert.equal(gravity.gravity, true);
  assert.equal(
    applyAmbientFieldControl(gravity, { key: "trickRoom", value: true }),
    gravity,
  );
});
