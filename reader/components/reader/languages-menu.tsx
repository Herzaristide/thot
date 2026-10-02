"use client";

import { Check, Columns2, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { languageName } from "@/lib/format";
import type { ReaderEdition } from "./reader";

/** Changer de traduction sans perdre sa place, ou lire deux éditions côte à côte. */
export function LanguagesMenu({
  edition,
  parallelTarget,
  onSwitch,
  onParallel,
}: {
  edition: ReaderEdition;
  parallelTarget: string | null;
  onSwitch: (targetId: string) => void;
  onParallel: (targetId: string | null) => void;
}) {
  if (edition.siblings.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Langues et traductions">
          <Languages aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Lire dans une autre édition</DropdownMenuLabel>
        {edition.siblings.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => onSwitch(s.id)}>
            <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground uppercase">
              {s.language}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {languageName(s.language)}
                {s.isOriginal && " · original"}
              </span>
              {s.translators && (
                <span className="block truncate text-xs text-muted-foreground">
                  {s.translators}
                </span>
              )}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2">
          <Columns2 className="size-4" aria-hidden /> Lecture parallèle
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onParallel(null)}>
          <span className="flex size-4 items-center">
            {parallelTarget === null && <Check aria-hidden />}
          </span>
          Désactivée
        </DropdownMenuItem>
        {edition.siblings.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => onParallel(s.id)}>
            <span className="flex size-4 items-center">
              {parallelTarget === s.id && <Check aria-hidden />}
            </span>
            Avec {languageName(s.language)}
            {s.alignment === "doubtful" && (
              <span className="ml-auto text-xs text-muted-foreground">incertain</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
