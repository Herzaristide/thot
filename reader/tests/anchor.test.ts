import { describe, expect, it } from "vitest";
import { makeQuote, progressOf } from "@/lib/reader/anchor";

describe("makeQuote", () => {
  const text =
    "Ordinov se décida enfin à changer de chambre. Sa logeuse, pauvre veuve d'un fonctionnaire.";

  it("prend un extrait avec son contexte", () => {
    const q = makeQuote(text, 8);
    expect(q.exact.startsWith("se décida")).toBe(true);
    expect(q.prefix).toBe("Ordinov ");
    expect(text).toContain(q.prefix + q.exact + q.suffix);
  });

  it("coupe l'extrait sur une fin de mot", () => {
    const q = makeQuote(text, 0);
    expect(text.charAt(q.exact.length)).toBe(" ");
  });

  it("supporte un décalage hors du texte", () => {
    expect(makeQuote("court", 99)).toEqual({ exact: "", prefix: "court", suffix: "" });
  });
});

describe("progressOf", () => {
  it("compte en caractères et reste dans [0, 1]", () => {
    expect(progressOf({ char_start: 50 }, 0, 200)).toBe(0.25);
    expect(progressOf({ char_start: 190 }, 50, 200)).toBe(1);
    expect(progressOf({ char_start: 0 }, 0, 0)).toBe(0);
  });
});
