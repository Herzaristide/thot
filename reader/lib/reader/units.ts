import type { TocSection } from "@/lib/api/types";

/**
 * Unité de lecture : plage contiguë de segments affichée d'un bloc (un
 * chapitre, ou le début d'une partie avant son premier chapitre). Les unités
 * couvrent tout le livre, sans trou ni chevauchement.
 */
export type Unit = {
  index: number;
  from: number;
  to: number;
  path: string[];
  matter: TocSection["matter"];
  sectionId: string | null;
};

export function sectionLabel(s: TocSection): string {
  const parts = [s.label, s.title].filter(Boolean);
  if (parts.length === 0)
    return s.kind === "chapter" && s.number ? `Chapitre ${s.number}` : "Sans titre";
  return parts.join(" — ");
}

export function buildUnits(sections: TocSection[], total: number): Unit[] {
  const raw: Omit<Unit, "index">[] = [];

  const walk = (nodes: TocSection[], parents: string[]) => {
    for (const s of nodes) {
      if (s.seq_start == null || s.seq_end == null) {
        walk(s.children, [...parents, sectionLabel(s)]);
        continue;
      }
      const path = [...parents, sectionLabel(s)];
      const kids = s.children.filter((c) => c.seq_start != null && c.seq_end != null);
      if (kids.length === 0) {
        raw.push({ from: s.seq_start, to: s.seq_end, path, matter: s.matter, sectionId: s.id });
        continue;
      }
      const first = kids[0]?.seq_start ?? s.seq_start;
      if (first > s.seq_start) {
        raw.push({ from: s.seq_start, to: first - 1, path, matter: s.matter, sectionId: s.id });
      }
      walk(s.children, path);
      const last = kids[kids.length - 1]?.seq_end ?? s.seq_end;
      if (last < s.seq_end) {
        raw.push({ from: last + 1, to: s.seq_end, path, matter: s.matter, sectionId: s.id });
      }
    }
  };
  walk(sections, []);

  // Ordonne, retire les chevauchements et comble les trous
  raw.sort((a, b) => a.from - b.from);
  const units: Omit<Unit, "index">[] = [];
  let next = 0;
  for (const u of raw) {
    const from = Math.max(u.from, next);
    if (from > u.to) continue;
    if (from > next) {
      const prev = units[units.length - 1];
      units.push({
        from: next,
        to: from - 1,
        path: prev?.path ?? [],
        matter: prev?.matter ?? "front",
        sectionId: prev?.sectionId ?? null,
      });
    }
    units.push({ ...u, from });
    next = u.to + 1;
  }
  if (next < total) {
    const prev = units[units.length - 1];
    units.push({
      from: next,
      to: total - 1,
      path: prev?.path ?? [],
      matter: prev?.matter ?? "back",
      sectionId: prev?.sectionId ?? null,
    });
  }
  return units.map((u, index) => ({ ...u, index }));
}

export function unitOf(units: Unit[], seq: number): Unit | undefined {
  let lo = 0;
  let hi = units.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const u = units[mid];
    if (!u) break;
    if (seq < u.from) hi = mid - 1;
    else if (seq > u.to) lo = mid + 1;
    else return u;
  }
  return undefined;
}

/** Première unité du corps du texte (on saute la page de titre). */
export function firstBodyUnit(units: Unit[]): Unit | undefined {
  return units.find((u) => u.matter === "body") ?? units[0];
}
