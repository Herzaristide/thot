import { z } from "zod";

/** Préférences du lecteur (v1). Stockées telles quelles dans `preferences.data`. */
export const preferencesSchema = z.object({
  v: z.literal(1),
  theme: z.enum(["system", "light", "dark", "sepia"]),
  font: z.enum(["literata", "source-serif", "inter"]),
  size: z.number().min(14).max(30),
  lineHeight: z.number().min(1.2).max(2.2),
  width: z.enum(["narrow", "medium", "wide"]),
  align: z.enum(["start", "justify"]),
  hyphens: z.boolean(),
  mode: z.enum(["scroll", "paged"]),
  uiLang: z.enum(["fr", "en"]),
  readingLangs: z.array(z.string().min(2).max(12)).max(10),
  showPageNumbers: z.boolean(),
  parallel: z.object({
    enabled: z.boolean(),
    targetLang: z.string().min(2).max(12).nullable(),
  }),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  v: 1,
  theme: "system",
  font: "literata",
  size: 19,
  lineHeight: 1.65,
  width: "medium",
  align: "start",
  hyphens: false,
  mode: "scroll",
  uiLang: "fr",
  readingLangs: ["fr"],
  showPageNumbers: false,
  parallel: { enabled: false, targetLang: null },
};

/** Lit des préférences venues d'ailleurs (localStorage, ancienne version) sans échouer. */
export function parsePreferences(raw: unknown): Preferences {
  const merged = { ...DEFAULT_PREFERENCES, ...(typeof raw === "object" && raw ? raw : {}) };
  const res = preferencesSchema.safeParse(merged);
  return res.success ? res.data : DEFAULT_PREFERENCES;
}

/** Corps de PUT /api/me/preferences. */
export const preferencesPutSchema = z.object({
  data: preferencesSchema,
  updatedAt: z.iso.datetime(),
});
