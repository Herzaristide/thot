"use client";

import { List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { TocSection } from "@/lib/api/types";
import { sectionLabel } from "@/lib/reader/units";
import { cn } from "@/lib/utils";

const MATTER_LABEL = { front: "Début", body: "Texte", back: "Fin" } as const;

export function TocSheet({
  sections,
  currentSeq,
  onGo,
  open,
  onOpenChange,
}: {
  sections: TocSection[];
  currentSeq: number;
  onGo: (seq: number) => void;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const groups = (["front", "body", "back"] as const)
    .map((m) => ({ matter: m, items: sections.filter((s) => s.matter === m) }))
    .filter((g) => g.items.length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Table des matières">
          <List aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b">
          <SheetTitle className="font-serif">Table des matières</SheetTitle>
        </SheetHeader>
        <nav className="overflow-y-auto p-2" aria-label="Table des matières">
          {groups.map((g) => (
            <div key={g.matter} className="mb-3">
              {groups.length > 1 && (
                <div className="px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {MATTER_LABEL[g.matter]}
                </div>
              )}
              <TocList
                nodes={g.items}
                depth={0}
                currentSeq={currentSeq}
                onGo={(seq) => {
                  onGo(seq);
                  onOpenChange(false);
                }}
              />
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function TocList({
  nodes,
  depth,
  currentSeq,
  onGo,
}: {
  nodes: TocSection[];
  depth: number;
  currentSeq: number;
  onGo: (seq: number) => void;
}) {
  return (
    <ul>
      {nodes.map((s) => {
        const here =
          s.seq_start != null &&
          s.seq_end != null &&
          currentSeq >= s.seq_start &&
          currentSeq <= s.seq_end;
        const leafHere =
          here &&
          !s.children.some(
            (c) =>
              c.seq_start != null && currentSeq >= c.seq_start && currentSeq <= (c.seq_end ?? -1),
          );
        return (
          <li key={s.id}>
            <button
              type="button"
              disabled={s.seq_start == null}
              onClick={() => s.seq_start != null && onGo(s.seq_start)}
              aria-current={leafHere ? "location" : undefined}
              className={cn(
                "w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50",
                here && "font-medium",
                leafHere && "bg-accent text-primary",
              )}
              style={{ paddingLeft: `${0.75 + depth}rem` }}
            >
              {sectionLabel(s)}
            </button>
            {s.children.length > 0 && (
              <TocList nodes={s.children} depth={depth + 1} currentSeq={currentSeq} onGo={onGo} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
