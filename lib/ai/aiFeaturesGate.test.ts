import { afterEach, describe, expect, it } from "vitest";
import {
  AI_FEATURES_DISABLED_MESSAGE,
  isAiFeaturesEnabled,
} from "./aiFeaturesGate";

const KEY = "SCARAMUZZO_AI_FEATURES_ENABLED";

describe("isAiFeaturesEnabled", () => {
  const prev = process.env[KEY];

  afterEach(() => {
    if (prev === undefined) delete process.env[KEY];
    else process.env[KEY] = prev;
  });

  it("default / unset → disabled", () => {
    delete process.env[KEY];
    expect(isAiFeaturesEnabled()).toBe(false);
  });

  it("false / other → disabled", () => {
    process.env[KEY] = "false";
    expect(isAiFeaturesEnabled()).toBe(false);
    process.env[KEY] = "1";
    expect(isAiFeaturesEnabled()).toBe(false);
  });

  it("true → enabled", () => {
    process.env[KEY] = "true";
    expect(isAiFeaturesEnabled()).toBe(true);
  });

  it("exposes operator-facing disabled message without vendor names", () => {
    expect(AI_FEATURES_DISABLED_MESSAGE.toLowerCase()).not.toMatch(/openai|gpt/);
  });
});
