import { describe, expect, it } from "vitest";
import type { TocSection } from "@/lib/api/types";
import { buildUnits, firstBodyUnit, sectionLabel, unitOf } from "@/lib/reader/units";

function s(
  p: Partial<TocSection> & { seq_start: number | null; seq_end: number | null },
): TocSection {
  return {
    id: crypto.randomUUID(),
    kind: "chapter",
    matter: "body",
    label: null,
    title: null,
    number: null,
    children: [],
    ...p,
  };
}

// Forme réelle (L'Esprit souterrain) : une partie a deux segments avant son premier chapitre
const toc = [
  s({ matter: "front", kind: "other", title: "Titre", seq_start: 0, seq_end: 3 }),
  s({
    kind: "part",
    label: "PREMIÈRE PARTIE",
    title: "KATIA",
    seq_start: 4,
    seq_end: 20,
    children: [
      s({ label: "I", seq_start: 6, seq_end: 12 }),
      s({ label: "II", seq_start: 13, seq_end: 20 }),
    ],
  }),
  s({ matter: "back", kind: "notes", title: "Notes", seq_start: 24, seq_end: 25 }),
];

describe("buildUnits", () => {
  const units = buildUnits(toc, 28);

  it("couvre tout le livre sans trou ni chevauchement", () => {
    expect(units[0]?.from).toBe(0);
    expect(units.at(-1)?.to).toBe(27);
    for (let i = 1; i < units.length; i++) {
      expect(units[i]?.from).toBe((units[i - 1]?.to ?? 0) + 1);
    }
  });

  it("garde le début d'une partie avant son premier chapitre", () => {
    const head = units.find((u) => u.from === 4);
    expect(head).toMatchObject({ to: 5, path: ["PREMIÈRE PARTIE — KATIA"] });
    expect(unitOf(units, 8)?.path).toEqual(["PREMIÈRE PARTIE — KATIA", "I"]);
  });

  it("rattache les segments hors section à l'unité précédente", () => {
    const gap = unitOf(units, 22);
    expect(gap?.from).toBe(21);
    expect(gap?.path).toEqual(["PREMIÈRE PARTIE — KATIA", "II"]);
  });

  it("commence la lecture au corps du texte", () => {
    expect(firstBodyUnit(units)?.from).toBe(4);
  });

  it("nomme les chapitres sans titre", () => {
    expect(sectionLabel(s({ number: 3, seq_start: 0, seq_end: 0 }))).toBe("Chapitre 3");
  });
});
