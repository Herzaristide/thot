import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, parsePreferences } from "@/lib/prefs/schema";

describe("parsePreferences", () => {
  it("complète des préférences partielles", () => {
    expect(parsePreferences({ size: 22 })).toEqual({ ...DEFAULT_PREFERENCES, size: 22 });
  });

  it("rejette des valeurs invalides plutôt que d'échouer", () => {
    expect(parsePreferences({ size: 99 })).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("n'importe quoi")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });
});
