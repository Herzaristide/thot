"use client";

import { useEffect, useState } from "react";
import type { Segment } from "@/lib/api/types";
import { segmentClass, segmentHtml } from "@/lib/reader/render";
import { cn } from "@/lib/utils";

/**
 * Texte d'une plage de segments : un <p> par segment, repéré par `data-seq`
 * (positions, navigation). Les appels de note sont des boutons `data-note`,
 * gérés par délégation dans la liseuse.
 */
export function Segments({
  segments,
  showPages,
  flashSeq,
  highlight,
}: {
  segments: Segment[];
  showPages: boolean;
  flashSeq?: number | null;
  highlight?: { seq: number; range: [number, number] } | null;
}) {
  return (
    <>
      {segments.map((s) => (
        <SegmentP
          key={s.seq}
          seg={s}
          showPages={showPages}
          flash={flashSeq === s.seq}
          highlight={highlight?.seq === s.seq ? highlight.range : null}
        />
      ))}
    </>
  );
}

function SegmentP({
  seg,
  showPages,
  flash,
  highlight,
}: {
  seg: Segment;
  showPages: boolean;
  flash: boolean;
  highlight: [number, number] | null;
}) {
  const html = segmentHtml(seg, { showPages, highlight });
  return (
    <p
      data-seq={seg.seq}
      className={cn(
        segmentClass(seg),
        flash && "rounded-sm bg-highlight/60 transition-colors duration-[2000ms]",
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Retire l'effet de surlignage après quelques secondes. */
export function useFlash(initial: number | null) {
  const [flash, setFlash] = useState<number | null>(initial);
  useEffect(() => {
    if (flash === null) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);
  return [flash, setFlash] as const;
}
