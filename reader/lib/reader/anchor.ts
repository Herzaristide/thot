import type { Segment } from "@/lib/api/types";

/**
 * Extrait de texte autour d'une position (TextQuoteSelector du W3C) : permet
 * de retrouver la position si le texte de l'édition est remplacé.
 */
export function makeQuote(text: string, offset: number) {
  const start = Math.max(0, Math.min(offset, text.length));
  let end = Math.min(text.length, start + 48);
  // Coupe sur une fin de mot si possible
  const space = text.lastIndexOf(" ", end);
  if (space > start + 30) end = space;
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - 24), start),
    suffix: text.slice(end, end + 24),
  };
}

/** Repli sans alignement : le segment situé au même pourcentage d'une édition. */
export function approxSeq(progress: number, totalSegments: number) {
  return Math.max(0, Math.min(totalSegments - 1, Math.floor(progress * totalSegments)));
}

/** Avancement (0..1) d'une position, en caractères. */
export function progressOf(seg: Pick<Segment, "char_start">, offset: number, charLength: number) {
  if (charLength <= 0) return 0;
  return Math.min(1, Math.max(0, (seg.char_start + offset) / charLength));
}
